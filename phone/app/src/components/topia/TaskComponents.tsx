import { useNavigate } from "react-router-dom";
import type { Quest } from "../../models";
import {
  isFormalQuest,
  questLifecycle,
  lifecycleLabels,
} from "../../utils/questEvidence";
export function TaskComponents({ quests }: { quests: Quest[] }) {
  const navigate = useNavigate(),
    tasks = quests.filter(isFormalQuest);
  const awards = quests
    .flatMap((q) => q.badgeAwards ?? [])
    .filter((a) => a.status === "valid");
  return (
    <section aria-label="任务场景与徽章" className="task-component-list">
      <p>任务组件 · 本地白名单映射；即使 3D 不可用也能回到任务卡</p>
      {tasks.map((q) => (
        <button
          key={q.id}
          data-task-component={q.id}
          data-task-progress={q.progress}
          onClick={() => navigate("/quests", { state: { questId: q.id } })}
        >
          {q.displayTitle ?? q.title}
          <small>
            {q.realTitle ?? q.title} · {q.progress}% ·{" "}
            {lifecycleLabels[questLifecycle(q)]}
          </small>
        </button>
      ))}
      {!tasks.length && <p>接取任务后出现对应组件；候选任务不占用正式场景。</p>}
      <p>
        有效徽章：{awards.map((a) => a.title).join("、") || "尚未结算"}
        。青年创造者仅代表团队作品交付纪念，非官方奖项。
      </p>
    </section>
  );
}
