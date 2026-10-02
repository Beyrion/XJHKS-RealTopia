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
        not_installed: "未安装",
        mobile_only: "仅手机端",
      } as Record<string, string>
    )[status.state] ?? status.state
  );
}

export function ModelRepositoryList({
  statuses,
  onDownload,
  onOpen,
}: {
  statuses: ModelDownloadStatus[];
  onDownload: (modelId: string) => void;
  onOpen: (modelId: string) => void;
}) {
  return (
    <>
      {localModelRepositories.map((model) => {
        const automatic = model.install === "auto";
        const downloadable = model.install !== "manual";
        const status =
          statuses.find((item) => item.model_id === model.id) ?? null;
        const progress =
          downloadable && status?.total_bytes
            ? Math.min(
                100,
                Math.round(
                  (status.downloaded_bytes / status.total_bytes) * 100,
                ),
              )
            : 0;
        const expected = model.id.includes("VL-4B")
          ? "约 2.96 GB"
          : model.id.includes("VL-2B")
            ? "约 1.47 GB"
            : "约 1.33 GB";
        const detail = downloadable
          ? `${statusLabel(status)} · ${status?.total_bytes ? `${formatBytes(status.downloaded_bytes)} / ${formatBytes(status.total_bytes)}` : `${expected} · ${automatic ? "联网后自动下载" : "按需下载"}`}`
          : "仓库入口 · 尚未接入推理";
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
              {downloadable && status?.total_bytes ? (
                <i className="download-progress">
                  <em style={{ width: `${progress}%` }} />
                </i>
              ) : null}
            </span>
            <div className="model-actions">
              {downloadable && !status?.ready && (
                <button
                  id={automatic ? "start-asr-download" : undefined}
                  data-model-download={model.id}
                  onClick={() => onDownload(model.id)}
                  disabled={
                    status?.state === "checking" ||
                    status?.state === "downloading" ||
                    status?.state === "queued"
                  }
                >
                  <Icon name="Download" />
                  {status?.state === "error"
                    ? "重试"
                    : status?.state === "downloading" ||
                        status?.state === "queued"
                      ? "下载中"
                      : "安装"}
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
