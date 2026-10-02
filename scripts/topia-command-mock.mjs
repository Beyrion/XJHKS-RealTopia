import { readFile } from "node:fs/promises";
import path from "node:path";

export async function installTopiaCommandMock(page, projectRoot) {
  const mockWorld = JSON.parse(
    await readFile(
      path.join(projectRoot, "phone/app/src-tauri/src/topia/mock_world.json"),
      "utf8",
    ),
  );
  await page.addInitScript((bundledWorld) => {
    const storageKey = "realtopia.topiaWorld.v1";
    const copy = (value) => JSON.parse(JSON.stringify(value));
    const resolvePayload = (inputWorld, context = {}) => {
      const world = copy(inputWorld);
      const quests = new Map(
        (context.quests ?? []).map((quest) => [quest.id, quest]),
      );
      const crops = world.scenes.garden.objects.flatMap((object) => {
        if (object.prefab !== "crop-plot" || !object.taskId) return [];
        const quest = quests.get(object.taskId);
        if (!quest) return [];
        const crop = [
          "sunflower",
          "tomato",
          "lavender",
          "pumpkin",
          "herb",
        ].includes(object.params?.crop)
          ? object.params.crop
          : "herb";
        return [
          {
            id: quest.id,
            title: quest.title,
            progress: quest.progress,
            crop,
            personId: quest.personId,
          },
        ];
      });
      for (const landmark of world.scenes.garden.landmarks) {
        const quest = landmark.taskIds
          .map((id) => quests.get(id))
          .find(Boolean);
        if (!quest) continue;
        landmark.label = quest.title;
        landmark.eyebrow = `任务作物 · 生长 ${quest.progress}%`;
        landmark.description =
          quest.progress >= 100
            ? "任务已经完成，作物成熟并结出了可以收获的果实。"
            : `这株作物会随着「${quest.title}」的推进继续生长。下一次任务进展会直接反映在枝叶与果实上。`;
        for (const memory of context.memories ?? []) {
          if (
            memory.taskIds?.includes(quest.id) &&
            !landmark.memoryIds.includes(memory.id)
          )
            landmark.memoryIds.push(memory.id);
        }
      }
      return { world, crops };
    };
    const invoke = (command, args = {}) => {
      if (command === "load_topia_world") {
        const saved = localStorage.getItem(storageKey);
        return Promise.resolve(
          resolvePayload(
            saved ? JSON.parse(saved) : bundledWorld,
            args.context,
          ),
        );
      }
      if (command === "save_topia_world") {
        localStorage.setItem(storageKey, JSON.stringify(args.world));
        return Promise.resolve(resolvePayload(args.world, args.context));
      }
      if (command === "reset_topia_world") {
        localStorage.removeItem(storageKey);
        return Promise.resolve(resolvePayload(bundledWorld, args.context));
      }
      if (command === "generate_topia_world")
        return Promise.reject(
          new Error("cloud generation is unavailable in browser UI tests"),
        );
      return Promise.reject(new Error(`unmocked command: ${command}`));
    };
    window.__TAURI_INTERNALS__ = {
      ...(window.__TAURI_INTERNALS__ ?? {}),
      invoke,
    };
  }, mockWorld);
}
