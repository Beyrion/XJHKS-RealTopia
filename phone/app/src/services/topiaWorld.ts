import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  Memory,
  Person,
  Quest,
  TopiaUserProfileInput,
  TopiaGenerationProgress,
  TopiaWorldConfig,
  TopiaWorldPayload,
} from "../models";

export interface TopiaWorldContext {
  quests: Quest[];
  people: Person[];
  memories: Memory[];
}

function publish(payload: TopiaWorldPayload) {
  window.dispatchEvent(
    new CustomEvent("realtopia:topia-world", { detail: payload }),
  );
  return payload;
}

export const topiaWorldService = {
  load: (context: TopiaWorldContext) =>
    invoke<TopiaWorldPayload>("load_topia_world", { context }),
  save: (world: TopiaWorldConfig, context: TopiaWorldContext) =>
    invoke<TopiaWorldPayload>("save_topia_world", { world, context }).then(
      publish,
    ),
  reset: (context: TopiaWorldContext) =>
    invoke<TopiaWorldPayload>("reset_topia_world", { context }).then(publish),
  generate: (profile: TopiaUserProfileInput, context: TopiaWorldContext) =>
    invoke<TopiaWorldPayload>("generate_topia_world", {
      input: { profile, context },
    }).then(publish),
  iterate: (context: TopiaWorldContext) =>
    invoke<TopiaWorldPayload>("iterate_topia_world", { context }).then(publish),
  maintain: (context: TopiaWorldContext) =>
    invoke<TopiaWorldPayload | null>("maintain_topia_world", { context }).then(
      (payload) => (payload ? publish(payload) : null),
    ),
  switchWorld: (worldId: string, context: TopiaWorldContext) =>
    invoke<TopiaWorldPayload>("switch_topia_world", {
      worldId,
      context,
    }).then(publish),
  completeOnboarding: (context: TopiaWorldContext) =>
    invoke<TopiaWorldPayload>("complete_topia_onboarding", { context }).then(
      publish,
    ),
  saveThumbnail: (worldId: string, thumbnail: string) =>
    invoke<void>("save_topia_thumbnail", { worldId, thumbnail }),
  onProgress: (callback: (progress: TopiaGenerationProgress) => void) =>
    listen<TopiaGenerationProgress>("topia-generation-progress", (event) =>
      callback(event.payload),
    ),
};
