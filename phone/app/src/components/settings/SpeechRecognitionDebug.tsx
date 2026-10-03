import { useState } from "react";
import { SettingCard } from "../ui/SettingCard";
import { Toggle } from "../ui/Toggle";
import { useAppStore } from "../../store/AppStore";
import type { SensingSpeechDebug } from "../../models";

const phases: Record<string, string> = {
  idle: "未监听",
  listening: "等待说话",
  speech: "检测到说话",
  waiting_endpoint: "等待句尾静音",
  turn_check: "正在判断是否说完",
  waiting_continuation: "语句未完整，等待继续",
  recovery: "VAD状态已重置",
  error: "监听异常",
};
const statuses: Record<SensingSpeechDebug["status"], string> = {
  transcribing: "正在本地转写",
  analyzing: "转写完成，正在分析",
  complete: "识别完成",
  response: "已识别自动回应",
  empty: "未识别到清晰语音",
  error: "处理失败",
  cancelled: "感知已关闭，结果未采用",
};
const reasons: Record<string, string> = {
  semantic_complete: "语义完整",
  neural_silence: "句尾静音",
  max_duration: "达到分段时长上限",
};
const turns: Record<string, string> = {
  complete: "完整",
  incomplete: "未完整",
  invalid: "无效语音",
};
const ms = (value: number | undefined) =>
  Number.isFinite(value) ? `${Math.round(value!)} ms` : "—";

export function SpeechRecognitionDebug() {
  const {
    perception,
    session,
    sensingAudio: audio,
    asrDownload,
    sensingSpeechDebug: history,
    clearSensingSpeechDebug,
  } = useAppStore();
  const [enabled, setEnabled] = useState(
    () => localStorage.getItem("realtopia.speechDebug") === "on",
  );
  const connected = session.phase === "ready" || session.phase === "capturing";
  const level =
    audio.active && Number.isFinite(audio.audio_level)
      ? Math.max(0, Math.min(1, audio.audio_level!))
      : 0;
  const db = Math.max(-90, 20 * Math.log10(Math.max(level, 0.0000316228)));
  const meter = audio.active ? Math.max(0, (db + 60) / 60) : 0;
  const probability = Number.isFinite(audio.vad_probability)
    ? Math.max(0, Math.min(1, audio.vad_probability!))
    : null;
  const sampleAge = audio.last_sample_at_ms
    ? Math.max(0, Date.now() - audio.last_sample_at_ms)
    : null;
  const phase = !perception
    ? "感知已关闭"
    : audio.last_error
      ? "监听异常"
      : !connected
        ? "等待眼镜连接"
        : !audio.active
          ? audio.model_preparation?.loading
            ? "正在预加载感知模型"
            : "麦克风正在启动"
          : (phases[audio.listening_phase ?? "listening"] ?? "正在监听");
  return (
    <SettingCard title="语音识别调试 · Debug">
      <Toggle
        id="speech-debug"
        label="显示语音识别调试"
        checked={enabled}
        onChange={(next) => {
          localStorage.setItem("realtopia.speechDebug", next ? "on" : "off");
          setEnabled(next);
        }}
      />
      <p className="setting-note">
        仅显示现有感知链路，不启动录音。音源是手机麦克风；与拍照一起由主动感知开关控制。分句完成后才转写，不是逐字实时字幕。
      </p>
      {enabled && (
        <div id="speech-debug-panel">
          <div className="speech-debug-summary">
            <b id="speech-debug-phase" role="status">
              {phase}
            </b>
            <span id="speech-debug-model">
              本地 Qwen3-ASR ·{" "}
              {asrDownload?.ready ? "模型已就绪" : "模型未就绪，分句暂不转写"}
            </span>
            <span>手机麦克风 · 16 kHz · 单声道 PCM16</span>
            <div id="sensing-model-preparation">
              {audio.model_preparation?.loading && (
                <p role="status">
                  {audio.active
                    ? "正在预加载新增模型，麦克风继续采集…"
                    : "正在预加载感知模型，完成后开始监听…"}
                </p>
              )}
              {audio.model_preparation?.models.map((model) => (
                <p
                  key={model.model_id}
                  data-model={model.model_id}
                  data-loaded={model.loaded}
                  data-reused={model.reused}
                >
                  {model.model_id} ·{" "}
                  {model.loaded
                    ? model.reused
                      ? "复用常驻模型"
                      : `已预加载 ${ms(model.load_ms)}`
                    : "预加载失败"}
                  {model.error && (
                    <span className="speech-debug-error"> · {model.error}</span>
                  )}
                </p>
              ))}
              {audio.model_preparation?.last_error && (
                <p className="speech-debug-error" role="alert">
                  {audio.model_preparation.last_error}
                </p>
              )}
            </div>
            {audio.active && (
              <span>
                VAD人声概率{" "}
                {probability === null
                  ? "—"
                  : `${Math.round(probability * 100)}%`}{" "}
                · {phases[audio.listening_phase ?? "listening"] ?? "正在监听"} ·
                VAD耗时 {ms(audio.vad_latency_ms)}
              </span>
            )}
            <label className="speech-debug-level">
              输入音量
              <meter
                id="speech-debug-level"
                min="0"
                max="1"
                value={meter}
                aria-label="手机麦克风输入音量"
              />
              <span>{audio.active ? `${db.toFixed(1)} dBFS` : "未采集"}</span>
            </label>
            <span>
              已分句 {audio.completed_segments} · 待处理 {audio.queued_segments}{" "}
              · 丢弃 {audio.dropped_segments} · VAD恢复{" "}
              {audio.vad_recoveries ?? 0}
            </span>
            <span id="speech-debug-processing">
              {audio.processing
                ? audio.active
                  ? "正在转写或分析；麦克风继续采集"
                  : "采集已停止，等待在途处理结束"
                : "ASR处理空闲"}
              {audio.active && sampleAge !== null
                ? ` · 最近音频采样 ${sampleAge < 1500 ? "正常更新" : `${(sampleAge / 1000).toFixed(1)}秒前`}`
                : ""}
            </span>
            {audio.last_turn_label && (
              <span>
                最近句尾判断：
                {turns[audio.last_turn_label] ?? audio.last_turn_label}
              </span>
            )}
            {(audio.last_error || asrDownload?.last_error) && (
              <p className="speech-debug-error" role="alert">
                {audio.last_error || asrDownload?.last_error}
              </p>
            )}
          </div>
          <h4>
            最近分句与转写 <span>最多20条 · 仅保留在内存</span>
          </h4>
          {!history.length && (
            <p className="setting-note" id="speech-debug-empty">
              还没有语音识别记录。开启主动感知后，对着手机说一句话并稍作停顿；如果没有分句，请先看输入音量和VAD人声概率。
            </p>
          )}
          <ol className="speech-debug-history" id="speech-debug-history">
            {history.map((item) => (
              <li
                key={item.recordingId}
                data-recording-id={item.recordingId}
                data-status={item.status}
              >
                <div className="speech-debug-row-head">
                  <b>
                    #{item.sequence} ·{" "}
                    {new Date(item.startedAt).toLocaleTimeString("zh-CN", {
                      hour12: false,
                    })}
                  </b>
                  <span>{statuses[item.status]}</span>
                </div>
                <p className="speech-debug-transcript">
                  {item.transcript ||
                    (item.status === "transcribing"
                      ? "正在把这一句语音转成文字…"
                      : item.status === "cancelled"
                        ? "旧会话的结果已忽略。"
                        : item.status === "error"
                          ? "转写未完成，请查看下方错误。"
                          : "没有可显示的转写文本。")}
                </p>
                {item.speaker && (
                  <span
                    className="speech-debug-speaker"
                    data-speaker-id={item.speaker.id ?? "unknown"}
                  >
                    {item.speaker.id
                      ? `说话人 ${String.fromCharCode(64 + Number(item.speaker.id.split("-")[1]))}`
                      : "说话人未确定"}
                    {" · "}
                    {(item.speaker.startMs / 1000).toFixed(2)}–
                    {(item.speaker.endMs / 1000).toFixed(2)}秒（原分句内）
                    {" · "}分段 {Math.round(item.speaker.latencyMs)} ms
                    {" · "}
                    {item.speaker.decision}
                    {item.speaker.similarity != null
                      ? ` · 声纹相似度 ${item.speaker.similarity.toFixed(3)}（非概率）`
                      : ""}
                    {" · "}
                    {item.speakerBinding === "player"
                      ? "你"
                      : !item.speakerBinding ||
                          item.speakerBinding === "unconfirmed"
                        ? "身份未绑定；未写人物记忆；任务在感知结束后生成"
                        : item.speakerBinding}
                    {" · "}原录音 #{item.speaker.sourceRecordingId}
                  </span>
                )}
                <span>
                  音频 {(item.durationMs / 1000).toFixed(2)}秒 ·{" "}
                  {Math.round(item.bytes / 1024)} KB · 分句{" "}
                  {reasons[item.vadReason ?? ""] ?? item.vadReason ?? "—"}
                </span>
                <span>
                  VAD {ms(item.vadLatencyMs)}
                  {item.turnLabel
                    ? ` · TurnSense ${turns[item.turnLabel] ?? item.turnLabel} ${ms(item.turnLatencyMs)}`
                    : ""}
                </span>
                <span>
                  ASR {ms(item.asrLatencyMs)} · RTF{" "}
                  {Number.isFinite(item.realtimeFactor)
                    ? item.realtimeFactor!.toFixed(2)
                    : "—"}{" "}
                  · 首次加载 {ms(item.modelLoadMs)} ·{" "}
                  {item.modelReused === true
                    ? "复用常驻模型"
                    : item.modelReused === false
                      ? `本次加载 ${ms(item.loadThisCallMs)}`
                      : "本次加载信息未提供"}
                </span>
                {item.error && (
                  <p className="speech-debug-error" role="alert">
                    {item.error}
                  </p>
                )}
              </li>
            ))}
          </ol>
          <p className="setting-note">
            音量不是识别置信度；VAD概率只用于判断人声。RTF小于1表示转写速度快于该段音频时长。不新增录音留存或上传；主流程原有的对话保存和云端分析设置不变。
          </p>
          <div className="buttons">
            <button
              id="speech-debug-clear"
              disabled={!history.length}
              onClick={clearSensingSpeechDebug}
            >
              清空调试记录
            </button>
          </div>
        </div>
      )}
    </SettingCard>
  );
}
