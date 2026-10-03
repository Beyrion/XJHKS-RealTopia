import { moodProfiles } from "../data/appData";
import type { GameEvent, Memory, MoodSnapshot, Quest } from "../models";
import { calculateVitality } from "./gameRules";
import { isFormalQuest, questLifecycle } from "./questEvidence";

export interface GlassHudTaskSnapshot {
  id: string;
  group: string;
  title: string;
  progress: number;
  status: string;
  focused: boolean;
  steps: string[];
  stepStatuses: string[];
}

export interface GlassHudSnapshot {
  schemaVersion: 1;
  tasks: GlassHudTaskSnapshot[];
  mood: { label: string; weather: string };
  vitality: { value: number; maximum: 100 };
}

const updatedAt = (quest: Quest) =>
  (quest.progressEvents ?? []).reduce(
    (latest, event) => (event.recordedAt > latest ? event.recordedAt : latest),
    quest.createdAt ?? "",
  );

export function createGlassHudSnapshot(
  quests: Quest[],
  activeQuestId: string | null,
  mood: MoodSnapshot,
  memories: Memory[],
  events: GameEvent[],
): GlassHudSnapshot {
  const moodProfile = moodProfiles[mood.mood];
  const tasks = quests
    .filter(isFormalQuest)
    .sort((left, right) => {
      if (left.status === "done" && right.status !== "done") return 1;
      if (right.status === "done" && left.status !== "done") return -1;
      // Recently accepted/updated tasks must not get buried behind old quests.
      const recent = updatedAt(right).localeCompare(updatedAt(left));
      if (recent) return recent;
      if (left.id === activeQuestId) return -1;
      if (right.id === activeQuestId) return 1;
      return 0;
    })
    .slice(0, 4)
    .map((quest) => ({
      id: quest.id,
      group: quest.group,
      title: quest.title,
      progress: Math.max(0, Math.min(100, Math.round(quest.progress))),
      status:
        questLifecycle(quest) === "completed" ? "done" : questLifecycle(quest),
      focused: quest.id === activeQuestId,
      steps: [...quest.steps],
      stepStatuses:
        quest.stepRecords?.map((s) => s.status) ??
        quest.steps.map(() => "pending"),
    }));

  return {
    schemaVersion: 1,
    tasks,
    mood: { label: moodProfile.label, weather: moodProfile.weather },
    vitality: {
      value: calculateVitality(quests, memories, events),
      maximum: 100,
    },
  };
}
