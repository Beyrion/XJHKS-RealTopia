export interface MemoryContext {
  sessionSummary?: boolean;
  memories?: import("./domain").Memory[];
  activeQuestId?: string | null;
  tasks: {
    id: string;
    title: string;
    body: string;
    personId: string | null;
    lifecycle?: import("./lifecycle").TaskLifecycle;
    participantIds?: string[];
    ownerPersonId?: string;
  }[];
  people: { id: string; name: string }[];
  selectedPersonId?: string | null;
  recentConversation?: { transcript: string; speakerPersonId: string | null }[];
  sceneSummary?: string | null;
}

export interface ExtractedPersonMemory {
  kind: "conversation" | "fact" | "preference" | "promise" | "relationship";
  personId: string;
  summary: string;
  evidence: string;
  confidence: number;
}

export interface ExtractedTaskOperation {
  operation: "create" | "update" | "progress" | "complete_candidate";
  taskId: string | null;
  title: string;
  deadline: string;
  personId: string | null;
  steps: string[];
  evidence: string;
  confidence: number;
}

export interface ExtractedInteractionEvent {
  type:
    "meaningful_conversation" | "gratitude" | "help" | "promise" | "conflict";
  personId: string;
  evidence: string;
  confidence: number;
}

export interface DialogueSuggestion {
  usedMemoryIds?: string[];
  id: string;
  label: string;
  intent: "warm" | "curious" | "helpful" | "honest" | "exit";
}

export interface ConversationTurn {
  speakerVoiceId?: string | null;
  speakerSourceRecordingId?: number;
  speakerAttribution?: "unconfirmed" | "player" | "person";
  usedMemoryIds?: string[];
  evidenceRefs?: import("./lifecycle").SocialPromptResult["evidenceRefs"];
  id: string;
  conversationId: number;
  recordingId: number;
  sequence: number;
  transcript: string;
  contextTranscript: string;
  createdAt: string;
  speakerPersonId: string | null;
  sceneSummary: string | null;
  replySuggestions: DialogueSuggestion[];
  localReplySuggestions?: DialogueSuggestion[];
  enhancedReplySuggestions?: DialogueSuggestion[];
  enhancementStatus: "pending" | "complete" | "fallback" | "failed";
  enhancementModel?: string;
  enhancementRecommended?: boolean;
  enhancementReason?: string;
  enhancementDisplayed?: boolean;
  selectedSuggestionId?: string;
  selectedSuggestionLabel?: string;
  selectedAt?: string;
  responseSource?: "manual" | "voice";
  spokenResponse?: string;
  responseCompletedAt?: string;
}

export interface ConversationInsight {
  socialPrompt?: import("./lifecycle").SocialPromptResult;
  summary: string;
  story: string;
  personIds: string[];
  speakerPersonId: string | null;
  mentionedPersonIds: string[];
  taskIds: string[];
  affinityDelta: number;
  followUps: string[];
  memories: ExtractedPersonMemory[];
  taskOperations: ExtractedTaskOperation[];
  interactionEvents: ExtractedInteractionEvent[];
  replySuggestions: DialogueSuggestion[];
  /** Cloud judgement: replace the already-visible local suggestions. */
  enhanceReplySuggestions: boolean;
  enhancementReason: string;
}

export interface PlanningContext {
  tasks: { id: string; title: string; body: string; personId: string | null }[];
  people: { id: string; name: string }[];
}

export interface PlannedQuest {
  title: string;
  deadline: string;
  priority: "首要" | "普通";
  personId: string | null;
  personName: string | null;
  parentTaskId: string | null;
  steps: string[];
  reward: string;
}
