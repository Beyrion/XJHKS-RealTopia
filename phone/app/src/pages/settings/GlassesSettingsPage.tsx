import { Icon } from "../../components/ui/Icon";
import { SettingCard } from "../../components/ui/SettingCard";
import { Toggle } from "../../components/ui/Toggle";
import { CapturedPhotoDebug } from "../../components/settings/CapturedPhotoDebug";
import { SpeechRecognitionDebug } from "../../components/settings/SpeechRecognitionDebug";
import type { GlassSettings } from "../../models";
import { nativeService } from "../../services/native";
import { useAppStore } from "../../store/AppStore";
import { sensingTaskSummaryText } from "../../utils/sensingTaskSummary";

export default function GlassesSettingsPage() {
  const {
    session,
    perception,
    glassSettings,
    updateGlassSettings,
    updatePerception,
    connectGlasses,
    notify,
    sceneObservationEnabled,
    sceneObservationStatus,
    updateSceneObservationEnabled,
    runSceneObservation,
    sensingAudio,
    lastSensingTranscript,
    sensingTaskSummary,
    retrySensingTasks,
    asrDownload,
    people,
    confirmedSpeakerId,
    confirmSpeaker,
    consecutiveSpeakers,
    setConsecutiveSpeakers,
    voiceBindings,
    bindVoiceSpeaker,
    sensingSpeechDebug,
  } = useAppStore();
  const ready = session.phase === "ready";
  const active = ready || session.phase === "capturing";
  const recovering = session.phase === "p2p_negotiating";

  const syncPerception = async (enabled: boolean, settings = glassSettings) => {
    await nativeService.setPerception(
      enabled,
      settings.framesPerSecond,
      settings.width,
      settings.quality,
    );
  };

  const changePerception = (enabled: boolean) => {
    updatePerception(enabled);
    notify(`主动感知已${enabled ? "开启 · 拍照与语音同步" : "关闭"}`);
  };

  const syncCaptureParameters = async (settings: GlassSettings) => {
    if (!perception) return;
    try {
      await syncPerception(true, settings);
      notify("拍摄参数已同步到眼镜");
    } catch {
      notify("参数已保存，将在下次连接时同步");
    }
  };

  const patchSettings = (patch: Partial<GlassSettings>) => {
    const next = { ...glassSettings, ...patch };
    updateGlassSettings(next);
    return next;
  };

  return (
    <div className="setting-view">
      <div className="setting-head">
        <h1>眼镜</h1>
      </div>
      <SettingCard title="眼镜连接">
        <div className="device">
          <span className="device-icon">
            <Icon name="Glasses" />
          </span>
          <span>
            <b>
              {active
                ? "已连接 · RealTopia Glass"
                : recovering
                  ? "正在自动恢复 · RealTopia Glass"
                  : "等待连接 · RealTopia Glass"}
            </b>
            <small>
              {active || recovering ? session.transport : "蓝牙控制与直连传输"}
            </small>
          </span>
          <em>{active ? "在线" : recovering ? "恢复中" : "离线"}</em>
        </div>
        <div className="buttons">
          <button id="choose" onClick={() => void connectGlasses()}>
            <Icon name="Glasses" />
            选择眼镜
          </button>
          <button
            id="bt"
            onClick={() =>
              void nativeService
                .openBluetoothSettings()
                .catch(() => notify("请打开系统蓝牙设置"))
            }
          >
            <Icon name="Bluetooth" />
            蓝牙设置
          </button>
        </div>
        {!active && session.detail && (
          <p
            className="setting-note"
            id="glasses-connection-detail"
            role="status"
          >
            {session.detail}
          </p>
        )}
      </SettingCard>
      <SettingCard title="感知与拍摄">
        <Toggle
          label="主动感知模式"
          id="perception"
          checked={perception}
          onChange={(enabled) => void changePerception(enabled)}
        />
        <p className="setting-note" id="active-capture-note">
          默认关闭。眼镜按钮或此开关同时控制拍照和语音：开启时立即拍第一张，之后每10秒拍一张识别人脸，手机麦克风持续监听并自动分句转写，眼镜显示只读
          memory 社交提示，不需要选择回复。
          关闭后立即停止拍照和监听，等待剩余转写完成，再由已配置的云端大模型结合本轮对话与相关
          memory
          生成1至3项任务。没有明确委托时，也会根据话题创作具体的后续行动；可在眼镜上逐个接受／拒绝。不使用固定任务模板，生成失败可重试。完全没有清晰转写时不生成任务。仍可手动拍摄。
          蓝牙交换控制指令，照片仅通过 Wi-Fi Direct 传输；直连未就绪时暂停拍摄。
        </p>
        <p className="setting-note" id="sensing-audio-status" role="status">
          {!perception
            ? sensingAudio.processing
              ? "麦克风已关闭 · 正在完成本轮剩余转写"
              : sensingTaskSummaryText(sensingTaskSummary)
            : sensingAudio.last_error
              ? `语音感知异常：${sensingAudio.last_error}`
              : !active
                ? "语音感知等待眼镜连接"
                : sensingAudio.active
                  ? `${sensingAudio.processing ? "正在转写/分析，麦克风继续监听" : "手机麦克风正在监听，自动判断说完"} · 已分句 ${sensingAudio.completed_segments} · 待处理 ${sensingAudio.queued_segments}${sensingAudio.dropped_segments ? ` · 缓冲已满丢弃 ${sensingAudio.dropped_segments} 段` : ""}${sensingAudio.vad_recoveries ? ` · VAD状态重置 ${sensingAudio.vad_recoveries} 次` : ""}${!asrDownload?.ready ? " · ASR模型尚未就绪" : ""}`
                  : "语音感知正在启动…"}
        </p>
        {!perception && sensingTaskSummary?.phase === "error" && (
          <div className="buttons">
            <button id="retry-sensing-tasks" onClick={retrySensingTasks}>
              重新生成本轮任务
            </button>
          </div>
        )}
        {lastSensingTranscript && (
          <p className="setting-note" id="sensing-last-transcript">
            最近转写：{lastSensingTranscript}
          </p>
        )}
      </SettingCard>
      <CapturedPhotoDebug />
      <SettingCard title="轮流讲话 · 说话人区分">
        <Toggle
          id="consecutive-speakers"
          label="区分轮流讲话者（本地 MNN 模型）"
          checked={consecutiveSpeakers}
          onChange={(enabled) => {
            if (perception) {
              notify("请先关闭主动感知，再切换说话人模式");
              return;
            }
            setConsecutiveSpeakers(enabled);
          }}
        />
        <p className="setting-note">
          CAM++声纹特征与Pyannote分段均使用本地MNN推理，匹配阈值0.45，每个模型4线程。
          仅用于轮流讲话，不拆分同时讲话的音轨。
          开启后先说一段至少约1秒的完整话，待转写完成，再把声音标签绑定为你或对应人物。
          绑定只作用于后续语音，不追溯写入之前未确认的记忆；每次重新开始感知都需重新绑定。
          不保存长期声纹，不自动依据人脸绑定声音。
        </p>
        {consecutiveSpeakers &&
          [
            ...new Set([
              ...sensingSpeechDebug
                .filter((row) => row.sessionId === sensingAudio.session_id)
                .map((row) => row.speaker?.id)
                .filter((id): id is string => !!id),
              ...Object.keys(voiceBindings),
            ]),
          ]
            .sort()
            .map((id) => (
              <label key={id} className="setting-note" data-voice-binding={id}>
                说话人 {String.fromCharCode(64 + Number(id.split("-")[1]))} ·{" "}
                {id}{" "}
                <select
                  aria-label={`确认${id}身份`}
                  value={voiceBindings[id] ?? ""}
                  disabled={!sensingAudio.active}
                  onChange={(e) => bindVoiceSpeaker(id, e.target.value)}
                >
                  <option value="">
                    未确认，不写人物记忆；结束后仍可提取匿名任务
                  </option>
                  <option value="player">我（眼镜佩戴者）</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.role}
                    </option>
                  ))}
                </select>
              </label>
            ))}
      </SettingCard>
      <SettingCard title="确认对话者">
        <p className="setting-note">
          {consecutiveSpeakers
            ? "轮流讲话模式已开启，请使用上方声音标签确认身份；此下拉框不用于该模式的语音归属。"
            : ""}
          人脸只表示有人在场，不能证明谁在讲话。确认后语音记忆才归属此人；人物变化或断开会清除确认。
        </p>
        <select
          id="confirmed-speaker"
          aria-label="确认对话者"
          value={confirmedSpeakerId ?? ""}
          disabled={consecutiveSpeakers}
          onChange={(e) => confirmSpeaker(e.target.value || null)}
        >
          <option value="">未确认 / 用户自己的语音</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name} · {person.role}
            </option>
          ))}
        </select>
      </SettingCard>
      <SpeechRecognitionDebug />
      <SettingCard title="场景观察与任务联动">
        <Toggle
          label="每分钟场景观察"
          id="scene-observation"
          checked={sceneObservationEnabled}
          onChange={updateSceneObservationEnabled}
        />
        <p className="setting-note" id="scene-observation-status">
          {sceneObservationStatus.running
            ? "正在复制最新照片、人物检测并运行 Qwen3-VL-2B…"
            : !perception
              ? "自动场景观察已暂停，请开启主动感知模式；仍可点击立即观察。"
              : sceneObservationStatus.lastError
                ? `等待重试 · ${sceneObservationStatus.lastError}`
                : sceneObservationStatus.lastSummary
                  ? `最近观察：${sceneObservationStatus.lastSummary}${sceneObservationStatus.lastLatencyMs ? ` · ${(sceneObservationStatus.lastLatencyMs / 1_000).toFixed(1)} 秒` : ""}`
                  : "复用最新间隔照片在手机端理解活动，不额外自动拍照；连续证据可推进当前任务，但不会自动完成。"}
        </p>
        <div className="buttons">
          <button
            id="scene-observe-now"
            disabled={!ready || sceneObservationStatus.running}
            onClick={() => void runSceneObservation(true)}
          >
            <Icon name="Telescope" />
            {sceneObservationStatus.running ? "观察中" : "立即观察"}
          </button>
        </div>
      </SettingCard>
      <SettingCard title="图像参数">
        <label className="range">
          <span>图片质量</span>
          <input
            id="capture-quality"
            type="range"
            min="50"
            max="100"
            value={glassSettings.quality}
            onChange={(event) =>
              patchSettings({ quality: Number(event.target.value) })
            }
            onPointerUp={() => void syncCaptureParameters(glassSettings)}
            onBlur={() => void syncCaptureParameters(glassSettings)}
          />
          <b id="capture-quality-label">{glassSettings.quality}</b>
        </label>
        <label className="select">
          <span>拍摄分辨率</span>
          <select
            id="capture-width"
            value={glassSettings.width}
            onChange={(event) => {
              const next = patchSettings({ width: Number(event.target.value) });
              void syncCaptureParameters(next);
            }}
          >
            <option value="4032">4032 × 3024</option>
            <option value="2560">2560 长边</option>
            <option value="1920">1920 长边</option>
            <option value="1280">1280 长边</option>
          </select>
        </label>
        <label className="select">
          <span>人物出现提醒</span>
          <select
            id="person-alert"
            value={glassSettings.personAlert}
            onChange={(event) => {
              const personAlert = event.target
                .value as GlassSettings["personAlert"];
              patchSettings({ personAlert });
              void nativeService
                .setPersonAlert(personAlert === "poster")
                .then(() => notify("人物提醒方式已同步"))
                .catch(() => notify("提醒方式已保存，将在下次连接时同步"));
            }}
          >
            <option value="poster">定格海报与轻提示</option>
            <option value="quiet">仅眼镜静默显示</option>
          </select>
        </label>
      </SettingCard>
    </div>
  );
}
