import type { GameEvent, Memory, Quest, QuestCategory } from "../models";

export const questCategoryMeta: Record<
  QuestCategory,
  { label: string; effect: string; emoji: string }
> = {
  creative: { label: "创造", effect: "星轨正在汇聚", emoji: "✦" },
  relationship: { label: "羁绊", effect: "风铃回应承诺", emoji: "🎐" },
  health: { label: "身心", effect: "生命光环缓慢呼吸", emoji: "◌" },
  home: { label: "家园", effect: "枝叶随着进度生长", emoji: "🌿" },
  outdoor: { label: "旅途", effect: "浮岛向目标启航", emoji: "☁️" },
  general: { label: "行动", effect: "目标微光持续闪烁", emoji: "◇" },
};

const categoryKeywords: Array<[QuestCategory, RegExp]> = [
  ["health", /运动|跑步|健身|睡眠|休息|牙医|医院|复诊|吃药|健康/],
  ["relationship", /妈妈|爸爸|朋友|同事|联系|见面|归还|送给|帮助|相册|家庭/],
  ["home", /家|房间|阳台|花园|植物|整理|打扫|收纳|做饭|菜地/],
  ["outdoor", /出门|到达|旅行|散步|公司|学校|书店|花市|户外/],
  ["creative", /项目|原型|设计|开发|写作|学习|研究|测试|创作|代码/],
];

export function inferQuestCategory(
  quest: Pick<Quest, "title" | "body" | "meta" | "personId">,
): QuestCategory {
  const text = `${quest.title} ${quest.body} ${quest.meta}`;
  if (quest.personId && /联系|见面|归还|还给|送给|帮助|相册|家庭/.test(text))
    return "relationship";
  return (
    categoryKeywords.find(([, pattern]) => pattern.test(text))?.[0] ?? "general"
  );
}

function deadlineScore(deadline?: string) {
  if (!deadline) return 5;
  const timestamp = Date.parse(deadline);
  if (!Number.isFinite(timestamp)) return 5;
  const hours = (timestamp - Date.now()) / 3_600_000;
  if (hours < 0) return 40;
  if (hours <= 6) return 35;
  if (hours <= 24) return 28;
  if (hours <= 72) return 18;
  return 8;
}

export function questFocusScore(quest: Quest) {
  if (
    quest.progress >= 100 ||
    quest.status === "done" ||
    quest.status === "cancelled"
  )
    return -1_000;
  if (quest.status === "blocked") return -100;
  return (
    deadlineScore(quest.deadline) +
    (quest.priority === "首要" ? 30 : 15) +
    (quest.assignerPersonId || quest.personId ? 12 : 0) +
    Math.round((100 - quest.progress) / 20)
  );
}

export function recommendedQuest(
  quests: Quest[],
  activeQuestId?: string | null,
) {
  const active = quests.find(
    (item) =>
      item.id === activeQuestId &&
      item.progress < 100 &&
      item.status !== "cancelled",
  );
  if (active) return active;
  return [...quests].sort((a, b) => questFocusScore(b) - questFocusScore(a))[0];
}

export function completionReward(quest: Quest, events: GameEvent[]) {
  const vitalityDelta = quest.priority === "首要" ? 7 : 5;
  const personId = quest.assignerPersonId ?? quest.personId;
  if (!personId)
    return { vitalityDelta, affinityDelta: 0, personId: undefined };
  const today = new Date().toLocaleDateString("zh-CN");
  const gainedToday = events
    .filter(
      (event) =>
        event.personId === personId &&
        event.affinityDelta &&
        new Date(event.createdAt).toLocaleDateString("zh-CN") === today,
    )
    .reduce((sum, event) => sum + Math.max(0, event.affinityDelta ?? 0), 0);
  const onTime =
    quest.deadline && Number.isFinite(Date.parse(quest.deadline))
      ? Date.now() <= Date.parse(quest.deadline)
      : false;
  const affinityDelta = Math.max(
    0,
    Math.min(8 - gainedToday, 3 + (onTime ? 1 : 0)),
  );
  return { vitalityDelta, affinityDelta, personId };
}

export function calculateVitality(
  quests: Quest[],
  memories: Memory[],
  events: GameEvent[],
) {
  const averageProgress = quests.length
    ? quests.reduce((sum, quest) => sum + quest.progress, 0) / quests.length
    : 0;
  const earned = events.reduce(
    (sum, event) => sum + (event.vitalityDelta ?? 0),
    0,
  );
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        38 +
          averageProgress * 0.28 +
          Math.min(30, earned) +
          Math.min(10, memories.length / 2),
      ),
    ),
  );
}

export function affinityLevel(value: number) {
  if (value >= 95) return "重要羁绊";
  if (value >= 80) return "亲近";
  if (value >= 60) return "信赖";
  if (value >= 40) return "熟悉";
  if (value >= 20) return "相识";
  return "陌生";
}
