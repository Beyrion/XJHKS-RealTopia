import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { QuestDetail } from "../components/quests/QuestDetail";
import { QuestList } from "../components/quests/QuestList";
import type { QuestFilter } from "../models";
import { useAppStore } from "../store/AppStore";

export default function QuestsPage() {
  const location = useLocation();
  const { quests, memories, updateQuests, updateMemories } = useAppStore();
  const [selectedId, setSelectedId] = useState(quests[0]?.id ?? "");
  const [filter, setFilter] = useState<QuestFilter>("active");
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const selected = useMemo(
    () => quests.find((item) => item.id === selectedId) ?? quests[0],
    [quests, selectedId],
  );

  useEffect(() => {
    const questId = (location.state as { questId?: string } | null)?.questId;
    if (questId) setSelectedId(questId);
  }, [location.state]);

  const changeFilter = (next: QuestFilter) => {
    setFilter(next);
    const visible = quests.filter(
      (item) =>
        next === "all" ||
        (next === "done" ? item.progress === 100 : item.progress < 100),
    );
    if (selected && !visible.includes(selected) && visible[0])
      setSelectedId(visible[0].id);
  };

  const toggleStep = (index: number) => {
    if (!selected) return;
    const completed = Math.round(
      (selected.progress * selected.steps.length) / 100,
    );
    const progress = Math.round(
      (100 * (index < completed ? index : index + 1)) / selected.steps.length,
    );
    updateQuests((items) =>
      items.map((item) =>
        item.id === selected.id ? { ...item, progress } : item,
      ),
    );
    if (
      progress === 100 &&
      !memories.some((item) => item.id === `complete-${selected.id}`)
    ) {
      updateMemories((items) => [
        {
          id: `complete-${selected.id}`,
          time: new Date().toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          title: `任务完成 · ${selected.title}`,
          meta: `世界变化已保存 · ${selected.reward}`,
          kind: "task",
        },
        ...items,
      ]);
    }
  };

  if (!selected) return null;
  return (
    <div className="quests">
      <QuestList
        quests={quests}
        selectedId={selected.id}
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
      <QuestDetail
        quest={selected}
        quests={quests}
        onSelect={setSelectedId}
        onToggleStep={toggleStep}
      />
    </div>
  );
}
