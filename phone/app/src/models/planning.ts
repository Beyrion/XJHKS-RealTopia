export interface MemoryContext {
  tasks: { id: string; title: string; body: string; personId: string | null }[];
  people: { id: string; name: string }[];
}

export interface ConversationInsight {
  summary: string;
  story: string;
  personIds: string[];
  taskIds: string[];
  affinityDelta: number;
  followUps: string[];
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
