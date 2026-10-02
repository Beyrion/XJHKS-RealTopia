import type { Memory, Person, Quest, Recording } from "../models";
import { analyzeConversation } from "../utils/memoryPlanner";
import { sanitizeText } from "../utils/text";
import { nativeService } from "./native";

export interface RecordingSnapshot {
  quests: Quest[];
  people: Person[];
  memories: Memory[];
}

export interface RecordingPipelineResult extends RecordingSnapshot {
  logs: string[];
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
      "linking memory",
    );

    const quests = structuredClone(snapshot.quests);
    const people = structuredClone(snapshot.people);
    const memories = structuredClone(snapshot.memories);
    const { insight } = await analyzeConversation(local.text, {
      tasks: quests.map((value) => ({
        id: value.id,
        title: value.title,
        body: value.body,
        personId: value.personId ?? null,
      })),
      people: people.map((value) => ({ id: value.id, name: value.name })),
    });

    let taskIds = [...insight.taskIds];
    if (insight.followUps.length) {
      const linked = quests.find((value) => value.id === taskIds[0]);
      if (linked) {
        for (const step of insight.followUps.map(sanitizeText)) {
          if (step && !linked.steps.includes(step)) linked.steps.push(step);
        }
      } else {
        const generated: Quest = {
          id: `conversation-${recording.recording_id}`,
          group: "突发任务",
          title: sanitizeText(insight.followUps[0]).slice(0, 28),
          meta: "对话提取 · 待安排",
          body: sanitizeText(insight.summary),
          priority: "普通",
          progress: 0,
          steps: insight.followUps.map(sanitizeText),
          personId: insight.personIds[0],
          person: people.find((value) => value.id === insight.personIds[0])
            ?.name,
          reward: "记忆经验 +5",
        };
        quests.unshift(generated);
        taskIds = [generated.id];
      }
    }

    const linkedTitles = taskIds
      .map((id) => quests.find((value) => value.id === id)?.title)
      .filter((value): value is string => Boolean(value));
    for (const personId of insight.personIds) {
      const target = people.find((value) => value.id === personId);
      if (!target) continue;
      target.affinity = Math.max(
        0,
        Math.min(100, target.affinity + insight.affinityDelta),
      );
      target.seen = "刚刚 · 对话记录";
      if (insight.story && !target.story.includes(insight.story)) {
        target.story = `${target.story}\n\n新故事 · ${insight.story}`;
      }
      for (const title of linkedTitles) {
        if (!target.quests.includes(title)) target.quests.unshift(title);
      }
    }

    const memory = memories.find(
      (value) => value.id === `recording-${recording.recording_id}`,
    );
    if (memory) {
      memory.title = sanitizeText(insight.summary).slice(0, 48);
      memory.summary = sanitizeText(insight.summary);
      memory.transcript = sanitizeText(local.text).slice(0, 1_200);
      memory.personIds = insight.personIds;
      memory.taskIds = taskIds;
      memory.meta = `${
        insight.personIds
          .map((id) => people.find((value) => value.id === id)?.name)
          .filter(Boolean)
          .join("、") || "未关联人物"
      } · ${linkedTitles.join("、") || "未关联既有任务"} · ${local.model}`;
    }

    logs.unshift(
      `录音 #${recording.recording_id} 已总结 · 人物 ${insight.personIds.length} / 任务 ${taskIds.length}`,
    );
    await nativeService.markRecordingProcessed(
      recording.recording_id,
      "summarized and linked",
    );
    return { quests, people, memories, logs };
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
