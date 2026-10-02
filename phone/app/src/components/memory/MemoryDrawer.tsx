import type { Memory, Person, Quest } from "../../models";
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
