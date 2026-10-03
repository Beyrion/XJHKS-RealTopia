import type { Memory, Quest } from "../models";
import type { GlassPeopleSnapshot } from "./glassPeople";
import { retrieveSocialMemories } from "./socialMemory";
import { semanticOverlap } from "./taskGate";

/** Read-only context about a visible person; never assumes that person is speaking. */
export function glassSocialHint(
  view: GlassPeopleSnapshot,
  transcript: string,
  memories: Memory[],
  quests: Quest[],
  activeQuestId?: string | null,
) {
  const empty = {
    active: false,
    sessionId: "",
    requestId: 0,
    name: "",
    reminder: "",
    advice: "",
    usedMemoryIds: [] as string[],
  };
  if (!view.active) return empty;
  const candidates = view.people.flatMap((person) =>
    retrieveSocialMemories(
      memories,
      person.id,
      transcript,
      quests,
      activeQuestId,
    ).map((memory) => ({
      person,
      memory,
      score:
        semanticOverlap(transcript, memory.summary ?? memory.title) +
        (memory.memoryKind === "commitment" ||
        memory.personMemoryKind === "promise"
          ? 3
          : 0),
    })),
  );
  candidates.sort((a, b) => b.score - a.score);
  const match = candidates[0];
  if (!match) return empty;
  const summary = match.memory.summary ?? match.memory.title;
  let advice = "可以先问问这件事最近怎么样，再顺着对方的话继续聊。";
  if (/反馈|试用|没看懂|结算|复测/.test(summary))
    advice = "可以询问这次体验与上次有什么变化，重点确认之前不清楚的地方。";
  else if (
    /约定|答应|承诺/.test(summary) ||
    match.memory.memoryKind === "commitment"
  )
    advice = "可以自然地核对上次约定的进展，再确认接下来怎么安排。";
  else if (/卡点|故障|联调|连接/.test(summary))
    advice = "可以先确认上次的问题是否还存在，再交流最新测试结果。";
  else if (
    match.memory.personMemoryKind === "preference" ||
    match.memory.memoryKind === "preference"
  )
    advice = "交流或提出安排时，可以留意这个偏好，并确认现在是否仍适用。";
  return {
    active: true,
    sessionId: view.sessionId,
    requestId: view.requestId,
    name: match.person.name,
    reminder: Array.from(summary).slice(0, 100).join(""),
    advice,
    usedMemoryIds: [match.memory.id],
  };
}
