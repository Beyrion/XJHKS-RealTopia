import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../phone/app/node_modules/esbuild/lib/main.js";
import { chromium } from "../phone/app/node_modules/playwright-core/index.mjs";
import { installTopiaCommandMock } from "./topia-command-mock.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundle = await build({
  stdin: {
    contents: `export { attachSouvenirsToTopia } from "./phone/app/src/utils/souvenir.ts";
      export { bundledSouvenirShowcase } from "./scripts/fixtures/souvenirs.ts";
`,
    resolveDir: root,
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const {
  attachSouvenirsToTopia,
  bundledSouvenirShowcase,
} = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
const createFixtureSouvenir = () => ({ ...structuredClone(bundledSouvenirShowcase[0]), id: "fixture-earned", questId: "fixture-earned", presentation: { ...bundledSouvenirShowcase[0].presentation, preferredLocation: "exterior" } });
const snapshot = process.env.REALTOPIA_DEVICE_SNAPSHOT
  ? JSON.parse(await readFile(process.env.REALTOPIA_DEVICE_SNAPSHOT, "utf8"))
      .result.value
  : null;
const world =
  snapshot?.payload.world ??
  JSON.parse(
    await readFile(
      path.join(root, "phone/app/src-tauri/src/topia/mock_world.json"),
      "utf8",
    ),
  );
const souvenirs = snapshot?.souvenirs ?? [createFixtureSouvenir()];
const collection = [...souvenirs, ...bundledSouvenirShowcase];
const original = JSON.stringify(world);
const composed = attachSouvenirsToTopia(world, collection);
assert.equal(
  JSON.stringify(world),
  original,
  "composition must preserve saved world data",
);
assert.equal(composed.placements.length, collection.length);
const positions = (result) =>
  result.placements.map((placement) => ({
    name: placement.souvenir.name,
    location: placement.location,
    scale: result.world.scenes[placement.location].objects.find(
      (object) => object.anchorId === placement.landmark.anchorId,
    ).scale?.[0] ?? 1,
    position: result.world.scenes[placement.location].objects.find(
      (object) => object.anchorId === placement.landmark.anchorId,
    ).position,
  }));
const assertSeparated = (result) => {
  const placed = positions(result);
  for (let index = 0; index < placed.length; index++) {
    for (const other of placed.slice(index + 1)) {
      if (placed[index].location !== other.location) continue;
      assert.ok(
        Math.hypot(
          ...placed[index].position.map(
            (value, axis) => value - other.position[axis],
          ),
        ) > .7 * (placed[index].scale + other.scale) + .15,
        `${placed[index].name} overlaps ${other.name}`,
      );
    }
  }
};
assertSeparated(composed);
assert(composed.world.scenes.interior.objects.filter(o=>o.layer==='souvenir').length<=3);
assert(composed.world.scenes.interior.objects.filter(o=>o.layer==='souvenir').every(o=>o.params?.displayNiche===true));
// A memory relation is not permission to replace usable furniture with a trophy.
const relatedFurniture=structuredClone(world);
const bed=relatedFurniture.scenes.interior.objects.find(o=>o.prefab==='bed');
bed.taskId=collection[0].questId;
const furnished=attachSouvenirsToTopia(relatedFurniture,collection);
assert.equal(furnished.world.scenes.interior.objects.find(o=>o.id===bed.id).layer,bed.layer);
assert.equal(furnished.world.scenes.interior.objects.find(o=>o.id===bed.id).prefab,'bed');
const trophies=structuredClone(world);
for(let i=0;i<10;i++)trophies.scenes.interior.objects.push({id:`trophy-${i}`,prefab:'crystal',layer:'souvenir',position:[i,0,0]});
const curated=attachSouvenirsToTopia(trophies,[]);
assert.equal(curated.world.scenes.interior.objects.filter(o=>o.layer==='souvenir').length,3);
assert.equal(Object.values(curated.world.scenes).flatMap(s=>s.objects).filter(o=>o.id.startsWith('trophy-')).length,10);
assert.deepEqual(
  positions(attachSouvenirsToTopia(world, collection)),
  positions(composed),
);

// Imported/generated anchors must share occupancy with portable souvenirs.
const colliding = structuredClone(world);
for (const [index, souvenir] of collection.slice(0, 2).entries()) {
  colliding.scenes.exterior.objects.push({
    id: `existing-${index}`,
    anchorId: `existing-${index}`,
    prefab: "crystal",
    layer: "souvenir",
    position: [-1.75, 1.15, 1.18],
  });
  colliding.scenes.exterior.landmarks.push({
    id: `existing-${index}`,
    anchorId: `existing-${index}`,
    location: "exterior",
    emoji: souvenir.emoji,
    label: souvenir.name,
    eyebrow: "纪念品",
    description: "",
    fallbackPlacement: { left: "34%", top: "55%" },
    memoryIds: [],
    taskIds: [souvenir.questId],
    personIds: [],
  });
}
const reused = attachSouvenirsToTopia(colliding, collection);
assertSeparated(reused);
assert.equal(
  reused.placements.filter((item) =>
    item.landmark.anchorId.startsWith("existing-"),
  ).length,
  2,
);
const crowded = Array.from({ length: 24 }, (_, index) => ({
  ...createFixtureSouvenir(),
  id: `crowded-${index}`,
  questId: `crowded-${index}`,
}));
const crowdedResult = attachSouvenirsToTopia(world, crowded);
assertSeparated(crowdedResult);
const overflow = attachSouvenirsToTopia(world, Array.from({length: 90}, (_, index) => ({
  ...crowded[0], id: `overflow-${index}`, questId: `overflow-${index}`,
})));
assert(positions(overflow).every(({position}) => position.every(Number.isFinite)),
  'overflow floor slots must stay finite even after all ordinary slots are full');
assert.ok(
  new Set(crowdedResult.placements.map((item) => item.location)).size > 1,
  "full displays must use empty space in other scenes",
);

const browser = await chromium.launch({
  executablePath:
    process.env.REALTOPIA_CHROME ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 754, height: 347 } });
  await installTopiaCommandMock(page, root, world);
  await page.addInitScript(
    ({ world, souvenirs }) => {
      if (localStorage.getItem("realtopia.souvenirs.v1")) return;
      localStorage.setItem("realtopia.migration.roster-20261002.v2", "done");
      localStorage.setItem("realtopia.souvenirs.v1", JSON.stringify(souvenirs));
      localStorage.setItem(
        "realtopia.topiaStudio.v2",
        JSON.stringify({
          activeWorldId: world.id,
          worlds: [],
          needsOnboarding: false,
          assets: {
            objects: { exterior: [], interior: [], garden: [] },
            landmarks: { exterior: [], interior: [], garden: [] },
            memories: [],
          },
        }),
      );
    },
    { world, souvenirs: collection },
  );
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    process.env.REALTOPIA_PREVIEW_URL ?? "http://127.0.0.1:4173",
    { waitUntil: "networkidle" },
  );
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector("#topia-canvas")?.dataset
          .topiaSouvenirModelCount,
      ) >= 5,
  );
  await page.screenshot({
    path: "/private/tmp/realtopia-souvenirs-separated.png",
  });
  await page.locator(".latest-souvenir").click();
  await page.locator(".topia-drawer").waitFor();
  assert.equal(
    await page.locator("#topia-landmark-title").textContent(),
    souvenirs[0].name,
  );
  assert.equal(await page.locator(".latest-souvenir").count(), 0);
  assert.ok(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("realtopia.souvenirs.v1"))[0].viewedAt,
    ),
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("[data-topia-souvenir]").first().waitFor();
  assert.equal(
    await page.locator(".latest-souvenir").count(),
    0,
    "viewed entry must stay dismissed after restart",
  );
  assert.equal(
    await page.locator(`[data-topia-souvenir="${souvenirs[0].id}"]`).count(),
    1,
    "viewing must preserve the scene souvenir",
  );
  // A new acquisition must reveal the entry again, including the same quest re-earned.
  await page.evaluate(() => {
    const items = JSON.parse(localStorage.getItem("realtopia.souvenirs.v1"));
    delete items[0].viewedAt;
    items[0].acquiredAt = new Date().toISOString();
    localStorage.setItem("realtopia.souvenirs.v1", JSON.stringify(items));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".latest-souvenir").waitFor();
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(`[data-topia-souvenir="${id}"]`)
        ?.getAttribute("data-topia-anchor-bound") === "true",
    souvenirs[0].id,
  );
  await page.locator(`[data-topia-souvenir="${souvenirs[0].id}"]`).click();
  await page.locator(".topia-drawer").waitFor();
  assert.equal(
    await page.locator(".latest-souvenir").count(),
    0,
    "viewing through the scene also dismisses the entry",
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      placements: positions(composed),
      viewedState: "persisted",
      generatedAnchorCollision: "passed",
      crowdedCollection: "24 separated",
    }),
  );
} finally {
  await browser.close();
}
