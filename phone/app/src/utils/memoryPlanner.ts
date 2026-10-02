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
    | "replySuggestions"
    | "enhanceReplySuggestions"
    | "enhancementReason"
  >
> {
  people?: string[];
  tasks?: string[];
  memories?: unknown[];
  taskOperations?: unknown[];
  interactionEvents?: unknown[];
  speakerPersonId?: unknown;
  mentionedPersonIds?: unknown;
  replySuggestions?: unknown;
  enhanceReplySuggestions?: unknown;
  enhancementReason?: unknown;
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

function heuristicReplies(
  transcript: string,
): ConversationInsight["replySuggestions"] {
  const question = /[吗呢？?]|怎么|为什么|哪[里儿]|什么时候/.test(transcript);
  const concern = /难过|累|压力|担心|害怕|生病|不舒服|麻烦/.test(transcript);
  const request = /帮|需要|能不能|可以|记得|拜托/.test(transcript);
  const labels = concern
    ? ["听起来挺不容易的", "你想多说一点吗？", "有什么我能帮的？"]
    : request
      ? ["好，我记住了", "具体需要我怎么做？", "我们确认一下时间吧"]
      : question
        ? ["我认真想想", "你怎么看这件事？", "我还想听听细节"]
        : ["原来是这样", "后来怎么样了？", "这对你很重要吧？"];
  const intents: ConversationInsight["replySuggestions"][number]["intent"][] = [
    "warm",
    "curious",
    request ? "helpful" : "honest",
  ];
  return labels.map((label, index) => ({
    id: `reply_${index}`,
    label,
    intent: intents[index],
  }));
}

function validateReplies(
  raw: unknown,
  fallback: ConversationInsight["replySuggestions"],
): ConversationInsight["replySuggestions"] {
  if (!Array.isArray(raw)) return fallback;
  const allowed = new Set(["warm", "curious", "helpful", "honest", "exit"]);
  const replies = raw.flatMap((value, index) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    if (typeof item.label !== "string") return [];
    const label = compact(item.label, 18);
    if (!label) return [];
    const intent =
      typeof item.intent === "string" && allowed.has(item.intent)
        ? (item.intent as ConversationInsight["replySuggestions"][number]["intent"])
        : "honest";
    return [{ id: `reply_${index}`, label, intent }];
  });
  return replies.length === 3 ? replies : fallback;
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

export function localConversationInsight(
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
      /(下次|记得|需要|应该|准备|别忘|计划|帮我|麻烦|能不能|可以.{0,8}(?:吗|嘛)|发给我|今天|今晚|周[一二三四五六日天]|明天|后天)/.test(
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
            followUps[0].match(
              /(今天|今晚|明天|后天|周[一二三四五六日天])/,
            )?.[1] ?? "",
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
    replySuggestions: heuristicReplies(transcript),
    enhanceReplySuggestions: false,
    enhancementReason: "本地即时建议",
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
  const fallback = localConversationInsight(clean, context);
  const promptContext = {
    people: context.people,
    selectedPersonId: context.selectedPersonId ?? null,
    tasks: context.tasks.map((item) => ({
      id: item.id,
      title: item.title,
      personId: item.personId,
    })),
    recentConversation: (context.recentConversation ?? []).slice(-6),
    currentScene: context.sceneSummary ?? null,
    localReplySuggestions: fallback.replySuggestions,
  };
  const model = await modelHub.complete({
    purpose: "memory",
    prompt: `<transcript>${clean}</transcript>\n<context>${JSON.stringify(promptContext)}</context>\nReturn one JSON object matching this shape: {summary, story, speakerPersonId, mentionedPersonIds, personIds, taskIds, memories:[{kind,personId,summary,evidence,confidence}], taskOperations:[{operation,taskId,title,deadline,personId,steps,evidence,confidence}], interactionEvents:[{type,personId,evidence,confidence}], replySuggestions:[{label,intent}], enhanceReplySuggestions, enhancementReason}. replySuggestions must contain exactly 3 natural first-person Chinese utterances that the wearer can say next, each at most 18 Chinese characters; make them meaningfully different and grounded in the transcript. intent must be warm,curious,helpful,honest,or exit. Compare replySuggestions with context.localReplySuggestions. Set enhanceReplySuggestions=true only when the new suggestions are materially more specific, useful, or contextually correct enough to justify interrupting and replacing the suggestions already visible to the user; otherwise set it false. enhancementReason must briefly explain that display decision in Chinese. speakerPersonId is the current interlocutor; mentionedPersonIds are third parties only. selectedPersonId, when present, was explicitly confirmed by the user and must be the speaker. Allowed memory kinds: conversation,fact,preference,promise,relationship. Allowed task operations: create,update,progress,complete_candidate. Allowed interaction types: meaningful_conversation,gratitude,help,promise,conflict. Use only IDs from context. Do not invent a person.`,
    system:
      "You extract auditable durable memory and real task operations from a Chinese conversation. Distinguish the current interlocutor from third parties merely mentioned in speech. Every claim must include a short verbatim evidence span and confidence from 0 to 1. Do not assign relationship scores. Return JSON only.",
    json: true,
    timeoutMs: 7_000,
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
  const replySuggestions = validateReplies(
    raw.replySuggestions,
    fallback.replySuggestions,
  );
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
      replySuggestions,
      enhanceReplySuggestions: raw.enhanceReplySuggestions === true,
      enhancementReason:
        typeof raw.enhancementReason === "string"
          ? compact(raw.enhancementReason, 80)
          : "云端未说明增强理由",
    },
  };
}
