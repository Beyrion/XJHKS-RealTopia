import {
  emptyMood,
  personIdByName,
  starterMemories,
  starterPeople,
  starterQuests,
} from "../data/appData";
import {
  moodKinds,
  type GlassSettings,
  type Memory,
  type MoodKind,
  type MoodSnapshot,
  type Person,
  type Quest,
} from "../models";

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? structuredClone(fallback) : (JSON.parse(raw) as T);
  } catch {
    return structuredClone(fallback);
  }
}

export const storage = {
  loadQuests(): Quest[] {
    const value = loadJson<Quest[]>("realtopia.quests", []);
    return (value.length ? value : structuredClone(starterQuests)).map(
      (item) => ({
        ...item,
        personId:
          item.personId ??
          (item.person ? personIdByName[item.person] : undefined),
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
    return {
      intervalSeconds: 15,
      width: 4032,
      quality: 90,
      personAlert: "poster",
      ...loadJson<Partial<GlassSettings>>("realtopia.glassSettings", {}),
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
  loadPerception() {
    return localStorage.getItem("realtopia.perception") !== "off";
  },
  savePerception(value: boolean) {
    localStorage.setItem("realtopia.perception", value ? "on" : "off");
  },
};
