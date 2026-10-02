import type {
  GameEvent,
  Memory,
  Person,
  PersonPanel as Panel,
  Quest,
} from "../../models";
import { personMemoryLabel } from "../../utils/personMemory";
import { Icon } from "../ui/Icon";

interface PersonPanelProps {
  person: Person;
  panel: Panel;
  quests: Quest[];
  memories: Memory[];
  gameEvents: GameEvent[];
  onOpenQuest: (id: string) => void;
  onOpenMemory: (id: string) => void;
}

export function PersonPanel({
  person,
  panel,
  quests,
  memories,
  gameEvents,
  onOpenQuest,
  onOpenMemory,
}: PersonPanelProps) {
  if (panel === "profile") {
    return (
      <div className="profile-grid">
        <span>
          <small>人物 ID</small>
          <b>{person.id}</b>
        </span>
        <span>
          <small>最近记录</small>
          <b>{person.seen}</b>
        </span>
        <span>
          <small>人脸模板</small>
          <b>MNN ArcFace 512D</b>
        </span>
        <span>
          <small>隐私范围</small>
          <b>仅本机</b>
        </span>
      </div>
    );
  }

  if (panel === "memories") {
    const related = memories.filter(
      (item) =>
        item.personIds?.includes(person.id) ||
        item.title.includes(person.name) ||
        item.meta.includes(person.name),
    );
    const affinityEvents = gameEvents.filter(
      (event) =>
        event.personId === person.id && event.type === "affinity_changed",
    );
    if (!related.length && !affinityEvents.length)
      return (
        <p className="empty-panel">
          眼镜识别或对话总结后，共同记忆会出现在这里。
        </p>
      );
    return (
      <>
        {affinityEvents.slice(0, 5).map((event) => (
          <div key={event.id} className="linked affinity-memory">
            <span className="linked-icon gold">
              <Icon name="Heart" />
            </span>
            <span>
              <b>{event.summary}</b>
              <small>
                {new Date(event.createdAt).toLocaleString("zh-CN")} ·
                可追溯关系事件
              </small>
            </span>
          </div>
        ))}
        {related.slice(0, 6).map((item) => (
          <button
            key={item.id}
            className="linked memory-link"
            data-memory={item.id}
            onClick={() => onOpenMemory(item.id)}
          >
            <span className="linked-icon blue">
              <Icon name="Database" />
            </span>
            <span>
              <b>{item.title}</b>
              <small>
                {item.time} · {item.meta}
                {item.personMemoryKind
                  ? ` · ${personMemoryLabel(item.personMemoryKind)}`
                  : ""}
              </small>
            </span>
            <Icon name="ChevronRight" />
          </button>
        ))}
      </>
    );
  }

  if (!person.quests.length)
    return <p className="empty-panel">暂时没有关联任务。</p>;
  return (
    <>
      {person.quests.map((title, index) => {
        const item = quests.find((quest) => quest.title === title);
        return (
          <button
            key={title}
            className="linked"
            data-quest={item?.id}
            data-open-quest={item ? "true" : undefined}
            onClick={() => item && onOpenQuest(item.id)}
          >
            <span className={`linked-icon ${index ? "blue" : "gold"}`}>
              <Icon name={index ? "Link" : "CircleAlert"} />
            </span>
            <span>
              <b>{title}</b>
              <small>
                {item ? `${item.group} · ${item.progress}%` : "人物长期线索"}
              </small>
            </span>
            <Icon name="ChevronRight" />
          </button>
        );
      })}
    </>
  );
}
