import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  GlassSettings,
  GameEvent,
  Memory,
  ModelDownloadStatus,
  MoodSnapshot,
  Person,
  Quest,
  Recording,
  SessionState,
} from "../models";
import { modelHub } from "../services/modelHub";
import { nativeService } from "../services/native";
import { processRecordingPipeline } from "../services/recordingPipeline";
import { storage } from "../services/storage";
import {
  completionReward,
  inferQuestCategory,
  recommendedQuest,
} from "../utils/gameRules";

type Updater<T> = T | ((current: T) => T);

interface AppStoreValue {
  quests: Quest[];
  people: Person[];
  memories: Memory[];
  currentMood: MoodSnapshot;
  glassSettings: GlassSettings;
  perception: boolean;
  session: SessionState;
  asrDownload: ModelDownloadStatus | null;
  logs: string[];
  toastMessage: string;
  activeQuestId: string | null;
  gameEvents: GameEvent[];
  updateQuests: (next: Updater<Quest[]>) => void;
  updatePeople: (next: Updater<Person[]>) => void;
  updateMemories: (next: Updater<Memory[]>) => void;
  updateMood: (next: MoodSnapshot) => void;
  updateGlassSettings: (next: Updater<GlassSettings>) => void;
  updatePerception: (next: boolean) => void;
  addQuest: (quest: Quest, focus?: boolean) => void;
  focusQuest: (questId: string) => void;
  toggleQuestStep: (questId: string, stepIndex: number) => void;
  notify: (message: string) => void;
  addLog: (message: string) => void;
  clearLogs: () => void;
  refreshSession: () => Promise<void>;
  refreshModelDownload: (force?: boolean) => Promise<void>;
  connectGlasses: (silent?: boolean) => Promise<void>;
  capture: (mode: "cold" | "hot") => Promise<void>;
  retryLastRecording: () => void;
}

const emptySession: SessionState = {
  phase: "idle",
  session_id: null,
  transport: "未连接",
  completed_captures: 0,
  detail: "",
  last_error: null,
  last_capture: null,
};

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [quests, setQuests] = useState(storage.loadQuests);
  const [people, setPeople] = useState(storage.loadPeople);
  const [memories, setMemories] = useState(storage.loadMemories);
  const [currentMood, setCurrentMood] = useState(storage.loadMood);
  const [gameEvents, setGameEvents] = useState(storage.loadGameEvents);
  const [activeQuestId, setActiveQuestId] = useState(storage.loadActiveQuestId);
  const [glassSettings, setGlassSettings] = useState(storage.loadGlassSettings);
  const [perception, setPerception] = useState(storage.loadPerception);
  const [session, setSession] = useState<SessionState>(emptySession);
  const [asrDownload, setAsrDownload] = useState<ModelDownloadStatus | null>(
    null,
  );
  const [logs, setLogs] = useState([
    "系统启动 · 记忆索引加载完成",
    "端侧 MNN 人物模型待命",
    "等待连接眼镜",
  ]);
  const [toastMessage, setToastMessage] = useState("");

  const questsRef = useRef(quests);
  const peopleRef = useRef(people);
  const memoriesRef = useRef(memories);
  const settingsRef = useRef(glassSettings);
  const perceptionRef = useRef(perception);
  const sessionRef = useRef(session);
  const asrRef = useRef(asrDownload);
  const gameEventsRef = useRef(gameEvents);
  const activeQuestIdRef = useRef(activeQuestId);
  const connectingRef = useRef(false);
  const syncedSessionRef = useRef<string | null>(null);
  const lastModelStatusFetchRef = useRef(0);
  const processingRecordings = useRef(new Set<number>());
  const recordingRetryAfter = useRef(new Map<number, number>());
  const toastTimer = useRef<number | undefined>(undefined);

  const notify = useCallback((message: string) => {
    window.clearTimeout(toastTimer.current);
    setToastMessage(message);
    toastTimer.current = window.setTimeout(() => setToastMessage(""), 2_000);
  }, []);

  const updateQuests = useCallback((next: Updater<Quest[]>) => {
    setQuests((current) => {
      const value = typeof next === "function" ? next(current) : next;
      questsRef.current = value;
      storage.saveQuests(value);
      return value;
    });
  }, []);

  const updatePeople = useCallback((next: Updater<Person[]>) => {
    setPeople((current) => {
      const value = typeof next === "function" ? next(current) : next;
      peopleRef.current = value;
      storage.savePeople(value);
      return value;
    });
  }, []);

  const updateMemories = useCallback((next: Updater<Memory[]>) => {
    setMemories((current) => {
      const value = typeof next === "function" ? next(current) : next;
      memoriesRef.current = value;
      storage.saveMemories(value);
      return value;
    });
  }, []);

  const updateMood = useCallback((next: MoodSnapshot) => {
    setCurrentMood(next);
    storage.saveMood(next);
  }, []);

  const updateGlassSettings = useCallback((next: Updater<GlassSettings>) => {
    setGlassSettings((current) => {
      const value = typeof next === "function" ? next(current) : next;
      settingsRef.current = value;
      storage.saveGlassSettings(value);
      return value;
    });
  }, []);

  const updatePerception = useCallback((next: boolean) => {
    perceptionRef.current = next;
    setPerception(next);
    storage.savePerception(next);
  }, []);

  const appendGameEvent = useCallback(
    (event: Omit<GameEvent, "id" | "createdAt">) => {
      const value: GameEvent = {
        ...event,
        id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
      };
      setGameEvents((current) => {
        const next = [value, ...current].slice(0, 500);
        gameEventsRef.current = next;
        storage.saveGameEvents(next);
        return next;
      });
      return value;
    },
    [],
  );

  const focusQuest = useCallback(
    (questId: string) => {
      const quest = questsRef.current.find(
        (item) => item.id === questId && item.progress < 100,
      );
      if (!quest) return;
      activeQuestIdRef.current = questId;
      setActiveQuestId(questId);
      storage.saveActiveQuestId(questId);
      updateQuests((items) =>
        items.map((item) =>
          item.id === questId ? { ...item, status: "active" } : item,
        ),
      );
      appendGameEvent({
        type: "task_focused",
        questId,
        source: "user",
        summary: `设为当前任务 · ${quest.title}`,
      });
      notify(`正在专注「${quest.title}」`);
    },
    [appendGameEvent, notify, updateQuests],
  );

  const addQuest = useCallback(
    (quest: Quest, focus = false) => {
      const normalized: Quest = {
        ...quest,
        category: quest.category ?? inferQuestCategory(quest),
        status: focus ? "active" : (quest.status ?? "inbox"),
        source: quest.source ?? "manual",
        assignerPersonId: quest.assignerPersonId ?? quest.personId,
        createdAt: quest.createdAt ?? new Date().toISOString(),
      };
      updateQuests((items) => [normalized, ...items]);
      appendGameEvent({
        type: "task_created",
        questId: normalized.id,
        personId: normalized.assignerPersonId,
        source: normalized.source === "voice" ? "asr" : "user",
        summary: `创建任务 · ${normalized.title}`,
      });
      if (
        focus ||
        !recommendedQuest(questsRef.current, activeQuestIdRef.current)
      ) {
        activeQuestIdRef.current = normalized.id;
        setActiveQuestId(normalized.id);
        storage.saveActiveQuestId(normalized.id);
      }
    },
    [appendGameEvent, updateQuests],
  );

  const toggleQuestStep = useCallback(
    (questId: string, stepIndex: number) => {
      const quest = questsRef.current.find((item) => item.id === questId);
      if (!quest || !quest.steps.length) return;
      const completed = Math.round((quest.progress * quest.steps.length) / 100);
      const progress = Math.round(
        (100 * (stepIndex < completed ? stepIndex : stepIndex + 1)) /
          quest.steps.length,
      );
      const completedNow = quest.progress < 100 && progress === 100;
      const nextQuests = questsRef.current.map((item) =>
        item.id === questId
          ? {
              ...item,
              progress,
              status:
                progress === 100 ? ("done" as const) : ("active" as const),
              completedAt:
                progress === 100
                  ? (item.completedAt ?? new Date().toISOString())
                  : undefined,
            }
          : item,
      );
      updateQuests(nextQuests);
      appendGameEvent({
        type: "task_progressed",
        questId,
        progress,
        source: "user",
        summary: `任务进度 · ${quest.title} ${progress}%`,
      });
      if (!completedNow) return;
      const alreadyRewarded = gameEventsRef.current.some(
        (event) => event.type === "task_completed" && event.questId === questId,
      );
      if (alreadyRewarded) return;
      const reward = completionReward(quest, gameEventsRef.current);
      appendGameEvent({
        type: "task_completed",
        questId,
        personId: reward.personId,
        vitalityDelta: reward.vitalityDelta,
        source: "user",
        summary: `完成任务 · ${quest.title}`,
      });
      if (reward.personId && reward.affinityDelta > 0) {
        updatePeople((items) =>
          items.map((person) =>
            person.id === reward.personId
              ? {
                  ...person,
                  affinity: Math.min(
                    100,
                    person.affinity + reward.affinityDelta,
                  ),
                }
              : person,
          ),
        );
        appendGameEvent({
          type: "affinity_changed",
          questId,
          personId: reward.personId,
          affinityDelta: reward.affinityDelta,
          source: "system",
          summary: `履行承诺 · 好感度 +${reward.affinityDelta}`,
        });
      }
      if (
        !memoriesRef.current.some((item) => item.id === `complete-${questId}`)
      ) {
        updateMemories((items) => [
          {
            id: `complete-${questId}`,
            time: new Date().toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            title: `任务完成 · ${quest.title}`,
            meta: `生命力 +${reward.vitalityDelta} · ${quest.reward}`,
            kind: "task",
            personIds: reward.personId ? [reward.personId] : [],
            taskIds: [questId],
          },
          ...items,
        ]);
      }
      if (activeQuestIdRef.current === questId) {
        const next = recommendedQuest(nextQuests, null);
        activeQuestIdRef.current = next?.id ?? null;
        setActiveQuestId(next?.id ?? null);
        storage.saveActiveQuestId(next?.id ?? null);
      }
      notify(
        `任务完成 · 生命力 +${reward.vitalityDelta}${reward.affinityDelta ? ` · 好感度 +${reward.affinityDelta}` : ""}`,
      );
    },
    [appendGameEvent, notify, updateMemories, updatePeople, updateQuests],
  );

  const appendLog = useCallback((message: string) => {
    setLogs((current) => [message, ...current]);
  }, []);

  const refreshModelDownload = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastModelStatusFetchRef.current < 1_500) return;
    lastModelStatusFetchRef.current = now;
    try {
      const next = await nativeService.modelDownloadStatus();
      asrRef.current = next;
      setAsrDownload(next);
    } catch {
      // Browser preview and Android builds without the model plugin use the empty state.
    }
  }, []);

  const syncGlassSettings = useCallback(
    async (nextSession: SessionState) => {
      if (
        nextSession.phase !== "ready" ||
        !nextSession.session_id ||
        syncedSessionRef.current === nextSession.session_id
      )
        return;
      syncedSessionRef.current = nextSession.session_id;
      const settings = settingsRef.current;
      try {
        await nativeService.setPersonAlert(settings.personAlert === "poster");
        await nativeService.setPerception(
          perceptionRef.current,
          settings.framesPerSecond,
          settings.width,
          settings.quality,
        );
        appendLog(
          `眼镜参数已同步 · ${settings.framesPerSecond} FPS / ${settings.width}px / Q${settings.quality}`,
        );
      } catch {
        syncedSessionRef.current = null;
      }
    },
    [appendLog],
  );

  const ingestState = useCallback(
    (nextSession: SessionState) => {
      const now = new Date().toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      });
      let nextMemories = memoriesRef.current;
      const recording = nextSession.last_recording;
      if (
        recording &&
        !nextMemories.some(
          (item) => item.id === `recording-${recording.recording_id}`,
        )
      ) {
        nextMemories = [
          {
            id: `recording-${recording.recording_id}`,
            time: now,
            title: `眼镜对话录音 #${recording.recording_id}`,
            meta: `${(recording.duration_ms / 1_000).toFixed(1)} 秒 · ${Math.round(recording.bytes / 1_024)} KB · 待转写`,
            kind: "recording",
          },
          ...nextMemories,
        ];
      }
      const match = nextSession.last_face?.matches.find(
        (item) => item.decision === "known" && item.person_id,
      );
      if (match && nextSession.last_face) {
        const id = `face-${nextSession.last_face.request_id}-${match.person_id}`;
        if (!nextMemories.some((item) => item.id === id)) {
          const known = peopleRef.current.find(
            (item) => item.id === match.person_id,
          );
          nextMemories = [
            {
              id,
              time: now,
              title: `再次遇见 ${known?.name ?? match.person_id}`,
              meta: `眼镜人物识别 · 相似度 ${match.score.toFixed(3)}`,
              kind: "person",
            },
            ...nextMemories,
          ];
        }
      }
      const choice = nextSession.last_person_choice;
      if (choice) {
        const id = `person-choice-${choice.event_id}`;
        if (!nextMemories.some((item) => item.id === id)) {
          const known = peopleRef.current.find(
            (item) => item.id === choice.person_id,
          );
          nextMemories = [
            {
              id,
              time: now,
              title: `对 ${known?.name ?? "陌生人"} 选择「${choice.label}」`,
              meta: `眼镜触摸区 · 选项 ${choice.choice_index + 1} · 已回传手机`,
              kind: "person",
              personIds: known ? [known.id] : [],
            },
            ...nextMemories,
          ];
          appendLog(
            `人物选项已回传 · ${known?.name ?? choice.person_id} · ${choice.label}`,
          );
        }
      }
      if (nextMemories !== memoriesRef.current) updateMemories(nextMemories);
    },
    [appendLog, updateMemories],
  );

  const processRecording = useCallback(
    async (recording: Recording) => {
      if (
        processingRecordings.current.has(recording.recording_id) ||
        (recordingRetryAfter.current.get(recording.recording_id) ?? 0) >
          Date.now()
      )
        return;
      processingRecordings.current.add(recording.recording_id);
      try {
        const previousQuestIds = new Set(
          questsRef.current.map((item) => item.id),
        );
        const previousPeople = new Map(
          peopleRef.current.map((person) => [person.id, person]),
        );
        const result = await processRecordingPipeline(recording, {
          quests: questsRef.current,
          people: peopleRef.current,
          memories: memoriesRef.current,
        });
        updateQuests(result.quests);
        const today = new Date().toLocaleDateString("zh-CN");
        const rewardedPeople = result.people.map((person) => {
          const previous = previousPeople.get(person.id);
          if (!previous || person.affinity <= previous.affinity) return person;
          const gainedToday = gameEventsRef.current
            .filter(
              (event) =>
                event.personId === person.id &&
                (event.affinityDelta ?? 0) > 0 &&
                new Date(event.createdAt).toLocaleDateString("zh-CN") === today,
            )
            .reduce((sum, event) => sum + (event.affinityDelta ?? 0), 0);
          const delta = Math.max(
            0,
            Math.min(8 - gainedToday, person.affinity - previous.affinity),
          );
          if (delta > 0) {
            appendGameEvent({
              type: "affinity_changed",
              personId: person.id,
              affinityDelta: delta,
              source: "asr",
              summary: `共同对话 · ${person.name} 好感度 +${delta}`,
            });
          }
          return { ...person, affinity: previous.affinity + delta };
        });
        updatePeople(rewardedPeople);
        updateMemories(result.memories);
        result.quests
          .filter((quest) => !previousQuestIds.has(quest.id))
          .forEach((quest) =>
            appendGameEvent({
              type: "task_created",
              questId: quest.id,
              personId: quest.assignerPersonId ?? quest.personId,
              source: "asr",
              summary: `对话生成任务 · ${quest.title}`,
            }),
          );
        [...result.logs].reverse().forEach(appendLog);
      } catch (error) {
        const message = error instanceof Error ? error.message : "录音处理失败";
        appendLog(`录音 #${recording.recording_id} · ${message}`);
        if (!asrRef.current?.ready) {
          processingRecordings.current.delete(recording.recording_id);
          recordingRetryAfter.current.set(
            recording.recording_id,
            Date.now() + 15_000,
          );
          void refreshModelDownload(true);
        }
      }
    },
    [
      appendLog,
      appendGameEvent,
      refreshModelDownload,
      updateMemories,
      updatePeople,
      updateQuests,
    ],
  );

  const refreshSession = useCallback(async () => {
    try {
      const next = await nativeService.sessionState();
      sessionRef.current = next;
      setSession(next);
      void syncGlassSettings(next);
      ingestState(next);
      if (next.last_recording) void processRecording(next.last_recording);
    } catch {
      // The browser UI baseline intentionally runs without a Tauri host.
    }
  }, [ingestState, processRecording, syncGlassSettings]);

  const connectGlasses = useCallback(
    async (silent = false) => {
      if (connectingRef.current) return;
      connectingRef.current = true;
      try {
        const devices = await nativeService.pairedGlasses();
        const selected =
          devices.find((item) => /rokid|glass/i.test(item.name)) ?? devices[0];
        if (!selected) throw new Error("no paired glasses");
        syncedSessionRef.current = null;
        const next = await nativeService.beginSession(selected.address);
        sessionRef.current = next;
        setSession(next);
        localStorage.setItem("realtopia.glassName", selected.name);
        appendLog(`已选择 ${selected.name}，正在建立 CXR 会话`);
        if (!silent) notify(`正在连接 ${selected.name}`);
      } catch {
        if (!silent) notify("未找到已配对眼镜，请打开蓝牙设置");
      } finally {
        connectingRef.current = false;
      }
    },
    [appendLog, notify],
  );

  const capture = useCallback(
    async (mode: "cold" | "hot") => {
      const settings = settingsRef.current;
      try {
        const result = await nativeService.requestCapture(
          mode,
          settings.width,
          settings.quality,
        );
        appendLog(
          `#${result.request_id} ${mode} · ${settings.width}px / Q${settings.quality}`,
        );
        notify(`拍摄 #${result.request_id} 已发送`);
        window.setTimeout(() => void refreshSession(), 900);
      } catch {
        notify("眼镜尚未连接");
      }
    },
    [appendLog, notify, refreshSession],
  );

  const retryLastRecording = useCallback(() => {
    const recording = sessionRef.current.last_recording;
    if (!recording) return;
    processingRecordings.current.delete(recording.recording_id);
    void processRecording(recording);
  }, [processRecording]);

  useEffect(() => {
    void modelHub.refreshSecureConfig().catch(() => undefined);
    void refreshSession();
    void refreshModelDownload(true);
    if (!sessionRef.current.session_id) void connectGlasses(true);
    const sessionTimer = window.setInterval(() => void refreshSession(), 100);
    const modelTimer = window.setInterval(
      () => void refreshModelDownload(),
      2_000,
    );
    return () => {
      window.clearInterval(sessionTimer);
      window.clearInterval(modelTimer);
      window.clearTimeout(toastTimer.current);
    };
  }, [connectGlasses, refreshModelDownload, refreshSession]);

  const value = useMemo<AppStoreValue>(
    () => ({
      quests,
      people,
      memories,
      currentMood,
      glassSettings,
      perception,
      session,
      asrDownload,
      logs,
      toastMessage,
      activeQuestId,
      gameEvents,
      updateQuests,
      updatePeople,
      updateMemories,
      updateMood,
      updateGlassSettings,
      updatePerception,
      addQuest,
      focusQuest,
      toggleQuestStep,
      notify,
      addLog: appendLog,
      clearLogs: () => setLogs([]),
      refreshSession,
      refreshModelDownload,
      connectGlasses,
      capture,
      retryLastRecording,
    }),
    [
      asrDownload,
      activeQuestId,
      addQuest,
      appendLog,
      capture,
      connectGlasses,
      currentMood,
      glassSettings,
      gameEvents,
      logs,
      memories,
      notify,
      people,
      perception,
      focusQuest,
      quests,
      refreshModelDownload,
      refreshSession,
      retryLastRecording,
      session,
      toastMessage,
      toggleQuestStep,
      updateGlassSettings,
      updateMemories,
      updateMood,
      updatePeople,
      updatePerception,
      updateQuests,
    ],
  );

  return (
    <AppStoreContext.Provider value={value}>
      {children}
    </AppStoreContext.Provider>
  );
}

export function useAppStore() {
  const value = useContext(AppStoreContext);
  if (!value)
    throw new Error("useAppStore must be used inside AppStoreProvider");
  return value;
}
