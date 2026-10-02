import type {
  ConversationInsight,
  ExtractedInteractionEvent,
  ExtractedPersonMemory,
  ExtractedTaskOperation,
  MemoryContext,
  ModelResponse,
} from "../models";
import { modelHub } from "../services/modelHub";

interface RawInsight extends Partial<
  Omit<
    ConversationInsight,
    | "memories"
    | "taskOperations"
    | "interactionEvents"
    | "speakerPersonId"
    | "mentionedPersonIds"
  >
> {
  people?: string[];
  tasks?: string[];
  memories?: unknown[];
  taskOperations?: unknown[];
  interactionEvents?: unknown[];
  speakerPersonId?: unknown;
  mentionedPersonIds?: unknown;
}

const memoryKinds = new Set([
  "conversation",
  "fact",
  "preference",
  "promise",
  "relationship",
]);
const taskOperations = new Set([
  "create",
  "update",
  "progress",
  "complete_candidate",
]);
const interactionTypes = new Set([
  "meaningful_conversation",
  "gratitude",
  "help",
  "promise",
  "conflict",
]);

function parseJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("model did not return JSON");
  return JSON.parse(text.slice(start, end + 1)) as RawInsight;
}

function compact(value: string, length: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, length);
}

function confidence(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function tokens(value: string) {
  const result = new Set<string>();
  const clean = value
    .toLowerCase()
    .replace(/[的了和与把在去要想请将一个这个我们你们他们]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ");
  for (const word of clean.split(/\s+/).filter(Boolean)) {
    result.add(word);
    for (let index = 0; index < word.length - 1; index++)
      result.add(word.slice(index, index + 2));
  }
  return result;
}

function validIds(values: unknown, allowed: Set<string>) {
  return Array.isArray(values)
    ? [
        ...new Set(
          values.filter(
            (value): value is string =>
              typeof value === "string" && allowed.has(value),
          ),
        ),
      ]
    : [];
}

function heuristic(
  transcript: string,
  context: MemoryContext,
): ConversationInsight {
  const explicitlyMentioned = context.people
    .filter((item) => transcript.includes(item.name))
    .map((item) => item.id);
  const selectedPersonId = context.people.some(
    (item) => item.id === context.selectedPersonId,
  )
    ? (context.selectedPersonId ?? null)
    : null;
  const speakerPersonId =
    selectedPersonId ??
    (explicitlyMentioned.length === 1 ? explicitlyMentioned[0] : null);
  const mentionedPersonIds = explicitlyMentioned.filter(
    (id) => id !== speakerPersonId,
  );
  const personIds = [
    ...new Set([
      ...(speakerPersonId ? [speakerPersonId] : []),
      ...explicitlyMentioned,
    ]),
  ];
  const source = tokens(transcript);
  const ranked = context.tasks
    .map((task) => {
      const target = tokens(`${task.title} ${task.body}`);
      let score = personIds.includes(task.personId ?? "") ? 3 : 0;
      for (const token of source)
        if (token.length > 1 && target.has(token)) score++;
      return { id: task.id, score };
    })
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.id);
  const sentences = transcript
    .split(/[。！？!?；;]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const followUps = sentences
    .filter((item) =>
      /(下次|记得|需要|应该|准备|别忘|计划|帮我|麻烦|周[一二三四五六日天]|明天|后天)/.test(
        item,
      ),
    )
    .slice(0, 4);
  const memories: ExtractedPersonMemory[] = (
    speakerPersonId ? [speakerPersonId] : personIds
  ).map((personId) => ({
    kind: /答应|承诺|一定会|交给我/.test(transcript)
      ? "promise"
      : "conversation",
    personId,
    summary: compact(sentences.slice(0, 2).join("。") || transcript, 100),
    evidence: compact(transcript, 240),
    confidence: 0.7,
  }));
  const interactions: ExtractedInteractionEvent[] = [];
  for (const personId of speakerPersonId ? [speakerPersonId] : []) {
    if (compact(transcript, 500).length >= 8)
      interactions.push({
        type: "meaningful_conversation",
        personId,
        evidence: compact(transcript, 180),
        confidence: 0.7,
      });
    if (/谢谢|多谢|辛苦了|做得好|太棒了/.test(transcript))
      interactions.push({
        type: "gratitude",
        personId,
        evidence: compact(transcript, 180),
        confidence: 0.75,
      });
    if (/答应|承诺|一定会|交给我|我来处理/.test(transcript))
      interactions.push({
        type: "promise",
        personId,
        evidence: compact(transcript, 180),
        confidence: 0.75,
      });
  }
  const taskOps: ExtractedTaskOperation[] = followUps.length
    ? [
        {
          operation: ranked.length ? "update" : "create",
          taskId: ranked[0] ?? null,
          title: compact(followUps[0], 48),
          deadline:
            followUps[0].match(/(今天|明天|后天|周[一二三四五六日天])/)?.[1] ??
            "",
          personId: speakerPersonId,
          steps: followUps.map((item) => compact(item, 80)),
          evidence: compact(followUps.join("。"), 240),
          confidence: 0.68,
        },
      ]
    : [];
  return {
    summary: compact(sentences[0] ?? transcript, 80),
    story: compact(sentences.slice(0, 3).join("。"), 220),
    personIds,
    speakerPersonId,
    mentionedPersonIds,
    taskIds: ranked,
    affinityDelta: 0,
    followUps,
    memories,
    taskOperations: taskOps,
    interactionEvents: interactions,
  };
}

function validateMemories(raw: unknown, context: MemoryContext) {
  if (!Array.isArray(raw)) return [];
  const people = new Set(context.people.map((item) => item.id));
  return raw.flatMap((value): ExtractedPersonMemory[] => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    if (
      typeof item.kind !== "string" ||
      !memoryKinds.has(item.kind) ||
      typeof item.personId !== "string" ||
      !people.has(item.personId) ||
      typeof item.summary !== "string" ||
      confidence(item.confidence) < 0.6
    )
      return [];
    return [
      {
        kind: item.kind as ExtractedPersonMemory["kind"],
        personId: item.personId,
        summary: compact(item.summary, 120),
        evidence:
          typeof item.evidence === "string" ? compact(item.evidence, 280) : "",
        confidence: confidence(item.confidence),
      },
    ];
  });
}

function validateTaskOperations(raw: unknown, context: MemoryContext) {
  if (!Array.isArray(raw)) return [];
  const people = new Set(context.people.map((item) => item.id));
  const tasks = new Set(context.tasks.map((item) => item.id));
  return raw.flatMap((value): ExtractedTaskOperation[] => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    if (
      typeof item.operation !== "string" ||
      !taskOperations.has(item.operation) ||
      typeof item.title !== "string" ||
      !item.title.trim() ||
      confidence(item.confidence) < 0.65
    )
      return [];
    const operation = item.operation as ExtractedTaskOperation["operation"];
    const taskId =
      typeof item.taskId === "string" && tasks.has(item.taskId)
        ? item.taskId
        : null;
    if (operation !== "create" && !taskId) return [];
    return [
      {
        operation,
        taskId,
        title: compact(item.title, 48),
        deadline:
          typeof item.deadline === "string" ? compact(item.deadline, 40) : "",
        personId:
          typeof item.personId === "string" && people.has(item.personId)
            ? item.personId
            : context.selectedPersonId && people.has(context.selectedPersonId)
              ? context.selectedPersonId
              : null,
        steps: Array.isArray(item.steps)
          ? item.steps
              .filter((step): step is string => typeof step === "string")
              .map((step) => compact(step, 80))
              .filter(Boolean)
              .slice(0, 6)
          : [],
        evidence:
          typeof item.evidence === "string" ? compact(item.evidence, 280) : "",
        confidence: confidence(item.confidence),
      },
    ];
  });
}

function validateInteractions(raw: unknown, context: MemoryContext) {
  if (!Array.isArray(raw)) return [];
  const people = new Set(context.people.map((item) => item.id));
  return raw.flatMap((value): ExtractedInteractionEvent[] => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    if (
      typeof item.type !== "string" ||
      !interactionTypes.has(item.type) ||
      typeof item.personId !== "string" ||
      !people.has(item.personId) ||
      confidence(item.confidence) < 0.7
    )
      return [];
    return [
      {
        type: item.type as ExtractedInteractionEvent["type"],
        personId: item.personId,
        evidence:
          typeof item.evidence === "string" ? compact(item.evidence, 240) : "",
        confidence: confidence(item.confidence),
      },
    ];
  });
}

export async function analyzeConversation(
  transcript: string,
  context: MemoryContext,
): Promise<{ insight: ConversationInsight; model: ModelResponse }> {
  const clean = compact(transcript, 6000);
  if (!clean) throw new Error("transcript is empty");
  const fallback = heuristic(clean, context);
  const promptContext = {
    people: context.people,
    selectedPersonId: context.selectedPersonId ?? null,
    tasks: context.tasks.map((item) => ({
      id: item.id,
      title: item.title,
      personId: item.personId,
    })),
  };
  const model = await modelHub.complete({
    purpose: "memory",
    prompt: `<transcript>${clean}</transcript>\n<context>${JSON.stringify(promptContext)}</context>\nReturn one JSON object matching this shape: {summary, story, speakerPersonId, mentionedPersonIds, personIds, taskIds, memories:[{kind,personId,summary,evidence,confidence}], taskOperations:[{operation,taskId,title,deadline,personId,steps,evidence,confidence}], interactionEvents:[{type,personId,evidence,confidence}]}. speakerPersonId is the current interlocutor; mentionedPersonIds are third parties only. selectedPersonId, when present, was explicitly confirmed by the user and must be the speaker. Allowed memory kinds: conversation,fact,preference,promise,relationship. Allowed task operations: create,update,progress,complete_candidate. Allowed interaction types: meaningful_conversation,gratitude,help,promise,conflict. Use only IDs from context. Do not invent a person.`,
    system:
      "You extract auditable durable memory and real task operations from a Chinese conversation. Distinguish the current interlocutor from third parties merely mentioned in speech. Every claim must include a short verbatim evidence span and confidence from 0 to 1. Do not assign relationship scores. Return JSON only.",
    json: true,
  });
  let raw: RawInsight;
  try {
    raw = parseJson(model.text);
  } catch {
    return { insight: fallback, model };
  }
  const people = validIds(
    raw.personIds ?? raw.people,
    new Set(context.people.map((item) => item.id)),
  );
  const tasks = validIds(
    raw.taskIds ?? raw.tasks,
    new Set(context.tasks.map((item) => item.id)),
  );
  const memories = validateMemories(raw.memories, context);
  const operations = validateTaskOperations(raw.taskOperations, context);
  const interactions = validateInteractions(raw.interactionEvents, context);
  const allowedPeople = new Set(context.people.map((item) => item.id));
  const selectedPersonId =
    context.selectedPersonId && allowedPeople.has(context.selectedPersonId)
      ? context.selectedPersonId
      : null;
  const modelSpeaker =
    typeof raw.speakerPersonId === "string" &&
    allowedPeople.has(raw.speakerPersonId)
      ? raw.speakerPersonId
      : null;
  const speakerPersonId =
    selectedPersonId ?? modelSpeaker ?? fallback.speakerPersonId;
  const mentionedPersonIds = validIds(
    raw.mentionedPersonIds,
    allowedPeople,
  ).filter((id) => id !== speakerPersonId);
  const speakerInteractions = speakerPersonId
    ? interactions.filter((item) => item.personId === speakerPersonId)
    : [];
  const resolvedPeople = [
    ...new Set([
      ...(speakerPersonId ? [speakerPersonId] : []),
      ...mentionedPersonIds,
      ...people,
      ...memories.map((item) => item.personId),
      ...interactions.map((item) => item.personId),
      ...operations.flatMap((item) => (item.personId ? [item.personId] : [])),
    ]),
  ];
  return {
    model,
    insight: {
      summary:
        typeof raw.summary === "string"
          ? compact(raw.summary, 80)
          : fallback.summary,
      story:
        typeof raw.story === "string"
          ? compact(raw.story, 220)
          : fallback.story,
      personIds: resolvedPeople.length ? resolvedPeople : fallback.personIds,
      speakerPersonId,
      mentionedPersonIds: mentionedPersonIds.length
        ? mentionedPersonIds
        : fallback.mentionedPersonIds,
      taskIds: tasks.length ? tasks : fallback.taskIds,
      affinityDelta: 0,
      followUps: fallback.followUps,
      memories: memories.length ? memories : fallback.memories,
      taskOperations: operations.length ? operations : fallback.taskOperations,
      interactionEvents: speakerInteractions.length
        ? speakerInteractions
        : fallback.interactionEvents,
    },
  };
}
