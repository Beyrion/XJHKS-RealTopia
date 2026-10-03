export interface SensingTaskSummary {
  sessionId: number;
  phase: "draining" | "analyzing" | "empty" | "ready" | "error";
  utteranceCount: number;
  taskCount: number;
  suggested: boolean;
  error?: string;
}

/** The phone retains the report; the glasses clear the center once choices are done. */
export function glassTaskSummarySnapshot(
  summary: SensingTaskSummary | null,
  perception: boolean,
  pendingCount: number,
) {
  if (
    perception ||
    !summary ||
    (summary.phase === "ready" && pendingCount === 0)
  )
    return { active: false };
  return { ...summary, active: true, pendingCount };
}

export function sensingTaskSummaryText(summary: SensingTaskSummary | null) {
  if (!summary) return "语音感知已关闭";
  switch (summary.phase) {
    case "draining":
      return "麦克风已关闭 · 正在完成本轮剩余转写";
    case "analyzing":
      return `正在总结 ${summary.utteranceCount} 段转写并生成任务`;
    case "empty":
      return "本轮未收到清晰转写 · 没有生成任务";
    case "ready":
      return `本轮生成 ${summary.taskCount} 个候选任务 · 请在眼镜上接受／拒绝`;
    case "error":
      return `本轮任务总结失败 · ${summary.error ?? "请查看调试日志"}`;
  }
}
