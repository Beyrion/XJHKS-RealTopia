import type { Quest } from "../../models";
import { Icon } from "../ui/Icon";

export function QuestDetail({
  quest,
  quests,
  onSelect,
  onToggleStep,
}: {
  quest: Quest;
  quests: Quest[];
  onSelect: (id: string) => void;
  onToggleStep: (index: number) => void;
}) {
  const completed = Math.round((quest.progress * quest.steps.length) / 100);
  const parent = quest.parentId
    ? quests.find((item) => item.id === quest.parentId)
    : null;
  const children = quests.filter((item) => item.parentId === quest.id);
  return (
    <article className="q-detail">
      <div className="q-tags">
        <span>
          <Icon name="ListTodo" />
          {quest.group}
        </span>
        <b>{quest.priority}优先级</b>
      </div>
      <h1>{quest.title}</h1>
      <small>
        {quest.meta}
        {quest.person ? `　·　关联人物 ${quest.person}` : ""}
      </small>
      {parent && (
        <button
          className="parent-link"
          data-quest={parent.id}
          onClick={() => onSelect(parent.id)}
        >
          <Icon name="Link" />
          父任务　<b>{parent.title}</b>
        </button>
      )}
      <p>{quest.body}</p>
      <section className="task-status">
        <div className="q-progress">
          <span>任务进度</span>
          <b>{quest.progress}%</b>
        </div>
        <div className="meter">
          <i style={{ width: `${quest.progress}%` }} />
        </div>
        <div className="clue-head">
          <h3>行动线索</h3>
          <small>
            {completed} / {quest.steps.length} 已完成
          </small>
        </div>
        <div className="steps">
          {quest.steps.map((step, index) => (
            <button
              key={`${step}-${index}`}
              className={`step ${index < completed ? "done" : ""}`}
              data-step={index}
              onClick={() => onToggleStep(index)}
            >
              <span className="step-check">
                {index < completed && <Icon name="Check" />}
              </span>
              {step}
            </button>
          ))}
        </div>
      </section>
      {children.length > 0 && (
        <>
          <h3>子任务</h3>
          {children.map((item) => (
            <button
              key={item.id}
              className="child-link"
              data-quest={item.id}
              onClick={() => onSelect(item.id)}
            >
              <i>{item.progress}%</i>
              <span>{item.title}</span>
              <Icon name="ChevronRight" />
            </button>
          ))}
        </>
      )}
      <div className="reward">
        <span className="reward-icon">
          <Icon name="Gift" />
        </span>
        <span>
          <small>完成奖励</small>
          <b>{quest.reward}</b>
        </span>
      </div>
    </article>
  );
}
