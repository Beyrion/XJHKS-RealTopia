import { type CSSProperties, useEffect, useRef } from "react";
import type { MoodSnapshot } from "../../models";

interface TopiaSceneProps {
  mood: MoodSnapshot;
  stage: number;
  children: React.ReactNode;
}

export function TopiaScene({ mood, stage, children }: TopiaSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    void import("../../utils/topiaScene").then(({ mountTopiaScene }) => {
      if (!cancelled && canvas.isConnected) {
        dispose = mountTopiaScene(canvas, mood.mood, mood.intensity);
      }
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [mood.intensity, mood.mood, stage]);

  return (
    <section
      className={`world stage-${stage} mood-${mood.mood}`}
      style={{ "--mood-intensity": mood.intensity / 100 } as CSSProperties}
    >
      <canvas
        ref={canvasRef}
        id="topia-canvas"
        aria-label="云上漂流屋三维场景"
      />
      {children}
    </section>
  );
}
