import type {
  Person,
  Quest,
  Souvenir,
  SouvenirModelKind,
  TopiaLandmark,
  TopiaLocation,
  TopiaObjectConfig,
  TopiaPrefab,
  TopiaSceneConfig,
  TopiaVector3,
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
  if (quest.id === "seed-weekly-cooking") {
    return {
      id: `souvenir-${quest.id}`,
      questId: quest.id,
      personId: quest.assignerPersonId ?? quest.personId,
      name: "冒火平底锅雕塑",
      emoji: "🔥",
      description:
        "本周料理远征的锅气凝成了一座正冒着大火的平底锅雕塑，纪念你与老陈完成的厨房协作。",
      acquiredAt: new Date().toISOString(),
      presentation: {
        modelKind: "flaming-pan-sculpture",
        preferredLocation: "interior",
        scale: 0.96,
      },
    };
  }
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
  if (/平底锅|锅气|料理|厨房/.test(text)) return "flaming-pan-sculpture";
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
      // A task relation on a desk/bed does not turn that furniture into a trophy.
      if (
        !object ||
        object.layer !== "souvenir" ||
        object.prefab === "crop-plot"
      )
        continue;
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

function availablePlacement(
  scene: TopiaSceneConfig,
  location: TopiaLocation,
  scale: number,
  currentObject?: TopiaObjectConfig,
  maxRows = 3,
) {
  const yaw = scene.camera.yaw;
  const pitch =
    location === "interior"
      ? scene.camera.pitch
      : Math.min(scene.camera.pitch, 0.42);
  const project = (position: TopiaVector3, objectScale: number) => {
    const [x, y, z] = position;
    const depth = x * Math.sin(yaw) + z * Math.cos(yaw);
    return [
      x * Math.cos(yaw) - z * Math.sin(yaw),
      (y + 0.54 * objectScale) * Math.cos(pitch) - depth * Math.sin(pitch),
    ];
  };
  const occupied = scene.objects
    .filter((object) => object.layer === "souvenir" && object !== currentObject)
    .map((object) => ({
      position: object.position,
      scale: Math.max(...(object.scale ?? [1, 1, 1])),
    }));
  if (location === "interior" && occupied.length >= 3) return null;
  const isFree = (position: TopiaVector3) => {
    return occupied.every((other) => {
      const clearance = 0.7 * (scale + other.scale) + 0.2;
      return (
        Math.hypot(
          position[0] - other.position[0],
          position[2] - other.position[2],
        ) >= clearance
      );
    });
  };
  const slotFor = (position: TopiaVector3) => {
    const [x, y] = project(position, scale);
    return {
      position,
      fallback: {
        left: `${Math.max(8, Math.min(92, 50 + x * 10))}%`,
        top: `${Math.max(8, Math.min(92, 60 - y * 10))}%`,
      },
    };
  };
  if (currentObject && isFree(currentObject.position))
    return slotFor(currentObject.position);
  if (location === "interior") {
    const cabinet = scene.objects.find(
      (o) => o.params?.detailKind === "display-cabinet",
    );
    if (!cabinet) return null;
    const angle = cabinet.rotation?.[1] ?? 0;
    for (const offset of [-0.75, 0, 0.75]) {
      const p: TopiaVector3 = [
        cabinet.position[0] + offset * Math.cos(angle),
        cabinet.position[1] + 0.8,
        cabinet.position[2] - offset * Math.sin(angle),
      ];
      if (isFree(p)) return slotFor(p);
    }
    return null;
  }
  const freeSlot = placementSlots[location].find((slot) =>
    isFree(slot.position),
  );
  if (freeSlot)
    return slotFor([freeSlot.position[0], 0.2, freeSlot.position[2]]);

  // Expand on the floor, never upward into camera-facing shelves in mid-air.
  // The mesh-space pass subsequently resolves the actual surface and footprint.
  const spacing = Math.max(
    1.5,
    1.4 * Math.max(scale, ...occupied.map((item) => item.scale)) + 0.3,
  );
  for (let row = 0; row < maxRows; row += 1) {
    for (let column = -2; column <= 2; column += 1) {
      const x = column * spacing;
      const position: TopiaVector3 = [
        x,
        0.2,
        (row === 0 ? 0 : Math.ceil(row / 2) * (row % 2 ? -1 : 1)) * spacing,
      ];
      if (isFree(position)) return slotFor(position);
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
  // Curate the presentation, never the saved collection: preserve overflow IDs
  // and relations, but show them outdoors instead of carpeting the living room.
  const interior = scenes.interior;
  let cabinet = interior.objects.find(
    (o) => o.params?.detailKind === "display-cabinet",
  );
  if (!cabinet) {
    const shellScale = interior.objects.find((o) => o.prefab === "room-shell")
      ?.scale ?? [1, 1, 1];
    cabinet = {
      id: "room-display-cabinet",
      prefab: "shelf",
      layer: "structure",
      position: [-2.5 * shellScale[0], 0.2, -0.85 * shellScale[2]],
      rotation: [0, Math.PI / 2, 0],
      colors: world.profile.accentColors,
      params: { detailKind: "display-cabinet", roomFunction: "display" },
    };
    interior.objects.push(cabinet);
  }
  let exhibitCount = 0,
    overflowCount = 0;
  for (const original of [...interior.objects]) {
    const souvenir = original.layer === "souvenir";
    const outdoorAccent =
      original.layer === "decoration" &&
      ["observatory", "sky-window", "cloud", "path"].includes(original.prefab);
    if (!outdoorAccent && (!souvenir || exhibitCount < 3)) {
      if (souvenir) {
        const offset = [-0.75, 0, 0.75][exhibitCount++];
        const angle = cabinet.rotation?.[1] ?? 0;
        interior.objects[interior.objects.indexOf(original)] = {
          ...original,
          position: [
            cabinet.position[0] + offset * Math.cos(angle),
            cabinet.position[1] + 0.8,
            cabinet.position[2] - offset * Math.sin(angle),
          ],
          scale: [0.36, 0.36, 0.36],
          params: { ...original.params, displayNiche: true },
        };
      }
      continue;
    }
    interior.objects.splice(interior.objects.indexOf(original), 1);
    const angle = overflowCount++ * 2.399963;
    if (!scenes.exterior.objects.some((o) => o.id === original.id))
      scenes.exterior.objects.push({
        ...original,
        position: [Math.cos(angle) * 3.6, 0.2, Math.sin(angle) * 2.6],
        params: { ...original.params, displayNiche: false },
      });
    const moving = interior.landmarks.filter(
      (l) => l.anchorId === original.anchorId,
    );
    interior.landmarks = interior.landmarks.filter(
      (l) => l.anchorId !== original.anchorId,
    );
    for (const landmark of moving)
      if (
        !scenes.exterior.landmarks.some((l) => l.anchorId === landmark.anchorId)
      )
        scenes.exterior.landmarks.push({ ...landmark, location: "exterior" });
  }
  const placements: TopiaSouvenirPlacement[] = [];
  const claimedAnchors = new Set<string>();
  const collection = souvenirs.slice(0, 24).map((souvenir, souvenirIndex) => {
    const match = findExistingPlacement(composedWorld, souvenir);
    const existing =
      match && !claimedAnchors.has(match.landmark.anchorId) ? match : null;
    if (existing) claimedAnchors.add(existing.landmark.anchorId);
    return { souvenir, souvenirIndex, existing };
  });
  // Reserve generated anchors first, including ones that collide with each other.
  collection.sort(
    (a, b) => Number(Boolean(b.existing)) - Number(Boolean(a.existing)),
  );
  for (const { souvenir, souvenirIndex, existing } of collection) {
    const requestedScale = souvenir.presentation?.scale ?? 0.78;
    let scale =
      existing?.location === "interior"
        ? Math.min(requestedScale, 0.36)
        : requestedScale;
    if (existing) {
      const currentObject =
        scenes[existing.location].objects[existing.objectIndex];
      const slot = availablePlacement(
        scenes[existing.location],
        existing.location,
        scale,
        currentObject,
        Infinity,
      )!;
      const landmark = {
        ...decorateLandmark(existing.landmark, souvenir),
        fallbackPlacement: slot.fallback,
      };
      scenes[existing.location].landmarks[existing.landmarkIndex] = landmark;
      scenes[existing.location].objects[existing.objectIndex] = {
        ...currentObject,
        layer: "souvenir",
        position: slot.position,
        scale: [scale, scale, scale],
        colors: souvenir.presentation?.colors ?? currentObject.colors,
        params: {
          ...currentObject.params,
          souvenirKind: souvenirModelKind(souvenir),
          souvenirMaterial: souvenir.presentation?.material ?? "porcelain",
          souvenirOrnaments: souvenir.presentation?.ornaments?.join(",") ?? "",
          displayNiche: existing.location === "interior",
        },
        animation: "sparkle",
      };
      placements.push({ souvenir, location: existing.location, landmark });
      continue;
    }

    let location =
      souvenir.presentation?.preferredLocation ??
      locations[souvenirIndex % locations.length];
    if (location === "interior") scale = Math.min(requestedScale, 0.36);
    let slot = availablePlacement(scenes[location], location, scale);
    // A full display spills into another scene before extending beyond the view.
    if (!slot) {
      for (const alternative of locations.filter((item) => item !== location)) {
        const candidateScale =
          alternative === "interior"
            ? Math.min(requestedScale, 0.36)
            : requestedScale;
        slot = availablePlacement(
          scenes[alternative],
          alternative,
          candidateScale,
        );
        if (slot) {
          location = alternative;
          scale = candidateScale;
          break;
        }
      }
    }
    if (!slot && location === "interior") {
      location = "exterior";
      scale = requestedScale;
    }
    slot ??= availablePlacement(
      scenes[location],
      location,
      scale,
      undefined,
      Infinity,
    )!;
    const hash = stableHash(souvenir.id);
    const token = hash.toString(36);
    const anchorId = `portable-souvenir-anchor-${token}`;
    const memoryId = `complete-${souvenir.questId}`;
    const object: TopiaObjectConfig = {
      id: `portable-souvenir-${token}`,
      prefab: souvenirPrefab(souvenir),
      layer: "souvenir",
      position: slot.position,
      scale: [scale, scale, scale],
      colors: souvenir.presentation?.colors ?? [
        0xffc857 ^ (hash & 0x1f1f1f),
        0x89d9d0 ^ ((hash >>> 3) & 0x0f0f0f),
        0xff8fad ^ ((hash >>> 7) & 0x0f0f0f),
      ],
      params: {
        souvenirKind: souvenirModelKind(souvenir),
        souvenirMaterial: souvenir.presentation?.material ?? "porcelain",
        souvenirOrnaments: souvenir.presentation?.ornaments?.join(",") ?? "",
        displayNiche: location === "interior",
      },
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
