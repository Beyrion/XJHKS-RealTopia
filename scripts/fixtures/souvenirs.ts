import type { Souvenir } from "../../phone/app/src/models";

// Deterministic regression fixtures for collectible layout.

const catalog: Souvenir[] = [
  {
    id: "showcase-moon-rabbit",
    questId: "showcase-moon-rabbit",
    name: "月眠兔玩偶",
    emoji: "🐇",
    description:
      "绒白小兔抱着一枚微亮月核，长耳、围巾、纽扣眼与足底星纹都由独立构件组成。",
    acquiredAt: "2026-08-14T02:00:00.000Z",
    presentation: {
      modelKind: "moon-rabbit-doll",
      preferredLocation: "interior",
      scale: 0.78,
    },
  },
  {
    id: "showcase-constellation-badge",
    questId: "showcase-constellation-badge",
    name: "星誓珐琅徽章",
    emoji: "🎖️",
    description:
      "双层金属徽章覆着深蓝珐琅，中央星晶与四枚微小星点连成只属于佩戴者的星座。",
    acquiredAt: "2026-08-14T02:01:00.000Z",
    presentation: {
      modelKind: "constellation-badge",
      preferredLocation: "interior",
      scale: 0.76,
    },
  },
  {
    id: "showcase-firefly-bottle",
    questId: "showcase-firefly-bottle",
    name: "萤火星尘瓶",
    emoji: "🫙",
    description:
      "透明小瓶里悬着五点萤火，软木塞、铜箍、提环与瓶底星砂在近看时各有层次。",
    acquiredAt: "2026-08-14T02:02:00.000Z",
    presentation: {
      modelKind: "firefly-bottle",
      preferredLocation: "interior",
      scale: 0.75,
    },
  },
  {
    id: "showcase-winged-book",
    questId: "showcase-winged-book",
    name: "翼页秘典",
    emoji: "📖",
    description:
      "掌心大小的书由封皮、书脊、页芯、锁扣和六片纸羽组成，书心宝石会缓慢呼吸。",
    acquiredAt: "2026-08-14T02:03:00.000Z",
    presentation: {
      modelKind: "winged-book",
      preferredLocation: "interior",
      scale: 0.8,
    },
  },
  {
    id: "showcase-star-compass",
    questId: "showcase-star-compass",
    name: "潮汐星罗盘",
    emoji: "🧭",
    description:
      "两道刻度环包围一枚双色指针，四方星钉、顶端挂环与中央潮光晶核均可辨认。",
    acquiredAt: "2026-08-14T02:04:00.000Z",
    presentation: {
      modelKind: "star-compass",
      preferredLocation: "exterior",
      scale: 0.78,
    },
  },
  {
    id: "showcase-sprout-lantern",
    questId: "showcase-sprout-lantern",
    name: "芽光提灯",
    emoji: "🏮",
    description:
      "叶芽从灯顶穿出，细框守着一颗暖光种子；提环、灯柱和上下护圈构成完整小灯。",
    acquiredAt: "2026-08-14T02:05:00.000Z",
    presentation: {
      modelKind: "sprout-lantern",
      preferredLocation: "garden",
      scale: 0.78,
    },
  },
  {
    id: "showcase-cloud-whale",
    questId: "showcase-cloud-whale",
    name: "云鲸挂坠",
    emoji: "🐋",
    description:
      "小鲸卧在三团软云上，尾鳍、胸鳍、眼睛、额前星晶和背部光斑形成完整轮廓。",
    acquiredAt: "2026-08-14T02:06:00.000Z",
    presentation: {
      modelKind: "cloud-whale",
      preferredLocation: "exterior",
      scale: 0.76,
    },
  },
  {
    id: "showcase-planet-teacup",
    questId: "showcase-planet-teacup",
    name: "环星茶盏",
    emoji: "☕",
    description:
      "釉色茶盏托着一颗袖珍行星，杯耳、杯碟、倾斜星环与伴飞小月在近景中清晰可见。",
    acquiredAt: "2026-08-14T02:07:00.000Z",
    presentation: {
      modelKind: "planet-teacup",
      preferredLocation: "garden",
      scale: 0.8,
    },
  },
  {
    id: "showcase-echo-shell",
    questId: "showcase-echo-shell",
    name: "回声珍珠螺",
    emoji: "🐚",
    description:
      "螺壳由渐收的旋片、六道壳脊和一枚发光珍珠构成，转到侧面仍能看见内部层次。",
    acquiredAt: "2026-08-14T02:08:00.000Z",
    presentation: {
      modelKind: "echo-shell",
      preferredLocation: "garden",
      scale: 0.76,
    },
  },
  {
    id: "showcase-clockwork-bird",
    questId: "showcase-clockwork-bird",
    name: "发条青鸟",
    emoji: "🐦",
    description:
      "青鸟有分件翅羽、尾羽、铜喙、晶石眼与侧面齿轮，像一台随时会振翅的小机械。",
    acquiredAt: "2026-08-14T02:09:00.000Z",
    presentation: {
      modelKind: "clockwork-bird",
      preferredLocation: "exterior",
      scale: 0.78,
    },
  },
  {
    id: "showcase-aurora-key",
    questId: "showcase-aurora-key",
    name: "极光花钥",
    emoji: "🗝️",
    description:
      "细长钥身连接花形匙环，双齿、中心晶核、环边小叶和一缕极光共同构成微缩饰物。",
    acquiredAt: "2026-08-14T02:10:00.000Z",
    presentation: {
      modelKind: "aurora-key",
      preferredLocation: "garden",
      scale: 0.74,
    },
  },
  {
    id: "showcase-dream-camera",
    questId: "showcase-dream-camera",
    name: "梦境留影匣",
    emoji: "📷",
    description:
      "小相机拥有机身包角、三层镜头、快门、取景器和悬浮相纸，镜片里留着一颗微光星。",
    acquiredAt: "2026-08-14T02:11:00.000Z",
    presentation: {
      modelKind: "dream-camera",
      preferredLocation: "exterior",
      scale: 0.76,
    },
  },
];

export const bundledSouvenirShowcase = catalog;
