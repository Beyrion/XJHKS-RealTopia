import type {
  MoodSnapshot,
  Person,
  Quest,
  RealWorldContext,
  WorldEvent,
} from "../models";
import { modelHub } from "../services/modelHub";

interface WorldEventInput {
  observationId: string;
  summary: string;
  people: Person[];
  quests: Quest[];
  mood: MoodSnapshot;
  context: RealWorldContext;
  now?: Date;
}

interface RawWorldEvent {
  shouldCreate?: unknown;
  title?: unknown;
  description?: unknown;
  reason?: unknown;
  steps?: unknown;
  reward?: unknown;
  deadline?: unknown;
  confidence?: unknown;
}

function text(value: unknown, max: number) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function parseJson(value: string): RawWorldEvent {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("world event JSON missing");
  return JSON.parse(value.slice(start, end + 1)) as RawWorldEvent;
}

function locationLabel(context: RealWorldContext) {
  const location = context.location;
  if (
    !location.available ||
    location.latitude === undefined ||
    location.longitude === undefined
  )
    return "当前场景";
  return `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`;
}

function scheduledContext(input: WorldEventInput) {
  const device = input.context.calendar.slice(0, 5).map((item) => ({
    title: text(item.title, 60),
    start: new Date(item.start_ms).toISOString(),
    location: text(item.location, 60),
  }));
  const tasks = input.quests
    .filter((item) => item.progress < 100 && item.deadline)
    .slice(0, 5)
    .map((item) => ({ title: item.title, deadline: item.deadline }));
  return { device, tasks };
}

function fallback(input: WorldEventInput): RawWorldEvent | null {
  const scheduled = scheduledContext(input);
  const person = input.people[0];
  const actionable =
    /人|交谈|工作|会议|走|吃|喝|书|运动|商店|公园|植物|电脑|桌/.test(
      input.summary,
    );
  if (
    !person &&
    !scheduled.device.length &&
    !scheduled.tasks.length &&
    !actionable
  )
    return null;
  const title = person
    ? `和${person.name}创造一个小插曲`
    : scheduled.device[0]
      ? `为「${scheduled.device[0].title}」做好准备`
      : "回应眼前的小机会";
  return {
    shouldCreate: true,
    title,
    description: person
      ? `你遇见了${person.name}，可以借眼前场景开启一次自然互动。`
      : `当前场景是一个可以立刻行动的小机会：${input.summary}`,
    reason: `${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(input.now ?? new Date())} · ${locationLabel(input.context)} · ${input.summary}`,
    steps: person
      ? ["自然地开启话题", "留意对方的回应"]
      : ["确认是否适合现在行动", "完成一个最小动作"],
    reward: person ? `与${person.name}的共同记忆 +1` : "生命力 +3",
    deadline: "今天",
    confidence: person || scheduled.device.length ? 0.82 : 0.7,
  };
}

export async function proposeWorldEvent(
  input: WorldEventInput,
): Promise<WorldEvent | null> {
  const groundedFallback = fallback(input);
  if (!groundedFallback) return null;
  const now = input.now ?? new Date();
  const schedule = scheduledContext(input);
  const promptContext = {
    currentTime: now.toISOString(),
    location: input.context.location,
    observedScene: input.summary,
    visiblePeople: input.people.map((item) => ({
      id: item.id,
      name: item.name,
      role: item.role,
      affinity: item.affinity,
    })),
    schedule,
    mood: { mood: input.mood.mood, intensity: input.mood.intensity },
  };
  let raw = groundedFallback;
  try {
    const result = await modelHub.complete({
      purpose: "world-generation",
      json: true,
      prompt: `<context>${JSON.stringify(promptContext)}</context>\nReturn {shouldCreate,title,description,reason,steps,reward,deadline,confidence}. Create an event only when it is immediately relevant to the observed scene, visible person, time, location or upcoming calendar. It must be a small optional action, never claim the user did something, and never infer sensitive traits.`,
      system:
        "You design grounded, optional real-life RPG events. Return JSON only, in concise Simplified Chinese.",
    });
    const parsed = parseJson(result.text);
    if (parsed.shouldCreate === false) return null;
    raw = parsed;
  } catch {
    // The deterministic grounded proposal keeps this feature available offline.
  }
  const title = text(raw.title, 32) || text(groundedFallback.title, 32);
  const description =
    text(raw.description, 120) || text(groundedFallback.description, 120);
  const reason = text(raw.reason, 120) || text(groundedFallback.reason, 120);
  const steps = Array.isArray(raw.steps)
    ? raw.steps
        .map((item) => text(item, 48))
        .filter(Boolean)
        .slice(0, 4)
    : [];
  const confidence = Math.max(0, Math.min(1, Number(raw.confidence) || 0.7));
  if (!title || !description || confidence < 0.6) return null;
  const person = input.people[0];
  const id = `world-${input.observationId}`;
  return {
    id,
    title,
    description,
    reason,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 30 * 60_000).toISOString(),
    status: "pending",
    sourceObservationId: input.observationId,
    locationLabel: locationLabel(input.context),
    personIds: input.people.map((item) => item.id),
    confidence,
    dedupeKey: `${title}-${person?.id ?? "scene"}`.toLowerCase(),
    quest: {
      title,
      body: description,
      steps: steps.length ? steps : ["完成一个最小动作", "记录结果"],
      deadline: text(raw.deadline, 30) || "今天",
      personId: person?.id,
      reward: text(raw.reward, 40) || "生命力 +3",
    },
  };
}
