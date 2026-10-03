import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { MoodWeather } from "../components/topia/MoodWeather";
import { TopiaLandmarkDrawer } from "../components/topia/TopiaLandmarkDrawer";
import { TopiaScene } from "../components/topia/TopiaScene";
import { TopiaStudioDialog } from "../components/topia/TopiaStudioDialog";
import { Icon } from "../components/ui/Icon";
import { moodEmoji, moodProfiles } from "../data/appData";
import { useQuickVoiceRecording } from "../hooks/useQuickVoiceRecording";
import type {
  MoodKind,
  TopiaLandmark,
  TopiaGenerationProgress,
  TopiaLocation,
  TopiaUserProfileInput,
  TopiaWorldPayload,
} from "../models";
import { moodKinds } from "../models";
import { topiaWorldService } from "../services/topiaWorld";
import { storage } from "../services/storage";
import { useAppStore } from "../store/AppStore";
import {
  calculateVitality,
  inferQuestCategory,
  questCategoryMeta,
  recommendedQuest,
} from "../utils/gameRules";
import { attachSouvenirsToTopia } from "../utils/souvenir";

const locations: Array<{
  id: TopiaLocation;
  emoji: string;
  label: string;
}> = [
  { id: "exterior", emoji: "☁️", label: "屋外" },
  { id: "interior", emoji: "🏠", label: "房间内" },
  { id: "garden", emoji: "🌱", label: "菜地" },
];

const manualMoodIntensity: Record<MoodKind, number> = {
  joyful: 72,
  calm: 52,
  sad: 64,
  anxious: 68,
  angry: 70,
  tired: 66,
  neutral: 35,
};

// Capture this before the app store seeds its starter roster into localStorage.
const hadPersistedUserDataAtBoot = storage.hasPersistedUserData();

export default function TopiaPage() {
  const navigate = useNavigate();
  const {
    quests,
    memories,
    people,
    currentMood,
    activeQuestId,
    gameEvents,
    perception,
    updatePerception,
    sensingAudio,
    souvenirs,
    markSouvenirViewed,
    notify,
    worldEvents,
    acceptWorldEvent,
    ignoreWorldEvent,
    updateMood,
  } = useAppStore();
  const [location, setLocation] = useState<TopiaLocation>("exterior");
  const [selectedLandmark, setSelectedLandmark] =
    useState<TopiaLandmark | null>(null);
  const [topiaPayload, setTopiaPayload] = useState<TopiaWorldPayload | null>(
    null,
  );
  const [topiaStudioOpen, setTopiaStudioOpen] = useState(false);
  const [hadPersistedUserData] = useState(hadPersistedUserDataAtBoot);
  const [topiaGenerating, setTopiaGenerating] = useState(false);
  const [topiaProgress, setTopiaProgress] =
    useState<TopiaGenerationProgress | null>(null);
  const [moodMenuOpen, setMoodMenuOpen] = useState(false);
  const moodControlRef = useRef<HTMLDivElement>(null);
  const quickVoice = useQuickVoiceRecording();
  useEffect(() => {
    let active = true;
    void topiaWorldService
      .load({ quests, people, memories })
      .then((payload) => {
        if (active) setTopiaPayload(payload);
      })
      .catch((error) => {
        if (active)
          notify(
            `个人世界加载失败：${error instanceof Error ? error.message : String(error)}`,
          );
      });
    return () => {
      active = false;
    };
  }, [memories, notify, people, quests]);
  useEffect(() => {
    const update = (event: Event) => {
      const next = (event as CustomEvent<TopiaWorldPayload>).detail;
      if (next) setTopiaPayload(next);
    };
    window.addEventListener("realtopia:topia-world", update);
    return () => window.removeEventListener("realtopia:topia-world", update);
  }, []);
  useEffect(() => {
    if (!topiaPayload?.studio.needsOnboarding) return;
    if (!hadPersistedUserData) {
      setTopiaStudioOpen(true);
      return;
    }
    void topiaWorldService
      .completeOnboarding({ quests, people, memories })
      .then(setTopiaPayload)
      .catch((error) =>
        notify(
          `Topia 状态迁移失败：${error instanceof Error ? error.message : String(error)}`,
        ),
      );
  }, [
    hadPersistedUserData,
    memories,
    notify,
    people,
    quests,
    topiaPayload?.studio.needsOnboarding,
  ]);
  useEffect(() => {
    if (!topiaPayload || topiaGenerating || topiaPayload.studio.needsOnboarding)
      return;
    void topiaWorldService
      .maintain({ quests, people, memories })
      .then((next) => next && setTopiaPayload(next))
      .catch(() => undefined);
  }, [
    memories,
    people,
    quests,
    topiaGenerating,
    topiaPayload?.studio.activeWorldId,
  ]);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void topiaWorldService.onProgress(setTopiaProgress).then((dispose) => {
      unlisten = dispose;
    });
    return () => unlisten?.();
  }, []);
  useEffect(() => {
    if (!moodMenuOpen) return;
    const closeFromOutside = (event: PointerEvent) => {
      if (!moodControlRef.current?.contains(event.target as Node))
        setMoodMenuOpen(false);
    };
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoodMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [moodMenuOpen]);
  const vitality = calculateVitality(quests, memories, gameEvents);
  const stage = vitality >= 80 ? 3 : vitality >= 60 ? 2 : 1;
  const focus = recommendedQuest(quests, activeQuestId);
  const focusCategory =
    focus?.category ?? (focus ? inferQuestCategory(focus) : "general");
  const focusMeta = questCategoryMeta[focusCategory];
  const todayLabel = new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(new Date());
  const profile = moodProfiles[currentMood.mood];
  const pendingWorldEvent = worldEvents.find(
    (item) =>
      item.status === "pending" && Date.parse(item.expiresAt) > Date.now(),
  );
  const composedTopia = useMemo(
    () =>
      topiaPayload
        ? attachSouvenirsToTopia(topiaPayload.world, [
            ...souvenirs.filter((s) => s.status !== "revoked"),
          ])
        : null,
    [souvenirs, topiaPayload],
  );
  const sceneLandmarks = composedTopia?.world.scenes[location].landmarks ?? [];
  const openLocation = (nextLocation: TopiaLocation) => {
    setSelectedLandmark(null);
    setMoodMenuOpen(false);
    setLocation(nextLocation);
  };
  const selectMood = (mood: MoodKind) => {
    const nextProfile = moodProfiles[mood];
    updateMood({
      mood,
      intensity: manualMoodIntensity[mood],
      summary: `此刻感到${nextProfile.label}`,
      support: `Topia 会用${nextProfile.effect}回应你。`,
      transcript: "",
      model: "manual-picker",
      analyzedAt: new Date().toISOString(),
    });
    setMoodMenuOpen(false);
    notify(`心情已切换为「${nextProfile.label}」`);
  };
  const recordMood = () => {
    if (quickVoice.phase === "listening") {
      void quickVoice.stop();
      return;
    }
    void quickVoice.start("mood");
  };
  const worldContext = { quests, people, memories };
  const runTopiaAction = async (
    mode: TopiaGenerationProgress["mode"],
    action: () => Promise<TopiaWorldPayload>,
  ) => {
    setTopiaGenerating(true);
    setTopiaProgress({
      mode,
      stage: "preparing",
      progress: 2,
      message: mode === "create" ? "正在准备新的 Topia" : "正在整理最近的变化",
    });
    try {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const next = await action();
      setTopiaPayload(next);
      setLocation("exterior");
      setSelectedLandmark(null);
      if (mode === "create") {
        setTopiaStudioOpen(false);
        setMoodMenuOpen(false);
      }
      notify("Topia 已更新");
    } catch (error) {
      notify(
        `Topia 更新失败：${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setTopiaGenerating(false);
    }
  };
  const generateTopia = (nextProfile: TopiaUserProfileInput) =>
    void runTopiaAction("create", () =>
      topiaWorldService.generate(nextProfile, worldContext),
    );
  const iterateTopia = () => {
    void runTopiaAction("iterate", () =>
      topiaWorldService.iterate(worldContext),
    );
  };
  const switchTopia = async (worldId: string) => {
    try {
      const next = await topiaWorldService.switchWorld(worldId, worldContext);
      setTopiaPayload(next);
      setLocation("exterior");
      setSelectedLandmark(null);
      setTopiaStudioOpen(false);
      notify(`已切换至「${next.world.profile.homeName}」`);
    } catch (error) {
      notify(
        `Topia 切换失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  const deleteTopia = async (worldId: string) => {
    const next = await topiaWorldService.deleteWorld(worldId, worldContext);
    setTopiaPayload(next);
    if (topiaPayload?.world.id === worldId) {
      setLocation("exterior");
      setSelectedLandmark(null);
    }
    notify("Topia 已删除");
  };
  const useDefaultTopia = async () => {
    try {
      const next = await topiaWorldService.completeOnboarding(worldContext);
      setTopiaPayload(next);
      setTopiaStudioOpen(false);
    } catch (error) {
      notify(
        `默认 Topia 启用失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  const saveThumbnail = useCallback(
    (thumbnail: string) => {
      const worldId = topiaPayload?.world.id;
      const existing = topiaPayload?.studio.worlds.find(
        (world) => world.id === worldId,
      )?.thumbnail;
      if (!worldId || existing) return;
      void topiaWorldService
        .saveThumbnail(worldId, thumbnail)
        .then(() =>
          setTopiaPayload((current) =>
            current
              ? {
                  ...current,
                  studio: {
                    ...current.studio,
                    worlds: current.studio.worlds.map((world) =>
                      world.id === worldId ? { ...world, thumbnail } : world,
                    ),
                  },
                }
              : current,
          ),
        )
        .catch(() => undefined);
    },
    [topiaPayload?.studio.worlds, topiaPayload?.world.id],
  );

  if (!topiaPayload) {
    return <div className="topia topia-loading" aria-busy="true" />;
  }

  const { crops } = topiaPayload;
  const { world: topiaWorld, placements: souvenirPlacements } = composedTopia!;
  const needsFirstRun = topiaPayload.studio.needsOnboarding;
  const activeWorldThumbnail = topiaPayload.studio.worlds.find(
    (world) => world.id === topiaWorld.id,
  )?.thumbnail;
  const latestSouvenirPlacement = souvenirs[0]
    ? souvenirPlacements.find(
        (placement) => placement.souvenir.id === souvenirs[0].id,
      )
    : undefined;
  const souvenirByAnchor = new Map(
    souvenirPlacements.map((placement) => [
      placement.landmark.anchorId,
      placement.souvenir.id,
    ]),
  );
  const selectedSouvenirObject = selectedLandmark
    ? Object.values(topiaWorld.scenes)
        .flatMap((scene) => scene.objects)
        .find(
          (object) =>
            object.layer === "souvenir" &&
            object.anchorId === selectedLandmark.anchorId,
        )
    : undefined;
  const openLatestSouvenir = () => {
    if (!latestSouvenirPlacement) return;
    setMoodMenuOpen(false);
    setLocation(latestSouvenirPlacement.location);
    setSelectedLandmark(latestSouvenirPlacement.landmark);
    markSouvenirViewed(latestSouvenirPlacement.souvenir.id);
  };

  return (
    <div className="topia">
      <TopiaScene
        mood={currentMood}
        stage={stage}
        location={location}
        crops={crops}
        world={topiaWorld}
        focusCategory={focusCategory}
        onThumbnail={activeWorldThumbnail ? undefined : saveThumbnail}
      >
        <MoodWeather mood={currentMood.mood} />
        {focus && (
          <div
            className={`quest-focus-effect ${focusCategory}`}
            aria-hidden="true"
          >
            {Array.from({ length: 10 }, (_, index) => (
              <i
                key={index}
                style={{ "--focus-index": index } as CSSProperties}
              />
            ))}
          </div>
        )}
        <div className="world-locations" aria-label="Topia 地点">
          {locations.map((item) => (
            <button
              className={location === item.id ? "active" : ""}
              data-topia-location={item.id}
              key={item.id}
              aria-label={item.label}
              aria-pressed={location === item.id}
              title={item.label}
              onClick={() => openLocation(item.id)}
            >
              {item.emoji}
            </button>
          ))}
        </div>
        <button
          className="topia-studio-trigger"
          aria-label="打开 Topia 工坊"
          title="切换或生成 Topia"
          onClick={() => setTopiaStudioOpen(true)}
        >
          <span aria-hidden="true">🎨</span>
        </button>
        {location === "exterior" && (
          <>
            <button
              className="scene-portal portal-door"
              data-topia-portal="interior"
              data-topia-anchor="portal-interior"
              aria-label="从小房门进入房间内"
              title="进入房间"
              onClick={() => openLocation("interior")}
            />
            <button
              className="scene-portal portal-island"
              data-topia-portal="garden"
              data-topia-anchor="portal-garden"
              aria-label="前往后方浮空菜地"
              title="前往菜地"
              onClick={() => openLocation("garden")}
            />
          </>
        )}
        {sceneLandmarks.map((landmark) => (
          <button
            className={`topia-landmark topia-landmark-${landmark.id}`}
            data-topia-landmark={landmark.id}
            data-topia-anchor={landmark.anchorId}
            data-topia-souvenir={souvenirByAnchor.get(landmark.anchorId)}
            key={landmark.id}
            aria-label={landmark.label}
            style={landmark.fallbackPlacement}
            onClick={() => {
              setSelectedLandmark(landmark);
              const souvenirId = souvenirByAnchor.get(landmark.anchorId);
              if (souvenirId) markSouvenirViewed(souvenirId);
            }}
          >
            <span aria-hidden="true">{landmark.emoji}</span>
            <b>{landmark.label}</b>
            {location === "garden" && (
              <small>{landmark.eyebrow.replace("任务作物 · ", "")}</small>
            )}
          </button>
        ))}
        {souvenirs[0] && !souvenirs[0].viewedAt && latestSouvenirPlacement && (
          <button
            type="button"
            className="latest-souvenir"
            data-souvenir={souvenirs[0].id}
            data-souvenir-location={latestSouvenirPlacement.location}
            aria-label={`查看最新纪念品：${souvenirs[0].name}`}
            onClick={openLatestSouvenir}
          >
            <span aria-hidden="true">{souvenirs[0].emoji}</span>
            <span>
              <small>最新纪念品</small>
              <b>{souvenirs[0].name}</b>
            </span>
            <Icon name="ChevronRight" />
          </button>
        )}
        <div className="mood-picker-control" ref={moodControlRef}>
          <button
            className="mood-indicator"
            id="world-mood"
            aria-label={`当前心情：${profile.label}，点击直接修改`}
            aria-haspopup="menu"
            aria-expanded={moodMenuOpen}
            aria-controls="world-mood-menu"
            title={`${profile.label} · 点击修改心情`}
            onClick={() => setMoodMenuOpen((open) => !open)}
          >
            {moodEmoji[currentMood.mood]}
          </button>
          {moodMenuOpen && (
            <div
              className="mood-picker-menu"
              id="world-mood-menu"
              role="menu"
              aria-label="直接选择心情"
            >
              <small>此刻的心情</small>
              <div>
                {moodKinds.map((mood) => (
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={currentMood.mood === mood}
                    className={currentMood.mood === mood ? "active" : ""}
                    data-mood-choice={mood}
                    key={mood}
                    onClick={() => selectMood(mood)}
                  >
                    <span aria-hidden="true">{moodEmoji[mood]}</span>
                    <b>{moodProfiles[mood].label}</b>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </TopiaScene>
      <div className="today-column">
        <div className="quick-actions" aria-label="感知与心情">
          <button
            id="record-conversation"
            className={perception ? "is-listening" : undefined}
            aria-label={perception ? "关闭对话感知" : "开启对话感知"}
            aria-pressed={perception}
            disabled={!perception && quickVoice.phase !== "idle"}
            onClick={() => updatePerception(!perception)}
          >
            <Icon name={perception ? "Square" : "UsersRound"} />
            对话感知 · {perception ? "开" : "关"}
          </button>
          <button
            id="record-mood"
            className={
              quickVoice.kind === "mood" ? `is-${quickVoice.phase}` : undefined
            }
            aria-label={
              quickVoice.kind === "mood" && quickVoice.phase === "listening"
                ? "停止记录心情"
                : "记录心情"
            }
            aria-busy={
              quickVoice.kind === "mood" && quickVoice.phase === "processing"
            }
            disabled={
              perception ||
              sensingAudio.active ||
              quickVoice.phase === "processing" ||
              (quickVoice.phase === "listening" && quickVoice.kind !== "mood")
            }
            onClick={recordMood}
          >
            <Icon
              name={
                quickVoice.phase === "idle"
                  ? "Heart"
                  : quickVoice.phase === "listening"
                    ? "Square"
                    : "LoaderCircle"
              }
            />
            记录心情
          </button>
        </div>
        <aside className="today panel">
          <div className="today-head">
            <b>今天</b>
            <small>{todayLabel}</small>
          </div>
          <h2>当前旅程</h2>
          <div className="life">
            <span>
              生命力 <b>{vitality}</b>
            </span>
            <i>
              <em style={{ width: `${vitality}%` }} />
            </i>
          </div>
          {focus && (
            <button
              className={`today-item active-focus-card focus-${focusCategory}`}
              data-tab="quests"
              data-active-quest={focus.id}
              style={
                { "--focus-progress": `${focus.progress}%` } as CSSProperties
              }
              onClick={() =>
                navigate("/quests", { state: { questId: focus.id } })
              }
            >
              <span className="item-icon gold">
                <span className="focus-category-symbol" aria-hidden="true">
                  {focusMeta.emoji}
                </span>
              </span>
              <span>
                <b>{focus.title}</b>
                <small>
                  {focusMeta.label} · {focus.progress}% · {focusMeta.effect}
                </small>
              </span>
              <Icon name="ChevronRight" />
            </button>
          )}
          <button
            className="today-item"
            id="today-mood"
            aria-label="直接修改当前心情"
            onClick={() => setMoodMenuOpen(true)}
          >
            <span className="item-icon avatar">
              <Icon name="Heart" />
            </span>
            <span>
              <b>{currentMood.summary}</b>
              <small>
                {profile.label} · {profile.weather}
              </small>
            </span>
            <Icon name="ChevronRight" />
          </button>
        </aside>
      </div>
      {pendingWorldEvent && (
        <section className="world-event-card" aria-live="polite">
          <header>
            <span>✦</span>
            <div>
              <small>动态世界事件 · {pendingWorldEvent.locationLabel}</small>
              <b>{pendingWorldEvent.title}</b>
            </div>
          </header>
          <p>{pendingWorldEvent.description}</p>
          <small>{pendingWorldEvent.reason}</small>
          <div>
            <button
              id="world-event-ignore"
              onClick={() => ignoreWorldEvent(pendingWorldEvent.id)}
            >
              暂时忽略
            </button>
            <button
              className="primary"
              id="world-event-accept"
              onClick={() => acceptWorldEvent(pendingWorldEvent.id)}
            >
              接受事件
            </button>
          </div>
        </section>
      )}
      <TopiaStudioDialog
        open={topiaStudioOpen}
        mode={needsFirstRun ? "onboarding" : "manage"}
        studio={topiaPayload.studio}
        progress={topiaProgress}
        generating={topiaGenerating}
        onClose={() => setTopiaStudioOpen(false)}
        onUseDefault={() => void useDefaultTopia()}
        onGenerate={generateTopia}
        onIterate={iterateTopia}
        onSwitch={switchTopia}
        onDelete={deleteTopia}
      />
      {selectedLandmark && (
        <TopiaLandmarkDrawer
          landmark={selectedLandmark}
          memories={memories}
          quests={quests}
          people={people}
          souvenirObject={selectedSouvenirObject}
          onClose={() => setSelectedLandmark(null)}
        />
      )}
    </div>
  );
}
