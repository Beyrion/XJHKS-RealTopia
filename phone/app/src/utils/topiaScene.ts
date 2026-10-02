import * as THREE from "three";
import type {
  MoodKind,
  TopiaCropKind,
  TopiaLocation,
  TopiaObjectConfig,
  TopiaSceneConfig,
  TopiaSceneCrop,
  TopiaSkyConfig,
  TopiaRenderStyleConfig,
} from "../models";

type MoodLook = {
  fog: number;
  fogDensity: number;
  sky: number;
  ground: number;
  sun: number;
  sunIntensity: number;
  exposure: number;
  sparkle: number;
  sparkleOpacity: number;
  cloudSpeed: number;
  glow: number;
  skyTop: number;
  skyMid: number;
  skyLow: number;
  aurora: number;
  celestial: number;
  stars: number;
};

const moodLooks: Record<MoodKind, MoodLook> = {
  joyful: {
    fog: 0xffd9bf,
    fogDensity: 0.011,
    sky: 0xfff1d0,
    ground: 0x91c79e,
    sun: 0xffdc78,
    sunIntensity: 4.8,
    exposure: 1.22,
    sparkle: 0xffffa8,
    sparkleOpacity: 0.98,
    cloudSpeed: 0.00008,
    glow: 0xffd578,
    skyTop: 0x6ccce8,
    skyMid: 0xf58dc3,
    skyLow: 0xffc06f,
    aurora: 0xfff19a,
    celestial: 0xffe27a,
    stars: 0xfff6bd,
  },
  calm: {
    fog: 0xccecf2,
    fogDensity: 0.015,
    sky: 0xdff8ff,
    ground: 0x8eaa99,
    sun: 0xfff0c5,
    sunIntensity: 3.8,
    exposure: 1.08,
    sparkle: 0xcceeff,
    sparkleOpacity: 0.7,
    cloudSpeed: 0.00009,
    glow: 0x8de1f1,
    skyTop: 0x647ac7,
    skyMid: 0x7fd4dc,
    skyLow: 0xc9a9db,
    aurora: 0x9fffe2,
    celestial: 0xeafcff,
    stars: 0xe8ffff,
  },
  sad: {
    fog: 0x617b96,
    fogDensity: 0.026,
    sky: 0x8caac5,
    ground: 0x506b6b,
    sun: 0xb8cee0,
    sunIntensity: 2.1,
    exposure: 0.78,
    sparkle: 0xa6c9dd,
    sparkleOpacity: 0.3,
    cloudSpeed: 0.00017,
    glow: 0x6fa8cf,
    skyTop: 0x213b65,
    skyMid: 0x405b83,
    skyLow: 0x6e6c91,
    aurora: 0x74b7cf,
    celestial: 0xc5d8ec,
    stars: 0xbcdcf0,
  },
  anxious: {
    fog: 0xb7b9df,
    fogDensity: 0.02,
    sky: 0xd9ddff,
    ground: 0x778590,
    sun: 0xe6e9ff,
    sunIntensity: 3.3,
    exposure: 1,
    sparkle: 0xe9ddff,
    sparkleOpacity: 0.62,
    cloudSpeed: 0.00034,
    glow: 0x9a96ff,
    skyTop: 0x4f428f,
    skyMid: 0x8d6fb1,
    skyLow: 0x57a1aa,
    aurora: 0xd798ff,
    celestial: 0xece1ff,
    stars: 0xeee8ff,
  },
  angry: {
    fog: 0x57465d,
    fogDensity: 0.024,
    sky: 0xa57182,
    ground: 0x493d49,
    sun: 0xff9b7a,
    sunIntensity: 3.7,
    exposure: 0.88,
    sparkle: 0xff9d76,
    sparkleOpacity: 0.78,
    cloudSpeed: 0.00028,
    glow: 0xff755f,
    skyTop: 0x281c43,
    skyMid: 0x7f304e,
    skyLow: 0xdb5f48,
    aurora: 0xff744f,
    celestial: 0xffa358,
    stars: 0xffb18c,
  },
  tired: {
    fog: 0x454c72,
    fogDensity: 0.029,
    sky: 0x7b85ae,
    ground: 0x393c57,
    sun: 0xbfc8ff,
    sunIntensity: 1.9,
    exposure: 0.71,
    sparkle: 0xd8d9ff,
    sparkleOpacity: 0.9,
    cloudSpeed: 0.000055,
    glow: 0x8a8de8,
    skyTop: 0x171f4d,
    skyMid: 0x3e3a72,
    skyLow: 0x716493,
    aurora: 0x7d8cff,
    celestial: 0xd8d5ff,
    stars: 0xefedff,
  },
  neutral: {
    fog: 0xcceaff,
    fogDensity: 0.017,
    sky: 0xedfbff,
    ground: 0x8aa57d,
    sun: 0xfff0c5,
    sunIntensity: 4,
    exposure: 1.1,
    sparkle: 0xffef9a,
    sparkleOpacity: 0.82,
    cloudSpeed: 0.00012,
    glow: 0x8de1f1,
    skyTop: 0x5abbd7,
    skyMid: 0x9898dd,
    skyLow: 0xefafbd,
    aurora: 0x8cf5de,
    celestial: 0xffefaa,
    stars: 0xf3f6ff,
  },
};

const fallback = {
  ink: 0x3b4168,
  cream: 0xfff3d6,
  wall: 0xf8e8c8,
  wood: 0xb77952,
  woodDark: 0x76506a,
  coral: 0xff8292,
  blue: 0x6c78ff,
  sky: 0x8de1f1,
  mint: 0x69d4a3,
  yellow: 0xffd75e,
  lavender: 0xc9c4ff,
  cloud: 0xf7fbff,
};

let activeRenderStyle: TopiaRenderStyleConfig | undefined;
let activeStyleTexture: THREE.CanvasTexture | undefined;

function styleTexture(style?: TopiaRenderStyleConfig) {
  if (
    !style ||
    style.textureStrength <= 0.05 ||
    style.kind === "glazed-ceramic" ||
    style.kind === "crystal-diorama"
  )
    return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return undefined;
  let state = style.seed || 1;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, 64, 64);
  const strength = style.textureStrength;
  if (style.kind === "painterly-oil") {
    context.lineCap = "round";
    for (let index = 0; index < 95; index++) {
      const shade = Math.round(224 + random() * 31);
      context.strokeStyle = `rgba(${shade},${shade},${shade},${0.14 + strength * 0.23})`;
      context.lineWidth = 1 + random() * 3;
      context.beginPath();
      const x = random() * 64;
      const y = random() * 64;
      context.moveTo(x, y);
      context.quadraticCurveTo(
        x + 3 + random() * 8,
        y - 2 + random() * 4,
        x + 8 + random() * 13,
        y + random() * 3,
      );
      context.stroke();
    }
  } else if (style.kind === "plush-toy") {
    for (let index = 0; index < 360; index++) {
      const alpha = 0.05 + random() * strength * 0.18;
      context.strokeStyle = `rgba(105,98,110,${alpha})`;
      context.lineWidth = 0.45;
      const x = random() * 64;
      const y = random() * 64;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x - 0.7 + random() * 1.4, y + 1 + random() * 2.2);
      context.stroke();
    }
  } else if (style.kind === "paper-craft") {
    for (let index = 0; index < 240; index++) {
      const shade = Math.round(174 + random() * 60);
      context.fillStyle = `rgba(${shade},${shade - 4},${shade - 9},${0.04 + strength * 0.12})`;
      const size = 0.3 + random() * 1.2;
      context.fillRect(random() * 64, random() * 64, size, size * 0.45);
    }
  } else {
    context.strokeStyle = `rgba(65,62,83,${0.025 + strength * 0.06})`;
    context.lineWidth = 0.5;
    for (let offset = -64; offset < 128; offset += 7) {
      context.beginPath();
      context.moveTo(offset, 0);
      context.lineTo(offset + 64, 64);
      context.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.5, 2.5);
  return texture;
}

function color(object: TopiaObjectConfig, index: number, value: number) {
  return object.colors?.[index] ?? value;
}

function parameter(object: TopiaObjectConfig, key: string, value: number) {
  const candidate = Number(object.params?.[key]);
  return Number.isFinite(candidate) ? candidate : value;
}

function material(value: number, roughness = 0.82) {
  const style = activeRenderStyle;
  const properties = {
    color: value,
    roughness: style?.roughness ?? roughness,
    metalness: style?.metalness ?? 0.03,
    map: activeStyleTexture,
    flatShading:
      style?.kind !== "plush-toy" && style?.kind !== "glazed-ceramic",
  };
  if (style?.kind === "glazed-ceramic" || style?.kind === "crystal-diorama")
    return new THREE.MeshPhysicalMaterial({
      ...properties,
      clearcoat: style.kind === "glazed-ceramic" ? 0.82 : 0.45,
      clearcoatRoughness: style.kind === "glazed-ceramic" ? 0.16 : 0.08,
      sheen: style.kind === "glazed-ceramic" ? 0.18 : 0,
      iridescence: style.kind === "crystal-diorama" ? 0.32 : 0,
    });
  return new THREE.MeshStandardMaterial(properties);
}

function mesh(geometry: THREE.BufferGeometry, value: number) {
  const result = new THREE.Mesh(geometry, material(value));
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}

function glowing(geometry: THREE.BufferGeometry, value: number) {
  const style = activeRenderStyle;
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: value,
      emissive: value,
      emissiveIntensity: 1.6,
      roughness: Math.min(style?.roughness ?? 0.35, 0.55),
      metalness: style?.metalness ?? 0,
      flatShading: style?.kind !== "plush-toy",
    }),
  );
}

function block(
  width: number,
  height: number,
  depth: number,
  value: number,
  x = 0,
  y = 0,
  z = 0,
) {
  const result = mesh(new THREE.BoxGeometry(width, height, depth), value);
  result.position.set(x, y, z);
  return result;
}

function lowPolyCloud(value: number) {
  const group = new THREE.Group();
  [
    [-0.55, 0, 0, 0.65],
    [0, 0.12, 0, 0.82],
    [0.62, -0.03, 0.03, 0.56],
    [0.1, -0.16, 0.08, 0.72],
  ].forEach(([x, y, z, scale]) => {
    const puff = mesh(new THREE.IcosahedronGeometry(0.75, 1), value);
    puff.position.set(x, y, z);
    puff.scale.set(scale, scale * 0.72, scale);
    group.add(puff);
  });
  return group;
}

function plant(object: TopiaObjectConfig) {
  const group = new THREE.Group();
  const pot = mesh(
    new THREE.CylinderGeometry(0.28, 0.22, 0.35, 6),
    color(object, 0, fallback.coral),
  );
  pot.position.y = 0.18;
  group.add(pot);
  [
    [-0.13, 0.52, 0, -0.42],
    [0.13, 0.57, 0.03, 0.38],
    [0, 0.69, -0.05, 0.05],
  ].forEach(([x, y, z, rotation]) => {
    const leaf = mesh(
      new THREE.IcosahedronGeometry(0.24, 1),
      color(object, 1, fallback.mint),
    );
    leaf.scale.set(0.6, 1, 0.45);
    leaf.position.set(x, y, z);
    leaf.rotation.z = rotation;
    group.add(leaf);
  });
  return group;
}

function fantasySky(
  look: MoodLook,
  paletteMix: number,
  generated?: TopiaSkyConfig,
) {
  const neutral = moodLooks.neutral;
  const identity = generated ?? {
    theme: "cloud-dream",
    motifs: ["aurora-ribbon", "star-dust"],
    celestialShape: "ringed-orb",
    decorationDensity: 0.55,
    drift: 0.4,
    top: neutral.skyTop,
    mid: neutral.skyMid,
    low: neutral.skyLow,
    aurora: neutral.aurora,
    celestial: neutral.celestial,
    stars: neutral.stars,
    fog: neutral.fog,
    magic: 0.72,
  };
  const identityBlend = (base: number, generatedColor: number) =>
    new THREE.Color(base).lerp(new THREE.Color(generatedColor), 0.48);
  const blend = (base: number, target: number) =>
    identityBlend(base, generated ? generatedColor(base, identity) : base).lerp(
      new THREE.Color(target),
      paletteMix * 0.72,
    );
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uMagic: { value: identity.magic * (0.72 + paletteMix * 0.28) },
      uTop: { value: blend(neutral.skyTop, look.skyTop) },
      uMid: { value: blend(neutral.skyMid, look.skyMid) },
      uLow: { value: blend(neutral.skyLow, look.skyLow) },
      uAurora: { value: blend(neutral.aurora, look.aurora) },
    },
    vertexShader: `varying vec3 vDirection;varying vec2 vScreen;
      void main(){vDirection=normalize(position);vec4 clip=projectionMatrix*modelViewMatrix*vec4(position,1.0);vScreen=clip.xy/clip.w;gl_Position=clip;}`,
    fragmentShader: `precision highp float;
      varying vec3 vDirection;varying vec2 vScreen;
      uniform float uTime;uniform float uMagic;
      uniform vec3 uTop;uniform vec3 uMid;uniform vec3 uLow;uniform vec3 uAurora;
      void main(){
        vec3 direction=normalize(vDirection);
        float height=clamp(vScreen.y*.5+.5,0.0,1.0);
        vec3 color=mix(uLow,uMid,smoothstep(.08,.53,height));
        color=mix(color,uTop,smoothstep(.52,.96,height));
        float longitude=atan(direction.z,direction.x);
        float waves=sin(vScreen.x*5.2+vScreen.y*7.4+longitude+uTime*.085)+sin(vScreen.x*9.1-uTime*.052)*.34;
        float ribbon=pow(clamp(waves*.5+.5,0.0,1.0),5.0);
        float veil=smoothstep(.28,.48,height)*(1.0-smoothstep(.86,1.0,height));
        color+=uAurora*ribbon*veil*(.18+uMagic*.28);
        color+=uAurora*(1.0-smoothstep(.0,.22,abs(height-.43)))*.075*uMagic;
        gl_FragColor=vec4(color,1.0);
      }`,
  });
  const group = new THREE.Group();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(46, 32, 20),
    skyMaterial,
  );
  dome.renderOrder = -10;
  group.add(dome);

  const count = Math.round(90 + identity.decorationDensity * 150);
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) {
    const y = -0.08 + (index / (count - 1)) * 1.04;
    const radial = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = index * 2.399963;
    positions[index * 3] = Math.cos(angle) * radial * 38;
    positions[index * 3 + 1] = y * 38;
    positions[index * 3 + 2] = Math.sin(angle) * radial * 38;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );
  const stars = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({
      color: blend(neutral.stars, look.stars),
      size: 0.16,
      transparent: true,
      opacity: THREE.MathUtils.lerp(0.5, look.sparkleOpacity, paletteMix),
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  group.add(stars);

  const celestial = new THREE.Group();
  const orbColor = blend(neutral.celestial, look.celestial);
  celestial.add(
    new THREE.Mesh(
      new THREE.CircleGeometry(1.55, 32),
      new THREE.MeshBasicMaterial({
        color: orbColor,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    ),
  );
  const orbGeometry =
    identity.celestialShape === "prism"
      ? new THREE.CircleGeometry(0.82, 6)
      : identity.celestialShape === "lantern-sun"
        ? new THREE.CircleGeometry(0.78, 12)
        : new THREE.CircleGeometry(0.76, 32);
  const orb = new THREE.Mesh(
    orbGeometry,
    new THREE.MeshBasicMaterial({
      color: orbColor,
      transparent: true,
      opacity: 0.92,
    }),
  );
  orb.position.z = 0.05;
  celestial.add(orb);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.18, 0.035, 8, 48),
    new THREE.MeshBasicMaterial({
      color: blend(neutral.aurora, look.aurora),
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  ring.position.z = 0.08;
  ring.rotation.z = -0.28;
  celestial.add(ring);
  if (identity.celestialShape === "twin-moons") {
    const twin = orb.clone();
    twin.scale.setScalar(0.56);
    twin.position.set(1.08, -0.45, 0.06);
    celestial.add(twin);
  }
  if (identity.celestialShape === "crescent") {
    const mask = new THREE.Mesh(
      new THREE.CircleGeometry(0.62, 32),
      new THREE.MeshBasicMaterial({
        color: identityBlend(identity.mid, look.skyMid),
      }),
    );
    mask.position.set(0.27, 0.18, 0.09);
    celestial.add(mask);
  }
  const motifGroup = new THREE.Group();
  identity.motifs.slice(0, 5).forEach((motif, motifIndex) => {
    const motifColor = blend(identity.aurora, look.aurora);
    for (let index = 0; index < 5; index++) {
      const angle = motifIndex * 1.7 + index * 1.19;
      const radius = 18 + motifIndex * 2.2 + index;
      const shape =
        motif.includes("petal") || motif.includes("bird")
          ? new THREE.ConeGeometry(0.18, 0.55, 3)
          : motif.includes("crystal")
            ? new THREE.OctahedronGeometry(0.28, 0)
            : new THREE.IcosahedronGeometry(0.22, 0);
      const item = new THREE.Mesh(
        shape,
        new THREE.MeshBasicMaterial({
          color: motifColor,
          transparent: true,
          opacity: 0.34 + identity.decorationDensity * 0.4,
        }),
      );
      item.position.set(
        Math.cos(angle) * radius,
        4 + ((index * 5 + motifIndex) % 12),
        Math.sin(angle) * radius,
      );
      item.rotation.z = angle;
      motifGroup.add(item);
    }
  });
  group.add(motifGroup);
  return {
    group,
    skyMaterial,
    stars,
    celestial,
    ring,
    motifGroup,
    drift: identity.drift,
  };
}

function generatedColor(base: number, sky: TopiaSkyConfig) {
  if (base === moodLooks.neutral.skyTop) return sky.top;
  if (base === moodLooks.neutral.skyMid) return sky.mid;
  if (base === moodLooks.neutral.skyLow) return sky.low;
  if (base === moodLooks.neutral.aurora) return sky.aurora;
  if (base === moodLooks.neutral.celestial) return sky.celestial;
  if (base === moodLooks.neutral.stars) return sky.stars;
  return base;
}

function createMoodRain(count: number, color: number) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) {
    positions[index * 3] = ((index * 37) % 100) / 8 - 6.25;
    positions[index * 3 + 1] = ((index * 53) % 100) / 9 - 2;
    positions[index * 3 + 2] = ((index * 71) % 100) / 8 - 6.25;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return {
    geometry,
    points: new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color,
        size: 0.045,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
      }),
    ),
  };
}

function cropPlant(kind: TopiaCropKind, progress: number) {
  const group = new THREE.Group();
  const growth = THREE.MathUtils.clamp(progress / 100, 0, 1);
  const stemHeight = 0.18 + growth * 1.22;
  const stem = mesh(
    new THREE.CylinderGeometry(0.055, 0.075, stemHeight, 6),
    0x439663,
  );
  stem.position.y = 0.14 + stemHeight / 2;
  group.add(stem);
  for (let index = 0; index < Math.max(1, Math.ceil(growth * 4)); index++) {
    const leaf = mesh(new THREE.IcosahedronGeometry(0.18, 1), fallback.mint);
    leaf.scale.set(1, 0.42, 0.58);
    leaf.position.set(
      (index % 2 ? 1 : -1) * (0.11 + growth * 0.13),
      0.3 + (index / 4) * stemHeight * 0.72,
      index % 2 ? 0.05 : -0.05,
    );
    leaf.rotation.z = (index % 2 ? -1 : 1) * 0.45;
    group.add(leaf);
  }
  if (growth > 0.16) {
    const cropColors: Record<TopiaCropKind, number> = {
      sunflower: fallback.yellow,
      tomato: fallback.coral,
      lavender: fallback.lavender,
      pumpkin: 0xffa345,
      herb: fallback.mint,
    };
    const fruit = glowing(
      kind === "pumpkin"
        ? new THREE.SphereGeometry(0.3 + growth * 0.12, 8, 6)
        : kind === "lavender"
          ? new THREE.ConeGeometry(0.18, 0.48, 7)
          : new THREE.IcosahedronGeometry(0.2 + growth * 0.15, 1),
      cropColors[kind],
    );
    fruit.position.y = 0.2 + stemHeight;
    group.add(fruit);
  }
  return { group, anchorHeight: 0.42 + stemHeight };
}

function buildPrefab(
  object: TopiaObjectConfig,
  crops: Map<string, TopiaSceneCrop>,
) {
  const group = new THREE.Group();
  let anchorHeight = 0;
  switch (object.prefab) {
    case "floating-island": {
      const radius = parameter(object, "radius", 3.25);
      const depth = parameter(object, "depth", 2.05);
      const grass = mesh(
        new THREE.CylinderGeometry(radius, radius * 0.9, 0.28, 10),
        color(object, 0, 0x80c989),
      );
      grass.position.y = 0.02;
      const rock = mesh(
        new THREE.ConeGeometry(radius * 0.92, depth, 10),
        color(object, 1, 0x75657f),
      );
      rock.position.y = -depth / 2 - 0.1;
      const underside = mesh(
        new THREE.ConeGeometry(radius * 0.52, depth * 0.82, 7),
        color(object, 2, 0x4f536e),
      );
      underside.position.y = -depth * 0.92;
      group.add(grass, rock, underside);
      anchorHeight = 0.6;
      break;
    }
    case "block":
      group.add(
        block(
          parameter(object, "width", 1),
          parameter(object, "height", 1),
          parameter(object, "depth", 1),
          color(object, 0, fallback.wall),
        ),
      );
      break;
    case "cone":
      group.add(
        mesh(
          new THREE.ConeGeometry(
            parameter(object, "radius", 1),
            parameter(object, "height", 1),
            Math.round(parameter(object, "segments", 6)),
          ),
          color(object, 0, fallback.blue),
        ),
      );
      break;
    case "cylinder":
      group.add(
        mesh(
          new THREE.CylinderGeometry(
            parameter(object, "radiusTop", 0.5),
            parameter(object, "radiusBottom", 0.5),
            parameter(object, "height", 1),
            Math.round(parameter(object, "segments", 8)),
          ),
          color(object, 0, fallback.wall),
        ),
      );
      break;
    case "door": {
      group.add(block(0.7, 1.3, 0.14, color(object, 0, fallback.woodDark)));
      const knob = glowing(
        new THREE.CircleGeometry(0.07, 14),
        color(object, 1, fallback.yellow),
      );
      knob.position.set(0.21, 0, 0.09);
      group.add(
        knob,
        block(1, 0.16, 0.58, color(object, 2, fallback.wood), 0, -0.75, 0.28),
      );
      break;
    }
    case "round-window": {
      const radius = parameter(object, "radius", 0.46);
      group.add(
        glowing(
          new THREE.CircleGeometry(radius, 18),
          color(object, 0, fallback.sky),
        ),
      );
      const rim = mesh(
        new THREE.TorusGeometry(radius + 0.05, 0.065, 7, 20),
        color(object, 1, fallback.wood),
      );
      rim.position.z = 0.035;
      group.add(
        rim,
        block(
          0.07,
          radius * 2,
          0.06,
          color(object, 1, fallback.wood),
          0,
          0,
          0.08,
        ),
        block(
          radius * 2,
          0.07,
          0.06,
          color(object, 1, fallback.wood),
          0,
          0,
          0.08,
        ),
      );
      break;
    }
    case "tower": {
      const radius = parameter(object, "radius", 0.66);
      const height = parameter(object, "height", 2.12);
      const body = mesh(
        new THREE.CylinderGeometry(radius * 0.94, radius, height, 8),
        color(object, 0, fallback.cream),
      );
      body.position.y = height / 2;
      const roof = mesh(
        new THREE.ConeGeometry(radius * 1.42, height * 0.48, 8),
        color(object, 1, fallback.coral),
      );
      roof.position.y = height + height * 0.24;
      group.add(body, roof);
      anchorHeight = height;
      break;
    }
    case "sail": {
      group.add(
        block(
          0.08,
          2.2,
          0.08,
          color(object, 2, fallback.woodDark),
          0,
          -0.45,
          0,
        ),
      );
      const sail = mesh(
        new THREE.ConeGeometry(0.62, 1.55, 3),
        color(object, 0, fallback.mint),
      );
      sail.rotation.z = Math.PI / 2;
      sail.position.set(-0.2, 0, 0);
      const prism = glowing(
        new THREE.OctahedronGeometry(0.27, 0),
        color(object, 1, fallback.coral),
      );
      prism.position.y = 0.76;
      group.add(sail, prism);
      anchorHeight = 0.72;
      break;
    }
    case "wind-chimes": {
      const pieces = Math.max(2, Math.round(parameter(object, "pieces", 3)));
      group.add(
        block(0.78, 0.07, 0.07, color(object, 0, fallback.wood), 0, 0.52, 0),
      );
      for (let index = 0; index < pieces; index++) {
        const x = (index - (pieces - 1) / 2) * 0.25;
        group.add(
          block(
            0.025,
            0.48 + index * 0.06,
            0.025,
            color(object, 3, fallback.ink),
            x,
            0.22,
            0,
          ),
        );
        const leaf = glowing(
          new THREE.OctahedronGeometry(0.13 + index * 0.012, 0),
          color(object, index % 2 ? 2 : 1, fallback.yellow),
        );
        leaf.position.set(x, -0.12 - index * 0.05, 0);
        group.add(leaf);
      }
      anchorHeight = 0.42;
      break;
    }
    case "observatory": {
      const dome = mesh(
        new THREE.SphereGeometry(0.48, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2),
        color(object, 0, fallback.lavender),
      );
      dome.rotation.x = -Math.PI / 2;
      group.add(dome);
      break;
    }
    case "crystal": {
      const crystal = glowing(
        new THREE.OctahedronGeometry(0.22, 0),
        color(object, 0, fallback.coral),
      );
      crystal.scale.y = 1.6;
      group.add(crystal);
      anchorHeight = 0.3;
      break;
    }
    case "cloud":
      group.add(lowPolyCloud(color(object, 0, fallback.cloud)));
      break;
    case "room-shell": {
      group.add(
        mesh(
          new THREE.CylinderGeometry(3.65, 3.35, 0.42, 10),
          color(object, 3, fallback.woodDark),
        ),
        block(6.25, 0.2, 4.35, color(object, 0, fallback.cream), 0, 0.28, 0),
        block(
          6.25,
          3.25,
          0.16,
          color(object, 1, fallback.wall),
          0,
          1.89,
          -2.12,
        ),
        block(
          0.16,
          3.25,
          4.25,
          color(object, 1, fallback.wall),
          -3.04,
          1.89,
          0,
        ),
      );
      group.children[0].position.y = -0.08;
      break;
    }
    case "sky-window": {
      const pane = glowing(
        new THREE.PlaneGeometry(2.4, 1.35),
        color(object, 0, fallback.sky),
      );
      group.add(
        pane,
        block(2.62, 0.1, 0.08, color(object, 1, fallback.ink), 0, 0.71, 0.05),
        block(2.62, 0.1, 0.08, color(object, 1, fallback.ink), 0, -0.71, 0.05),
        block(0.1, 1.5, 0.08, color(object, 1, fallback.ink), -1.33, 0, 0.05),
        block(0.1, 1.5, 0.08, color(object, 1, fallback.ink), 1.33, 0, 0.05),
      );
      break;
    }
    case "bed":
      group.add(
        block(2.2, 0.38, 1.35, color(object, 0, fallback.woodDark)),
        block(2.05, 0.25, 1.2, color(object, 1, fallback.cream), 0, 0.31, 0),
        block(1.12, 0.1, 1.22, color(object, 2, fallback.blue), 0.42, 0.49, 0),
        block(
          0.55,
          0.16,
          0.78,
          color(object, 3, fallback.lavender),
          -0.72,
          0.48,
          0,
        ),
      );
      anchorHeight = 0.55;
      break;
    case "nightstand": {
      group.add(block(0.48, 0.45, 0.48, color(object, 0, fallback.wood)));
      const light = glowing(
        new THREE.OctahedronGeometry(0.2, 0),
        color(object, 1, fallback.yellow),
      );
      light.position.y = 0.5;
      group.add(light);
      break;
    }
    case "desk": {
      group.add(
        block(1.85, 0.16, 0.82, color(object, 0, fallback.wood)),
        block(
          0.13,
          0.93,
          0.13,
          color(object, 1, fallback.woodDark),
          -0.76,
          -0.5,
          -0.2,
        ),
        block(
          0.13,
          0.93,
          0.13,
          color(object, 1, fallback.woodDark),
          0.76,
          -0.5,
          -0.2,
        ),
      );
      const map = glowing(
        new THREE.CircleGeometry(0.55, 6),
        color(object, 2, fallback.blue),
      );
      map.rotation.x = -Math.PI / 2;
      map.position.y = 0.1;
      group.add(map);
      anchorHeight = 0.4;
      break;
    }
    case "chair":
      group.add(
        block(0.72, 0.1, 0.48, color(object, 0, fallback.woodDark), 0, 0.27, 0),
        block(0.1, 0.52, 0.1, color(object, 1, fallback.wood), -0.27, 0, 0),
        block(0.1, 0.52, 0.1, color(object, 1, fallback.wood), 0.27, 0, 0),
      );
      break;
    case "shelf": {
      group.add(block(0.35, 2.25, 1.35, color(object, 0, fallback.wood)));
      [-0.58, 0, 0.58].forEach((y) =>
        group.add(
          block(
            0.42,
            0.09,
            1.24,
            color(object, 1, fallback.woodDark),
            0.2,
            y,
            0,
          ),
        ),
      );
      [
        color(object, 2, fallback.coral),
        color(object, 3, fallback.blue),
        fallback.yellow,
        fallback.mint,
      ].forEach((value, index) =>
        group.add(
          block(
            0.19,
            0.42,
            0.22,
            value,
            0.24,
            -0.7 + (index % 2) * 0.62,
            -0.4 + index * 0.27,
          ),
        ),
      );
      anchorHeight = 0.35;
      break;
    }
    case "plant":
      group.add(plant(object));
      anchorHeight = 0.75;
      break;
    case "hearth": {
      group.add(
        block(1.05, 0.95, 0.48, color(object, 0, fallback.woodDark)),
        block(
          0.65,
          0.57,
          0.05,
          color(object, 1, fallback.ink),
          0,
          -0.04,
          -0.26,
        ),
      );
      const fire = glowing(
        new THREE.ConeGeometry(0.23, 0.5, 5),
        color(object, 2, fallback.yellow),
      );
      fire.position.set(0, -0.04, -0.3);
      group.add(fire);
      break;
    }
    case "rug": {
      const rug = mesh(
        new THREE.CircleGeometry(1, 12),
        color(object, 0, fallback.lavender),
      );
      rug.rotation.x = -Math.PI / 2;
      group.add(rug);
      break;
    }
    case "lantern": {
      group.add(
        block(
          0.08,
          1.15,
          0.08,
          color(object, 1, fallback.woodDark),
          0,
          0.58,
          0,
        ),
      );
      const lantern = glowing(
        new THREE.IcosahedronGeometry(0.28, 1),
        color(object, 0, fallback.yellow),
      );
      group.add(
        lantern,
        new THREE.PointLight(color(object, 0, fallback.yellow), 2.6, 5),
      );
      break;
    }
    case "propeller": {
      const hub = mesh(
        new THREE.CylinderGeometry(0.25, 0.25, 0.36, 8),
        color(object, 0, fallback.yellow),
      );
      hub.rotation.z = Math.PI / 2;
      group.add(hub, block(0.12, 1.35, 0.25, color(object, 1, fallback.blue)));
      const blade = block(0.12, 1.35, 0.25, color(object, 1, fallback.blue));
      blade.rotation.x = Math.PI / 2;
      group.add(blade);
      break;
    }
    case "path":
      group.add(
        block(
          parameter(object, "width", 4),
          0.08,
          parameter(object, "depth", 0.45),
          color(object, 0, fallback.cream),
        ),
      );
      break;
    case "crop-plot": {
      const crop = object.taskId ? crops.get(object.taskId) : undefined;
      const soil = color(object, 0, 0x76513f);
      const border =
        crop?.progress === 100
          ? fallback.yellow
          : color(object, 1, fallback.wood);
      group.add(
        block(1.38, 0.16, 1.18, soil),
        block(1.5, 0.12, 0.08, border, 0, 0.06, -0.64),
        block(1.5, 0.12, 0.08, border, 0, 0.06, 0.64),
        block(0.08, 0.12, 1.2, border, -0.75, 0.06, 0),
        block(0.08, 0.12, 1.2, border, 0.75, 0.06, 0),
      );
      if (crop) {
        const result = cropPlant(crop.crop, crop.progress);
        result.group.position.y = 0.14;
        group.add(result.group);
        anchorHeight = result.anchorHeight;
      }
      break;
    }
    case "farm-shed": {
      group.add(
        block(1.25, 1.3, 0.9, color(object, 0, fallback.wall), 0, 0.65, 0),
      );
      const roof = mesh(
        new THREE.ConeGeometry(0.98, 0.75, 4),
        color(object, 1, fallback.coral),
      );
      roof.position.y = 1.62;
      roof.rotation.y = Math.PI / 4;
      group.add(roof);
      break;
    }
    case "watering-orb": {
      group.add(
        glowing(
          new THREE.SphereGeometry(0.27, 10, 7),
          color(object, 0, fallback.sky),
        ),
      );
      for (let index = 0; index < 6; index++) {
        const drop = glowing(
          new THREE.OctahedronGeometry(0.07, 0),
          color(object, 0, fallback.sky),
        );
        drop.position.set(
          -0.45 + (index % 3) * 0.35,
          -0.6 + Math.floor(index / 3) * 0.36,
          -0.35 + (index % 2) * 0.3,
        );
        group.add(drop);
      }
      break;
    }
  }
  return { group, anchorHeight };
}

function buildConfiguredScene(
  config: TopiaSceneConfig,
  crops: TopiaSceneCrop[],
) {
  const world = new THREE.Group();
  const cropById = new Map(crops.map((crop) => [crop.id, crop]));
  for (const object of config.objects) {
    const built = buildPrefab(object, cropById);
    built.group.name = object.id;
    built.group.position.fromArray(object.position);
    if (object.rotation)
      built.group.rotation.fromArray([...object.rotation, "XYZ"]);
    if (object.scale) built.group.scale.fromArray(object.scale);
    if (object.anchorId) {
      const anchor = new THREE.Object3D();
      anchor.position.y = built.anchorHeight;
      anchor.userData.topiaAnchor = object.anchorId;
      built.group.add(anchor);
    }
    if (object.animation) {
      built.group.userData.animation = object.animation;
      built.group.userData.baseY = built.group.position.y;
      built.group.userData.baseRotationY = built.group.rotation.y;
      built.group.userData.baseRotationZ = built.group.rotation.z;
    }
    if (object.layer === "souvenir") {
      const glow = new THREE.PointLight(
        color(object, 0, fallback.yellow),
        1.15,
        2.8,
      );
      glow.position.set(0, 0.55, 0);
      glow.userData.topiaSouvenirGlow = true;
      built.group.add(glow);
      const point = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 8, 6),
        new THREE.MeshBasicMaterial({
          color: color(object, 0, fallback.yellow),
          transparent: true,
          opacity: 0.9,
        }),
      );
      point.position.set(0, 0.72, 0);
      point.userData.topiaSouvenirSpark = true;
      built.group.add(point);
    }
    world.add(built.group);
  }
  return world;
}

export interface TopiaSceneOptions {
  location: TopiaLocation;
  crops: TopiaSceneCrop[];
  scene: TopiaSceneConfig;
  sky?: TopiaSkyConfig;
  renderStyle?: TopiaRenderStyleConfig;
  onThumbnail?: (thumbnail: string) => void;
}

export function mountTopiaScene(
  canvas: HTMLCanvasElement,
  mood: MoodKind = "neutral",
  intensity = 0,
  options: TopiaSceneOptions,
) {
  const container = canvas.parentElement;
  if (!container) return () => undefined;
  const look = moodLooks[mood] ?? moodLooks.neutral;
  activeRenderStyle = options.renderStyle;
  activeStyleTexture = styleTexture(options.renderStyle);
  const mix = THREE.MathUtils.clamp(intensity / 100, 0, 1);
  const paletteMix = mood === "neutral" ? 1 : 0.45 + mix * 0.55;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: Boolean(options.onThumbnail),
      powerPreference: "high-performance",
    });
  } catch {
    return () => undefined;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = THREE.MathUtils.lerp(1.12, look.exposure, mix);
  if (options.renderStyle) {
    canvas.dataset.topiaRenderStyle = options.renderStyle.kind;
    canvas.style.filter = `saturate(${options.renderStyle.saturation}) contrast(${options.renderStyle.contrast})`;
  }

  const scene = new THREE.Scene();
  const generatedFog = options.sky
    ? new THREE.Color(look.fog).lerp(new THREE.Color(options.sky.fog), 0.32)
    : new THREE.Color(look.fog);
  scene.fog = new THREE.FogExp2(
    generatedFog,
    THREE.MathUtils.lerp(0.018, look.fogDensity, mix),
  );
  const camera = new THREE.OrthographicCamera(-5, 5, 3, -3, 0.1, 100);
  const backdrop = fantasySky(look, paletteMix, options.sky);
  scene.add(backdrop.group);
  backdrop.celestial.position.set(3.5, 1.55, -32);
  camera.add(backdrop.celestial);
  scene.add(camera);
  scene.add(
    new THREE.HemisphereLight(
      look.sky,
      look.ground,
      THREE.MathUtils.lerp(3.2, 2.6, mix),
    ),
  );
  const sun = new THREE.DirectionalLight(
    look.sun,
    THREE.MathUtils.lerp(4, look.sunIntensity, mix),
  );
  sun.position.set(-5, 9, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

  const world = buildConfiguredScene(options.scene, options.crops);
  scene.add(world);

  const sparkleGeometry = new THREE.BufferGeometry();
  const sparklePositions = new Float32Array(42 * 3);
  const styleSeed = options.renderStyle?.seed ?? 1;
  for (let index = 0; index < 42; index++) {
    const angle = index * 2.39996 + (styleSeed % 997) * 0.001;
    const radius = 3.7 + (index % 7) * 0.38;
    sparklePositions[index * 3] = Math.cos(angle) * radius;
    sparklePositions[index * 3 + 1] = -0.4 + (index % 9) * 0.56;
    sparklePositions[index * 3 + 2] = Math.sin(angle) * radius;
  }
  sparkleGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(sparklePositions, 3),
  );
  const sparkles = new THREE.Points(
    sparkleGeometry,
    new THREE.PointsMaterial({
      color: look.sparkle,
      size: 0.075,
      transparent: true,
      opacity: THREE.MathUtils.lerp(0.78, look.sparkleOpacity, mix),
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  scene.add(sparkles);
  const rain =
    mood === "sad" || mood === "anxious"
      ? createMoodRain(mood === "sad" ? 110 : 55, look.sparkle)
      : null;
  if (rain) scene.add(rain.points);
  const ambientGlow = new THREE.PointLight(look.glow, 1.1, 11);
  ambientGlow.position.set(0, 2.2, 1.5);
  scene.add(ambientGlow);
  container.classList.add("webgl-ready");

  const anchorBindings: Array<{
    anchor: THREE.Object3D;
    element: HTMLElement;
  }> = [];
  world.traverse((object) => {
    const anchorId = object.userData.topiaAnchor as string | undefined;
    if (!anchorId) return;
    const element = container.querySelector<HTMLElement>(
      `[data-topia-anchor="${anchorId}"]`,
    );
    if (element) {
      element.dataset.topiaAnchorBound = "true";
      anchorBindings.push({ anchor: object, element });
    }
  });
  const projectedAnchor = new THREE.Vector3();
  let labelsRevealed = false;
  const syncAnchors = () => {
    if (camera.zoom >= 1.18) labelsRevealed = true;
    else if (camera.zoom <= 1.08) labelsRevealed = false;
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    for (const { anchor, element } of anchorBindings) {
      anchor.getWorldPosition(projectedAnchor).project(camera);
      const visible =
        projectedAnchor.z > -1 &&
        projectedAnchor.z < 1 &&
        Math.abs(projectedAnchor.x) < 1.12 &&
        Math.abs(projectedAnchor.y) < 1.12;
      element.style.left = `${(projectedAnchor.x * 0.5 + 0.5) * 100}%`;
      element.style.top = `${(-projectedAnchor.y * 0.5 + 0.5) * 100}%`;
      element.classList.toggle("topia-anchor-hidden", !visible);
      if (element.classList.contains("topia-landmark")) {
        element.classList.toggle(
          "topia-anchor-visible",
          visible && labelsRevealed,
        );
        element.classList.toggle(
          "topia-anchor-collapsed",
          visible && !labelsRevealed,
        );
      }
    }
  };

  let frame = 0;
  let renderedFrames = 0;
  let thumbnailCaptured = false;
  let disposed = false;
  let targetYaw = options.scene.camera.yaw;
  let currentYaw = targetYaw;
  let targetPitch = options.scene.camera.pitch;
  let currentPitch = targetPitch;
  const pointers = new Map<number, { x: number; y: number }>();
  let lastX = 0;
  let lastY = 0;
  let pinchDistance = 0;
  let pinchZoom = 1;
  const resize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    renderer.setSize(width, height, false);
    const aspect = width / Math.max(1, height);
    const view = 4.05;
    camera.left = -view * aspect;
    camera.right = view * aspect;
    camera.top = view;
    camera.bottom = -view;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  const distance = () => {
    const values = [...pointers.values()];
    return values.length < 2
      ? 0
      : Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
  };
  const down = (event: PointerEvent) => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.setPointerCapture(event.pointerId);
    if (pointers.size === 1) {
      lastX = event.clientX;
      lastY = event.clientY;
    } else if (pointers.size === 2) {
      pinchDistance = distance();
      pinchZoom = camera.zoom;
    }
  };
  const move = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      targetYaw -= (event.clientX - lastX) * 0.008;
      targetPitch = THREE.MathUtils.clamp(
        targetPitch + (event.clientY - lastY) * 0.006,
        0.18,
        1.08,
      );
      lastX = event.clientX;
      lastY = event.clientY;
    } else if (pointers.size === 2 && pinchDistance > 0) {
      camera.zoom = THREE.MathUtils.clamp(
        (pinchZoom * distance()) / pinchDistance,
        0.78,
        1.65,
      );
      camera.updateProjectionMatrix();
    }
  };
  const up = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (pointers.size === 1) {
      const remaining = [...pointers.values()][0];
      lastX = remaining.x;
      lastY = remaining.y;
    }
  };
  const wheel = (event: WheelEvent) => {
    event.preventDefault();
    camera.zoom = THREE.MathUtils.clamp(
      camera.zoom - event.deltaY * 0.0008,
      0.78,
      1.65,
    );
    camera.updateProjectionMatrix();
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", wheel, { passive: false });

  const animate = () => {
    if (disposed) return;
    const now = performance.now();
    currentYaw += (targetYaw - currentYaw) * 0.09;
    currentPitch += (targetPitch - currentPitch) * 0.09;
    const radius = 9.5;
    const flat = radius * Math.cos(currentPitch);
    camera.position.set(
      Math.sin(currentYaw) * flat,
      1 + Math.sin(currentPitch) * radius,
      Math.cos(currentYaw) * flat,
    );
    camera.lookAt(0, 1, 0);
    backdrop.skyMaterial.uniforms.uTime.value = now * 0.001;
    backdrop.stars.rotation.y =
      now *
      (0.000006 + backdrop.drift * 0.000025) *
      (mood === "anxious" ? 2.2 : 1);
    backdrop.motifGroup.rotation.y =
      now *
      (0.000004 + backdrop.drift * 0.000018) *
      (mood === "anxious" ? 2.4 : 1);
    backdrop.ring.rotation.z = -0.28 + now * 0.000035;
    backdrop.celestial.scale.setScalar(1 + Math.sin(now * 0.0007) * 0.035);
    world.position.y = Math.sin(now * 0.00055) * 0.05;
    world.traverse((object) => {
      if (object.userData.animation === "spin")
        object.rotation.y = object.userData.baseRotationY + now * 0.00035;
      if (object.userData.animation === "sway")
        object.rotation.z =
          object.userData.baseRotationZ + Math.sin(now * 0.0012) * 0.045;
      if (object.userData.animation === "float")
        object.position.y =
          object.userData.baseY + Math.sin(now * 0.001 + object.id) * 0.12;
      if (object.userData.animation === "sparkle") {
        object.traverse((child) => {
          if (
            child.userData.topiaSouvenirGlow &&
            child instanceof THREE.PointLight
          ) {
            child.intensity =
              0.8 + (Math.sin(now * 0.004 + child.id) + 1) * 0.55;
          }
          if (
            child.userData.topiaSouvenirSpark &&
            child instanceof THREE.Mesh
          ) {
            const pulse = 0.72 + (Math.sin(now * 0.0048 + child.id) + 1) * 0.42;
            child.scale.setScalar(pulse);
          }
        });
      }
    });
    sparkles.rotation.y = now * 0.000045;
    sparkles.position.y = Math.sin(now * 0.0007) * 0.08;
    ambientGlow.intensity =
      1.05 + Math.sin(now * (mood === "angry" ? 0.004 : 0.0011)) * 0.24;
    if (rain) {
      const positions = rain.geometry.getAttribute(
        "position",
      ) as THREE.BufferAttribute;
      for (let index = 0; index < positions.count; index++) {
        const y = positions.getY(index) - (mood === "sad" ? 0.055 : 0.09);
        positions.setY(index, y < -2 ? 8 + (index % 5) : y);
      }
      positions.needsUpdate = true;
    }
    syncAnchors();
    renderer.render(scene, camera);
    renderedFrames += 1;
    if (!thumbnailCaptured && renderedFrames >= 3 && options.onThumbnail) {
      thumbnailCaptured = true;
      const thumbnail = document.createElement("canvas");
      thumbnail.width = 320;
      thumbnail.height = 180;
      const context = thumbnail.getContext("2d");
      if (context) {
        context.drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height);
        options.onThumbnail(thumbnail.toDataURL("image/jpeg", 0.76));
      }
    }
    frame = requestAnimationFrame(animate);
  };
  animate();

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    canvas.removeEventListener("pointerdown", down);
    canvas.removeEventListener("pointermove", move);
    canvas.removeEventListener("pointerup", up);
    canvas.removeEventListener("pointercancel", up);
    canvas.removeEventListener("wheel", wheel);
    anchorBindings.forEach(({ element }) => {
      delete element.dataset.topiaAnchorBound;
      element.classList.remove(
        "topia-anchor-hidden",
        "topia-anchor-visible",
        "topia-anchor-collapsed",
      );
    });
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((item) => item.dispose());
      }
    });
    renderer.dispose();
    activeStyleTexture?.dispose();
    activeStyleTexture = undefined;
    activeRenderStyle = undefined;
    canvas.style.filter = "";
    delete canvas.dataset.topiaRenderStyle;
    container.classList.remove("webgl-ready");
  };
}
