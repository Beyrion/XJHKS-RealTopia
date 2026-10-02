import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "../phone/app/node_modules/playwright-core/index.mjs";

let fixture = JSON.parse(await readFile(new URL("../phone/app/src-tauri/src/topia/mock_world.json", import.meta.url), "utf8"));
if (process.env.REALTOPIA_STUDIO_FIXTURE) {
  const studio=JSON.parse(await readFile(process.env.REALTOPIA_STUDIO_FIXTURE,"utf8"));
  fixture=studio.worlds.find(w=>w.id===studio.activeWorldId);
  for(const location of ["exterior","interior","garden"])fixture.scenes[location].objects.push(...studio.assets.objects[location]);
}
const browser = await chromium.launch({ executablePath: process.env.REALTOPIA_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage();
  await page.goto(process.env.REALTOPIA_HARNESS_URL ?? "http://127.0.0.1:4187");
  const results = await page.evaluate(async fixture => {
    const { reviewTopiaWorld } = await import("/src/utils/topiaScene.ts");
    const results = [];
    for (const shape of ["rectangular", "courtyard-ring", "terraced-loft", "cantilever-loft", "crystal-grotto"]) {
      const world = structuredClone(fixture);
      world.renderStyle = {kind:"storybook-ink",seed:73,roughness:.8,metalness:.01,saturation:1,contrast:1,textureStrength:.2};
      world.scenes.interior.objects.find(o=>o.prefab==="room-shell").params = {shape};
      for (const [i,kind] of ['pergola','planter-box','stone-path','balustrade','book-nook'].entries()) {
        const scene=world.scenes[['exterior','interior','garden'][i%3]];
        scene.objects.push({id:`crafted-detail-qa-${i}`,prefab:'block',layer:'structure',position:[6,5,6],scale:[.75,.75,.75],params:{detailKind:kind},colors:[0x7cab88,0xccbb88,0x88bbee]});
      }
      for (const scene of Object.values(world.scenes)) for (const object of scene.objects) {
        if (["bed", "desk", "chair", "shelf", "crop-plot", "plant"].includes(object.prefab)) { object.position = [6,5,6]; object.animation = "float"; }
      }
      const first = reviewTopiaWorld(world, []);
      const next = reviewTopiaWorld(first.world, []);
      results.push({shape,feedback:first.feedback,issues:first.issues,next:next.feedback,objects:first.world.scenes.interior.objects.map(o=>({id:o.id,prefab:o.prefab,position:o.position,animation:o.animation})),before:Object.values(world.scenes).flatMap(s=>s.objects.map(o=>o.id)),after:Object.values(first.world.scenes).flatMap(s=>s.objects.map(o=>o.id))});
    }
    return results;
  }, fixture);
  console.log(JSON.stringify(results.map(({shape,feedback,next,issues})=>({shape,feedback,next,issues})), null, 2));
  for (const result of results) {
    assert.deepEqual(result.after, result.before, "constraints must preserve every existing object and ID");
    assert.equal(result.feedback.unsupported, 0, `${result.shape}: unresolved supports`);
    assert.equal(result.feedback.overlaps, 0, `${result.shape}: unresolved packing`);
    assert.equal(result.next.grounded, 0, "grounding should be idempotent");
    assert.equal(result.next.repositioned, 0, "placement should be idempotent");
    assert.equal(result.feedback.renderedViews, 3, "all views must actually render");
    assert(result.objects.filter(o=>["bed","desk","chair","shelf","plant"].includes(o.prefab)).every(o=>o.animation!=="float"));
  }
  console.log("Topia mesh-space grounding, asset transfer, packing and three-view rendering passed.");
  const residential = await page.evaluate(async fixture => {
    const {reviewTopiaWorld}=await import('/src/utils/topiaScene.ts');
    const {attachSouvenirsToTopia}=await import('/src/utils/souvenir.ts');
    const world=structuredClone(fixture);
    const interior=world.scenes.interior;
    interior.objects.find(o=>o.prefab==='room-shell').params={shape:'rectangular'};
    for(let i=0;i<8;i++)interior.objects.push({id:`fixture-keepsake-${i}`,prefab:'crystal',layer:'souvenir',position:[i*.5,.2,0],params:{souvenirKind:'star-map'}});
    const curated=attachSouvenirsToTopia(world,[]).world;
    const first=reviewTopiaWorld(curated,[]);
    const exhibits=first.world.scenes.interior.objects.filter(o=>o.layer==='souvenir');
    const cabinet=first.world.scenes.interior.objects.find(o=>o.params?.detailKind==='display-cabinet');
    return {feedback:first.feedback,issues:first.issues,exhibits,cabinet,ids:Object.values(first.world.scenes).flatMap(s=>s.objects.map(o=>o.id)),second:reviewTopiaWorld(first.world,[]).feedback};
  },fixture);
  console.log(JSON.stringify({residential},null,2));
  assert.equal(residential.exhibits.length,3);
  assert.equal(residential.ids.filter(id=>id.startsWith('fixture-keepsake-')).length,8);
  assert.equal(residential.feedback.unsupported,0);
  assert.equal(residential.feedback.overlaps,0);
  assert(residential.exhibits.every(o=>o.position[1]>residential.cabinet.position[1]+.6),'exhibits must rest on cabinet, not room floor');
  assert.equal(residential.second.repositioned,0);
  assert.equal(residential.second.grounded,0);
} finally { await browser.close(); }
