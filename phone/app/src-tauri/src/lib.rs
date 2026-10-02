mod face;
mod strangers;
mod topia;

#[cfg(mobile)]
use face::apply_gallery;
use face::{
    EnrollmentReceipt, FaceAnalysis, FaceGallery, GalleryEnrollmentReceipt, NativeFaceAnalysis,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
#[cfg(mobile)]
use std::time::{Duration, Instant};
use std::time::{SystemTime, UNIX_EPOCH};
use strangers::{photo_path, StrangerStore, StrangerSummary};
use tauri::Manager;

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
#[allow(dead_code)]
enum Phase {
    Idle,
    P2pNegotiating,
    Ready,
    Capturing,
    Error,
}
#[derive(Clone, Debug, Serialize)]
struct SessionState {
    phase: Phase,
    session_id: Option<String>,
    glass_address: Option<String>,
    transport: String,
    completed_captures: u32,
    last_error: Option<String>,
    next_request_id: u64,
    detail: String,
    last_capture: Option<CaptureMetric>,
    face_processing: String,
    face_error: Option<String>,
    last_face: Option<FaceAnalysis>,
    face_request_id: Option<u64>,
    last_recording: Option<RecordingMetric>,
    recording_processing: String,
    person_hud_enabled: bool,
}
impl Default for SessionState {
    fn default() -> Self {
        Self {
            phase: Phase::Idle,
            session_id: None,
            glass_address: None,
            transport: "not connected".into(),
            completed_captures: 0,
            last_error: None,
            next_request_id: 1,
            detail: String::new(),
            last_capture: None,
            face_processing: "idle".into(),
            face_error: None,
            last_face: None,
            face_request_id: None,
            last_recording: None,
            recording_processing: "idle".into(),
            person_hud_enabled: true,
        }
    }
}
#[derive(Debug, Serialize)]
struct CaptureTicket {
    request_id: u64,
    mode: String,
    accepted: bool,
    note: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
struct GlassDevice {
    name: String,
    address: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
struct CaptureMetric {
    request_id: u64,
    mode: String,
    #[serde(default)]
    stream: bool,
    bytes: u64,
    width: u32,
    height: u32,
    #[serde(default)]
    rotation_degrees: i32,
    camera_open_ms: i64,
    warmup_ms: i64,
    capture_ms: i64,
    transfer_ms: i64,
    e2e_ms: i64,
    path: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct RecordingMetric {
    recording_id: u64,
    bytes: u64,
    sample_rate: u32,
    channels: u32,
    encoding: String,
    duration_ms: i64,
    transfer_ms: i64,
    path: String,
}

#[derive(Debug, Serialize)]
struct RecordingAudio {
    recording_id: u64,
    sample_rate: u32,
    channels: u32,
    encoding: String,
    duration_ms: i64,
    data_base64: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct LocalAsrResult {
    text: String,
    provider: String,
    model: String,
    side: String,
    latency_ms: f64,
    audio_ms: f64,
    prefill_ms: f64,
    decode_ms: f64,
    audio_duration_ms: f64,
    realtime_factor: f64,
    prompt_tokens: i32,
    generated_tokens: i32,
    status: i32,
    model_load_ms: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct CloudConfig {
    provider: String,
    base_url: String,
    model: String,
    stt_model: String,
    has_api_key: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct CloudModelResult {
    text: String,
    provider: String,
    model: String,
    side: String,
    latency_ms: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct MoodSpeechResult {
    transcript: String,
    confidence: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MoodAudioResult {
    path: String,
    sample_rate: u32,
    channels: u32,
    bytes: u64,
    duration_ms: i64,
}

#[cfg(mobile)]
#[derive(Clone, Debug, Deserialize, Default)]
struct NativeTransportState {
    phase: String,
    transport: String,
    detail: String,
    completed_captures: u32,
    last_error: Option<String>,
    last_capture: Option<CaptureMetric>,
    last_recording: Option<RecordingMetric>,
}

#[cfg(mobile)]
struct PersonHud<'a> {
    id: &'a str,
    name: &'a str,
    title: &'a str,
    affinity: i32,
    quest: &'a str,
    story: &'a str,
}

#[cfg(mobile)]
const STRANGER_HUD_ID: &str = "__stranger__";

#[cfg(mobile)]
fn person_hud(person_id: &str) -> PersonHud<'_> {
    match person_id {
        STRANGER_HUD_ID => PersonHud {
            id: person_id,
            name: "陌生人",
            title: "？？？",
            affinity: -1,
            quest: "？？？",
            story: "？？？",
        },
        "lin" => PersonHud {
            id: person_id,
            name: "林澄",
            title: "植物研究员 / 老朋友",
            affinity: 86,
            quest: "让阳台重新生长",
            story: "在大学旧温室认识。她记得每一株植物的名字，也记得你忘记吃晚饭的日子。",
        },
        "zhou" => PersonHud {
            id: person_id,
            name: "周野",
            title: "青苔书店主理人",
            affinity: 64,
            quest: "把书还给周野",
            story: "老街尽头的书店老板。认识之后，你的借阅时间总比别人长一些。",
        },
        "shen" => PersonHud {
            id: person_id,
            name: "沈弦",
            title: "独立音乐人",
            affinity: 41,
            quest: "整理城市声音采样",
            story: "她正在收集城市里被忽略的声音，偶尔会请你做第一个听众。",
        },
        "mom" => PersonHud {
            id: person_id,
            name: "妈妈",
            title: "家人",
            affinity: 92,
            quest: "整理母亲的旧相册",
            story: "她会把每一次通话的日期写在厨房日历上。",
        },
        _ => PersonHud {
            id: person_id,
            name: person_id,
            title: "已相认的人物",
            affinity: 50,
            quest: "暂无关联任务",
            story: "这段相遇已经被记录到你的 RealTopia。",
        },
    }
}

#[cfg(mobile)]
mod mobile_transport {
    use super::{GlassDevice, NativeTransportState, PersonHud};
    use serde::Serialize;
    use tauri::{
        plugin::{Builder, PluginHandle, TauriPlugin},
        Manager, Runtime,
    };

    pub struct RealiaTransport<R: Runtime>(PluginHandle<R>);

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct StartRequest<'a> {
        glass_address: &'a str,
    }
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct PairRequest<'a> {
        glass_address: &'a str,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct CaptureRequest<'a> {
        request_id: u64,
        mode: &'a str,
        width: u32,
        quality: u8,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct PerceptionRequest {
        enabled: bool,
        frames_per_second: u32,
        width: u32,
        quality: u8,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ShowPersonRequest<'a> {
        person_id: &'a str,
        name: &'a str,
        title: &'a str,
        affinity: i32,
        quest: &'a str,
        story: &'a str,
    }

    #[derive(serde::Deserialize)]
    struct CaptureResponse {
        accepted: bool,
        #[allow(dead_code)]
        state: NativeTransportState,
    }

    #[derive(serde::Deserialize)]
    struct PairedResponse {
        devices: Vec<GlassDevice>,
    }

    #[derive(serde::Deserialize)]
    struct AcceptedResponse {
        accepted: bool,
    }

    impl<R: Runtime> RealiaTransport<R> {
        pub fn paired(&self) -> Result<Vec<GlassDevice>, String> {
            let response: PairedResponse = self
                .0
                .run_mobile_plugin("paired", ())
                .map_err(|error| error.to_string())?;
            Ok(response.devices)
        }
        pub fn pair(&self, glass_address: &str) -> Result<(), String> {
            self.0
                .run_mobile_plugin("pair", PairRequest { glass_address })
                .map_err(|error| error.to_string())
        }

        pub fn open_bluetooth_settings(&self) -> Result<(), String> {
            self.0
                .run_mobile_plugin("openBluetoothSettings", ())
                .map_err(|error| error.to_string())
        }

        pub fn start(&self, address: &str) -> Result<NativeTransportState, String> {
            self.0
                .run_mobile_plugin(
                    "start",
                    StartRequest {
                        glass_address: address,
                    },
                )
                .map_err(|error| error.to_string())
        }

        pub fn state(&self) -> Result<NativeTransportState, String> {
            self.0
                .run_mobile_plugin("state", ())
                .map_err(|error| error.to_string())
        }

        pub fn capture(
            &self,
            request_id: u64,
            mode: &str,
            width: u32,
            quality: u8,
        ) -> Result<(), String> {
            let response: CaptureResponse = self
                .0
                .run_mobile_plugin(
                    "capture",
                    CaptureRequest {
                        request_id,
                        mode,
                        width,
                        quality,
                    },
                )
                .map_err(|error| error.to_string())?;
            if response.accepted {
                Ok(())
            } else {
                Err("transport rejected capture".into())
            }
        }

        pub fn perception(
            &self,
            enabled: bool,
            frames_per_second: u32,
            width: u32,
            quality: u8,
        ) -> Result<(), String> {
            let response: AcceptedResponse = self
                .0
                .run_mobile_plugin(
                    "perception",
                    PerceptionRequest {
                        enabled,
                        frames_per_second,
                        width,
                        quality,
                    },
                )
                .map_err(|error| error.to_string())?;
            if response.accepted {
                Ok(())
            } else {
                Err("transport rejected perception setting".into())
            }
        }

        pub fn show_person(&self, person: &PersonHud<'_>) -> Result<(), String> {
            let response: AcceptedResponse = self
                .0
                .run_mobile_plugin(
                    "showPerson",
                    ShowPersonRequest {
                        person_id: person.id,
                        name: person.name,
                        title: person.title,
                        affinity: person.affinity,
                        quest: person.quest,
                        story: person.story,
                    },
                )
                .map_err(|error| error.to_string())?;
            if response.accepted {
                Ok(())
            } else {
                Err("transport rejected person HUD event".into())
            }
        }
    }

    pub fn init<R: Runtime>() -> TauriPlugin<R> {
        Builder::new("realia-transport")
            .setup(|app, api| {
                let handle =
                    api.register_android_plugin("com.realtopia.phone", "RealiaTransportPlugin")?;
                app.manage(RealiaTransport(handle));
                Ok(())
            })
            .build()
    }
}

#[cfg(mobile)]
mod mobile_face {
    use super::NativeFaceAnalysis;
    use serde::Deserialize;
    use serde::Serialize;
    use tauri::{
        plugin::{Builder, PluginHandle, TauriPlugin},
        Manager, Runtime,
    };

    pub struct RealiaFace<R: Runtime>(PluginHandle<R>);

    const RUNTIME_MINIMUM_FACE_AT_640: f32 = 40.0;

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct AnalyzeRequest<'a> {
        path: &'a str,
        rotation_degrees: i32,
        minimum_face_at640: f32,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct SaveFaceCropRequest<'a> {
        path: &'a str,
        output_path: &'a str,
        rotation_degrees: i32,
        x1: f32,
        y1: f32,
        x2: f32,
        y2: f32,
    }

    #[derive(Deserialize)]
    struct SavedFaceCrop {
        #[allow(dead_code)]
        path: String,
        #[allow(dead_code)]
        width: u32,
        #[allow(dead_code)]
        height: u32,
    }

    #[derive(Clone, Debug, Deserialize)]
    pub struct NativeEnrollmentBatch {
        pub selected_count: usize,
        pub valid_count: usize,
        pub embeddings: Vec<Vec<f32>>,
        pub processing_total_ms: i64,
    }

    impl<R: Runtime> RealiaFace<R> {
        pub fn analyze(
            &self,
            path: &str,
            rotation_degrees: i32,
        ) -> Result<NativeFaceAnalysis, String> {
            self.0
                .run_mobile_plugin(
                    "analyze",
                    AnalyzeRequest {
                        path,
                        rotation_degrees,
                        minimum_face_at640: RUNTIME_MINIMUM_FACE_AT_640,
                    },
                )
                .map_err(|error| error.to_string())
        }

        pub fn pick_enrollment_photos(&self) -> Result<NativeEnrollmentBatch, String> {
            self.0
                .run_mobile_plugin("pickEnrollmentPhotos", ())
                .map_err(|error| error.to_string())
        }

        pub fn save_face_crop(
            &self,
            path: &str,
            output_path: &str,
            rotation_degrees: i32,
            bbox: [f32; 4],
        ) -> Result<(), String> {
            let _: SavedFaceCrop = self
                .0
                .run_mobile_plugin(
                    "saveFaceCrop",
                    SaveFaceCropRequest {
                        path,
                        output_path,
                        rotation_degrees,
                        x1: bbox[0],
                        y1: bbox[1],
                        x2: bbox[2],
                        y2: bbox[3],
                    },
                )
                .map_err(|error| error.to_string())?;
            Ok(())
        }
    }

    pub fn init<R: Runtime>() -> TauriPlugin<R> {
        Builder::new("realia-face")
            .setup(|app, api| {
                let handle =
                    api.register_android_plugin("com.realtopia.phone.face", "RealiaFacePlugin")?;
                app.manage(RealiaFace(handle));
                Ok(())
            })
            .build()
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct ModelDownloadStatus {
    model_id: String,
    repository_url: String,
    state: String,
    ready: bool,
    automatic: bool,
    downloaded_bytes: u64,
    total_bytes: u64,
    completed_files: u32,
    file_count: u32,
    install_path: String,
    last_error: Option<String>,
}

#[cfg(mobile)]
mod mobile_models {
    use super::ModelDownloadStatus;
    use serde::Serialize;
    use tauri::{
        plugin::{Builder, PluginHandle, TauriPlugin},
        Manager, Runtime,
    };

    pub struct RealiaModels<R: Runtime>(PluginHandle<R>);

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct OpenRepositoryRequest<'a> {
        model_id: &'a str,
    }

    #[derive(serde::Deserialize)]
    struct AcceptedResponse {
        accepted: bool,
    }

    impl<R: Runtime> RealiaModels<R> {
        pub fn status(&self) -> Result<ModelDownloadStatus, String> {
            self.0
                .run_mobile_plugin("status", ())
                .map_err(|error| error.to_string())
        }

        pub fn start_asr_download(&self) -> Result<(), String> {
            let response: AcceptedResponse = self
                .0
                .run_mobile_plugin("startAsrDownload", ())
                .map_err(|error| error.to_string())?;
            if response.accepted {
                Ok(())
            } else {
                Err("model downloader rejected the request".into())
            }
        }

        pub fn open_repository(&self, model_id: &str) -> Result<(), String> {
            let response: AcceptedResponse = self
                .0
                .run_mobile_plugin("openRepository", OpenRepositoryRequest { model_id })
                .map_err(|error| error.to_string())?;
            if response.accepted {
                Ok(())
            } else {
                Err("repository opener rejected the request".into())
            }
        }
    }

    pub fn init<R: Runtime>() -> TauriPlugin<R> {
        Builder::new("realia-models")
            .setup(|app, api| {
                let handle = api.register_android_plugin(
                    "com.realtopia.phone.models",
                    "RealiaModelManagerPlugin",
                )?;
                app.manage(RealiaModels(handle));
                Ok(())
            })
            .build()
    }
}

#[cfg(mobile)]
mod mobile_asr {
    use super::LocalAsrResult;
    use serde::Serialize;
    use tauri::{
        plugin::{Builder, PluginHandle, TauriPlugin},
        Manager, Runtime,
    };

    pub struct RealiaAsr<R: Runtime>(PluginHandle<R>);

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct TranscribeRequest<'a> {
        pcm_path: &'a str,
        sample_rate: u32,
        channels: u32,
        max_new_tokens: u32,
    }

    impl<R: Runtime> RealiaAsr<R> {
        pub fn transcribe(
            &self,
            pcm_path: &str,
            sample_rate: u32,
            channels: u32,
        ) -> Result<LocalAsrResult, String> {
            self.0
                .run_mobile_plugin(
                    "transcribe",
                    TranscribeRequest {
                        pcm_path,
                        sample_rate,
                        channels,
                        max_new_tokens: 256,
                    },
                )
                .map_err(|error| error.to_string())
        }
    }

    pub fn init<R: Runtime>() -> TauriPlugin<R> {
        Builder::new("realia-asr")
            .setup(|app, api| {
                let handle =
                    api.register_android_plugin("com.realtopia.phone.asr", "RealiaAsrPlugin")?;
                app.manage(RealiaAsr(handle));
                Ok(())
            })
            .build()
    }
}

#[cfg(mobile)]
mod mobile_cloud {
    use super::{CloudConfig, CloudModelResult};
    use serde::Serialize;
    use tauri::{
        plugin::{Builder, PluginHandle, TauriPlugin},
        Manager, Runtime,
    };

    pub struct RealiaCloud<R: Runtime>(PluginHandle<R>);

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct SaveConfigRequest<'a> {
        pub provider: &'a str,
        pub base_url: &'a str,
        pub model: &'a str,
        pub stt_model: &'a str,
        pub api_key: Option<&'a str>,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct CompleteRequest<'a> {
        pub prompt: &'a str,
        pub system: Option<&'a str>,
        pub json: bool,
    }

    impl<R: Runtime> RealiaCloud<R> {
        pub fn config(&self) -> Result<CloudConfig, String> {
            self.0
                .run_mobile_plugin("config", ())
                .map_err(|error| error.to_string())
        }

        pub fn save_config(&self, request: SaveConfigRequest<'_>) -> Result<CloudConfig, String> {
            self.0
                .run_mobile_plugin("saveConfig", request)
                .map_err(|error| error.to_string())
        }

        pub fn clear_api_key(&self) -> Result<CloudConfig, String> {
            self.0
                .run_mobile_plugin("clearApiKey", ())
                .map_err(|error| error.to_string())
        }

        pub fn complete(&self, request: CompleteRequest<'_>) -> Result<CloudModelResult, String> {
            self.0
                .run_mobile_plugin("complete", request)
                .map_err(|error| error.to_string())
        }
    }

    pub fn init<R: Runtime>() -> TauriPlugin<R> {
        Builder::new("realia-cloud")
            .setup(|app, api| {
                let handle =
                    api.register_android_plugin("com.realtopia.phone.cloud", "RealiaCloudPlugin")?;
                app.manage(RealiaCloud(handle));
                Ok(())
            })
            .build()
    }
}

#[cfg(mobile)]
mod mobile_mood {
    use super::MoodAudioResult;
    use tauri::{
        plugin::{Builder, PluginHandle, TauriPlugin},
        Manager, Runtime,
    };

    pub struct RealiaMood<R: Runtime>(PluginHandle<R>);

    impl<R: Runtime> RealiaMood<R> {
        pub fn listen(&self) -> Result<MoodAudioResult, String> {
            self.0
                .run_mobile_plugin("listen", ())
                .map_err(|error| error.to_string())
        }

        pub fn finish(&self) -> Result<(), String> {
            self.0
                .run_mobile_plugin("finish", ())
                .map_err(|error| error.to_string())
        }

        pub fn cancel(&self) -> Result<(), String> {
            self.0
                .run_mobile_plugin("cancel", ())
                .map_err(|error| error.to_string())
        }
    }

    pub fn init<R: Runtime>() -> TauriPlugin<R> {
        Builder::new("realia-mood")
            .setup(|app, api| {
                let handle =
                    api.register_android_plugin("com.realtopia.phone.mood", "RealiaMoodPlugin")?;
                app.manage(RealiaMood(handle));
                Ok(())
            })
            .build()
    }
}

#[tauri::command]
fn model_download_status(app: tauri::AppHandle) -> Result<ModelDownloadStatus, String> {
    #[cfg(mobile)]
    {
        return app
            .state::<mobile_models::RealiaModels<tauri::Wry>>()
            .status();
    }
    #[cfg(not(mobile))]
    {
        let _ = app;
        Ok(ModelDownloadStatus {
            model_id: "huangzhengxiang/Qwen3-ASR-0.6B-INT8-MNN".into(),
            repository_url: "https://modelscope.cn/models/huangzhengxiang/Qwen3-ASR-0.6B-INT8-MNN/"
                .into(),
            state: "mobile_only".into(),
            ready: false,
            automatic: true,
            downloaded_bytes: 0,
            total_bytes: 0,
            completed_files: 0,
            file_count: 0,
            install_path: String::new(),
            last_error: None,
        })
    }
}

#[tauri::command]
fn start_asr_download(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(mobile)]
    {
        return app
            .state::<mobile_models::RealiaModels<tauri::Wry>>()
            .start_asr_download();
    }
    #[cfg(not(mobile))]
    {
        let _ = app;
        Err("本地模型下载仅支持 Android 应用".into())
    }
}

#[tauri::command]
fn open_model_repository(app: tauri::AppHandle, model_id: String) -> Result<(), String> {
    #[cfg(mobile)]
    {
        return app
            .state::<mobile_models::RealiaModels<tauri::Wry>>()
            .open_repository(&model_id);
    }
    #[cfg(not(mobile))]
    {
        let _ = (app, model_id);
        Err("模型页面请在 Android 应用中打开".into())
    }
}

#[derive(Clone, Debug)]
pub struct CapturedImage {
    pub request_id: u64,
    pub path: String,
    pub rotation_degrees: i32,
}
#[derive(Clone, Debug)]
pub struct ProcessingReceipt {
    pub accepted: bool,
    pub provider: &'static str,
    pub analysis: Option<NativeFaceAnalysis>,
}
pub trait ProcessingGateway: Send + Sync {
    fn submit(&self, image: CapturedImage) -> Result<ProcessingReceipt, String>;
}
pub struct NoopProcessingGateway;
impl ProcessingGateway for NoopProcessingGateway {
    fn submit(&self, image: CapturedImage) -> Result<ProcessingReceipt, String> {
        let _ = (image.request_id, image.path, image.rotation_degrees);
        Ok(ProcessingReceipt {
            accepted: false,
            provider: "noop",
            analysis: None,
        })
    }
}

#[cfg(mobile)]
struct MnnFaceProcessingGateway {
    app: tauri::AppHandle,
}

#[cfg(mobile)]
impl ProcessingGateway for MnnFaceProcessingGateway {
    fn submit(&self, image: CapturedImage) -> Result<ProcessingReceipt, String> {
        let analysis = self
            .app
            .state::<mobile_face::RealiaFace<tauri::Wry>>()
            .analyze(&image.path, image.rotation_degrees)?;
        Ok(ProcessingReceipt {
            accepted: true,
            provider: "mnn",
            analysis: Some(analysis),
        })
    }
}

struct AppState {
    session: Mutex<SessionState>,
    gallery: Mutex<FaceGallery>,
    strangers: Mutex<StrangerStore>,
    last_native_face: Mutex<Option<(u64, NativeFaceAnalysis)>>,
    gallery_path: PathBuf,
    stranger_path: PathBuf,
    stranger_photo_root: PathBuf,
    #[cfg(mobile)]
    hud_stability: Mutex<HudStability>,
}

fn unix_time_ms() -> Result<i64, String> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("system clock error: {error}"))?
        .as_millis() as i64)
}

#[cfg(mobile)]
fn retain_unknown_faces(
    app: &tauri::AppHandle,
    state: &AppState,
    capture: &CaptureMetric,
    native: &NativeFaceAnalysis,
    analysis: &FaceAnalysis,
) -> Result<(), String> {
    for (face_index, (native_face, matched_face)) in
        native.faces.iter().zip(&analysis.matches).enumerate()
    {
        if !matches!(matched_face.decision.as_str(), "unknown" | "ambiguous")
            || !native_face.eligible
            || native_face.embedding.len() != 512
        {
            continue;
        }
        let now_ms = unix_time_ms()?;
        let (stranger_id, should_retain) = {
            let store = state
                .strangers
                .lock()
                .map_err(|_| "stranger store lock poisoned")?;
            let id = store.match_or_create_id(&native_face.embedding, capture.request_id, now_ms);
            let retain = store.should_retain_photo(&id, now_ms);
            (id, retain)
        };
        if !should_retain {
            if let Ok(mut store) = state.strangers.lock() {
                store.touch(&stranger_id, now_ms);
            }
            continue;
        }
        let output = photo_path(
            &state.stranger_photo_root,
            &stranger_id,
            capture.request_id,
            face_index,
        );
        let output_value = output.to_string_lossy().into_owned();
        app.state::<mobile_face::RealiaFace<tauri::Wry>>()
            .save_face_crop(
                &capture.path,
                &output_value,
                capture.rotation_degrees,
                native_face.bbox,
            )?;
        let evicted = {
            let mut store = state
                .strangers
                .lock()
                .map_err(|_| "stranger store lock poisoned")?;
            let evicted = store.commit_photo(
                stranger_id,
                &native_face.embedding,
                output_value,
                capture.request_id,
                now_ms,
            );
            store.save(&state.stranger_path)?;
            evicted
        };
        for path in evicted {
            let _ = std::fs::remove_file(path);
        }
    }
    Ok(())
}

#[cfg(mobile)]
#[derive(Default)]
struct HudStability {
    candidate: Option<String>,
    consecutive: u8,
    last_sent: Option<String>,
    consecutive_misses: u8,
}

#[cfg(mobile)]
fn stable_hud_person(
    state: &AppState,
    recognized: Option<String>,
    stream: bool,
) -> Result<Option<String>, String> {
    if !stream {
        return Ok(recognized);
    }
    let mut stability = state
        .hud_stability
        .lock()
        .map_err(|_| "HUD stability lock poisoned")?;
    let Some(person_id) = recognized else {
        stability.candidate = None;
        stability.consecutive = 0;
        stability.consecutive_misses = stability.consecutive_misses.saturating_add(1);
        if stability.consecutive_misses >= 2 {
            // End the current encounter after two processed frames without a
            // recognizable face. The same person may then trigger the HUD again.
            stability.last_sent = None;
        }
        return Ok(None);
    };
    stability.consecutive_misses = 0;
    if stability.candidate.as_deref() == Some(person_id.as_str()) {
        stability.consecutive = stability.consecutive.saturating_add(1);
    } else {
        stability.candidate = Some(person_id.clone());
        stability.consecutive = 1;
    }
    if stability.consecutive < 2 {
        return Ok(None);
    }
    if stability.last_sent.as_deref() == Some(person_id.as_str()) {
        return Ok(None);
    }
    stability.last_sent = Some(person_id.clone());
    Ok(Some(person_id))
}
#[cfg(mobile)]
fn merge_native(value: &mut SessionState, native: NativeTransportState) {
    value.phase = match native.phase.as_str() {
        "idle" => Phase::Idle,
        "ready" => Phase::Ready,
        "capturing" => Phase::Capturing,
        "error" => Phase::Error,
        _ => Phase::P2pNegotiating,
    };
    value.transport = native.transport;
    value.detail = native.detail;
    value.completed_captures = native.completed_captures;
    value.last_error = native.last_error;
    value.last_capture = native.last_capture;
    if native.last_recording.as_ref().map(|item| item.recording_id)
        != value.last_recording.as_ref().map(|item| item.recording_id)
        && native.last_recording.is_some()
    {
        value.recording_processing = "received".into();
    }
    value.last_recording = native.last_recording;
}

fn base64_encode(data: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let value = (u32::from(chunk[0]) << 16)
            | (u32::from(*chunk.get(1).unwrap_or(&0)) << 8)
            | u32::from(*chunk.get(2).unwrap_or(&0));
        output.push(TABLE[((value >> 18) & 63) as usize] as char);
        output.push(TABLE[((value >> 12) & 63) as usize] as char);
        output.push(if chunk.len() > 1 {
            TABLE[((value >> 6) & 63) as usize] as char
        } else {
            '='
        });
        output.push(if chunk.len() > 2 {
            TABLE[(value & 63) as usize] as char
        } else {
            '='
        });
    }
    output
}

#[tauri::command]
fn recording_audio(
    recording_id: u64,
    state: tauri::State<'_, AppState>,
) -> Result<RecordingAudio, String> {
    const MAX_TRANSCRIPTION_BYTES: u64 = 8 * 1024 * 1024;
    let recording = state
        .session
        .lock()
        .map_err(|_| "state lock poisoned")?
        .last_recording
        .clone()
        .filter(|item| item.recording_id == recording_id)
        .ok_or_else(|| "recording is no longer available".to_string())?;
    if recording.encoding != "pcm_s16le" || recording.channels != 1 || recording.sample_rate == 0 {
        return Err("unsupported recording format".into());
    }
    if recording.bytes == 0 || recording.bytes > MAX_TRANSCRIPTION_BYTES {
        return Err("recording is empty or exceeds the 8 MiB transcription limit".into());
    }
    let data = std::fs::read(&recording.path).map_err(|error| error.to_string())?;
    if data.len() as u64 != recording.bytes {
        return Err("recording size changed after receipt".into());
    }
    Ok(RecordingAudio {
        recording_id,
        sample_rate: recording.sample_rate,
        channels: recording.channels,
        encoding: recording.encoding,
        duration_ms: recording.duration_ms,
        data_base64: base64_encode(&data),
    })
}

#[tauri::command]
fn transcribe_recording(
    recording_id: u64,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<LocalAsrResult, String> {
    const MAX_TRANSCRIPTION_BYTES: u64 = 8 * 1024 * 1024;
    let recording = state
        .session
        .lock()
        .map_err(|_| "state lock poisoned")?
        .last_recording
        .clone()
        .filter(|item| item.recording_id == recording_id)
        .ok_or_else(|| "recording is no longer available".to_string())?;
    if recording.encoding != "pcm_s16le" || recording.channels != 1 || recording.sample_rate == 0 {
        return Err("unsupported recording format".into());
    }
    if recording.bytes == 0 || recording.bytes > MAX_TRANSCRIPTION_BYTES {
        return Err("recording is empty or exceeds the 8 MiB transcription limit".into());
    }
    let metadata = std::fs::metadata(&recording.path).map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.len() != recording.bytes {
        return Err("recording size changed after receipt".into());
    }
    #[cfg(mobile)]
    {
        return app.state::<mobile_asr::RealiaAsr<tauri::Wry>>().transcribe(
            &recording.path,
            recording.sample_rate,
            recording.channels,
        );
    }
    #[cfg(not(mobile))]
    {
        let _ = app;
        Err("本地 ASR 仅支持 Android 应用".into())
    }
}

#[tauri::command]
fn cloud_config(app: tauri::AppHandle) -> Result<CloudConfig, String> {
    #[cfg(mobile)]
    {
        return app
            .state::<mobile_cloud::RealiaCloud<tauri::Wry>>()
            .config();
    }
    #[cfg(not(mobile))]
    {
        let _ = app;
        Ok(CloudConfig {
            provider: "阿里云百炼 · OpenAI Compatible".into(),
            base_url:
                "https://llm-91vwfbm1df53hn0g.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
                    .into(),
            model: "qwen-plus".into(),
            stt_model: "qwen3-asr-flash".into(),
            has_api_key: false,
        })
    }
}

#[tauri::command]
fn save_cloud_config(
    provider: String,
    base_url: String,
    model: String,
    stt_model: String,
    api_key: Option<String>,
    app: tauri::AppHandle,
) -> Result<CloudConfig, String> {
    #[cfg(mobile)]
    {
        return app
            .state::<mobile_cloud::RealiaCloud<tauri::Wry>>()
            .save_config(mobile_cloud::SaveConfigRequest {
                provider: &provider,
                base_url: &base_url,
                model: &model,
                stt_model: &stt_model,
                api_key: api_key.as_deref().filter(|value| !value.trim().is_empty()),
            });
    }
    #[cfg(not(mobile))]
    {
        let _ = (provider, base_url, model, stt_model, api_key, app);
        Err("安全云端配置仅支持 Android 应用".into())
    }
}

#[tauri::command]
fn clear_cloud_api_key(app: tauri::AppHandle) -> Result<CloudConfig, String> {
    #[cfg(mobile)]
    {
        return app
            .state::<mobile_cloud::RealiaCloud<tauri::Wry>>()
            .clear_api_key();
    }
    #[cfg(not(mobile))]
    {
        let _ = app;
        Err("安全云端配置仅支持 Android 应用".into())
    }
}

#[tauri::command]
fn cloud_complete(
    prompt: String,
    system: Option<String>,
    json: bool,
    app: tauri::AppHandle,
) -> Result<CloudModelResult, String> {
    #[cfg(mobile)]
    {
        return app
            .state::<mobile_cloud::RealiaCloud<tauri::Wry>>()
            .complete(mobile_cloud::CompleteRequest {
                prompt: &prompt,
                system: system.as_deref(),
                json,
            });
    }
    #[cfg(not(mobile))]
    {
        let _ = (prompt, system, json, app);
        Err("安全云端调用仅支持 Android 应用".into())
    }
}

#[tauri::command]
async fn listen_mood(app: tauri::AppHandle) -> Result<MoodSpeechResult, String> {
    #[cfg(mobile)]
    {
        // The Android listen command intentionally remains pending for the entire
        // recording. Run that blocking plugin call away from Tauri's command
        // dispatcher so finish/cancel invocations and WebView input remain live.
        return tauri::async_runtime::spawn_blocking(move || {
            let audio = app
                .state::<mobile_mood::RealiaMood<tauri::Wry>>()
                .listen()?;
            if audio.sample_rate != 16_000
                || audio.channels != 1
                || audio.bytes == 0
                || audio.bytes > 2 * 1024 * 1024
            {
                let _ = std::fs::remove_file(&audio.path);
                return Err("心情录音格式无效或超过 30 秒".into());
            }
            let transcription = app.state::<mobile_asr::RealiaAsr<tauri::Wry>>().transcribe(
                &audio.path,
                audio.sample_rate,
                audio.channels,
            );
            let _ = std::fs::remove_file(&audio.path);
            transcription.map(|result| MoodSpeechResult {
                transcript: result.text,
                confidence: -1.0,
            })
        })
        .await
        .map_err(|error| format!("心情语音后台任务失败: {error}"))?;
    }
    #[cfg(not(mobile))]
    {
        let _ = app;
        Err("心情语音仅支持 Android 应用".into())
    }
}

#[tauri::command]
fn finish_mood_listen(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(mobile)]
    {
        return app.state::<mobile_mood::RealiaMood<tauri::Wry>>().finish();
    }
    #[cfg(not(mobile))]
    {
        let _ = app;
        Ok(())
    }
}

#[tauri::command]
fn cancel_mood_listen(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(mobile)]
    {
        return app.state::<mobile_mood::RealiaMood<tauri::Wry>>().cancel();
    }
    #[cfg(not(mobile))]
    {
        let _ = app;
        Ok(())
    }
}

#[tauri::command]
fn mark_recording_processed(
    recording_id: u64,
    status: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let clean = status.trim();
    if clean.is_empty() || clean.len() > 120 {
        return Err("invalid recording processing status".into());
    }
    let mut session = state.session.lock().map_err(|_| "state lock poisoned")?;
    if session
        .last_recording
        .as_ref()
        .map(|item| item.recording_id)
        != Some(recording_id)
    {
        return Err("recording is no longer current".into());
    }
    session.recording_processing = clean.into();
    Ok(())
}

#[tauri::command]
fn paired_glasses(app: tauri::AppHandle) -> Result<Vec<GlassDevice>, String> {
    #[cfg(mobile)]
    return app
        .state::<mobile_transport::RealiaTransport<tauri::Wry>>()
        .paired();
    #[cfg(not(mobile))]
    {
        let _ = app;
        Ok(vec![GlassDevice {
            name: "RealTopia Glass (预览)".into(),
            address: "02:00:00:00:00:00".into(),
        }])
    }
}

#[tauri::command]
fn pair_glasses(app: tauri::AppHandle, glass_address: String) -> Result<(), String> {
    if !valid_bluetooth_address(&glass_address) {
        return Err("请输入 AA:BB:CC:DD:EE:FF 格式的蓝牙地址".into());
    }
    #[cfg(mobile)]
    return app
        .state::<mobile_transport::RealiaTransport<tauri::Wry>>()
        .pair(&glass_address);
    #[cfg(not(mobile))]
    {
        let _ = (app, glass_address);
        Err("眼镜配对仅支持 Android 应用".into())
    }
}

#[tauri::command]
fn open_bluetooth_settings(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(mobile)]
    return app
        .state::<mobile_transport::RealiaTransport<tauri::Wry>>()
        .open_bluetooth_settings();
    #[cfg(not(mobile))]
    {
        let _ = app;
        Ok(())
    }
}

#[tauri::command]
fn set_perception(
    app: tauri::AppHandle,
    enabled: bool,
    frames_per_second: u32,
    width: u32,
    quality: u8,
) -> Result<(), String> {
    if !(2..=5).contains(&frames_per_second) {
        return Err("perception frame rate must be between 2 and 5 FPS".into());
    }
    if !(1280..=4032).contains(&width) || !(50..=100).contains(&quality) {
        return Err("capture width must be 1280..4032 and quality 50..100".into());
    }
    #[cfg(mobile)]
    return app
        .state::<mobile_transport::RealiaTransport<tauri::Wry>>()
        .perception(enabled, frames_per_second, width, quality);
    #[cfg(not(mobile))]
    {
        let _ = (app, enabled, frames_per_second, width, quality);
        Ok(())
    }
}

#[tauri::command]
fn set_person_alert(enabled: bool, state: tauri::State<'_, AppState>) -> Result<(), String> {
    state
        .session
        .lock()
        .map_err(|_| "state lock poisoned")?
        .person_hud_enabled = enabled;
    Ok(())
}

#[tauri::command]
fn session_state(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<SessionState, String> {
    #[cfg(mobile)]
    let mut discovered_capture: Option<u64> = None;
    #[allow(unused_mut)]
    let mut value = state.session.lock().map_err(|_| "state lock poisoned")?;
    #[cfg(mobile)]
    if value.session_id.is_some() {
        if let Ok(native) = app
            .state::<mobile_transport::RealiaTransport<tauri::Wry>>()
            .state()
        {
            let capture_id = native
                .last_capture
                .as_ref()
                .map(|capture| capture.request_id);
            merge_native(&mut value, native);
            if let Some(request_id) = capture_id {
                if value.face_request_id != Some(request_id) {
                    value.face_request_id = Some(request_id);
                    value.face_processing = "waiting_for_capture".into();
                    value.face_error = None;
                    discovered_capture = Some(request_id);
                }
            }
        }
    }
    #[cfg(not(mobile))]
    let _ = app;
    let snapshot = value.clone();
    drop(value);
    #[cfg(mobile)]
    if let Some(request_id) = discovered_capture {
        start_face_processing(app.clone(), request_id);
    }
    Ok(snapshot)
}
#[tauri::command]
fn begin_session(
    app: tauri::AppHandle,
    glass_address: String,
    state: tauri::State<'_, AppState>,
) -> Result<SessionState, String> {
    if !valid_bluetooth_address(&glass_address) {
        return Err("请输入 AA:BB:CC:DD:EE:FF 格式的蓝牙地址".into());
    }
    let normalized_address = glass_address.to_uppercase();
    let mut value = state.session.lock().map_err(|_| "state lock poisoned")?;
    if value.glass_address.as_deref() == Some(normalized_address.as_str())
        && value.session_id.is_some()
        && matches!(value.phase, Phase::P2pNegotiating | Phase::Ready)
    {
        return Ok(value.clone());
    }
    let id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    *value = SessionState {
        phase: Phase::P2pNegotiating,
        session_id: Some(format!("session-{id}")),
        glass_address: Some(normalized_address),
        transport: "CXR negotiation pending".into(),
        completed_captures: 0,
        last_error: None,
        next_request_id: 1,
        detail: "starting Android native transport".into(),
        last_capture: None,
        face_processing: "idle".into(),
        face_error: None,
        last_face: None,
        face_request_id: None,
        last_recording: None,
        recording_processing: "idle".into(),
        person_hud_enabled: true,
    };
    #[cfg(mobile)]
    {
        let native = app
            .state::<mobile_transport::RealiaTransport<tauri::Wry>>()
            .start(&glass_address)?;
        merge_native(&mut value, native);
    }
    #[cfg(not(mobile))]
    let _ = app;
    Ok(value.clone())
}
#[tauri::command]
fn request_capture(
    app: tauri::AppHandle,
    mode: String,
    width: Option<u32>,
    quality: Option<u8>,
    state: tauri::State<'_, AppState>,
) -> Result<CaptureTicket, String> {
    if mode != "cold" && mode != "hot" {
        return Err("capture mode must be cold or hot".into());
    }
    let width = width.unwrap_or(4032);
    let quality = quality.unwrap_or(90);
    if !(1280..=4032).contains(&width) || !(50..=100).contains(&quality) {
        return Err("capture width must be 1280..4032 and quality 50..100".into());
    }
    let mut value = state.session.lock().map_err(|_| "state lock poisoned")?;
    if value.session_id.is_none() {
        return Err("请先开始会话".into());
    }
    let request_id = value.next_request_id;
    #[cfg(mobile)]
    app.state::<mobile_transport::RealiaTransport<tauri::Wry>>()
        .capture(request_id, &mode, width, quality)?;
    #[cfg(not(mobile))]
    let _ = app;
    value.next_request_id += 1;
    value.phase = Phase::Capturing;
    value.face_processing = "waiting_for_capture".into();
    value.face_error = None;
    value.face_request_id = Some(request_id);
    drop(value);
    #[cfg(mobile)]
    start_face_processing(app.clone(), request_id);
    Ok(CaptureTicket {
        request_id,
        mode,
        accepted: true,
        note: "queued for Android native transport".into(),
    })
}

#[cfg(mobile)]
fn start_face_processing(app: tauri::AppHandle, request_id: u64) {
    std::thread::spawn(move || {
        if let Err(error) = wait_for_capture_and_process(&app, request_id) {
            if let Ok(mut session) = app.state::<AppState>().session.lock() {
                session.face_processing = "error".into();
                session.face_error = Some(error);
            }
        }
    });
}

#[cfg(mobile)]
fn wait_for_capture_and_process(app: &tauri::AppHandle, request_id: u64) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(20);
    let capture = loop {
        let native = app
            .state::<mobile_transport::RealiaTransport<tauri::Wry>>()
            .state()?;
        if let Some(capture) = native.last_capture {
            if capture.request_id == request_id {
                break capture;
            }
        }
        if Instant::now() >= deadline {
            return Err(format!("timed out waiting for capture #{request_id}"));
        }
        std::thread::sleep(Duration::from_millis(40));
    };

    {
        let state = app.state::<AppState>();
        let mut session = state.session.lock().map_err(|_| "state lock poisoned")?;
        session.face_processing = "running".into();
    }
    let gateway = MnnFaceProcessingGateway { app: app.clone() };
    let receipt = gateway.submit(CapturedImage {
        request_id,
        path: capture.path.clone(),
        rotation_degrees: capture.rotation_degrees,
    });
    let receipt = match receipt {
        Ok(value) => value,
        Err(error) => {
            if capture.stream {
                let _ = std::fs::remove_file(&capture.path);
            }
            return Err(error);
        }
    };
    if !receipt.accepted || receipt.provider != "mnn" {
        if capture.stream {
            let _ = std::fs::remove_file(&capture.path);
        }
        return Err("MNN processing gateway rejected the capture".into());
    }
    let native = match receipt.analysis {
        Some(value) => value,
        None => {
            if capture.stream {
                let _ = std::fs::remove_file(&capture.path);
            }
            return Err("MNN processing gateway returned no analysis".into());
        }
    };
    let state = app.state::<AppState>();
    let analysis = {
        let gallery = state.gallery.lock().map_err(|_| "gallery lock poisoned")?;
        apply_gallery(request_id, &native, &gallery)?
    };
    let stranger_result = retain_unknown_faces(&app, &state, &capture, &native, &analysis);
    if capture.stream {
        let _ = std::fs::remove_file(&capture.path);
    }
    stranger_result?;
    let recognized_person = analysis
        .matches
        .iter()
        .find(|face| face.decision == "known")
        .and_then(|face| face.person_id.clone())
        .or_else(|| {
            analysis
                .matches
                .iter()
                .any(|face| matches!(face.decision.as_str(), "unknown" | "ambiguous"))
                .then(|| STRANGER_HUD_ID.to_string())
        });
    *state
        .last_native_face
        .lock()
        .map_err(|_| "face result lock poisoned")? = Some((request_id, native));
    let mut session = state.session.lock().map_err(|_| "state lock poisoned")?;
    session.face_processing = "ready".into();
    session.face_error = None;
    session.last_face = Some(analysis);
    let show_person_hud = session.person_hud_enabled;
    drop(session);
    if show_person_hud {
        if let Some(person_id) = stable_hud_person(&state, recognized_person, capture.stream)? {
            let person = person_hud(&person_id);
            if let Err(error) = app
                .state::<mobile_transport::RealiaTransport<tauri::Wry>>()
                .show_person(&person)
            {
                if let Ok(mut session) = state.session.lock() {
                    session.face_error = Some(format!("person HUD delivery failed: {error}"));
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn gallery_list(
    state: tauri::State<'_, AppState>,
) -> Result<std::collections::BTreeMap<String, usize>, String> {
    let gallery = state.gallery.lock().map_err(|_| "gallery lock poisoned")?;
    Ok(gallery.summary())
}

#[tauri::command]
fn recent_strangers(state: tauri::State<'_, AppState>) -> Result<Vec<StrangerSummary>, String> {
    let store = state
        .strangers
        .lock()
        .map_err(|_| "stranger store lock poisoned")?;
    Ok(store.summaries())
}

#[tauri::command]
fn label_stranger(
    stranger_id: String,
    identity: String,
    relationship: String,
    state: tauri::State<'_, AppState>,
) -> Result<StrangerSummary, String> {
    let now_ms = unix_time_ms()?;
    let mut store = state
        .strangers
        .lock()
        .map_err(|_| "stranger store lock poisoned")?;
    let mut staged_store = store.clone();
    let label = staged_store.label(&stranger_id, &identity, &relationship, now_ms)?;
    if label.newly_labeled {
        if label.embeddings.is_empty() {
            return Err("这个陌生人还没有可用的人脸特征".into());
        }
        let mut gallery = state.gallery.lock().map_err(|_| "gallery lock poisoned")?;
        let mut staged_gallery = gallery.clone();
        let batch_id = now_ms as u64;
        for (index, embedding) in label.embeddings.iter().enumerate() {
            staged_gallery.enroll(
                identity.trim(),
                batch_id.saturating_add(index as u64),
                embedding,
            )?;
        }
        staged_gallery.save(&state.gallery_path)?;
        *gallery = staged_gallery;
    }
    staged_store.save(&state.stranger_path)?;
    *store = staged_store;
    Ok(label.summary)
}

#[tauri::command]
fn enroll_last_face(
    person_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<EnrollmentReceipt, String> {
    let (request_id, embedding) = {
        let result = state
            .last_native_face
            .lock()
            .map_err(|_| "face result lock poisoned")?;
        let (request_id, native) = result
            .as_ref()
            .ok_or_else(|| "no processed capture is available".to_string())?;
        let embeddings = native
            .faces
            .iter()
            .filter(|face| face.eligible && face.embedding.len() == 512)
            .map(|face| face.embedding.clone())
            .collect::<Vec<_>>();
        if embeddings.len() != 1 {
            return Err(format!(
                "enrollment requires exactly one eligible face, found {}",
                embeddings.len()
            ));
        }
        (*request_id, embeddings[0].clone())
    };
    let mut gallery = state.gallery.lock().map_err(|_| "gallery lock poisoned")?;
    let receipt = gallery.enroll(&person_id, request_id, &embedding)?;
    gallery.save(&state.gallery_path)?;
    Ok(receipt)
}

#[tauri::command]
fn enroll_person_from_gallery(
    app: tauri::AppHandle,
    person_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<GalleryEnrollmentReceipt, String> {
    #[cfg(mobile)]
    {
        let batch = app
            .state::<mobile_face::RealiaFace<tauri::Wry>>()
            .pick_enrollment_photos()?;
        if batch.selected_count != 9 || batch.valid_count != 9 || batch.embeddings.len() != 9 {
            return Err(format!(
                "人物录入需要 9 张有效照片，当前为 {}/{}/{}",
                batch.selected_count,
                batch.valid_count,
                batch.embeddings.len()
            ));
        }
        let batch_id = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| format!("system clock error: {error}"))?
            .as_millis() as u64;
        let mut gallery = state.gallery.lock().map_err(|_| "gallery lock poisoned")?;
        let mut staged = gallery.clone();
        let receipt = staged.enroll_batch(
            &person_id,
            batch_id,
            &batch.embeddings,
            batch.processing_total_ms,
        )?;
        staged.save(&state.gallery_path)?;
        *gallery = staged;
        Ok(receipt)
    }
    #[cfg(not(mobile))]
    {
        let _ = (app, person_id, state);
        Err("图库人物录入仅支持 Android 应用".into())
    }
}

#[tauri::command]
fn remove_person(person_id: String, state: tauri::State<'_, AppState>) -> Result<usize, String> {
    let mut gallery = state.gallery.lock().map_err(|_| "gallery lock poisoned")?;
    let removed = gallery.remove(person_id.trim());
    if removed > 0 {
        gallery.save(&state.gallery_path)?;
    }
    Ok(removed)
}

fn valid_bluetooth_address(value: &str) -> bool {
    let parts: Vec<_> = value.split(':').collect();
    parts.len() == 6
        && parts
            .iter()
            .all(|p| p.len() == 2 && p.chars().all(|c| c.is_ascii_hexdigit()))
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .setup(|app| {
            let gallery_path = app.path().app_data_dir()?.join("face-gallery.json");
            let stranger_path = app.path().app_data_dir()?.join("recent-strangers.json");
            let stranger_photo_root = app.path().app_data_dir()?.join("stranger-faces");
            let gallery = FaceGallery::load(&gallery_path)
                .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error))?;
            let strangers = StrangerStore::load(&stranger_path)
                .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error))?;
            app.manage(AppState {
                session: Mutex::new(SessionState::default()),
                gallery: Mutex::new(gallery),
                strangers: Mutex::new(strangers),
                last_native_face: Mutex::new(None),
                gallery_path,
                stranger_path,
                stranger_photo_root,
                #[cfg(mobile)]
                hud_stability: Mutex::new(HudStability::default()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            session_state,
            begin_session,
            request_capture,
            paired_glasses,
            pair_glasses,
            open_bluetooth_settings,
            set_perception,
            set_person_alert,
            recording_audio,
            transcribe_recording,
            cloud_config,
            save_cloud_config,
            clear_cloud_api_key,
            cloud_complete,
            listen_mood,
            finish_mood_listen,
            cancel_mood_listen,
            mark_recording_processed,
            gallery_list,
            recent_strangers,
            label_stranger,
            enroll_last_face,
            enroll_person_from_gallery,
            remove_person,
            model_download_status,
            start_asr_download,
            open_model_repository,
            topia::load_topia_world,
            topia::save_topia_world,
            topia::reset_topia_world,
            topia::generate_topia_world
        ]);
    #[cfg(mobile)]
    let builder = builder
        .plugin(mobile_transport::init())
        .plugin(mobile_face::init())
        .plugin(mobile_models::init())
        .plugin(mobile_asr::init())
        .plugin(mobile_cloud::init())
        .plugin(mobile_mood::init());
    builder
        .run(tauri::generate_context!())
        .expect("error while running RealTopia phone application");
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_bluetooth_addresses() {
        assert!(valid_bluetooth_address("AA:bb:01:23:45:67"));
        assert!(!valid_bluetooth_address("not-an-address"))
    }
    #[test]
    fn noop_gateway_never_processes_image() {
        let result = NoopProcessingGateway
            .submit(CapturedImage {
                request_id: 7,
                path: "/tmp/example.jpg".into(),
                rotation_degrees: 0,
            })
            .unwrap();
        assert!(!result.accepted);
        assert_eq!(result.provider, "noop");
        assert!(result.analysis.is_none());
    }
    #[test]
    fn encodes_base64_without_external_dependencies() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"M"), "TQ==");
        assert_eq!(base64_encode(b"Ma"), "TWE=");
        assert_eq!(base64_encode(b"Man"), "TWFu");
    }
}
