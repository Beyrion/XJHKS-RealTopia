import type {
  Quest,
  TopiaObjectConfig,
  TopiaWorldConfig,
  TopiaPrefab,
  TopiaLocation,
} from "../models";
import { isFormalQuest, questLifecycle } from "./questEvidence";
import { stableKey } from "./taskGate";

// Bounded native prefabs only: no generated script, URI, GLB, or network asset.
export function taskComponent(q: Quest): TopiaObjectConfig {
  const prefabs: Record<string, TopiaPrefab> = {
    造梦者: "observatory",
    匠造者: "desk",
    创造者: "tower",
    讲述者: "lantern",
  };
  const hash = parseInt(stableKey(q.id), 36),
    progress = Math.max(0, Math.min(100, q.progress));
  return {
    id: `task-component:${q.id}`,
    taskId: q.id,
    anchorId: `task-anchor:${q.id}`,
    prefab: prefabs[q.characterClass ?? ""] ?? "crystal",
    layer: "decoration",
    position: [((hash % 7) - 3) * 1.3, 0, 3 + (Math.floor(hash / 7) % 3)],
    scale: [0.5 + progress / 200, 0.5 + progress / 100, 0.5 + progress / 200],
    colors: [questLifecycle(q) === "completed" ? 0xe8c878 : 0x70a58d],
    params: {
      progress,
      lifecycle: questLifecycle(q),
      revision: q.revision ?? 1,
      source: "deterministic-local-fallback",
    },
  };
}
export function attachTaskComponents(
  input: TopiaWorldConfig,
  quests: Quest[],
): TopiaWorldConfig {
  const world = structuredClone(input),
    tasks = quests.filter(isFormalQuest);
  const valid = new Set(tasks.map((q) => q.id));
  for (const location of [
    "exterior",
    "interior",
    "garden",
  ] as TopiaLocation[]) {
    const scene = world.scenes[location];
    scene.objects = scene.objects.filter(
      (o) =>
        !o.id.startsWith("task-component:") &&
        (!o.taskId || valid.has(o.taskId)),
    );
    scene.landmarks = scene.landmarks.filter(
      (l) =>
        !l.id.startsWith("task-landmark:") &&
        (!l.taskIds.length || l.taskIds.some((id) => valid.has(id))),
    );
  }
  for (const q of tasks) {
    const component = taskComponent(q),
      location: TopiaLocation =
        q.characterClass === "匠造者" ? "interior" : "exterior";
    world.scenes[location].objects.push(component);
    world.scenes[location].landmarks.push({
      id: `task-landmark:${q.id}`,
      anchorId: component.anchorId!,
      location,
      emoji: "✦",
      label: q.displayTitle ?? q.title,
      eyebrow: `已验证 ${q.progress}%`,
      description: `${q.realTitle ?? q.title} · ${questLifecycle(q)} · 本地白名单组件（非云端生成）`,
      fallbackPlacement: {
        left: `${20 + (parseInt(stableKey(q.id), 36) % 65)}%`,
        top: "65%",
      },
      taskIds: [q.id],
      personIds: q.participantIds ?? [],
      memoryIds: [],
    });
  }
  return world;
}
