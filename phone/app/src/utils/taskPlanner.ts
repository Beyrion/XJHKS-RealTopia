import type { ModelResponse, PlannedQuest, PlanningContext } from "../models";
import { modelHub } from "../services/modelHub";

interface RawPlan extends Partial<Omit<PlannedQuest, "priority">> {
  priority?: string;
  person?: string | null;
}

function parseJson(text: string) {
  const start = text.indexOf("{"),
    end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("model did not return JSON");
  return JSON.parse(text.slice(start, end + 1)) as RawPlan;
}

function tokens(value: string) {
  const clean = value
      .toLowerCase()
      .replace(/[的了和与把在去要想请将一个这个进行完成]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " "),
    result = new Set<string>();
  for (const word of clean.split(/\s+/).filter(Boolean)) {
    result.add(word);
    for (let index = 0; index < word.length - 1; index++)
      result.add(word.slice(index, index + 2));
  }
  return result;
}

function resolvePerson(goal: string, raw: RawPlan, context: PlanningContext) {
  const candidate = [raw.personId, raw.person]
    .find((value) => typeof value === "string")
    ?.trim();
  return (
    context.people.find(
      (item) =>
        item.id === candidate ||
        item.name === candidate ||
        goal.includes(item.name),
    ) ?? null
  );
}

function resolveParent(
  goal: string,
  personId: string | null,
  raw: RawPlan,
  context: PlanningContext,
) {
  const explicit = context.tasks.find((item) => item.id === raw.parentTaskId);
  if (explicit) return explicit.id;
  const goalTokens = tokens(goal);
  let best: { id: string; score: number } | null = null;
  for (const task of context.tasks) {
    const taskTokens = tokens(`${task.title} ${task.body}`);
    let shared = 0;
    for (const token of goalTokens)
      if (token.length > 1 && taskTokens.has(token)) shared++;
    const score =
      shared +
      (personId && task.personId === personId ? 3 : 0) +
      (goal.includes(task.title) || task.title.includes(goal) ? 8 : 0);
    if (!best || score > best.score) best = { id: task.id, score };
  }
  return best && best.score >= 3 ? best.id : null;
}

export async function planQuest(
  goal: string,
  context: PlanningContext,
): Promise<{ quest: PlannedQuest; model: ModelResponse }> {
  const clean = goal.trim();
  if (!clean) throw new Error("goal is empty");
  const compactContext = {
    tasks: context.tasks.map((item) => ({
      id: item.id,
      title: item.title,
      personId: item.personId,
    })),
    people: context.people,
  };
  const model = await modelHub.complete({
    purpose: "task-planning",
    prompt: `<goal>${clean}</goal>\n<context>${JSON.stringify(compactContext)}</context>\nReturn one JSON object with title, deadline, priority (首要 or 普通), personId, parentTaskId, steps (string array), and reward. Use only IDs from context; use null when unrelated.`,
    system:
      "You turn a Chinese real-life goal into one concise RPG quest and link it to an existing person or parent quest when semantically related. Return JSON only.",
    json: true,
  });
  const raw = parseJson(model.text),
    person = resolvePerson(clean, raw, context),
    parentTaskId = resolveParent(clean, person?.id ?? null, raw, context);
  const steps = Array.isArray(raw.steps)
    ? raw.steps
        .filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0,
        )
        .slice(0, 6)
    : [];
  return {
    model,
    quest: {
      title:
        typeof raw.title === "string" && raw.title.trim()
          ? raw.title.trim()
          : clean.slice(0, 28),
      deadline: typeof raw.deadline === "string" ? raw.deadline : "待安排",
      priority: raw.priority === "首要" ? "首要" : "普通",
      personId: person?.id ?? null,
      personName: person?.name ?? null,
      parentTaskId,
      steps: steps.length ? steps : [clean],
      reward:
        typeof raw.reward === "string"
          ? raw.reward
          : person
            ? `好感度 +8 · ${person.name}`
            : "生命力 +5",
    },
  };
}
