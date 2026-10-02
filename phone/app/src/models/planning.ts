export interface MemoryContext {
  tasks: { id: string; title: string; body: string; personId: string | null }[];
  people: { id: string; name: string }[];
  selectedPersonId?: string | null;
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

export interface ConversationInsight {
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
