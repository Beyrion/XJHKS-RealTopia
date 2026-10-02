import { invoke } from "@tauri-apps/api/core";
import type {
  LocalAsrResult,
  GalleryEnrollmentReceipt,
  ModelDownloadStatus,
  MoodSpeechResult,
  NativeCloudConfig,
  NativeCloudResult,
  PairedGlass,
  SessionState,
  RecentStranger,
} from "../models";

export const nativeService = {
  sessionState: () => invoke<SessionState>("session_state"),
  pairedGlasses: () => invoke<PairedGlass[]>("paired_glasses"),
  pairGlasses: (glassAddress: string) =>
    invoke<void>("pair_glasses", { glassAddress }),
  beginSession: (glassAddress: string) =>
    invoke<SessionState>("begin_session", { glassAddress }),
  openBluetoothSettings: () => invoke<void>("open_bluetooth_settings"),
  setPersonAlert: (enabled: boolean) =>
    invoke<void>("set_person_alert", { enabled }),
  setPerception: (
    enabled: boolean,
    framesPerSecond: number,
    width: number,
    quality: number,
  ) =>
    invoke<void>("set_perception", {
      enabled,
      framesPerSecond,
      width,
      quality,
    }),
  requestCapture: (mode: "cold" | "hot", width: number, quality: number) =>
    invoke<{ request_id: number }>("request_capture", { mode, width, quality }),
  enrollLastFace: (personId: string) =>
    invoke<void>("enroll_last_face", { personId }),
  enrollPersonFromGallery: (personId: string) =>
    invoke<GalleryEnrollmentReceipt>("enroll_person_from_gallery", {
      personId,
    }),
  recentStrangers: () => invoke<RecentStranger[]>("recent_strangers"),
  labelStranger: (strangerId: string, identity: string, relationship: string) =>
    invoke<RecentStranger>("label_stranger", {
      strangerId,
      identity,
      relationship,
    }),

  markRecordingProcessed: (recordingId: number, status: string) =>
    invoke<void>("mark_recording_processed", { recordingId, status }),
  transcribeRecording: (recordingId: number) =>
    invoke<LocalAsrResult>("transcribe_recording", { recordingId }),
  listenMood: () => invoke<MoodSpeechResult>("listen_mood"),
  finishMoodListen: () => invoke<void>("finish_mood_listen"),
  cancelMoodListen: () => invoke<void>("cancel_mood_listen"),

  modelDownloadStatus: () =>
    invoke<ModelDownloadStatus>("model_download_status"),
  modelDownloadStatuses: () =>
    invoke<{ models: ModelDownloadStatus[] }>("model_download_statuses"),
  startAsrDownload: () => invoke<void>("start_asr_download"),
  startModelDownload: (modelId: string) =>
    invoke<void>("start_model_download", { modelId }),
  openModelRepository: (modelId: string) =>
    invoke<void>("open_model_repository", { modelId }),

  cloudComplete: (prompt: string, system: string | null, json: boolean) =>
    invoke<NativeCloudResult>("cloud_complete", { prompt, system, json }),
  cloudConfig: () => invoke<NativeCloudConfig>("cloud_config"),
  saveCloudConfig: (config: {
    provider: string;
    baseUrl: string;
    model: string;
    sttModel: string;
    apiKey: string | null;
  }) => invoke<NativeCloudConfig>("save_cloud_config", config),
  clearCloudApiKey: () => invoke<NativeCloudConfig>("clear_cloud_api_key"),
};
