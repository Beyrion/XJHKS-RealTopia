const phases = {
  preparing: {
    title: "唤醒世界",
    lines: ["正在叫醒沉睡的小岛", "正在收集口袋里的灵感", "正在为远方留一扇门"],
  },
  design: {
    title: "寻找形状",
    lines: [
      "正在把心事折成屋檐",
      "正在给想象找一个落脚处",
      "正在听风讲述你的故事",
      "正在挑选世界的骨架",
    ],
  },
  concept: {
    title: "调和风物",
    lines: [
      "正在借一点黄昏的颜色",
      "正在把云揉得柔软一些",
      "正在为天空挂上第一颗星",
      "正在给日常涂上奇妙的底色",
    ],
  },
  blueprints: {
    title: "铺展山川",
    lines: [
      "正在描绘山川沟壑",
      "正在撒石子创建小径",
      "正在搭起通往远方的桥",
      "正在给房间留出一束光",
      "正在给菜地浇水",
    ],
  },
  details: {
    title: "雕琢细节",
    lines: [
      "正在替窗框描一圈细线",
      "正在给阶梯安上温柔的扶手",
      "正在把小花安放在窗边",
      "正在给书架藏一段故事",
      "正在让石缝长出一点绿意",
    ],
  },
  review: {
    title: "巡游世界",
    lines: [
      "正在沿着小径散一次步",
      "正在检查每一块石头的落脚处",
      "正在让屋檐接住路过的风",
      "正在给新世界掸去一点灰尘",
    ],
  },
  assets: {
    title: "安放记忆",
    lines: [
      "正在给旧朋友寻找新座位",
      "正在把珍藏放进新的角落",
      "正在挂好旅途留下的小风铃",
      "正在把世界悄悄装进行囊",
    ],
  },
  complete: {
    title: "迎接抵达",
    lines: [
      "正在为你打开世界的门",
      "最后一朵云也找到了家",
      "小岛准备好听你的故事了",
    ],
  },
};
export function topiaNarration(stage: string) {
  if (stage.includes("blueprint") || stage === "assembly") return phases.blueprints;
  if (stage.includes("detail")) return phases.details;
  if (stage === "revision") return phases.review;
  if (stage === "memory") return phases.assets;
  return phases[stage as keyof typeof phases] ?? phases.preparing;
}
