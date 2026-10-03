export interface CaptureMetric {
  request_id: number;
  mode: "cold" | "hot" | "stream" | "interval";
  stream?: boolean;
  bytes: number;
  width: number;
  height: number;
  rotation_degrees: number;
  camera_open_ms: number;
  warmup_ms: number;
  capture_ms: number;
  transfer_ms: number;
  e2e_ms: number;
  path: string;
}

export interface FaceMatch {
  decision: string;
  person_id: string | null;
  score: number;
  second_score?: number;
  margin?: number;
  bbox?: [number, number, number, number];
  detection_score?: number;
}

export interface FaceResult {
  request_id: number;
  detected_count: number;
  eligible_count: number;
  recognition_invoked: boolean;
  matches: FaceMatch[];
  image_width?: number;
  image_height?: number;
  gallery_size?: number;
  detection_ms: number;
  recognition_ms: number;
  recognizer_load_ms: number;
  processing_total_ms: number;
}

export interface GalleryEnrollmentReceipt {
  person_id: string;
  batch_id: number;
  selected_count: number;
  enrolled_count: number;
  templates_for_person: number;
  gallery_templates: number;
  processing_total_ms: number;
  photo_paths: string[];
}

export interface FaceEnrollmentReceipt {
  person_id: string;
  request_id: number;
  templates_for_person: number;
  gallery_templates: number;
  photo_paths: string[];
}

export interface Recording {
  speaker?: {
    id: string | null;
    decision: string;
    similarity: number | null;
    startMs: number;
    endMs: number;
    latencyMs: number;
    sourceRecordingId: number;
  };
  recording_id: number;
  bytes: number;
  sample_rate: number;
  channels: number;
  encoding: string;
  duration_ms: number;
  transfer_ms: number;
  path: string;
  partial?: boolean;
  conversation_id?: number;
  sequence?: number;
  chunk?: boolean;
  final_chunk?: boolean;
  vad_latency_ms?: number;
  vad_reason?: string;
  turn_label?: "complete" | "incomplete" | "invalid";
  turn_latency_ms?: number;
  sensing?: boolean;
  sensing_session_id?: number;
}

export interface SensingAudioState {
  model_preparation?: SensingModelPreparation & {
    loading: boolean;
    last_error?: string;
  };
  audio_level?: number;
  vad_probability?: number;
  vad_latency_ms?: number;
  speech_detected?: boolean;
  listening_phase?: string;
  last_sample_at_ms?: number;
  last_turn_label?: string | null;
  vad_recoveries?: number;
  active: boolean;
  session_id: number;
  queued_segments: number;
  completed_segments: number;
  dropped_segments: number;
  last_error: string | null;
  recording?: Recording | null;
}

export interface SensingModelPreparation {
  models: Array<{
    model_id: string;
    loaded: boolean;
    reused: boolean;
    load_ms: number;
    error: string | null;
  }>;
  elapsed_ms: number;
}

export interface SensingSpeechDebug {
  speaker?: Recording["speaker"];
  speakerBinding?: string;
  attributionPending?: boolean;
  recordingId: number;
  sessionId: number;
  sequence: number;
  startedAt: string;
  durationMs: number;
  bytes: number;
  vadReason?: string;
  vadLatencyMs?: number;
  turnLabel?: string;
  turnLatencyMs?: number;
  status:
    | "transcribing"
    | "analyzing"
    | "complete"
    | "response"
    | "empty"
    | "error"
    | "cancelled";
  transcript?: string;
  asrLatencyMs?: number;
  realtimeFactor?: number;
  modelLoadMs?: number;
  loadThisCallMs?: number;
  modelReused?: boolean;
  error?: string;
}

export interface SpeakerDiarizationResult {
  session_id: number;
  latency_ms: number;
  model_reused: boolean;
  scope: "consecutive-only";
  turns: Array<{
    speaker_id: string | null;
    decision: string;
    similarity: number | null;
    start_ms: number;
    end_ms: number;
    path: string;
    bytes: number;
    duration_ms: number;
  }>;
}

export interface VadChunkResult {
  ready: boolean;
  speech_detected: boolean;
  probability: number;
  latency_ms: number;
  reason: string;
  turn_label: "complete" | "incomplete" | "invalid" | null;
  turn_probabilities: number[];
  turn_latency_ms: number;
  turn_frontend_ms: number;
  turn_inference_ms: number;
  segment: Recording | null;
}

export interface PersonChoiceResult {
  event_id: number;
  person_id: string;
  choice_index: number;
  choice_id: string;
  label: string;
  kind?: "person" | "dialogue" | "world_event" | string;
  context_id?: string;
  input: "rokid_touchpad" | string;
  selected_at_elapsed_ms: number;
  received_at_ms: number;
}

export interface LocalAsrResult {
  text: string;
  provider: string;
  model: string;
  side: "edge";
  latency_ms: number;
  audio_ms: number;
  prefill_ms: number;
  decode_ms: number;
  audio_duration_ms: number;
  realtime_factor: number;
  prompt_tokens: number;
  generated_tokens: number;
  status: number;
  model_load_ms: number;
  load_this_call_ms?: number;
  model_reused?: boolean;
}

export interface LocalVisionResult {
  text: string;
  provider: string;
  model: string;
  side: "edge";
  latency_ms: number;
  vision_ms: number;
  prefill_ms: number;
  decode_ms: number;
  image_width: number;
  image_height: number;
  prompt_tokens: number;
  generated_tokens: number;
  retry_count: number;
  status: number;
  model_load_ms: number;
  processing_total_ms: number;
}

export interface SceneObservationResult {
  capture: CaptureMetric;
  face: FaceResult | null;
  vision: LocalVisionResult;
}

export interface MoodSpeechResult {
  transcript: string;
  confidence: number;
}

export interface ModelDownloadStatus {
  model_id: string;
  repository_url: string;
  state: string;
  ready: boolean;
  automatic: boolean;
  downloaded_bytes: number;
  total_bytes: number;
  completed_files: number;
  file_count: number;
  install_path: string;
  last_error: string | null;
}

export interface ModelDownloadStatuses {
  models: ModelDownloadStatus[];
}

export interface RealWorldContext {
  captured_at_ms: number;
  location: {
    available: boolean;
    latitude?: number;
    longitude?: number;
    accuracy_m?: number;
    observed_at_ms?: number;
  };
  calendar: Array<{
    id: string;
    title: string;
    start_ms: number;
    end_ms: number;
    location: string;
  }>;
}

export interface SessionState {
  phase: string;
  session_id: string | null;
  transport: string;
  completed_captures: number;
  detail: string;
  last_error: string | null;
  last_capture: CaptureMetric | null;
  face_processing?: string;
  face_error?: string | null;
  last_face?: FaceResult | null;
  last_recording?: Recording | null;
  recording_processing?: string;
  last_person_choice?: PersonChoiceResult | null;
}

export interface PairedGlass {
  name: string;
  address: string;
}
