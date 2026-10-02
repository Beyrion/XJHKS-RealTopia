import type {
  LocalModelRepository,
  Memory,
  MoodKind,
  MoodProfile,
  MoodSnapshot,
  Person,
  Quest,
} from "../models";
import { starterQuests as initialQuests } from "./starterQuests";

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
  老孙: "老孙",
  妈妈: "mom",
  老陈: "老陈",
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

export const starterQuests: Quest[] = initialQuests;

export const starterMemories: Memory[] = [];

export const starterPeople: Person[] = [
  {
    id: "老孙",
    name: "老孙",
    role: "公司同事",
    affinity: 88,
    tone: "jade",
    quote: "有事情随时沟通。",
    story: "与老陈是公司同事，彼此熟悉，日常工作中经常协作。",
    quests: ["星图绘境 · CVPR 万象图卷", "梦想成为肌肉男计划 · 第二期"],
    seen: "已录入",
  },
  {
    id: "老陈",
    name: "老陈",
    role: "公司同事",
    affinity: 84,
    tone: "amber",
    quote: "工作上的事我们一起推进。",
    story: "与老孙是公司同事，合作比较密切，彼此关系很好。",
    quests: ["胡闹厨房 · 本周料理远征", "梦想成为肌肉男计划 · 第二期"],
    seen: "尚未识别",
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
