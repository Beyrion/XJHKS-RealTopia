import type { IconName } from "../../components/ui/Icon";
import { Icon } from "../../components/ui/Icon";
import { SettingCard } from "../../components/ui/SettingCard";
import { nativeService } from "../../services/native";
import { storage } from "../../services/storage";
import { useAppStore } from "../../store/AppStore";

const tests: { id: string; icon: IconName; title: string; detail: string }[] = [
  { id: "cold", icon: "Camera", title: "冷启动拍摄", detail: "重启相机并预热" },
  { id: "hot", icon: "ScanFace", title: "热拍摄", detail: "复用相机会话" },
  {
    id: "bench",
    icon: "FlaskConical",
    title: "自动端到端基准",
    detail: "1 次冷拍与 5 次热拍",
  },
  {
    id: "audio",
    icon: "AudioLines",
    title: "对话录音",
    detail: "长按眼镜物理按钮",
  },
];

export default function TestingSettingsPage() {
  const { session, logs, capture, clearLogs, refreshSession, notify } =
    useAppStore();
  const metric = session.last_capture;
  const recording = session.last_recording;
  const runTest = (id: string) => {
    if (id === "cold" || id === "hot") void capture(id);
    else if (id === "bench")
      ["cold", "hot", "hot", "hot", "hot", "hot"].forEach((mode, index) =>
        window.setTimeout(
          () => void capture(mode as "cold" | "hot"),
          index * 1_000,
        ),
      );
    else notify("请长按眼镜物理按钮开始录音");
  };
  const deleteUserData = async () => {
    if (!confirm("删除本机任务、人物、记忆、心情、Topia 和人脸数据，并恢复首次打开状态？"))
      return;
    try {
      await nativeService.clearCloudApiKey().catch(() => undefined);
      await nativeService.deleteUserData();
      storage.clearUserData();
      window.location.hash = "/topia";
      window.location.reload();
    } catch (error) {
      notify(
        `删除失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  return (
    <div className="setting-view">
      <div className="setting-head">
        <h1>测试</h1>
      </div>
      <SettingCard title="快捷测试">
        <div className="tests">
          {tests.map((test) => (
            <button
              key={test.id}
              data-test={test.id}
              onClick={() => runTest(test.id)}
            >
              <span>
                <Icon name={test.icon} />
              </span>
              <b>{test.title}</b>
              <small>{test.detail}</small>
            </button>
          ))}
        </div>
      </SettingCard>
      <SettingCard title="最近一次端到端测试">
        <div className="latency">
          <span>
            <b>{metric?.e2e_ms ?? "—"}</b>
            <small>毫秒</small>
          </span>
          {[
            ["打开", metric?.camera_open_ms],
            ["预热", metric?.warmup_ms],
            ["拍摄", metric?.capture_ms],
            ["传输", metric?.transfer_ms],
          ].map(([label, value], index) => (
            <i key={label}>
              <em style={{ height: `${25 + index * 14}%` }} />
              <small>
                {label}
                <br />
                {value ?? "—"}
              </small>
            </i>
          ))}
        </div>
      </SettingCard>
      <SettingCard title="最近一段对话">
        <div className="recording-state">
          <span className="recording-icon">
            <Icon name="AudioLines" />
          </span>
          <span>
            <b>
              {recording
                ? `${Math.round(recording.bytes / 1_024)} KB · ${recording.sample_rate / 1_000} kHz ${recording.encoding}`
                : "长按眼镜按钮开始，松开发送"}
            </b>
            <small>
              {recording
                ? `直连传输 ${recording.transfer_ms} 毫秒 · ${session.recording_processing}`
                : "录音保存在手机并进入处理队列"}
            </small>
          </span>
        </div>
      </SettingCard>
      <SettingCard title="运行日志">
        <div className="terminal">
          {logs.map((log, index) => (
            <p key={`${log}-${index}`}>
              <time>
                {new Date(Date.now() - index * 30_000).toLocaleTimeString(
                  "zh-CN",
                )}
              </time>
              {log}
            </p>
          ))}
        </div>
        <div className="buttons right">
          <button id="clear" onClick={clearLogs}>
            清空
          </button>
          <button
            className="primary"
            id="refresh"
            onClick={() => void refreshSession()}
          >
            <Icon name="RefreshCw" />
            刷新状态
          </button>
        </div>
      </SettingCard>
      <SettingCard title="用户数据">
        <div className="buttons">
          <button className="danger" id="delete-user-data" onClick={() => void deleteUserData()}>
            <Icon name="Trash2" />
            删除用户数据
          </button>
        </div>
      </SettingCard>
    </div>
  );
}
