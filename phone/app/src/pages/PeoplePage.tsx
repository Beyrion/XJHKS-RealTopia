import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PersonPanel } from "../components/people/PersonPanel";
import { Portrait } from "../components/people/Portrait";
import { Icon } from "../components/ui/Icon";
import type { Person, PersonPanel as Panel, RecentStranger } from "../models";
import { nativeService } from "../services/native";
import { useAppStore } from "../store/AppStore";
import { affinityLevel } from "../utils/gameRules";

export default function PeoplePage() {
  const navigate = useNavigate();
  const { people, quests, memories, session, notify, updatePeople } =
    useAppStore();
  const [selectedId, setSelectedId] = useState(people[0]?.id ?? "");
  const [panel, setPanel] = useState<Panel>("quests");
  const [enrolling, setEnrolling] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newPersonName, setNewPersonName] = useState("");
  const [strangers, setStrangers] = useState<RecentStranger[]>([]);
  const [strangerOpen, setStrangerOpen] = useState(false);
  const [selectedStrangerId, setSelectedStrangerId] = useState("");
  const [strangerIdentity, setStrangerIdentity] = useState("");
  const [strangerRelationship, setStrangerRelationship] = useState("");
  const [savingStranger, setSavingStranger] = useState(false);
  useEffect(() => {
    const refresh = () =>
      void nativeService
        .recentStrangers()
        .then(setStrangers)
        .catch(() => undefined);
    refresh();
    const timer = window.setInterval(refresh, 2_000);
    return () => window.clearInterval(timer);
  }, []);
  const person = useMemo(
    () => people.find((item) => item.id === selectedId) ?? people[0],
    [people, selectedId],
  );
  if (!person) return null;
  const live = session.last_face;
  const selectedStranger = strangers.find(
    (item) => item.id === selectedStrangerId,
  );
  const relatedMemories = memories.filter(
    (item) =>
      item.personIds?.includes(person.id) ||
      item.title.includes(person.name) ||
      item.meta.includes(person.name),
  ).length;

  const enrollFromGallery = async (target: Person) => {
    if (enrolling) return;
    setEnrolling(true);
    try {
      const receipt = await nativeService.enrollPersonFromGallery(target.id);
      notify(`已为 ${target.name} 录入 ${receipt.enrolled_count} 张人脸照片`);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setEnrolling(false);
    }
  };

  const createAndEnroll = async () => {
    const name = newPersonName.trim();
    if (!name) {
      notify("请先输入人物姓名");
      return;
    }
    if (name.length > 32) {
      notify("人物姓名不能超过 32 个字符");
      return;
    }
    if (people.some((item) => item.id === name || item.name === name)) {
      notify("这个人物已经存在，可在人物卡片中追加照片");
      return;
    }
    const tones = ["jade", "amber", "violet", "rose"];
    const created: Person = {
      id: name,
      name,
      role: "已相认的人物",
      affinity: 50,
      tone: tones[people.length % tones.length],
      quote: "新的相遇，正在被慢慢记住。",
      story: "通过 9 张照片建立了端侧人脸特征，照片本身不会存入人物特征库。",
      quests: [],
      seen: "刚刚录入",
    };
    if (!(await enrollFromGallery(created))) return;
    updatePeople((current) => [...current, created]);
    setSelectedId(created.id);
    setNewPersonName("");
    setCreateOpen(false);
  };

  const enrollRecentFace = async () => {
    try {
      await nativeService.enrollLastFace(person.id);
      notify(`已将最近拍摄的人脸录入 ${person.name}`);
    } catch {
      notify("没有可录入的人脸，请先拍摄清晰正脸");
    }
  };

  const openStranger = (item: RecentStranger) => {
    setSelectedStrangerId(item.id);
    setStrangerIdentity(item.identity ?? "");
    setStrangerRelationship(item.relationship ?? "");
  };

  const saveStranger = async () => {
    const identity = strangerIdentity.trim();
    const relationship = strangerRelationship.trim();
    if (!selectedStranger || !identity || !relationship) {
      notify("请填写身份和与你的关系");
      return;
    }
    setSavingStranger(true);
    try {
      const saved = await nativeService.labelStranger(
        selectedStranger.id,
        identity,
        relationship,
      );
      setStrangers((current) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
      );
      const tones = ["jade", "amber", "violet", "rose"];
      updatePeople((current) => {
        const existing = current.find(
          (item) => item.id === identity || item.name === identity,
        );
        if (existing) {
          return current.map((item) =>
            item.id === existing.id ? { ...item, role: relationship } : item,
          );
        }
        return [
          ...current,
          {
            id: identity,
            name: identity,
            role: relationship,
            affinity: 50,
            tone: tones[current.length % tones.length],
            quote: "从一次陌生的相遇开始，慢慢认识彼此。",
            story: `由眼镜最近相遇保留的 ${saved.photo_count} 张人脸照片完成端侧录入。`,
            quests: [],
            seen: "刚刚标记",
          },
        ];
      });
      notify(
        `已将陌生人标记为 ${identity}，并录入 ${saved.photo_count} 张特征`,
      );
      setSelectedStrangerId("");
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingStranger(false);
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
            <button type="button" onClick={() => setStrangerOpen(true)}>
              等待相认 {strangers.filter((item) => !item.identity).length}
            </button>
          </div>
        </div>
        <button
          className="stranger-inbox"
          type="button"
          onClick={() => setStrangerOpen(true)}
        >
          <Icon name="ScanFace" />
          <span>
            <b>最近陌生人</b>
            <small>保留最近 {strangers.length}/10 人 · 每人至多 9 张</small>
          </span>
          <em>{strangers.filter((item) => !item.identity).length} 待标记</em>
        </button>
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
          disabled={enrolling}
          onClick={() => setCreateOpen(true)}
        >
          <Icon name="UserRoundPlus" />
          <b>{enrolling ? "正在分析照片…" : "新建并录入人物"}</b>
          <small>选择 9 张同一人的清晰照片</small>
        </button>
        <button
          className="enroll-recent"
          disabled={enrolling || !live?.eligible_count}
          onClick={() => void enrollRecentFace()}
        >
          {live?.eligible_count ? "录入最近拍摄的人脸" : "最近拍摄暂无可用人脸"}
        </button>
        <button
          className="enroll-recent enroll-existing"
          disabled={enrolling}
          onClick={() => void enrollFromGallery(person)}
        >
          为 {person.name} 追加 9 张图库照片
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
      {createOpen && (
        <div className="person-enroll-backdrop">
          <form
            className="person-enroll-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="person-enroll-title"
            onSubmit={(event) => {
              event.preventDefault();
              void createAndEnroll();
            }}
          >
            <h2 id="person-enroll-title">新建人物</h2>
            <p>输入姓名后，从系统图库选择 9 张同一人的清晰照片。</p>
            <label>
              人物姓名
              <input
                autoFocus
                maxLength={32}
                placeholder="例如：老孙"
                value={newPersonName}
                onChange={(event) => setNewPersonName(event.target.value)}
              />
            </label>
            <small>照片仅用于端侧提取特征，不会复制进人物库。</small>
            <footer>
              <button
                type="button"
                disabled={enrolling}
                onClick={() => setCreateOpen(false)}
              >
                取消
              </button>
              <button type="submit" disabled={enrolling}>
                {enrolling ? "正在分析…" : "选择 9 张并录入"}
              </button>
            </footer>
          </form>
        </div>
      )}
      {strangerOpen && (
        <div className="person-enroll-backdrop">
          <section className="stranger-dialog" role="dialog" aria-modal="true">
            <header>
              <span>
                <h2>最近陌生人</h2>
                <small>最近 10 人，每人最多保留 9 张裁剪图</small>
              </span>
              <button type="button" onClick={() => setStrangerOpen(false)}>
                关闭
              </button>
            </header>
            <div className="stranger-body">
              <aside className="stranger-list">
                {strangers.length === 0 && (
                  <p>眼镜还没有遇到可匹配尺寸的陌生人。</p>
                )}
                {strangers.map((item, index) => (
                  <button
                    type="button"
                    key={item.id}
                    className={selectedStrangerId === item.id ? "active" : ""}
                    onClick={() => openStranger(item)}
                  >
                    {item.photo_paths[0] ? (
                      <img
                        src={convertFileSrc(item.photo_paths[0])}
                        alt="陌生人人脸"
                      />
                    ) : (
                      <Icon name="ScanFace" />
                    )}
                    <span>
                      <b>{item.identity ?? `陌生人 ${index + 1}`}</b>
                      <small>{item.relationship ?? "身份与关系待标记"}</small>
                      <em>{item.photo_count}/9 张</em>
                    </span>
                  </button>
                ))}
              </aside>
              <article className="stranger-detail">
                {!selectedStranger ? (
                  <p>选择左侧人物，查看照片并标记身份。</p>
                ) : (
                  <>
                    <div className="stranger-photos">
                      {selectedStranger.photo_paths.map((path, index) => (
                        <img
                          key={path}
                          src={convertFileSrc(path)}
                          alt={`保留的人脸 ${index + 1}`}
                        />
                      ))}
                    </div>
                    <small>
                      最近见面：
                      {new Date(
                        selectedStranger.last_seen_at_ms,
                      ).toLocaleString()}
                    </small>
                    <label>
                      身份 / 姓名
                      <input
                        maxLength={32}
                        placeholder="例如：小王"
                        disabled={Boolean(selectedStranger.identity)}
                        value={strangerIdentity}
                        onChange={(event) =>
                          setStrangerIdentity(event.target.value)
                        }
                      />
                    </label>
                    <label>
                      与我的关系
                      <input
                        maxLength={32}
                        placeholder="例如：同事、邻居、朋友"
                        value={strangerRelationship}
                        onChange={(event) =>
                          setStrangerRelationship(event.target.value)
                        }
                      />
                    </label>
                    <button
                      className="stranger-save"
                      type="button"
                      disabled={savingStranger}
                      onClick={() => void saveStranger()}
                    >
                      {savingStranger
                        ? "正在录入…"
                        : selectedStranger.identity
                          ? "更新关系"
                          : `标记并录入 ${selectedStranger.photo_count} 张特征`}
                    </button>
                  </>
                )}
              </article>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
