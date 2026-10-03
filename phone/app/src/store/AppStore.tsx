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
  SensingAudioState,
  SensingSpeechDebug,
  Souvenir,
  WorldEvent,
  TaskLifecycle,
} from "../models";
import { modelHub } from "../services/modelHub";
import { planSensingQuests } from "../services/sensingQuestPlanner";
import { nativeService } from "../services/native";
import { useSensingAudio } from "../services/useSensingAudio";
import {
  immediateConversationInsight,
  processRecordingPipeline,
  transcribeRecordingLocally,
  type LocalTranscription,
} from "../services/recordingPipeline";
import { storage } from "../services/storage";
import { decideTask, stableKey } from "../utils/taskGate";
import {
  normalizeQuest,
  questLifecycle,
  isFormalQuest,
  verifyQuestStep,
  reviewQuest as reviewEvidenceQuest,
  reconcileAwards,
  reconcileQuestGraph,
} from "../utils/questEvidence";
import {
  mergeMemoryRecords,
  makeEncounterMemory,
  deleteMemoryFamily,
  reviseMemory,
} from "../utils/socialMemory";
import {
  completionReward,
  conversationAffinityReward,
  inferQuestCategory,
  recommendedQuest,
} from "../utils/gameRules";
import { linkSceneObservation } from "../utils/sceneObservation";
import { proposeWorldEvent } from "../utils/worldEventPlanner";
import { souvenirForQuest } from "../utils/souvenir";
import { refineSouvenir } from "../services/souvenirDesign";
import { createGlassHudSnapshot } from "../utils/glassHudSnapshot";
import { glassPeopleSnapshot } from "../utils/glassPeople";
import { glassSocialHint } from "../utils/glassSocialHint";
import { SensingSessions } from "../utils/sensingSession";
import {
  glassTaskSummarySnapshot,
  type SensingTaskSummary,
} from "../utils/sensingTaskSummary";
import {
  appendGlassDialogue,
  emptyGlassDialogue,
  glassDialogueSnapshot,
} from "../utils/glassDialogue";
import {
  createGlassTaskOffer,
  isOfferableQuest,
  taskOfferDecision,
  type GlassTaskOffer,
} from "../utils/glassTaskOffer";

const SCENE_OBSERVATION_INTERVAL_MS = 60_000;
const SCENE_OBSERVATION_FAST_RETRY_MS = 1_000;
const SCENE_OBSERVATION_DEGRADED_RETRY_MS = 5_000;
const SCENE_CONFIRMATION_WINDOW_MS = 3 * 60_000;
const WORLD_EVENT_COOLDOWN_MS = 30 * 60_000;
const TASK_FLOW_TIMEOUT_MS = 2 * 60_000;
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

interface SuggestionResponseSession {
  conversationId: number;
  contextId: string;
  turnId: string | null;
  suggestions: DialogueSuggestion[];
  token: number;
  timeoutId: number;
  closing: boolean;
}

interface AppStoreValue {
  consecutiveSpeakers: boolean;
  setConsecutiveSpeakers: (enabled: boolean) => void;
  voiceBindings: Record<string, string>;
  bindVoiceSpeaker: (voiceId: string, personId: string) => void;
  confirmedSpeakerId: string | null;
  confirmSpeaker: (id: string | null) => void;
  reviewQuest: (id: string) => void;
  changeQuestStatus: (id: string, lifecycle: TaskLifecycle) => void;
  renameQuest: (id: string, title: string) => void;
  mergeQuest: (candidateId: string, targetId: string) => void;
  deleteQuest: (id: string) => void;
  deleteMemory: (id: string) => void;
  editMemory: (id: string, text: string) => void;
  quests: Quest[];
  people: Person[];
  memories: Memory[];
  currentMood: MoodSnapshot;
  glassSettings: GlassSettings;
  perception: boolean;
  session: SessionState;
  sensingAudio: SensingAudioState & { processing: boolean };
  lastSensingTranscript: string;
  sensingTaskSummary: SensingTaskSummary | null;
  retrySensingTasks: () => void;
  sensingSpeechDebug: SensingSpeechDebug[];
  clearSensingSpeechDebug: () => void;
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
  markSouvenirViewed: (souvenirId: string) => void;
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
  const [consecutiveSpeakers, setSpeakerMode] = useState(
    () => localStorage.getItem("realtopia.consecutiveSpeakers") === "on",
  );
  const speakerModeRef = useRef(consecutiveSpeakers);
  const [voiceBindings, setVoiceBindings] = useState<Record<string, string>>(
    {},
  );
  const [glassDialogue, setGlassDialogue] = useState(emptyGlassDialogue);
  const [peopleHudBaseline, setPeopleHudBaseline] = useState<number | null>(
    null,
  );
  const voiceBindingsRef = useRef<{
    session: number;
    bindings: Record<string, string>;
  }>({ session: 0, bindings: {} });
  const [confirmedSpeakerId, setConfirmedSpeakerId] = useState<string | null>(
    null,
  );
  const confirmedSpeakerRef = useRef<string | null>(null);
  const socialEpochRef = useRef(0);
  const latestPromptRef = useRef("");
  const setConsecutiveSpeakers = useCallback((enabled: boolean) => {
    speakerModeRef.current = enabled;
    setSpeakerMode(enabled);
    localStorage.setItem(
      "realtopia.consecutiveSpeakers",
      enabled ? "on" : "off",
    );
    voiceBindingsRef.current = { session: 0, bindings: {} };
    setVoiceBindings({});
    socialEpochRef.current++;
  }, []);
  const bindVoiceSpeaker = useCallback(
    (voiceId: string, personId: string) => {
      if (
        !/^voice-[1-4]$/.test(voiceId) ||
        (personId &&
          personId !== "player" &&
          !people.some((p) => p.id === personId))
      )
        return;
      const next = {
        ...voiceBindingsRef.current.bindings,
        [voiceId]: personId,
      };
      voiceBindingsRef.current.bindings = next;
      setVoiceBindings(next);
      socialEpochRef.current++;
    },
    [people],
  );
  const socialFaceRef = useRef<string | null>(null);
  const personHudSignatureRef = useRef("");
  const confirmSpeaker = useCallback((id: string | null) => {
    confirmedSpeakerRef.current = id;
    setConfirmedSpeakerId(id);
    socialEpochRef.current++;
  }, []);
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
  const [lastSensingTranscript, setLastSensingTranscript] = useState("");
  const [sensingTaskSummary, setSensingTaskSummary] =
    useState<SensingTaskSummary | null>(null);
  const [sensingSpeechDebug, setSensingSpeechDebug] = useState<
    SensingSpeechDebug[]
  >([]);
  const clearSensingSpeechDebug = useCallback(
    () => setSensingSpeechDebug([]),
    [],
  );
  const updateSensingSpeechDebug = useCallback(
    (recording: Recording, patch: Partial<SensingSpeechDebug>) => {
      if (!recording.sensing) return;
      setSensingSpeechDebug((current) => {
        const previous = current.find(
          (item) => item.recordingId === recording.recording_id,
        );
        // Clearing debug history must not restore an old in-flight row later.
        if (!previous && patch.status !== "transcribing") return current;
        if (previous?.status === "cancelled" && patch.status !== "cancelled")
          return current;
        const next: SensingSpeechDebug = {
          recordingId: recording.recording_id,
          sessionId: recording.sensing_session_id ?? 0,
          sequence: recording.sequence ?? 0,
          startedAt: new Date().toISOString(),
          durationMs: recording.duration_ms,
          bytes: recording.bytes,
          vadReason: recording.vad_reason,
          vadLatencyMs: recording.vad_latency_ms,
          turnLabel: recording.turn_label,
          turnLatencyMs: recording.turn_latency_ms,
          speaker: recording.speaker,
          status: "transcribing",
          ...previous,
          ...patch,
        };
        return [
          next,
          ...current.filter((item) => item.recordingId !== next.recordingId),
        ].slice(0, 20);
      });
    },
    [],
  );
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
  // In-flight cloud results must not resurrect a task deleted in this run.
  const deletedQuestIdsRef = useRef(new Set<string>());
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
  const activeSensingSessionRef = useRef<number | null>(null);
  const sensingSessionsRef = useRef(new SensingSessions());
  const latestSensingSessionRef = useRef<number | null>(null);
  const lastClosedSensingSummaryRef = useRef<{
    sessionId: number;
    transcript: string;
    count: number;
    truncated: boolean;
  } | null>(null);
  const sensingQuestRequestsRef = useRef(new Set<number>());
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
  const [glassTaskOfferIds, setGlassTaskOfferIds] = useState<string[]>(() =>
    quests.filter((q) => isOfferableQuest(q)).map((q) => q.id),
  );
  const glassTaskOfferIdsRef = useRef<string[]>(glassTaskOfferIds);
  const glassTaskOfferRef = useRef<GlassTaskOffer | null>(null);
  const glassTaskOfferEpochRef = useRef(0);
  const handledTaskChoiceIdsRef = useRef(new Set<number>());
  const [taskOfferClock, setTaskOfferClock] = useState(0);
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
      const value = reconcileQuestGraph(
        (typeof next === "function" ? next(current) : next).filter(
          (q) => !deletedQuestIdsRef.current.has(q.id),
        ),
      );
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
      const value = mergeMemoryRecords(
        current,
        typeof next === "function" ? next(current) : next,
      );
      memoriesRef.current = value;
      storage.saveMemories(value);
      return value;
    });
  }, []);
  const deleteMemory = useCallback(
    (id: string) => {
      socialEpochRef.current++;
      updateMemories((current) => deleteMemoryFamily(current, id));
    },
    [updateMemories],
  );
  const editMemory = useCallback(
    (id: string, text: string) => {
      socialEpochRef.current++;
      updateMemories((current) => reviseMemory(current, id, text));
    },
    [updateMemories],
  );

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

  const markSouvenirViewed = useCallback(
    (souvenirId: string) => {
      updateSouvenirs((items) =>
        items.map((item) =>
          item.id === souvenirId && !item.viewedAt
            ? { ...item, viewedAt: new Date().toISOString() }
            : item,
        ),
      );
    },
    [updateSouvenirs],
  );

  const updateGlassSettings = useCallback((next: Updater<GlassSettings>) => {
    setGlassSettings((current) => {
      const value = typeof next === "function" ? next(current) : next;
      settingsRef.current = value;
      storage.saveGlassSettings(value);
      return value;
    });
  }, []);

  const updatePerception = useCallback(
    (next: boolean) => {
      const changed = perceptionRef.current !== next;
      if (perceptionRef.current !== next) glassTaskOfferEpochRef.current++;
      if (perceptionRef.current && !next) {
        const id =
          activeSensingSessionRef.current ?? latestSensingSessionRef.current;
        const closing =
          sensingSessionsRef.current.close(id) ||
          sensingSessionsRef.current.isClosing(id ?? undefined);
        setSensingTaskSummary({
          sessionId: id ?? 0,
          phase: closing ? "draining" : "empty",
          utteranceCount: 0,
          taskCount: 0,
          suggested: false,
        });
      }
      if (!perceptionRef.current && next) {
        setLastSensingTranscript("");
        setSensingTaskSummary(null);
        lastClosedSensingSummaryRef.current = null;
      }
      perceptionRef.current = next;
      setPerception(next);
      storage.savePerception(next);
      if (changed) {
        const settings = settingsRef.current;
        void nativeService
          .setPerception(
            next,
            settings.framesPerSecond,
            settings.width,
            settings.quality,
          )
          .catch(() => {
            // Preserve the desired OFF state even if Bluetooth is temporarily lost.
            // The next ready-session poll reapplies the latest desired state.
            if (perceptionRef.current !== next) return;
            syncedSessionRef.current = null;
            notify("感知开关已保存，等待眼镜连接恢复");
          });
      }
    },
    [notify],
  );

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
        if (
          value.dedupeKey &&
          current.some((item) => item.dedupeKey === value.dedupeKey)
        )
          return current;
        const next = [value, ...current];
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
        (item) =>
          item.id === questId &&
          isFormalQuest(item) &&
          questLifecycle(item) !== "completed",
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
      const decision = decideTask(
        quest.sourceEvidence?.excerpt ?? quest.realTitle ?? quest.title,
        {
          entryPoint:
            quest.source === "manual" ? "explicit_goal_input" : "conversation",
          people: peopleRef.current,
          speakerPersonId: quest.sourceEvidence?.speakerPersonId,
        },
      );
      if (!["create", "candidate"].includes(decision.kind)) {
        notify(decision.reason);
        return;
      }
      if (
        questsRef.current.some(
          (q) =>
            q.id === quest.id ||
            (quest.dedupeKey && q.dedupeKey === quest.dedupeKey),
        )
      )
        return;
      const normalized: Quest = {
        ...quest,
        category: quest.category ?? inferQuestCategory(quest),
        status: focus ? "active" : (quest.status ?? "inbox"),
        source: quest.source ?? "manual",
        assignerPersonId: quest.assignerPersonId ?? quest.personId,
        createdAt: quest.createdAt ?? new Date().toISOString(),
        lifecycle:
          quest.lifecycle ??
          (decision.kind === "create" ? "accepted" : "candidate"),
        acceptanceCriteria:
          quest.acceptanceCriteria ?? decision.acceptanceCriteria,
        ownerPersonId:
          quest.ownerPersonId ?? decision.assigneePersonId ?? undefined,
      };
      updateQuests((items) => [normalized, ...items]);
      if (normalized.source === "manual")
        updateMemories((items) => [
          {
            id: `goal-memory-${normalized.id}`,
            time: new Date().toLocaleTimeString("zh-CN"),
            title: normalized.realTitle ?? normalized.title,
            meta: "用户明确目标 · 非完成记录",
            kind: "task",
            memoryKind: "userGoal",
            taskIds: [normalized.id],
            sourceType: "user_confirmation",
            sourceId: normalized.id,
            summary: normalized.realTitle ?? normalized.title,
            evidence: normalized.sourceEvidence?.excerpt,
            observedAt: normalized.createdAt,
            confidence: 1,
            confirmed: true,
            status: "active",
          },
          ...items,
        ]);
      appendGameEvent({
        type: "task_created",
        questId: normalized.id,
        personId: normalized.assignerPersonId,
        source: normalized.source === "voice" ? "asr" : "user",
        summary: `创建任务 · ${normalized.title}`,
      });
      if (
        isFormalQuest(normalized) &&
        (focus ||
          !recommendedQuest(questsRef.current, activeQuestIdRef.current))
      ) {
        activeQuestIdRef.current = normalized.id;
        setActiveQuestId(normalized.id);
        storage.saveActiveQuestId(normalized.id);
      }
    },
    [appendGameEvent, updateQuests, updateMemories, notify],
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
      if (Date.parse(event.expiresAt) <= Date.now()) {
        notify("世界事件已过期");
        return;
      }
      const action = event.quest.steps.filter(Boolean).join("；");
      const gate = decideTask(action, {
        entryPoint: "explicit_goal_input",
        people: peopleRef.current,
      });
      if (!["create", "candidate"].includes(gate.kind)) {
        notify(gate.reason);
        return;
      }
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
            realTitle: action,
            lifecycle: "accepted",
            ownerPersonId: "player",
            acceptanceCriteria:
              gate.acceptanceCriteria || `确认「${action}」的结果`,
            sourceEvidence: {
              sourceId: event.id,
              excerpt: action,
              speakerPersonId: null,
              mentionedPersonIds: gate.mentionedPersonIds,
            },
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

  const setRewardValidity = useCallback(
    (questId: string, valid: boolean) => {
      const completion = gameEventsRef.current.find(
        (event) =>
          event.questId === questId &&
          event.type === "affinity_changed" &&
          event.source === "system",
      );
      const currentlyValid = completion?.status !== "revoked";
      if (completion && currentlyValid !== valid)
        updatePeople((items) =>
          items.map((person) =>
            person.id === completion.personId
              ? {
                  ...person,
                  affinity: Math.max(
                    0,
                    Math.min(
                      100,
                      person.affinity +
                        (valid ? 1 : -1) * (completion.affinityDelta ?? 0),
                    ),
                  ),
                }
              : person,
          ),
        );
      setGameEvents((current) => {
        const next = current.map((event) =>
          (event.questId === questId &&
            ["task_completed", "souvenir_unlocked"].includes(event.type)) ||
          event === completion
            ? {
                ...event,
                status: valid ? ("valid" as const) : ("revoked" as const),
              }
            : event,
        );
        gameEventsRef.current = next;
        storage.saveGameEvents(next);
        return next;
      });
      updateSouvenirs((items) =>
        items.map((item) =>
          item.questId === questId
            ? { ...item, status: valid ? "valid" : "revoked" }
            : item,
        ),
      );
      updateMemories((items) =>
        items.map((item) =>
          item.id === `complete-${questId}`
            ? {
                ...item,
                status: valid ? "active" : "superseded",
                revision: (item.revision ?? 1) + 1,
              }
            : item,
        ),
      );
    },
    [updatePeople, updateSouvenirs, updateMemories],
  );

  const toggleQuestStep = useCallback(
    (questId: string, stepIndex: number) => {
      const old = questsRef.current.find((q) => q.id === questId);
      if (!old) return;
      const q = normalizeQuest(old),
        step = q.stepRecords![stepIndex];
      if (!step) return;
      if (q.requiredChildTaskIds?.length) {
        notify("父任务步骤由子任务验收同步，请先打开对应子任务");
        return;
      }
      if (
        q.prerequisiteTaskIds?.some(
          (id) =>
            questLifecycle(
              questsRef.current.find((t) => t.id === id) ?? {
                ...q,
                lifecycle: "blocked",
              },
            ) !== "completed",
        )
      ) {
        notify("依赖任务尚未验收");
        return;
      }
      const now = new Date().toISOString(),
        operation = step.status === "verified" ? "undo" : "verify";
      const sourceId = `user-step:${q.id}:${step.id}:${q.revision}:${operation}`;
      try {
        const next = verifyQuestStep(
          q,
          step.id,
          {
            id: `evidence-${stableKey(sourceId)}`,
            taskId: q.id,
            stepId: step.id,
            sourceType: "user_confirmation",
            sourceId,
            excerpt: `用户确认：${step.acceptanceCriteria}`,
            observedAt: now,
            confidence: 1,
            verificationStatus: "verified",
            verifiedBy: "player",
            dedupeKey: sourceId,
          },
          operation,
        );
        const graph = reconcileQuestGraph(
          questsRef.current.map((item) => (item.id === q.id ? next : item)),
        );
        for (const item of graph)
          if (
            questLifecycle(
              questsRef.current.find((t) => t.id === item.id) ?? item,
            ) === "completed" &&
            questLifecycle(item) !== "completed"
          )
            setRewardValidity(item.id, false);
        updateQuests(graph);
        appendGameEvent({
          type: "task_progressed",
          questId,
          progress: next.progress,
          evidence: step.acceptanceCriteria,
          dedupeKey: sourceId,
          source: "user",
          summary: `独立步骤${operation === "verify" ? "已确认" : "已撤销"} · ${step.title}`,
        });
        notify(
          next.lifecycle === "ready_for_review"
            ? "步骤已完成，等待最终验收"
            : `已验证进度 ${next.progress}%`,
        );
      } catch (error) {
        notify(error instanceof Error ? error.message : String(error));
      }
    },
    [notify, updateQuests, setRewardValidity, appendGameEvent],
  );

  const reviewQuest = useCallback(
    (questId: string) => {
      const old = questsRef.current.find((q) => q.id === questId);
      if (!old || questLifecycle(old) === "completed") return;
      try {
        const next = reviewEvidenceQuest(old, questsRef.current);
        updateQuests((items) =>
          items.map((q) => (q.id === questId ? next : q)),
        );
        const previous = gameEventsRef.current.some(
          (event) =>
            event.type === "task_completed" && event.questId === questId,
        );
        if (previous) {
          setRewardValidity(questId, true);
          notify("验收已恢复；原奖励重新有效，不重复授予");
          return;
        }
        const person = peopleRef.current.find(
          (p) => p.id === (next.assignerPersonId ?? next.personId),
        );
        const reward = completionReward(
          next,
          gameEventsRef.current,
          person?.affinity,
        );
        // Parent milestones do not pay for the same child deliverables twice.
        const parent = !!next.requiredChildTaskIds?.length;
        appendGameEvent({
          type: "task_completed",
          questId,
          personId: reward.personId,
          vitalityDelta: parent ? 0 : reward.vitalityDelta,
          dedupeKey: `task-completed-${questId}`,
          source: "user",
          summary: `验收完成 · ${next.title}`,
        });
        if (person && reward.affinityDelta > 0 && !parent) {
          updatePeople((items) =>
            items.map((p) =>
              p.id === person.id
                ? {
                    ...p,
                    affinity: Math.min(100, p.affinity + reward.affinityDelta),
                  }
                : p,
            ),
          );
          appendGameEvent({
            type: "affinity_changed",
            questId,
            personId: person.id,
            affinityDelta: reward.affinityDelta,
            dedupeKey: `task-completed-${questId}-affinity`,
            source: "system",
            summary: `履行承诺 · 好感度 +${reward.affinityDelta}`,
          });
        }
        updateMemories((items) => [
          {
            id: `complete-${questId}`,
            time: new Date().toLocaleTimeString("zh-CN"),
            title: `验收完成 · ${next.title}`,
            meta: next.reward,
            kind: "task",
            memoryKind: "episode",
            taskIds: [questId],
            personIds: next.participantIds ?? (person ? [person.id] : []),
            evidence: next.acceptanceCriteria,
            sourceType: "user_confirmation",
            sourceId:
              next.progressEvents![next.progressEvents!.length - 1]?.eventId,
            observedAt: next.completedAt,
            confidence: 1,
            confirmed: true,
            status: "active",
            revision: 1,
          },
          ...items,
        ]);
        if (
          !parent &&
          !souvenirsRef.current.some((item) => item.questId === questId)
        ) {
          const souvenir: Souvenir = {
            ...souvenirForQuest(next, person),
            designState: "pending",
          };
          updateSouvenirs((items) => [souvenir, ...items]);
          setNewSouvenir(souvenir);
          void refineSouvenir(
            souvenir,
            next,
            person,
            souvenirsRef.current,
          ).then((refined) => {
            // A late design must not undo reward revocation or the user's
            // viewed state while the cloud request was in flight.
            updateSouvenirs((items) =>
              items.map((item) =>
                item.id === refined.id
                  ? { ...refined, status: item.status, viewedAt: item.viewedAt }
                  : item,
              ),
            );
            setNewSouvenir((current) =>
              current?.id === refined.id
                ? {
                    ...refined,
                    status: current.status,
                    viewedAt: current.viewedAt,
                  }
                : current,
            );
          });
          appendGameEvent({
            type: "souvenir_unlocked",
            questId,
            source: "system",
            dedupeKey: `souvenir-${questId}`,
            summary: `获得纪念品 · ${souvenir.name}`,
          });
        }
        notify("最终验收通过 · 徽章与场景已同步");
      } catch (error) {
        notify(error instanceof Error ? error.message : String(error));
      }
    },
    [
      updateQuests,
      notify,
      setRewardValidity,
      appendGameEvent,
      updatePeople,
      updateMemories,
      updateSouvenirs,
    ],
  );

  const changeQuestStatus = useCallback(
    (id: string, lifecycle: TaskLifecycle) => {
      const old = questsRef.current.find((q) => q.id === id);
      if (!old) return;
      if (lifecycle === "completed") {
        reviewQuest(id);
        return;
      }
      if (
        lifecycle === "accepted" &&
        old.candidateExpiresAt &&
        Date.parse(old.candidateExpiresAt) < Date.now()
      ) {
        notify("候选已过期，请重新确认目标");
        return;
      }
      if (questLifecycle(old) === "completed") setRewardValidity(id, false);
      const graph = reconcileQuestGraph(
        questsRef.current.map((q) =>
          q.id === id
            ? reconcileAwards({
                ...normalizeQuest(q),
                lifecycle,
                status:
                  lifecycle === "cancelled"
                    ? "cancelled"
                    : lifecycle === "blocked"
                      ? "blocked"
                      : "active",
                ownerPersonId: q.ownerPersonId ?? "player",
                revision: (q.revision ?? 1) + 1,
                completedAt: undefined,
                progressEvents: [
                  ...(q.progressEvents ?? []),
                  {
                    eventId: `status-${id}-${q.revision ?? 1}`,
                    taskId: id,
                    operation: lifecycle === "cancelled" ? "cancel" : "accept",
                    actor: "player",
                    recordedAt: new Date().toISOString(),
                    rulesVersion: "evidence-v1",
                    evidenceIds: [],
                    dedupeKey: `status:${id}:${q.revision ?? 1}:${lifecycle}`,
                  },
                ],
              })
            : q,
        ),
      );
      for (const q of graph)
        if (
          questLifecycle(questsRef.current.find((t) => t.id === q.id) ?? q) ===
            "completed" &&
          questLifecycle(q) !== "completed"
        )
          setRewardValidity(q.id, false);
      updateQuests(graph);
      if (lifecycle === "accepted")
        updateMemories((items) => [
          {
            id: `accepted-${id}`,
            time: new Date().toLocaleTimeString("zh-CN"),
            title: `已接取目标 · ${old.realTitle ?? old.title}`,
            summary: `接取目标：${old.realTitle ?? old.title}。尚待实际执行与验收。`,
            meta: "计划，不是完成经历",
            kind: "task",
            memoryKind: old.chapter ? "sharedProject" : "commitment",
            taskIds: [id],
            personIds: old.participantIds ?? [],
            subjectPersonIds: old.participantIds ?? [],
            sourceType: "user_confirmation",
            sourceId: `accept:${id}`,
            observedAt: new Date().toISOString(),
            confidence: 1,
            confirmed: true,
            status: "active",
            revision: 1,
          },
          ...items,
        ]);
      notify(
        lifecycle === "accepted"
          ? "已确认任务执行者和验收条件"
          : lifecycle === "cancelled"
            ? "任务已取消，组件收起"
            : "任务状态已更新",
      );
    },
    [updateQuests, updateMemories, notify, reviewQuest, setRewardValidity],
  );

  const queueGlassTaskOffers = useCallback((ids: string[]) => {
    if (!ids.length) return;
    const next = [...new Set([...glassTaskOfferIdsRef.current, ...ids])];
    glassTaskOfferIdsRef.current = next;
    setGlassTaskOfferIds(next);
  }, []);

  const deleteQuest = useCallback(
    (id: string) => {
      const current = questsRef.current;
      if (!current.some((q) => q.id === id)) return;
      deletedQuestIdsRef.current.add(id);
      // Keep missing dependency IDs: deleting a child is not completing it.
      const next = reconcileQuestGraph(current.filter((q) => q.id !== id));
      setRewardValidity(id, false);
      updateMemories((items) =>
        items.map((item) =>
          item.id === `accepted-${id}`
            ? {
                ...item,
                status: "superseded",
                revision: (item.revision ?? 1) + 1,
              }
            : item,
        ),
      );
      for (const q of next)
        if (
          questLifecycle(current.find((item) => item.id === q.id)!) ===
            "completed" &&
          questLifecycle(q) !== "completed"
        )
          setRewardValidity(q.id, false);
      if (activeQuestIdRef.current === id) {
        activeQuestIdRef.current = null;
        setActiveQuestId(null);
        storage.saveActiveQuestId(null);
      }
      const pending = glassTaskOfferIdsRef.current.filter(
        (item) => item !== id,
      );
      glassTaskOfferIdsRef.current = pending;
      setGlassTaskOfferIds(pending);
      const offer = glassTaskOfferRef.current;
      if (offer?.questId === id) {
        glassTaskOfferRef.current = null;
        glassTaskOfferEpochRef.current++;
        void nativeService
          .dismissChoiceCard(offer.contextId)
          .catch(() => undefined);
      }
      setNewSouvenir((item) => (item?.questId === id ? null : item));
      updateQuests(next);
      notify("任务已删除；原始对话和记忆保留");
    },
    [notify, setRewardValidity, updateQuests, updateMemories],
  );

  useEffect(() => {
    if (!glassTaskOfferIds.length) return;
    const timer = window.setInterval(
      () => setTaskOfferClock((n) => n + 1),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [glassTaskOfferIds.length]);

  const renameQuest = useCallback(
    (id: string, title: string) => {
      if (!title.trim()) return;
      updateQuests((items) =>
        items.map((q) =>
          q.id === id
            ? {
                ...q,
                title: title.trim(),
                realTitle: title.trim(),
                revision: (q.revision ?? 1) + 1,
              }
            : q,
        ),
      );
    },
    [updateQuests],
  );
  const mergeQuest = useCallback(
    (candidateId: string, targetId: string) => {
      const candidate = questsRef.current.find((q) => q.id === candidateId),
        target = questsRef.current.find((q) => q.id === targetId);
      if (
        !candidate ||
        !target ||
        candidateId === targetId ||
        questLifecycle(candidate) !== "candidate"
      )
        return;
      updateQuests((items) =>
        items.map((q) =>
          q.id === candidateId
            ? { ...q, lifecycle: "cancelled", status: "cancelled" }
            : q.id === targetId
              ? {
                  ...normalizeQuest(q),
                  evidence: [
                    ...(q.evidence ?? []),
                    ...(candidate.evidence ?? []).map((e) => ({
                      ...e,
                      taskId: targetId,
                      verificationStatus: "candidate" as const,
                    })),
                  ],
                  revision: (q.revision ?? 1) + 1,
                }
              : q,
        ),
      );
      notify("候选线索已合并；未自动增加进度");
    },
    [updateQuests, notify],
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
      // Unified sensing must not suspend the camera/microphone per utterance.
      if (perceptionRef.current) return true;
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
      return (async () => {
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
          `眼镜参数已同步 · 每10秒一张 / ${settings.width}px / Q${settings.quality}`,
        );
      } catch {
        syncedSessionRef.current = null;
      }
    },
    [appendLog],
  );

  useEffect(() => {
    const pending = glassTaskOfferIds.filter((id) =>
      quests.some((q) => q.id === id && isOfferableQuest(q)),
    );
    if (pending.length !== glassTaskOfferIds.length) {
      glassTaskOfferIdsRef.current = pending;
      setGlassTaskOfferIds(pending);
    }
    const quest = quests.find((q) => q.id === pending[0]);
    if (perception || !quest) {
      const old = glassTaskOfferRef.current;
      glassTaskOfferRef.current = null;
      if (old)
        void nativeService
          .dismissChoiceCard(old.contextId)
          .catch(() => undefined);
      return;
    }
    if (session.phase !== "ready" && session.phase !== "capturing") return;
    const offer = createGlassTaskOffer(
      quest,
      `${session.session_id}:session-summary:${glassTaskOfferEpochRef.current}`,
    );
    if (glassTaskOfferRef.current?.contextId === offer.contextId) return;
    glassTaskOfferRef.current = offer;
    const response = suggestionResponseRef.current;
    if (response)
      void closeSuggestionResponse(
        response.contextId,
        "新任务等待确认 · 持续感知保持开启",
        false,
      );
    void nativeService
      .showChoiceCard({
        person_id: offer.personId,
        name: quest.generationModel
          ? quest.group
          : (quest.person ?? "对话任务"),
        title: `新任务 · ${quest.group}`,
        affinity: -2,
        quest: quest.generationModel
          ? (quest.displayTitle ?? quest.title)
          : (quest.realTitle ?? quest.title),
        story: quest.generationModel
          ? `现实行动：${quest.realTitle ?? quest.title}`
          : `${quest.generationKind === "suggested" ? "对话参考" : "原话"}：${quest.sourceEvidence?.excerpt ?? quest.body}`,
        choices_json: JSON.stringify({
          kind: "task_offer",
          contextId: offer.contextId,
          taskId: quest.id,
          revision: offer.revision,
          choices: [
            { id: "accept", label: "接受任务" },
            { id: "reject", label: "拒绝任务" },
          ],
        }),
      })
      .then(() => {
        if (
          glassTaskOfferRef.current?.contextId !== offer.contextId ||
          perceptionRef.current
        )
          return nativeService.dismissChoiceCard(offer.contextId);
        appendLog(`眼镜任务待确认 · ${quest.title} · 未自动接取`);
      })
      .catch(() => {
        if (glassTaskOfferRef.current?.contextId === offer.contextId)
          glassTaskOfferRef.current = null;
      });
  }, [
    glassTaskOfferIds,
    quests,
    perception,
    session.phase,
    session.session_id,
    taskOfferClock,
    appendLog,
    closeSuggestionResponse,
  ]);

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
      const knownMatches =
        nextSession.last_face?.matches.filter(
          (item) => item.decision === "known" && item.person_id,
        ) ?? [];
      if (!taskFlowRef.current && knownMatches.length === 1) {
        const known = peopleRef.current.find(
          (item) => item.id === knownMatches[0].person_id,
        );
        if (known) {
          const memory = makeEncounterMemory(
            known,
            String(activeSensingSessionRef.current ?? "manual"),
          );
          if (!nextMemories.some((item) => item.id === memory.id))
            nextMemories = [memory, ...nextMemories];
        }
      }
      const choice = nextSession.last_person_choice;
      if (
        choice?.kind === "task_offer" &&
        !handledTaskChoiceIdsRef.current.has(choice.event_id)
      ) {
        const handled = handledTaskChoiceIdsRef.current;
        handled.add(choice.event_id);
        while (handled.size > 256)
          handled.delete(handled.values().next().value!);
        const offer = glassTaskOfferRef.current;
        const quest = questsRef.current.find((q) => q.id === offer?.questId);
        const decision = !perceptionRef.current
          ? taskOfferDecision(choice, offer, quest)
          : null;
        if (decision && offer) {
          glassTaskOfferRef.current = null;
          const pending = glassTaskOfferIdsRef.current.filter(
            (id) => id !== offer.questId,
          );
          glassTaskOfferIdsRef.current = pending;
          setGlassTaskOfferIds(pending);
          changeQuestStatus(offer.questId, decision);
          void nativeService
            .dismissChoiceCard(
              offer.contextId,
              decision === "accepted"
                ? "任务已接受 · 手机已同步"
                : "任务已拒绝 · 手机已同步",
            )
            .catch(() => undefined);
          appendLog(
            `眼镜${decision === "accepted" ? "接受" : "拒绝"}任务 · ${quest?.title} · 已同步手机`,
          );
        } else appendLog("忽略过期或不匹配的眼镜任务选择 · 未修改任务");
      }
      const choiceBelongsToTaskFlow =
        choice?.kind !== "recording_control" &&
        choice?.kind !== "sensing_control" &&
        choice?.kind !== "task_offer" &&
        choice?.kind !== "dialogue" &&
        choice?.kind !== "person" &&
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
      changeQuestStatus,
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
        recording.sensing &&
        !sensingSessionsRef.current.isClosing(recording.sensing_session_id) &&
        (!perceptionRef.current ||
          recording.sensing_session_id !== activeSensingSessionRef.current)
      )
        return;
      if (
        handledRecordingIdsRef.current.has(recording.recording_id) ||
        processingRecordings.current.has(recording.recording_id) ||
        (recordingRetryAfter.current.get(recording.recording_id) ?? 0) >
          Date.now()
      )
        return;
      const incomingConversationId =
        recording.conversation_id ?? recording.recording_id;
      if (
        recording.speaker &&
        !sensingSessionsRef.current.isClosing(recording.sensing_session_id) &&
        voiceBindingsRef.current.session !== recording.sensing_session_id
      ) {
        voiceBindingsRef.current = {
          session: recording.sensing_session_id ?? 0,
          bindings: {},
        };
        setVoiceBindings({});
        socialEpochRef.current++;
      }
      const voiceBinding = recording.speaker?.id
        ? voiceBindingsRef.current.bindings[recording.speaker.id]
        : undefined;
      const promptEpoch = socialEpochRef.current;
      const recognizedPersonId = recording.speaker
        ? voiceBinding && voiceBinding !== "player"
          ? voiceBinding
          : null
        : confirmedSpeakerRef.current;
      const activeFlow = taskFlowRef.current;
      if (activeFlow && activeFlow.conversationId !== incomingConversationId) {
        markRecordingHandled(recording.recording_id);
        appendLog(
          `录音 #${recording.recording_id} 已忽略 · 当前正在完成上一条人物任务`,
        );
        return;
      }
      if (!activeFlow && recognizedPersonId && !recording.sensing) {
        beginTaskFlow(
          incomingConversationId,
          recording.recording_id,
          recognizedPersonId,
        );
      }
      processingRecordings.current.add(recording.recording_id);
      updateSensingSpeechDebug(recording, { status: "transcribing" });
      try {
        let utterance = recording;
        const sensingIsCurrent = () =>
          !utterance.sensing ||
          (perceptionRef.current &&
            utterance.sensing_session_id === activeSensingSessionRef.current);
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
        const promptKey = `${conversationId}:${sequence}:${utterance.recording_id}`;
        latestPromptRef.current = promptKey;
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
          activeQuestId: activeQuestIdRef.current,
          requireTaskConfirmation: true,
          deferTasks: utterance.sensing === true,
        };
        const transcribed: LocalTranscription = finalizesSegmentedConversation
          ? {
              transcript: accumulatedTranscript!,
              localText: "",
              log: `录音 #${utterance.recording_id} 复用实时分片转写，跳过整段重复 ASR`,
            }
          : await transcribeRecordingLocally(
              utterance,
              snapshot.transcriptPrefix,
            );
        // Collect every voice before attribution gates; an OFF transition allows
        // only this RAM ledger to finish, not stale HUD/person/memory writes.
        if (utterance.sensing) {
          const id = utterance.sensing_session_id ?? 0;
          sensingSessionsRef.current.append(
            id,
            utterance.recording_id,
            transcribed.localText,
          );
          if (sensingSessionsRef.current.isClosing(id)) {
            updateSensingSpeechDebug(utterance, {
              status: transcribed.localText.trim() ? "complete" : "empty",
              transcript: transcribed.localText,
              asrLatencyMs: transcribed.metrics?.latency_ms,
            });
            markRecordingHandled(recording.recording_id);
            return;
          }
        }
        // Binding edits, face/session changes or mode changes while ASR runs
        // cannot retroactively attach this utterance to another identity.
        if (
          recording.speaker &&
          (!speakerModeRef.current || promptEpoch !== socialEpochRef.current)
        ) {
          updateSensingSpeechDebug(utterance, { status: "cancelled" });
          return;
        }
        if (utterance.sensing) {
          if (
            !perceptionRef.current ||
            utterance.sensing_session_id !== activeSensingSessionRef.current
          ) {
            updateSensingSpeechDebug(utterance, { status: "cancelled" });
            return;
          }
          const metrics = transcribed.metrics;
          updateSensingSpeechDebug(utterance, {
            status: "analyzing",
            transcript: transcribed.localText,
            asrLatencyMs: metrics?.latency_ms,
            realtimeFactor: metrics?.realtime_factor,
            modelLoadMs: metrics?.model_load_ms,
            loadThisCallMs: metrics?.load_this_call_ms,
            modelReused: metrics?.model_reused,
          });
          if (!transcribed.localText.trim()) {
            updateSensingSpeechDebug(utterance, { status: "empty" });
            markRecordingHandled(recording.recording_id);
            return;
          }
          setLastSensingTranscript(transcribed.localText);
          setGlassDialogue((current) =>
            appendGlassDialogue(
              current,
              utterance.sensing_session_id ?? 0,
              utterance.recording_id,
              transcribed.localText,
              utterance.speaker,
            ),
          );
          if (recording.speaker) {
            updateSensingSpeechDebug(utterance, {
              speakerBinding: voiceBinding || "unconfirmed",
              attributionPending: !voiceBinding,
            });
            if (!voiceBinding || !recording.speaker.id) {
              saveConversationTurn({
                id: `${conversationId}-${sequence}`,
                conversationId,
                recordingId: utterance.recording_id,
                sequence,
                transcript: transcribed.localText,
                contextTranscript: transcribed.localText,
                createdAt: new Date().toISOString(),
                speakerPersonId: null,
                sceneSummary: null,
                replySuggestions: [],
                enhancementStatus: "fallback",
                enhancementReason:
                  "声音身份未确认；不写人物记忆，任务在感知结束后统一提取",
                speakerVoiceId: recording.speaker.id,
                speakerAttribution: "unconfirmed",
                speakerSourceRecordingId: recording.speaker.sourceRecordingId,
              });
              updateSensingSpeechDebug(utterance, { status: "complete" });
              appendLog(
                "说话人身份未确认 · 已保留转写，任务将在感知结束后提取",
              );
              markRecordingHandled(recording.recording_id);
              return;
            }
          }
          appendLog(`感知语音自动分句 · ${transcribed.localText}`);
        }
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
            speakerVoiceId: recording.speaker?.id,
            speakerSourceRecordingId: recording.speaker?.sourceRecordingId,
            speakerAttribution: recording.speaker
              ? voiceBinding === "player"
                ? "player"
                : "person"
              : undefined,
            sceneSummary: snapshot.sceneSummary ?? null,
            replySuggestions: [],
            localReplySuggestions: [],
            usedMemoryIds: immediate.socialPrompt?.usedMemoryIds,
            evidenceRefs: immediate.socialPrompt?.evidenceRefs,
            enhancementStatus: "pending",
          });
        if (utterance.partial)
          conversationTranscriptRef.current.set(
            conversationId,
            transcribed.transcript,
          );
        else conversationTranscriptRef.current.delete(conversationId);

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
        const enhancement = (async () => {
          let generatedTaskTitle: string | null = null;
          try {
            const result = await processRecordingPipeline(
              utterance,
              snapshot,
              transcribed,
            );
            // A newer utterance may suppress an old reply card, but must not
            // discard an otherwise valid task/memory extraction. Identity edits
            // and sensing-session changes still invalidate the whole result.
            if (!sensingIsCurrent() || promptEpoch !== socialEpochRef.current) {
              updateSensingSpeechDebug(utterance, { status: "cancelled" });
              return;
            }
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
              updateQuests((current) => {
                const byId = new Map(current.map((q) => [q.id, q]));
                for (const q of result.quests) {
                  const existing = byId.get(q.id);
                  const before = snapshot.quests.find(
                    (item) => item.id === q.id,
                  );
                  if (
                    (!existing &&
                      !current.some(
                        (item) => q.dedupeKey && item.dedupeKey === q.dedupeKey,
                      )) ||
                    (existing && existing.revision === before?.revision)
                  )
                    byId.set(q.id, q);
                }
                return [...byId.values()];
              });
              generatedTaskTitle =
                result.generatedQuestIds
                  .map(
                    (id) =>
                      result.quests.find((quest) => quest.id === id)?.title,
                  )
                  .find((title): title is string => Boolean(title)) ?? null;
              queueGlassTaskOffers(
                result.generatedQuestIds.filter((id) =>
                  result.quests.some((q) => q.id === id && isOfferableQuest(q)),
                ),
              );
              const rewardedPeople = settleConversationInteractions(
                peopleRef.current,
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
          } catch (error) {
            updateSensingSpeechDebug(utterance, {
              status: "error",
              error: `对话分析失败（本地转写已保留）：${error instanceof Error ? error.message : String(error)}`,
            });
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
                    : "没有明确行动，本轮结束；未创建占位任务",
                );
            }
          }
        })();
        // Capture/VAD keep running natively; serialize utterance transactions
        // so a later cloud result cannot overwrite newer task/memory snapshots.
        if (utterance.sensing) {
          await enhancement;
          setSensingSpeechDebug((current) =>
            current.map((item) =>
              item.recordingId === utterance.recording_id &&
              item.status === "analyzing"
                ? {
                    ...item,
                    status: sensingIsCurrent() ? "complete" : "cancelled",
                  }
                : item,
            ),
          );
        }
        markRecordingHandled(recording.recording_id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "录音处理失败";
        updateSensingSpeechDebug(recording, {
          status: "error",
          error: message,
        });
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
      saveDialogueResponse,
      updateConversationTurn,
      updateMemories,
      updatePeople,
      updateQuests,
      queueGlassTaskOffers,
      updateSensingSpeechDebug,
    ],
  );

  const processRecordingControl = useCallback(
    (control: PersonChoiceResult) => {
      if (
        control.kind !== "sensing_control" ||
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
        appendLog("忽略了无效的感知开关事件");
        return;
      }

      if (!["sensing_start", "sensing_stop"].includes(control.choice_id))
        return;
      const enabled = control.choice_id === "sensing_start";
      updatePerception(enabled);
      appendLog(
        `眼镜按钮 · 主动感知${enabled ? "开启：拍照与语音同步启动" : "关闭"}`,
      );
      notify(`主动感知已${enabled ? "开启" : "关闭"}`);
    },
    [appendLog, notify, updatePerception],
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
      if (!manual && !perceptionRef.current) return;
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
          !manual,
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

        updateMemories((items) => [activityMemory, ...items]);
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

        appendLog(
          `场景观察 #${result.capture.request_id} · 仅作为待核对线索，不自动增加任务进度`,
        );
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

  const finalizeSensingSession = useCallback(
    async (sessionId: number, retry = false) => {
      const summary = retry
        ? lastClosedSensingSummaryRef.current?.sessionId === sessionId
          ? lastClosedSensingSummaryRef.current
          : null
        : sensingSessionsRef.current.finish(sessionId);
      if (!summary) return;
      if (sensingQuestRequestsRef.current.has(sessionId)) return;
      if (!retry)
        lastClosedSensingSummaryRef.current = { ...summary, sessionId };
      const setSummaryPhase = (
        phase: SensingTaskSummary["phase"],
        tasks: Quest[] = [],
        error?: string,
      ) => {
        setSensingTaskSummary((current) =>
          current?.sessionId === sessionId
            ? {
                sessionId,
                phase,
                utteranceCount: summary.count,
                taskCount: tasks.length,
                suggested: tasks.some((q) => q.generationKind === "suggested"),
                error,
              }
            : current,
        );
      };
      if (!summary.transcript.trim()) {
        setSummaryPhase("empty");
        appendLog("本轮感知结束 · 没有清晰转写，未生成任务");
        return;
      }
      setSummaryPhase("analyzing");
      sensingQuestRequestsRef.current.add(sessionId);
      appendLog(
        `本轮感知已结束 · 汇总 ${summary.count} 段转写并提取任务${summary.truncated ? "（长对话仅分析最近6000字）" : ""}`,
      );
      const publishTasks = (tasks: Quest[]) => {
        updateQuests((current) => {
          const existing = new Set(current.map((q) => q.dedupeKey ?? q.id));
          return [
            ...tasks.filter((q) => !existing.has(q.dedupeKey ?? q.id)),
            ...current,
          ];
        });
        queueGlassTaskOffers(tasks.map((q) => q.id));
        for (const quest of tasks)
          appendGameEvent({
            type: "task_created",
            questId: quest.id,
            source: "llm",
            dedupeKey: `session-task:${quest.id}`,
            summary: `感知结束生成候选任务 · ${quest.title}`,
          });
        setSummaryPhase("ready", tasks);
        appendLog(
          `感知总结完成 · 生成 ${tasks.length} 个候选任务，等待接受／拒绝`,
        );
        notify(`生成 ${tasks.length} 个待确认任务`);
      };
      try {
        const tasks = await planSensingQuests(summary.transcript, sessionId, {
          quests: questsRef.current,
          memories: memoriesRef.current,
          people: peopleRef.current,
        });
        publishTasks(tasks);
        appendLog(
          `本轮任务由大模型生成 · ${tasks[0]?.generationModel ?? "未知"} · 使用 ${new Set(tasks.flatMap((q) => q.generationMemoryIds ?? [])).size} 条相关 memory`,
        );
      } catch (error) {
        const reason = (
          error instanceof Error ? error.message : String(error)
        ).slice(0, 180);
        appendLog(`感知总结失败 · ${reason}`);
        setSummaryPhase("error", [], reason);
        notify("任务生成失败，可在手机重试本轮；没有使用固定模板");
      } finally {
        sensingQuestRequestsRef.current.delete(sessionId);
      }
    },
    [appendLog, appendGameEvent, notify, updateQuests, queueGlassTaskOffers],
  );

  const retrySensingTasks = useCallback(() => {
    const cached = lastClosedSensingSummaryRef.current;
    if (
      !perceptionRef.current &&
      cached &&
      sensingTaskSummary?.phase === "error"
    )
      void finalizeSensingSession(cached.sessionId, true);
  }, [finalizeSensingSession, sensingTaskSummary]);

  useEffect(() => {
    let cancelled = false;
    // Resume interrupted designs without granting a second copy of the reward.
    void (async () => {
      for (const souvenir of souvenirsRef.current.filter(
        (item) => item.designState === "pending",
      )) {
        if (cancelled) break;
        const quest = questsRef.current.find(
          (item) => item.id === souvenir.questId,
        );
        if (!quest) continue;
        const person = peopleRef.current.find(
          (item) => item.id === souvenir.personId,
        );
        const refined = await refineSouvenir(
          souvenir,
          quest,
          person,
          souvenirsRef.current,
        );
        if (cancelled) break;
        updateSouvenirs((items) =>
          items.map((item) =>
            item.id === refined.id && item.designState === "pending"
              ? { ...refined, status: item.status, viewedAt: item.viewedAt }
              : item,
          ),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [updateSouvenirs]);


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
      if (suggestionResponseRef.current)
        void nativeService.cancelMoodListen().catch(() => undefined);
    };
  }, [appendLog, connectGlasses, refreshModelDownload, refreshSession]);

  // Compare wire contents, not refreshed array/object identities: 100ms session
  // polling must not continually cancel the 180ms HUD send debounce.
  const peopleHudOnline =
    session.phase === "ready" || session.phase === "capturing";
  useEffect(() => {
    // Do not resurrect the photo from the previous perception run/session.
    setPeopleHudBaseline(sessionRef.current.last_face?.request_id ?? null);
  }, [perception, session.session_id, peopleHudOnline]);

  const visiblePeople = glassPeopleSnapshot(
    session.last_face,
    perception && peopleHudOnline && !session.face_error,
    session.session_id,
    people,
    peopleHudBaseline,
  );
  const glassHudConfigJson = JSON.stringify({
    ...createGlassHudSnapshot(
      quests,
      activeQuestId,
      currentMood,
      memories,
      gameEvents,
    ),
    dialogue: glassDialogueSnapshot(
      glassDialogue,
      perception && consecutiveSpeakers,
    ),
    peopleInView: visiblePeople,
    socialHint: glassSocialHint(
      visiblePeople,
      lastSensingTranscript,
      memories,
      quests,
      activeQuestId,
    ),
    taskSummary: glassTaskSummarySnapshot(
      sensingTaskSummary,
      perception,
      quests.filter((q) => isOfferableQuest(q)).length,
    ),
  });
  useEffect(() => {
    if (session.phase !== "ready") return;
    const timer = window.setTimeout(() => {
      void nativeService
        .syncGlassHud(glassHudConfigJson)
        .catch(() => undefined);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [glassHudConfigJson, session.phase]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (
        sceneObservationEnabledRef.current &&
        perceptionRef.current &&
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

  const sensingAudio = useSensingAudio(
    perception && (session.phase === "ready" || session.phase === "capturing"),
    asrDownload?.ready === true,
    processRecording,
    activeSensingSessionRef,
    sceneObservationEnabled &&
      modelDownloads.some(
        (item) =>
          item.ready && item.model_id.includes("Qwen3-VL-2B-Instruct-MNN"),
      )
      ? SCENE_VL_MODEL
      : null,
    consecutiveSpeakers,
    {
      requested: perception,
      onStart: (id) => {
        sensingSessionsRef.current.start(id, latestSensingSessionRef.current);
        latestSensingSessionRef.current = id;
      },
      shouldFinalize: (id) => sensingSessionsRef.current.isClosing(id),
      onEnd: finalizeSensingSession,
    },
  );

  useEffect(() => {
    if (perception) return;
    setGlassDialogue(emptyGlassDialogue());
    if (consecutiveSpeakers) {
      voiceBindingsRef.current = { session: 0, bindings: {} };
      setVoiceBindings({});
    }
    setSensingSpeechDebug((current) =>
      current.map((item) =>
        (item.status === "transcribing" || item.status === "analyzing") &&
        !sensingSessionsRef.current.isClosing(item.sessionId)
          ? { ...item, status: "cancelled" }
          : item,
      ),
    );
    const response = suggestionResponseRef.current;
    if (response)
      closeSuggestionResponse(response.contextId, "主动感知已关闭", false);
  }, [perception, closeSuggestionResponse, consecutiveSpeakers]);

  useEffect(() => {
    const matches = session.last_face?.matches ?? [];
    const online = session.phase === "ready" || session.phase === "capturing";
    const personId =
      online && matches.length === 1 && matches[0].decision === "known"
        ? matches[0].person_id
        : null;
    if (socialFaceRef.current !== personId) {
      socialEpochRef.current++;
      confirmSpeaker(null);
      const response = suggestionResponseRef.current;
      if (response)
        closeSuggestionResponse(
          response.contextId,
          "人物变化：停止显示上一人的建议",
          false,
        );
      if (latestPromptRef.current)
        void nativeService
          .dismissChoiceCard(
            `conversation-${latestPromptRef.current.split(":")[0]}`,
          )
          .catch(() => undefined);
      if (personHudSignatureRef.current)
        void nativeService
          .dismissChoiceCard(personHudSignatureRef.current)
          .catch(() => undefined);
      socialFaceRef.current = personId ?? null;
      personHudSignatureRef.current = "";
    }
    if (
      !personId ||
      taskFlowRef.current ||
      suggestionResponseRef.current ||
      glassTaskOfferIdsRef.current.length ||
      !perception
    )
      return;
  }, [
    session.last_face,
    session.phase,
    perception,
    people,
    memories,
    quests,
    activeQuestId,
    confirmSpeaker,
    closeSuggestionResponse,
  ]);

  const value = useMemo<AppStoreValue>(
    () => ({
      consecutiveSpeakers,
      setConsecutiveSpeakers,
      voiceBindings,
      bindVoiceSpeaker,
      confirmedSpeakerId,
      confirmSpeaker,
      reviewQuest,
      changeQuestStatus,
      renameQuest,
      mergeQuest,
      deleteQuest,
      deleteMemory,
      editMemory,
      quests,
      people,
      memories,
      currentMood,
      glassSettings,
      perception,
      session,
      sensingAudio,
      lastSensingTranscript,
      sensingTaskSummary,
      retrySensingTasks,
      sensingSpeechDebug,
      clearSensingSpeechDebug,
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
      markSouvenirViewed,
      applyConversationInteractions,
    }),
    [
      confirmedSpeakerId,
      consecutiveSpeakers,
      setConsecutiveSpeakers,
      voiceBindings,
      bindVoiceSpeaker,
      confirmSpeaker,
      reviewQuest,
      changeQuestStatus,
      renameQuest,
      mergeQuest,
      deleteQuest,
      deleteMemory,
      editMemory,
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
      markSouvenirViewed,
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
      sensingAudio,
      lastSensingTranscript,
      sensingTaskSummary,
      retrySensingTasks,
      sensingSpeechDebug,
      clearSensingSpeechDebug,
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
