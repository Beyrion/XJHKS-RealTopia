import {
  emptyMood,
  personIdByName,
  starterMemories,
  starterPeople,
  starterQuests,
} from "../data/appData";
import {
  moodKinds,
  type GameEvent,
  type GlassSettings,
  type Memory,
  type MoodKind,
  type MoodSnapshot,
  type Person,
  type Quest,
} from "../models";
import { inferQuestCategory } from "../utils/gameRules";

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? structuredClone(fallback) : (JSON.parse(raw) as T);
  } catch {
    return structuredClone(fallback);
  }
}

export const storage = {
  hasPersistedUserData() {
    return Object.keys(localStorage).some(
      (key) =>
        key.startsWith("realtopia.") &&
        !key.startsWith("realtopia.topiaWorld") &&
        !key.startsWith("realtopia.topiaStudio"),
    );
  },
  loadQuests(): Quest[] {
    const value = loadJson<Quest[]>("realtopia.quests", []);
    return (value.length ? value : structuredClone(starterQuests)).map(
      (item) => ({
        ...item,
        personId:
          item.personId ??
          (item.person ? personIdByName[item.person] : undefined),
        assignerPersonId: item.assignerPersonId ?? item.personId,
        category: item.category ?? inferQuestCategory(item),
        status:
          item.status ??
          (item.progress >= 100
            ? "done"
            : item.progress > 0
              ? "active"
              : "inbox"),
        source: item.source ?? "seed",
        createdAt: item.createdAt ?? new Date(0).toISOString(),
      }),
    );
  },
  saveQuests(value: Quest[]) {
    localStorage.setItem("realtopia.quests", JSON.stringify(value));
  },
  loadPeople(): Person[] {
    const value = loadJson<Person[]>("realtopia.people", []);
    return value.length ? value : structuredClone(starterPeople);
  },
  savePeople(value: Person[]) {
    localStorage.setItem("realtopia.people", JSON.stringify(value));
  },
  loadMemories(): Memory[] {
    return loadJson("realtopia.memories", starterMemories);
  },
  saveMemories(value: Memory[]) {
    localStorage.setItem(
      "realtopia.memories",
      JSON.stringify(value.slice(0, 200)),
    );
  },
  loadGlassSettings(): GlassSettings {
    const saved = loadJson<
      Partial<GlassSettings> & { intervalSeconds?: number }
    >("realtopia.glassSettings", {});
    return {
      ...saved,
      framesPerSecond: Math.max(
        2,
        Math.min(5, Number(saved.framesPerSecond) || 2),
      ),
      width: saved.width ?? 1280,
      quality: saved.quality ?? 75,
      personAlert: saved.personAlert ?? "poster",
    };
  },
  saveGlassSettings(value: GlassSettings) {
    localStorage.setItem("realtopia.glassSettings", JSON.stringify(value));
  },
  loadMood(): MoodSnapshot {
    const value = loadJson<Partial<MoodSnapshot> | null>(
      "realtopia.mood",
      null,
    );
    if (!value || !moodKinds.includes(value.mood as MoodKind))
      return { ...emptyMood };
    const text = (input: unknown, fallback: string, max: number) =>
      typeof input === "string" ? input.slice(0, max) : fallback;
    return {
      mood: value.mood as MoodKind,
      intensity: Math.max(0, Math.min(100, Number(value.intensity) || 0)),
      summary: text(value.summary, emptyMood.summary, 60),
      support: text(value.support, emptyMood.support, 90),
      transcript: text(value.transcript, "", 4000),
      model: text(value.model, "", 100),
      analyzedAt: text(value.analyzedAt, "", 40),
    };
  },
  saveMood(value: MoodSnapshot) {
    localStorage.setItem("realtopia.mood", JSON.stringify(value));
  },
  loadGameEvents(): GameEvent[] {
    return loadJson<GameEvent[]>("realtopia.gameEvents.v1", []).slice(0, 500);
  },
  saveGameEvents(value: GameEvent[]) {
    localStorage.setItem(
      "realtopia.gameEvents.v1",
      JSON.stringify(value.slice(0, 500)),
    );
  },
  loadActiveQuestId() {
    return localStorage.getItem("realtopia.activeQuestId");
  },
  saveActiveQuestId(value: string | null) {
    if (value) localStorage.setItem("realtopia.activeQuestId", value);
    else localStorage.removeItem("realtopia.activeQuestId");
  },
  loadPerception() {
    return localStorage.getItem("realtopia.perception") !== "off";
  },
  savePerception(value: boolean) {
    localStorage.setItem("realtopia.perception", value ? "on" : "off");
  },
  loadSceneObservationEnabled() {
    return localStorage.getItem("realtopia.sceneObservation") !== "off";
  },
  saveSceneObservationEnabled(value: boolean) {
    localStorage.setItem("realtopia.sceneObservation", value ? "on" : "off");
  },
};
