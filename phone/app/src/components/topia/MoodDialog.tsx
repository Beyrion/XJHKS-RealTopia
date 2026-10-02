import { useNavigate } from "react-router-dom";
import { moodProfiles } from "../../data/appData";
import type { MoodPhase, MoodSnapshot } from "../../models";
import { Icon } from "../ui/Icon";

interface MoodDialogProps {
  open: boolean;
  phase: MoodPhase;
  mood: MoodSnapshot;
  error: string;
  onStart: () => void;
  onCancel: () => void;
  onFinishListening: () => void;
  onClose: () => void;
}

export function MoodDialog({
  open,
  phase,
  mood,
  error,
  onStart,
  onCancel,
  onFinishListening,
  onClose,
}: MoodDialogProps) {
  const navigate = useNavigate();
  if (!open) return null;
  const profile = moodProfiles[mood.mood];

  return (
    <div className="mood-dialog-backdrop">
      <section
        className="mood-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mood-dialog-title"
      >
        <header>
          <div>
            <small>心情记录</small>
            <h2 id="mood-dialog-title">让世界回应此刻</h2>
          </div>
          <button id="close-mood" aria-label="关闭心情记录" onClick={onClose}>
            <Icon name="X" />
          </button>
        </header>
        {phase === "listening" ? (
          <div className="mood-listening">
            <Icon name="Mic" />
            <div className="mood-wave">
              {Array.from({ length: 9 }, (_, index) => (
                <i key={index} />
              ))}
            </div>
            <h3>正在听你说</h3>
            <p>自然地说说此刻的感受，说完后点击完成。</p>
            <div className="buttons">
              <button id="cancel-mood-listen" onClick={onCancel}>
                取消
              </button>
              <button
                className="primary"
                id="finish-mood-listen"
                onClick={onFinishListening}
              >
                说完了
              </button>
            </div>
          </div>
        ) : phase === "analyzing" ? (
          <div className="mood-analyzing">
            <span />
            <h3>正在理解这份心情</h3>
            <p>云端只会返回心情类别、强度和一句温和回应。</p>
          </div>
        ) : phase === "result" ? (
          <div className="mood-result">
            <span className="mood-result-icon">
              <Icon name={mood.mood === "sad" ? "CloudRain" : "Heart"} />
            </span>
            <small>
              {profile.weather} · 强度 {mood.intensity}
            </small>
            <h3>{profile.label}</h3>
            <p>{mood.summary}</p>
            <blockquote>{mood.support}</blockquote>
            <button className="primary" id="finish-mood" onClick={onClose}>
              看看变化
            </button>
          </div>
        ) : phase === "error" ? (
          <div className="mood-error">
            <span>
              <Icon name="CircleAlert" />
            </span>
            <h3>这次没有分析成功</h3>
            <p>{error}</p>
            <div className="buttons">
              <button
                id="open-cloud-settings"
                onClick={() => {
                  onClose();
                  navigate("/settings/intelligence");
                }}
              >
                检查云端配置
              </button>
              <button
                className="primary"
                id="start-mood-listen"
                onClick={onStart}
              >
                重新录入
              </button>
            </div>
          </div>
        ) : (
          <div className="mood-intro">
            <span className="mood-orb">
              <Icon name="Heart" />
            </span>
            <small>当前天气 · {profile.weather}</small>
            <h3>{mood.summary}</h3>
            <p>{mood.support}</p>
            <button
              className="primary"
              id="start-mood-listen"
              onClick={onStart}
            >
              <Icon name="Mic" />
              按下后说话
            </button>
            <p className="mood-privacy">
              <Icon name="ShieldCheck" />
              录音由本机 Qwen3-ASR 转写后删除，只有转写文字会发送给云端 LLM。
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
