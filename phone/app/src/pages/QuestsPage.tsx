import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { QuestDetail } from "../components/quests/QuestDetail";
import { QuestList } from "../components/quests/QuestList";
import type { QuestFilter } from "../models";
import { useAppStore } from "../store/AppStore";

export default function QuestsPage() {
  const location = useLocation();
  const { quests, activeQuestId, focusQuest, toggleQuestStep } = useAppStore();
  const [selectedId, setSelectedId] = useState(quests[0]?.id ?? "");
  const [filter, setFilter] = useState<QuestFilter>("active");
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const visibleQuests = useMemo(
    () =>
      quests.filter(
        (item) =>
          filter === "all" ||
          (filter === "done" ? item.progress === 100 : item.progress < 100),
      ),
    [filter, quests],
  );
  const selected = useMemo(
    () =>
      visibleQuests.find((item) => item.id === selectedId) ?? visibleQuests[0],
    [selectedId, visibleQuests],
  );

  useEffect(() => {
    const questId = (location.state as { questId?: string } | null)?.questId;
    const target = quests.find((item) => item.id === questId);
    if (!target) return;
    setSelectedId(target.id);
    setFilter((current) => {
      if (
        current === "all" ||
        (current === "done" && target.progress === 100) ||
        (current === "active" && target.progress < 100)
      )
        return current;
      return target.progress === 100 ? "done" : "active";
    });
  }, [location.key]);

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  const changeFilter = (next: QuestFilter) => {
    setFilter(next);
    const visible = quests.filter(
      (item) =>
        next === "all" ||
        (next === "done" ? item.progress === 100 : item.progress < 100),
    );
    if (!visible.some((item) => item.id === selectedId) && visible[0])
      setSelectedId(visible[0].id);
  };

  const toggleStep = (index: number) => {
    if (!selected) return;
    toggleQuestStep(selected.id, index);
  };

  if (!selected) return null;
  return (
    <div className="quests">
      <QuestList
        quests={quests}
        selectedId={selected?.id ?? ""}
        filter={filter}
        collapsed={collapsed}
        onFilter={changeFilter}
        onSelect={setSelectedId}
        onToggleGroup={(group) =>
          setCollapsed((current) => {
            const next = new Set(current);
            next.has(group) ? next.delete(group) : next.add(group);
            return next;
          })
        }
      />
      {selected && (
        <QuestDetail
          quest={selected}
          quests={quests}
          onSelect={setSelectedId}
          onToggleStep={toggleStep}
          isFocused={selected.id === activeQuestId}
          onFocus={() => focusQuest(selected.id)}
        />
      )}
    </div>
  );
}
