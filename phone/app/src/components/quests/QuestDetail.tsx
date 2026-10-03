import type { Quest } from "../../models";
import { useAppStore } from "../../store/AppStore";
import {
  normalizeQuest,
  questLifecycle,
  lifecycleLabels,
} from "../../utils/questEvidence";
import { Icon } from "../ui/Icon";
export function QuestDetail({
  quest,
  quests,
  onSelect,
  onToggleStep,
  isFocused,
  onFocus,
}: {
  quest: Quest;
  quests: Quest[];
  onSelect: (id: string) => void;
  onToggleStep: (index: number) => void;
  isFocused: boolean;
  onFocus: () => void;
}) {
  const {
    people,
    reviewQuest,
    changeQuestStatus,
    renameQuest,
    mergeQuest,
    deleteQuest,
  } = useAppStore();
  const q = normalizeQuest(quest),
    state = questLifecycle(q),
    steps = q.stepRecords!;
  const name = (id?: string | null) =>
    id === "player"
      ? "你"
      : (people.find((p) => p.id === id)?.name ?? "未确认");
  const parent = quests.find((t) => t.id === q.parentId),
    children = quests.filter((t) => t.parentId === q.id);
  return (
    <article className="q-detail" data-task-id={q.id} data-lifecycle={state}>
      <div className="q-tags">
        <span>{q.chapter ?? q.group}</span>
        <b>{lifecycleLabels[state]}</b>
        {q.demo && <span>旧版演示 · 不参与正式结算</span>}
      </div>
      <div className="q-title-row">
        <h1>{q.displayTitle ?? q.title}</h1>
        {!["candidate", "cancelled", "completed"].includes(state) && (
          <button data-focus-quest={q.id} onClick={onFocus}>
            {isFocused ? "已追踪" : "追踪"}
          </button>
        )}
      </div>
      <p>
        <b>现实行动：</b>
        {q.realTitle}
      </p>
      <small>
        执行者：{name(q.ownerPersonId)} · 提及人物：
        {q.sourceEvidence?.mentionedPersonIds
          .map((id) => name(id))
          .join("、") || "无"}{" "}
        · 说话者：{name(q.sourceEvidence?.speakerPersonId)}
      </small>
      {q.sourceEvidence && (
        <blockquote>
          来源 {q.sourceEvidence.sourceId}：{q.sourceEvidence.excerpt}
        </blockquote>
      )}
      <p>{q.body}</p>
      {parent && (
        <button className="parent-link" onClick={() => onSelect(parent.id)}>
          父任务 · {parent.title}
        </button>
      )}
      <section className="task-status">
        <div className="q-progress">
          <span>已验证步骤（不由画面相似度推断）</span>
          <b>{q.progress}%</b>
        </div>
        <div className="meter">
          <i style={{ width: `${q.progress}%` }} />
        </div>
        <div className="steps">
          {steps.map((step, index) => (
            <button
              key={step.id}
              className={`step ${step.status === "verified" ? "done" : ""}`}
              data-step={index}
              data-step-id={step.id}
              disabled={["candidate", "cancelled", "blocked"].includes(state)}
              onClick={() => {
                if (
                  step.status === "verified" ||
                  window.confirm(
                    `确认已实际完成？\n${step.acceptanceCriteria}\n这会记录一条你的验收证据。`,
                  )
                )
                  onToggleStep(index);
              }}
            >
              <span className="step-check">
                {step.status === "verified" && <Icon name="Check" />}
              </span>
              <span>
                {step.title}
                <small>
                  {" "}
                  · 权重 {step.weight} ·{" "}
                  {step.status === "verified" ? "已验证" : "待验证"}
                </small>
              </span>
            </button>
          ))}
        </div>
        <p>最终验收条件：{q.acceptanceCriteria}</p>
        {!!q.prerequisiteTaskIds?.length && (
          <p>
            依赖：
            {q.prerequisiteTaskIds.map((id) => (
              <button
                key={id}
                disabled={!quests.some((t) => t.id === id)}
                onClick={() => onSelect(id)}
              >
                {quests.find((t) => t.id === id)?.title ??
                  "依赖任务已删除，尚未满足验收条件"}
              </button>
            ))}
          </p>
        )}
        <div className="buttons">
          {state === "candidate" && (
            <button
              id="accept-quest"
              onClick={() => changeQuestStatus(q.id, "accepted")}
            >
              确认执行者与条件，接取任务
            </button>
          )}
          {state === "ready_for_review" && (
            <button
              id="review-quest"
              onClick={() => {
                if (
                  window.confirm(
                    `确认最终交付满足条件？\n${q.acceptanceCriteria}`,
                  )
                )
                  reviewQuest(q.id);
              }}
            >
              最终验收
            </button>
          )}
          {state === "blocked" && (
            <button onClick={() => changeQuestStatus(q.id, "active")}>
              恢复任务
            </button>
          )}
          {!["candidate", "cancelled", "blocked"].includes(state) && (
            <button onClick={() => changeQuestStatus(q.id, "blocked")}>
              暂停
            </button>
          )}
          {state !== "cancelled" && (
            <button
              id="cancel-quest"
              onClick={() => {
                if (window.confirm("取消任务？奖励将失效，历史证据保留。"))
                  changeQuestStatus(q.id, "cancelled");
              }}
            >
              取消 / 拒绝
            </button>
          )}
          <button
            id="rename-quest"
            onClick={() => {
              const title = window.prompt(
                "修改现实行动名称（taskId 保持不变）",
                q.realTitle,
              );
              if (title) renameQuest(q.id, title);
            }}
          >
            编辑名称
          </button>
          <button
            id="delete-quest"
            className="danger"
            onClick={() => {
              if (
                window.confirm(
                  `删除任务「${q.realTitle ?? q.title}」？\n删除后将从列表和眼镜中移除，相关奖励失效。原始对话、记忆及其他任务保留；依赖它的任务不会自动完成。`,
                )
              )
                deleteQuest(q.id);
            }}
          >
            <Icon name="Trash2" /> 删除任务
          </button>
          {state === "candidate" && (
            <select
              aria-label="合并候选线索"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) mergeQuest(q.id, e.target.value);
              }}
            >
              <option value="">合并线索到已有任务…</option>
              {quests
                .filter(
                  (t) =>
                    t.id !== q.id &&
                    !["candidate", "cancelled"].includes(questLifecycle(t)),
                )
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.realTitle ?? t.title}
                  </option>
                ))}
            </select>
          )}
        </div>
      </section>
      {!!children.length && (
        <section>
          <h3>子任务验收</h3>
          {children.map((t) => (
            <button
              className="child-link"
              key={t.id}
              data-quest={t.id}
              onClick={() => onSelect(t.id)}
            >
              <i>{t.progress}%</i>
              <span>
                {t.title} · {lifecycleLabels[questLifecycle(t)]}
              </span>
            </button>
          ))}
        </section>
      )}
      <section className="task-evidence">
        <h3>证据与变更记录</h3>
        {q.evidence!.length ? (
          q.evidence!.map((e) => (
            <p key={e.id}>
              <b>
                {e.verificationStatus === "candidate"
                  ? "待核对"
                  : e.verificationStatus === "revoked"
                    ? "已撤销"
                    : "已验证"}
              </b>{" "}
              · {e.excerpt}
              <small>
                {" "}
                · {e.sourceType} / {e.sourceId} / {e.observedAt}
              </small>
            </p>
          ))
        ) : (
          <p>尚无实际完成证据。</p>
        )}
        {q.progressEvents!.map((event) => (
          <small className="evidence-event" key={event.eventId}>
            {event.operation} · {event.recordedAt} · {event.rulesVersion}
          </small>
        ))}
      </section>
      <section>
        <h3>任务徽章</h3>
        {q.badgeAwards!.map((award) => (
          <p key={award.id}>
            {award.title} · {award.status === "valid" ? "有效" : "已撤销"} ·{" "}
            {award.evidenceIds.length} 条证据
          </p>
        ))}
        {!q.badgeAwards!.length && (
          <p>完成步骤并最终验收后结算；不按百分比自动授予。</p>
        )}
      </section>
    </article>
  );
}
