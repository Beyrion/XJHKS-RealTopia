export type TopiaLocation = "exterior" | "interior" | "garden";

export type TopiaCropKind =
  "sunflower" | "tomato" | "lavender" | "pumpkin" | "herb";

export type TopiaPrefab =
  | "floating-island"
  | "block"
  | "cone"
  | "cylinder"
  | "door"
  | "round-window"
  | "tower"
  | "sail"
  | "wind-chimes"
  | "observatory"
  | "crystal"
  | "cloud"
  | "room-shell"
  | "sky-window"
  | "bed"
  | "nightstand"
  | "desk"
  | "chair"
  | "shelf"
  | "plant"
  | "hearth"
  | "rug"
  | "lantern"
  | "propeller"
  | "path"
  | "crop-plot"
  | "farm-shed"
  | "watering-orb";

export type TopiaVector3 = [number, number, number];

export interface TopiaWorldProfile {
  homeName: string;
  archetype: string;
  traits: string[];
  experiences: string[];
  accentColors: [number, number, number];
}

export interface TopiaUserProfileInput {
  displayName?: string;
  summary: string;
  traits: string[];
  experiences: string[];
  preferences: string[];
}

export interface TopiaObjectConfig {
  id: string;
  prefab: TopiaPrefab;
  position: TopiaVector3;
  rotation?: TopiaVector3;
  scale?: TopiaVector3;
  colors?: number[];
  params?: Record<string, string | number | boolean>;
  anchorId?: string;
  taskId?: string;
  animation?: "float" | "spin" | "sway";
}

export interface TopiaLandmark {
  id: string;
  anchorId: string;
  location: TopiaLocation;
  emoji: string;
  label: string;
  eyebrow: string;
  description: string;
  fallbackPlacement: { left: string; top: string };
  memoryIds: string[];
  taskIds: string[];
  personIds: string[];
}

export interface TopiaSceneConfig {
  camera: { yaw: number; pitch: number };
  objects: TopiaObjectConfig[];
  landmarks: TopiaLandmark[];
}

export interface TopiaWorldConfig {
  schemaVersion: 1;
  id: string;
  ownerId: string;
  revision: number;
  generatedAt: string;
  source: "mock" | "cloud";
  profile: TopiaWorldProfile;
  scenes: Record<TopiaLocation, TopiaSceneConfig>;
  generation?: { provider: string; model: string; promptVersion: string };
}

export interface TopiaSceneCrop {
  id: string;
  title: string;
  progress: number;
  crop: TopiaCropKind;
  personId?: string;
}

export interface TopiaWorldPayload {
  world: TopiaWorldConfig;
  crops: TopiaSceneCrop[];
}
