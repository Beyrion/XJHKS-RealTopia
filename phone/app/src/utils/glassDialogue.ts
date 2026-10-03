import type { Recording } from "../models";

export interface GlassDialogueState {
  sessionId: number;
  left: Array<{ id: number; text: string }>;
  right: Array<{ id: number; text: string }>;
  note: string;
}
export const emptyGlassDialogue = (): GlassDialogueState => ({
  sessionId: 0,
  left: [],
  right: [],
  note: "",
});
const clean = (text: string, max = 160) =>
  Array.from(
    text
      .replace(/<asr_text>/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  )
    .slice(0, max)
    .join("");

/** Display-only state; voice labels are not person identities. Never alternates by turn number. */
export function appendGlassDialogue(
  state: GlassDialogueState,
  sessionId: number,
  id: number,
  text: string,
  speaker?: Recording["speaker"],
): GlassDialogueState {
  const value = clean(text);
  if (!sessionId || !value || (state.sessionId && sessionId < state.sessionId))
    return state;
  const next =
    state.sessionId === sessionId
      ? state
      : { ...emptyGlassDialogue(), sessionId };
  if (!speaker?.id || !["new", "matched"].includes(speaker.decision))
    return next;
  const side =
    speaker.id === "voice-1"
      ? "left"
      : speaker.id === "voice-2"
        ? "right"
        : null;
  if (!side) return next;
  const entries = [
    ...next[side].filter((e) => e.id !== id),
    { id, text: value },
  ].slice(-2);
  return { ...next, [side]: entries, note: "" };
}

export function glassDialogueSnapshot(
  state: GlassDialogueState,
  active: boolean,
) {
  return {
    active,
    sessionId: active ? state.sessionId : 0,
    left: {
      voiceId: "voice-1",
      label: "",
      lines: active ? state.left.map((e) => e.text) : [],
    },
    right: {
      voiceId: "voice-2",
      label: "",
      lines: active ? state.right.map((e) => e.text) : [],
    },
    note: "",
  };
}
