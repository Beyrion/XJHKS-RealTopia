import { localModelRepositories } from "../../data/appData";
import type { ModelDownloadStatus } from "../../models";
import { Icon } from "../ui/Icon";

function formatBytes(value: number) {
  if (value <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index < 2 ? 0 : 2)} ${units[index]}`;
}

function statusLabel(status: ModelDownloadStatus | null) {
  if (!status) return "检测中";
  return (
    (
      {
        ready: "已安装",
        checking: "检查中",
        downloading: "下载中",
        queued: "已排队",
        waiting_network: "等待联网",
        error: "下载失败",
        mobile_only: "仅手机端",
      } as Record<string, string>
    )[status.state] ?? status.state
  );
}

export function ModelRepositoryList({
  status,
  onDownload,
  onOpen,
}: {
  status: ModelDownloadStatus | null;
  onDownload: () => void;
  onOpen: (modelId: string) => void;
}) {
  return (
    <>
      {localModelRepositories.map((model) => {
        const automatic = model.install === "auto";
        const progress =
          automatic && status?.total_bytes
            ? Math.min(
                100,
                Math.round(
                  (status.downloaded_bytes / status.total_bytes) * 100,
                ),
              )
            : 0;
        const detail = automatic
          ? `${statusLabel(status)} · ${status?.total_bytes ? `${formatBytes(status.downloaded_bytes)} / ${formatBytes(status.total_bytes)}` : "约 1.33 GB · 联网后自动下载"}`
          : "按需下载 · 不占用 APK 体积";
        return (
          <div className="model-download" key={model.id}>
            <span
              className={`model-icon ${automatic ? "edge" : "cloud-model"}`}
            >
              <Icon name={automatic ? "AudioLines" : "Download"} />
            </span>
            <span>
              <b>{model.name}</b>
              <small>
                {model.kind} · {detail}
              </small>
              {automatic && status?.total_bytes ? (
                <i className="download-progress">
                  <em style={{ width: `${progress}%` }} />
                </i>
              ) : null}
            </span>
            <div className="model-actions">
              {automatic && !status?.ready && (
                <button id="start-asr-download" onClick={onDownload}>
                  <Icon name="Download" />
                  {status?.state === "error" ? "重试" : "立即下载"}
                </button>
              )}
              <button
                data-model-repo={model.id}
                onClick={() => onOpen(model.id)}
              >
                <Icon name="Link" />
                ModelScope
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
