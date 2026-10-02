import type { Quest } from "../models";

/**
 * First-run Quest records. They are merged into the persisted Quest store by
 * storage.loadQuests, so every screen and the glasses HUD consumes the same
 * mutable data instead of maintaining a presentation-only demo list.
 */
export const starterQuests: Quest[] = [
  {
    id: "seed-cvpr-figure",
    group: "主线任务",
    title: "星图绘境 · CVPR 万象图卷",
    meta: "本周 · 论文工坊",
    body: "把 CVPR 论文的核心方法与贡献绘成一张清晰、完整、可投稿的研究图卷。",
    priority: "首要",
    progress: 0,
    steps: ["梳理论文核心贡献", "绘制方法总览图", "统一视觉并导出终稿"],
    reward: "纪念品 · 星绘灵笔",
    person: "老孙",
    personId: "老孙",
    assignerPersonId: "老孙",
    category: "creative",
    status: "active",
    source: "seed",
    createdAt: "2026-08-14T00:00:00.000Z",
  },
  {
    id: "seed-daily-fitness",
    group: "每日委托",
    title: "梦想成为肌肉男计划 · 第二期",
    meta: "每日 · 训练营地",
    body: "在忙碌的研究日程中保留一段稳定训练，让体力与专注一同成长。",
    priority: "每日",
    progress: 0,
    steps: ["完成今日热身", "完成主训练", "拉伸并记录训练"],
    reward: "纪念品 · 赤铁哑铃",
    person: "老孙、老陈",
    personId: "老孙",
    assignerPersonId: "老孙",
    category: "health",
    status: "active",
    source: "seed",
    createdAt: "2026-08-14T00:01:00.000Z",
  },
  {
    id: "seed-weekly-cooking",
    group: "每周任务",
    title: "胡闹厨房 · 本周料理远征",
    meta: "每周一次 · 秘密厨房",
    body: "亲手完成一次本周料理，在城市与网络中收齐食材、器具和配方。",
    priority: "本周",
    progress: 0,
    steps: ["去奥乐齐狩猎", "隐藏电煮锅", "收集散落小红书的食谱"],
    reward: "纪念品 · 冒火平底锅雕塑",
    person: "老陈",
    personId: "老陈",
    assignerPersonId: "老陈",
    category: "home",
    status: "active",
    source: "seed",
    createdAt: "2026-08-14T00:02:00.000Z",
  },
];

export function mergeStarterQuests(quests: Quest[]) {
  const result = [...quests];
  for (const seed of starterQuests) {
    const index = result.findIndex((quest) => quest.id === seed.id);
    if (index < 0) {
      result.push(structuredClone(seed));
      continue;
    }
    const current = result[index];
    result[index] = {
      ...current,
      ...structuredClone(seed),
      progress: current.progress,
      status: current.status,
      createdAt: current.createdAt ?? seed.createdAt,
      completedAt: current.completedAt,
    };
  }
  return result;
}
