import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const directory='phone/.build/harness-v3-device';
const load=async name=>JSON.parse(await readFile(`${directory}/${name}-studio.json`,'utf8'));
const a=await load('generate-6'),b=await load('generate-7'),iteration=await load('iterate-7');
const active=studio=>studio.worlds.find(w=>w.id===studio.activeWorldId);
const signature=scene=>scene.objects.filter(o=>o.layer==='structure')
  .map(o=>JSON.stringify({prefab:o.prefab,position:o.position.map(v=>Math.round(v*2)),scale:o.scale,rotation:o.rotation,
    params:Object.fromEntries(Object.entries(o.params??{}).filter(([k])=>['shape','radius','width','height','depth','detailKind'].includes(k)).sort(([a],[b])=>a.localeCompare(b)))})).sort();
const worlds=[active(a),active(b)];
const result={worlds:worlds.map(w=>({id:w.id,name:w.profile.displayName,model:w.generation.model,version:w.generation.promptVersion})),locations:[]};
for(const location of ['exterior','interior','garden']) {
  const x=signature(worlds[0].scenes[location]),y=signature(worlds[1].scenes[location]);
  assert.notDeepEqual(x,y,`${location}: geometry must differ without comparing colors or IDs`);
  assert.deepEqual(signature(active(iteration).scenes[location]),y,`${location}: incremental iteration must preserve core geometry`);
  for(const world of worlds)assert.equal(world.scenes[location].objects.filter(o=>o.params?.detailKind).length,3);
  result.locations.push({location,paletteIndependentGeometryDifferent:true,detailsPerWorld:3,incrementalCorePreserved:true});
}
for(const index of [6,7]) {
  const log=await readFile(`${directory}/generate-${index}.log`,'utf8');
  const last=log.slice(log.lastIndexOf('generation-start'));
  assert(!last.includes('local-fallback')&&!last.includes('local-reassembly'));
  for(const stage of ['design-brief','concept','exterior-blueprint','interior-blueprint','garden-blueprint','detail-plan','detail-review'])assert(last.includes(`request-ok stage=${stage}`));
  assert(last.includes('unsupported=0 overlaps=0 views=3'));
}
const original=JSON.parse(await readFile(`${directory}/before-studio.json`,'utf8'));
assert(original.worlds.every(w=>iteration.worlds.some(current=>current.id===w.id)));
result.originalWorldsPreserved=original.worlds.length;
console.log(JSON.stringify(result,null,2));
