export type Tab = "topia" | "quests" | "people" | "settings";
export type Setting = "glasses" | "intelligence" | "memory" | "testing";
export type PersonPanel = "quests" | "memories" | "profile";
export type QuestFilter = "active" | "done" | "all";
export type QuestCategory =
  "creative" | "relationship" | "health" | "home" | "outdoor" | "general";
export type QuestStatus = "inbox" | "active" | "blocked" | "done" | "cancelled";
export type QuestSource =
  "seed" | "voice" | "glasses" | "manual" | "memory" | "world-event";

export const moodKinds = [
  "joyful",
  "calm",
  "sad",
  "anxious",
  "angry",
  "tired",
  "neutral",
] as const;

export type MoodKind = (typeof moodKinds)[number];
export type MoodPhase = "idle" | "listening" | "analyzing" | "result" | "error";

export interface MoodAnalysis {
  mood: MoodKind;
  intensity: number;
  summary: string;
  support: string;
}

export interface MoodSnapshot extends MoodAnalysis {
  transcript: string;
  model: string;
  analyzedAt: string;
}

export interface GlassSettings {
  framesPerSecond: number;
  width: number;
  quality: number;
  personAlert: "poster" | "quiet";
}

export interface Quest {
  id: string;
  group: string;
  title: string;
  meta: string;
  body: string;
  priority: string;
  progress: number;
  steps: string[];
  person?: string;
  personId?: string;
  parentId?: string;
  reward: string;
  category?: QuestCategory;
  status?: QuestStatus;
  source?: QuestSource;
  assignerPersonId?: string;
  deadline?: string;
  createdAt?: string;
  completedAt?: string;
}

export type GameEventType =
  | "task_created"
  | "task_focused"
  | "task_progressed"
  | "task_completed"
  | "conversation_recorded"
  | "scene_observed"
  | "world_event_created"
  | "world_event_accepted"
  | "world_event_ignored"
  | "souvenir_unlocked"
  | "affinity_changed";

export type InteractionEventType =
  "meaningful_conversation" | "gratitude" | "help" | "promise" | "conflict";

export type PersonMemoryKind =
  | "conversation"
  | "fact"
  | "preference"
  | "promise"
  | "task_assigned"
  | "task_completed"
  | "task_failed"
  | "relationship";

export interface GameEvent {
  id: string;
  type: GameEventType;
  createdAt: string;
  questId?: string;
  personId?: string;
  progress?: number;
  vitalityDelta?: number;
  affinityDelta?: number;
  interactionType?: InteractionEventType;
  evidence?: string;
  dedupeKey?: string;
  source: "user" | "asr" | "vision" | "llm" | "system";
  summary: string;
}

export interface Person {
  id: string;
  name: string;
  role: string;
  affinity: number;
  tone: string;
  quote: string;
  story: string;
  quests: string[];
  seen: string;
  photoPaths?: string[];
}

export interface RecentStranger {
  id: string;
  first_seen_at_ms: number;
  last_seen_at_ms: number;
  identity: string | null;
  relationship: string | null;
  photo_paths: string[];
  photo_count: number;
}

export interface Memory {
  id: string;
  time: string;
  title: string;
  meta: string;
  kind: "task" | "recording" | "person" | "mood" | "activity";
  observedAt?: string;
  summary?: string;
  transcript?: string;
  personIds?: string[];
  taskIds?: string[];
  mood?: MoodKind;
  intensity?: number;
  personMemoryKind?: PersonMemoryKind;
  evidence?: string;
  confidence?: number;
  sourceRecordingId?: number;
  status?: "active" | "superseded" | "dismissed";
  dedupeKey?: string;
}

export interface SceneObservationStatus {
  running: boolean;
  lastObservedAt: string | null;
  nextRunAt: string | null;
  lastSummary: string | null;
  lastError: string | null;
  lastLatencyMs: number | null;
}

export type WorldEventStatus = "pending" | "accepted" | "ignored" | "expired";

export interface WorldEvent {
  id: string;
  title: string;
  description: string;
  reason: string;
  createdAt: string;
  expiresAt: string;
  status: WorldEventStatus;
  sourceObservationId: string;
  locationLabel: string;
  personIds: string[];
  confidence: number;
  dedupeKey: string;
  quest: {
    title: string;
    body: string;
    steps: string[];
    deadline?: string;
    personId?: string;
    reward: string;
  };
}

export interface Souvenir {
  id: string;
  questId: string;
  personId?: string;
  name: string;
  description: string;
  emoji: string;
  acquiredAt: string;
  presentation?: {
    modelKind: SouvenirModelKind;
    preferredLocation?: "exterior" | "interior" | "garden";
    scale?: number;
  };
}

export type SouvenirModelKind =
  | "moon-rabbit-doll"
  | "constellation-badge"
  | "firefly-bottle"
  | "winged-book"
  | "star-compass"
  | "sprout-lantern"
  | "cloud-whale"
  | "planet-teacup"
  | "echo-shell"
  | "clockwork-bird"
  | "aurora-key"
  | "dream-camera"
  | "mnn-engine-core";

export interface MoodProfile {
  label: string;
  weather: string;
  effect: string;
}

export interface LocalModelRepository {
  id: string;
  name: string;
  kind: string;
  install: "auto" | "on-demand" | "manual";
}
