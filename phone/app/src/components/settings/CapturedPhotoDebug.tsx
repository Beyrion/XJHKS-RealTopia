import { useEffect, useRef, useState } from "react";
import { SettingCard } from "../ui/SettingCard";
import { Toggle } from "../ui/Toggle";
import { nativeService } from "../../services/native";
import { useAppStore } from "../../store/AppStore";
import {
  describeFaceMatch,
  faceBoxStyle,
  FaceMatchDebug,
} from "./FaceMatchDebug";

const modeLabels = {
  cold: "手动冷拍",
  hot: "手动热拍",
  interval: "自动拍摄",
  stream: "预览帧",
};
const latency = (value: number) => (value >= 0 ? `${value} ms` : "—");

export function CapturedPhotoDebug() {
  const { session, capture, people } = useAppStore();
  const [enabled, setEnabled] = useState(
    () => localStorage.getItem("realtopia.captureDebug") === "on",
  );
  const [loadedPreview, setLoadedPreview] = useState<{
    requestId: number;
    data: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const metric = session.last_capture;
  const requestId = metric && !metric.stream ? metric.request_id : null;
  const preview =
    loadedPreview?.requestId === requestId ? loadedPreview.data : null;
  const face =
    session.last_face?.request_id === requestId ? session.last_face : null;

  useEffect(() => {
    let cancelled = false;
    setLoadedPreview(null);
    setError("");
    dialog.current?.close();
    if (enabled && requestId !== null) {
      void nativeService.capturePreview(requestId).then(
        (image) => {
          if (!cancelled) setLoadedPreview({ requestId, data: image });
        },
        (reason: unknown) => {
          if (!cancelled)
            setError(reason instanceof Error ? reason.message : String(reason));
        },
      );
    }
    return () => {
      cancelled = true;
    };
  }, [enabled, requestId, retry]);

  const rotation = (((metric?.rotation_degrees ?? 0) % 360) + 360) % 360;
  const swapped = rotation === 90 || rotation === 270;
  const sourceRatio =
    metric?.width && metric.height ? metric.width / metric.height : 4 / 3;
  const ratio = swapped ? 1 / sourceRatio : sourceRatio;
  const photo = (large = false) =>
    preview && metric ? (
      <div
        className="capture-debug-frame"
        style={{
          aspectRatio: ratio,
          maxWidth: large
            ? `min(100%, ${70 * ratio}vh)`
            : `${Math.min(560, 320 * ratio)}px`,
        }}
      >
        <img
          src={preview}
          alt={`眼镜拍摄照片 #${requestId}`}
          style={{
            width: swapped ? `${sourceRatio * 100}%` : "100%",
            transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          }}
        />
        {face?.matches.map((match, index) => {
          const style = faceBoxStyle(face, match);
          const result = describeFaceMatch(match, people);
          return style ? (
            <span
              key={index}
              className="capture-face-box"
              data-match-kind={result.kind}
              style={style}
            >
              <span>
                {index + 1} · {result.short}
              </span>
            </span>
          ) : null;
        })}
      </div>
    ) : null;

  return (
    <SettingCard title="照片调试 · Debug">
      <Toggle
        label="显示拍摄照片"
        id="capture-debug"
        checked={enabled}
        onChange={(next) => {
          localStorage.setItem("realtopia.captureDebug", next ? "on" : "off");
          setEnabled(next);
        }}
      />
      <p className="setting-note">
        仅在手机本地显示最新收到的照片，不额外拍摄、不上传。开启主动感知时立即触发首拍，之后每10秒更新；相机启动、传输和识别需要少量时间。也可手动拍摄。
      </p>
      {enabled && (
        <div id="capture-debug-panel">
          {preview ? (
            <button
              className="capture-debug-open"
              id="capture-debug-open"
              aria-label="放大拍摄照片"
              onClick={() => dialog.current?.showModal()}
            >
              {photo()}
            </button>
          ) : (
            <p className="setting-note" role="status">
              {error ||
                (requestId === null
                  ? "还没有收到照片，连接眼镜后开启主动拍摄或点击下方手动拍摄。"
                  : "正在加载照片…")}
            </p>
          )}
          {metric && requestId !== null && (
            <div className="capture-debug-metrics">
              <b>
                #{requestId} · {modeLabels[metric.mode] ?? metric.mode} ·{" "}
                {metric.width} × {metric.height}
              </b>
              <span>
                {Math.round(metric.bytes / 1024)} KB · 拍摄{" "}
                {latency(metric.capture_ms)} · 传输{" "}
                {latency(metric.transfer_ms)}
              </span>
              {metric.e2e_ms >= 0 && (
                <span>端到端 {latency(metric.e2e_ms)}</span>
              )}
              <span>
                {face
                  ? `检测到 ${face.detected_count} 张人脸 · 处理 ${latency(face.processing_total_ms)}`
                  : session.face_error
                    ? `人脸处理失败：${session.face_error}`
                    : "等待本张照片的人脸检测结果…"}
              </span>
            </div>
          )}
          {face && <FaceMatchDebug face={face} people={people} />}
          <div className="buttons">
            <button
              id="debug-capture-cold"
              disabled={session.phase !== "ready"}
              onClick={() => void capture("cold")}
            >
              手动冷拍
            </button>
            <button
              id="debug-capture-hot"
              disabled={session.phase !== "ready"}
              onClick={() => void capture("hot")}
            >
              手动热拍
            </button>
            {error && (
              <button
                id="debug-capture-retry"
                onClick={() => setRetry((value) => value + 1)}
              >
                重新加载
              </button>
            )}
          </div>
          <dialog
            ref={dialog}
            className="capture-debug-dialog"
            aria-label="拍摄照片大图"
            onClick={(event) => {
              if (event.target === event.currentTarget) dialog.current?.close();
            }}
          >
            <button
              className="capture-debug-close"
              onClick={() => dialog.current?.close()}
            >
              关闭大图
            </button>
            {photo(true)}
            {face && <FaceMatchDebug face={face} people={people} />}
          </dialog>
        </div>
      )}
    </SettingCard>
  );
}
