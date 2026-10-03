import { invoke } from "@tauri-apps/api/core";
import type {
  LocalAsrResult,
  LocalVisionResult,
  FaceEnrollmentReceipt,
  GalleryEnrollmentReceipt,
  ModelDownloadStatus,
  MoodSpeechResult,
  NativeCloudConfig,
  NativeCloudResult,
  PairedGlass,
  SessionState,
  SensingAudioState,
  SensingModelPreparation,
  RecentStranger,
  SceneObservationResult,
  RealWorldContext,
  Recording,
  VadChunkResult,
  SpeakerDiarizationResult,
} from "../models";

export const nativeService = {
  deleteUserData: () => invoke<void>("delete_user_data"),
  galleryList: () => invoke<Record<string, number>>("gallery_list"),
  removePerson: (personId: string) =>
    invoke<number>("remove_person", { personId }),
  sessionState: () => invoke<SessionState>("session_state"),
  capturePreview: (requestId: number) =>
    invoke<string>("capture_preview", { requestId }),
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
    _framesPerSecond: number,
    width: number,
    quality: number,
  ) =>
    invoke<void>("set_perception", {
      enabled,
      // Legacy wire field retained for installed CXR clients; cadence lives on
      // the glasses and is fixed at one still image every ten seconds.
      framesPerSecond: 2,
      width,
      quality,
    }),
  requestCapture: (mode: "cold" | "hot", width: number, quality: number) =>
    invoke<{ request_id: number }>("request_capture", { mode, width, quality }),
  showChoiceCard: (request: {
    person_id: string;
    name: string;
    title: string;
    affinity: number;
    quest: string;
    story: string;
    choices_json: string;
  }) => invoke<void>("show_choice_card", { request }),
  syncGlassHud: (configJson: string) =>
    invoke<void>("sync_glass_hud", { configJson }),
  dismissChoiceCard: (contextId: string, message = "") =>
    invoke<void>("show_choice_card", {
      request: {
        person_id: "__dismiss__",
        name: "对话助手",
        title: "",
        affinity: -2,
        quest: "",
        story: message,
        choices_json: JSON.stringify({ kind: "dismiss", contextId }),
      },
    }),
  enrollLastFace: (personId: string) =>
    invoke<FaceEnrollmentReceipt>("enroll_last_face", { personId }),
  enrollPersonFromGallery: (personId: string) =>
    invoke<GalleryEnrollmentReceipt>("enroll_person_from_gallery", {
      personId,
    }),
  recentStrangers: () => invoke<RecentStranger[]>("recent_strangers"),
  clearRecentStrangers: () => invoke<void>("clear_recent_strangers"),
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
  transcribeAudioPath: (path: string, sampleRate: number, channels: number) =>
    invoke<LocalAsrResult>("transcribe_audio_path", {
      path,
      sampleRate,
      channels,
    }),
  diarizeAudioPath: (
    path: string,
    sampleRate: number,
    channels: number,
    sessionId: number,
  ) =>
    invoke<SpeakerDiarizationResult>("diarize_audio_path", {
      path,
      sampleRate,
      channels,
      sessionId,
    }),
  releaseSpeakerTurns: () => invoke<void>("release_speaker_turns"),
  resetSpeakerSession: () => invoke<void>("reset_speaker_session"),
  warmupSpeakerModel: () =>
    invoke<{ loaded: boolean; reused: boolean; load_ms: number }>(
      "warmup_speaker_model",
    ),
  acceptVadChunk: (recordingId: number) =>
    invoke<VadChunkResult>("accept_vad_chunk", { recordingId }),
  listenMood: () => invoke<MoodSpeechResult>("listen_mood"),
  listenAutomaticResponse: () =>
    invoke<MoodSpeechResult>("listen_automatic_response"),
  recordPhoneConversation: (conversationId: number, recordingId: number) =>
    invoke<Recording>("record_phone_conversation", {
      conversationId,
      recordingId,
    }),
  finishMoodListen: () => invoke<void>("finish_mood_listen"),
  cancelMoodListen: () => invoke<void>("cancel_mood_listen"),
  startSensingAudio: (sessionId: number) =>
    invoke<SensingAudioState>("start_sensing_audio", { sessionId }),
  prepareSensingModels: (
    includeAsr: boolean,
    visionModelId: string | null,
    includeSpeakers = false,
  ) =>
    invoke<SensingModelPreparation>("prepare_sensing_models", {
      includeAsr,
      includeSpeakers,
      visionModelId,
    }),
  stopSensingAudio: (sessionId: number, drain = false) =>
    invoke<void>("stop_sensing_audio", { sessionId, drain }),
  sensingAudioState: (take: boolean) =>
    invoke<SensingAudioState>("sensing_audio_state", { take }),
  acknowledgeSensingAudio: (recordingId: number) =>
    invoke<void>("acknowledge_sensing_audio", { recordingId }),

  modelDownloadStatus: () =>
    invoke<ModelDownloadStatus>("model_download_status"),
  modelDownloadStatuses: () =>
    invoke<{ models: ModelDownloadStatus[] }>("model_download_statuses"),
  startAsrDownload: () => invoke<void>("start_asr_download"),
  startModelDownload: (modelId: string) =>
    invoke<void>("start_model_download", { modelId }),
  openModelRepository: (modelId: string) =>
    invoke<void>("open_model_repository", { modelId }),
  pickAndAnalyzeWithVl: (modelId: string, prompt: string, maxNewTokens = 128) =>
    invoke<LocalVisionResult>("pick_and_analyze_with_vl", {
      modelId,
      prompt,
      maxNewTokens,
    }),
  analyzeLastCaptureWithVl: (
    modelId: string,
    prompt: string,
    maxNewTokens = 128,
  ) =>
    invoke<LocalVisionResult>("analyze_last_capture_with_vl", {
      modelId,
      prompt,
      maxNewTokens,
    }),
  observeSceneWithVl: (
    modelId: string,
    prompt: string,
    width: number,
    quality: number,
    maxNewTokens = 96,
    latestCaptureOnly = false,
  ) =>
    invoke<SceneObservationResult>("observe_scene_with_vl", {
      modelId,
      prompt,
      width,
      quality,
      maxNewTokens,
      latestCaptureOnly,
    }),

  cloudComplete: (
    prompt: string,
    system: string | null,
    json: boolean,
    timeoutMs = 12_000,
    options: {
      maxCompletionTokens?: number;
      fast?: boolean;
      temperature?: number;
    } = {},
  ) =>
    invoke<NativeCloudResult>("cloud_complete", {
      prompt,
      system,
      json,
      timeoutMs,
      ...options,
    }),
  cloudConfig: () => invoke<NativeCloudConfig>("cloud_config"),
  saveCloudConfig: (config: {
    provider: string;
    baseUrl: string;
    model: string;
    sttModel: string;
    apiKey: string | null;
  }) => invoke<NativeCloudConfig>("save_cloud_config", config),
  clearCloudApiKey: () => invoke<NativeCloudConfig>("clear_cloud_api_key"),
  realWorldContext: () => invoke<RealWorldContext>("real_world_context"),
};
