import type { CSSProperties } from "react";
import type { Souvenir, TopiaObjectConfig } from "../../models";
import { SouvenirModelPreview } from "./SouvenirModelPreview";

function previewObject(souvenir: Souvenir): TopiaObjectConfig {
  const mnn = souvenir.presentation?.modelKind === "mnn-engine-core";
  const flamingPan =
    souvenir.presentation?.modelKind === "flaming-pan-sculpture";
  return {
    id: `unlock-preview-${souvenir.id}`,
    prefab: "crystal",
    layer: "souvenir",
    position: [0, 0, 0],
    colors:
      souvenir.presentation?.colors ??
      (mnn
        ? [0xe83828, 0xffbc32, 0xfff0b0]
        : flamingPan
          ? [0x292a32, 0xff5a2f, 0xffcf45]
          : [0xff8f75, 0x75d9d0, 0xffd968]),
    params: {
      souvenirKind: souvenir.presentation?.modelKind ?? "moon-rabbit-doll",
      souvenirMaterial: souvenir.presentation?.material ?? "porcelain",
      souvenirOrnaments: souvenir.presentation?.ornaments?.join(",") ?? "",
    },
    animation: "sparkle",
  };
}

export function SouvenirUnlockDialog({
  souvenir,
  onCollect,
}: {
  souvenir: Souvenir;
  onCollect: () => void;
}) {
  const mnn = souvenir.presentation?.modelKind === "mnn-engine-core";
  const level = souvenir.presentation?.level;
  const object = previewObject(souvenir);
  return (
    <div className="souvenir-unlock-backdrop">
      <section
        className={`souvenir-unlock ${mnn ? "is-mnn" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="souvenir-unlock-title"
        data-souvenir-kind={souvenir.presentation?.modelKind}
        data-souvenir-level={level}
      >
        <div className="souvenir-reveal-stage">
          <div className="souvenir-reveal-rings" aria-hidden="true" />
          {Array.from({ length: 24 }, (_, index) => (
            <i
              className="souvenir-reveal-particle"
              aria-hidden="true"
              key={index}
              style={
                {
                  "--particle-index": index,
                  "--particle-angle": `${index * 137.5}deg`,
                  "--particle-distance": `${62 + (index % 5) * 18}px`,
                  "--particle-size": `${4 + (index % 3) * 2}px`,
                  "--particle-delay": `${(index % 8) * -0.18}s`,
                } as CSSProperties
              }
            />
          ))}
          <SouvenirModelPreview name={souvenir.name} object={object} />
          <span className="souvenir-reveal-badge">NEW</span>
          {level !== undefined && (
            <span className="souvenir-reveal-level">LEVEL {level}</span>
          )}
        </div>
        <div className="souvenir-reveal-copy">
          <small aria-live="polite">
            {souvenir.designState === "pending"
              ? "正在让这段经历长出独一无二的形状…"
              : "任务完成 · 新的共同记忆"}
          </small>
          <h2 id="souvenir-unlock-title">获得新纪念品</h2>
          <h3>{souvenir.name}</h3>
          <p>{souvenir.description}</p>
          <button type="button" onClick={onCollect}>
            收入我的 Topia
          </button>
        </div>
      </section>
    </div>
  );
}
