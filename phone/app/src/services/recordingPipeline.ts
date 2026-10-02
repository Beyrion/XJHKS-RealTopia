import type {
  ExtractedInteractionEvent,
  Memory,
  Person,
  Quest,
  Recording,
  DialogueSuggestion,
  ConversationInsight,
  ConversationTurn,
} from "../models";
import { analyzeConversation } from "../utils/memoryPlanner";
import { localConversationInsight } from "../utils/memoryPlanner";
import { inferQuestCategory } from "../utils/gameRules";
import { sanitizeText } from "../utils/text";
import { souvenirForQuest } from "../utils/souvenir";
import { nativeService } from "./native";

export interface RecordingSnapshot {
  quests: Quest[];
  people: Person[];
  memories: Memory[];
  selectedPersonId?: string | null;
  transcriptPrefix?: string;
  conversationHistory?: ConversationTurn[];
  sceneSummary?: string | null;
  /** A recognized-person recording is an explicit task-capture transaction. */
  requireTask?: boolean;
}

export interface LocalTranscription {
  transcript: string;
  localText: string;
  log: string;
}

function memoryContext(snapshot: RecordingSnapshot) {
  return {
    tasks: snapshot.quests.map((value) => ({
      id: value.id,
      title: value.title,
      body: value.body,
      personId: value.personId ?? null,
    })),
    people: snapshot.people.map((value) => ({
      id: value.id,
      name: value.name,
    })),
    selectedPersonId: snapshot.selectedPersonId,
    recentConversation: (snapshot.conversationHistory ?? [])
      .slice(0, 6)
      .reverse()
      .map((item) => ({
        transcript: item.transcript.slice(-800),
        speakerPersonId: item.speakerPersonId,
      })),
    sceneSummary: snapshot.sceneSummary,
  };
}

export async function transcribeRecordingLocally(
  recording: Recording,
  transcriptPrefix?: string,
): Promise<LocalTranscription> {
  await nativeService.markRecordingProcessed(
    recording.recording_id,
    "local ASR transcribing",
  );
  const local = await nativeService.transcribeAudioPath(
    recording.path,
    recording.sample_rate,
    recording.channels,
  );
  return {
    localText: local.text,
    transcript: [transcriptPrefix, local.text]
      .filter(Boolean)
      .join(" ")
      .slice(-6_000),
    log: `录音 #${recording.recording_id} 本地转写 ${local.latency_ms.toFixed(0)}ms · RTF ${local.realtime_factor.toFixed(2)} · 加载 ${local.model_load_ms}ms`,
  };
}

export function immediateConversationInsight(
  transcript: string,
  snapshot: RecordingSnapshot,
): ConversationInsight {
  return localConversationInsight(transcript, memoryContext(snapshot));
}

export interface RecordingPipelineResult extends RecordingSnapshot {
  logs: string[];
  interactions: ExtractedInteractionEvent[];
  transcript: string;
  speakerPersonId: string | null;
  replySuggestions: DialogueSuggestion[];
  enhancementModel: string;
  enhancementSide: "edge" | "cloud";
  enhanceReplySuggestions: boolean;
  enhancementReason: string;
  generatedQuestIds: string[];
}

function clockTime() {
  return new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function processRecordingPipeline(
  recording: Recording,
  snapshot: RecordingSnapshot,
  transcribed?: LocalTranscription,
): Promise<RecordingPipelineResult> {
  try {
    const local =
      transcribed ??
      (await transcribeRecordingLocally(recording, snapshot.transcriptPrefix));
    const logs = [local.log];
    const conversationText = local.transcript;
    await nativeService.markRecordingProcessed(
      recording.recording_id,
      "extracting person memory",
    );

    const quests = structuredClone(snapshot.quests);
    const people = structuredClone(snapshot.people);
    const memories = structuredClone(snapshot.memories);
    const { insight, model } = await analyzeConversation(
      conversationText,
      memoryContext({ ...snapshot, quests, people }),
    );

    const taskIds = new Set(insight.taskIds);
    const originalQuestIds = new Set(snapshot.quests.map((item) => item.id));
    insight.taskOperations.forEach((operation, index) => {
      if (operation.operation === "create") {
        const id = `conversation-${recording.recording_id}-task-${index}`;
        if (quests.some((item) => item.id === id)) {
          taskIds.add(id);
          return;
        }
        const person = people.find((item) => item.id === operation.personId);
        const quest: Quest = {
          id,
          group: "对话任务",
          title: sanitizeText(operation.title).slice(0, 48),
          meta: `${operation.deadline || "待安排"} · LLM 提取 ${Math.round(operation.confidence * 100)}%`,
          body: sanitizeText(operation.evidence || insight.summary).slice(
            0,
            1_200,
          ),
          priority: /(今天|明天|尽快|马上|截止)/.test(operation.deadline)
            ? "首要"
            : "普通",
          progress: 0,
          steps: operation.steps.map(sanitizeText).filter(Boolean),
          personId: person?.id,
          person: person?.name,
          reward: "完成后获得一件共同记忆纪念品",
          status: "inbox",
          source: "glasses",
          assignerPersonId: person?.id,
          deadline: operation.deadline || undefined,
          createdAt: new Date().toISOString(),
        };
        quest.category = inferQuestCategory(quest);
        quest.reward = `纪念品 · ${souvenirForQuest(quest, person).name}`;
        quests.unshift(quest);
        taskIds.add(id);
        return;
      }

      const linked = quests.find((item) => item.id === operation.taskId);
      if (!linked) return;
      taskIds.add(linked.id);
      for (const step of operation.steps.map(sanitizeText)) {
        if (step && !linked.steps.includes(step)) linked.steps.push(step);
      }
      // Progress/completion are deliberately not applied from LLM inference.
      // The candidate remains auditable in memory and the user completes it.
    });

    // The glasses task flow is intentional: once the user starts recording
    // with a recognized person, it must end in a persisted, auditable task.
    // Cloud extraction can legitimately return no create operation for an
    // indirect request, so provide a conservative inbox item instead of
    // leaving the exclusive workflow locked forever.
    if (
      snapshot.requireTask &&
      !quests.some((item) => !originalQuestIds.has(item.id))
    ) {
      const person = people.find(
        (item) => item.id === snapshot.selectedPersonId,
      );
      const id = `conversation-${recording.recording_id}-task-fallback`;
      const summary = sanitizeText(insight.summary || conversationText)
        .replace(/[。！？!?]+$/g, "")
        .slice(0, 40);
      const quest: Quest = {
        id,
        group: "对话任务",
        title: summary
          ? `跟进 · ${summary}`
          : `跟进与${person?.name ?? "对话人物"}的约定`,
        meta: "待确认 · 对话流程兜底任务",
        body: sanitizeText(conversationText).slice(0, 1_200),
        priority: "普通",
        progress: 0,
        steps: ["确认约定的具体要求", "完成并向对方反馈"],
        personId: person?.id,
        person: person?.name,
        reward: "完成后获得一件共同记忆纪念品",
        status: "inbox",
        source: "glasses",
        assignerPersonId: person?.id,
        createdAt: new Date().toISOString(),
      };
      quest.category = inferQuestCategory(quest);
      quest.reward = `纪念品 · ${souvenirForQuest(quest, person).name}`;
      quests.unshift(quest);
      taskIds.add(id);
    }

    const generatedQuestIds = quests
      .filter((item) => !originalQuestIds.has(item.id))
      .map((item) => item.id);

    const linkedTitles = [...taskIds]
      .map((id) => quests.find((value) => value.id === id)?.title)
      .filter((value): value is string => Boolean(value));
    for (const personId of insight.personIds) {
      const target = people.find((value) => value.id === personId);
      if (!target) continue;
      if (personId === insight.speakerPersonId) target.seen = "刚刚 · 对话记录";
      const personTaskTitles = [...taskIds]
        .map((id) => quests.find((value) => value.id === id))
        .filter(
          (quest): quest is Quest =>
            Boolean(quest) &&
            (quest?.assignerPersonId === personId ||
              quest?.personId === personId),
        )
        .map((quest) => quest.title);
      for (const title of personTaskTitles) {
        if (!target.quests.includes(title)) target.quests.unshift(title);
      }
    }

    insight.memories.forEach((item, index) => {
      const id = `person-memory-${recording.recording_id}-${item.personId}-${index}`;
      if (memories.some((memory) => memory.id === id)) return;
      const person = people.find((value) => value.id === item.personId);
      memories.unshift({
        id,
        time: clockTime(),
        title: sanitizeText(item.summary).slice(0, 48),
        meta: `${person?.name ?? "未关联人物"} · ${Math.round(item.confidence * 100)}% · ${model.model}`,
        kind: "person",
        summary: sanitizeText(item.summary),
        transcript: sanitizeText(conversationText).slice(0, 1_200),
        personIds: [item.personId],
        taskIds: [...taskIds],
        personMemoryKind: item.kind,
        evidence: sanitizeText(item.evidence).slice(0, 280),
        confidence: item.confidence,
        sourceRecordingId: recording.recording_id,
        status: "active",
        dedupeKey: id,
      });
    });

    for (const operation of insight.taskOperations) {
      if (!operation.personId) continue;
      const id = `task-memory-${recording.recording_id}-${operation.personId}-${operation.title}`;
      if (memories.some((memory) => memory.dedupeKey === id)) continue;
      memories.unshift({
        id: `task-memory-${recording.recording_id}-${memories.length}`,
        time: clockTime(),
        title: `${operation.operation === "create" ? "收到任务" : "任务线索"} · ${sanitizeText(operation.title).slice(0, 36)}`,
        meta: `对话提取 · ${Math.round(operation.confidence * 100)}%`,
        kind: "task",
        summary: sanitizeText(operation.evidence || operation.title),
        personIds: [operation.personId],
        taskIds: [...taskIds],
        personMemoryKind: "task_assigned",
        evidence: sanitizeText(operation.evidence).slice(0, 280),
        confidence: operation.confidence,
        sourceRecordingId: recording.recording_id,
        status: "active",
        dedupeKey: id,
      });
    }

    let recordingMemory = memories.find(
      (value) => value.id === `recording-${recording.recording_id}`,
    );
    if (!recordingMemory) {
      recordingMemory = {
        id: `recording-${recording.recording_id}`,
        time: clockTime(),
        title: "手机对话录音",
        meta: `${(recording.duration_ms / 1_000).toFixed(1)} 秒 · 手机麦克风 · 本地 ASR`,
        kind: "recording",
      };
      memories.unshift(recordingMemory);
    }
    if (recordingMemory) {
      recordingMemory.title = sanitizeText(insight.summary).slice(0, 48);
      recordingMemory.summary = sanitizeText(insight.summary);
      recordingMemory.transcript = sanitizeText(conversationText).slice(
        0,
        1_200,
      );
      recordingMemory.personIds = insight.personIds;
      recordingMemory.taskIds = [...taskIds];
      recordingMemory.sourceRecordingId = recording.recording_id;
      recordingMemory.meta = `${
        insight.personIds
          .map((id) => people.find((value) => value.id === id)?.name)
          .filter(Boolean)
          .join("、") || "未关联人物"
      } · ${linkedTitles.join("、") || "未关联任务"} · 本地 ASR`;
    }

    logs.unshift(
      `录音 #${recording.recording_id} 已提取 · 人物记忆 ${insight.memories.length} / 任务操作 ${insight.taskOperations.length}`,
    );
    await nativeService.markRecordingProcessed(
      recording.recording_id,
      "person memory extracted",
    );
    return {
      quests,
      people,
      memories,
      interactions: insight.interactionEvents,
      transcript: conversationText,
      speakerPersonId: insight.speakerPersonId,
      replySuggestions: insight.replySuggestions,
      enhancementModel: model.model,
      enhancementSide: model.side,
      enhanceReplySuggestions: insight.enhanceReplySuggestions,
      enhancementReason: insight.enhancementReason,
      generatedQuestIds,
      logs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "录音处理失败";
    await nativeService
      .markRecordingProcessed(
        recording.recording_id,
        `error: ${message.slice(0, 90)}`,
      )
      .catch(() => undefined);
    throw error;
  }
}
