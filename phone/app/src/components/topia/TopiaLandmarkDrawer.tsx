import type { Memory, Person, Quest, TopiaLandmark } from "../../models";
import { Icon } from "../ui/Icon";

export function TopiaLandmarkDrawer({
  landmark,
  memories,
  quests,
  people,
  onClose,
}: {
  landmark: TopiaLandmark;
  memories: Memory[];
  quests: Quest[];
  people: Person[];
  onClose: () => void;
}) {
  const relatedMemories = landmark.memoryIds
    .map((id) => memories.find((item) => item.id === id))
    .filter((item): item is Memory => Boolean(item));
  const relatedQuests = landmark.taskIds
    .map((id) => quests.find((item) => item.id === id))
    .filter((item): item is Quest => Boolean(item));
  const relatedPeople = landmark.personIds
    .map((id) => people.find((item) => item.id === id))
    .filter((item): item is Person => Boolean(item));

  return (
    <>
      <button
        className="topia-drawer-backdrop"
        data-close-topia-drawer
        aria-label="关闭地点详情"
        onClick={onClose}
      />
      <article
        className="topia-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="topia-landmark-title"
      >
        <header className="topia-drawer-head">
          <span className="topia-drawer-symbol" aria-hidden="true">
            {landmark.emoji}
          </span>
          <div>
            <small>{landmark.eyebrow}</small>
            <h2 id="topia-landmark-title">{landmark.label}</h2>
          </div>
          <button data-close-topia-drawer aria-label="关闭" onClick={onClose}>
            <Icon name="X" />
          </button>
        </header>
        <p className="topia-drawer-story">{landmark.description}</p>

        <section className="topia-relations" aria-label="关联内容">
          <h3>关联经历</h3>
          {relatedMemories.length ? (
            relatedMemories.map((memory) => (
              <div className="topia-relation" key={memory.id}>
                <span className="topia-relation-icon memory">✦</span>
                <span>
                  <b>{memory.title}</b>
                  <small>{memory.summary ?? memory.meta}</small>
                </span>
              </div>
            ))
          ) : (
            <p className="topia-empty-relation">还没有形成可回看的记忆</p>
          )}

          <h3>关联任务</h3>
          {relatedQuests.length ? (
            relatedQuests.map((quest) => (
              <div
                className="topia-relation topia-task-relation"
                data-related-task={quest.id}
                key={quest.id}
              >
                <span className="topia-relation-icon task">
                  <Icon name="ListTodo" />
                </span>
                <span>
                  <b>{quest.title}</b>
                  <small>{quest.meta}</small>
                  <i>
                    <em style={{ width: `${quest.progress}%` }} />
                  </i>
                </span>
                <strong>{quest.progress}%</strong>
              </div>
            ))
          ) : (
            <p className="topia-empty-relation">没有关联任务</p>
          )}

          <h3>相关人物</h3>
          {relatedPeople.length ? (
            <div className="topia-related-people">
              {relatedPeople.map((person) => (
                <span key={person.id} data-related-person={person.id}>
                  <i>{person.name.slice(0, 1)}</i>
                  <b>{person.name}</b>
                  <small>{person.role}</small>
                </span>
              ))}
            </div>
          ) : (
            <p className="topia-empty-relation">这段故事暂时只属于你</p>
          )}
        </section>
      </article>
    </>
  );
}
