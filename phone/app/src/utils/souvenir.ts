import type {
  Person,
  Quest,
  Souvenir,
  SouvenirModelKind,
  TopiaLandmark,
  TopiaLocation,
  TopiaObjectConfig,
  TopiaPrefab,
  TopiaWorldConfig,
} from "../models";
import { inferQuestCategory } from "./gameRules";

const categorySouvenirs = {
  creative: ["微光齿轮", "⚙️"],
  relationship: ["回声风铃", "🎐"],
  health: ["晨光护符", "☀️"],
  home: ["新芽徽章", "🌱"],
  outdoor: ["云路罗盘", "🧭"],
  general: ["约定星片", "✦"],
} as const;

export function souvenirForQuest(quest: Quest, person?: Person): Souvenir {
  const text = `${quest.title} ${quest.body} ${quest.steps.join(" ")}`;
  const category = quest.category ?? inferQuestCategory(quest);
  const [fallbackName, fallbackEmoji] = categorySouvenirs[category];
  const [name, emoji] = /照片|合照|相册|影像/.test(text)
    ? (["同框书签", "🖼️"] as const)
    : /书|阅读|归还/.test(text)
      ? (["书页星标", "🔖"] as const)
      : [fallbackName, fallbackEmoji];
  return {
    id: `souvenir-${quest.id}`,
    questId: quest.id,
    personId: quest.assignerPersonId ?? quest.personId,
    name,
    emoji,
    description: person
      ? `因为履行了与 ${person.name} 的约定，这段经历凝结成了纪念品。`
      : `完成「${quest.title}」后，这段经历凝结成了纪念品。`,
    acquiredAt: new Date().toISOString(),
    presentation: {
      modelKind: /照片|合照|相册|影像/.test(text)
        ? "dream-camera"
        : /书|阅读|归还/.test(text)
          ? "winged-book"
          : category === "creative"
            ? "clockwork-bird"
            : category === "relationship"
              ? "constellation-badge"
              : category === "health"
                ? "firefly-bottle"
                : category === "home"
                  ? "sprout-lantern"
                  : category === "outdoor"
                    ? "star-compass"
                    : "moon-rabbit-doll",
    },
  };
}

export interface TopiaSouvenirPlacement {
  souvenir: Souvenir;
  location: TopiaLocation;
  landmark: TopiaLandmark;
}

const locations: TopiaLocation[] = ["exterior", "interior", "garden"];

const placementSlots: Record<
  TopiaLocation,
  Array<{
    position: [number, number, number];
    fallback: { left: string; top: string };
  }>
> = {
  exterior: [
    { position: [-1.75, 1.15, 1.18], fallback: { left: "34%", top: "55%" } },
    { position: [1.65, 1.2, 1.02], fallback: { left: "66%", top: "54%" } },
    { position: [0.08, 1.68, -0.62], fallback: { left: "52%", top: "36%" } },
    { position: [-2.45, 1.42, -0.36], fallback: { left: "27%", top: "42%" } },
  ],
  interior: [
    { position: [-1.68, 0.92, 0.92], fallback: { left: "35%", top: "56%" } },
    { position: [1.62, 0.94, 0.82], fallback: { left: "66%", top: "55%" } },
    { position: [-0.2, 1.28, -0.72], fallback: { left: "49%", top: "39%" } },
    { position: [2.2, 1.16, -0.5], fallback: { left: "73%", top: "43%" } },
  ],
  garden: [
    { position: [-1.82, 0.9, 1.0], fallback: { left: "34%", top: "57%" } },
    { position: [1.78, 0.92, 0.88], fallback: { left: "67%", top: "56%" } },
    { position: [0.12, 1.25, -0.72], fallback: { left: "52%", top: "39%" } },
    { position: [-2.48, 1.08, -0.38], fallback: { left: "27%", top: "46%" } },
  ],
};

function stableHash(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function souvenirPrefab(souvenir: Souvenir): TopiaPrefab {
  if (souvenir.emoji === "🎐") return "wind-chimes";
  if (souvenir.emoji === "☀️") return "lantern";
  if (souvenir.emoji === "🌱") return "plant";
  if (souvenir.emoji === "🧭") return "observatory";
  if (souvenir.emoji === "⚙️") return "propeller";
  return "crystal";
}

function souvenirModelKind(souvenir: Souvenir): SouvenirModelKind {
  if (souvenir.presentation?.modelKind) return souvenir.presentation.modelKind;
  const text = `${souvenir.name} ${souvenir.description}`;
  if (/照片|合照|相册|影像|留影/.test(text)) return "dream-camera";
  if (/书|阅读|书页/.test(text)) return "winged-book";
  if (/风铃|约定|徽章/.test(text)) return "constellation-badge";
  if (/罗盘|旅途|云路/.test(text)) return "star-compass";
  if (/芽|花园|家园/.test(text)) return "sprout-lantern";
  if (/齿轮|机械|创造/.test(text)) return "clockwork-bird";
  if (/光|星|护符/.test(text)) return "firefly-bottle";
  return "moon-rabbit-doll";
}

function findExistingPlacement(world: TopiaWorldConfig, souvenir: Souvenir) {
  for (const location of locations) {
    const scene = world.scenes[location];
    for (let index = 0; index < scene.landmarks.length; index += 1) {
      const landmark = scene.landmarks[index];
      if (!landmark.taskIds.includes(souvenir.questId)) continue;
      const object = scene.objects.find(
        (candidate) => candidate.anchorId === landmark.anchorId,
      );
      if (!object || object.prefab === "crop-plot") continue;
      return {
        location,
        landmarkIndex: index,
        objectIndex: scene.objects.indexOf(object),
        landmark,
      };
    }
  }
  return null;
}

function decorateLandmark(
  landmark: TopiaLandmark,
  souvenir: Souvenir,
): TopiaLandmark {
  return {
    ...landmark,
    emoji: souvenir.emoji,
    label: souvenir.name,
    eyebrow: "共同记忆纪念品",
    description: souvenir.description,
    taskIds: landmark.taskIds.includes(souvenir.questId)
      ? landmark.taskIds
      : [...landmark.taskIds, souvenir.questId],
    personIds:
      souvenir.personId && !landmark.personIds.includes(souvenir.personId)
        ? [...landmark.personIds, souvenir.personId]
        : landmark.personIds,
  };
}

/**
 * Attaches the user's local souvenir collection as a portable presentation
 * layer. Generated souvenir anchors are reused; a deterministic local anchor
 * fills the gap until the next world iteration incorporates the memory.
 */
export function attachSouvenirsToTopia(
  world: TopiaWorldConfig,
  souvenirs: Souvenir[],
): { world: TopiaWorldConfig; placements: TopiaSouvenirPlacement[] } {
  if (!souvenirs.length) return { world, placements: [] };

  const scenes = {
    exterior: {
      ...world.scenes.exterior,
      objects: [...world.scenes.exterior.objects],
      landmarks: [...world.scenes.exterior.landmarks],
    },
    interior: {
      ...world.scenes.interior,
      objects: [...world.scenes.interior.objects],
      landmarks: [...world.scenes.interior.landmarks],
    },
    garden: {
      ...world.scenes.garden,
      objects: [...world.scenes.garden.objects],
      landmarks: [...world.scenes.garden.landmarks],
    },
  };
  const composedWorld = { ...world, scenes };
  const placements: TopiaSouvenirPlacement[] = [];
  const occupiedLocations: Record<TopiaLocation, number> = {
    exterior: 0,
    interior: 0,
    garden: 0,
  };

  for (const [souvenirIndex, souvenir] of souvenirs.slice(0, 24).entries()) {
    const existing = findExistingPlacement(composedWorld, souvenir);
    if (existing) {
      const landmark = decorateLandmark(existing.landmark, souvenir);
      scenes[existing.location].landmarks[existing.landmarkIndex] = landmark;
      const currentObject =
        scenes[existing.location].objects[existing.objectIndex];
      const scale = souvenir.presentation?.scale ?? 0.78;
      scenes[existing.location].objects[existing.objectIndex] = {
        ...currentObject,
        layer: "souvenir",
        scale: [scale, scale, scale],
        params: {
          ...currentObject.params,
          souvenirKind: souvenirModelKind(souvenir),
        },
        animation: "sparkle",
      };
      placements.push({ souvenir, location: existing.location, landmark });
      continue;
    }

    const location =
      souvenir.presentation?.preferredLocation ??
      locations[souvenirIndex % locations.length];
    const slotIndex =
      occupiedLocations[location] % placementSlots[location].length;
    occupiedLocations[location] += 1;
    const slot = placementSlots[location][slotIndex];
    const hash = stableHash(souvenir.id);
    const token = hash.toString(36);
    const anchorId = `portable-souvenir-anchor-${token}`;
    const memoryId = `complete-${souvenir.questId}`;
    const object: TopiaObjectConfig = {
      id: `portable-souvenir-${token}`,
      prefab: souvenirPrefab(souvenir),
      layer: "souvenir",
      position: slot.position,
      scale: [
        souvenir.presentation?.scale ?? 0.78,
        souvenir.presentation?.scale ?? 0.78,
        souvenir.presentation?.scale ?? 0.78,
      ],
      colors: [
        0xffc857 ^ (hash & 0x1f1f1f),
        0x89d9d0 ^ ((hash >>> 3) & 0x0f0f0f),
        0xff8fad ^ ((hash >>> 7) & 0x0f0f0f),
      ],
      params: { souvenirKind: souvenirModelKind(souvenir) },
      anchorId,
      taskId: souvenir.questId,
      memoryIds: [memoryId],
      animation: "sparkle",
    };
    const landmark: TopiaLandmark = {
      id: `portable-souvenir-landmark-${token}`,
      anchorId,
      location,
      emoji: souvenir.emoji,
      label: souvenir.name,
      eyebrow: "共同记忆纪念品",
      description: souvenir.description,
      fallbackPlacement: slot.fallback,
      memoryIds: [memoryId],
      taskIds: [souvenir.questId],
      personIds: souvenir.personId ? [souvenir.personId] : [],
    };
    scenes[location].objects.push(object);
    scenes[location].landmarks.push(landmark);
    placements.push({ souvenir, location, landmark });
  }

  return { world: composedWorld, placements };
}
