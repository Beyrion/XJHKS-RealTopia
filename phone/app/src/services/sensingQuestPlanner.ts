import type { Memory, Person, Quest } from "../models";
import { modelHub } from "./modelHub";
import { isUsableMemory, memoryFactKey } from "../utils/socialMemory";
import { normalizeQuest, questLifecycle } from "../utils/questEvidence";
import {
  compactUtterance,
  decideTask,
  semanticOverlap,
  stableKey,
} from "../utils/taskGate";
import {
  SENSING_QUEST_SYSTEM,
  sensingQuestUserPrompt,
} from "../utils/sensingQuestPrompt";
import { sensingTranscriptSegments } from "../utils/sensingTranscript";

export interface SensingQuestContext {
  quests: Quest[];
  memories: Memory[];
  people: Person[];
}

function explicitQuote(quote: string, transcript: string) {
  const isRequest = (text: string) =>
    ["create", "candidate"].includes(decideTask(text).kind);
  if (isRequest(quote)) return true;
  if (quote.split(/[。！？!?；;\n]+/).some(isRequest)) return true;
  // A valid excerpt can omit "please" while the same sentence contains it.
  // Do not borrow a request from a different sentence or anonymous tiny quote.
  const excerpt = quote.replace(/[。！？!?；;\n]+$/g, "").trim();
  return (
    excerpt.length >= 6 &&
    transcript
      .split(/[。！？!?；;\n]+/)
      .some(
        (sentence) =>
          sentence.length <= 440 &&
          sentence.includes(excerpt) &&
          isRequest(sentence),
      )
  );
}

export function sensingQuestInput(
  transcript: string,
  context: SensingQuestContext,
  now = Date.now(),
) {
  const text = transcript.trim().slice(-6000);
  const namedPeople = new Set(
    context.people
      .filter((p) =>
        [p.name, ...(p.aliases ?? [])].some((name) => text.includes(name)),
      )
      .map((p) => p.id),
  );
  const families = new Map<string, Memory>();
  const deletedFamilies = new Set<string>();
  for (const memory of context.memories) {
    const key = memoryFactKey(memory),
      old = families.get(key);
    if (memory.status === "deleted") deletedFamilies.add(key);
    if (
      !old ||
      (memory.revision ?? 1) > (old.revision ?? 1) ||
      ((memory.revision ?? 1) === (old.revision ?? 1) &&
        (memory.observedAt ?? "") > (old.observedAt ?? ""))
    )
      families.set(key, memory);
  }
  const memories = [...families.values()]
    .filter((m) => {
      const subjects =
        m.subjectPersonIds ??
        m.personIds ??
        (m.speakerPersonId ? [m.speakerPersonId] : []);
      return (
        !deletedFamilies.has(memoryFactKey(m)) &&
        isUsableMemory(m, now) &&
        (m.kind !== "person" || subjects.length > 0) &&
        (!subjects.length ||
          subjects.some((id) => namedPeople.has(id) || id === "player"))
      );
    })
    .map((m) => ({ m, overlap: semanticOverlap(text, m.summary ?? m.title) }))
    .filter(
      ({ m, overlap }) =>
        overlap >= 2 ||
        (
          m.subjectPersonIds ??
          m.personIds ??
          (m.speakerPersonId ? [m.speakerPersonId] : [])
        ).some((id) => namedPeople.has(id)),
    )
    .sort(
      (a, b) =>
        b.overlap - a.overlap ||
        (b.m.observedAt ?? "").localeCompare(a.m.observedAt ?? ""),
    )
    .slice(0, 8)
    .map(({ m }) => ({
      id: m.id,
      summary: (m.summary ?? m.title).slice(0, 240),
      kind: m.memoryKind ?? m.kind,
      confirmed: m.confirmed === true,
    }));
  return {
    transcript: text,
    transcriptSegments: sensingTranscriptSegments(text),
    memories,
    existingTasks: context.quests
      .filter((q) => !q.demo)
      .slice(0, 32)
      .map((q) => ({
        id: q.id,
        title: q.title,
        action: q.realTitle ?? q.title,
        lifecycle: questLifecycle(q),
      })),
  };
}

function textField(value: unknown, max: number) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

export function parseSensingQuests(
  raw: string,
  input: ReturnType<typeof sensingQuestInput>,
  sessionId: number,
  model: string,
  now = Date.now(),
): Quest[] {
  let parsed;
  try {
    parsed = JSON.parse(
      raw
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, ""),
    );
  } catch {
    throw new Error("大模型任务格式无效：不是有效 JSON");
  }
  if (
    !Array.isArray(parsed?.tasks) ||
    parsed.tasks.length < 1 ||
    parsed.tasks.length > 3
  )
    throw new Error("大模型任务格式无效：需要1至3项任务");
  const allowedMemories = new Set(input.memories.map((m) => m.id));
  const groups = new Set(["日常委托", "支线任务", "主线任务", "团队挑战"]);
  const seen = new Set<string>();
  const result: Quest[] = [];
  const rejected = new Map<string, number>();
  const reject = (reason: string) =>
    rejected.set(reason, (rejected.get(reason) ?? 0) + 1);
  for (const value of parsed.tasks) {
    if (!value || typeof value !== "object") {
      reject("字段格式错误");
      continue;
    }
    const title = textField(value.title, 32),
      action = textField(value.action, 64),
      description = textField(value.description, 100);
    const acceptance = textField(value.acceptanceCriteria, 140);
    const steps = Array.isArray(value.steps)
      ? value.steps
          .map((s: unknown) => textField(s, 64))
          .filter(Boolean)
          .slice(0, 3)
      : [];
    if (!title || !action || !description || !acceptance || !steps.length) {
      reject("任务字段不完整");
      continue;
    }
    if (
      !groups.has(value.group) ||
      !["explicit", "follow_up"].includes(value.basis)
    ) {
      reject("任务分类无效");
      continue;
    }
    const segment =
      typeof value.evidenceSegmentId === "string"
        ? input.transcriptSegments.find((s) => s.id === value.evidenceSegmentId)
        : undefined;
    if (
      !segment ||
      !segment.text ||
      segment.text.length > 220 ||
      !input.transcript.includes(segment.text)
    ) {
      reject("转写片段引用无效");
      continue;
    }
    // Evidence is copied locally, never retyped or corrected by the model.
    const quote = segment.text;
    // The legacy verb/intent gate is conservative, not an LLM eligibility gate.
    // Unknown natural actions still become user-confirmed follow-up candidates;
    // never invent an explicit request, assignment or completion from that gap.
    const extracted =
      value.basis === "explicit" && explicitQuote(quote, input.transcript);
    if (
      !Array.isArray(value.memoryIds) ||
      value.memoryIds.some(
        (id: unknown) => typeof id !== "string" || !allowedMemories.has(id),
      )
    ) {
      reject("记忆引用无效");
      continue;
    }
    const actionKey = compactUtterance(action).toLowerCase();
    if (
      seen.has(actionKey) ||
      input.existingTasks.some(
        (q) => compactUtterance(q.action).toLowerCase() === actionKey,
      )
    ) {
      reject("与已有任务重复");
      continue;
    }
    seen.add(actionKey);
    const dedupeKey = `session-llm-task:${sessionId}:${stableKey(actionKey)}`;
    result.push(
      normalizeQuest({
        id: `task-${stableKey(dedupeKey)}`,
        group: value.group,
        title,
        displayTitle: title,
        realTitle: action,
        generationKind: extracted ? "extracted" : "suggested",
        generationModel: model,
        generationMemoryIds: [...new Set<string>(value.memoryIds)],
        body: description,
        meta: "本轮对话 · 待确认",
        steps,
        acceptanceCriteria: acceptance,
        source: "glasses",
        lifecycle: "candidate",
        status: "inbox",
        priority: "普通",
        progress: 0,
        category: "general",
        reward: "完成后记录一次行动进展",
        dedupeKey,
        createdAt: new Date(now).toISOString(),
        candidateExpiresAt: new Date(now + 30 * 60_000).toISOString(),
        sourceEvidence: {
          sourceId: `session:${sessionId}`,
          segmentId: segment.id,
          excerpt: quote,
          speakerPersonId: null,
          mentionedPersonIds: [],
        },
      }),
    );
  }
  if (!result.length)
    throw new Error(
      `大模型未返回有本轮对话依据的有效任务（${[...rejected].map(([reason, count]) => `${reason} ${count} 项`).join("；")}）`,
    );
  return result;
}

/** No deterministic/local template fallback: failure is visible and retryable. */
export async function planSensingQuests(
  transcript: string,
  sessionId: number,
  context: SensingQuestContext,
) {
  const input = sensingQuestInput(transcript, context);
  if (!input.transcript) return [];
  const response = await modelHub.completeCloud({
    purpose: "task-planning",
    system: SENSING_QUEST_SYSTEM,
    prompt: sensingQuestUserPrompt(input),
    json: true,
    timeoutMs: 20_000,
    maxCompletionTokens: 3000,
    fast: true,
    temperature: 0.3,
  });
  return parseSensingQuests(response.text, input, sessionId, response.model);
}
