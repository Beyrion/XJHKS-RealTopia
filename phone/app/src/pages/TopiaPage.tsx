import { useNavigate } from "react-router-dom";
import { MoodDialog } from "../components/topia/MoodDialog";
import { MoodWeather } from "../components/topia/MoodWeather";
import { TopiaScene } from "../components/topia/TopiaScene";
import { Icon } from "../components/ui/Icon";
import { moodEmoji, moodProfiles } from "../data/appData";
import { useMoodCheckIn } from "../hooks/useMoodCheckIn";
import { useAppStore } from "../store/AppStore";

export default function TopiaPage() {
  const navigate = useNavigate();
  const { quests, memories, currentMood, notify } = useAppStore();
  const moodCheckIn = useMoodCheckIn();
  const vitality = Math.min(
    99,
    48 +
      Math.round(
        quests.reduce((sum, item) => sum + item.progress, 0) /
          Math.max(1, quests.length) /
          2,
      ) +
      Math.min(20, memories.length),
  );
  const stage = vitality >= 80 ? 3 : vitality >= 60 ? 2 : 1;
  const focus = quests.find((item) => item.progress < 100) ?? quests[0];
  const profile = moodProfiles[currentMood.mood];

  return (
    <div className="topia">
      <TopiaScene mood={currentMood} stage={stage}>
        <MoodWeather mood={currentMood.mood} />
        <button className="landmark garden">
          <Icon name="Leaf" />
          <span>
            <b>窗边花圃</b>
            <small>生长 {vitality}%</small>
          </span>
        </button>
        <button className="landmark lab">
          <Icon name="Telescope" />
          <span>
            <b>星图桌</b>
            <small>{stage === 3 ? "微光已点亮" : "正在布置"}</small>
          </span>
        </button>
        <div className="world-title">
          <h1>云上漂流屋</h1>
          <p>{memories.length} 段记忆正在装点房间</p>
        </div>
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
            aria-label="记录任务"
            onClick={() => notify("任务会从眼镜对话中自动提炼")}
          >
            <Icon name="ListTodo" />
            记录任务
          </button>
          <button
            id="record-mood"
            aria-label="记录心情"
            onClick={moodCheckIn.show}
          >
            <Icon name="Heart" />
            记录心情
          </button>
        </div>
        <aside className="today panel">
          <div className="today-head">
            <b>今天</b>
            <small>8月9日</small>
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
          <button
            className="today-item"
            data-tab="quests"
            onClick={() => navigate("/quests")}
          >
            <span className="item-icon gold">
              <Icon name="CircleAlert" />
            </span>
            <span>
              <b>{focus.title}</b>
              <small>{focus.meta}</small>
            </span>
            <Icon name="ChevronRight" />
          </button>
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
    </div>
  );
}
