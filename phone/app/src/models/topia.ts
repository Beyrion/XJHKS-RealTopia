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
  imagery: string[];
  sensations: string[];
  stylePreferences: string[];
}

export type TopiaRenderStyleKind =
  | "painterly-oil"
  | "plush-toy"
  | "paper-craft"
  | "glazed-ceramic"
  | "storybook-ink"
  | "crystal-diorama";

export interface TopiaRenderStyleConfig {
  kind: TopiaRenderStyleKind;
  seed: number;
  roughness: number;
  metalness: number;
  saturation: number;
  contrast: number;
  textureStrength: number;
}

export type TopiaObjectLayer = "structure" | "decoration" | "crop" | "souvenir";

export interface TopiaSkyConfig {
  theme: string;
  motifs: string[];
  celestialShape: string;
  decorationDensity: number;
  drift: number;
  top: number;
  mid: number;
  low: number;
  aurora: number;
  celestial: number;
  stars: number;
  fog: number;
  magic: number;
}

export interface TopiaObjectConfig {
  id: string;
  prefab: TopiaPrefab;
  layer?: TopiaObjectLayer;
  position: TopiaVector3;
  rotation?: TopiaVector3;
  scale?: TopiaVector3;
  colors?: number[];
  params?: Record<string, string | number | boolean>;
  anchorId?: string;
  taskId?: string;
  memoryIds?: string[];
  animation?: "float" | "spin" | "sway" | "sparkle";
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
  schemaVersion: 1 | 2;
  id: string;
  ownerId: string;
  revision: number;
  generatedAt: string;
  source: "mock" | "cloud";
  profile: TopiaWorldProfile;
  sky?: TopiaSkyConfig;
  renderStyle?: TopiaRenderStyleConfig;
  scenes: Record<TopiaLocation, TopiaSceneConfig>;
  generation?: { provider: string; model: string; promptVersion: string };
}

export interface TopiaAssetLayer {
  objects: Record<TopiaLocation, TopiaObjectConfig[]>;
  landmarks: Record<TopiaLocation, TopiaLandmark[]>;
  memories: TopiaAssetMemory[];
}

export interface TopiaAssetMemory {
  id: string;
  objectId: string;
  location: TopiaLocation;
  kind: "decoration" | "crop" | "souvenir" | "structure";
  label: string;
  createdAt: string;
  sourceMemoryIds: string[];
  sourceTaskIds: string[];
}

export interface TopiaWorldSummary {
  id: string;
  homeName: string;
  archetype: string;
  generatedAt: string;
  active: boolean;
  source: "mock" | "cloud";
  thumbnail?: string;
}

export interface TopiaStudioPayload {
  activeWorldId: string;
  worlds: TopiaWorldSummary[];
  assets: TopiaAssetLayer;
  lastProfile?: TopiaUserProfileInput;
  needsOnboarding: boolean;
}

export interface TopiaGenerationProgress {
  mode: "create" | "iterate";
  stage: string;
  progress: number;
  message: string;
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
  studio: TopiaStudioPayload;
}
