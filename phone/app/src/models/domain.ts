export type Tab = "topia" | "quests" | "people" | "settings";
export type Setting = "glasses" | "intelligence" | "memory" | "testing";
export type PersonPanel = "quests" | "memories" | "profile";
export type QuestFilter = "active" | "done" | "all";

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
  intervalSeconds: number;
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
}

export interface Memory {
  id: string;
  time: string;
  title: string;
  meta: string;
  kind: "task" | "recording" | "person" | "mood";
  summary?: string;
  transcript?: string;
  personIds?: string[];
  taskIds?: string[];
  mood?: MoodKind;
  intensity?: number;
}

export interface MoodProfile {
  label: string;
  weather: string;
  effect: string;
}

export interface LocalModelRepository {
  id: string;
  name: string;
  kind: string;
  install: "auto" | "manual";
}
