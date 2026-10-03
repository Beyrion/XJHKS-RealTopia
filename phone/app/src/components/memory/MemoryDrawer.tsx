import type { Memory, Person, Quest } from "../../models";
import { personMemoryLabel } from "../../utils/personMemory";
import { Icon } from "../ui/Icon";
import { storage } from "../../services/storage";

export function MemoryDrawer({
  memory,
  people,
  quests,
  onClose,
  onDelete,
  onEdit,
}: {
  memory: Memory;
  people: Person[];
  quests: Quest[];
  onClose: () => void;
  onDelete: () => void;
  onEdit?: (text: string) => void;
}) {
  const relatedPeople =
    memory.personIds
      ?.map((id) => people.find((item) => item.id === id)?.name)
      .filter(Boolean) ?? [];
  const relatedTasks =
    memory.taskIds
      ?.map((id) => quests.find((item) => item.id === id)?.title)
      .filter(Boolean) ?? [];
  const uses = storage
    .loadConversationHistory()
    .filter((turn) => turn.usedMemoryIds?.includes(memory.id));
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
        <p>
          来源：{memory.sourceType ?? "旧版未记录"} ·{" "}
          {memory.sourceId ?? memory.sourceRecordingId ?? memory.id}
        </p>
        <small>
          时间：{memory.observedAt ?? "未记录"} · 版本 {memory.revision ?? 1} ·{" "}
          {memory.status ?? "active"}
          {memory.supersedesId ? ` · 替代 ${memory.supersedesId}` : ""}
        </small>
        {memory.speakerVoiceId && (
          <p>
            会话声音标签：{memory.speakerVoiceId} · 原始分句 #
            {memory.speakerSourceRecordingId}
          </p>
        )}
        {memory.transcript && <blockquote>{memory.transcript}</blockquote>}
        {!!uses.length && (
          <section>
            <h4>曾被这些提示引用</h4>
            {uses.slice(0, 6).map((turn) => (
              <p key={turn.id}>
                {turn.transcript}
                <small> · {turn.createdAt}</small>
              </p>
            ))}
          </section>
        )}
        <div className="memory-relations">
          <span>人物　{relatedPeople.join("、") || "未关联"}</span>
          <span>任务　{relatedTasks.join("、") || "未关联"}</span>
        </div>
        {onEdit && (
          <button
            id="edit-memory"
            onClick={() => {
              const text = window.prompt(
                "纠正记忆内容（保留旧版本证据）",
                memory.summary ?? memory.title,
              );
              if (text) onEdit(text);
            }}
          >
            纠正记忆
          </button>
        )}
        <button className="danger-inline" id="delete-memory" onClick={onDelete}>
          <Icon name="Trash2" />
          删除此条记忆
        </button>
      </article>
    </>
  );
}
