import type {
  LocalModelRepository,
  Memory,
  MoodKind,
  MoodProfile,
  MoodSnapshot,
  Person,
  Quest,
} from "../models";

export const moodProfiles: Record<MoodKind, MoodProfile> = {
  joyful: { label: "愉快", weather: "晴光", effect: "阳光与闪光" },
  calm: { label: "平静", weather: "微风", effect: "柔和云流" },
  sad: { label: "难过", weather: "下雨", effect: "雨滴与冷色天空" },
  anxious: { label: "焦虑", weather: "疾风", effect: "快速流云" },
  angry: { label: "生气", weather: "雷云", effect: "脉冲与风暴" },
  tired: { label: "疲惫", weather: "夜雾", effect: "薄雾与星光" },
  neutral: { label: "平常", weather: "晴间云", effect: "自然天气" },
};

export const moodEmoji: Record<MoodKind, string> = {
  joyful: "😄",
  calm: "😌",
  sad: "😢",
  anxious: "😥",
  angry: "😠",
  tired: "😴",
  neutral: "🙂",
};

export const personIdByName: Record<string, string> = {
  林澄: "lin",
  周野: "zhou",
  沈弦: "shen",
  妈妈: "mom",
};

export const localModelRepositories: LocalModelRepository[] = [
  {
    id: "huangzhengxiang/Qwen3-ASR-0.6B-INT8-MNN",
    name: "Qwen3-ASR 0.6B INT8",
    kind: "本地语音识别",
    install: "auto",
  },
  {
    id: "MNN/Qwen3-1.7B-MNN",
    name: "Qwen3 1.7B",
    kind: "本地通用语言模型 · 4-bit",
    install: "manual",
  },
  {
    id: "MNN/Qwen3-VL-2B-Instruct-MNN",
    name: "Qwen3-VL 2B Instruct",
    kind: "本地视觉理解",
    install: "on-demand",
  },
  {
    id: "MNN/Qwen3-VL-4B-Instruct-MNN",
    name: "Qwen3-VL 4B Instruct",
    kind: "本地视觉理解 · 高质量",
    install: "on-demand",
  },
  {
    id: "huangzhengxiang/Qwen3-TTS-0.6B-Base-FP16-MNN",
    name: "Qwen3-TTS 0.6B Base FP16",
    kind: "本地语音合成",
    install: "manual",
  },
];

export const starterQuests: Quest[] = [
  {
    id: "garden",
    group: "世界任务",
    title: "让阳台重新生长",
    meta: "家园 · 长线",
    body: "把那块闲置的阳台变成一个会随季节变化的小花园。先从容易照料的香草开始。",
    priority: "首要",
    progress: 45,
    steps: [
      "测量日照与可用面积",
      "和林澄确认周末花市时间",
      "购买薄荷与迷迭香",
      "完成第一周浇水记录",
    ],
    person: "林澄",
    personId: "lin",
    reward: "记忆组件 · 风铃苗圃",
  },
  {
    id: "album",
    group: "世界任务",
    title: "整理母亲的旧相册",
    meta: "关系 · 家人",
    body: "将散落的家庭照片按年份整理，并记录每张照片背后的故事。",
    priority: "普通",
    progress: 20,
    steps: ["收集三处旧相册", "扫描 1998—2005 年照片", "周日致电妈妈询问背景"],
    person: "妈妈",
    personId: "mom",
    reward: "人物故事 · 旧日夏天",
  },
  {
    id: "app",
    group: "世界任务",
    title: "完成 RealTopia 原型",
    meta: "创造 · 项目",
    body: "打通眼镜与手机的日常记录体验，让技术悄悄退到生活后面。",
    priority: "首要",
    progress: 68,
    steps: [
      "双端视觉统一",
      "任务与人物关联",
      "真机延迟回归",
      "邀请两位朋友试用",
    ],
    reward: "场景组件 · 微光观测站",
  },
  {
    id: "book",
    group: "突发任务",
    title: "把书还给周野",
    meta: "今天 · 18:30 前",
    body: "下班路过青苔书店时把《看不见的城市》还给周野。",
    priority: "首要",
    progress: 0,
    steps: ["出门时带上书", "18:30 前到青苔书店"],
    person: "周野",
    personId: "zhou",
    reward: "好感度 +12",
  },
  {
    id: "dentist",
    group: "突发任务",
    title: "预约牙医复诊",
    meta: "今天 · 5 分钟",
    body: "打电话确认下周三下午是否有空位。",
    priority: "普通",
    progress: 0,
    steps: ["致电诊所", "写入日历"],
    reward: "生命力 +5",
  },
];

export const starterMemories: Memory[] = [
  {
    id: "seed-bookstore",
    time: "今天 17:42",
    title: "青苔书店的雨",
    meta: "人物 · 周野 / 地点 · 老街",
    kind: "person",
    personIds: ["zhou"],
    taskIds: ["book"],
  },
  {
    id: "seed-garden",
    time: "08.08 21:06",
    title: "阳台花园的计划",
    meta: "人物 · 林澄 / 关联任务 2",
    kind: "task",
    personIds: ["lin"],
    taskIds: ["garden"],
  },
  {
    id: "seed-e2e",
    time: "08.06 09:13",
    title: "第一次眼镜端 E2E 测试",
    meta: "项目 · RealTopia / 图片 6",
    kind: "recording",
    taskIds: ["app"],
  },
];

export const starterPeople: Person[] = [
  {
    id: "lin",
    name: "林澄",
    role: "植物研究员 / 老朋友",
    affinity: 86,
    tone: "jade",
    quote: "等迷迭香长高一点，我们就能闻着夏天做饭了。",
    story:
      "你们在大学的旧温室认识。她总能记住每一株植物的名字，也总会在你忙得忘记吃饭时发来一张晚霞。",
    quests: ["让阳台重新生长", "周末去城南花市"],
    seen: "上次见面 · 3 天前",
  },
  {
    id: "zhou",
    name: "周野",
    role: "青苔书店主理人",
    affinity: 64,
    tone: "amber",
    quote: "书不用急着还，故事看完就好。",
    story: "住在老街尽头的书店老板。认识之后，你的借阅时间总比别人长一些。",
    quests: ["把书还给周野"],
    seen: "上次见面 · 昨天",
  },
  {
    id: "shen",
    name: "沈弦",
    role: "独立音乐人",
    affinity: 41,
    tone: "violet",
    quote: "雨落在不同屋檐上，是不同的节拍。",
    story: "在一次小型演出后认识。她正在收集城市里被忽略的声音。",
    quests: ["整理城市声音采样"],
    seen: "上次见面 · 12 天前",
  },
  {
    id: "mom",
    name: "妈妈",
    role: "家人",
    affinity: 92,
    tone: "rose",
    quote: "旧照片别扔，背后写着日期呢。",
    story: "她总说家里的事不用挂心，但会把每一次通话的日期写在厨房日历上。",
    quests: ["整理母亲的旧相册"],
    seen: "上次通话 · 5 天前",
  },
];

export const emptyMood: MoodSnapshot = {
  mood: "neutral",
  intensity: 20,
  summary: "今天还没有记录心情",
  support: "说说此刻的感受，让 Topia 回应你。",
  transcript: "",
  model: "",
  analyzedAt: "",
};
