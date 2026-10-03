import type {
  Quest,
  TaskEvidence,
  TaskLifecycle,
  BadgeDefinition,
} from "../models";
import { stableKey } from "./taskGate";
export const QUEST_RULES = "evidence-v1";
export const badgeDefinitions: BadgeDefinition[] = [
  {
    id: "personal-creator",
    title: "创造者 · 人物记忆贡献",
    scope: "personal",
    eligibilityRule: "人物识别、历史记忆及错误关联核对的个人贡献验收",
    rulesVersion: QUEST_RULES,
    visualKind: "lighthouse",
  },
  {
    id: "dreamer",
    title: "造梦者",
    scope: "stage",
    eligibilityRule: "方案与分工验收",
    rulesVersion: QUEST_RULES,
    visualKind: "blueprint",
  },
  {
    id: "builder",
    title: "匠造者",
    scope: "personal",
    eligibilityRule: "工程里程碑验收",
    rulesVersion: QUEST_RULES,
    visualKind: "workshop",
  },
  {
    id: "creator",
    title: "创造者",
    scope: "stage",
    eligibilityRule: "试用、反馈、修改与复测全部验收",
    rulesVersion: QUEST_RULES,
    visualKind: "lighthouse",
  },
  {
    id: "storyteller",
    title: "讲述者",
    scope: "personal",
    eligibilityRule: "讲述与影像里程碑验收",
    rulesVersion: QUEST_RULES,
    visualKind: "stage",
  },
  {
    id: "young-creator",
    title: "青年创造者",
    scope: "team",
    eligibilityRule: "整段作品交付与展示验收；非官方奖项",
    rulesVersion: QUEST_RULES,
    visualKind: "lighthouse",
  },
];
export function questLifecycle(q: Quest): TaskLifecycle {
  return (
    q.lifecycle ??
    (q.status === "done"
      ? "completed"
      : q.status === "cancelled"
        ? "cancelled"
        : q.status === "blocked"
          ? "blocked"
          : q.status === "active"
            ? "active"
            : "accepted")
  );
}
export function isFormalQuest(q: Quest) {
  return !q.demo && !["candidate", "cancelled"].includes(questLifecycle(q));
}
export function normalizeQuest(input: Quest): Quest {
  const q = structuredClone(input);
  q.lifecycle = questLifecycle(q);
  q.revision ??= 1;
  q.realTitle ??= q.title;
  q.acceptanceCriteria ??= `确认「${q.realTitle}」结果符合要求`;
  q.evidence ??= [];
  q.progressEvents ??= [];
  q.badgeAwards ??= [];
  if (!q.stepRecords) {
    const count = q.steps.length;
    const legacyCompleted = Math.round(
      (Math.max(0, Math.min(100, q.progress)) * count) / 100,
    );
    q.stepRecords = q.steps.map((title, index) => {
      const id = `${q.id}:step:${index}`;
      const verified = index < legacyCompleted;
      if (verified)
        q.evidence!.push({
          id: `${id}:legacy`,
          taskId: q.id,
          stepId: id,
          sourceType: "legacy_import",
          sourceId: q.id,
          excerpt: "旧版保存的完成状态；原始证据未记录",
          observedAt: q.completedAt ?? q.createdAt ?? new Date(0).toISOString(),
          confidence: 1,
          verificationStatus: "verified",
          verifiedBy: "migration",
          dedupeKey: `${id}:legacy`,
        });
      return {
        id,
        title,
        status: verified ? "verified" : "pending",
        weight: 1,
        prerequisiteStepIds: [],
        acceptanceCriteria: `确认「${title}」已完成`,
        evidenceIds: verified ? [`${id}:legacy`] : [],
      };
    });
  }
  return q;
}
export function verifiedProgress(q: Quest) {
  const records = normalizeQuest(q).stepRecords!;
  const total = records.reduce((sum, s) => sum + Math.max(0, s.weight), 0);
  return total
    ? Math.round(
        (100 *
          records
            .filter((s) => s.status === "verified")
            .reduce((sum, s) => sum + Math.max(0, s.weight), 0)) /
          total,
      )
    : 0;
}
export function reconcileAwards(q: Quest): Quest {
  const result = normalizeQuest(q);
  const valid = questLifecycle(result) === "completed";
  result.badgeAwards = result.badgeAwards!.map((award) => ({
    ...award,
    status: valid ? "valid" : "revoked",
  }));
  if (valid && result.badgeDefinitionId && !result.demo) {
    const definition = badgeDefinitions.find(
      (b) => b.id === result.badgeDefinitionId,
    );
    if (definition) {
      const dedupeKey = `${result.id}:${definition.id}:${QUEST_RULES}`;
      const evidenceIds = [
        ...new Set([
          ...result
            .evidence!.filter((e) => e.verificationStatus === "verified")
            .map((e) => e.id),
          ...result.stepRecords!.flatMap((s) => s.evidenceIds),
        ]),
      ];
      const existing = result.badgeAwards.find(
        (award) => award.dedupeKey === dedupeKey,
      );
      if (existing) existing.evidenceIds = evidenceIds;
      else
        result.badgeAwards.push({
          id: `badge-${stableKey(dedupeKey)}`,
          definitionId: definition.id,
          title: definition.title,
          taskId: result.id,
          milestoneId: result.id,
          personIds:
            definition.scope === "personal"
              ? [result.ownerPersonId ?? "player"]
              : (result.participantIds ?? [result.ownerPersonId ?? "player"]),
          evidenceIds,
          awardedAt: result.completedAt!,
          rulesVersion: QUEST_RULES,
          dedupeKey,
          status: "valid",
        });
    }
  }
  return result;
}
export function recordEvidence(input: Quest, evidence: TaskEvidence): Quest {
  const q = normalizeQuest(input);
  if (
    evidence.taskId !== q.id ||
    q.evidence!.some((e) => e.dedupeKey === evidence.dedupeKey)
  )
    return q;
  q.evidence!.push(evidence);
  q.revision!++;
  return q;
}
export function verifyQuestStep(
  input: Quest,
  stepId: string,
  evidence: TaskEvidence,
  operation: "verify" | "undo" = "verify",
): Quest {
  let q = normalizeQuest(input);
  const step = q.stepRecords!.find((s) => s.id === stepId);
  if (!step) throw new Error("任务步骤不存在");
  const eventKey = `${evidence.dedupeKey}:${operation}`;
  if (q.progressEvents!.some((e) => e.dedupeKey === eventKey)) return q;
  if (operation === "verify") {
    if (["candidate", "cancelled", "blocked"].includes(questLifecycle(q)))
      throw new Error("请先接取或恢复任务");
    if (
      step.prerequisiteStepIds.some(
        (id) => q.stepRecords!.find((s) => s.id === id)?.status !== "verified",
      )
    )
      throw new Error("请先完成依赖步骤");
    if (
      evidence.taskId !== q.id ||
      evidence.stepId !== step.id ||
      evidence.verificationStatus !== "verified" ||
      !evidence.excerpt.trim() ||
      !evidence.verifiedBy ||
      !step.acceptanceCriteria.trim()
    )
      throw new Error("步骤需要可追溯的验收证据");
    q = recordEvidence(q, evidence);
    const target = q.stepRecords!.find((s) => s.id === stepId)!;
    target.status = "verified";
    target.completedAt = evidence.observedAt;
    target.evidenceIds = [...new Set([...target.evidenceIds, evidence.id])];
  } else {
    const revoked = new Set([stepId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const s of q.stepRecords!)
        if (
          !revoked.has(s.id) &&
          s.prerequisiteStepIds.some((id) => revoked.has(id))
        ) {
          revoked.add(s.id);
          changed = true;
        }
    }
    for (const s of q.stepRecords!)
      if (revoked.has(s.id)) {
        s.status = "pending";
        s.completedAt = undefined;
      }
    q.evidence = q.evidence!.map((e) =>
      e.stepId && revoked.has(e.stepId) && e.verificationStatus === "verified"
        ? { ...e, verificationStatus: "revoked" }
        : e,
    );
  }
  q.revision!++;
  q.progress = verifiedProgress(q);
  q.completedAt = undefined;
  q.lifecycle = q.progress === 100 ? "ready_for_review" : "active";
  q.status = "active";
  q.progressEvents!.push({
    eventId: `progress-${stableKey(eventKey)}`,
    taskId: q.id,
    stepId,
    operation,
    evidenceIds: operation === "verify" ? [evidence.id] : [],
    recordedAt: evidence.observedAt,
    actor: evidence.verifiedBy ?? "player",
    rulesVersion: QUEST_RULES,
    dedupeKey: eventKey,
  });
  return reconcileAwards(q);
}
export function reviewQuest(
  input: Quest,
  all: Quest[],
  now = new Date().toISOString(),
): Quest {
  const q = normalizeQuest(input);
  if (questLifecycle(q) === "completed") return q;
  if (["candidate", "cancelled", "blocked"].includes(questLifecycle(q)))
    throw new Error("请先接取或恢复任务");
  if (
    !q.stepRecords!.length ||
    q.stepRecords!.some((s) => s.status !== "verified") ||
    !q.acceptanceCriteria?.trim()
  )
    throw new Error("必要步骤和最终验收条件尚未满足");
  if (
    [...(q.prerequisiteTaskIds ?? []), ...(q.requiredChildTaskIds ?? [])].some(
      (id) =>
        questLifecycle(
          all.find((t) => t.id === id) ?? { ...q, lifecycle: "blocked" },
        ) !== "completed",
    )
  )
    throw new Error("依赖任务或必要子任务尚未验收");
  const dedupeKey = `review:${q.id}:${q.revision}`;
  const finalEvidence: TaskEvidence = {
    id: `evidence-${stableKey(dedupeKey)}`,
    taskId: q.id,
    sourceType: "user_confirmation",
    sourceId: dedupeKey,
    excerpt: `最终验收确认：${q.acceptanceCriteria}`,
    observedAt: now,
    confidence: 1,
    verificationStatus: "verified",
    verifiedBy: "player",
    dedupeKey,
  };
  const result = recordEvidence(q, finalEvidence);
  result.lifecycle = "completed";
  result.status = "done";
  result.progress = 100;
  result.completedAt = now;
  result.progressEvents!.push({
    eventId: `progress-${stableKey(dedupeKey)}`,
    taskId: q.id,
    operation: "review",
    evidenceIds: [finalEvidence.id],
    recordedAt: now,
    actor: "player",
    rulesVersion: QUEST_RULES,
    dedupeKey,
  });
  return reconcileAwards(result);
}
export function reconcileQuestGraph(inputs: Quest[]): Quest[] {
  const quests = inputs.map(normalizeQuest);
  for (let pass = 0; pass < quests.length; pass++) {
    let changed = false;
    for (const q of quests) {
      if (
        q.prerequisiteTaskIds?.some(
          (id) =>
            questLifecycle(
              quests.find((t) => t.id === id) ?? { ...q, lifecycle: "blocked" },
            ) !== "completed",
        ) &&
        ["completed", "ready_for_review"].includes(questLifecycle(q))
      ) {
        q.lifecycle = "blocked";
        q.status = "blocked";
        q.completedAt = undefined;
        q.stepRecords = q.stepRecords!.map((s) => ({
          ...s,
          status: "pending",
          completedAt: undefined,
        }));
        q.evidence = q.evidence!.map((e) =>
          e.verificationStatus === "verified"
            ? { ...e, verificationStatus: "revoked" }
            : e,
        );
        q.progress = 0;
        Object.assign(q, reconcileAwards(q));
        changed = true;
      }
      if (!q.requiredChildTaskIds?.length) continue;
      for (const [index, id] of q.requiredChildTaskIds.entries()) {
        const step = q.stepRecords![index];
        if (!step) continue;
        const child = quests.find((t) => t.id === id);
        const verified = child && questLifecycle(child) === "completed";
        if ((step.status === "verified") !== !!verified) {
          step.status = verified ? "verified" : "pending";
          step.evidenceIds = verified
            ? child
                .evidence!.filter((e) => e.verificationStatus === "verified")
                .map((e) => e.id)
            : [];
          changed = true;
        }
      }
      q.progress = verifiedProgress(q);
      if (q.lifecycle === "completed" && q.progress < 100) {
        q.lifecycle = "active";
        q.status = "active";
        q.completedAt = undefined;
        Object.assign(q, reconcileAwards(q));
        changed = true;
      } else if (
        q.progress === 100 &&
        !["completed", "candidate", "cancelled"].includes(questLifecycle(q))
      )
        q.lifecycle = "ready_for_review";
    }
    if (!changed) break;
  }
  return quests;
}
export const lifecycleLabels: Record<TaskLifecycle, string> = {
  candidate: "待确认",
  accepted: "已接取",
  active: "进行中",
  blocked: "已暂停 / 有依赖",
  ready_for_review: "等待最终验收",
  completed: "已验收完成",
  cancelled: "已取消",
};
