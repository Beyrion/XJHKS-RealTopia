import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PersonPanel } from "../components/people/PersonPanel";
import { Portrait } from "../components/people/Portrait";
import { Icon } from "../components/ui/Icon";
import type { PersonPanel as Panel } from "../models";
import { nativeService } from "../services/native";
import { useAppStore } from "../store/AppStore";
import { affinityLevel } from "../utils/gameRules";

export default function PeoplePage() {
  const navigate = useNavigate();
  const { people, quests, memories, session, notify } = useAppStore();
  const [selectedId, setSelectedId] = useState(people[0]?.id ?? "");
  const [panel, setPanel] = useState<Panel>("quests");
  const person = useMemo(
    () => people.find((item) => item.id === selectedId) ?? people[0],
    [people, selectedId],
  );
  if (!person) return null;
  const live = session.last_face;
  const relatedMemories = memories.filter(
    (item) =>
      item.personIds?.includes(person.id) ||
      item.title.includes(person.name) ||
      item.meta.includes(person.name),
  ).length;

  const enroll = async () => {
    try {
      await nativeService.enrollLastFace(person.id);
      notify(`已将最近人脸录入 ${person.name}`);
    } catch {
      notify("没有可录入的人脸，请先拍摄清晰正脸");
    }
  };

  return (
    <div className="people">
      <aside className="p-list">
        <div className="p-list-head">
          <div className="page-head">
            <h1>人物</h1>
          </div>
          <div className="chips">
            <b>最近相遇</b>
            <span>全部人物</span>
            <span>等待相认</span>
          </div>
        </div>
        <div className="p-grid">
          {people.map((item) => (
            <button
              key={item.id}
              className={`p-card ${person.id === item.id ? "active" : ""}`}
              data-person={item.id}
              onClick={() => {
                setSelectedId(item.id);
                setPanel("quests");
              }}
            >
              <Portrait person={item} />
              <span>
                <b>{item.name}</b>
                <small>{item.role}</small>
                <em>
                  <Icon name="Heart" />
                  {item.affinity}
                </em>
              </span>
            </button>
          ))}
        </div>
        <button
          className="import"
          id="enroll-person"
          onClick={() => void enroll()}
        >
          <Icon name="UserRoundPlus" />
          <b>录入人物</b>
          <small>
            {live?.eligible_count
              ? `检测到 ${live.eligible_count} 张可用人脸`
              : "请先拍摄清晰正脸"}
          </small>
        </button>
      </aside>
      <article className="p-info">
        <section className="person-overview">
          <div className="p-hero">
            <Portrait person={person} big />
            <small>
              第 {String(people.indexOf(person) + 1).padStart(2, "0")} 位
            </small>
          </div>
          <div className="person-bio">
            <h1>{person.name}</h1>
            <p className="role">{person.role}</p>
            <div className="affinity">
              <span>
                <Icon name="Heart" />
                好感度 · {affinityLevel(person.affinity)}
              </span>
              <b>
                {person.affinity}
                <small>/100</small>
              </b>
              <i>
                <em style={{ width: `${person.affinity}%` }} />
              </i>
            </div>
            <blockquote>“{person.quote}”</blockquote>
            <p>{person.story}</p>
          </div>
        </section>
        <div className="p-tabs">
          <button
            data-person-panel="quests"
            className={panel === "quests" ? "active" : ""}
            onClick={() => setPanel("quests")}
          >
            关联任务 {person.quests.length}
          </button>
          <button
            data-person-panel="memories"
            className={panel === "memories" ? "active" : ""}
            onClick={() => setPanel("memories")}
          >
            共同记忆 {relatedMemories}
          </button>
          <button
            data-person-panel="profile"
            className={panel === "profile" ? "active" : ""}
            onClick={() => setPanel("profile")}
          >
            人物档案
          </button>
        </div>
        <div className="person-related">
          <PersonPanel
            person={person}
            panel={panel}
            quests={quests}
            memories={memories}
            onOpenQuest={(id) =>
              navigate("/quests", { state: { questId: id } })
            }
            onOpenMemory={(id) =>
              navigate("/settings/memory", { state: { memoryId: id } })
            }
          />
        </div>
        <small className="seen">
          <Icon name="ScanFace" />
          {person.seen} · 由眼镜感知
        </small>
        {live && (
          <div className="face-live">
            <b>最近识别 #{live.request_id}</b>
            <span>
              检测 {live.detected_count} · 可匹配 {live.eligible_count} ·{" "}
              {live.processing_total_ms} 毫秒
            </span>
          </div>
        )}
      </article>
    </div>
  );
}
