import type {
  ConversationInsight,
  MemoryContext,
  ModelResponse,
} from "../models";
import { modelHub } from "../services/modelHub";

interface RawInsight extends Partial<ConversationInsight> {
  people?: string[];
  tasks?: string[];
}

function parseJson(text: string) {
  const start = text.indexOf("{"),
    end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("model did not return JSON");
  return JSON.parse(text.slice(start, end + 1)) as RawInsight;
}
function compact(value: string, length: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, length);
}
function tokens(value: string) {
  const result = new Set<string>(),
    clean = value
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
  const personIds = context.people
      .filter((item) => transcript.includes(item.name))
      .map((item) => item.id),
    source = tokens(transcript),
    ranked = context.tasks
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
      .filter(Boolean),
    followUps = sentences
      .filter((item) =>
        /(下次|记得|需要|应该|准备|别忘|计划|周[一二三四五六日天]|明天|后天)/.test(
          item,
        ),
      )
      .slice(0, 4);
  return {
    summary: compact(sentences[0] ?? transcript, 48),
    story: compact(sentences.slice(0, 3).join("。"), 180),
    personIds,
    taskIds: ranked,
    affinityDelta: personIds.length ? 2 : 0,
    followUps,
  };
}

export async function analyzeConversation(
  transcript: string,
  context: MemoryContext,
): Promise<{ insight: ConversationInsight; model: ModelResponse }> {
  const clean = compact(transcript, 6000);
  if (!clean) throw new Error("transcript is empty");
  const fallback = heuristic(clean, context),
    promptContext = {
      people: context.people,
      tasks: context.tasks.map((item) => ({
        id: item.id,
        title: item.title,
        personId: item.personId,
      })),
    };
  const model = await modelHub.complete({
    purpose: "memory",
    prompt: `<transcript>${clean}</transcript>\n<context>${JSON.stringify(promptContext)}</context>\nReturn JSON with summary, story, personIds, taskIds, affinityDelta (-2..5), and followUps. Use only IDs from context.`,
    system:
      "You extract durable RPG memory from a real conversation. Link only clearly supported people and tasks. Return JSON only.",
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
    ),
    tasks = validIds(
      raw.taskIds ?? raw.tasks,
      new Set(context.tasks.map((item) => item.id)),
    ),
    followUps = Array.isArray(raw.followUps)
      ? raw.followUps
          .filter(
            (item): item is string =>
              typeof item === "string" && item.trim().length > 0,
          )
          .map((item) => compact(item, 80))
          .slice(0, 5)
      : fallback.followUps;
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
      personIds: people.length ? people : fallback.personIds,
      taskIds: tasks.length ? tasks : fallback.taskIds,
      affinityDelta:
        typeof raw.affinityDelta === "number"
          ? Math.max(-2, Math.min(5, Math.round(raw.affinityDelta)))
          : fallback.affinityDelta,
      followUps,
    },
  };
}
