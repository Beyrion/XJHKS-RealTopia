import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { MemoryDrawer } from "../../components/memory/MemoryDrawer";
import { Icon } from "../../components/ui/Icon";
import { SettingCard } from "../../components/ui/SettingCard";
import { useAppStore } from "../../store/AppStore";

const PAGE_SIZE = 20;

export default function MemorySettingsPage() {
  const location = useLocation();
  const {
    memories,
    people,
    quests,
    gameEvents,
    deleteMemory,
    editMemory,
    notify,
  } = useAppStore();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return memories.filter(
      (item) =>
        item.status !== "deleted" &&
        (showHistory ||
          !["superseded", "dismissed", "pending"].includes(
            item.status ?? "active",
          )) &&
        (!needle ||
          `${item.title} ${item.meta} ${item.summary ?? ""} ${item.transcript ?? ""}`
            .toLowerCase()
            .includes(needle)),
    );
  }, [memories, query, showHistory]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageItems = filtered.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  const selected = selectedId
    ? memories.find((item) => item.id === selectedId)
    : null;

  useEffect(() => {
    const memoryId = (location.state as { memoryId?: string } | null)?.memoryId;
    if (memoryId) setSelectedId(memoryId);
  }, [location.state]);

  const deleteSelected = () => {
    if (!selected || !confirm(`删除记忆“${selected.title}”？此操作无法撤销。`))
      return;
    deleteMemory(selected.id);
    setSelectedId(null);
    notify("记忆已删除");
  };

  const clearAll = () => {
    if (
      !memories.length ||
      !confirm(`清除本机全部 ${memories.length} 条记忆？此操作无法撤销。`)
    )
      return;
    memories
      .filter((item) => item.status !== "deleted")
      .forEach((item) => deleteMemory(item.id));
    setPage(0);
    setSelectedId(null);
    notify("全部记忆已清除");
  };

  const exportArchive = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            version: 2,
            exportedAt: new Date().toISOString(),
            memories: memories.filter((item) => item.status !== "deleted"),
            affinityLedger: gameEvents.filter(
              (event) =>
                event.type === "affinity_changed" ||
                event.type === "conversation_recorded",
            ),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `realtopia-memory-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    notify("记忆档案已导出");
  };

  return (
    <div className="setting-view">
      <div className="setting-head">
        <h1>记忆</h1>
      </div>
      <SettingCard title="记忆条目">
        <div className="memory-browser">
          <div className="memory-toolbar">
            <label>
              <input
                type="checkbox"
                checked={showHistory}
                onChange={(e) => setShowHistory(e.target.checked)}
              />
              显示旧版本与待确认记录
            </label>
            <label className="search" aria-label="搜索记忆">
              <Icon name="Search" />
              <input
                id="memory-search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                  setSelectedId(null);
                }}
              />
            </label>
            <nav className="memory-pages" aria-label="记忆分页">
              {Array.from({ length: pageCount }, (_, index) => (
                <button
                  key={index}
                  data-memory-page={index}
                  className={currentPage === index ? "active" : ""}
                  aria-current={currentPage === index ? "page" : undefined}
                  onClick={() => {
                    setPage(index);
                    setSelectedId(null);
                  }}
                >
                  {index + 1}
                </button>
              ))}
            </nav>
          </div>
          <div className="memory-manager">
            <div className="mem-list">
              {pageItems.length ? (
                pageItems.map((item) => (
                  <button
                    key={item.id}
                    data-memory={item.id}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span>
                      <b>{item.title}</b>
                      <small>{item.meta}</small>
                    </span>
                    <span className="memory-side">
                      <time>{item.time}</time>
                      <Icon name="ChevronRight" />
                    </span>
                  </button>
                ))
              ) : (
                <p className="empty-panel">没有匹配的记忆。</p>
              )}
            </div>
          </div>
        </div>
      </SettingCard>
      <SettingCard title="存储与隐私">
        <div className="buttons">
          <button id="export-memory" onClick={exportArchive}>
            <Icon name="Download" />
            导出记忆档案
          </button>
          <button id="clear-memory" className="danger" onClick={clearAll}>
            <Icon name="Trash2" />
            清除全部记忆
          </button>
        </div>
      </SettingCard>
      {selected && (
        <MemoryDrawer
          memory={selected}
          people={people}
          quests={quests}
          onClose={() => setSelectedId(null)}
          onDelete={deleteSelected}
          onEdit={(text) => {
            editMemory(selected.id, text);
            setSelectedId(null);
            notify("纠正已保存为新版本，旧记录退出检索");
          }}
        />
      )}
    </div>
  );
}
