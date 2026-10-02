import { invoke } from "@tauri-apps/api/core";
import type {
  Memory,
  Person,
  Quest,
  TopiaUserProfileInput,
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
};
