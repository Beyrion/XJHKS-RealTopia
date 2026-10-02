import type { PersonMemoryKind } from "../models";

const labels: Record<PersonMemoryKind, string> = {
  conversation: "共同对话",
  fact: "人物事实",
  preference: "偏好",
  promise: "承诺",
  task_assigned: "布置任务",
  task_completed: "履行承诺",
  task_failed: "未履行任务",
  relationship: "关系变化",
};

export function personMemoryLabel(kind: PersonMemoryKind) {
  return labels[kind];
}
