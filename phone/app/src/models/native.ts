export interface CaptureMetric {
  request_id: number;
  mode: "cold" | "hot" | "stream";
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

export interface FaceResult {
  request_id: number;
  detected_count: number;
  eligible_count: number;
  recognition_invoked: boolean;
  matches: { decision: string; person_id: string | null; score: number }[];
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
  recording_id: number;
  bytes: number;
  sample_rate: number;
  channels: number;
  encoding: string;
  duration_ms: number;
  transfer_ms: number;
  path: string;
}

export interface PersonChoiceResult {
  event_id: number;
  person_id: string;
  choice_index: number;
  choice_id: "greet" | "catch_up" | "later";
  label: string;
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
