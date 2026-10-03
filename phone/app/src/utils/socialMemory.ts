import type { Memory, Person, Quest, SocialPromptResult } from "../models";
import { semanticOverlap, stableKey, compactUtterance } from "./taskGate";
export function isUsableMemory(m: Memory, now = Date.now()) {
  return (
    (!m.status || m.status === "active") &&
    (!m.validUntil || Date.parse(m.validUntil) > now) &&
    (m.confidence ?? 0.7) >= 0.6
  );
}
export function memoryFactKey(m: Memory) {
  return (
    m.factKey ??
    stableKey(
      `${m.memoryKind ?? m.personMemoryKind ?? m.kind}:${[...(m.subjectPersonIds ?? m.personIds ?? [])].sort().join(",")}:${compactUtterance(m.summary ?? m.title)}`,
    )
  );
}
export function mergeMemoryRecords(
  current: Memory[],
  incoming: Memory[],
): Memory[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const raw of incoming) {
    const m = {
      ...raw,
      revision: raw.revision ?? 1,
      factKey: memoryFactKey(raw),
    };
    const existing = byId.get(m.id);
    if (
      existing &&
      (existing.status === "deleted" ||
        (existing.revision ?? 1) > (m.revision ?? 1) ||
        (existing.status === "superseded" &&
          m.status === "active" &&
          (m.revision ?? 1) <= (existing.revision ?? 1)))
    )
      continue;
    if (!existing) {
      const family = [...byId.values()].filter(
        (item) => memoryFactKey(item) === m.factKey,
      );
      if (family.some((item) => item.status === "deleted")) continue;
      const latest = family.sort(
        (a, b) => (b.revision ?? 1) - (a.revision ?? 1),
      )[0];
      if (latest?.confirmed && !m.confirmed) {
        m.status = "pending";
      } else if (
        latest &&
        latest.status === "active" &&
        (latest.dedupeKey === m.dedupeKey ||
          compactUtterance(latest.summary ?? latest.title) ===
            compactUtterance(m.summary ?? m.title))
      )
        continue;
      if (latest && m.confirmed && (m.revision ?? 1) > (latest.revision ?? 1))
        byId.set(latest.id, { ...latest, status: "superseded" });
    }
    byId.set(m.id, m);
  }
  return [...byId.values()].sort((a, b) =>
    (b.observedAt ?? "").localeCompare(a.observedAt ?? ""),
  );
}
export function reviseMemory(
  memories: Memory[],
  id: string,
  text: string,
  now = new Date().toISOString(),
) {
  const old = memories.find((m) => m.id === id);
  if (!old || old.status === "deleted" || !text.trim()) return memories;
  const revision = (old.revision ?? 1) + 1;
  const next: Memory = {
    ...old,
    id: `${old.id}:v${revision}`,
    title: text.trim().slice(0, 48),
    summary: text.trim(),
    evidence: `用户纠正：${text.trim()}`,
    sourceType: "user_confirmation",
    sourceId: `memory-edit:${id}:${revision}`,
    observedAt: now,
    revision,
    confirmed: true,
    status: "active",
    supersedesId: old.id,
    factKey: memoryFactKey(old),
  };
  return [
    ...memories.map((m) =>
      m.id === old.id ? { ...m, status: "superseded" as const } : m,
    ),
    next,
  ];
}
export function deleteMemoryFamily(memories: Memory[], id: string) {
  const target = memories.find((m) => m.id === id);
  if (!target) return memories;
  return memories.map((m) =>
    memoryFactKey(m) === memoryFactKey(target)
      ? {
          id: m.id,
          time: m.time,
          title: "已删除",
          meta: "仅保留去重指纹，防止旧请求恢复",
          kind: m.kind,
          factKey: memoryFactKey(m),
          status: "deleted" as const,
          revision: (m.revision ?? 1) + 1,
        }
      : m,
  );
}
export function retrieveSocialMemories(
  memories: Memory[],
  personId: string | null,
  transcript: string,
  quests: Quest[],
  activeQuestId?: string | null,
  now = Date.now(),
) {
  if (!personId) return [];
  const shared = new Set(
    quests
      .filter(
        (q) =>
          q.id === activeQuestId ||
          q.personId === personId ||
          q.participantIds?.includes(personId),
      )
      .map((q) => q.id),
  );
  const ranked = memories
    .filter(
      (m) =>
        isUsableMemory(m, now) &&
        m.memoryKind !== "working_context" &&
        (!["commitment", "sharedProject", "userGoal"].includes(
          m.memoryKind ?? "",
        ) ||
          !m.taskIds?.length ||
          m.taskIds.some(
            (id) => quests.find((q) => q.id === id)?.lifecycle !== "cancelled",
          )) &&
        ((m.subjectPersonIds ?? m.personIds ?? []).includes(personId) ||
          (m.memoryKind === "sharedProject" &&
            m.taskIds?.some((id) => shared.has(id)))),
    )
    .map((m) => ({
      m,
      score:
        semanticOverlap(transcript, m.summary ?? m.title) +
        (m.personMemoryKind === "promise" || m.memoryKind === "commitment"
          ? 5
          : 0) +
        (m.taskIds?.some((id) => shared.has(id)) ? 4 : 0) +
        (m.confirmed ? 2 : 0),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.m.observedAt ?? "").localeCompare(a.m.observedAt ?? ""),
    );
  let budget = 1800;
  return ranked
    .filter(({ m }) => {
      budget -= (m.summary ?? m.title).length + (m.evidence ?? "").length;
      return budget >= 0;
    })
    .slice(0, 6)
    .map(({ m }) => m);
}
export function buildSocialPrompt(
  personId: string | null,
  transcript: string,
  memories: Memory[],
  quests: Quest[],
  activeQuestId?: string | null,
  now = Date.now(),
): SocialPromptResult {
  const used = retrieveSocialMemories(
    memories,
    personId,
    transcript,
    quests,
    activeQuestId,
    now,
  );
  const first = used[0];
  const summary = first?.summary ?? first?.title ?? "";
  let labels = ["上次的约定现在怎么样了？", "我们确认下接下来怎么做", "我想听听你现在的想法"];
  if (/反馈|试用|没看懂|结算|复测/.test(summary))
    labels = [
      "上次没看懂的，我们重走一遍",
      "我们找没体验过的人复测",
      "你觉得这次哪里更清楚了？",
    ];
  else if (/答应|约定|承诺/.test(summary) || first?.memoryKind === "commitment")
    labels = ["我们核对一下上次的约定", "一起看看实际完成了什么", "我们商量下接下来怎么做"];
  else if (/卡点|故障|联调|连接/.test(summary))
    labels = ["我们先复现上次那个卡点", "我们一起看最新测试记录", "这轮我们先验证哪些问题？"];
  return {
    matchedPersonId: personId,
    reminder: summary.slice(0, 90),
    suggestions: used.length
      ? labels.map((label, i) => ({
          id: `memory-reply-${i}`,
          label: label.slice(0, 18),
          intent: i === 0 ? "helpful" : "curious",
          usedMemoryIds: used.map((m) => m.id),
        }))
      : [],
    usedMemoryIds: used.map((m) => m.id),
    evidenceRefs: used.map((m) => ({
      memoryId: m.id,
      sourceId: m.sourceId ?? String(m.sourceRecordingId ?? m.id),
      excerpt: m.evidence ?? m.summary ?? m.title,
      observedAt: m.observedAt ?? "未记录",
    })),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 45000).toISOString(),
    reasonSummary: used.length
      ? "引用当前人物/共同任务的有效历史；未使用已删除或过期记录"
      : "没有安全可用的历史",
    sourceTier: "edge",
  };
}
export function makeEncounterMemory(
  person: Person,
  sessionId: string,
  now = Date.now(),
): Memory {
  const key = `encounter:${sessionId}:${person.id}:${Math.floor(now / 600000)}`;
  return {
    id: `encounter-${stableKey(key)}`,
    time: new Date(now).toLocaleTimeString("zh-CN"),
    title: `再次遇见 ${person.name}`,
    meta: "人物识别；不推断讲话者",
    kind: "person",
    memoryKind: "working_context",
    personIds: [person.id],
    subjectPersonIds: [person.id],
    sourceType: "face",
    sourceId: key,
    observedAt: new Date(now).toISOString(),
    validUntil: new Date(now + 600000).toISOString(),
    confidence: 1,
    status: "active",
    dedupeKey: key,
  };
}
