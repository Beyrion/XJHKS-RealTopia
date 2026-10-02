import { invoke } from "@tauri-apps/api/core";
import type { Person, Quest, Souvenir, SouvenirModelKind } from "../models";

interface Design {
  name: string;
  description: string;
  emoji: string;
  modelKind: SouvenirModelKind;
  colors: number[];
  ornaments: NonNullable<Souvenir["presentation"]>["ornaments"];
  material: NonNullable<Souvenir["presentation"]>["material"];
  preferredLocation: "exterior" | "interior" | "garden";
}
const pending = new Map<string, Promise<Souvenir>>();
export function refineSouvenir(
  souvenir: Souvenir,
  quest: Quest,
  person: Person | undefined,
  recent: Souvenir[],
) {
  const existing = pending.get(souvenir.id);
  if (existing) return existing;
  const promise = invoke<Design>("design_topia_souvenir", {
    input: {
      title: quest.title,
      body: quest.body.slice(0, 1800),
      steps: quest.steps.slice(0, 6),
      personName: person?.name ?? null,
      recentKinds: recent
        .slice(0, 8)
        .flatMap((s) =>
          s.presentation?.modelKind ? [s.presentation.modelKind] : [],
        ),
    },
  })
    .then((design) => ({
      ...souvenir,
      name: design.name,
      description: design.description,
      emoji: design.emoji,
      designState: "ready" as const,
      presentation: {
        ...souvenir.presentation,
        modelKind: design.modelKind,
        colors: design.colors,
        ornaments: design.ornaments,
        material: design.material,
        preferredLocation: design.preferredLocation,
      },
    }))
    .catch(() => ({ ...souvenir, designState: "fallback" as const }))
    .finally(() => pending.delete(souvenir.id));
  pending.set(souvenir.id, promise);
  return promise;
}
