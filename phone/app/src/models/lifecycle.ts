export type TaskLifecycle =
  | "candidate"
  | "accepted"
  | "active"
  | "blocked"
  | "ready_for_review"
  | "completed"
  | "cancelled";
export interface QuestStep {
  id: string;
  title: string;
  status: "pending" | "verified";
  weight: number;
  prerequisiteStepIds: string[];
  acceptanceCriteria: string;
  evidenceIds: string[];
  completedAt?: string;
}
export interface TaskEvidence {
  id: string;
  taskId: string;
  stepId?: string;
  sourceType:
    "user_confirmation" | "asr" | "vision" | "test_receipt" | "legacy_import";
  sourceId: string;
  excerpt: string;
  observedAt: string;
  confidence: number;
  verificationStatus: "candidate" | "verified" | "revoked";
  verifiedBy?: string;
  dedupeKey: string;
}
export interface ProgressEvent {
  eventId: string;
  taskId: string;
  stepId?: string;
  operation: "verify" | "undo" | "review" | "cancel" | "accept";
  evidenceIds: string[];
  recordedAt: string;
  actor: string;
  rulesVersion: string;
  dedupeKey: string;
}
export interface BadgeAward {
  id: string;
  definitionId: string;
  title: string;
  taskId: string;
  milestoneId: string;
  personIds: string[];
  evidenceIds: string[];
  awardedAt: string;
  rulesVersion: string;
  dedupeKey: string;
  status: "valid" | "revoked";
}
export interface BadgeDefinition {
  id: string;
  title: string;
  scope: "personal" | "stage" | "team";
  eligibilityRule: string;
  rulesVersion: string;
  visualKind: "blueprint" | "workshop" | "lighthouse" | "stage";
}
export type DurableMemoryKind =
  | "episode"
  | "fact"
  | "preference"
  | "commitment"
  | "userGoal"
  | "sharedProject"
  | "working_context";
export interface SocialPromptResult {
  matchedPersonId: string | null;
  reminder: string;
  suggestions: Array<{
    id: string;
    label: string;
    intent: "warm" | "curious" | "helpful" | "honest" | "exit";
    usedMemoryIds: string[];
  }>;
  usedMemoryIds: string[];
  evidenceRefs: Array<{
    memoryId: string;
    sourceId: string;
    excerpt: string;
    observedAt: string;
  }>;
  createdAt: string;
  expiresAt: string;
  reasonSummary: string;
  sourceTier: "edge" | "cloud";
}
