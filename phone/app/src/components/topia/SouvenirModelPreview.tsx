import { useEffect, useRef } from "react";
import type { TopiaObjectConfig } from "../../models";

export function SouvenirModelPreview({
  name,
  object,
}: {
  name: string;
  object: TopiaObjectConfig;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    void import("../../utils/topiaScene").then(({ mountSouvenirPreview }) => {
      if (!cancelled && canvas.isConnected)
        dispose = mountSouvenirPreview(canvas, object);
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [object]);

  return (
    <section className="souvenir-model-preview" aria-label={`${name}模型近景`}>
      <canvas
        ref={canvasRef}
        aria-label={`${name}三维模型，可拖动旋转并捏合缩放`}
      />
      <small>拖动旋转 · 捏合缩放</small>
    </section>
  );
}
