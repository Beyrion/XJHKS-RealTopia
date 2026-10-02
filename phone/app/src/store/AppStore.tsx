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
  ExtractedInteractionEvent,
  ConversationTurn,
  DialogueSuggestion,
  GlassSettings,
  GameEvent,
  Memory,
  ModelDownloadStatus,
  MoodSnapshot,
  Person,
  PersonChoiceResult,
  Quest,
  Recording,
  SceneObservationStatus,
  SessionState,
  Souvenir,
  WorldEvent,
} from "../models";
import { modelHub } from "../services/modelHub";
import { nativeService } from "../services/native";
import {
  immediateConversationInsight,
  processRecordingPipeline,
  transcribeRecordingLocally,
} from "../services/recordingPipeline";
import { storage } from "../services/storage";
import {
  completionReward,
  conversationAffinityReward,
  inferQuestCategory,
  recommendedQuest,
} from "../utils/gameRules";
import {
  linkSceneObservation,
  sceneSimilarity,
} from "../utils/sceneObservation";
import { proposeWorldEvent } from "../utils/worldEventPlanner";
import { souvenirForQuest } from "../utils/souvenir";

const SCENE_OBSERVATION_INTERVAL_MS = 60_000;
const SCENE_OBSERVATION_FAST_RETRY_MS = 1_000;
const SCENE_OBSERVATION_DEGRADED_RETRY_MS = 5_000;
const SCENE_PROGRESS_COOLDOWN_MS = 5 * 60_000;
const SCENE_CONFIRMATION_WINDOW_MS = 3 * 60_000;
const WORLD_EVENT_COOLDOWN_MS = 30 * 60_000;
const TASK_FLOW_TIMEOUT_MS = 2 * 60_000;
const AUTO_RESPONSE_GUARD_TIMEOUT_MS = 45_000;
const SCENE_VL_MODEL = "MNN/Qwen3-VL-2B-Instruct-MNN";
const SCENE_PROMPT =
  "请只用一句中文客观描述第一人称视野中的地点、主要人物、物体和正在发生的动作，不超过50个汉字。不要解释过程，不要猜测身份或看不清的文字。";

type Updater<T> = T | ((current: T) => T);

interface ExclusiveTaskFlow {
  conversationId: number;
  recordingId: number;
  personId: string;
  startedAt: number;
}

interface PhoneConversationCapture {
  conversationId: number;
  recordingId: number;
  personId: string;
  recording: Promise<Recording>;
}

interface SuggestionResponseSession {
  conversationId: number;
  contextId: string;
  turnId: string | null;
  suggestions: DialogueSuggestion[];
  token: number;
  timeoutId: number;
  closing: boolean;
}

function compactSpokenResponse(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}

function responseTokens(value: string) {
  const clean = value
    .toLowerCase()
    .replace(/[，。！？、,.!?\s]/g, "")
    .replace(/[啊呀吧呢嘛哦嗯]/g, "");
  const tokens = new Set<string>();
  for (const character of clean) tokens.add(character);
  for (let index = 0; index < clean.length - 1; index++)
    tokens.add(clean.slice(index, index + 2));
  return { clean, tokens };
}

function matchSpokenSuggestion(
  transcript: string,
  suggestions: DialogueSuggestion[],
) {
  const spoken = responseTokens(transcript);
  let best: { suggestion: DialogueSuggestion; score: number } | null = null;
  for (const suggestion of suggestions) {
    const candidate = responseTokens(suggestion.label);
    let score = 0;
    if (
      spoken.clean &&
      candidate.clean &&
      (spoken.clean.includes(candidate.clean) ||
        candidate.clean.includes(spoken.clean))
    ) {
      score =
        Math.min(spoken.clean.length, candidate.clean.length) /
        Math.max(spoken.clean.length, candidate.clean.length);
    } else {
      let intersection = 0;
      for (const token of spoken.tokens)
        if (candidate.tokens.has(token)) intersection += 1;
      const union = new Set([...spoken.tokens, ...candidate.tokens]).size;
      score = union ? intersection / union : 0;
    }
    if (!best || score > best.score) best = { suggestion, score };
  }
  return best && best.score >= 0.45 ? best.suggestion : null;
}

interface AppStoreValue {
  quests: Quest[];
  people: Person[];
  memories: Memory[];
  currentMood: MoodSnapshot;
  glassSettings: GlassSettings;
  perception: boolean;
  session: SessionState;
  asrDownload: ModelDownloadStatus | null;
  modelDownloads: ModelDownloadStatus[];
  logs: string[];
  toastMessage: string;
  activeQuestId: string | null;
  gameEvents: GameEvent[];
  sceneObservationEnabled: boolean;
  sceneObservationStatus: SceneObservationStatus;
  worldEvents: WorldEvent[];
  souvenirs: Souvenir[];
  newSouvenir: Souvenir | null;
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
  updateSceneObservationEnabled: (enabled: boolean) => void;
  runSceneObservation: (manual?: boolean) => Promise<void>;
  retryLastRecording: () => void;
  acceptWorldEvent: (eventId: string) => void;
  ignoreWorldEvent: (eventId: string) => void;
  dismissSouvenir: () => void;
  applyConversationInteractions: (
    interactions: ExtractedInteractionEvent[],
    sourceKey: string,
  ) => void;
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
  const [worldEvents, setWorldEvents] = useState(storage.loadWorldEvents);
  const [souvenirs, setSouvenirs] = useState(storage.loadSouvenirs);
  const [newSouvenir, setNewSouvenir] = useState<Souvenir | null>(null);
  const [activeQuestId, setActiveQuestId] = useState(storage.loadActiveQuestId);
  const [glassSettings, setGlassSettings] = useState(storage.loadGlassSettings);
  const [perception, setPerception] = useState(storage.loadPerception);
  const [session, setSession] = useState<SessionState>(emptySession);
  const [asrDownload, setAsrDownload] = useState<ModelDownloadStatus | null>(
    null,
  );
  const [modelDownloads, setModelDownloads] = useState<ModelDownloadStatus[]>(
    [],
  );
  const [logs, setLogs] = useState([
    "系统启动 · 记忆索引加载完成",
    "端侧 MNN 人物模型待命",
    "等待连接眼镜",
  ]);
  const [toastMessage, setToastMessage] = useState("");
  const [sceneObservationEnabled, setSceneObservationEnabled] = useState(
    storage.loadSceneObservationEnabled,
  );
  const sceneNextAtRef = useRef(Date.now() + SCENE_OBSERVATION_INTERVAL_MS);
  const sceneFailureCountRef = useRef(0);
  const [sceneObservationStatus, setSceneObservationStatus] =
    useState<SceneObservationStatus>({
      running: false,
      lastObservedAt: null,
      nextRunAt: new Date(sceneNextAtRef.current).toISOString(),
      lastSummary: null,
      lastError: null,
      lastLatencyMs: null,
    });

  const questsRef = useRef(quests);
  const peopleRef = useRef(people);
  const memoriesRef = useRef(memories);
  const currentMoodRef = useRef(currentMood);
  const settingsRef = useRef(glassSettings);
  const perceptionRef = useRef(perception);
  const sessionRef = useRef(session);
  const asrRef = useRef(asrDownload);
  const gameEventsRef = useRef(gameEvents);
  const worldEventsRef = useRef(worldEvents);
  const souvenirsRef = useRef(souvenirs);
  const activeQuestIdRef = useRef(activeQuestId);
  const modelDownloadsRef = useRef(modelDownloads);
  const sceneObservationEnabledRef = useRef(sceneObservationEnabled);
  const sceneObservationInFlightRef = useRef(false);
  const connectingRef = useRef(false);
  const syncedSessionRef = useRef<string | null>(null);
  const lastModelStatusFetchRef = useRef(0);
  const processingRecordings = useRef(new Set<number>());
  const taskFlowRef = useRef<ExclusiveTaskFlow | null>(null);
  const taskFlowTimeoutRef = useRef<number | undefined>(undefined);
  const phoneConversationRef = useRef<PhoneConversationCapture | null>(null);
  const handledRecordingControlIdsRef = useRef(new Set<number>());
  const handledRecordingIdsRef = useRef(new Set<number>());
  const conversationSuggestionSequenceRef = useRef(new Map<number, number>());
  const conversationTranscriptRef = useRef(new Map<number, string>());
  const conversationHistoryRef = useRef(storage.loadConversationHistory());
  const selectedDialogueContextsRef = useRef(
    new Set(
      conversationHistoryRef.current
        .filter((item) => item.selectedAt)
        .map((item) => `conversation-${item.conversationId}`),
    ),
  );
  const closedDialogueContextsRef = useRef(
    new Set(selectedDialogueContextsRef.current),
  );
  const suggestionResponseRef = useRef<SuggestionResponseSession | null>(null);
  const nextSuggestionResponseTokenRef = useRef(1);
  const recordingRetryAfter = useRef(new Map<number, number>());
  const toastTimer = useRef<number | undefined>(undefined);

  const saveConversationTurn = useCallback((turn: ConversationTurn) => {
    conversationHistoryRef.current = storage.upsertConversationTurn(turn);
  }, []);

  const updateConversationTurn = useCallback(
    (turnId: string, update: Partial<ConversationTurn>) => {
      const current = conversationHistoryRef.current.find(
        (item) => item.id === turnId,
      );
      if (current) saveConversationTurn({ ...current, ...update });
    },
    [saveConversationTurn],
  );

  const saveDialogueResponse = useCallback(
    (
      contextId: string,
      response: {
        choiceId: string;
        label: string;
        source: "manual" | "voice";
        spokenResponse?: string;
      },
    ) => {
      if (selectedDialogueContextsRef.current.has(contextId)) return;
      selectedDialogueContextsRef.current.add(contextId);
      closedDialogueContextsRef.current.add(contextId);
      const match = /^conversation-(\d+)$/.exec(contextId);
      if (!match) return;
      const conversationId = Number(match[1]);
      const turn = conversationHistoryRef.current.find(
        (item) => item.conversationId === conversationId,
      );
      if (!turn) return;
      saveConversationTurn({
        ...turn,
        selectedSuggestionId: response.choiceId,
        selectedSuggestionLabel: response.label,
        selectedAt: new Date().toISOString(),
        responseSource: response.source,
        spokenResponse: response.spokenResponse,
        responseCompletedAt: new Date().toISOString(),
      });
    },
    [saveConversationTurn],
  );

  const markDialogueSuggestionSelected = useCallback(
    (choice: PersonChoiceResult) => {
      if (choice.kind !== "dialogue" || !choice.context_id) return;
      saveDialogueResponse(choice.context_id, {
        choiceId: choice.choice_id,
        label: choice.label,
        source: "manual",
      });
    },
    [saveDialogueResponse],
  );

  const markRecordingHandled = useCallback((recordingId: number) => {
    const handled = handledRecordingIdsRef.current;
    handled.add(recordingId);
    while (handled.size > 512) {
      const oldest = handled.values().next().value as number | undefined;
      if (oldest === undefined) break;
      handled.delete(oldest);
    }
  }, []);

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

  const updateWorldEvents = useCallback((next: Updater<WorldEvent[]>) => {
    setWorldEvents((current) => {
      const value = typeof next === "function" ? next(current) : next;
      worldEventsRef.current = value;
      storage.saveWorldEvents(value);
      return value;
    });
  }, []);

  const updateSouvenirs = useCallback((next: Updater<Souvenir[]>) => {
    setSouvenirs((current) => {
      const value = typeof next === "function" ? next(current) : next;
      souvenirsRef.current = value;
      storage.saveSouvenirs(value);
      return value;
    });
  }, []);

  const updateMood = useCallback((next: MoodSnapshot) => {
    currentMoodRef.current = next;
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

  const updateSceneObservationEnabled = useCallback((enabled: boolean) => {
    sceneObservationEnabledRef.current = enabled;
    setSceneObservationEnabled(enabled);
    storage.saveSceneObservationEnabled(enabled);
    sceneFailureCountRef.current = 0;
    sceneNextAtRef.current = Date.now() + SCENE_OBSERVATION_INTERVAL_MS;
    setSceneObservationStatus((current) => ({
      ...current,
      nextRunAt: enabled
        ? new Date(sceneNextAtRef.current).toISOString()
        : null,
      lastError: null,
    }));
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

  const settleConversationInteractions = useCallback(
    (
      basePeople: Person[],
      interactions: ExtractedInteractionEvent[],
      sourceKey: string,
    ) =>
      basePeople.map((person) => {
        const previous = peopleRef.current.find(
          (item) => item.id === person.id,
        );
        if (!previous) return person;
        const relevant = interactions.filter(
          (item) => item.personId === person.id,
        );
        if (!relevant.length) return { ...person, affinity: previous.affinity };
        const dedupeKey = `${sourceKey}-${person.id}`;
        const reward = conversationAffinityReward(
          previous,
          gameEventsRef.current,
          relevant,
          dedupeKey,
        );
        const evidence = relevant.find((item) => item.evidence)?.evidence;
        if (
          !gameEventsRef.current.some((event) => event.dedupeKey === dedupeKey)
        ) {
          appendGameEvent({
            type: "conversation_recorded",
            personId: person.id,
            interactionType: relevant[0].type,
            evidence,
            dedupeKey,
            source: "asr",
            summary: `记录对话 · ${person.name} · ${reward.reason}`,
          });
        }
        if (reward.delta > 0) {
          appendGameEvent({
            type: "affinity_changed",
            personId: person.id,
            affinityDelta: reward.delta,
            interactionType: relevant[0].type,
            evidence,
            dedupeKey: `${dedupeKey}-affinity`,
            source: "asr",
            summary: `${reward.reason} · ${person.name} 好感度 +${reward.delta}`,
          });
        }
        return {
          ...person,
          affinity: Math.min(100, previous.affinity + reward.delta),
        };
      }),
    [appendGameEvent],
  );

  const applyConversationInteractions = useCallback(
    (interactions: ExtractedInteractionEvent[], sourceKey: string) => {
      updatePeople((items) =>
        settleConversationInteractions(items, interactions, sourceKey),
      );
    },
    [settleConversationInteractions, updatePeople],
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

  const acceptWorldEvent = useCallback(
    (eventId: string) => {
      if (taskFlowRef.current) {
        notify("当前人物任务生成完成后才能处理世界事件");
        return;
      }
      const event = worldEventsRef.current.find(
        (item) => item.id === eventId && item.status === "pending",
      );
      if (!event) return;
      const person = peopleRef.current.find(
        (item) => item.id === event.quest.personId,
      );
      const questId = `quest-${event.id}`;
      if (!questsRef.current.some((item) => item.id === questId)) {
        addQuest(
          {
            id: questId,
            group: "世界事件",
            title: event.quest.title,
            meta: `${event.quest.deadline ?? "今天"} · ${event.locationLabel}`,
            body: event.quest.body,
            priority: "普通",
            progress: 0,
            steps: event.quest.steps,
            personId: person?.id,
            person: person?.name,
            reward: event.quest.reward,
            status: "active",
            source: "world-event",
            assignerPersonId: person?.id,
            deadline: event.quest.deadline,
            createdAt: new Date().toISOString(),
          },
          true,
        );
      }
      updateWorldEvents((items) =>
        items.map((item) =>
          item.id === eventId ? { ...item, status: "accepted" } : item,
        ),
      );
      appendGameEvent({
        type: "world_event_accepted",
        questId,
        personId: person?.id,
        source: "user",
        dedupeKey: `accepted-${eventId}`,
        summary: `接受世界事件 · ${event.title}`,
      });
      notify(`已接受「${event.title}」`);
    },
    [addQuest, appendGameEvent, notify, updateWorldEvents],
  );

  const ignoreWorldEvent = useCallback(
    (eventId: string) => {
      if (taskFlowRef.current) {
        notify("当前人物任务生成完成后才能处理世界事件");
        return;
      }
      const event = worldEventsRef.current.find(
        (item) => item.id === eventId && item.status === "pending",
      );
      if (!event) return;
      updateWorldEvents((items) =>
        items.map((item) =>
          item.id === eventId ? { ...item, status: "ignored" } : item,
        ),
      );
      appendGameEvent({
        type: "world_event_ignored",
        personId: event.personIds[0],
        source: "user",
        dedupeKey: `ignored-${eventId}`,
        summary: `忽略世界事件 · ${event.title}`,
      });
      notify("已忽略这次世界事件");
    },
    [appendGameEvent, notify, updateWorldEvents],
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
      const currentAffinity = peopleRef.current.find(
        (person) => person.id === (quest.assignerPersonId ?? quest.personId),
      )?.affinity;
      const reward = completionReward(
        quest,
        gameEventsRef.current,
        currentAffinity,
      );
      appendGameEvent({
        type: "task_completed",
        questId,
        personId: reward.personId,
        vitalityDelta: reward.vitalityDelta,
        dedupeKey: `task-completed-${questId}`,
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
          dedupeKey: `task-completed-${questId}-affinity`,
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
            personMemoryKind: reward.personId ? "task_completed" : undefined,
            evidence: `用户将任务进度更新为 100%：${quest.title}`,
            confidence: 1,
            status: "active",
            dedupeKey: `task-completed-${questId}-memory`,
          },
          ...items,
        ]);
      }
      if (!souvenirsRef.current.some((item) => item.questId === questId)) {
        const person = peopleRef.current.find(
          (item) => item.id === (quest.assignerPersonId ?? quest.personId),
        );
        const souvenir = souvenirForQuest(quest, person);
        updateSouvenirs((items) => [souvenir, ...items]);
        setNewSouvenir(souvenir);
        appendGameEvent({
          type: "souvenir_unlocked",
          questId,
          personId: souvenir.personId,
          dedupeKey: `souvenir-${questId}`,
          source: "system",
          summary: `获得纪念品 · ${souvenir.name}`,
        });
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
    [
      appendGameEvent,
      notify,
      updateMemories,
      updatePeople,
      updateQuests,
      updateSouvenirs,
    ],
  );

  const appendLog = useCallback((message: string) => {
    setLogs((current) => [message, ...current]);
  }, []);

  const restoreGlassAfterTaskFlow = useCallback(() => {
    const settings = settingsRef.current;
    void nativeService
      .setPersonAlert(settings.personAlert === "poster")
      .catch(() => undefined);
    void nativeService
      .setPerception(
        perceptionRef.current,
        settings.framesPerSecond,
        settings.width,
        settings.quality,
      )
      .catch(() => undefined);
  }, []);

  const releaseTaskFlow = useCallback(
    (conversationId: number, message: string) => {
      if (taskFlowRef.current?.conversationId !== conversationId) return;
      taskFlowRef.current = null;
      window.clearTimeout(taskFlowTimeoutRef.current);
      taskFlowTimeoutRef.current = undefined;
      sceneNextAtRef.current = Date.now() + SCENE_OBSERVATION_INTERVAL_MS;
      restoreGlassAfterTaskFlow();
      appendLog(message);
    },
    [appendLog, restoreGlassAfterTaskFlow],
  );

  const beginTaskFlow = useCallback(
    (conversationId: number, recordingId: number, personId: string) => {
      const current = taskFlowRef.current;
      if (current) return current.conversationId === conversationId;
      taskFlowRef.current = {
        conversationId,
        recordingId,
        personId,
        startedAt: Date.now(),
      };
      window.clearTimeout(taskFlowTimeoutRef.current);
      taskFlowTimeoutRef.current = window.setTimeout(() => {
        if (taskFlowRef.current?.conversationId !== conversationId) return;
        taskFlowRef.current = null;
        taskFlowTimeoutRef.current = undefined;
        sceneNextAtRef.current = Date.now() + SCENE_OBSERVATION_INTERVAL_MS;
        restoreGlassAfterTaskFlow();
        appendLog("独占任务流程超时，已恢复其他事件；本次录音可手动重试");
      }, TASK_FLOW_TIMEOUT_MS);
      const settings = settingsRef.current;
      void nativeService.setPersonAlert(false).catch(() => undefined);
      void nativeService
        .setPerception(
          false,
          settings.framesPerSecond,
          settings.width,
          settings.quality,
        )
        .catch(() => undefined);
      sceneNextAtRef.current = Date.now() + TASK_FLOW_TIMEOUT_MS;
      const person = peopleRef.current.find((item) => item.id === personId);
      appendLog(
        `进入独占任务流程 · ${person?.name ?? personId} · 暂停人物切换与世界事件`,
      );
      return true;
    },
    [appendLog, restoreGlassAfterTaskFlow],
  );

  const closeSuggestionResponse = useCallback(
    (contextId: string, message: string, cancelAudio: boolean) => {
      const current = suggestionResponseRef.current;
      if (!current || current.contextId !== contextId || current.closing)
        return;
      current.closing = true;
      closedDialogueContextsRef.current.add(contextId);
      window.clearTimeout(current.timeoutId);
      void (async () => {
        if (cancelAudio)
          await nativeService.cancelMoodListen().catch(() => undefined);
        await nativeService.dismissChoiceCard(contextId).catch(() => undefined);
        if (suggestionResponseRef.current?.token !== current.token) return;
        suggestionResponseRef.current = null;
        releaseTaskFlow(current.conversationId, message);
      })();
    },
    [releaseTaskFlow],
  );

  const startAutomaticResponseListening = useCallback(
    (
      conversationId: number,
      contextId: string,
      turnId: string | null,
      suggestions: DialogueSuggestion[],
    ) => {
      if (closedDialogueContextsRef.current.has(contextId)) return;
      const active = suggestionResponseRef.current;
      if (active?.contextId === contextId) {
        active.suggestions = suggestions;
        return;
      }
      if (active) {
        appendLog("上一轮回应仍在收尾，本轮自动音频感知未重复启动");
        return;
      }
      const token = nextSuggestionResponseTokenRef.current++;
      const timeoutId = window.setTimeout(() => {
        if (suggestionResponseRef.current?.token !== token) return;
        closeSuggestionResponse(
          contextId,
          "回应等待超时 · 已结束本轮交互并恢复视觉与场景感知",
          true,
        );
      }, AUTO_RESPONSE_GUARD_TIMEOUT_MS);
      suggestionResponseRef.current = {
        conversationId,
        contextId,
        turnId,
        suggestions,
        token,
        timeoutId,
        closing: false,
      };
      appendLog("回复建议已显示 · 自动音频感知已启动");
      void nativeService
        .listenAutomaticResponse()
        .then((result) => {
          const current = suggestionResponseRef.current;
          if (!current || current.token !== token || current.closing) return;
          const transcript = compactSpokenResponse(result.transcript);
          if (!transcript) {
            closeSuggestionResponse(
              contextId,
              "未感知到清晰回应 · 已结束本轮交互并恢复视觉与场景感知",
              false,
            );
            return;
          }
          const matched = matchSpokenSuggestion(
            transcript,
            current.suggestions,
          );
          saveDialogueResponse(contextId, {
            choiceId: matched?.id ?? "spoken_response",
            label: matched?.label ?? transcript.slice(0, 48),
            source: "voice",
            spokenResponse: transcript,
          });
          appendLog(
            matched
              ? `自动识别回应 · ${transcript} · 匹配建议「${matched.label}」`
              : `自动识别自由回应 · ${transcript}`,
          );
          closeSuggestionResponse(
            contextId,
            "已识别用户回应 · 本轮交互完成，恢复视觉与场景感知",
            false,
          );
        })
        .catch((error) => {
          const current = suggestionResponseRef.current;
          if (!current || current.token !== token || current.closing) return;
          appendLog(
            `自动回应感知结束 · ${error instanceof Error ? error.message : String(error)}`,
          );
          closeSuggestionResponse(
            contextId,
            "自动回应感知结束 · 已恢复视觉与场景感知",
            false,
          );
        });
    },
    [appendLog, closeSuggestionResponse, saveDialogueResponse],
  );

  const refreshModelDownload = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastModelStatusFetchRef.current < 1_500) return;
    lastModelStatusFetchRef.current = now;
    try {
      const response = await nativeService.modelDownloadStatuses();
      modelDownloadsRef.current = response.models;
      setModelDownloads(response.models);
      const next =
        response.models.find((item) => item.model_id.includes("Qwen3-ASR")) ??
        null;
      asrRef.current = next;
      setAsrDownload(next);
    } catch {
      // Preserve compatibility with APKs built before multi-model status support.
      try {
        const next = await nativeService.modelDownloadStatus();
        asrRef.current = next;
        setAsrDownload(next);
        modelDownloadsRef.current = [next];
        setModelDownloads([next]);
      } catch {
        // Browser preview and Android builds without the model plugin use empty state.
      }
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
        !recording.partial &&
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
      // Once a recognized-person recording starts, face changes and ambient
      // choices are frozen until the task transaction commits.
      if (!taskFlowRef.current && match && nextSession.last_face) {
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
      if (choice?.kind === "dialogue" && choice.context_id) {
        markDialogueSuggestionSelected(choice);
        closeSuggestionResponse(
          choice.context_id,
          `用户已手选「${choice.label}」· 本轮交互完成，恢复视觉与场景感知`,
          true,
        );
      }
      const choiceBelongsToTaskFlow =
        choice?.kind !== "recording_control" &&
        (!taskFlowRef.current ||
          (choice?.kind !== "world_event" &&
            choice?.person_id === taskFlowRef.current.personId));
      if (choice && choiceBelongsToTaskFlow) {
        const id = `person-choice-${choice.event_id}`;
        if (!nextMemories.some((item) => item.id === id)) {
          const known = peopleRef.current.find(
            (item) => item.id === choice.person_id,
          );
          nextMemories = [
            {
              id,
              time: now,
              title:
                choice.kind === "world_event"
                  ? `世界事件选择「${choice.label}」`
                  : `对 ${known?.name ?? "对话对象"} 选择「${choice.label}」`,
              meta: `眼镜触摸区 · ${choice.kind ?? "person"} · 选项 ${choice.choice_index + 1}`,
              kind: "person",
              personIds: known ? [known.id] : [],
            },
            ...nextMemories,
          ];
          appendLog(
            `眼镜选项已回传 · ${known?.name ?? choice.person_id} · ${choice.label}`,
          );
          if (choice.kind === "world_event" && choice.context_id) {
            if (choice.choice_id === "accept")
              acceptWorldEvent(choice.context_id);
            else if (choice.choice_id === "ignore")
              ignoreWorldEvent(choice.context_id);
          }
        }
      }
      if (nextMemories !== memoriesRef.current) updateMemories(nextMemories);
    },
    [
      acceptWorldEvent,
      appendLog,
      closeSuggestionResponse,
      ignoreWorldEvent,
      markDialogueSuggestionSelected,
      updateMemories,
    ],
  );

  const processRecording = useCallback(
    async (recording: Recording) => {
      if (
        handledRecordingIdsRef.current.has(recording.recording_id) ||
        processingRecordings.current.has(recording.recording_id) ||
        (recordingRetryAfter.current.get(recording.recording_id) ?? 0) >
          Date.now()
      )
        return;
      const incomingConversationId =
        recording.conversation_id ?? recording.recording_id;
      const recognizedPersonId = sessionRef.current.last_face?.matches.find(
        (item) => item.decision === "known" && item.person_id,
      )?.person_id;
      const activeFlow = taskFlowRef.current;
      if (activeFlow && activeFlow.conversationId !== incomingConversationId) {
        markRecordingHandled(recording.recording_id);
        appendLog(
          `录音 #${recording.recording_id} 已忽略 · 当前正在完成上一条人物任务`,
        );
        return;
      }
      if (!activeFlow && recognizedPersonId) {
        beginTaskFlow(
          incomingConversationId,
          recording.recording_id,
          recognizedPersonId,
        );
      }
      processingRecordings.current.add(recording.recording_id);
      try {
        let utterance = recording;
        if (recording.chunk) {
          const vad = await nativeService.acceptVadChunk(
            recording.recording_id,
          );
          appendLog(
            `VAD 分片 #${recording.sequence ?? 0} · ${(vad.probability * 100).toFixed(0)}% · ${vad.latency_ms.toFixed(1)}ms${vad.turn_label ? ` · TurnSense ${vad.turn_label} ${vad.turn_latency_ms.toFixed(1)}ms` : ""}${vad.reason !== "collecting" ? ` · ${vad.reason}` : ""}`,
          );
          if (!vad.ready || !vad.segment) {
            markRecordingHandled(recording.recording_id);
            return;
          }
          utterance = vad.segment;
        }
        const selectedPersonId =
          taskFlowRef.current?.conversationId === incomingConversationId
            ? taskFlowRef.current.personId
            : recognizedPersonId;
        const conversationId =
          utterance.conversation_id ?? utterance.recording_id;
        const sequence = utterance.sequence ?? 0;
        const accumulatedTranscript = !utterance.chunk
          ? conversationTranscriptRef.current.get(conversationId)
          : undefined;
        const finalizesSegmentedConversation = Boolean(accumulatedTranscript);
        const sceneObservedAt = sceneObservationStatus.lastObservedAt
          ? Date.parse(sceneObservationStatus.lastObservedAt)
          : 0;
        const persistedScene = memoriesRef.current.find(
          (item) =>
            item.kind === "activity" &&
            item.observedAt &&
            item.summary &&
            Date.now() - Date.parse(item.observedAt) <=
              SCENE_CONFIRMATION_WINDOW_MS,
        );
        const recentSceneSummary =
          sceneObservationStatus.lastSummary &&
          Date.now() - sceneObservedAt <= SCENE_CONFIRMATION_WINDOW_MS
            ? sceneObservationStatus.lastSummary
            : (persistedScene?.summary ?? null);
        const snapshot = {
          quests: questsRef.current,
          people: peopleRef.current,
          memories: memoriesRef.current,
          selectedPersonId,
          transcriptPrefix: utterance.partial
            ? conversationTranscriptRef.current.get(conversationId)
            : undefined,
          conversationHistory: conversationHistoryRef.current,
          sceneSummary: recentSceneSummary,
          requireTask:
            taskFlowRef.current?.conversationId === incomingConversationId,
        };
        const transcribed = finalizesSegmentedConversation
          ? {
              transcript: accumulatedTranscript!,
              localText: "",
              log: `录音 #${utterance.recording_id} 复用实时分片转写，跳过整段重复 ASR`,
            }
          : await transcribeRecordingLocally(
              utterance,
              snapshot.transcriptPrefix,
            );
        const immediate = immediateConversationInsight(
          transcribed.transcript,
          snapshot,
        );
        const immediateSpeaker = peopleRef.current.find(
          (item) => item.id === (immediate.speakerPersonId ?? selectedPersonId),
        );
        const turnId = finalizesSegmentedConversation
          ? null
          : `${conversationId}-${sequence}`;
        if (turnId)
          saveConversationTurn({
            id: turnId,
            conversationId,
            recordingId: utterance.recording_id,
            sequence,
            transcript: transcribed.localText,
            contextTranscript: transcribed.transcript,
            createdAt: new Date().toISOString(),
            speakerPersonId:
              immediateSpeaker?.id ?? immediate.speakerPersonId ?? null,
            sceneSummary: snapshot.sceneSummary ?? null,
            replySuggestions: immediate.replySuggestions,
            localReplySuggestions: immediate.replySuggestions,
            enhancementStatus: "pending",
          });
        if (utterance.partial)
          conversationTranscriptRef.current.set(
            conversationId,
            transcribed.transcript,
          );
        else conversationTranscriptRef.current.delete(conversationId);

        const latestSequence =
          conversationSuggestionSequenceRef.current.get(conversationId) ?? -1;
        if (!finalizesSegmentedConversation && sequence >= latestSequence) {
          conversationSuggestionSequenceRef.current.set(
            conversationId,
            sequence,
          );
          const contextId = `conversation-${conversationId}`;
          void nativeService
            .showChoiceCard({
              person_id: immediateSpeaker?.id ?? "__conversation__",
              name: immediateSpeaker?.name ?? "对话助手",
              title: immediateSpeaker
                ? `${immediateSpeaker.role} · 即时建议`
                : "实时建议回复",
              affinity: immediateSpeaker?.affinity ?? -2,
              quest:
                questsRef.current.find(
                  (item) =>
                    item.personId === immediateSpeaker?.id &&
                    item.progress < 100,
                )?.title ?? "继续自然交流",
              story: transcribed.transcript.slice(-46),
              choices_json: JSON.stringify({
                kind: "dialogue",
                contextId,
                choices: immediate.replySuggestions,
              }),
            })
            .then(() => {
              appendLog(
                `即时建议已下发 · ${immediateSpeaker?.name ?? "未关联人物"} · ${immediate.replySuggestions.map((item) => item.label).join(" / ")}`,
              );
              if (!utterance.partial)
                startAutomaticResponseListening(
                  conversationId,
                  contextId,
                  turnId,
                  immediate.replySuggestions,
                );
            })
            .catch((error) =>
              appendLog(
                `即时建议暂未下发 · ${error instanceof Error ? error.message : String(error)}`,
              ),
            );
        }

        // Live chunks only drive local ASR and reply hints. Running cloud task
        // extraction for every endpoint would create overlapping task jobs.
        // The one final, complete recording owns the sole LLM transaction.
        if (utterance.partial) {
          if (turnId)
            updateConversationTurn(turnId, {
              enhancementStatus: "fallback",
              enhancementModel: "local-live-asr",
            });
          markRecordingHandled(recording.recording_id);
          return;
        }

        // The durable transcript and immediate reply are already available. Cloud
        // memory/task extraction now runs exactly once for the complete dialogue.
        void (async () => {
          let generatedTaskTitle: string | null = null;
          try {
            const result = await processRecordingPipeline(
              utterance,
              snapshot,
              transcribed,
            );
            if (turnId)
              updateConversationTurn(turnId, {
                speakerPersonId:
                  result.speakerPersonId ?? immediateSpeaker?.id ?? null,
                enhancedReplySuggestions: result.replySuggestions,
                enhancementStatus:
                  result.enhancementSide === "cloud" ? "complete" : "fallback",
                enhancementModel: result.enhancementModel,
                enhancementRecommended:
                  result.enhancementSide === "cloud" &&
                  result.enhanceReplySuggestions,
                enhancementReason: result.enhancementReason,
                enhancementDisplayed: false,
              });
            // State mutations are applied only in utterance order. An older cloud
            // response may enrich its own persisted turn, but cannot overwrite UI.
            const currentSequence =
              conversationSuggestionSequenceRef.current.get(conversationId) ??
              -1;
            if (utterance.partial && sequence < currentSequence) return;
            const previousQuestIds = new Set(
              questsRef.current.map((item) => item.id),
            );
            if (!utterance.partial) {
              updateQuests(result.quests);
              generatedTaskTitle =
                result.generatedQuestIds
                  .map(
                    (id) =>
                      result.quests.find((quest) => quest.id === id)?.title,
                  )
                  .find((title): title is string => Boolean(title)) ?? null;
              const rewardedPeople = settleConversationInteractions(
                result.people,
                result.interactions,
                `conversation-${utterance.recording_id}`,
              );
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
            }
            [...result.logs].reverse().forEach(appendLog);
            const speaker = peopleRef.current.find(
              (item) =>
                item.id === (result.speakerPersonId ?? selectedPersonId),
            );
            const contextId = `conversation-${utterance.conversation_id ?? utterance.recording_id}`;
            updateMemories((items) =>
              items.map((item) =>
                item.id === `recording-${utterance.recording_id}`
                  ? {
                      ...item,
                      title: result.transcript.trim()
                        ? `对话 · ${result.transcript.trim().slice(0, 36)}`
                        : item.title,
                      meta: `${(utterance.duration_ms / 1_000).toFixed(1)} 秒 · ${result.replySuggestions.map((suggestion) => suggestion.label).join(" / ")}`,
                      summary: result.transcript.trim() || "未识别到清晰语音",
                      transcript: result.transcript,
                      personIds: speaker ? [speaker.id] : [],
                      status: "active",
                    }
                  : item,
              ),
            );
            const cloudRecommended =
              result.enhancementSide === "cloud" &&
              result.enhanceReplySuggestions;
            // Pull once immediately before replacing the card. This closes the
            // normal refresh interval gap when a glasses choice has just arrived.
            if (
              cloudRecommended &&
              !closedDialogueContextsRef.current.has(contextId)
            ) {
              const latestChoice = await nativeService
                .sessionState()
                .then((value) => value.last_person_choice)
                .catch(() => null);
              if (
                latestChoice?.kind === "dialogue" &&
                latestChoice.context_id === contextId
              ) {
                markDialogueSuggestionSelected(latestChoice);
                closeSuggestionResponse(
                  contextId,
                  `用户已手选「${latestChoice.label}」· 本轮交互完成，恢复视觉与场景感知`,
                  true,
                );
              }
            }
            if (!cloudRecommended) {
              appendLog(
                `云端保留本地建议 · ${result.enhancementReason || "本地建议已足够"}`,
              );
            } else if (closedDialogueContextsRef.current.has(contextId)) {
              appendLog("本轮回应已经完成 · 云端增强建议不再推送");
            } else {
              await nativeService
                .showChoiceCard({
                  person_id: speaker?.id ?? "__conversation__",
                  name: speaker?.name ?? "对话助手",
                  title: speaker
                    ? `${speaker.role} · 云端增强建议`
                    : "云端增强建议",
                  affinity: speaker?.affinity ?? -2,
                  quest:
                    questsRef.current.find(
                      (item) =>
                        item.personId === speaker?.id && item.progress < 100,
                    )?.title ?? "继续自然交流",
                  story: result.transcript.slice(0, 46),
                  choices_json: JSON.stringify({
                    kind: "dialogue",
                    contextId,
                    source: "cloud_enhanced",
                    choices: result.replySuggestions,
                  }),
                })
                .then(() => {
                  if (turnId)
                    updateConversationTurn(turnId, {
                      enhancementDisplayed: true,
                      replySuggestions: result.replySuggestions,
                    });
                  appendLog(
                    `云端增强建议已覆盖 · ${speaker?.name ?? "未关联人物"} · ${result.replySuggestions.map((item) => item.label).join(" / ")}`,
                  );
                  startAutomaticResponseListening(
                    conversationId,
                    contextId,
                    turnId,
                    result.replySuggestions,
                  );
                })
                .catch((error) =>
                  appendLog(
                    `云端增强建议暂未下发 · ${error instanceof Error ? error.message : String(error)}`,
                  ),
                );
            }
          } catch (error) {
            if (turnId)
              updateConversationTurn(turnId, { enhancementStatus: "failed" });
            appendLog(
              `对话增强失败，已保留本地结果 · ${error instanceof Error ? error.message : String(error)}`,
            );
          } finally {
            if (!utterance.partial) {
              const responseSession = suggestionResponseRef.current;
              if (
                responseSession?.contextId === `conversation-${conversationId}`
              )
                appendLog("云端处理完成 · 继续等待用户手选或语音回应");
              else
                releaseTaskFlow(
                  conversationId,
                  generatedTaskTitle
                    ? `任务已生成 · ${generatedTaskTitle} · 恢复人物识别与世界事件`
                    : "任务生成失败，已退出独占流程，可重新录音",
                );
            }
          }
        })();
        markRecordingHandled(recording.recording_id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "录音处理失败";
        appendLog(`录音 #${recording.recording_id} · ${message}`);
        if (!recording.partial) {
          releaseTaskFlow(
            incomingConversationId,
            "任务录音处理失败，已退出独占流程，可重新录音",
          );
        }
        if (!asrRef.current?.ready) {
          recordingRetryAfter.current.set(
            recording.recording_id,
            Date.now() + 15_000,
          );
          void refreshModelDownload(true);
        }
      } finally {
        processingRecordings.current.delete(recording.recording_id);
      }
    },
    [
      appendLog,
      appendGameEvent,
      beginTaskFlow,
      closeSuggestionResponse,
      refreshModelDownload,
      releaseTaskFlow,
      markRecordingHandled,
      markDialogueSuggestionSelected,
      saveConversationTurn,
      sceneObservationStatus.lastSummary,
      settleConversationInteractions,
      startAutomaticResponseListening,
      updateConversationTurn,
      updateMemories,
      updatePeople,
      updateQuests,
    ],
  );

  const processRecordingControl = useCallback(
    (control: PersonChoiceResult) => {
      if (
        control.kind !== "recording_control" ||
        handledRecordingControlIdsRef.current.has(control.event_id)
      )
        return;

      const handled = handledRecordingControlIdsRef.current;
      handled.add(control.event_id);
      while (handled.size > 256) {
        const oldest = handled.values().next().value as number | undefined;
        if (oldest === undefined) break;
        handled.delete(oldest);
      }

      // session_state retains the latest event. Do not replay an old recording
      // command after an app restart or a reconnect.
      if (Date.now() - control.received_at_ms > 5_000) return;
      const conversationId = Number(control.context_id);
      if (!Number.isSafeInteger(conversationId) || conversationId <= 0) {
        appendLog("忽略了无效的手机录音控制事件");
        return;
      }

      if (control.choice_id === "phone_record_start") {
        if (phoneConversationRef.current) {
          appendLog("手机麦克风已在录音，本次重复开始指令已忽略");
          return;
        }
        const personId =
          sessionRef.current.last_face?.matches.find(
            (item) => item.decision === "known" && item.person_id,
          )?.person_id ?? "__conversation__";
        beginTaskFlow(conversationId, control.event_id, personId);
        const recording = nativeService.recordPhoneConversation(
          conversationId,
          control.event_id,
        );
        const capture: PhoneConversationCapture = {
          conversationId,
          recordingId: control.event_id,
          personId,
          recording,
        };
        phoneConversationRef.current = capture;
        appendLog("手机麦克风已开启 · 再按一次眼镜按钮结束");
        notify("手机正在录音");
        void recording
          .then((result) => {
            if (phoneConversationRef.current !== capture) return;
            phoneConversationRef.current = null;
            appendLog(
              `手机录音完成 · ${(result.duration_ms / 1_000).toFixed(1)} 秒 · 开始本地 ASR`,
            );
            if (
              !memoriesRef.current.some(
                (item) => item.id === `recording-${result.recording_id}`,
              )
            ) {
              updateMemories([
                {
                  id: `recording-${result.recording_id}`,
                  time: new Date().toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                  title: `手机对话录音 #${result.recording_id}`,
                  meta: `${(result.duration_ms / 1_000).toFixed(1)} 秒 · 手机麦克风 · 待转写`,
                  kind: "recording",
                },
                ...memoriesRef.current,
              ]);
            }
            notify("录音完成，正在识别并生成任务");
            void processRecording(result);
          })
          .catch((error) => {
            if (phoneConversationRef.current !== capture) return;
            phoneConversationRef.current = null;
            releaseTaskFlow(
              conversationId,
              `手机录音失败，已恢复其他事件 · ${error instanceof Error ? error.message : String(error)}`,
            );
            notify("手机录音失败，请检查麦克风权限");
          });
        return;
      }

      if (control.choice_id === "phone_record_stop") {
        const active = phoneConversationRef.current;
        if (!active || active.conversationId !== conversationId) {
          appendLog("未找到对应的手机录音，结束指令已忽略");
          return;
        }
        appendLog("正在结束手机录音");
        void nativeService.finishMoodListen().catch((error) => {
          phoneConversationRef.current = null;
          void nativeService.cancelMoodListen().catch(() => undefined);
          releaseTaskFlow(
            conversationId,
            `结束手机录音失败，已恢复其他事件 · ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      }
    },
    [
      appendLog,
      beginTaskFlow,
      notify,
      processRecording,
      releaseTaskFlow,
      updateMemories,
    ],
  );

  const refreshSession = useCallback(async () => {
    try {
      const next = await nativeService.sessionState();
      sessionRef.current = next;
      setSession(next);
      void syncGlassSettings(next);
      if (next.last_person_choice)
        processRecordingControl(next.last_person_choice);
      ingestState(next);
      if (next.last_recording) void processRecording(next.last_recording);
    } catch {
      // The browser UI baseline intentionally runs without a Tauri host.
    }
  }, [
    ingestState,
    processRecording,
    processRecordingControl,
    syncGlassSettings,
  ]);

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

  const runSceneObservation = useCallback(
    async (manual = false) => {
      if (taskFlowRef.current) {
        if (manual) notify("正在生成当前人物任务，请稍候");
        return;
      }
      if (sceneObservationInFlightRef.current) {
        if (manual) notify("场景观察正在运行");
        return;
      }
      if (
        sessionRef.current.phase !== "ready" ||
        !sessionRef.current.session_id
      ) {
        if (manual) notify("眼镜尚未连接");
        return;
      }
      const modelReady = modelDownloadsRef.current.some(
        (item) =>
          item.ready && item.model_id.includes("Qwen3-VL-2B-Instruct-MNN"),
      );
      if (!modelReady) {
        sceneNextAtRef.current = Date.now() + SCENE_OBSERVATION_INTERVAL_MS;
        setSceneObservationStatus((current) => ({
          ...current,
          nextRunAt: new Date(sceneNextAtRef.current).toISOString(),
          lastError: "Qwen3-VL-2B 尚未下载完成",
        }));
        if (manual) notify("请先下载 Qwen3-VL-2B 模型");
        return;
      }

      sceneObservationInFlightRef.current = true;
      const startedAt = Date.now();
      sceneNextAtRef.current = startedAt + SCENE_OBSERVATION_INTERVAL_MS;
      setSceneObservationStatus((current) => ({
        ...current,
        running: true,
        nextRunAt: new Date(sceneNextAtRef.current).toISOString(),
        lastError: null,
      }));
      try {
        const settings = settingsRef.current;
        const result = await nativeService.observeSceneWithVl(
          SCENE_VL_MODEL,
          SCENE_PROMPT,
          settings.width,
          settings.quality,
          96,
        );
        if (taskFlowRef.current) {
          appendLog("人物任务流程已开始，本次场景观察结果不再触发事件");
          return;
        }
        const summary = result.vision.text.trim();
        if (!summary) throw new Error("VL 没有返回场景描述");
        const observedAt = new Date().toISOString();
        const links = linkSceneObservation(
          summary,
          questsRef.current,
          peopleRef.current,
          result.face,
          activeQuestIdRef.current,
        );
        const linkedQuest = links.primaryQuestId
          ? questsRef.current.find((item) => item.id === links.primaryQuestId)
          : undefined;
        const linkedPeople = peopleRef.current.filter((item) =>
          links.personIds.includes(item.id),
        );
        const evidence = `眼镜场景观察 #${result.capture.request_id}：${summary}`;
        const activityMemory: Memory = {
          id: `scene-${result.capture.request_id}-${Date.now()}`,
          time: new Date().toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          title: `场景观察 · ${summary.slice(0, 28)}`,
          meta: [
            linkedQuest ? `关联任务：${linkedQuest.title}` : "未关联任务",
            linkedPeople.length
              ? `人物：${linkedPeople.map((item) => item.name).join("、")}`
              : "未识别人物",
            `${Math.round(result.vision.processing_total_ms)} ms`,
          ].join(" · "),
          kind: "activity",
          observedAt,
          summary,
          personIds: links.personIds,
          taskIds: links.taskIds,
          evidence,
          confidence: links.confidence,
          status: "active",
          dedupeKey: `scene-observed-${result.capture.request_id}`,
        };

        const previousEvidence = linkedQuest
          ? memoriesRef.current.find(
              (item) =>
                item.kind === "activity" &&
                item.taskIds?.includes(linkedQuest.id) &&
                item.observedAt &&
                Date.now() - Date.parse(item.observedAt) <=
                  SCENE_CONFIRMATION_WINDOW_MS &&
                sceneSimilarity(item.summary ?? "", summary) >= 0.35,
            )
          : undefined;
        const recentProgress = linkedQuest
          ? gameEventsRef.current.some(
              (event) =>
                event.type === "task_progressed" &&
                event.source === "vision" &&
                event.questId === linkedQuest.id &&
                Date.now() - Date.parse(event.createdAt) <
                  SCENE_PROGRESS_COOLDOWN_MS,
            )
          : false;
        const canProgress =
          linkedQuest &&
          (linkedQuest.id === activeQuestIdRef.current ||
            linkedQuest.status === "active") &&
          linkedQuest.progress < 90 &&
          previousEvidence &&
          !recentProgress;

        updateMemories((items) => [activityMemory, ...items].slice(0, 200));
        appendGameEvent({
          type: "scene_observed",
          questId: linkedQuest?.id,
          personId: links.personIds[0],
          evidence,
          dedupeKey: activityMemory.dedupeKey,
          source: "vision",
          summary: linkedQuest
            ? `场景关联任务 · ${linkedQuest.title}`
            : `记录场景 · ${summary}`,
        });

        const nowMs = Date.now();
        const expiredIds = new Set(
          worldEventsRef.current
            .filter(
              (item) =>
                item.status === "pending" &&
                Date.parse(item.expiresAt) <= nowMs,
            )
            .map((item) => item.id),
        );
        if (expiredIds.size) {
          updateWorldEvents((items) =>
            items.map((item) =>
              expiredIds.has(item.id) ? { ...item, status: "expired" } : item,
            ),
          );
        }
        const hasPending = worldEventsRef.current.some(
          (item) =>
            item.status === "pending" && Date.parse(item.expiresAt) > nowMs,
        );
        const lastWorldEventAt = Math.max(
          0,
          ...worldEventsRef.current.map(
            (item) => Date.parse(item.createdAt) || 0,
          ),
        );
        if (
          !hasPending &&
          nowMs - lastWorldEventAt >= WORLD_EVENT_COOLDOWN_MS
        ) {
          const context = await nativeService.realWorldContext().catch(() => ({
            captured_at_ms: nowMs,
            location: { available: false },
            calendar: [],
          }));
          if (taskFlowRef.current) return;
          const event = await proposeWorldEvent({
            observationId: String(result.capture.request_id),
            summary,
            people: linkedPeople,
            quests: questsRef.current,
            mood: currentMood,
            context,
          });
          if (taskFlowRef.current) return;
          if (event) {
            updateWorldEvents((items) => [event, ...items].slice(0, 50));
            appendGameEvent({
              type: "world_event_created",
              personId: event.personIds[0],
              evidence,
              dedupeKey: event.dedupeKey,
              source: "llm",
              summary: `世界事件出现 · ${event.title}`,
            });
            appendLog(`世界事件出现 · ${event.title} · 等待接受或忽略`);
            await nativeService
              .showChoiceCard({
                person_id: "__world_event__",
                name: "世界事件",
                title: `${event.locationLabel} · ${Math.round(event.confidence * 100)}%`,
                affinity: -2,
                quest: "30 分钟内有效",
                story: event.description,
                choices_json: JSON.stringify({
                  kind: "world_event",
                  contextId: event.id,
                  choices: [
                    { id: "accept", label: "接受事件" },
                    { id: "ignore", label: "暂时忽略" },
                  ],
                }),
              })
              .catch((error) =>
                appendLog(
                  `世界事件已保留在手机 · ${error instanceof Error ? error.message : String(error)}`,
                ),
              );
          }
        }

        if (canProgress) {
          const progress = Math.min(90, linkedQuest.progress + 10);
          updateQuests((items) =>
            items.map((item) =>
              item.id === linkedQuest.id
                ? { ...item, progress, status: "active" }
                : item,
            ),
          );
          appendGameEvent({
            type: "task_progressed",
            questId: linkedQuest.id,
            progress,
            evidence: `${previousEvidence.evidence ?? previousEvidence.summary}；${evidence}`,
            dedupeKey: `vision-progress-${linkedQuest.id}-${Math.floor(Date.now() / SCENE_PROGRESS_COOLDOWN_MS)}`,
            source: "vision",
            summary: `连续场景证据 · ${linkedQuest.title} ${progress}%`,
          });
          appendLog(`场景连续确认 · ${linkedQuest.title} → ${progress}%`);
        } else {
          appendLog(
            `场景观察 #${result.capture.request_id} · ${summary}${linkedQuest ? ` · 关联「${linkedQuest.title}」` : ""}`,
          );
        }
        setSceneObservationStatus({
          running: false,
          lastObservedAt: observedAt,
          nextRunAt: new Date(sceneNextAtRef.current).toISOString(),
          lastSummary: summary,
          lastError: null,
          lastLatencyMs: Date.now() - startedAt,
        });
        sceneFailureCountRef.current = 0;
        if (manual) notify("场景观察完成");
      } catch (error) {
        const message = error instanceof Error ? error.message : "场景观察失败";
        const failures = sceneFailureCountRef.current + 1;
        sceneFailureCountRef.current = failures;
        const retryMs =
          failures <= 3
            ? SCENE_OBSERVATION_FAST_RETRY_MS
            : SCENE_OBSERVATION_DEGRADED_RETRY_MS;
        sceneNextAtRef.current = Date.now() + retryMs;
        appendLog(`场景观察链路波动 · ${message} · ${retryMs} ms 后自动重试`);
        setSceneObservationStatus((current) => ({
          ...current,
          running: false,
          nextRunAt: new Date(sceneNextAtRef.current).toISOString(),
          // Hide one-off transport jitter. Preserve the last good scene and
          // surface an error only when recovery has repeatedly failed.
          lastError: failures >= 3 ? message : null,
        }));
        if (manual) notify("链路短暂波动，正在自动恢复");
      } finally {
        sceneObservationInFlightRef.current = false;
        if (Date.now() >= sceneNextAtRef.current) {
          sceneNextAtRef.current = Date.now() + SCENE_OBSERVATION_INTERVAL_MS;
          setSceneObservationStatus((current) => ({
            ...current,
            nextRunAt: new Date(sceneNextAtRef.current).toISOString(),
          }));
        }
      }
    },
    [
      appendGameEvent,
      appendLog,
      currentMood,
      notify,
      updateMemories,
      updateQuests,
      updateWorldEvents,
    ],
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
      window.clearTimeout(taskFlowTimeoutRef.current);
      window.clearTimeout(suggestionResponseRef.current?.timeoutId);
      if (phoneConversationRef.current || suggestionResponseRef.current)
        void nativeService.cancelMoodListen().catch(() => undefined);
    };
  }, [appendLog, connectGlasses, refreshModelDownload, refreshSession]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (
        sceneObservationEnabledRef.current &&
        !sceneObservationInFlightRef.current &&
        !taskFlowRef.current &&
        Date.now() >= sceneNextAtRef.current &&
        sessionRef.current.phase === "ready"
      ) {
        void runSceneObservation();
      }
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [runSceneObservation]);

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
      modelDownloads,
      logs,
      toastMessage,
      activeQuestId,
      gameEvents,
      sceneObservationEnabled,
      sceneObservationStatus,
      worldEvents,
      souvenirs,
      newSouvenir,
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
      updateSceneObservationEnabled,
      runSceneObservation,
      retryLastRecording,
      acceptWorldEvent,
      ignoreWorldEvent,
      dismissSouvenir: () => setNewSouvenir(null),
      applyConversationInteractions,
    }),
    [
      asrDownload,
      modelDownloads,
      activeQuestId,
      acceptWorldEvent,
      addQuest,
      applyConversationInteractions,
      appendLog,
      capture,
      connectGlasses,
      currentMood,
      glassSettings,
      gameEvents,
      ignoreWorldEvent,
      sceneObservationEnabled,
      sceneObservationStatus,
      worldEvents,
      souvenirs,
      newSouvenir,
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
      runSceneObservation,
      session,
      toastMessage,
      toggleQuestStep,
      updateGlassSettings,
      updateMemories,
      updateMood,
      updatePeople,
      updatePerception,
      updateSceneObservationEnabled,
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
