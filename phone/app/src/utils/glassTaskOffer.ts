import type { PersonChoiceResult, Quest } from "../models";
import { questLifecycle } from "./questEvidence";

export interface GlassTaskOffer {
  questId: string;
  revision: number;
  contextId: string;
  personId: string;
}

export function isOfferableQuest(quest: Quest, now = Date.now()) {
  return (
    questLifecycle(quest) === "candidate" &&
    quest.source === "glasses" &&
    (!quest.candidateExpiresAt || Date.parse(quest.candidateExpiresAt) > now)
  );
}

export function createGlassTaskOffer(
  quest: Quest,
  session: string,
): GlassTaskOffer {
  const revision = quest.revision ?? 1;
  return {
    questId: quest.id,
    revision,
    personId: quest.personId ?? "__task__",
    contextId: `task-offer:${encodeURIComponent(session)}:${encodeURIComponent(quest.id)}:${revision}`,
  };
}

/** A late/replayed Bluetooth choice must never mutate a different revision/task. */
export function taskOfferDecision(
  choice: PersonChoiceResult,
  offer: GlassTaskOffer | null,
  quest: Quest | undefined,
  now = Date.now(),
): "accepted" | "cancelled" | null {
  if (
    !offer ||
    !quest ||
    choice.kind !== "task_offer" ||
    choice.context_id !== offer.contextId ||
    choice.person_id !== offer.personId ||
    quest.id !== offer.questId ||
    (quest.revision ?? 1) !== offer.revision ||
    !isOfferableQuest(quest, now)
  )
    return null;
  if (choice.choice_id === "accept" && choice.choice_index === 0)
    return "accepted";
  if (choice.choice_id === "reject" && choice.choice_index === 1)
    return "cancelled";
  return null;
}
