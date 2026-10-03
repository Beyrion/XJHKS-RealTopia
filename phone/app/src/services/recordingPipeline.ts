import type {
  ExtractedInteractionEvent,
  Memory,
  Person,
  Quest,
  Recording,
  DialogueSuggestion,
  ConversationInsight,
  ConversationTurn,
  LocalAsrResult,
} from "../models";
import { analyzeConversation } from "../utils/memoryPlanner";
import { localConversationInsight } from "../utils/memoryPlanner";
import { inferQuestCategory } from "../utils/gameRules";
import { sanitizeText } from "../utils/text";
import { souvenirForQuest } from "../utils/souvenir";
import { nativeService } from "./native";
import { decideTask, stableKey, compactUtterance } from "../utils/taskGate";
import { normalizeQuest, recordEvidence } from "../utils/questEvidence";
import { mergeMemoryRecords } from "../utils/socialMemory";

export interface RecordingSnapshot {
  quests: Quest[];
  people: Person[];
  memories: Memory[];
  selectedPersonId?: string | null;
  transcriptPrefix?: string;
  conversationHistory?: ConversationTurn[];
  sceneSummary?: string | null;
  activeQuestId?: string | null;
  requireTaskConfirmation?: boolean;
  deferTasks?: boolean;
  sessionSummary?: boolean;
}

export interface LocalTranscription {
  metrics?: Pick<
    LocalAsrResult,
    | "latency_ms"
    | "realtime_factor"
    | "model_load_ms"
    | "load_this_call_ms"
    | "model_reused"
  >;
  transcript: string;
  localText: string;
  log: string;
}

function memoryContext(snapshot: RecordingSnapshot) {
  return {
    sessionSummary: snapshot.sessionSummary,
    memories: snapshot.memories,
    activeQuestId: snapshot.activeQuestId,
    tasks: snapshot.quests.map((value) => ({
      id: value.id,
      title: value.title,
      body: value.body,
      personId: value.personId ?? null,
      lifecycle: value.lifecycle,
      participantIds: value.participantIds,
      ownerPersonId: value.ownerPersonId,
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
    metrics: {
      latency_ms: local.latency_ms,
      realtime_factor: local.realtime_factor,
      model_load_ms: local.model_load_ms,
      load_this_call_ms: local.load_this_call_ms,
      model_reused: local.model_reused,
    },
    transcript: [transcriptPrefix, local.text]
      .filter(Boolean)
      .join(" ")
      .slice(-6_000),
    log: `录音 #${recording.recording_id} 本地转写 ${local.latency_ms.toFixed(0)}ms · RTF ${local.realtime_factor.toFixed(2)} · 首次加载 ${local.model_load_ms}ms · ${local.model_reused ? "复用常驻模型" : `本次加载 ${local.load_this_call_ms ?? "未知"}ms`}`,
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
    const sourceId = `utterance:${recording.conversation_id ?? recording.recording_id}:${stableKey(compactUtterance(conversationText))}`;
    const originalQuestIds = new Set(snapshot.quests.map((item) => item.id));
    (snapshot.deferTasks ? [] : insight.taskOperations).forEach((operation) => {
      if (operation.operation === "create") {
        const decision = decideTask(operation.evidence, {
          speakerPersonId: insight.speakerPersonId,
          people: snapshot.people,
        });
        if (
          !["create", "candidate"].includes(decision.kind) ||
          !conversationText.includes(operation.evidence)
        )
          return;
        const dedupeKey = `request:${recording.conversation_id ?? recording.recording_id}:${stableKey(compactUtterance(operation.evidence))}`;
        const id = `task-${stableKey(dedupeKey)}`;
        const existing = quests.find(
          (item) => item.id === id || item.dedupeKey === dedupeKey,
        );
        if (existing) {
          taskIds.add(existing.id);
          return;
        }
        const person = people.find((item) => item.id === operation.personId);
        const quest: Quest = {
          id,
          group: "对话任务",
          title: sanitizeText(operation.evidence).slice(0, 48),
          realTitle: sanitizeText(operation.evidence).slice(0, 48),
          displayTitle: `现实委托 · ${sanitizeText(operation.title).slice(0, 32)}`,
          meta: `${operation.deadline || "待安排"} · LLM 提取 ${Math.round(operation.confidence * 100)}%`,
          body: sanitizeText(operation.evidence || insight.summary).slice(
            0,
            1_200,
          ),
          priority: /(今天|明天|尽快|马上|截止)/.test(operation.deadline)
            ? "首要"
            : "普通",
          progress: 0,
          steps: [sanitizeText(operation.evidence)],
          personId: person?.id,
          person: person?.name,
          reward: "完成后获得一件共同记忆纪念品",
          status: "inbox",
          lifecycle:
            !snapshot.requireTaskConfirmation && decision.kind === "create"
              ? "accepted"
              : "candidate",
          ownerPersonId: decision.assigneePersonId ?? undefined,
          dedupeKey,
          acceptanceCriteria:
            decision.acceptanceCriteria || "请确认执行者、具体行动与完成结果",
          candidateExpiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
          sourceEvidence: {
            sourceId,
            excerpt: operation.evidence,
            speakerPersonId: insight.speakerPersonId,
            mentionedPersonIds: insight.mentionedPersonIds,
          },
          source: "glasses",
          assignerPersonId: person?.id,
          deadline: operation.deadline || undefined,
          createdAt: new Date().toISOString(),
        };
        quest.category = inferQuestCategory(quest);
        quest.reward = `纪念品 · ${souvenirForQuest(quest, person).name}`;
        quests.unshift(normalizeQuest(quest));
        taskIds.add(id);
        return;
      }

      const linked = quests.find((item) => item.id === operation.taskId);
      if (!linked) return;
      taskIds.add(linked.id);
      // Model progress is a candidate, never an arbitrary percentage or a new step.
      const candidate = recordEvidence(linked, {
        id: `evidence-${stableKey(`${sourceId}:${linked.id}`)}`,
        taskId: linked.id,
        sourceType: "asr",
        sourceId,
        excerpt: operation.evidence,
        observedAt: new Date().toISOString(),
        confidence: operation.confidence,
        verificationStatus: "candidate",
        dedupeKey: `${sourceId}:${linked.id}`,
      });
      quests[quests.findIndex((item) => item.id === linked.id)] = candidate;
      // Progress/completion are deliberately not applied from LLM inference.
      // The candidate remains auditable in memory and the user completes it.
    });

    const pending = quests.filter(
      (q) =>
        q.lifecycle === "candidate" &&
        q.source === "glasses" &&
        q.candidateExpiresAt &&
        Date.parse(q.candidateExpiresAt) > Date.now(),
    );
    const unique = pending.length === 1 ? pending[0] : undefined;
    const decision = decideTask(conversationText, {
      speakerPersonId: insight.speakerPersonId,
      people: snapshot.people,
      uniquePendingCandidateId: unique?.id,
      pendingCandidateIds: pending.map((q) => q.id),
      notExpired: !!unique,
    });
    if (
      !snapshot.requireTaskConfirmation &&
      decision.kind === "confirm_existing" &&
      unique &&
      (!insight.speakerPersonId ||
        unique.ownerPersonId === insight.speakerPersonId)
    ) {
      const accepted = normalizeQuest(unique);
      accepted.lifecycle = "accepted";
      accepted.status = "active";
      accepted.ownerPersonId ??= "player";
      accepted.revision!++;
      accepted.progressEvents!.push({
        eventId: `accept-${stableKey(sourceId + unique.id)}`,
        taskId: unique.id,
        operation: "accept",
        recordedAt: new Date().toISOString(),
        actor: insight.speakerPersonId ?? "player",
        evidenceIds: [],
        rulesVersion: "evidence-v1",
        dedupeKey: sourceId + unique.id,
      });
      quests[quests.findIndex((q) => q.id === unique.id)] = accepted;
      taskIds.add(unique.id);
    }
    if (["progress_candidate", "cancel_candidate"].includes(decision.kind)) {
      const target = quests.find((q) => q.id === snapshot.activeQuestId);
      if (target) {
        const candidate = recordEvidence(target, {
          id: `evidence-${stableKey(sourceId + target.id)}`,
          taskId: target.id,
          sourceType: "asr",
          sourceId,
          excerpt: conversationText.slice(0, 280),
          observedAt: new Date().toISOString(),
          confidence: 0.6,
          verificationStatus: "candidate",
          dedupeKey: sourceId + target.id,
        });
        quests[quests.findIndex((q) => q.id === target.id)] = candidate;
        taskIds.add(target.id);
      }
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
        memoryKind:
          item.kind === "promise"
            ? "commitment"
            : item.kind === "conversation"
              ? "episode"
              : item.kind === "relationship"
                ? "fact"
                : item.kind,
        subjectPersonIds: [item.personId],
        speakerPersonId: insight.speakerPersonId,
        mentionedPersonIds: insight.mentionedPersonIds,
        sourceType: "asr",
        speakerVoiceId: recording.speaker?.id,
        speakerSourceRecordingId: recording.speaker?.sourceRecordingId,
        sourceId,
        observedAt: new Date().toISOString(),
        revision: 1,
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
      recordingMemory.subjectPersonIds = insight.speakerPersonId
        ? [insight.speakerPersonId]
        : [];
      recordingMemory.speakerPersonId = insight.speakerPersonId;
      recordingMemory.speakerVoiceId = recording.speaker?.id;
      recordingMemory.speakerSourceRecordingId =
        recording.speaker?.sourceRecordingId;
      recordingMemory.mentionedPersonIds = insight.mentionedPersonIds;
      recordingMemory.sourceType = "asr";
      recordingMemory.sourceId = sourceId;
      recordingMemory.observedAt = new Date().toISOString();
      recordingMemory.memoryKind = "episode";
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
      memories: mergeMemoryRecords(snapshot.memories, memories),
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
