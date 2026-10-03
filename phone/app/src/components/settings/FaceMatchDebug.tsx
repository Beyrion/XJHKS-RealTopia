import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { FaceMatch, FaceResult, Person } from "../../models";

export function describeFaceMatch(match: FaceMatch, people: Person[]) {
  const person = people.find((item) => item.id === match.person_id);
  if (match.decision === "known" && person)
    return {
      kind: "known",
      label: `已匹配：${person.name}`,
      short: person.name,
      detail: `${person.role} · 角色 ID：${person.id}`,
    };
  if (match.decision === "known")
    return {
      kind: "warning",
      label: "匹配记录没有对应的角色",
      short: "角色缺失",
      detail: match.person_id
        ? `角色 ID：${match.person_id} · 请检查人物库`
        : "识别结果缺少角色 ID",
    };
  if (match.decision === "ambiguous")
    return {
      kind: "warning",
      label: "结果不确定，未确认角色",
      short: "待确认",
      detail: "候选角色太相似，不将其视为已匹配",
    };
  if (match.decision === "too_small")
    return {
      kind: "skipped",
      label: "人脸太小，未进行身份识别",
      short: "人脸太小",
      detail: "请让人脸更靠近眼镜后再拍摄",
    };
  if (match.decision === "embedding_failed")
    return {
      kind: "warning",
      label: "人脸特征提取失败",
      short: "识别失败",
      detail: "已检测到人脸，但无法比对人物库",
    };
  if (match.decision === "unknown")
    return {
      kind: "unknown",
      label: "未匹配到人物库角色",
      short: "未匹配",
      detail: "可能尚未录入人脸，或相似度/模板支持不足",
    };
  return {
    kind: "warning",
    label: "暂无法确认角色",
    short: "待确认",
    detail: `识别状态：${match.decision}`,
  };
}

export function faceBoxStyle(
  face: FaceResult,
  match: FaceMatch,
): CSSProperties | null {
  const width = face.image_width ?? 0;
  const height = face.image_height ?? 0;
  const bbox = match.bbox;
  // Native boxes are in the already-rotated inference image coordinate space.
  if (
    width <= 0 ||
    height <= 0 ||
    !bbox ||
    ![width, height, ...bbox].every(Number.isFinite)
  )
    return null;
  const left = Math.max(0, Math.min(width, bbox[0]));
  const top = Math.max(0, Math.min(height, bbox[1]));
  const right = Math.max(0, Math.min(width, bbox[2]));
  const bottom = Math.max(0, Math.min(height, bbox[3]));
  if (right <= left || bottom <= top) return null;
  return {
    left: `${(left / width) * 100}%`,
    top: `${(top / height) * 100}%`,
    width: `${((right - left) / width) * 100}%`,
    height: `${((bottom - top) / height) * 100}%`,
  };
}

export function FaceMatchDebug({
  face,
  people,
}: {
  face: FaceResult;
  people: Person[];
}) {
  return (
    <section
      className="capture-face-results"
      aria-label="本张照片的人脸角色匹配"
      data-request-id={face.request_id}
    >
      <h4>人物库匹配 · 照片 #{face.request_id}</h4>
      {face.gallery_size === 0 && (
        <p className="setting-note">
          人脸库为空。人物列表有角色不代表已录入人脸，请到「人物」为对应角色录入照片。
        </p>
      )}
      {face.gallery_size !== undefined && face.gallery_size > 0 && (
        <p className="setting-note">
          本地人脸库：{face.gallery_size} 份模板 ·
          相似度是比对分数，不是正确率。
        </p>
      )}
      {face.detected_count === 0 ? (
        <p className="setting-note">本张照片未检测到人脸。</p>
      ) : face.matches.length === 0 ? (
        <p className="setting-note">检测到了人脸，暂未返回逐脸匹配结果。</p>
      ) : (
        <ol className="capture-face-list">
          {face.matches.map((match, index) => {
            const result = describeFaceMatch(match, people);
            const hasScore =
              Number.isFinite(match.score) &&
              match.score > -1 &&
              face.gallery_size !== 0;
            return (
              <li
                key={index}
                data-face-index={index + 1}
                data-match-kind={result.kind}
              >
                <b>
                  人脸 {index + 1} · {result.label}
                </b>
                <span>{result.detail}</span>
                {hasScore && (
                  <span>
                    相似度 {match.score.toFixed(3)}
                    {match.second_score !== undefined &&
                    match.second_score > -1 &&
                    match.margin !== undefined &&
                    Number.isFinite(match.margin)
                      ? ` · 候选差值 ${match.margin.toFixed(3)}`
                      : ""}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <Link className="capture-face-library-link" to="/people">
        查看人物库 / 录入人脸
      </Link>
    </section>
  );
}
