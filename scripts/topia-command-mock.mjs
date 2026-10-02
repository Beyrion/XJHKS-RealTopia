import { readFile } from "node:fs/promises";
import path from "node:path";

export async function installTopiaCommandMock(
  page,
  projectRoot,
  worldOverride,
) {
  const mockWorld =
    worldOverride ??
    JSON.parse(
      await readFile(
        path.join(projectRoot, "phone/app/src-tauri/src/topia/mock_world.json"),
        "utf8",
      ),
    );
  await page.addInitScript((bundledWorld) => {
    const storageKey = "realtopia.topiaWorld.v1";
    const studioKey = "realtopia.topiaStudio.v2";
    const copy = (value) => JSON.parse(JSON.stringify(value));
    const hasUserData = () =>
      Object.keys(localStorage).some(
        (key) =>
          key.startsWith("realtopia.") &&
          key !== storageKey &&
          key !== studioKey,
      );
    const hadUserDataAtBoot = hasUserData();
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
      const existingStudio = localStorage.getItem(studioKey);
      const studio = existingStudio
        ? JSON.parse(existingStudio)
        : {
            activeWorldId: world.id,
            worlds: [
              {
                id: world.id,
                homeName: world.profile.homeName,
                archetype: world.profile.archetype,
                generatedAt: world.generatedAt,
                active: true,
                source: world.source,
              },
            ],
            assets: {
              objects: { exterior: [], interior: [], garden: [] },
              landmarks: { exterior: [], interior: [], garden: [] },
              memories: [],
            },
            needsOnboarding: !hadUserDataAtBoot,
          };
      return { world, crops, studio };
    };
    const invoke = (command, args = {}) => {
      if (command === "plugin:event|listen") return Promise.resolve(1);
      if (command === "plugin:event|unlisten") return Promise.resolve();
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
      if (command === "delete_user_data") {
        localStorage.removeItem(storageKey);
        localStorage.removeItem(studioKey);
        return Promise.resolve();
      }
      if (command === "generate_topia_world")
        return new Promise((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  "cloud generation is unavailable in browser UI tests",
                ),
              ),
            600,
          ),
        );
      if (command === "iterate_topia_world")
        return Promise.reject(
          new Error("cloud iteration is unavailable in browser UI tests"),
        );
      if (command === "maintain_topia_world") return Promise.resolve(null);
      if (command === "complete_topia_onboarding") {
        const saved = localStorage.getItem(storageKey);
        const payload = resolvePayload(
          saved ? JSON.parse(saved) : bundledWorld,
          args.context,
        );
        payload.studio.needsOnboarding = false;
        localStorage.setItem(studioKey, JSON.stringify(payload.studio));
        return Promise.resolve(payload);
      }
      if (command === "save_topia_thumbnail") {
        const existingStudio = localStorage.getItem(studioKey);
        const studio = existingStudio ? JSON.parse(existingStudio) : null;
        if (studio) {
          studio.worlds = studio.worlds.map((world) =>
            world.id === args.worldId
              ? { ...world, thumbnail: args.thumbnail }
              : world,
          );
          localStorage.setItem(studioKey, JSON.stringify(studio));
        }
        return Promise.resolve();
      }
      if (command === "switch_topia_world") {
        const saved = localStorage.getItem(storageKey);
        return Promise.resolve(
          resolvePayload(
            saved ? JSON.parse(saved) : bundledWorld,
            args.context,
          ),
        );
      }
      if (command === "delete_topia_world") {
        const saved = localStorage.getItem(storageKey);
        const payload = resolvePayload(
          saved ? JSON.parse(saved) : bundledWorld,
          args.context,
        );
        if (!payload.studio.worlds.some((world) => world.id === args.worldId))
          return Promise.reject(new Error("Topia 不存在"));
        if (payload.studio.worlds.length === 1)
          return Promise.reject(new Error("至少需要保留一个 Topia"));
        payload.studio.worlds = payload.studio.worlds.filter(
          (world) => world.id !== args.worldId,
        );
        if (payload.studio.activeWorldId === args.worldId) {
          const next = [...payload.studio.worlds].sort(
            (a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt),
          )[0];
          payload.studio.activeWorldId = next.id;
          payload.world.id = next.id;
          payload.world.profile.homeName = next.homeName;
          localStorage.setItem(storageKey, JSON.stringify(payload.world));
        }
        payload.studio.worlds = payload.studio.worlds.map((world) => ({
          ...world,
          active: world.id === payload.studio.activeWorldId,
        }));
        localStorage.setItem(studioKey, JSON.stringify(payload.studio));
        return Promise.resolve(payload);
      }
      return Promise.reject(new Error(`unmocked command: ${command}`));
    };
    const callbacks = new Map();
    const transformCallback = (callback, once = false) => {
      const identifier = window.crypto.getRandomValues(new Uint32Array(1))[0];
      callbacks.set(identifier, (data) => {
        if (once) callbacks.delete(identifier);
        return callback?.(data);
      });
      return identifier;
    };
    window.__TAURI_INTERNALS__ = {
      ...(window.__TAURI_INTERNALS__ ?? {}),
      invoke,
      transformCallback,
      unregisterCallback: (identifier) => callbacks.delete(identifier),
      runCallback: (identifier, data) => callbacks.get(identifier)?.(data),
      callbacks,
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: (_, identifier) => callbacks.delete(identifier),
    };
  }, mockWorld);
}
