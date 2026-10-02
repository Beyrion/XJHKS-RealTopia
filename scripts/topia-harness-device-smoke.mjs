import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Explicit USB target: never choose between the phone and glasses implicitly.
const serial = process.env.REALTOPIA_DEVICE;
assert(serial, 'set REALTOPIA_DEVICE to the intended adb device serial');
const packageName = 'com.realtopia.phone';
const port = 19223;
const directory = path.resolve('phone/.build/harness-v3-device');
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], {maxBuffer: 20_000_000});
const state = () => JSON.parse(adb('shell','run-as',packageName,'cat','topia-studio-v2.json').toString());
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
await mkdir(directory,{recursive:true,mode:0o700});
const pid = adb('shell','pidof',packageName).toString().trim();
assert(/^\d+$/.test(pid), 'app must already be running');
adb('forward',`tcp:${port}`,`localabstract:webview_devtools_remote_${pid}`);
let socket;
try {
  const targets = await fetch(`http://127.0.0.1:${port}/json`).then(r=>r.json());
  const target = targets.find(t=>t.type==='page' && t.title==='RealTopia Link');
  assert(target, 'app WebView unavailable');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let sequence=0;
  const evaluate = expression => new Promise((resolve,reject)=>{
    const id=++sequence;
    const timeout=setTimeout(()=>{socket.removeEventListener('message',listener);reject(new Error('WebView evaluation timed out'));},60000);
    const listener = event => {
      const message=JSON.parse(event.data);
      if(message.id!==id)return;
      clearTimeout(timeout);socket.removeEventListener('message',listener);
      if(message.error||message.result.exceptionDetails)reject(new Error(JSON.stringify(message.error??message.result.exceptionDetails)));
      else resolve(message.result.result.value);
    };
    socket.addEventListener('message',listener);
    socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));
  });
  const click = async (selector,text) => {
    assert(await evaluate(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>${text?`b.textContent.trim()===${JSON.stringify(text)}`:'true'});if(!b||b.disabled)return false;b.click();return true;})()`),`missing button ${text??selector}`);
    await pause(180);
  };
  const config=await evaluate('window.__TAURI_INTERNALS__.invoke("cloud_config")');
  console.log(JSON.stringify({provider:config.provider,model:config.model,hasApiKey:config.has_api_key}));
  assert.equal(config.model,'deepseek-flash');
  assert(config.has_api_key,'configured cloud key is required');
  const before=state();
  const mode=process.argv[2]??'inspect';
  if(mode==='snapshot'||mode==='snapshot-update') {
    const prefix=mode==='snapshot-update'?'before-residential-update':'before';
    await writeFile(path.join(directory,`${prefix}-studio.json`),JSON.stringify(before),{mode:0o600});
    const storage=await evaluate('Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith("realtopia.")))');
    await writeFile(path.join(directory,`${prefix}-storage.json`),JSON.stringify(storage),{mode:0o600});
    console.log(JSON.stringify({worlds:before.worlds.length,active:before.activeWorldId}));
  } else if(mode==='restore-missing'||mode==='verify-data') {
    const original=JSON.parse(await readFile(path.join(directory,'before-studio.json'),'utf8'));
    const context=await evaluate('Object.fromEntries(["quests","people","memories"].map(key=>[key,JSON.parse(localStorage.getItem("realtopia."+key)||"[]")]))');
    const missing=original.worlds.filter(w=>!before.worlds.some(current=>current.id===w.id));
    if(mode==='verify-data') {
      assert.equal(missing.length,0,'original history must be preserved');
      const update=JSON.parse(await readFile(path.join(directory,'before-residential-update-studio.json'),'utf8'));
      assert(update.worlds.every(w=>before.worlds.some(current=>current.id===w.id)),'every world present before this update must survive');
      const storage=JSON.parse(await readFile(path.join(directory,'before-residential-update-storage.json'),'utf8'));
      const saved=JSON.parse(storage['realtopia.souvenirs.v1']??'[]');
      const current=await evaluate('JSON.parse(localStorage.getItem("realtopia.souvenirs.v1")??"[]").map(s=>s.id)');
      assert(saved.every(s=>current.includes(s.id)),'all saved souvenirs must survive update');
    }
    else for(const saved of missing) {
      const world=structuredClone(saved);
      for(const location of ['exterior','interior','garden']) {
        const scene=world.scenes[location];
        const ids=new Set(scene.objects.map(o=>o.id));
        scene.objects.push(...before.assets.objects[location].filter(o=>!ids.has(o.id)));
        const anchors=new Set(scene.landmarks.map(o=>o.anchorId));
        scene.landmarks.push(...before.assets.landmarks[location].filter(o=>!anchors.has(o.anchorId)));
      }
      // Local save only; preserve exact relations and shared assets. No existing
      // world is overwritten, and no personal data is sent to the cloud.
      await evaluate(`window.__TAURI_INTERNALS__.invoke("save_topia_world",${JSON.stringify({world,context})})`);
    }
    if(mode==='restore-missing'&&missing.length)await evaluate(`window.__TAURI_INTERNALS__.invoke("switch_topia_world",${JSON.stringify({worldId:before.activeWorldId,context})})`);
    const after=state();
    console.log(JSON.stringify({originalWorlds:original.worlds.length,missing:missing.map(w=>w.id),worlds:after.worlds.length}));
  } else if(mode==='cleanup-tests') {
    const original=JSON.parse(await readFile(path.join(directory,'before-studio.json'),'utf8'));
    const ids=process.argv.slice(3);
    assert(ids.length>0,'cleanup-tests requires explicit disposable test world IDs');
    const context=await evaluate('Object.fromEntries(["quests","people","memories"].map(key=>[key,JSON.parse(localStorage.getItem("realtopia."+key)||"[]")]))');
    assert(ids.every(id=>!original.worlds.some(w=>w.id===id)),'never delete original user worlds');
    assert(!ids.includes(before.activeWorldId),'keep the current final world');
    await writeFile(path.join(directory,'before-test-cleanup-studio.json'),JSON.stringify(before),{mode:0o600});
    const removed=[];
    for(const id of ids) {
      const world=before.worlds.find(w=>w.id===id);
      if(!world)continue;
      assert.equal(world.generation.promptVersion,'topia-spatial-harness-v3');
      await evaluate(`window.__TAURI_INTERNALS__.invoke("delete_topia_world",${JSON.stringify({worldId:id,context})})`);
      removed.push(id);
    }
    const after=state();
    assert(original.worlds.every(w=>after.worlds.some(current=>current.id===w.id)));
    console.log(JSON.stringify({removed,originalWorldsPreserved:original.worlds.length,worlds:after.worlds.length,active:after.activeWorldId}));
  } else if(mode==='souvenir') {
    const start=performance.now();
    const input={title:'和朋友修复旧花园的木制信箱',body:'两人一起打磨木板、安装黄铜铰链，把庭院的旧信箱修好，种上一株薄荷。',steps:['打磨木板','安装铰链','栽种薄荷'],personName:'测试同伴',recentKinds:['sprout-lantern','star-compass']};
    const design=await evaluate(`window.__TAURI_INTERNALS__.invoke("design_topia_souvenir",${JSON.stringify({input})})`);
    assert(design.name && design.description);
    assert.equal(design.colors.length,3);
    assert(design.ornaments.length>0);
    await writeFile(path.join(directory,'souvenir-design.json'),JSON.stringify(design),{mode:0o600});
    console.log(JSON.stringify({elapsedMs:performance.now()-start,...design}));
    const log=adb('shell','run-as',packageName,'cat','logs/realtopia-backend.log').toString();
    const excerpt=log.slice(log.lastIndexOf('request-start stage=souvenir-design'));
    console.log(excerpt);
    assert(excerpt.includes('request-ok stage=souvenir-design')&&excerpt.includes('request-ok stage=souvenir-review'),'both real cloud passes must succeed');
    assert.equal(state().worlds.length,before.worlds.length,'designing a souvenir must not mutate worlds');
  } else if(mode==='zoom') {
    await click('[data-topia-location="interior"]');
    const audit=await evaluate(`(async()=>{const c=document.querySelector('canvas[data-topia-zoom]');const sample=()=>({zoom:Number(c.dataset.topiaZoom),labels:document.querySelectorAll('.topia-anchor-visible:not(.topia-anchor-collapsed)').length});const wait=()=>new Promise(r=>setTimeout(r,500));c.dispatchEvent(new WheelEvent('wheel',{deltaY:10000,cancelable:true}));await wait();c.dispatchEvent(new WheelEvent('wheel',{deltaY:-590,cancelable:true}));await wait();const below=sample();c.dispatchEvent(new WheelEvent('wheel',{deltaY:-300,cancelable:true}));await wait();const above=sample();c.dispatchEvent(new WheelEvent('wheel',{deltaY:-10000,cancelable:true}));await wait();const maximum=sample();c.dispatchEvent(new WheelEvent('wheel',{deltaY:10000,cancelable:true}));await wait();return{below,above,maximum};})()`);
    console.log(JSON.stringify(audit));
    assert(audit.below.zoom<2.2 && audit.below.labels===0,'labels should remain light spots below the new threshold');
    assert(audit.above.zoom>=2.2 && audit.above.labels<=3);
    assert.equal(audit.maximum.zoom,5.5);
    assert(audit.maximum.labels<=5);
  } else if(mode==='render-final') {
    for(const location of ['exterior','interior','garden']) {
      await click(`[data-topia-location="${location}"]`);await pause(1100);
      const metrics=await evaluate('({...document.querySelector("canvas[data-topia-unsupported]").dataset})');
      assert.equal(metrics.topiaUnsupported,'0');assert.equal(metrics.topiaOverlaps,'0');
      console.log(JSON.stringify({location,metrics}));
      await writeFile(path.join(directory,`final-${location}.png`),adb('exec-out','screencap','-p'),{mode:0o600});
    }
  } else if(mode==='generate'||mode==='iterate') {
    const index=Number(process.argv[3]??0);
    const choices=index%2===0 ? [
      ['追逐未知的观星者','让火花重新排序'],['听见清脆而遥远的回声','在高低之间轻轻跳跃'],['风经过时展开的纸船','云层短暂露出缺口'],['手工肌理']
    ] : [
      ['照料日常的园丁','找到同伴再出发'],['粗糙表面藏着柔光','绕着隐形中心缓慢旋转'],['没有寄出的透明信封','一句话落下后的余音'],['柔软温暖']
    ];
    if(await evaluate('!!document.querySelector(".topia-studio-dialog")'))await click('[aria-label="关闭 Topia 工坊"]');
    await click('[aria-label="打开 Topia 工坊"]');
    if(mode==='generate') {
      await click('.topia-entry-cards button','🎨自定义');
      for(let page=0;page<4;page++) {
        for(let q=0;q<choices[page].length;q++) assert(await evaluate(`(()=>{const f=document.querySelectorAll('.topia-imagery fieldset')[${q}];const b=[...f.querySelectorAll('button')].find(b=>b.textContent.endsWith(${JSON.stringify(choices[page][q])}));if(!b)return false;b.click();return true;})()`));
        if(page<3) await click('.topia-studio-dialog footer button','下一页');
      }
    } else await click('.topia-entry-cards button','🖼️从历史选择');
    await evaluate('window.__harnessResult=null;window.addEventListener("realtopia:topia-world",e=>window.__harnessResult={elapsedMs:performance.now()-window.__harnessStarted,id:e.detail.world.id},{once:true});window.__harnessStarted=performance.now()');
    await click(mode==='generate'?'.topia-studio-dialog footer button':'.topia-iterate',mode==='generate'?'生成新的 Topia':undefined);
    const result=await evaluate('new Promise(resolve=>{if(window.__harnessResult){resolve(window.__harnessResult);return;}const i=setInterval(()=>{if(window.__harnessResult){clearInterval(i);resolve(window.__harnessResult);}},200);})');
    assert(result,'generation did not finish');
    const after=state();
    await writeFile(path.join(directory,`${mode}-${index}-studio.json`),JSON.stringify(after),{mode:0o600});
    const log=adb('shell','run-as',packageName,'cat','logs/realtopia-backend.log').toString();
    await writeFile(path.join(directory,`${mode}-${index}.log`),log,{mode:0o600});
    const lastStart=log.lastIndexOf(mode==='generate'?'generation-start':'stage mode=iterate stage=memory');
    const excerpt=log.slice(lastStart);
    console.log(excerpt.split('\n').filter(l=>l.includes('[topia]')).join('\n'));
    const generatedWorld=after.worlds.find(w=>w.id===result.id);
    if(mode==='generate' && ['topia-spatial-harness-v4','topia-residential-harness-v5'].includes(generatedWorld?.generation?.promptVersion)) {
      assert(!excerpt.includes('local-fallback')&&!excerpt.includes('local-reassembly'),'final QA must have all three actual cloud geometries');
      assert(excerpt.includes('request-ok stage=detail-plan')&&excerpt.includes('request-ok stage=detail-review'),'both actual cloud detail passes must succeed');
    }
    if(mode==='generate' && generatedWorld?.generation?.promptVersion==='topia-residential-harness-v5') {
      const objects=generatedWorld.scenes.interior.objects;
      for(const kind of ['bed','desk','chair','shelf'])assert(objects.some(o=>o.prefab===kind&&o.layer==='structure'&&!o.params?.detailKind),`missing real ${kind}`);
      assert(objects.some(o=>o.id==='room-entry-door'));
      assert(objects.some(o=>o.params?.detailKind==='display-cabinet'));
      assert(objects.find(o=>o.prefab==='room-shell').params.residential);
    }
    console.log(JSON.stringify({mode,index,...result,beforeWorlds:before.worlds.length,afterWorlds:after.worlds.length}));
    if(mode==='generate') {
      assert.equal(await evaluate('document.querySelectorAll(".topia-studio-overlay, .topia-drawer-backdrop").length'),0,'successful creation must close all Topia dialogs');
    } else await click('[aria-label="关闭 Topia 工坊"]');
    for(const location of ['exterior','interior','garden']) {
      await click(`[data-topia-location="${location}"]`);
      await pause(900);
      const metrics=await evaluate('(()=>{const c=document.querySelector("canvas[data-topia-unsupported]");return c?{...c.dataset}:null;})()');
      console.log(JSON.stringify({location,metrics}));
      await writeFile(path.join(directory,`${mode}-${index}-${location}.png`),adb('exec-out','screencap','-p'),{mode:0o600});
      assert.equal(metrics?.topiaUnsupported,'0',`${location}: unsupported objects`);
      assert.equal(metrics?.topiaOverlaps,'0',`${location}: intersecting portable objects`);
      if(location==='interior')assert(Number(metrics?.topiaSouvenirModelCount)<=3,'room must not become a souvenir showroom');
    }
    assert(result.elapsedMs<42000,'generation exceeded twice the previous latency');
    if(mode==='generate')assert.equal(after.worlds.length,before.worlds.length+1);
  } else {
    console.log(JSON.stringify({worlds:before.worlds.length,active:before.activeWorldId,ui:await evaluate('({toast:document.querySelector(".toast")?.textContent,result:window.__harnessResult,canvas:document.querySelector("canvas")?.dataset,scripts:[...document.scripts].map(s=>s.src),buttons:[...document.querySelectorAll("button")].map(b=>({text:b.textContent.trim(),label:b.getAttribute("aria-label")}))})')}));
  }
} finally { socket?.close();adb('forward','--remove',`tcp:${port}`); }
