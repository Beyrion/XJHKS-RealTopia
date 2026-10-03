import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { QuestDetail } from "../components/quests/QuestDetail";
import { QuestList } from "../components/quests/QuestList";
import type { QuestFilter } from "../models";
import { useAppStore } from "../store/AppStore";
import { questLifecycle } from "../utils/questEvidence";
export default function QuestsPage() {
  const location = useLocation();
  const { quests, activeQuestId, focusQuest, toggleQuestStep } = useAppStore();
  const [selectedId, setSelectedId] = useState(
    quests.find((q) => !q.demo)?.id ?? "",
  );
  const [filter, setFilter] = useState<QuestFilter>("active");
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const available = quests.filter((q) => !q.demo);
  const visible = available.filter(
    (q) =>
      filter === "all" ||
      (filter === "done"
        ? questLifecycle(q) === "completed"
        : !["completed", "cancelled"].includes(questLifecycle(q))),
  );
  const selected = visible.find((q) => q.id === selectedId) ?? visible[0];
  useEffect(() => {
    const id = (location.state as { questId?: string } | null)?.questId;
    if (id) {
      setSelectedId(id);
      setFilter("all");
    }
  }, [location.key]);
  return (
    <div className="quests">
      <QuestList
        quests={available}
        selectedId={selected?.id ?? ""}
        filter={filter}
        collapsed={collapsed}
        onFilter={setFilter}
        onSelect={setSelectedId}
        onToggleGroup={(group) =>
          setCollapsed((current) => {
            const next = new Set(current);
            next.has(group) ? next.delete(group) : next.add(group);
            return next;
          })
        }
      />
      {selected ? (
        <QuestDetail
          quest={selected}
          quests={quests}
          onSelect={setSelectedId}
          onToggleStep={(index) => toggleQuestStep(selected.id, index)}
          isFocused={selected.id === activeQuestId}
          onFocus={() => focusQuest(selected.id)}
        />
      ) : (
        <p className="empty-panel">
          暂无此类任务。结束对话感知后会整理生成任务。
        </p>
      )}
    </div>
  );
}
