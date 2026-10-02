import type { Memory, Person, Quest } from "../../models";
import { personMemoryLabel } from "../../utils/personMemory";
import { Icon } from "../ui/Icon";

export function MemoryDrawer({
  memory,
  people,
  quests,
  onClose,
  onDelete,
}: {
  memory: Memory;
  people: Person[];
  quests: Quest[];
  onClose: () => void;
  onDelete: () => void;
}) {
  const relatedPeople =
    memory.personIds
      ?.map((id) => people.find((item) => item.id === id)?.name)
      .filter(Boolean) ?? [];
  const relatedTasks =
    memory.taskIds
      ?.map((id) => quests.find((item) => item.id === id)?.title)
      .filter(Boolean) ?? [];
  return (
    <>
      <button
        className="memory-drawer-backdrop"
        data-close-memory
        aria-label="关闭记忆详情"
        onClick={onClose}
      />
      <article
        className="memory-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="记忆详情"
      >
        <div className="drawer-head">
          <small>{memory.time}</small>
          <button data-close-memory onClick={onClose}>
            关闭
          </button>
        </div>
        <h3>{memory.title}</h3>
        <p>{memory.summary ?? memory.meta}</p>
        {memory.personMemoryKind && (
          <div className="memory-relations">
            <span>人物记忆　{personMemoryLabel(memory.personMemoryKind)}</span>
            <span>
              置信度　
              {memory.confidence === undefined
                ? "未记录"
                : `${Math.round(memory.confidence * 100)}%`}
            </span>
          </div>
        )}
        {memory.evidence && <blockquote>证据：{memory.evidence}</blockquote>}
        {memory.transcript && <blockquote>{memory.transcript}</blockquote>}
        <div className="memory-relations">
          <span>人物　{relatedPeople.join("、") || "未关联"}</span>
          <span>任务　{relatedTasks.join("、") || "未关联"}</span>
        </div>
        <button className="danger-inline" id="delete-memory" onClick={onDelete}>
          <Icon name="Trash2" />
          删除此条记忆
        </button>
      </article>
    </>
  );
}
