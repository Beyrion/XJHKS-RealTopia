import type { Quest, QuestFilter } from "../../models";
import { Icon } from "../ui/Icon";
import { questLifecycle, lifecycleLabels } from "../../utils/questEvidence";

interface QuestListProps {
  quests: Quest[];
  selectedId: string;
  filter: QuestFilter;
  collapsed: Set<string>;
  onFilter: (filter: QuestFilter) => void;
  onToggleGroup: (group: string) => void;
  onSelect: (id: string) => void;
}

export function QuestList({
  quests,
  selectedId,
  filter,
  collapsed,
  onFilter,
  onToggleGroup,
  onSelect,
}: QuestListProps) {
  const filtered = quests.filter(
    (item) =>
      filter === "all" ||
      (filter === "done"
        ? questLifecycle(item) === "completed"
        : !["completed", "cancelled"].includes(questLifecycle(item))),
  );
  const groups = [...new Set(filtered.map((item) => item.group))];
  return (
    <aside className="q-list">
      <div className="q-list-head">
        <div className="page-head">
          <h1>任务</h1>
        </div>
        <div className="chips quest-filters">
          {(["active", "done", "all"] as const).map((value) => (
            <button
              key={value}
              data-quest-filter={value}
              className={filter === value ? "active" : ""}
              onClick={() => onFilter(value)}
            >
              {value === "active"
                ? "进行中"
                : value === "done"
                  ? "已完成"
                  : "全部"}
            </button>
          ))}
        </div>
      </div>
      <div className="q-scroll">
        {groups.map((group) => {
          const items = filtered.filter((item) => item.group === group);
          return (
            <section className="q-group" key={group}>
              <button
                className="group"
                data-group={group}
                onClick={() => onToggleGroup(group)}
              >
                <span>
                  <Icon name="ListTodo" />
                  <b>{group}</b>
                  <small>{items.length} 项</small>
                </span>
                <Icon
                  name={collapsed.has(group) ? "ChevronRight" : "ChevronDown"}
                />
              </button>
              {!collapsed.has(group) &&
                items.map((item) => (
                  <button
                    key={item.id}
                    className={`q-item ${selectedId === item.id ? "active" : ""}`}
                    data-quest={item.id}
                    onClick={() => onSelect(item.id)}
                  >
                    <i className={`priority ${item.priority}`} />
                    <span>
                      <b>
                        {item.parentId ? "子任务 · " : ""}
                        {item.title}
                      </b>
                      <small>
                        {lifecycleLabels[questLifecycle(item)]} · {item.meta}
                        {item.person ? ` · ${item.person}` : ""}
                      </small>
                    </span>
                    <em>{item.progress}%</em>
                  </button>
                ))}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
