import * as THREE from "three";
import type { MoodKind } from "../models";

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
    exposure: 1.0,
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

const C = {
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
  blanket: 0x8995ff,
  cloud: 0xf7fbff,
};

function mat(color: number, roughness = 0.82) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.03,
    flatShading: true,
  });
}
function mesh(geometry: THREE.BufferGeometry, color: number) {
  const value = new THREE.Mesh(geometry, mat(color));
  value.castShadow = true;
  value.receiveShadow = true;
  return value;
}
function block(
  w: number,
  h: number,
  d: number,
  color: number,
  x: number,
  y: number,
  z: number,
) {
  const value = mesh(new THREE.BoxGeometry(w, h, d), color);
  value.position.set(x, y, z);
  return value;
}
function glow(geometry: THREE.BufferGeometry, color: number) {
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.6,
      roughness: 0.35,
      flatShading: true,
    }),
  );
}

function cloud(x: number, y: number, z: number, scale: number) {
  const group = new THREE.Group();
  [
    [-0.55, 0, 0, 0.65],
    [0, 0.12, 0, 0.82],
    [0.62, -0.03, 0.03, 0.56],
    [0.1, -0.16, 0.08, 0.72],
  ].forEach(([px, py, pz, s]) => {
    const puff = mesh(new THREE.IcosahedronGeometry(0.75, 1), C.cloud);
    puff.position.set(px, py, pz);
    puff.scale.set(s, s * 0.72, s);
    group.add(puff);
  });
  group.position.set(x, y, z);
  group.scale.setScalar(scale);
  return group;
}

function plant(x: number, z: number) {
  const group = new THREE.Group(),
    pot = mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.35, 6), C.coral);
  pot.position.y = 0.18;
  group.add(pot);
  [
    [-0.13, 0.52, 0, -0.42],
    [0.13, 0.57, 0.03, 0.38],
    [0, 0.69, -0.05, 0.05],
  ].forEach(([px, py, pz, rotation]) => {
    const leaf = mesh(new THREE.IcosahedronGeometry(0.24, 1), C.mint);
    leaf.scale.set(0.6, 1, 0.45);
    leaf.position.set(px, py, pz);
    leaf.rotation.z = rotation;
    group.add(leaf);
  });
  group.position.set(x, 0.06, z);
  return group;
}

function crystal(x: number, y: number, z: number, color: number, scale = 1) {
  const value = glow(new THREE.OctahedronGeometry(0.18 * scale, 0), color);
  value.position.set(x, y, z);
  value.scale.y = 1.6;
  return value;
}

function fantasySky(look: MoodLook, paletteMix: number) {
  const neutral = moodLooks.neutral;
  const color = (base: number, target: number) =>
    new THREE.Color(base).lerp(new THREE.Color(target), paletteMix);
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uMagic: { value: 0.42 + paletteMix * 0.58 },
      uTop: { value: color(neutral.skyTop, look.skyTop) },
      uMid: { value: color(neutral.skyMid, look.skyMid) },
      uLow: { value: color(neutral.skyLow, look.skyLow) },
      uAurora: { value: color(neutral.aurora, look.aurora) },
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
        float horizon=1.0-smoothstep(.0,.22,abs(height-.43));
        color+=uAurora*horizon*.075*uMagic;
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

  const count = 150,
    positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) {
    const y = -0.08 + (index / (count - 1)) * 1.04,
      radial = Math.sqrt(Math.max(0, 1 - y * y)),
      angle = index * 2.399963;
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
      color: color(neutral.stars, look.stars),
      size: 0.16,
      transparent: true,
      opacity: THREE.MathUtils.lerp(0.5, look.sparkleOpacity, paletteMix),
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  group.add(stars);

  const celestial = new THREE.Group();
  celestial.position.set(-8.5, 10, -17);
  const orbColor = color(neutral.celestial, look.celestial);
  const aura = new THREE.Mesh(
    new THREE.CircleGeometry(1.55, 32),
    new THREE.MeshBasicMaterial({
      color: orbColor,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  celestial.add(aura);
  const orb = new THREE.Mesh(
    new THREE.CircleGeometry(0.76, 32),
    new THREE.MeshBasicMaterial({
      color: orbColor,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    }),
  );
  orb.position.z = 0.05;
  celestial.add(orb);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.18, 0.035, 8, 48),
    new THREE.MeshBasicMaterial({
      color: color(neutral.aurora, look.aurora),
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  ring.position.z = 0.08;
  ring.rotation.z = -0.28;
  celestial.add(ring);
  group.add(celestial);
  return { group, skyMaterial, stars, celestial, ring };
}

function floatingRoom(stage: number) {
  const room = new THREE.Group();
  const base = mesh(
    new THREE.CylinderGeometry(3.65, 3.35, 0.42, 10),
    C.woodDark,
  );
  base.position.y = -0.36;
  base.scale.z = 0.76;
  room.add(base);
  room.add(block(6.25, 0.2, 4.35, C.cream, 0, -0.08, 0));
  room.add(
    block(6.25, 3.25, 0.16, C.wall, 0, 1.53, -2.12),
    block(0.16, 3.25, 4.25, C.wall, -3.04, 1.53, 0),
  );
  room.add(
    block(6.35, 0.16, 0.2, C.wood, 0, 3.13, -2.03),
    block(0.18, 3.3, 0.22, C.wood, -3.0, 1.56, -2.02),
    block(0.18, 3.3, 0.22, C.wood, 3.0, 1.56, -2.02),
  );

  // A glowing sky window makes the cutaway room feel like a drifting cabin.
  const window = glow(new THREE.PlaneGeometry(2.4, 1.35), C.sky);
  window.position.set(1.05, 1.95, -2.025);
  room.add(window);
  room.add(
    block(2.62, 0.1, 0.08, C.ink, 1.05, 2.66, -1.97),
    block(2.62, 0.1, 0.08, C.ink, 1.05, 1.25, -1.97),
    block(0.1, 1.5, 0.08, C.ink, -0.28, 1.95, -1.97),
    block(0.1, 1.5, 0.08, C.ink, 2.38, 1.95, -1.97),
    block(0.08, 1.42, 0.07, C.ink, 1.05, 1.95, -1.92),
  );

  // Bed, blanket and bedside crystal.
  room.add(
    block(2.2, 0.38, 1.35, C.woodDark, 1.7, 0.18, 0.86),
    block(2.05, 0.25, 1.2, C.cream, 1.7, 0.49, 0.86),
    block(1.12, 0.1, 1.22, C.blanket, 2.12, 0.67, 0.86),
    block(0.55, 0.16, 0.78, C.lavender, 0.98, 0.66, 0.86),
  );
  room.add(
    block(0.48, 0.45, 0.48, C.wood, 0.3, 0.22, 1.3),
    crystal(0.3, 0.72, 1.3, C.yellow, 1.15),
  );

  // Star-map desk and shelves.
  room.add(block(1.85, 0.16, 0.82, C.wood, -1.42, 1.02, -1.45));
  [-2.18, -0.66].forEach((x) =>
    room.add(
      block(0.13, 0.93, 0.13, C.woodDark, x, 0.5, -1.66),
      block(0.13, 0.93, 0.13, C.woodDark, x, 0.5, -1.23),
    ),
  );
  const map = glow(new THREE.CircleGeometry(0.55, 6), C.blue);
  map.rotation.x = -Math.PI / 2;
  map.position.set(-1.42, 1.12, -1.44);
  room.add(map);
  room.add(
    crystal(-2.12, 1.33, -1.42, C.coral, 0.8),
    crystal(-0.76, 1.29, -1.42, C.sky, 0.72),
  );
  room.add(
    block(0.72, 0.1, 0.48, C.woodDark, -1.43, 0.52, -0.45),
    block(0.1, 0.52, 0.1, C.wood, -1.7, 0.25, -0.6),
    block(0.1, 0.52, 0.1, C.wood, -1.16, 0.25, -0.6),
  );

  // Left-wall library and window garden.
  room.add(block(0.35, 2.25, 1.35, C.wood, -2.78, 1.25, -0.88));
  [-0.35, 0.25, 0.85].forEach((y) =>
    room.add(block(0.42, 0.09, 1.24, C.woodDark, -2.57, 1.03 + y, -0.88)),
  );
  [C.coral, C.blue, C.yellow, C.mint].forEach((color, index) =>
    room.add(
      block(
        0.19,
        0.42,
        0.22,
        color,
        -2.53,
        0.43 + (index % 2) * 0.62,
        -1.28 + index * 0.29,
      ),
    ),
  );
  room.add(plant(-2.55, 0.82), plant(2.55, -1.42));

  // Hearth, rug, lantern and small magical details.
  room.add(
    block(1.05, 0.95, 0.48, C.woodDark, -2.35, 0.47, 1.62),
    block(0.65, 0.57, 0.05, C.ink, -2.35, 0.43, 1.37),
  );
  const fire = glow(new THREE.ConeGeometry(0.23, 0.5, 5), C.yellow);
  fire.position.set(-2.35, 0.42, 1.33);
  room.add(fire);
  const rug = mesh(new THREE.CircleGeometry(1.15, 12), C.lavender);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(-0.35, 0.035, 0.45);
  rug.scale.z = 0.72;
  room.add(rug);
  room.add(block(0.08, 1.15, 0.08, C.woodDark, -0.2, 2.74, -0.3));
  const lantern = glow(new THREE.IcosahedronGeometry(0.28, 1), C.yellow);
  lantern.position.set(-0.2, 2.16, -0.3);
  room.add(lantern);
  const lampLight = new THREE.PointLight(0xffd978, 2.6, 5);
  lampLight.position.copy(lantern.position);
  room.add(lampLight);

  // Airship hardware mounted outside the room.
  room.add(
    block(0.14, 2.25, 0.14, C.woodDark, 2.72, 1.03, 1.73),
    block(1.18, 0.1, 0.1, C.wood, 2.18, 1.92, 1.73),
  );
  const pennant = mesh(new THREE.ConeGeometry(0.44, 1.05, 3), C.coral);
  pennant.rotation.z = Math.PI / 2;
  pennant.position.set(1.68, 1.91, 1.73);
  room.add(pennant);
  const hub = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.36, 8), C.yellow);
  hub.rotation.z = Math.PI / 2;
  hub.position.set(3.3, 0.68, 0.3);
  room.add(hub);
  [0, Math.PI / 2].forEach((rotation) => {
    const blade = block(0.12, 1.35, 0.25, C.blue, 3.5, 0.68, 0.3);
    blade.rotation.x = rotation;
    room.add(blade);
  });

  for (let index = 0; index < stage * 4; index++) {
    const color = index % 3 === 0 ? C.coral : index % 2 ? C.sky : C.yellow;
    room.add(
      crystal(
        -2.6 + ((index * 1.37) % 5.2),
        0.2 + (index % 3) * 0.3,
        -1.7 + ((index * 0.83) % 3.2),
        color,
        0.45,
      ),
    );
  }
  room.add(
    cloud(-3.4, -1.0, -1.1, 0.85),
    cloud(3.4, -1.15, 0.5, 0.72),
    cloud(0.5, -1.35, 2.2, 0.65),
  );
  return room;
}

export function mountTopiaScene(
  canvas: HTMLCanvasElement,
  mood: MoodKind = "neutral",
  intensity = 0,
) {
  const container = canvas.parentElement;
  if (!container) return () => undefined;
  const look = moodLooks[mood] ?? moodLooks.neutral,
    mix = THREE.MathUtils.clamp(intensity / 100, 0, 1),
    paletteMix = mood === "neutral" ? 1 : 0.45 + mix * 0.55;
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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = THREE.MathUtils.lerp(1.12, look.exposure, mix);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(
    look.fog,
    THREE.MathUtils.lerp(0.018, look.fogDensity, mix),
  );
  const camera = new THREE.OrthographicCamera(-5, 5, 3, -3, 0.1, 100);
  const backdrop = fantasySky(look, paletteMix);
  scene.add(backdrop.group);
  backdrop.group.remove(backdrop.celestial);
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
  const stage = Number(
      [...container.classList]
        .find((value) => value.startsWith("stage-"))
        ?.slice(6) ?? 1,
    ),
    world = floatingRoom(stage);
  scene.add(world);
  const sparkleGeometry = new THREE.BufferGeometry(),
    sparklePositions = new Float32Array(42 * 3);
  for (let index = 0; index < 42; index++) {
    const angle = index * 2.39996,
      radius = 3.7 + (index % 7) * 0.38;
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
  const driftingClouds = new THREE.Group();
  driftingClouds.add(
    cloud(-4.7, -1.1, -2.8, 0.62),
    cloud(4.5, -0.75, -1.8, 0.5),
    cloud(0.6, 3.8, -4.3, 0.42),
  );
  driftingClouds.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = false;
      object.receiveShadow = false;
      const material = object.material as THREE.MeshStandardMaterial;
      material.transparent = true;
      material.opacity = 0.34;
      material.depthWrite = false;
    }
  });
  scene.add(driftingClouds);
  const ambientGlow = new THREE.PointLight(look.glow, 1.1, 11);
  ambientGlow.position.set(0, 2.2, 1.5);
  scene.add(ambientGlow);
  container.classList.add("webgl-ready");
  let frame = 0,
    disposed = false,
    targetYaw = 0.68,
    currentYaw = 0.68,
    targetPitch = 0.55,
    currentPitch = 0.55;
  const pointers = new Map<number, { x: number; y: number }>();
  let lastX = 0,
    lastY = 0,
    pinchDistance = 0,
    pinchZoom = 1;
  const resize = () => {
    const width = container.clientWidth,
      height = container.clientHeight;
    renderer.setSize(width, height, false);
    const aspect = width / Math.max(1, height),
      view = 4.05;
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
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
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
    const radius = 9.5,
      flat = radius * Math.cos(currentPitch);
    camera.position.set(
      Math.sin(currentYaw) * flat,
      1 + Math.sin(currentPitch) * radius,
      Math.cos(currentYaw) * flat,
    );
    camera.lookAt(0, 1, 0);
    backdrop.skyMaterial.uniforms.uTime.value = now * 0.001;
    backdrop.stars.rotation.y = now * 0.000012;
    backdrop.ring.rotation.z = -0.28 + now * 0.000035;
    backdrop.celestial.scale.setScalar(1 + Math.sin(now * 0.0007) * 0.035);
    world.position.y = Math.sin(now * 0.00055) * 0.05;
    sparkles.rotation.y = now * 0.000045;
    sparkles.position.y = Math.sin(now * 0.0007) * 0.08;
    driftingClouds.position.x =
      Math.sin(now * THREE.MathUtils.lerp(0.00012, look.cloudSpeed, mix)) *
      0.65;
    driftingClouds.position.y = Math.cos(now * 0.0002) * 0.08;
    ambientGlow.intensity =
      1.05 + Math.sin(now * (mood === "angry" ? 0.004 : 0.0011)) * 0.24;
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
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((value) => value.dispose());
      }
    });
    renderer.dispose();
    container.classList.remove("webgl-ready");
  };
}
