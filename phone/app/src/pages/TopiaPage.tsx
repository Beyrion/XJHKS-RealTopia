import { type CSSProperties, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MoodDialog } from "../components/topia/MoodDialog";
import { MoodWeather } from "../components/topia/MoodWeather";
import { TopiaLandmarkDrawer } from "../components/topia/TopiaLandmarkDrawer";
import { TopiaScene } from "../components/topia/TopiaScene";
import { Icon } from "../components/ui/Icon";
import { moodEmoji, moodProfiles } from "../data/appData";
import { useMoodCheckIn } from "../hooks/useMoodCheckIn";
import {
  type QuickVoiceKind,
  useQuickVoiceRecording,
} from "../hooks/useQuickVoiceRecording";
import type {
  TopiaLandmark,
  TopiaLocation,
  TopiaWorldPayload,
} from "../models";
import { topiaWorldService } from "../services/topiaWorld";
import { useAppStore } from "../store/AppStore";
import {
  calculateVitality,
  inferQuestCategory,
  questCategoryMeta,
  recommendedQuest,
} from "../utils/gameRules";

const locations: Array<{
  id: TopiaLocation;
  emoji: string;
  label: string;
}> = [
  { id: "exterior", emoji: "☁️", label: "屋外" },
  { id: "interior", emoji: "🏠", label: "房间内" },
  { id: "garden", emoji: "🌱", label: "菜地" },
];

export default function TopiaPage() {
  const navigate = useNavigate();
  const {
    quests,
    memories,
    people,
    currentMood,
    activeQuestId,
    gameEvents,
    session,
    notify,
  } = useAppStore();
  const [location, setLocation] = useState<TopiaLocation>("exterior");
  const [selectedLandmark, setSelectedLandmark] =
    useState<TopiaLandmark | null>(null);
  const [topiaPayload, setTopiaPayload] = useState<TopiaWorldPayload | null>(
    null,
  );
  const [conversationPickerOpen, setConversationPickerOpen] = useState(false);
  const moodCheckIn = useMoodCheckIn();
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
  const sceneLandmarks = topiaPayload?.world.scenes[location].landmarks ?? [];
  const openLocation = (nextLocation: TopiaLocation) => {
    setSelectedLandmark(null);
    setLocation(nextLocation);
  };
  const quickAction = (kind: QuickVoiceKind) => {
    if (quickVoice.kind === kind && quickVoice.phase === "listening") {
      void quickVoice.stop();
      return;
    }
    if (kind === "conversation") {
      setConversationPickerOpen(true);
      return;
    }
    void quickVoice.start(kind);
  };
  const quickActionIcon = (kind: QuickVoiceKind) => {
    if (quickVoice.kind !== kind)
      return kind === "task"
        ? "ListTodo"
        : kind === "conversation"
          ? "UsersRound"
          : "Heart";
    return quickVoice.phase === "listening" ? "Square" : "LoaderCircle";
  };
  const recentlyRecognizedIds = [
    ...new Set(
      (session.last_face?.matches ?? []).flatMap((match) =>
        match.decision === "known" && match.person_id ? [match.person_id] : [],
      ),
    ),
  ];
  const suggestedPersonId =
    recentlyRecognizedIds.length === 1 ? recentlyRecognizedIds[0] : null;
  const beginConversation = (personId: string | null) => {
    setConversationPickerOpen(false);
    void quickVoice.start("conversation", personId);
  };

  if (!topiaPayload) {
    return <div className="topia topia-loading" aria-busy="true" />;
  }

  const { world: topiaWorld, crops } = topiaPayload;

  return (
    <div className="topia">
      <TopiaScene
        mood={currentMood}
        stage={stage}
        location={location}
        crops={crops}
        world={topiaWorld}
        focusCategory={focusCategory}
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
            key={landmark.id}
            aria-label={landmark.label}
            style={landmark.fallbackPlacement}
            onClick={() => setSelectedLandmark(landmark)}
          >
            <span aria-hidden="true">{landmark.emoji}</span>
            <b>{landmark.label}</b>
            {location === "garden" && (
              <small>{landmark.eyebrow.replace("任务作物 · ", "")}</small>
            )}
          </button>
        ))}
        <button
          className="mood-indicator"
          id="world-mood"
          aria-label={`当前心情：${profile.label}，${profile.weather}`}
          title={`${profile.label} · ${profile.weather}`}
          onClick={moodCheckIn.show}
        >
          {moodEmoji[currentMood.mood]}
        </button>
      </TopiaScene>
      <div className="today-column">
        <div className="quick-actions" aria-label="快速记录">
          <button
            id="record-task"
            className={
              quickVoice.kind === "task" ? `is-${quickVoice.phase}` : undefined
            }
            aria-label={
              quickVoice.kind === "task" && quickVoice.phase === "listening"
                ? "停止记录任务"
                : "记录任务"
            }
            aria-busy={
              quickVoice.kind === "task" && quickVoice.phase === "processing"
            }
            disabled={
              quickVoice.phase === "processing" ||
              (quickVoice.phase === "listening" && quickVoice.kind !== "task")
            }
            onClick={() => quickAction("task")}
          >
            <Icon name={quickActionIcon("task")} />
            记录任务
          </button>
          <button
            id="record-conversation"
            className={
              quickVoice.kind === "conversation"
                ? `is-${quickVoice.phase}`
                : undefined
            }
            aria-label={
              quickVoice.kind === "conversation" &&
              quickVoice.phase === "listening"
                ? "停止记录人物对话"
                : "记录人物对话"
            }
            aria-busy={
              quickVoice.kind === "conversation" &&
              quickVoice.phase === "processing"
            }
            disabled={
              quickVoice.phase === "processing" ||
              (quickVoice.phase === "listening" &&
                quickVoice.kind !== "conversation")
            }
            onClick={() => quickAction("conversation")}
          >
            <Icon name={quickActionIcon("conversation")} />
            人物对话
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
              quickVoice.phase === "processing" ||
              (quickVoice.phase === "listening" && quickVoice.kind !== "mood")
            }
            onClick={() => quickAction("mood")}
          >
            <Icon name={quickActionIcon("mood")} />
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
            onClick={moodCheckIn.show}
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
      {conversationPickerOpen && (
        <div
          className="person-enroll-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setConversationPickerOpen(false);
          }}
        >
          <section
            className="person-enroll-dialog conversation-person-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="conversation-person-title"
          >
            <header>
              <span>
                <small>人物记忆</small>
                <h2 id="conversation-person-title">你正在和谁对话？</h2>
              </span>
              <button
                type="button"
                aria-label="关闭人物选择"
                onClick={() => setConversationPickerOpen(false)}
              >
                <Icon name="X" />
              </button>
            </header>
            <p>
              先确认对话对象，系统才能把任务、共同记忆和好感度记到正确的人身上。
            </p>
            <div className="conversation-person-list">
              {people.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  className={
                    person.id === suggestedPersonId ? "suggested" : undefined
                  }
                  onClick={() => beginConversation(person.id)}
                >
                  <span>
                    <b>{person.name}</b>
                    <small>{person.role}</small>
                  </span>
                  {person.id === suggestedPersonId && (
                    <em>眼镜最近识别 · 建议</em>
                  )}
                  <Icon name="ChevronRight" />
                </button>
              ))}
            </div>
            <button
              className="conversation-unknown"
              type="button"
              onClick={() => beginConversation(null)}
            >
              暂时不确定，先保存为待关联对话
            </button>
            <small className="conversation-privacy">
              最近人脸只用于提供建议；未经你点击确认，不会自动绑定。
            </small>
          </section>
        </div>
      )}
      <MoodDialog
        open={moodCheckIn.open}
        phase={moodCheckIn.phase}
        mood={moodCheckIn.currentMood}
        error={moodCheckIn.error}
        onStart={() => void moodCheckIn.start()}
        onCancel={() => void moodCheckIn.cancel()}
        onFinishListening={() => void moodCheckIn.finishListening()}
        onClose={moodCheckIn.close}
      />
      {selectedLandmark && (
        <TopiaLandmarkDrawer
          landmark={selectedLandmark}
          memories={memories}
          quests={quests}
          people={people}
          onClose={() => setSelectedLandmark(null)}
        />
      )}
    </div>
  );
}
