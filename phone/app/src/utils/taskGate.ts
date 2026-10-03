export type TaskDecisionKind =
  | "no_action"
  | "candidate"
  | "create"
  | "update"
  | "confirm_existing"
  | "progress_candidate"
  | "cancel_candidate";
export interface TaskDecision {
  kind: TaskDecisionKind;
  reason: string;
  action: string;
  acceptanceCriteria: string;
  speakerPersonId: string | null;
  mentionedPersonIds: string[];
  assigneePersonId: string | null;
  existingId?: string;
}
export interface TaskGateContext {
  entryPoint?: "explicit_goal_input" | "conversation" | "world_event";
  speakerPersonId?: string | null;
  people?: Array<{ id: string; name: string; aliases?: string[] }>;
  uniquePendingCandidateId?: string;
  notExpired?: boolean;
  pendingCandidateIds?: string[];
}
export const compactUtterance = (text: string) =>
  text.replace(/[\s，。！？!?；;、：:]/g, "").trim();
export function stableKey(text: string) {
  let hash = 2166136261;
  for (const char of text) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
export function semanticOverlap(a: string, b: string) {
  const left = compactUtterance(a).toLowerCase(),
    right = compactUtterance(b).toLowerCase();
  const grams = new Set(
    Array.from({ length: Math.max(0, left.length - 1) }, (_, i) =>
      left.slice(i, i + 2),
    ),
  );
  return [...grams].filter((token) => right.includes(token)).length;
}
const acknowledgements =
  /^(?:嗯+|哦+|噢+|啊+|好[的吧啊呀]?|行|可以|(?:我)?知道了|(?:我)?明白了|收到|谢谢[你您]?(?:的?提醒)?(?:我)?|多谢|是[的啊]|对[的啊])+$/;
export const isAcknowledgement = (text: string) =>
  acknowledgements.test(compactUtterance(text));
const actionWords =
  /提醒|整理|提交|准备|带[来上]?|跑步|运动|做饭|打扫|归还|录[制音影]|录制|写|阅读|测试|复测|验证|修改|修复|开发|制作|设计|完成|联系|报名|购买|买|发[给送]|安排|练习|学习|确认|记录|画|收集|导出|检查|调试|参加|打印|训练|交付|演示|收纳/;
export function decideTask(
  input: string,
  context: TaskGateContext = {},
): TaskDecision {
  const text = input.replace(/\s+/g, " ").trim();
  const clean = compactUtterance(text);
  const speaker = context.speakerPersonId ?? null;
  const mentioned = (context.people ?? [])
    .filter((p) =>
      [p.name, ...(p.aliases ?? [])].some((name) => text.includes(name)),
    )
    .map((p) => p.id)
    .filter((id) => id !== speaker);
  const decision: TaskDecision = {
    kind: "no_action",
    reason: "没有可验证的行动",
    action: text,
    acceptanceCriteria: "",
    speakerPersonId: speaker,
    mentionedPersonIds: mentioned,
    assigneePersonId: null,
  };
  if (!clean) return decision;
  if (
    /(?:不|别)(?:再|用|要|想|去)?(?:跑步|做饭|提交|整理|安排|录制|提醒|测试|修改)/.test(
      clean,
    )
  )
    return { ...decision, reason: "否定行动不创建任务" };
  if (isAcknowledgement(text)) {
    if (
      context.uniquePendingCandidateId &&
      context.notExpired &&
      !context.pendingCandidateIds?.some(
        (id) => id !== context.uniquePendingCandidateId,
      )
    )
      return {
        ...decision,
        kind: "confirm_existing",
        existingId: context.uniquePendingCandidateId,
        reason: "只确认唯一未过期待确认对象",
      };
    return { ...decision, reason: "独立认可或寒暄不产生新任务" };
  }
  if (/不做了|不想做|取消(?:这个|这项|任务)|放弃(?:这个|这项|任务)/.test(clean))
    return {
      ...decision,
      kind: "cancel_candidate",
      reason: "需要确认取消已有任务",
    };
  if (
    /不用.*(?:安排|提醒|帮)|随便聊|我们聊聊|明天再说|改天再说|吃了吗|天气.*(?:不错|挺好|很好)|假如|如果.*(?:会|就)|要是/.test(
      clean,
    )
  )
    return decision;
  if (
    /(?:了吗|了没|有没有|是否|吗[？?]?$)|[？?]$/.test(text) &&
    !/能不能.*(?:帮|提醒|整理|发|带)|可以.*(?:帮|提醒|整理|带)/.test(text)
  )
    return { ...decision, reason: "提问不创建或完成任务" };
  if (
    (/(?:昨天|已经|刚刚|刚才)/.test(clean) && actionWords.test(clean)) ||
    /(?:改|做|写|交|提交|修|完成|测试|复测|验证)(?:好了|完了|完毕|通过了|了)$/.test(
      clean,
    )
  )
    return {
      ...decision,
      kind: "progress_candidate",
      reason: "自述完成仅提交待验收证据",
    };
  if (
    /(?:他|她|老陈|老孙|小蔡|大翔|大黄).*(?:说他|说她|准备|打算|计划|想要)/.test(
      clean,
    ) &&
    !/帮我|提醒我/.test(clean)
  )
    return {
      ...decision,
      kind: "candidate",
      reason: "第三人计划不能直接分配给用户",
    };
  if (!actionWords.test(clean)) return decision;
  const explicit = context.entryPoint === "explicit_goal_input";
  const committed =
    /^(?:我(?:要|会|打算|计划|准备|想)|请帮我|帮我|记得|提醒我)|(?:我们|我).*(?:一起|来)(?:整理|测试|开发|复测|验证)/.test(
      clean,
    );
  const requested =
    /能不能|拜托|麻烦|你帮我|请你|帮忙/.test(clean) ||
    /^(?:请|先|现在|今天|今晚|明天)?(?:整理|提交|准备|跑步|做饭|打扫|归还|录制|测试|复测|验证|修改|修复|开发|制作|设计|联系|报名|安排|练习|学习|记录|收集|导出|检查|调试|打印|训练|交付|演示|收纳)(?:一下|一会|一次|起来|一份|一张|一段)/.test(
      clean,
    );
  if (!explicit && !committed && !requested)
    return {
      ...decision,
      reason: "仅提及行动，没有提出执行请求或目标",
    };
  const assignee =
    explicit || (/^我(?:要|会|打算|计划|准备|想)/.test(clean) && !speaker)
      ? "player"
      : null;
  const resolved = explicit || assignee === "player";
  return {
    ...decision,
    kind: resolved ? "create" : "candidate",
    assigneePersonId: assignee,
    acceptanceCriteria: `确认「${text.replace(/^(?:请帮我|帮我|我要|我想|提醒我)/, "")}」已完成，并保留结果或用户验收记录`,
    reason: resolved
      ? "明确目标，可建立任务"
      : "有具体行动，需确认执行者与验收要求",
  };
}
