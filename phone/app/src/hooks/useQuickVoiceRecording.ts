import { useCallback, useEffect, useRef, useState } from "react";
import { moodProfiles } from "../data/appData";
import type { Quest } from "../models";
import { nativeService } from "../services/native";
import { useAppStore } from "../store/AppStore";
import { inferQuestCategory } from "../utils/gameRules";
import { analyzeConversation } from "../utils/memoryPlanner";
import { analyzeMood } from "../utils/moodPlanner";
import { planQuest } from "../utils/taskPlanner";
import { sanitizeText } from "../utils/text";

export type QuickVoiceKind = "task" | "conversation" | "mood";
export type QuickVoicePhase = "idle" | "listening" | "processing";

export function useQuickVoiceRecording() {
  const {
    quests,
    people,
    addQuest,
    updateQuests,
    updatePeople,
    updateMemories,
    updateMood,
    addLog,
    notify,
    applyConversationInteractions,
  } = useAppStore();
  const [kind, setKind] = useState<QuickVoiceKind | null>(null);
  const [phase, setPhase] = useState<QuickVoicePhase>("idle");
  const runRef = useRef(0);
  const phaseRef = useRef<QuickVoicePhase>("idle");

  const reset = useCallback(() => {
    phaseRef.current = "idle";
    setPhase("idle");
    setKind(null);
  }, []);

  const recordMood = useCallback(
    async (transcript: string) => {
      const { analysis, model } = await analyzeMood(transcript);
      updateMood({
        ...analysis,
        transcript,
        model: model.model,
        analyzedAt: new Date().toISOString(),
      });
      const profile = moodProfiles[analysis.mood];
      updateMemories((items) => [
        {
          id: `mood-${Date.now()}`,
          time: new Date().toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          title: `心情 · ${profile.label}`,
          meta: `强度 ${analysis.intensity} · ${model.model}`,
          kind: "mood",
          summary: analysis.summary,
          transcript,
          mood: analysis.mood,
          intensity: analysis.intensity,
        },
        ...items,
      ]);
      addLog(
        `心情分析完成 · ${profile.label} ${analysis.intensity} · ${model.latencyMs}ms`,
      );
      return `心情「${profile.label}」已记录`;
    },
    [addLog, updateMemories, updateMood],
  );

  const recordTask = useCallback(
    async (transcript: string) => {
      const { quest: plan, model } = await planQuest(transcript, {
        tasks: quests.map((item) => ({
          id: item.id,
          title: item.title,
          body: item.body,
          personId: item.personId ?? null,
        })),
        people: people.map((item) => ({ id: item.id, name: item.name })),
      });
      const id = `voice-task-${Date.now()}`;
      const quest: Quest = {
        id,
        group: "语音记录",
        title: sanitizeText(plan.title).slice(0, 48),
        meta: `${plan.deadline || "待安排"} · 语音记录`,
        body: sanitizeText(transcript).slice(0, 1_200),
        priority: plan.priority,
        progress: 0,
        steps: plan.steps.map(sanitizeText).filter(Boolean),
        person: plan.personName ?? undefined,
        personId: plan.personId ?? undefined,
        parentId: plan.parentTaskId ?? undefined,
        reward: sanitizeText(plan.reward),
        category: undefined,
        status: "inbox",
        source: "voice",
        assignerPersonId: plan.personId ?? undefined,
        deadline: plan.deadline === "待安排" ? undefined : plan.deadline,
        createdAt: new Date().toISOString(),
      };
      addQuest(quest);
      updateMemories((items) => [
        {
          id: `memory-${id}`,
          time: new Date().toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          title: `任务 · ${quest.title}`,
          meta: `${quest.meta} · ${model.model}`,
          kind: "task",
          summary: quest.body,
          transcript,
          personIds: quest.personId ? [quest.personId] : [],
          taskIds: [quest.id],
        },
        ...items,
      ]);
      addLog(`语音任务已记录 · ${quest.title} · ${model.latencyMs}ms`);
      return `任务「${quest.title}」已记录`;
    },
    [addLog, addQuest, people, quests, updateMemories],
  );

  const recordConversation = useCallback(
    async (transcript: string, selectedPersonId?: string | null) => {
      const sourceId = Date.now();
      const { insight, model } = await analyzeConversation(transcript, {
        tasks: quests.map((item) => ({
          id: item.id,
          title: item.title,
          body: item.body,
          personId: item.personId ?? null,
        })),
        people: people.map((item) => ({ id: item.id, name: item.name })),
        selectedPersonId,
      });
      const taskIds = new Set(insight.taskIds);
      const createdTitles: string[] = [];
      insight.taskOperations.forEach((operation, index) => {
        if (operation.operation === "create") {
          const person = people.find((item) => item.id === operation.personId);
          const id = `voice-conversation-${sourceId}-task-${index}`;
          const quest: Quest = {
            id,
            group: "对话任务",
            title: sanitizeText(operation.title).slice(0, 48),
            meta: `${operation.deadline || "待安排"} · 对话提取 ${Math.round(operation.confidence * 100)}%`,
            body: sanitizeText(operation.evidence || insight.summary),
            priority: /(今天|明天|尽快|马上|截止)/.test(operation.deadline)
              ? "首要"
              : "普通",
            progress: 0,
            steps: operation.steps.map(sanitizeText).filter(Boolean),
            personId: person?.id,
            person: person?.name,
            reward: person
              ? `完成后提升与 ${person.name} 的羁绊`
              : "记忆经验 +5",
            status: "inbox",
            source: "voice",
            assignerPersonId: person?.id,
            deadline: operation.deadline || undefined,
            createdAt: new Date().toISOString(),
          };
          quest.category = inferQuestCategory(quest);
          addQuest(quest);
          taskIds.add(id);
          createdTitles.push(quest.title);
          return;
        }
        if (!operation.taskId) return;
        taskIds.add(operation.taskId);
        updateQuests((items) =>
          items.map((quest) => {
            if (quest.id !== operation.taskId) return quest;
            const steps = [...quest.steps];
            for (const step of operation.steps.map(sanitizeText)) {
              if (step && !steps.includes(step)) steps.push(step);
            }
            return { ...quest, steps };
          }),
        );
      });
      const speakerName = people.find(
        (item) => item.id === insight.speakerPersonId,
      )?.name;
      updateMemories((items) => [
        ...insight.memories.map((memory, index) => ({
          id: `voice-person-memory-${sourceId}-${index}`,
          time: new Date().toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          title: sanitizeText(memory.summary).slice(0, 48),
          meta: `${people.find((item) => item.id === memory.personId)?.name ?? "未关联人物"} · ${Math.round(memory.confidence * 100)}% · ${model.model}`,
          kind: "person" as const,
          summary: sanitizeText(memory.summary),
          transcript,
          personIds: [memory.personId],
          taskIds: [...taskIds],
          personMemoryKind: memory.kind,
          evidence: sanitizeText(memory.evidence),
          confidence: memory.confidence,
          status: "active" as const,
          dedupeKey: `voice-person-memory-${sourceId}-${memory.personId}-${index}`,
        })),
        ...items,
      ]);
      updatePeople((items) =>
        items.map((person) =>
          person.id === insight.speakerPersonId
            ? {
                ...person,
                seen: "刚刚 · 手机对话记录",
                quests: [...new Set([...createdTitles, ...person.quests])],
              }
            : person,
        ),
      );
      applyConversationInteractions(
        insight.interactionEvents,
        `voice-conversation-${sourceId}`,
      );
      addLog(
        `人物对话已记录 · 人物 ${insight.personIds.length} / 任务 ${taskIds.size} · ${model.latencyMs}ms`,
      );
      return insight.speakerPersonId
        ? `已记录与 ${speakerName ?? "该人物"} 的对话${insight.mentionedPersonIds.length ? `，并识别到 ${insight.mentionedPersonIds.length} 位被提及人物` : ""}`
        : "对话已保存，但没有识别到明确人物";
    },
    [
      addLog,
      addQuest,
      applyConversationInteractions,
      people,
      quests,
      updateMemories,
      updatePeople,
      updateQuests,
    ],
  );

  const start = useCallback(
    async (nextKind: QuickVoiceKind, selectedPersonId?: string | null) => {
      if (phaseRef.current !== "idle") return;
      const run = ++runRef.current;
      phaseRef.current = "listening";
      setKind(nextKind);
      setPhase("listening");
      try {
        const speech = await nativeService.listenMood();
        if (runRef.current !== run) return;
        const transcript = sanitizeText(speech.transcript).slice(0, 4_000);
        if (!transcript) throw new Error("没有听清，请再说一次");
        phaseRef.current = "processing";
        setPhase("processing");
        const message =
          nextKind === "task"
            ? await recordTask(transcript)
            : nextKind === "conversation"
              ? await recordConversation(transcript, selectedPersonId)
              : await recordMood(transcript);
        if (runRef.current === run) notify(message);
      } catch (reason) {
        if (runRef.current !== run) return;
        const message =
          reason instanceof Error ? reason.message : String(reason);
        if (!message.includes("心情语音已取消")) {
          notify(
            `${nextKind === "task" ? "任务" : nextKind === "conversation" ? "人物对话" : "心情"}记录失败：${message || "请稍后重试"}`,
          );
        }
      } finally {
        if (runRef.current === run) reset();
      }
    },
    [notify, recordConversation, recordMood, recordTask, reset],
  );

  const stop = useCallback(async () => {
    if (phaseRef.current !== "listening") return;
    phaseRef.current = "processing";
    setPhase("processing");
    try {
      await nativeService.finishMoodListen();
    } catch (reason) {
      ++runRef.current;
      await nativeService.cancelMoodListen().catch(() => undefined);
      reset();
      const message = reason instanceof Error ? reason.message : String(reason);
      notify(`停止录音失败：${message || "请稍后重试"}`);
    }
  }, [notify, reset]);

  useEffect(
    () => () => {
      ++runRef.current;
      if (phaseRef.current === "listening") {
        void nativeService.cancelMoodListen().catch(() => undefined);
      }
    },
    [],
  );

  return { kind, phase, start, stop };
}
