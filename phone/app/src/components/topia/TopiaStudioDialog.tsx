import { useEffect, useMemo, useRef, useState } from "react";
import type {
  TopiaGenerationProgress,
  TopiaStudioPayload,
  TopiaUserProfileInput,
} from "../../models";
import { Icon } from "../ui/Icon";

type ProfileChoiceKey =
  | "traits"
  | "preferences"
  | "experiences"
  | "imagery"
  | "sensations"
  | "stylePreferences";

const pages: Array<{
  eyebrow: string;
  title: string;
  note: string;
  questions: Array<{
    key: ProfileChoiceKey;
    title: string;
    options: string[];
  }>;
}> = [
  {
    eyebrow: "01 · 性格气候",
    title: "世界如何回应你",
    note: "没有标准答案，选最先吸引你的那一项。",
    questions: [
      {
        key: "traits",
        title: "你更像哪种行路者？",
        options: [
          "追逐未知的观星者",
          "照料日常的园丁",
          "收藏故事的旅人",
          "拆解万物的工匠",
          "沿着声音寻路的人",
          "为陌生事物命名的人",
        ],
      },
      {
        key: "preferences",
        title: "变化到来时，你更接近……",
        options: [
          "扎根但仍会摇曳",
          "先随风走一段",
          "像潮汐慢慢蓄力",
          "让火花重新排序",
          "留出一块安静空白",
          "找到同伴再出发",
        ],
      },
    ],
  },
  {
    eyebrow: "02 · 感官与空间",
    title: "选择一种直觉",
    note: "它们会影响空间节奏、触感与光影，而不是指定物件。",
    questions: [
      {
        key: "sensations",
        title: "哪种触感更接近你的安全感？",
        options: [
          "被薄雾轻轻包住",
          "踩过缓慢回弹的云",
          "手心贴近温热裂纹",
          "听见清脆而遥远的回声",
          "粗糙表面藏着柔光",
          "微凉空气穿过指缝",
        ],
      },
      {
        key: "imagery",
        title: "你希望空间怎样呼吸？",
        options: [
          "层层回响后聚拢",
          "留一段很长的空白",
          "像枝条向远处生长",
          "绕着隐形中心缓慢旋转",
          "在高低之间轻轻跳跃",
          "从碎片逐渐拼合完整",
        ],
      },
    ],
  },
  {
    eyebrow: "03 · 无目的意象",
    title: "让联想自由一点",
    note: "选择只提供抽象关联。比如选纸船，可能留下折叠、漂泊或轻盈感，但不会直接生成纸船。",
    questions: [
      {
        key: "experiences",
        title: "你会把秘密藏在哪里？",
        options: [
          "长满藤蔓的旧抽屉",
          "只在黄昏出现的门",
          "一颗会唱歌的石头",
          "风经过时展开的纸船",
          "没有寄出的透明信封",
          "雨停后留下的浅水洼",
        ],
      },
      {
        key: "imagery",
        title: "哪一刻值得被延长？",
        options: [
          "灯刚刚亮起之前",
          "一句话落下后的余音",
          "风把影子吹散的时候",
          "陌生道路忽然变熟悉",
          "云层短暂露出缺口",
          "找到遗失很久的名字",
        ],
      },
    ],
  },
  {
    eyebrow: "04 · 材质倾向",
    title: "给随机性一个方向",
    note: "这不是固定模板，只会改变 Rust 抽取油画、毛绒、纸艺、陶瓷、绘本或晶体风格的概率。",
    questions: [
      {
        key: "stylePreferences",
        title: "这次更想靠近哪种手感？",
        options: ["完全随机", "柔软温暖", "手工肌理", "绘画笔触", "晶莹光泽"],
      },
    ],
  },
];

const choiceEmojis = [
  [
    ["🔭", "🌿", "📚", "🧩", "🎶", "✨"],
    ["🌳", "🍃", "🌊", "🔥", "☁️", "🫶"],
  ],
  [
    ["🌫️", "☁️", "♨️", "🔔", "🪵", "💨"],
    ["🌀", "▫️", "🌱", "🪐", "〰️", "🧶"],
  ],
  [
    ["🗄️", "🚪", "🪨", "⛵", "💌", "💧"],
    ["💡", "🎵", "🌬️", "🛤️", "🌤️", "🔖"],
  ],
  [["🎲", "🧸", "✂️", "🎨", "💎"]],
];

export type TopiaStudioMode = "onboarding" | "manage";

interface Props {
  open: boolean;
  mode: TopiaStudioMode;
  studio: TopiaStudioPayload;
  progress: TopiaGenerationProgress | null;
  generating: boolean;
  onClose: () => void;
  onUseDefault: () => void;
  onGenerate: (profile: TopiaUserProfileInput) => void;
  onIterate: () => void;
  onSwitch: (id: string) => void;
}

export function TopiaStudioDialog({
  open,
  mode,
  studio,
  progress,
  generating,
  onClose,
  onUseDefault,
  onGenerate,
  onIterate,
  onSwitch,
}: Props) {
  const initial = useMemo<TopiaUserProfileInput>(
    () => ({
      ...(studio.lastProfile ?? {}),
      summary: "想要一个能安放日常、任务和共同记忆的幻想空间",
      ...studio.lastProfile,
      traits: studio.lastProfile?.traits ?? [pages[0].questions[0].options[0]],
      preferences: studio.lastProfile?.preferences ?? [
        pages[0].questions[1].options[0],
      ],
      experiences: studio.lastProfile?.experiences ?? [
        pages[2].questions[0].options[0],
      ],
      imagery: studio.lastProfile?.imagery ?? [
        pages[1].questions[1].options[0],
        pages[2].questions[1].options[0],
      ],
      sensations: studio.lastProfile?.sensations ?? [
        pages[1].questions[0].options[0],
      ],
      stylePreferences: studio.lastProfile?.stylePreferences ?? ["完全随机"],
    }),
    [studio.lastProfile],
  );
  const [profile, setProfile] = useState(initial);
  const [page, setPage] = useState(0);
  const [view, setView] = useState<"entry" | "customize" | "history">("entry");
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    setProfile(initial);
    setPage(0);
    setView("entry");
  }, [initial, open, mode]);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      if (dialogRef.current) dialogRef.current.scrollTop = 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [open, page, view]);
  if (!open) return null;

  const activePage = pages[page];
  const questionIndex = (key: ProfileChoiceKey, question: number) =>
    pages
      .slice(0, page)
      .flatMap((item) => item.questions)
      .concat(activePage.questions.slice(0, question))
      .filter((item) => item.key === key).length;
  const pick = (key: ProfileChoiceKey, index: number, value: string) =>
    setProfile((current) => {
      const values = [...(current[key] ?? [])];
      values[index] = value;
      return { ...current, [key]: values };
    });
  const dialogTitle = generating
    ? "正在创建 Topia"
    : view === "entry"
      ? "让每个人都成为自己人生开放世界中的主角。"
      : view === "customize"
        ? `创建 Topia（第 ${page + 1} / ${pages.length} 步）`
        : "选择历史 Topia";

  return (
    <div
      className="topia-studio-overlay"
      onMouseDown={(event) => {
        if (!generating && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`topia-studio-dialog view-${view}`}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="topia-studio-title"
      >
        <header>
          <span>
            <h2 id="topia-studio-title">{dialogTitle}</h2>
            {view === "entry" && !generating && (
              <p>开始创建你的 Topia</p>
            )}
          </span>
          <button
            aria-label="关闭 Topia 工坊"
            disabled={generating}
            onClick={onClose}
          >
            <Icon name="X" />
          </button>
        </header>

        {generating ? (
          <div className="topia-generation-wait" aria-live="polite">
            <div className="topia-generation-orbit">
              <i />
              <i />
              <i />
              <span>✦</span>
            </div>
            <h3>{progress?.message ?? "正在唤醒新的 Topia"}</h3>
            <div className="topia-generation-progress">
              <i style={{ width: `${progress?.progress ?? 4}%` }} />
            </div>
            <small>
              {progress?.progress ?? 4}% · {progress?.stage ?? "starting"}
            </small>
          </div>
        ) : view === "entry" ? (
          <div className="topia-entry-choice" data-topia-studio-mode={mode}>
            <div className="topia-entry-cards">
              <button
                onClick={
                  mode === "onboarding"
                    ? onUseDefault
                    : () => setView("customize")
                }
              >
                <span aria-hidden="true">
                  {mode === "onboarding" ? "🏡" : "🎨"}
                </span>
                <b>{mode === "onboarding" ? "使用默认" : "自定义"}</b>
              </button>
              <button
                onClick={() =>
                  setView(mode === "onboarding" ? "customize" : "history")
                }
              >
                <span aria-hidden="true">
                  {mode === "onboarding" ? "🪄" : "🖼️"}
                </span>
                <b>{mode === "onboarding" ? "自己定制" : "从历史选择"}</b>
              </button>
            </div>
          </div>
        ) : view === "history" ? (
          <>
            <div className="topia-history-view">
              <div className="topia-history-grid">
                {studio.worlds.map((world, index) => (
                  <button
                    key={world.id}
                    className={world.active ? "active" : ""}
                    onClick={() => !world.active && onSwitch(world.id)}
                  >
                    <span className="topia-history-thumbnail">
                      {world.thumbnail ? (
                        <img src={world.thumbnail} alt="" />
                      ) : (
                        <span aria-hidden="true">
                          {index === 0 ? "🏡" : "☁️"}
                        </span>
                      )}
                    </span>
                    <span>
                      <b>{world.homeName}</b>
                      <small>{world.archetype}</small>
                    </span>
                    <em>
                      {world.active ? "当前" : index === 0 ? "默认" : "历史"}
                    </em>
                  </button>
                ))}
              </div>
            </div>
            <footer>
              <button className="secondary" onClick={() => setView("entry")}>
                返回
              </button>
              <button className="topia-iterate" onClick={onIterate}>
                <Icon name="RefreshCw" />
                记录当前 Topia 的最近变化
              </button>
            </footer>
          </>
        ) : (
          <>
            <div className="topia-studio-layout customize">
              <div className="topia-imagery">
                <div
                  className="topia-guide-progress"
                  aria-label={`第 ${page + 1} 页，共 ${pages.length} 页`}
                >
                  {pages.map((_, index) => (
                    <i
                      className={index <= page ? "active" : ""}
                      key={index}
                    />
                  ))}
                </div>
                {activePage.questions.map((dimension, question) => {
                  const index = questionIndex(dimension.key, question);
                  return (
                    <fieldset key={`${dimension.key}-${dimension.title}`}>
                      <legend>{dimension.title}</legend>
                      <div>
                        {dimension.options.map((option, optionIndex) => (
                          <button
                            type="button"
                            className={
                              profile[dimension.key]?.[index] === option
                                ? "selected"
                                : ""
                            }
                            key={option}
                            onClick={() => pick(dimension.key, index, option)}
                          >
                            <span aria-hidden="true">
                              {choiceEmojis[page][question][optionIndex]}
                            </span>
                            {option}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  );
                })}
                {page === pages.length - 1 && (
                  <label>
                    <span>还希望世界记住什么？</span>
                    <textarea
                      value={profile.summary}
                      onChange={(event) =>
                        setProfile((current) => ({
                          ...current,
                          summary: event.target.value,
                        }))
                      }
                    />
                  </label>
                )}
              </div>
            </div>
            <footer>
              <div className="topia-guide-actions">
                {page > 0 && (
                  <button
                    className="secondary"
                    onClick={() => setPage(page - 1)}
                  >
                    上一步
                  </button>
                )}
                {page === 0 && (
                  <button
                    className="secondary"
                    onClick={() => setView("entry")}
                  >
                    返回
                  </button>
                )}
                {page < pages.length - 1 ? (
                  <button onClick={() => setPage(page + 1)}>
                    下一页 <Icon name="ChevronRight" />
                  </button>
                ) : (
                  <button onClick={() => onGenerate(profile)}>
                    <Icon name="Orbit" />
                    生成新的 Topia
                  </button>
                )}
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
