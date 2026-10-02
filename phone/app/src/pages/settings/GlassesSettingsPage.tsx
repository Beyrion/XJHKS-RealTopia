import { Icon } from "../../components/ui/Icon";
import { SettingCard } from "../../components/ui/SettingCard";
import { Toggle } from "../../components/ui/Toggle";
import type { GlassSettings } from "../../models";
import { nativeService } from "../../services/native";
import { useAppStore } from "../../store/AppStore";

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
  } = useAppStore();
  const ready = session.phase === "ready";

  const syncPerception = async (enabled: boolean, settings = glassSettings) => {
    await nativeService.setPerception(
      enabled,
      settings.framesPerSecond,
      settings.width,
      settings.quality,
    );
  };

  const changePerception = async (enabled: boolean) => {
    updatePerception(enabled);
    try {
      await syncPerception(enabled);
      notify(`持续感知已${enabled ? "开启" : "关闭"}`);
    } catch {
      updatePerception(!enabled);
      notify("眼镜尚未连接，设置未更改");
    }
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
              {ready
                ? "已连接 · RealTopia Glass"
                : "等待连接 · RealTopia Glass"}
            </b>
            <small>{ready ? session.transport : "蓝牙控制与直连传输"}</small>
          </span>
          <em>{ready ? "在线" : "离线"}</em>
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
      </SettingCard>
      <SettingCard title="感知与拍摄">
        <Toggle
          label="持续拍摄感知"
          id="perception"
          checked={perception}
          onChange={(enabled) => void changePerception(enabled)}
        />
        <label className="range">
          <span>持续感知帧率</span>
          <input
            id="capture-fps"
            type="range"
            min="2"
            max="5"
            step="1"
            value={glassSettings.framesPerSecond}
            onChange={(event) =>
              patchSettings({ framesPerSecond: Number(event.target.value) })
            }
            onPointerUp={() => void syncCaptureParameters(glassSettings)}
            onBlur={() => void syncCaptureParameters(glassSettings)}
          />
          <b id="capture-fps-label">{glassSettings.framesPerSecond} FPS</b>
        </label>
      </SettingCard>
      <SettingCard title="场景观察与任务联动">
        <Toggle
          label="每分钟场景观察"
          id="scene-observation"
          checked={sceneObservationEnabled}
          onChange={updateSceneObservationEnabled}
        />
        <p className="setting-note" id="scene-observation-status">
          {sceneObservationStatus.running
            ? "正在复制最新持续帧、人物检测并运行 Qwen3-VL-2B…"
            : sceneObservationStatus.lastError
              ? `等待重试 · ${sceneObservationStatus.lastError}`
              : sceneObservationStatus.lastSummary
                ? `最近观察：${sceneObservationStatus.lastSummary}${sceneObservationStatus.lastLatencyMs ? ` · ${(sceneObservationStatus.lastLatencyMs / 1_000).toFixed(1)} 秒` : ""}`
                : "复制最新持续帧后在手机端理解活动；连续证据可推进当前任务，但不会自动完成。"}
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
