import type {
  ExtractedInteractionEvent,
  Memory,
  Person,
  Quest,
  Recording,
} from "../models";
import { analyzeConversation } from "../utils/memoryPlanner";
import { inferQuestCategory } from "../utils/gameRules";
import { sanitizeText } from "../utils/text";
import { nativeService } from "./native";

export interface RecordingSnapshot {
  quests: Quest[];
  people: Person[];
  memories: Memory[];
}

export interface RecordingPipelineResult extends RecordingSnapshot {
  logs: string[];
  interactions: ExtractedInteractionEvent[];
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
): Promise<RecordingPipelineResult> {
  try {
    await nativeService.markRecordingProcessed(
      recording.recording_id,
      "local ASR transcribing",
    );
    const local = await nativeService.transcribeRecording(
      recording.recording_id,
    );
    const logs = [
      `录音 #${recording.recording_id} 本地转写 ${local.latency_ms.toFixed(0)}ms · RTF ${local.realtime_factor.toFixed(2)} · 加载 ${local.model_load_ms}ms`,
    ];
    await nativeService.markRecordingProcessed(
      recording.recording_id,
      "extracting person memory",
    );

    const quests = structuredClone(snapshot.quests);
    const people = structuredClone(snapshot.people);
    const memories = structuredClone(snapshot.memories);
    const { insight, model } = await analyzeConversation(local.text, {
      tasks: quests.map((value) => ({
        id: value.id,
        title: value.title,
        body: value.body,
        personId: value.personId ?? null,
      })),
      people: people.map((value) => ({ id: value.id, name: value.name })),
    });

    const taskIds = new Set(insight.taskIds);
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
          reward: person ? `完成后提升与 ${person.name} 的羁绊` : "记忆经验 +5",
          status: "inbox",
          source: "glasses",
          assignerPersonId: person?.id,
          deadline: operation.deadline || undefined,
          createdAt: new Date().toISOString(),
        };
        quest.category = inferQuestCategory(quest);
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
        transcript: sanitizeText(local.text).slice(0, 1_200),
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

    const recordingMemory = memories.find(
      (value) => value.id === `recording-${recording.recording_id}`,
    );
    if (recordingMemory) {
      recordingMemory.title = sanitizeText(insight.summary).slice(0, 48);
      recordingMemory.summary = sanitizeText(insight.summary);
      recordingMemory.transcript = sanitizeText(local.text).slice(0, 1_200);
      recordingMemory.personIds = insight.personIds;
      recordingMemory.taskIds = [...taskIds];
      recordingMemory.sourceRecordingId = recording.recording_id;
      recordingMemory.meta = `${
        insight.personIds
          .map((id) => people.find((value) => value.id === id)?.name)
          .filter(Boolean)
          .join("、") || "未关联人物"
      } · ${linkedTitles.join("、") || "未关联任务"} · ${local.model}`;
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
