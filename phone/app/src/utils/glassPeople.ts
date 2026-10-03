import type { FaceResult } from "../models";

export interface GlassPeopleSnapshot {
  active: boolean;
  sessionId: string;
  requestId: number;
  people: Array<{ id: string; name: string; background: string }>;
  unmatchedCount: number;
  omittedCount: number;
}

/** Display only: a face in view does not identify the speaker or write memory. */
export function glassPeopleSnapshot(
  face: FaceResult | null | undefined,
  active: boolean,
  sessionId: string | null,
  roster: Array<{ id: string; name: string; role?: string; story?: string }>,
  blockedRequestId: number | null = null,
): GlassPeopleSnapshot {
  const empty: GlassPeopleSnapshot = {
    active: false,
    sessionId: "",
    requestId: 0,
    people: [],
    unmatchedCount: 0,
    omittedCount: 0,
  };
  if (
    !active ||
    !sessionId ||
    !face ||
    !Number.isSafeInteger(face.request_id) ||
    face.request_id <= 0 ||
    face.request_id === blockedRequestId
  )
    return empty;
  const profiles = new Map(roster.map((person) => [person.id, person]));
  const found = new Map<string, GlassPeopleSnapshot["people"][number]>();
  let matchedFaces = 0;
  for (const match of face.matches) {
    const profile = match.person_id ? profiles.get(match.person_id) : null;
    if (
      match.decision !== "known" ||
      !match.person_id ||
      !profile?.name?.trim()
    )
      continue;
    matchedFaces++;
    const clean = (text: string, max: number) =>
      Array.from(text.replace(/\s+/g, " ").trim()).slice(0, max).join("");
    found.set(match.person_id, {
      id: match.person_id,
      name: clean(profile.name, 24),
      // Profile only; never substitute quest text or infer a biography from speech.
      background: clean(
        [profile.role, profile.story].filter((s) => s?.trim()).join(" · "),
        160,
      ),
    });
  }
  const people = Array.from(found.values());
  const detected = Number.isFinite(face.detected_count)
    ? Math.max(face.matches.length, Math.floor(face.detected_count))
    : face.matches.length;
  return {
    active: true,
    sessionId,
    requestId: face.request_id,
    people: people.slice(0, 4),
    unmatchedCount: Math.min(99, Math.max(0, detected - matchedFaces)),
    omittedCount: Math.min(99, Math.max(0, people.length - 4)),
  };
}
