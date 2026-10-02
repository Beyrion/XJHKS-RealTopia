import { type CSSProperties, useEffect, useRef } from "react";
import type {
  MoodSnapshot,
  TopiaLocation,
  QuestCategory,
  TopiaSceneCrop,
  TopiaWorldConfig,
} from "../../models";

interface TopiaSceneProps {
  mood: MoodSnapshot;
  stage: number;
  location: TopiaLocation;
  crops: TopiaSceneCrop[];
  world: TopiaWorldConfig;
  focusCategory?: QuestCategory;
  children: React.ReactNode;
}

export function TopiaScene({
  mood,
  stage,
  location,
  crops,
  world,
  focusCategory,
  children,
}: TopiaSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    void import("../../utils/topiaScene").then(({ mountTopiaScene }) => {
      if (!cancelled && canvas.isConnected) {
        dispose = mountTopiaScene(canvas, mood.mood, mood.intensity, {
          location,
          crops,
          scene: world.scenes[location],
        });
      }
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [crops, location, mood.intensity, mood.mood, stage, world]);

  return (
    <section
      className={`world location-${location} stage-${stage} mood-${mood.mood} focus-${focusCategory ?? "general"}`}
      data-topia-scene={location}
      data-topia-world={world.id}
      data-topia-world-source={world.source}
      data-topia-object-count={world.scenes[location].objects.length}
      data-focus-category={focusCategory ?? "general"}
      style={{ "--mood-intensity": mood.intensity / 100 } as CSSProperties}
    >
      <canvas
        ref={canvasRef}
        id="topia-canvas"
        aria-label={`${location === "exterior" ? "屋外" : location === "interior" ? "房间内" : "菜地"}三维场景`}
      />
      {children}
    </section>
  );
}
