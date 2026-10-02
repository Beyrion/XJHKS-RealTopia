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

function stringParameter(
  object: TopiaObjectConfig,
  key: string,
  value: string,
) {
  const candidate = object.params?.[key];
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : value;
}

function tint(value: number, lightness: number) {
  return new THREE.Color(value).offsetHSL(0, 0, lightness).getHex();
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

export function gabledRoofGeometry(radius: number, height: number) {
  const halfHeight = height / 2;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -radius,
        -halfHeight,
        -radius,
        -radius,
        -halfHeight,
        radius,
        -radius,
        halfHeight,
        0,
        radius,
        -halfHeight,
        -radius,
        radius,
        -halfHeight,
        radius,
        radius,
        halfHeight,
        0,
      ],
      3,
    ),
  );
  geometry.setIndex([
    0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3,
  ]);
  geometry.computeVertexNormals();
  return geometry;
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
  if (parameter(object, "tree", 0) > 0.5) {
    const trunkColor = color(object, 0, fallback.woodDark);
    const leafColor = color(object, 1, fallback.mint);
    const trunk = mesh(
      new THREE.CylinderGeometry(0.14, 0.24, 1.45, 8),
      trunkColor,
    );
    trunk.position.y = 0.72;
    group.add(trunk);
    [
      [-0.28, 1.16, 0, -0.72],
      [0.3, 1.28, 0.03, 0.68],
    ].forEach(([x, y, z, rotation]) => {
      const branch = mesh(
        new THREE.CylinderGeometry(0.055, 0.08, 0.68, 7),
        trunkColor,
      );
      branch.position.set(x, y, z);
      branch.rotation.z = rotation;
      group.add(branch);
    });
    [
      [-0.58, 1.48, 0.02, 0.62],
      [0, 1.78, -0.08, 0.76],
      [0.6, 1.54, 0.04, 0.64],
      [-0.28, 1.88, 0.12, 0.54],
      [0.35, 1.94, -0.12, 0.56],
    ].forEach(([x, y, z, scale], index) => {
      const crown = mesh(
        new THREE.IcosahedronGeometry(scale, 1),
        tint(leafColor, index % 2 ? 0.035 : -0.025),
      );
      crown.position.set(x, y, z);
      crown.scale.set(1.05, 0.82, 0.88);
      group.add(crown);
    });
    return group;
  }
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

function souvenirKind(object: TopiaObjectConfig) {
  const configured = object.params?.souvenirKind;
  if (typeof configured === "string") return configured;
  if (object.prefab === "wind-chimes") return "constellation-badge";
  if (object.prefab === "observatory") return "star-compass";
  if (object.prefab === "lantern") return "sprout-lantern";
  if (object.prefab === "propeller") return "clockwork-bird";
  return "firefly-bottle";
}

function detailSphere(
  radius: number,
  value: number,
  x: number,
  y: number,
  z: number,
  scale: [number, number, number] = [1, 1, 1],
  emits = false,
) {
  const result = emits
    ? glowing(new THREE.SphereGeometry(radius, 12, 8), value)
    : mesh(new THREE.SphereGeometry(radius, 12, 8), value);
  result.position.set(x, y, z);
  result.scale.set(...scale);
  return result;
}

function detailedSouvenir(object: TopiaObjectConfig) {
  const group = new THREE.Group();
  const primary = color(object, 0, fallback.coral);
  const secondary = color(object, 1, fallback.mint);
  const accent = color(object, 2, fallback.yellow);
  const dark = tint(primary, -0.28);
  const light = tint(secondary, 0.2);
  const base = mesh(
    new THREE.CylinderGeometry(0.42, 0.48, 0.11, 14),
    tint(dark, 0.1),
  );
  base.position.y = 0.055;
  const baseInset = mesh(
    new THREE.CylinderGeometry(0.35, 0.39, 0.04, 14),
    tint(primary, 0.12),
  );
  baseInset.position.y = 0.125;
  const baseRing = glowing(new THREE.TorusGeometry(0.36, 0.018, 5, 28), accent);
  baseRing.rotation.x = Math.PI / 2;
  baseRing.position.y = 0.15;
  group.add(base, baseInset, baseRing);

  const kind = souvenirKind(object);
  switch (kind) {
    case "moon-rabbit-doll": {
      group.add(
        detailSphere(0.25, light, 0, 0.48, 0, [0.86, 1.12, 0.78]),
        detailSphere(0.22, light, 0, 0.78, 0.015, [1, 0.92, 0.92]),
        detailSphere(0.12, primary, -0.2, 0.49, 0.04, [0.7, 1.15, 0.68]),
        detailSphere(0.12, primary, 0.2, 0.49, 0.04, [0.7, 1.15, 0.68]),
        detailSphere(0.13, light, -0.11, 0.98, 0, [0.55, 1.7, 0.5]),
        detailSphere(0.13, light, 0.11, 0.98, 0, [0.55, 1.7, 0.5]),
        detailSphere(0.035, dark, -0.075, 0.81, 0.19, [1, 1, 0.55]),
        detailSphere(0.035, dark, 0.075, 0.81, 0.19, [1, 1, 0.55]),
        detailSphere(0.025, primary, 0, 0.735, 0.205, [1, 0.75, 0.6]),
      );
      const scarf = mesh(new THREE.TorusGeometry(0.19, 0.035, 7, 22), primary);
      scarf.rotation.x = Math.PI / 2;
      scarf.position.y = 0.64;
      const moon = glowing(new THREE.OctahedronGeometry(0.12, 1), accent);
      moon.position.set(0, 0.46, 0.22);
      group.add(scarf, moon);
      break;
    }
    case "constellation-badge": {
      const back = mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.1, 20), dark);
      back.rotation.x = Math.PI / 2;
      back.position.set(0, 0.56, 0);
      const enamel = mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.115, 20),
        primary,
      );
      enamel.rotation.x = Math.PI / 2;
      enamel.position.set(0, 0.56, 0.018);
      const rim = glowing(new THREE.TorusGeometry(0.335, 0.025, 7, 28), accent);
      rim.position.set(0, 0.56, 0.09);
      const star = glowing(new THREE.OctahedronGeometry(0.13, 0), accent);
      star.position.set(0, 0.56, 0.13);
      group.add(back, enamel, rim, star);
      [-0.18, -0.07, 0.1, 0.19].forEach((x, index) => {
        group.add(
          detailSphere(
            0.025 + (index % 2) * 0.009,
            light,
            x,
            0.48 + index * 0.055,
            0.14,
            [1, 1, 0.5],
            true,
          ),
        );
      });
      [-0.14, 0.14].forEach((x) => {
        const ribbon = mesh(new THREE.ConeGeometry(0.12, 0.38, 3), secondary);
        ribbon.position.set(x, 0.22, -0.02);
        ribbon.rotation.z = x < 0 ? -0.16 : 0.16;
        group.add(ribbon);
      });
      break;
    }
    case "firefly-bottle": {
      const glassMaterial = new THREE.MeshPhysicalMaterial({
        color: light,
        transparent: true,
        opacity: 0.34,
        roughness: 0.08,
        metalness: 0,
        transmission: 0.28,
        depthWrite: false,
      });
      const bottle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.29, 0.62, 14),
        glassMaterial,
      );
      bottle.position.y = 0.48;
      const shoulder = new THREE.Mesh(
        new THREE.SphereGeometry(0.255, 14, 8),
        glassMaterial,
      );
      shoulder.scale.y = 0.48;
      shoulder.position.y = 0.78;
      const neck = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.16, 0.2, 12),
        glassMaterial,
      );
      neck.position.y = 0.88;
      const cork = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.12, 10), dark);
      cork.position.y = 1.02;
      const collar = mesh(new THREE.TorusGeometry(0.15, 0.022, 5, 18), accent);
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 0.94;
      const handle = mesh(new THREE.TorusGeometry(0.22, 0.022, 5, 20), dark);
      handle.position.y = 0.99;
      group.add(bottle, shoulder, neck, cork, collar, handle);
      [
        [-0.11, 0.4, 0.09],
        [0.12, 0.5, 0.02],
        [-0.06, 0.63, 0.11],
        [0.08, 0.72, -0.03],
        [0, 0.82, 0.07],
      ].forEach(([x, y, z], index) =>
        group.add(
          detailSphere(
            0.035 + (index % 2) * 0.008,
            index % 2 ? accent : secondary,
            x,
            y,
            z,
            [1, 1, 1],
            true,
          ),
        ),
      );
      break;
    }
    case "winged-book": {
      group.add(
        block(0.62, 0.075, 0.45, dark, 0, 0.34, 0),
        block(0.58, 0.17, 0.41, fallback.cream, 0, 0.46, 0),
        block(0.64, 0.075, 0.47, primary, 0, 0.585, 0),
        block(0.075, 0.31, 0.48, accent, -0.32, 0.46, 0),
        block(0.08, 0.11, 0.08, dark, 0.31, 0.47, 0.22),
      );
      const gem = glowing(new THREE.OctahedronGeometry(0.09, 0), secondary);
      gem.position.set(0.06, 0.64, 0.08);
      group.add(gem);
      [-1, 1].forEach((side) => {
        for (let index = 0; index < 3; index += 1) {
          const feather = mesh(
            new THREE.ConeGeometry(0.11, 0.42 - index * 0.055, 3),
            tint(light, -index * 0.045),
          );
          feather.position.set(
            side * (0.42 + index * 0.105),
            0.52 - index * 0.025,
            -0.02,
          );
          feather.rotation.z = side * (-1.22 + index * 0.08);
          group.add(feather);
        }
      });
      break;
    }
    case "star-compass": {
      const body = mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.12, 22), dark);
      body.rotation.x = Math.PI / 2;
      body.position.set(0, 0.55, 0);
      const face = glowing(
        new THREE.CircleGeometry(0.28, 24),
        tint(secondary, 0.1),
      );
      face.position.set(0, 0.55, 0.075);
      const outer = mesh(new THREE.TorusGeometry(0.35, 0.03, 7, 28), accent);
      outer.position.set(0, 0.55, 0.08);
      const inner = mesh(new THREE.TorusGeometry(0.24, 0.012, 5, 24), dark);
      inner.position.set(0, 0.55, 0.088);
      const needleA = mesh(new THREE.ConeGeometry(0.055, 0.38, 3), primary);
      needleA.position.set(0, 0.64, 0.105);
      const needleB = mesh(new THREE.ConeGeometry(0.045, 0.27, 3), dark);
      needleB.position.set(0, 0.42, 0.104);
      needleB.rotation.z = Math.PI;
      group.add(body, face, outer, inner, needleA, needleB);
      [
        [0, 0.83],
        [0.28, 0.55],
        [0, 0.27],
        [-0.28, 0.55],
      ].forEach(([x, y]) =>
        group.add(detailSphere(0.028, accent, x, y, 0.11, [1, 1, 0.5], true)),
      );
      const loop = mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 18), accent);
      loop.position.y = 0.96;
      group.add(loop);
      break;
    }
    case "sprout-lantern": {
      const glow = glowing(new THREE.SphereGeometry(0.2, 14, 10), accent);
      glow.scale.y = 1.22;
      glow.position.y = 0.56;
      const bottom = mesh(
        new THREE.CylinderGeometry(0.27, 0.31, 0.1, 10),
        dark,
      );
      bottom.position.y = 0.27;
      const top = mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.1, 10), dark);
      top.position.y = 0.84;
      group.add(glow, bottom, top);
      [-0.23, 0.23].forEach((x) =>
        [-0.09, 0.09].forEach((z) =>
          group.add(block(0.025, 0.54, 0.025, primary, x, 0.56, z)),
        ),
      );
      const handle = mesh(new THREE.TorusGeometry(0.25, 0.025, 6, 20), primary);
      handle.position.y = 0.96;
      const stem = mesh(
        new THREE.CylinderGeometry(0.025, 0.035, 0.25, 6),
        secondary,
      );
      stem.position.y = 0.98;
      group.add(handle, stem);
      [-1, 1].forEach((side) =>
        group.add(
          detailSphere(
            0.13,
            secondary,
            side * 0.11,
            1.08,
            0,
            [0.95, 0.38, 0.52],
          ),
        ),
      );
      break;
    }
    case "cloud-whale": {
      [
        [-0.25, 0.27, 0.03, 0.22],
        [0, 0.3, 0, 0.28],
        [0.28, 0.25, 0.02, 0.2],
      ].forEach(([x, y, z, radius]) =>
        group.add(
          detailSphere(radius, fallback.cloud, x, y, z, [1.2, 0.62, 1]),
        ),
      );
      group.add(
        detailSphere(0.27, primary, -0.03, 0.62, 0, [1.55, 0.76, 0.72]),
        detailSphere(0.19, primary, 0.27, 0.65, 0, [1, 0.9, 0.84]),
        detailSphere(0.028, dark, 0.37, 0.69, 0.13, [1, 1, 0.65]),
      );
      [-1, 1].forEach((side) => {
        const fin = mesh(new THREE.ConeGeometry(0.1, 0.3, 3), secondary);
        fin.position.set(0.02, 0.51, side * 0.18);
        fin.rotation.x = side * 1.1;
        group.add(fin);
        const tail = mesh(new THREE.ConeGeometry(0.13, 0.3, 3), primary);
        tail.position.set(-0.45, 0.66 + side * 0.1, 0);
        tail.rotation.z = side * 1.15;
        group.add(tail);
      });
      const star = glowing(new THREE.OctahedronGeometry(0.075, 0), accent);
      star.position.set(0.18, 0.87, 0);
      group.add(star);
      break;
    }
    case "planet-teacup": {
      const saucer = mesh(
        new THREE.CylinderGeometry(0.39, 0.45, 0.07, 18),
        secondary,
      );
      saucer.position.y = 0.24;
      const cup = mesh(
        new THREE.CylinderGeometry(0.27, 0.2, 0.35, 16),
        primary,
      );
      cup.position.y = 0.43;
      const rim = mesh(new THREE.TorusGeometry(0.27, 0.025, 6, 22), accent);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.61;
      const handle = mesh(new THREE.TorusGeometry(0.17, 0.035, 7, 20), primary);
      handle.position.set(0.3, 0.46, 0);
      handle.scale.y = 1.15;
      const planet = glowing(new THREE.SphereGeometry(0.18, 14, 10), accent);
      planet.position.set(-0.02, 0.78, 0);
      const orbit = mesh(new THREE.TorusGeometry(0.3, 0.018, 5, 28), light);
      orbit.position.copy(planet.position);
      orbit.rotation.set(0.85, 0.18, 0.25);
      const moon = detailSphere(
        0.055,
        secondary,
        0.22,
        0.9,
        0.03,
        [1, 1, 1],
        true,
      );
      group.add(saucer, cup, rim, handle, planet, orbit, moon);
      break;
    }
    case "echo-shell": {
      group.add(
        detailSphere(0.34, primary, -0.03, 0.52, 0, [1.02, 0.9, 0.58]),
        detailSphere(
          0.25,
          tint(primary, 0.08),
          0.21,
          0.49,
          0,
          [0.9, 0.78, 0.52],
        ),
        detailSphere(
          0.16,
          tint(primary, 0.15),
          0.38,
          0.47,
          0.02,
          [0.82, 0.72, 0.48],
        ),
      );
      for (let index = 0; index < 6; index += 1) {
        const ridge = mesh(
          new THREE.TorusGeometry(0.12 + index * 0.038, 0.014, 4, 18),
          index % 2 ? accent : light,
        );
        ridge.position.set(-0.12 + index * 0.07, 0.54, 0.18);
        ridge.scale.y = 0.72;
        group.add(ridge);
      }
      const pearl = glowing(new THREE.SphereGeometry(0.095, 12, 8), light);
      pearl.position.set(-0.18, 0.31, 0.22);
      group.add(pearl);
      break;
    }
    case "clockwork-bird": {
      group.add(
        detailSphere(0.25, primary, -0.04, 0.53, 0, [1.18, 0.9, 0.78]),
        detailSphere(0.17, secondary, 0.22, 0.7, 0.02, [0.95, 1, 0.85]),
        detailSphere(0.03, dark, 0.29, 0.74, 0.13, [1, 1, 0.6]),
      );
      const beak = mesh(new THREE.ConeGeometry(0.07, 0.2, 4), accent);
      beak.position.set(0.39, 0.68, 0.02);
      beak.rotation.z = -Math.PI / 2;
      group.add(beak);
      [-1, 1].forEach((side) => {
        for (let index = 0; index < 3; index += 1) {
          const wing = detailSphere(
            0.15 - index * 0.02,
            tint(secondary, index * 0.05),
            -0.06 - index * 0.1,
            0.55 - index * 0.035,
            side * (0.16 + index * 0.03),
            [1.25, 0.38, 0.52],
          );
          wing.rotation.z = side * 0.22;
          group.add(wing);
        }
      });
      for (let index = 0; index < 3; index += 1) {
        const tail = mesh(new THREE.ConeGeometry(0.07, 0.32, 3), primary);
        tail.position.set(-0.35 - index * 0.05, 0.45 + index * 0.07, 0);
        tail.rotation.z = 1.18 + index * 0.16;
        group.add(tail);
      }
      const gear = mesh(new THREE.TorusGeometry(0.115, 0.025, 6, 16), accent);
      gear.position.set(-0.02, 0.54, 0.22);
      group.add(gear);
      for (let index = 0; index < 6; index += 1) {
        const angle = (index / 6) * Math.PI * 2;
        group.add(
          block(
            0.035,
            0.075,
            0.035,
            accent,
            -0.02 + Math.cos(angle) * 0.14,
            0.54 + Math.sin(angle) * 0.14,
            0.22,
          ),
        );
      }
      break;
    }
    case "aurora-key": {
      const shaft = mesh(
        new THREE.CylinderGeometry(0.035, 0.045, 0.62, 8),
        accent,
      );
      shaft.position.y = 0.52;
      const bow = mesh(new THREE.TorusGeometry(0.21, 0.035, 7, 24), primary);
      bow.position.y = 0.92;
      const gem = glowing(new THREE.OctahedronGeometry(0.1, 0), secondary);
      gem.position.y = 0.92;
      group.add(shaft, bow, gem);
      group.add(
        block(0.23, 0.055, 0.08, accent, 0.08, 0.23, 0),
        block(0.08, 0.16, 0.08, accent, 0.16, 0.29, 0),
        block(0.08, 0.11, 0.08, accent, -0.04, 0.26, 0),
      );
      for (let index = 0; index < 5; index += 1) {
        const angle = (index / 5) * Math.PI * 2;
        const leaf = detailSphere(
          0.075,
          index % 2 ? secondary : light,
          Math.cos(angle) * 0.27,
          0.92 + Math.sin(angle) * 0.27,
          0,
          [1.5, 0.45, 0.55],
        );
        leaf.rotation.z = angle;
        group.add(leaf);
      }
      break;
    }
    case "dream-camera": {
      group.add(
        block(0.72, 0.48, 0.34, dark, 0, 0.5, 0),
        block(0.58, 0.36, 0.37, primary, 0, 0.5, 0.015),
        block(0.18, 0.11, 0.22, accent, -0.19, 0.8, 0),
        block(0.18, 0.08, 0.18, light, 0.21, 0.78, 0.02),
      );
      [0.23, 0.17, 0.11].forEach((radius, index) => {
        const lens = mesh(
          new THREE.CylinderGeometry(radius, radius, 0.1, 18),
          index === 2 ? secondary : index === 1 ? accent : dark,
        );
        lens.rotation.x = Math.PI / 2;
        lens.position.set(0.05, 0.52, 0.24 + index * 0.07);
        group.add(lens);
      });
      const lensStar = glowing(new THREE.OctahedronGeometry(0.055, 0), light);
      lensStar.position.set(0.05, 0.52, 0.47);
      const shutter = glowing(new THREE.SphereGeometry(0.045, 10, 7), accent);
      shutter.position.set(0.27, 0.77, 0.13);
      const photo = mesh(new THREE.PlaneGeometry(0.36, 0.28), fallback.cream);
      photo.position.set(-0.28, 1.02, -0.05);
      photo.rotation.z = -0.18;
      const photoStar = glowing(
        new THREE.OctahedronGeometry(0.055, 0),
        primary,
      );
      photoStar.position.set(-0.28, 1.02, -0.03);
      group.add(lensStar, shutter, photo, photoStar);
      break;
    }
    case "flaming-pan-sculpture": {
      const panOuter = mesh(
        new THREE.CylinderGeometry(0.42, 0.32, 0.15, 20),
        0x22242b,
      );
      panOuter.position.y = 0.43;
      const panRim = mesh(
        new THREE.TorusGeometry(0.41, 0.035, 7, 30),
        0x5c606b,
      );
      panRim.rotation.x = Math.PI / 2;
      panRim.position.y = 0.52;
      const panGlow = glowing(
        new THREE.CylinderGeometry(0.32, 0.3, 0.035, 20),
        0xff5a2f,
      );
      panGlow.position.y = 0.515;
      const handle = mesh(
        new THREE.CylinderGeometry(0.07, 0.095, 0.72, 10),
        0x292a32,
      );
      handle.rotation.z = Math.PI / 2;
      handle.position.set(0.68, 0.47, 0);
      const handleEnd = mesh(
        new THREE.CylinderGeometry(0.105, 0.105, 0.18, 10),
        0x14151a,
      );
      handleEnd.rotation.z = Math.PI / 2;
      handleEnd.position.set(1.03, 0.47, 0);
      group.add(panOuter, panRim, panGlow, handle, handleEnd);

      const flames = [
        [-0.24, 0.83, 0.02, 0.22, 0.62, -0.16],
        [0, 0.95, -0.04, 0.3, 0.88, 0.04],
        [0.25, 0.8, 0.05, 0.2, 0.56, 0.18],
        [-0.08, 0.75, 0.2, 0.16, 0.48, -0.08],
        [0.13, 0.7, 0.22, 0.14, 0.4, 0.12],
      ] as const;
      flames.forEach(([x, y, z, radius, height, lean], index) => {
        const flame = glowing(
          new THREE.ConeGeometry(radius, height, 7),
          index % 2 ? 0xffc238 : 0xff542f,
        );
        flame.position.set(x, y, z);
        flame.rotation.z = lean;
        flame.userData.topiaSouvenirFlame = true;
        flame.userData.flameIndex = index;
        flame.userData.baseScaleY = 1;
        group.add(flame);

        if (index < 3) {
          const core = glowing(
            new THREE.ConeGeometry(radius * 0.45, height * 0.56, 6),
            0xfff3a6,
          );
          core.position.set(x, y - height * 0.12, z + 0.025);
          core.rotation.z = lean;
          core.userData.topiaSouvenirFlame = true;
          core.userData.flameIndex = index + 5;
          core.userData.baseScaleY = 1;
          group.add(core);
        }
      });
      break;
    }
    case "mnn-engine-core": {
      const core = glowing(new THREE.IcosahedronGeometry(0.2, 1), 0xff4e35);
      core.position.y = 0.53;
      const inner = glowing(
        new THREE.OctahedronGeometry(0.105, 0),
        fallback.yellow,
      );
      inner.position.y = 0.53;
      group.add(core, inner);

      [0.31, 0.4].forEach((radius, index) => {
        const ring = mesh(
          new THREE.TorusGeometry(radius, 0.024 - index * 0.005, 7, 36),
          index ? 0xffc83d : 0xff6047,
        );
        ring.position.y = 0.53;
        ring.rotation.set(0.84 + index * 0.48, 0.22, index * 0.34);
        group.add(ring);
      });

      for (let index = 0; index < 6; index += 1) {
        const angle = (index / 6) * Math.PI * 2;
        const fin = mesh(
          new THREE.BoxGeometry(0.07, 0.22, 0.035),
          index % 2 ? 0xffb11f : 0xe83528,
        );
        fin.position.set(
          Math.cos(angle) * 0.4,
          0.53 + Math.sin(angle) * 0.4,
          -0.02,
        );
        fin.rotation.z = angle;
        group.add(fin);
      }

      const plaqueBack = mesh(
        new THREE.BoxGeometry(0.72, 0.28, 0.055),
        0x251516,
      );
      plaqueBack.position.set(0, 0.98, 0.015);
      group.add(plaqueBack);

      [-1, 1].forEach((side) => {
        const flame = mesh(
          new THREE.ConeGeometry(0.085, 0.34, 5),
          side < 0 ? 0xff4f35 : 0xffba31,
        );
        flame.position.set(side * 0.32, 0.3, 0.04);
        flame.rotation.z = side * -0.22;
        group.add(flame);
      });
      break;
    }
    default:
      break;
  }

  group.userData.souvenirKind = kind;
  return { group, anchorHeight: 1.08 };
}

function seededRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/**
 * Adds a deterministic layer of small, readable details around the main
 * exterior island. Generated worlds only need to describe their meaningful
 * structures; this layer supplies scale cues without turning grass and stones
 * into part of the persisted world contract.
 */
function exteriorGroundDetails(config: TopiaSceneConfig, seed: number) {
  const details = new THREE.Group();
  details.name = "exterior-ground-details";
  const island = config.objects
    .filter((object) => object.prefab === "floating-island")
    .sort(
      (a, b) =>
        Math.hypot(a.position[0], a.position[2]) -
        Math.hypot(b.position[0], b.position[2]),
    )[0];
  if (!island) return details;

  const random = seededRandom(seed + config.objects.length * 97);
  const scaleX = island.scale?.[0] ?? 1;
  const scaleY = island.scale?.[1] ?? 1;
  const scaleZ = island.scale?.[2] ?? 1;
  const sourceRadius = parameter(island, "radius", 3.25);
  const radiusX = sourceRadius * scaleX;
  const radiusZ = sourceRadius * scaleZ;
  const [centerX, centerY, centerZ] = island.position;
  const surfaceY = centerY + 0.2 * scaleY;
  const grassColor = color(island, 0, fallback.mint);
  const rockColor = color(island, 1, fallback.woodDark);
  const mineralColor = color(island, 2, fallback.lavender);

  const rim = mesh(
    new THREE.TorusGeometry(radiusX * 0.91, 0.045, 5, 48),
    tint(rockColor, 0.18),
  );
  rim.position.set(centerX, surfaceY + 0.015, centerZ);
  rim.rotation.x = Math.PI / 2;
  rim.scale.z = radiusZ / Math.max(radiusX, 0.01);
  rim.castShadow = false;
  details.add(rim);

  const door = config.objects.find((object) => object.prefab === "door");
  const doorAngle = door
    ? Math.atan2(
        (door.position[2] - centerZ) / Math.max(radiusZ, 0.01),
        (door.position[0] - centerX) / Math.max(radiusX, 0.01),
      )
    : Math.PI / 2;
  const angularDistance = (a: number, b: number) =>
    Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

  const tuftCount = Math.min(22, 12 + Math.floor(config.objects.length / 2));
  for (let index = 0; index < tuftCount; index += 1) {
    const angle = index * 2.399_963 + random() * 0.42;
    if (angularDistance(angle, doorAngle) < 0.3) continue;
    const radial = 0.62 + random() * 0.25;
    const tuft = new THREE.Group();
    const height = 0.14 + random() * 0.16;
    for (let leafIndex = 0; leafIndex < 3; leafIndex += 1) {
      const leaf = mesh(
        new THREE.ConeGeometry(0.045 + random() * 0.025, height, 4),
        tint(grassColor, leafIndex === 1 ? -0.06 : 0.04),
      );
      leaf.position.set((leafIndex - 1) * 0.055, height / 2, 0);
      leaf.rotation.z = (leafIndex - 1) * -0.28;
      tuft.add(leaf);
    }
    tuft.position.set(
      centerX + Math.cos(angle) * radiusX * radial,
      surfaceY,
      centerZ + Math.sin(angle) * radiusZ * radial,
    );
    tuft.rotation.y = -angle;
    details.add(tuft);
  }

  const pebbleCount = Math.min(12, 7 + Math.floor(config.objects.length / 5));
  for (let index = 0; index < pebbleCount; index += 1) {
    const angle = index * 2.17 + 0.7 + random() * 0.55;
    if (angularDistance(angle, doorAngle) < 0.24) continue;
    const radial = 0.7 + random() * 0.2;
    const pebble = mesh(
      new THREE.DodecahedronGeometry(0.08 + random() * 0.08, 0),
      tint(rockColor, 0.12 + random() * 0.08),
    );
    pebble.position.set(
      centerX + Math.cos(angle) * radiusX * radial,
      surfaceY + 0.045,
      centerZ + Math.sin(angle) * radiusZ * radial,
    );
    pebble.scale.set(1.25, 0.65, 0.9);
    pebble.rotation.y = angle;
    details.add(pebble);
  }

  if (door) {
    const outwardX = Math.cos(doorAngle);
    const outwardZ = Math.sin(doorAngle);
    const doorRadius = Math.hypot(
      (door.position[0] - centerX) / Math.max(scaleX, 0.01),
      (door.position[2] - centerZ) / Math.max(scaleZ, 0.01),
    );
    for (let index = 0; index < 5; index += 1) {
      const distance = doorRadius + 0.28 + index * 0.34;
      const step = mesh(
        new THREE.CylinderGeometry(0.24, 0.28, 0.065, 7),
        tint(mineralColor, 0.13 + (index % 2) * 0.05),
      );
      step.position.set(
        centerX + outwardX * distance * scaleX,
        surfaceY + 0.035,
        centerZ + outwardZ * distance * scaleZ,
      );
      step.rotation.y = doorAngle + index * 0.22;
      step.scale.x = 1 + (index % 2) * 0.18;
      details.add(step);
    }
  }

  return details;
}

function roomShell(object: TopiaObjectConfig) {
  const group = new THREE.Group();
  const shape = stringParameter(object, "shape", "rectangular");
  const floorColor = color(object, 0, fallback.cream);
  const wallColor = color(object, 1, fallback.wall);
  const accentColor = color(object, 2, fallback.wood);
  const baseColor = color(object, 3, fallback.woodDark);
  const addPanel = (
    width: number,
    height: number,
    x: number,
    z: number,
    rotationY = 0,
    value = wallColor,
  ) => {
    const panel = block(width, height, 0.16, value, x, 0.36 + height / 2, z);
    panel.rotation.y = rotationY;
    group.add(panel);
  };
  const addColumn = (x: number, z: number, height = 2.7) => {
    const column = mesh(
      new THREE.CylinderGeometry(0.11, 0.14, height, 8),
      accentColor,
    );
    column.position.set(x, 0.36 + height / 2, z);
    group.add(column);
  };
  const addRail = (width: number, x: number, z: number, rotationY = 0) => {
    const rail = new THREE.Group();
    rail.add(
      block(width, 0.07, 0.07, accentColor, 0, 0.45, 0),
      block(0.07, 0.62, 0.07, accentColor, -width / 2, 0.18, 0),
      block(0.07, 0.62, 0.07, accentColor, width / 2, 0.18, 0),
    );
    rail.position.set(x, 1.76, z);
    rail.rotation.y = rotationY;
    group.add(rail);
  };
  const addStairs = (
    startX: number,
    startZ: number,
    directionX: number,
    directionZ: number,
  ) => {
    for (let index = 0; index < 6; index += 1) {
      const height = 0.22 + index * 0.22;
      group.add(
        block(
          0.82,
          height,
          0.42,
          tint(floorColor, index % 2 ? -0.025 : 0.035),
          startX + directionX * index * 0.36,
          0.36 + height / 2,
          startZ + directionZ * index * 0.36,
        ),
      );
    }
  };
  const addPolygonBase = (radius = 3.6, sides = 10) => {
    const base = mesh(
      new THREE.CylinderGeometry(radius, radius * 0.92, 0.38, sides),
      baseColor,
    );
    base.position.y = 0.02;
    const floor = mesh(
      new THREE.CylinderGeometry(radius * 0.92, radius * 0.92, 0.18, sides),
      floorColor,
    );
    floor.position.y = 0.3;
    group.add(base, floor);
  };

  switch (shape) {
    case "terraced-apse": {
      addPolygonBase(3.7, 9);
      group.add(
        block(5.9, 0.16, 1.25, tint(floorColor, 0.04), 0, 0.48, 1.2),
        block(5.1, 0.22, 1.25, tint(floorColor, -0.02), 0, 0.58, 0.08),
        block(4.15, 0.3, 1.35, tint(floorColor, 0.07), 0, 0.7, -1.08),
      );
      [
        [-2.5, -1.05, -0.5],
        [-1.3, -2.05, -0.22],
        [0, -2.35, 0],
        [1.3, -2.05, 0.22],
        [2.5, -1.05, 0.5],
      ].forEach(([x, z, rotation]) => addPanel(1.55, 3.15, x, z, rotation));
      [-2.35, -0.78, 0.78, 2.35].forEach((x) => addColumn(x, -1.55, 2.75));
      break;
    }
    case "cloud-ring": {
      addPolygonBase(3.55, 16);
      [
        [-2.68, -0.88, -0.48],
        [-1.5, -1.92, -0.23],
        [0, -2.25, 0],
        [1.5, -1.92, 0.23],
        [2.68, -0.88, 0.48],
      ].forEach(([x, z, rotation]) =>
        addPanel(1.72, 2.9, x, z, rotation, tint(wallColor, 0.035)),
      );
      const orbit = mesh(
        new THREE.TorusGeometry(1.38, 0.07, 6, 36),
        accentColor,
      );
      orbit.rotation.x = Math.PI / 2;
      orbit.position.y = 0.42;
      group.add(orbit);
      [-2.72, 2.72].forEach((x, index) => {
        const cloud = lowPolyCloud(tint(wallColor, 0.08));
        cloud.position.set(x, 0.72, index ? 0.72 : 0.45);
        cloud.scale.setScalar(0.42);
        group.add(cloud);
      });
      break;
    }
    case "terraced-loft": {
      addPolygonBase(3.7, 7);
      addPanel(3.55, 4.05, -1.65, -2.05, -0.08);
      addPanel(3.35, 3.5, 1.72, -1.95, 0.1);
      addPanel(2.65, 3.55, -3.0, -0.62, Math.PI / 2 - 0.14);
      group.add(
        block(3.05, 0.2, 2.45, tint(floorColor, -0.025), -1.45, 1.68, -0.72),
        block(0.16, 1.55, 0.16, baseColor, -2.72, 0.94, 0.2),
        block(0.16, 1.55, 0.16, baseColor, -0.18, 0.94, 0.2),
      );
      addRail(2.45, -1.45, 0.5);
      addStairs(1.28, 1.22, -0.55, -0.35);
      break;
    }
    case "courtyard-ring": {
      const base = mesh(
        new THREE.CylinderGeometry(3.72, 3.42, 0.38, 12),
        baseColor,
      );
      base.position.y = -0.24;
      group.add(
        base,
        block(2.25, 0.2, 4.5, floorColor, -2.05, 0.3, 0),
        block(2.25, 0.2, 4.5, floorColor, 2.05, 0.3, 0),
        block(1.9, 0.2, 1.35, floorColor, 0, 0.3, -1.58),
        block(1.9, 0.2, 1.35, floorColor, 0, 0.3, 1.58),
      );
      addPanel(2.35, 2.85, -2.05, -2.18);
      addPanel(2.35, 2.85, 2.05, -2.18);
      addPanel(4.35, 2.7, -3.12, 0, Math.PI / 2);
      addPanel(4.35, 2.7, 3.12, 0, Math.PI / 2);
      group.add(
        block(1.86, 0.34, 0.09, accentColor, 0, 0.48, -0.91),
        block(1.86, 0.34, 0.09, accentColor, 0, 0.48, 0.91),
        block(0.09, 0.34, 1.72, accentColor, -0.91, 0.48, 0),
        block(0.09, 0.34, 1.72, accentColor, 0.91, 0.48, 0),
      );
      const garden = mesh(
        new THREE.CylinderGeometry(0.7, 0.78, 0.14, 10),
        new THREE.Color(fallback.mint)
          .lerp(new THREE.Color(accentColor), 0.22)
          .getHex(),
      );
      garden.position.y = -0.02;
      const gardenRing = mesh(
        new THREE.TorusGeometry(0.8, 0.055, 5, 28),
        accentColor,
      );
      gardenRing.rotation.x = Math.PI / 2;
      gardenRing.position.y = 0.07;
      group.add(garden, gardenRing);
      [-2.75, -1.2, 1.2, 2.75].forEach((x) => addColumn(x, -1.72));
      break;
    }
    case "cantilever-loft": {
      const base = mesh(
        new THREE.CylinderGeometry(3.65, 3.28, 0.38, 8),
        baseColor,
      );
      base.position.y = 0.02;
      group.add(
        base,
        block(5.95, 0.2, 2.3, floorColor, -0.25, 0.3, 0.92),
        block(2.55, 0.2, 2.1, floorColor, -1.95, 0.3, -1.18),
      );
      addPanel(3.05, 4.2, -1.85, -2.18);
      addPanel(2.75, 4.2, 1.12, -2.18);
      addPanel(4.1, 3.85, -3.02, -0.12, Math.PI / 2);
      group.add(
        block(3.35, 0.2, 2.15, tint(floorColor, 0.025), 1.45, 1.72, -0.88),
        block(0.16, 1.62, 0.16, baseColor, 0.12, 0.95, 0.05),
      );
      addRail(2.8, 1.45, 0.2);
      addStairs(-0.92, 1.22, 0.48, -0.38);
      break;
    }
    case "crystal-grotto": {
      addPolygonBase(3.6, 7);
      [
        [-2.72, -0.72, -0.65, 2.75],
        [-1.62, -1.96, -0.24, 3.55],
        [0, -2.35, 0, 3.1],
        [1.68, -1.92, 0.25, 3.8],
        [2.72, -0.62, 0.68, 2.55],
      ].forEach(([x, z, rotation, height], index) =>
        addPanel(
          1.6,
          height,
          x,
          z,
          rotation,
          tint(wallColor, index % 2 ? -0.04 : 0.04),
        ),
      );
      [-2.25, 0.2, 2.25].forEach((x, index) => {
        const platform = mesh(
          new THREE.CylinderGeometry(0.95, 1.08, 0.2 + index * 0.08, 7),
          tint(floorColor, index % 2 ? 0.06 : -0.025),
        );
        platform.position.set(
          x,
          0.45 + index * 0.08,
          index === 1 ? -0.75 : 0.62,
        );
        group.add(platform);
      });
      const prismWell = glowing(
        new THREE.OctahedronGeometry(0.46, 0),
        accentColor,
      );
      prismWell.position.set(0.15, 0.82, -0.55);
      prismWell.scale.y = 1.45;
      group.add(prismWell);
      break;
    }
    default:
      group.add(
        mesh(new THREE.CylinderGeometry(3.65, 3.35, 0.42, 10), baseColor),
        block(6.25, 0.2, 4.35, floorColor, 0, 0.28, 0),
        block(6.25, 3.25, 0.16, wallColor, 0, 1.89, -2.12),
        block(0.16, 3.25, 4.25, wallColor, -3.04, 1.89, 0),
      );
      group.children[0].position.y = -0.08;
      break;
  }
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

function invertedIslandPoint(
  radius: number,
  depth: number,
  segments: number,
  value: number,
  topY = -0.22,
) {
  const point = mesh(
    new THREE.ConeGeometry(radius, depth, Math.max(3, segments)),
    value,
  );
  // ConeGeometry puts its point at +Y. The island needs its broad face against
  // the ground and its point hanging down into the sky.
  point.rotation.z = Math.PI;
  point.position.y = topY - depth / 2;
  return point;
}

function floatingIsland(object: TopiaObjectConfig) {
  const group = new THREE.Group();
  const radius = parameter(object, "radius", 3.25);
  const depth = parameter(object, "depth", 2.05);
  const grassColor = color(object, 0, 0x80c989);
  const rockColor = color(object, 1, 0x75657f);
  const mineralColor = color(object, 2, 0x4f536e);
  const style = activeRenderStyle?.kind ?? "storybook-ink";
  const surfaceSegments =
    style === "paper-craft"
      ? 7
      : style === "crystal-diorama"
        ? 9
        : style === "storybook-ink"
          ? 12
          : style === "painterly-oil"
            ? 16
            : 24;

  const grass = mesh(
    new THREE.CylinderGeometry(radius, radius * 0.93, 0.26, surfaceSegments),
    grassColor,
  );
  grass.position.y = 0.04;
  const earthRim = mesh(
    new THREE.CylinderGeometry(
      radius * 0.94,
      radius * 0.86,
      0.2,
      surfaceSegments,
    ),
    tint(rockColor, 0.09),
  );
  earthRim.position.y = -0.17;
  group.add(grass, earthRim);

  if (style === "plush-toy") {
    const cushion = mesh(
      new THREE.SphereGeometry(radius * 0.8, 24, 14),
      tint(rockColor, 0.07),
    );
    cushion.position.y = -0.24 - depth / 2;
    cushion.scale.y = depth / Math.max(radius * 1.6, 0.01);
    const softPoint = invertedIslandPoint(
      radius * 0.25,
      depth * 0.42,
      18,
      mineralColor,
      -0.24 - depth * 0.72,
    );
    const seam = mesh(
      new THREE.TorusGeometry(radius * 0.62, 0.035, 5, 42),
      tint(mineralColor, 0.14),
    );
    seam.position.y = -0.24 - depth * 0.48;
    seam.rotation.x = Math.PI / 2;
    seam.scale.z = 0.82;
    seam.castShadow = false;
    group.add(cushion, softPoint, seam);
  } else if (style === "glazed-ceramic") {
    const profile = [
      new THREE.Vector2(radius * 0.87, -0.22),
      new THREE.Vector2(radius * 0.84, -0.3),
      new THREE.Vector2(radius * 0.66, -0.22 - depth * 0.36),
      new THREE.Vector2(radius * 0.39, -0.22 - depth * 0.72),
      new THREE.Vector2(radius * 0.055, -0.22 - depth * 1.08),
    ];
    const glazedDrop = mesh(
      new THREE.LatheGeometry(profile, 32),
      tint(rockColor, 0.035),
    );
    const glazeBand = mesh(
      new THREE.TorusGeometry(radius * 0.65, 0.045, 6, 48),
      tint(mineralColor, 0.16),
    );
    glazeBand.position.y = -0.22 - depth * 0.36;
    glazeBand.rotation.x = Math.PI / 2;
    glazeBand.castShadow = false;
    group.add(glazedDrop, glazeBand);
  } else {
    const coreSegments =
      style === "paper-craft"
        ? 6
        : style === "crystal-diorama"
          ? 7
          : style === "painterly-oil"
            ? 13
            : 9;
    const core = invertedIslandPoint(
      radius * 0.87,
      depth,
      coreSegments,
      rockColor,
    );
    group.add(core);

    const accents =
      style === "paper-craft"
        ? 3
        : style === "crystal-diorama"
          ? 6
          : style === "painterly-oil"
            ? 4
            : 5;
    for (let index = 0; index < accents; index += 1) {
      const angle =
        index * ((Math.PI * 2) / accents) +
        ((activeRenderStyle?.seed ?? 1) % 29) * 0.017;
      const radial =
        radius *
        (style === "paper-craft"
          ? 0.3
          : style === "crystal-diorama"
            ? 0.42
            : 0.36);
      const accentDepth =
        depth *
        (0.5 + ((index * 7 + (activeRenderStyle?.seed ?? 1)) % 5) * 0.075);
      const accent = invertedIslandPoint(
        radius *
          (style === "crystal-diorama"
            ? 0.19
            : style === "paper-craft"
              ? 0.24
              : 0.16),
        accentDepth,
        style === "crystal-diorama" ? 5 : style === "paper-craft" ? 4 : 7,
        tint(index % 2 ? mineralColor : rockColor, index % 2 ? 0.08 : -0.03),
        -0.2 - depth * (0.04 + (index % 2) * 0.08),
      );
      accent.position.x = Math.cos(angle) * radial;
      accent.position.z = Math.sin(angle) * radial;
      accent.rotation.y = angle;
      group.add(accent);
    }
  }

  const contour = mesh(
    new THREE.TorusGeometry(
      radius * 0.89,
      0.055,
      5,
      Math.max(30, surfaceSegments * 3),
    ),
    tint(grassColor, 0.12),
  );
  contour.position.y = 0.18;
  contour.rotation.x = Math.PI / 2;
  contour.castShadow = false;
  group.add(contour);
  group.userData.topiaIslandUnderside = style;
  return group;
}

function buildPrefab(
  object: TopiaObjectConfig,
  crops: Map<string, TopiaSceneCrop>,
) {
  if (object.layer === "souvenir") return detailedSouvenir(object);
  const group = new THREE.Group();
  let anchorHeight = 0;
  switch (object.prefab) {
    case "floating-island": {
      group.add(floatingIsland(object));
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
      {
        const radius = parameter(object, "radius", 1);
        const height = parameter(object, "height", 1);
        const segments = Math.round(parameter(object, "segments", 6));
        const gabled = parameter(object, "gable", 0) > 0.5;
        const roof = mesh(
          gabled
            ? gabledRoofGeometry(radius, height)
            : new THREE.ConeGeometry(radius, height, segments),
          color(object, 0, fallback.blue),
        );
        const eave = gabled
          ? block(
              radius * 2.08,
              Math.max(0.055, height * 0.07),
              radius * 2.08,
              color(object, 1, fallback.wood),
            )
          : mesh(
              new THREE.CylinderGeometry(
                radius * 1.035,
                radius * 1.035,
                Math.max(0.055, height * 0.07),
                segments,
              ),
              color(object, 1, fallback.wood),
            );
        eave.position.y = -height / 2 + Math.max(0.04, height * 0.025);
        group.add(roof, eave);
      }
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
      const doorColor = color(object, 0, fallback.woodDark);
      const trimColor = color(object, 2, fallback.wood);
      group.add(
        block(0.7, 1.3, 0.14, doorColor),
        block(0.1, 1.48, 0.1, trimColor, -0.41, 0.03, 0.03),
        block(0.1, 1.48, 0.1, trimColor, 0.41, 0.03, 0.03),
        block(0.92, 0.1, 0.1, trimColor, 0, 0.72, 0.03),
        block(0.42, 0.42, 0.045, tint(doorColor, 0.08), 0, -0.18, 0.1),
      );
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
      const bodyColor = color(object, 0, fallback.cream);
      const roofColor = color(object, 1, fallback.coral);
      const body = mesh(
        new THREE.CylinderGeometry(radius * 0.94, radius, height, 8),
        bodyColor,
      );
      body.position.y = height / 2;
      const roof = mesh(
        new THREE.ConeGeometry(radius * 1.42, height * 0.48, 8),
        roofColor,
      );
      roof.position.y = height + height * 0.24;
      const baseRing = mesh(
        new THREE.CylinderGeometry(radius * 1.06, radius * 1.06, 0.12, 10),
        color(object, 2, fallback.wood),
      );
      baseRing.position.y = 0.08;
      const balcony = mesh(
        new THREE.CylinderGeometry(radius * 1.12, radius * 1.12, 0.1, 10),
        tint(roofColor, 0.08),
      );
      balcony.position.y = height * 0.66;
      const window = glowing(
        new THREE.CircleGeometry(radius * 0.22, 12),
        color(object, 2, fallback.sky),
      );
      window.position.set(0, height * 0.58, radius * 0.95);
      group.add(body, roof, baseRing, balcony, window);
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
      const radius = 0.48;
      const dome = mesh(
        new THREE.SphereGeometry(radius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        color(object, 0, fallback.lavender),
      );
      dome.rotation.x = -Math.PI / 2;
      const base = mesh(
        new THREE.CylinderGeometry(radius * 1.08, radius * 1.18, 0.22, 12),
        color(object, 1, fallback.cream),
      );
      base.position.y = -0.08;
      const ring = mesh(
        new THREE.TorusGeometry(radius * 0.82, 0.045, 6, 24),
        color(object, 1, fallback.yellow),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.07;
      const slit = glowing(
        new THREE.BoxGeometry(0.055, 0.32, radius * 1.5),
        color(object, 1, fallback.sky),
      );
      slit.rotation.x = -0.22;
      slit.position.y = 0.27;
      group.add(base, dome, ring, slit);
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
    case "room-shell":
      group.add(roomShell(object));
      break;
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

export function mountSouvenirPreview(
  canvas: HTMLCanvasElement,
  object: TopiaObjectConfig,
) {
  const container = canvas.parentElement;
  if (!container) return () => undefined;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
  } catch {
    return () => undefined;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.24;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(3, 2.25, 5);
  camera.lookAt(0, 0.58, 0);
  camera.zoom = 1.28;
  camera.updateProjectionMatrix();
  canvas.dataset.souvenirPreviewZoom = String(camera.zoom);
  scene.add(new THREE.HemisphereLight(0xeaf7ff, 0x736083, 3.5));
  const key = new THREE.DirectionalLight(0xfff4ce, 5.2);
  key.position.set(-3.5, 5.5, 4.5);
  key.castShadow = true;
  scene.add(key);
  const rim = new THREE.PointLight(0x99ddff, 3.2, 8);
  rim.position.set(2.4, 1.8, -2.2);
  scene.add(rim);

  const model = detailedSouvenir({
    ...object,
    position: [0, 0, 0],
    rotation: undefined,
    scale: undefined,
  }).group;
  model.position.y = -0.08;
  scene.add(model);
  let meshCount = 0;
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      meshCount += 1;
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  canvas.dataset.souvenirPreviewMeshCount = String(meshCount);
  canvas.dataset.souvenirPreviewKind = souvenirKind(object);

  const resize = () => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  const pointers = new Map<number, { x: number; y: number }>();
  let lastX = 0;
  let lastY = 0;
  let pinchDistance = 0;
  let pinchZoom = camera.zoom;
  const pointerDistance = () => {
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
      pinchDistance = pointerDistance();
      pinchZoom = camera.zoom;
    }
  };
  const move = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      model.rotation.y += (event.clientX - lastX) * 0.012;
      model.rotation.x = THREE.MathUtils.clamp(
        model.rotation.x + (event.clientY - lastY) * 0.006,
        -0.35,
        0.35,
      );
      lastX = event.clientX;
      lastY = event.clientY;
    } else if (pointers.size === 2 && pinchDistance > 0) {
      camera.zoom = THREE.MathUtils.clamp(
        (pinchZoom * pointerDistance()) / pinchDistance,
        1,
        2.6,
      );
      camera.updateProjectionMatrix();
      canvas.dataset.souvenirPreviewZoom = String(camera.zoom);
    }
  };
  const up = (event: PointerEvent) => pointers.delete(event.pointerId);
  const wheel = (event: WheelEvent) => {
    event.preventDefault();
    camera.zoom = THREE.MathUtils.clamp(
      camera.zoom - event.deltaY * 0.001,
      1,
      2.6,
    );
    camera.updateProjectionMatrix();
    canvas.dataset.souvenirPreviewZoom = String(camera.zoom);
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", wheel, { passive: false });

  let disposed = false;
  let frame = 0;
  const animate = () => {
    if (disposed) return;
    if (!pointers.size) model.rotation.y += 0.0024;
    const time = performance.now();
    model.position.y = -0.08 + Math.sin(time * 0.0014) * 0.035;
    renderer.render(scene, camera);
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
    delete canvas.dataset.souvenirPreviewMeshCount;
    delete canvas.dataset.souvenirPreviewKind;
    delete canvas.dataset.souvenirPreviewZoom;
    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      materials.forEach((material) => material.dispose());
    });
    renderer.dispose();
  };
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
  const interiorShape =
    options.location === "interior"
      ? stringParameter(
          options.scene.objects.find(
            (object) => object.prefab === "room-shell",
          ) ?? {
            id: "room-shell-fallback",
            prefab: "room-shell",
            position: [0, 0, 0],
          },
          "shape",
          "rectangular",
        )
      : "";
  const isLoftInterior = interiorShape.includes("loft");
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
  const souvenirModels: THREE.Object3D[] = [];
  world.traverse((object) => {
    if (typeof object.userData.souvenirKind === "string")
      souvenirModels.push(object);
  });
  const souvenirMeshCounts = souvenirModels.map((model) => {
    let count = 0;
    model.traverse((object) => {
      if (object instanceof THREE.Mesh) count += 1;
    });
    return count;
  });
  canvas.dataset.topiaSouvenirModelCount = String(souvenirModels.length);
  canvas.dataset.topiaSouvenirMeshCount = String(
    souvenirMeshCounts.reduce((total, count) => total + count, 0),
  );
  canvas.dataset.topiaSouvenirMinMeshCount = String(
    souvenirMeshCounts.length ? Math.min(...souvenirMeshCounts) : 0,
  );
  if (options.location === "exterior") {
    world.add(
      exteriorGroundDetails(
        options.scene,
        options.renderStyle?.seed ?? options.scene.objects.length * 137,
      ),
    );
  }
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
    const placedCollapsedAnchors: Array<{ x: number; y: number }> = [];
    for (const [
      bindingIndex,
      { anchor, element },
    ] of anchorBindings.entries()) {
      anchor.getWorldPosition(projectedAnchor).project(camera);
      const visible =
        projectedAnchor.z > -1 &&
        projectedAnchor.z < 1 &&
        Math.abs(projectedAnchor.x) < 1.12 &&
        Math.abs(projectedAnchor.y) < 1.12;
      const projectedX =
        (projectedAnchor.x * 0.5 + 0.5) * container.clientWidth;
      const projectedY =
        (-projectedAnchor.y * 0.5 + 0.5) * container.clientHeight;
      let screenX = projectedX;
      let screenY = projectedY;
      if (
        visible &&
        !labelsRevealed &&
        element.classList.contains("topia-landmark")
      ) {
        const minimumDistance = 38;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const overlaps = placedCollapsedAnchors.some(
            (placed) =>
              Math.hypot(screenX - placed.x, screenY - placed.y) <
              minimumDistance,
          );
          if (!overlaps) break;
          const angle = bindingIndex * 2.39996 + attempt * 1.0472;
          const offset = 22 + attempt * 7;
          screenX = projectedX + Math.cos(angle) * offset;
          screenY = projectedY + Math.sin(angle) * offset;
        }
        screenX = THREE.MathUtils.clamp(
          screenX,
          18,
          Math.max(18, container.clientWidth - 18),
        );
        screenY = THREE.MathUtils.clamp(
          screenY,
          18,
          Math.max(18, container.clientHeight - 18),
        );
        placedCollapsedAnchors.push({ x: screenX, y: screenY });
      }
      element.style.left = `${screenX}px`;
      element.style.top = `${screenY}px`;
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
  const initialPitch =
    options.location === "interior"
      ? options.scene.camera.pitch
      : Math.min(options.scene.camera.pitch, 0.42);
  let targetPitch = initialPitch;
  let currentPitch = targetPitch;
  const pointers = new Map<number, { x: number; y: number }>();
  let lastX = 0;
  let lastY = 0;
  let pinchDistance = 0;
  let pinchZoom = 1;
  camera.zoom = options.location === "exterior" ? 1.12 : 1;
  const resize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    renderer.setSize(width, height, false);
    const aspect = width / Math.max(1, height);
    const view =
      options.location === "exterior"
        ? 3.98
        : isLoftInterior
          ? 4.38
          : interiorShape === "courtyard-ring"
            ? 4.2
            : 4.05;
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
        2.4,
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
      camera.zoom - event.deltaY * 0.00085,
      0.78,
      2.4,
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
    camera.lookAt(0, isLoftInterior ? 1.48 : 1, 0);
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
    world.position.y =
      (options.location === "exterior" ? 0.2 : 0) +
      Math.sin(now * 0.00055) * 0.05;
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
          if (
            child.userData.topiaSouvenirFlame &&
            child instanceof THREE.Mesh
          ) {
            const phase = now * 0.006 + Number(child.userData.flameIndex ?? 0);
            child.scale.y =
              Number(child.userData.baseScaleY ?? 1) *
              (0.84 + (Math.sin(phase) + 1) * 0.13);
            child.rotation.y = Math.sin(phase * 0.7) * 0.12;
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
    delete canvas.dataset.topiaSouvenirModelCount;
    delete canvas.dataset.topiaSouvenirMeshCount;
    delete canvas.dataset.topiaSouvenirMinMeshCount;
    container.classList.remove("webgl-ready");
  };
}
