import type { FaceResult, Person, Quest } from "../models";

const ignoredBigrams = new Set([
  "一个",
  "正在",
  "画面",
  "场景",
  "人物",
  "可以",
  "看到",
  "旁边",
  "前面",
  "里面",
  "这个",
  "那个",
]);

function normalized(value: string) {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function tokens(value: string) {
  const result = new Set<string>();
  const lower = value.toLocaleLowerCase();
  for (const word of lower.match(/[a-z0-9]{2,}/g) ?? []) result.add(word);
  for (const run of lower.match(/[\u3400-\u9fff]{2,}/g) ?? []) {
    for (let index = 0; index < run.length - 1; index += 1) {
      const token = run.slice(index, index + 2);
      if (!ignoredBigrams.has(token)) result.add(token);
    }
  }
  return result;
}

function questText(quest: Quest) {
  return [quest.title, quest.meta, quest.body, ...quest.steps].join(" ");
}

export interface SceneLinks {
  taskIds: string[];
  personIds: string[];
  primaryQuestId: string | null;
  confidence: number;
}

export function linkSceneObservation(
  summary: string,
  quests: Quest[],
  people: Person[],
  face: FaceResult | null,
  activeQuestId: string | null,
): SceneLinks {
  const sceneTokens = tokens(summary);
  const personIds = new Set<string>();
  for (const match of face?.matches ?? []) {
    if (match.decision === "known" && match.person_id) {
      personIds.add(match.person_id);
    }
  }
  for (const person of people) {
    if (person.name.length >= 2 && summary.includes(person.name)) {
      personIds.add(person.id);
    }
  }

  const ranked = quests
    .filter(
      (quest) =>
        quest.progress < 100 &&
        quest.status !== "done" &&
        quest.status !== "cancelled",
    )
    .map((quest) => {
      const candidates = tokens(questText(quest));
      let overlap = 0;
      for (const token of sceneTokens) {
        if (candidates.has(token)) overlap += 1;
      }
      const personBoost = [quest.personId, quest.assignerPersonId].some(
        (id) => id && personIds.has(id),
      )
        ? 1
        : 0;
      const activeBoost = quest.id === activeQuestId && overlap >= 2 ? 0.5 : 0;
      return { quest, score: overlap + personBoost + activeBoost, overlap };
    })
    .filter((item) => item.overlap >= 2 && item.score >= 2.5)
    .sort((left, right) => right.score - left.score)
    .slice(0, 2);

  return {
    taskIds: ranked.map((item) => item.quest.id),
    personIds: [...personIds],
    primaryQuestId: ranked[0]?.quest.id ?? null,
    confidence: ranked.length
      ? Math.min(0.95, 0.55 + ranked[0].score * 0.08)
      : 0.5,
  };
}

export function sceneSimilarity(left: string, right: string) {
  const leftNormalized = normalized(left);
  const rightNormalized = normalized(right);
  if (!leftNormalized || !rightNormalized) return 0;
  if (leftNormalized === rightNormalized) return 1;
  const leftTokens = tokens(leftNormalized);
  const rightTokens = tokens(rightNormalized);
  const union = new Set([...leftTokens, ...rightTokens]);
  if (!union.size) return 0;
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  return intersection / union.size;
}
