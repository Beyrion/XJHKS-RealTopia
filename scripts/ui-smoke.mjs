import { chromium } from "../phone/app/node_modules/playwright-core/index.mjs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const base=process.env.REALTOPIA_PREVIEW_URL??"http://127.0.0.1:4173";
const appDir=path.join(root,"phone/app");
let preview=null;
async function reachable(){try{const response=await fetch(base);return response.ok}catch{return false}}
if(!await reachable()){
  preview=spawn(process.execPath,[path.join(appDir,"node_modules/vite/bin/vite.js"),"preview","--host","127.0.0.1","--port","4173","--strictPort"],{cwd:appDir,stdio:["ignore","pipe","pipe"]});
  let startupError="";preview.stdout.on("data",chunk=>{startupError+=chunk.toString()});preview.stderr.on("data",chunk=>{startupError+=chunk.toString()});
  for(let attempt=0;attempt<80&&!await reachable();attempt++)await new Promise(resolve=>setTimeout(resolve,250));
  if(!await reachable()){preview.kill("SIGTERM");throw new Error(`preview server did not start: ${startupError.trim()}`)}
}
const browser=await chromium.launch({executablePath:"/usr/bin/google-chrome",headless:true,args:["--no-sandbox","--disable-gpu","--enable-unsafe-swiftshader"]});
const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const consoleErrors=[],httpErrors=[];page.on("console",message=>{if(message.type()==="error"&&!message.text().startsWith("Failed to load resource"))consoleErrors.push(message.text())});page.on("response",response=>{if(response.status()>=400&&!response.url().endsWith("/favicon.ico"))httpErrors.push(`${response.status()} ${response.url()}`)});
try{
  await page.goto(`${base}/?screen=quests`,{waitUntil:"networkidle"});
  await page.evaluate(()=>localStorage.clear());await page.reload({waitUntil:"networkidle"});
  if(await page.locator(".voice, #voice-input, #plan-goal").count())throw new Error("task prompt bar still exists");
  const filterAudit=await page.evaluate(()=>{const title=document.querySelector(".q-list-head h1").getBoundingClientRect(),filters=document.querySelector(".quest-filters").getBoundingClientRect();return {rightOfTitle:filters.left>=title.right-1,sameRow:Math.abs((filters.top+filters.height/2)-(title.top+title.height/2))<12}});
  if(!filterAudit.rightOfTitle||!filterAudit.sameRow)throw new Error(`quest filters are not beside the title: ${JSON.stringify(filterAudit)}`);
  await page.locator('[data-quest-filter="all"]').click();if(await page.locator(".q-item").count()<5)throw new Error("all quest filter did not expose every task");await page.locator('[data-quest-filter="active"]').click();
  const initialTitle=await page.locator(".q-detail > h1").textContent();await page.locator(".q-item").nth(1).click();
  if(await page.locator(".q-detail > h1").textContent()===initialTitle)throw new Error("quest selection did not update the detail view");
  await page.locator(".step").first().click();
  await page.screenshot({path:path.join(root,"artifacts/mockups/phone-quests-linked.png")});
  await page.locator('[data-tab="people"]').click();await page.locator('[data-person="lin"]').click();await page.locator('[data-person-panel="memories"]').click();
  if(!await page.locator('.p-tabs button.active').textContent().then(value=>value?.startsWith("共同记忆")))throw new Error("person memory panel did not activate");
  await page.locator('[data-person-panel="profile"]').click();await page.locator('.profile-grid').waitFor();
  await page.screenshot({path:path.join(root,"artifacts/mockups/phone-people-current.png")});
  await page.goto(`${base}/?screen=memory`,{waitUntil:"networkidle"});await page.locator("#memory-search").fill("青苔");await page.locator(".memory-manager .mem-list button").waitFor();
  await page.screenshot({path:path.join(root,"artifacts/mockups/phone-memory-current.png")});
  await page.setViewportSize({width:800,height:361});
  await page.goto(`${base}/?screen=quests`,{waitUntil:"networkidle"});
  const visualAudit=await page.evaluate(()=>{
    const size=(selector)=>parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
    const height=(selector)=>document.querySelector(selector).getBoundingClientRect().height;
    const text=document.body.innerText;
    return {header:height(".top"),nav:size(".top nav button"),title:size(".q-detail > h1"),item:size(".q-item span b"),caption:size(".q-item span small"),navTarget:height(".top nav button"),itemTarget:height(".q-item"),promptCount:document.querySelectorAll(".voice, #voice-input, #plan-goal").length,mysteryEnglish:/CONFIGURATION|QUEST ARCHIVE|ENCOUNTERS|BOND RECORD|TODAY|DEVICE & PERCEPTION|Prototype/.test(text),rawIconCount:document.querySelectorAll("i[data-lucide]").length,svgIconCount:document.querySelectorAll("svg[data-lucide]").length};
  });
  if(visualAudit.header>60||visualAudit.nav>15||visualAudit.title>28||visualAudit.item>13||visualAudit.caption>12||visualAudit.navTarget>42||visualAudit.itemTarget>60||visualAudit.promptCount||visualAudit.mysteryEnglish||visualAudit.rawIconCount!==0||visualAudit.svgIconCount<8)throw new Error(`compact visual audit failed: ${JSON.stringify(visualAudit)}`);
  await page.screenshot({path:path.join(root,"artifacts/mockups/phone-quests-device-viewport.png")});
  await page.goto(`${base}/?screen=topia`,{waitUntil:"networkidle"});await page.locator(".world.webgl-ready").waitFor({timeout:10000});
  const topiaAudit=await page.evaluate(()=>{const panel=document.querySelector(".today"),actions=document.querySelector(".quick-actions"),title=document.querySelector(".world-title"),text=document.body.innerText,panelBox=panel.getBoundingClientRect(),actionsBox=actions.getBoundingClientRect();return {panelFits:panel.scrollHeight<=panel.clientHeight+1,weatherIconCount:document.querySelectorAll(".today-head svg").length,hasWeather:/27°|天气/.test(text),interactionPromptCount:document.querySelectorAll(".explore").length,hasInteractionPrompt:/拖动查看|双指缩放/.test(text),quickActions:actions.querySelectorAll("button").length,quickActionHeight:actions.querySelector("button").getBoundingClientRect().height,quickActionsOutsideToday:!panel.contains(actions),quickActionsAboveToday:actionsBox.bottom<=panelBox.top,titleWidth:title.getBoundingClientRect().width,titleFont:parseFloat(getComputedStyle(title.querySelector("h1")).fontSize),canvasLabel:document.querySelector("#topia-canvas")?.getAttribute("aria-label")}});
  if(!topiaAudit.panelFits||topiaAudit.weatherIconCount||topiaAudit.interactionPromptCount||topiaAudit.hasInteractionPrompt||topiaAudit.quickActions!==2||topiaAudit.quickActionHeight<40||!topiaAudit.quickActionsOutsideToday||!topiaAudit.quickActionsAboveToday||topiaAudit.titleWidth>180||topiaAudit.titleFont>18||topiaAudit.canvasLabel!=="云上漂流屋三维场景")throw new Error(`Topia audit failed: ${JSON.stringify(topiaAudit)}`);
  await page.locator("#record-task").click();await page.locator("#record-mood").click();await page.locator('.mood-dialog[role="dialog"]').waitFor();
  const moodDialogAudit=await page.evaluate(()=>({startButtons:document.querySelectorAll("#start-mood-listen").length,privacy:/本机 Qwen3-ASR/.test(document.body.innerText),manualTextInputs:document.querySelectorAll(".mood-dialog input,.mood-dialog textarea").length}));
  if(moodDialogAudit.startButtons!==1||!moodDialogAudit.privacy||moodDialogAudit.manualTextInputs)throw new Error(`mood dialog audit failed: ${JSON.stringify(moodDialogAudit)}`);await page.locator("#close-mood").click();
  await page.evaluate(()=>localStorage.setItem("realtopia.mood",JSON.stringify({mood:"sad",intensity:84,summary:"今天有一点失落",support:"先允许自己慢下来。",transcript:"测试心情",model:"test-model",analyzedAt:new Date().toISOString()})));await page.reload({waitUntil:"networkidle"});await page.locator(".world.webgl-ready.mood-sad").waitFor({timeout:10000});
  const moodEffectAudit=await page.evaluate(()=>{const indicator=document.querySelector(".mood-indicator"),world=document.querySelector(".world");const box=indicator?.getBoundingClientRect(),worldBox=world?.getBoundingClientRect();return {rainDrops:document.querySelectorAll(".mood-weather.mood-sad i").length,emoji:indicator?.textContent??"",label:indicator?.getAttribute("aria-label")??"",topGap:box&&worldBox?box.top-worldBox.top:999,rightGap:box&&worldBox?worldBox.right-box.right:999,storedMood:JSON.parse(localStorage.getItem("realtopia.mood")??"null")?.mood}});
  if(moodEffectAudit.rainDrops<20||moodEffectAudit.emoji!=="😢"||!moodEffectAudit.label.includes("难过")||moodEffectAudit.topGap>20||moodEffectAudit.rightGap>20||moodEffectAudit.storedMood!=="sad")throw new Error(`mood effect audit failed: ${JSON.stringify(moodEffectAudit)}`);
  const canvas=page.locator("#topia-canvas"),box=await canvas.boundingBox();if(!box)throw new Error("Topia canvas has no bounds");await page.mouse.move(box.x+box.width*.55,box.y+box.height*.45);await page.mouse.down();await page.mouse.move(box.x+box.width*.72,box.y+box.height*.62,{steps:8});await page.mouse.up();await page.waitForTimeout(2100);
  await page.screenshot({path:path.join(root,"artifacts/mockups/phone-topia-device-viewport.png")});
  await page.locator('.top [data-tab="people"]').click();await page.screenshot({path:path.join(root,"artifacts/mockups/phone-people-device-viewport.png")});
  const peopleAudit=await page.evaluate(()=>{const title=document.querySelector(".p-list-head h1").getBoundingClientRect(),filters=document.querySelector(".p-list-head .chips").getBoundingClientRect(),list=document.querySelector(".p-list").getBoundingClientRect(),grid=document.querySelector(".p-grid").getBoundingClientRect(),enroll=document.querySelector("#enroll-person").getBoundingClientRect();return {columns:getComputedStyle(document.querySelector(".people")).gridTemplateColumns.split(" ").length,detachedHero:document.querySelectorAll(".people > .p-hero").length,cardShadow:getComputedStyle(document.querySelector(".p-card")).boxShadow,filterRightOfTitle:filters.left>=title.right-1,filterSameRow:Math.abs((filters.top+filters.height/2)-(title.top+title.height/2))<12,heroPortraits:document.querySelectorAll(".p-hero .portrait.big").length,enrollOutsideGrid:document.querySelector("#enroll-person").parentElement===document.querySelector(".p-list")&&enroll.top>=grid.bottom,enrollAtBottom:list.bottom-enroll.bottom<12}});
  if(peopleAudit.columns!==2||peopleAudit.detachedHero!==0||peopleAudit.cardShadow!=="none"||!peopleAudit.filterRightOfTitle||!peopleAudit.filterSameRow||peopleAudit.heroPortraits!==1||!peopleAudit.enrollOutsideGrid||!peopleAudit.enrollAtBottom)throw new Error(`people layout audit failed: ${JSON.stringify(peopleAudit)}`);
  await page.locator('.top [data-tab="settings"]').click();await page.screenshot({path:path.join(root,"artifacts/mockups/phone-settings-device-viewport.png")});
  await page.locator('[data-setting="intelligence"]').click();
  const intelligenceAudit=await page.evaluate(()=>({stats:document.querySelectorAll(".setting-view .stats").length,decorativeSummary:/<1 MB|规则规划器|响应速度|可用状态/.test(document.body.innerText),forbiddenPrompt:/任务拆分|云端失败|端侧任务回退|prompt|提示词/i.test(document.body.innerText),placeholderCount:document.querySelectorAll("input[placeholder]").length,contentBackground:getComputedStyle(document.querySelector(".s-content")).backgroundColor,modelIconFilter:getComputedStyle(document.querySelector(".model-icon.cloud-model")).filter}));
  if(intelligenceAudit.stats||intelligenceAudit.decorativeSummary||intelligenceAudit.forbiddenPrompt||intelligenceAudit.placeholderCount||intelligenceAudit.contentBackground==="rgba(0, 0, 0, 0)"||intelligenceAudit.modelIconFilter!=="none")throw new Error(`intelligence page audit failed: ${JSON.stringify(intelligenceAudit)}`);
  await page.screenshot({path:path.join(root,"artifacts/mockups/phone-intelligence-device-viewport.png")});
  await page.locator('[data-setting="memory"]').click();
  const settingsDecorationAudit=await page.evaluate(()=>({stats:document.querySelectorAll(".settings .stats").length,cardSummaries:document.querySelectorAll(".settings .s-card > p").length,headerSummaries:document.querySelectorAll(".settings .setting-head > p").length,navSummaries:document.querySelectorAll(".settings .s-nav nav small").length}));
  if(Object.values(settingsDecorationAudit).some(Boolean))throw new Error(`settings still contain decorative summaries: ${JSON.stringify(settingsDecorationAudit)}`);
  await page.locator(".mem-list button").first().click();await page.locator(".memory-drawer").waitFor();
  const memoryDrawerAudit=await page.evaluate(()=>{const drawer=document.querySelector(".memory-drawer").getBoundingClientRect(),header=document.querySelector(".top").getBoundingClientRect();return {inlineDetails:document.querySelectorAll(".memory-manager .memory-detail").length,top:drawer.top,bottom:drawer.bottom,right:drawer.right,width:drawer.width,headerBottom:header.bottom,viewport:[innerWidth,innerHeight]}});
  if(memoryDrawerAudit.inlineDetails||memoryDrawerAudit.top<memoryDrawerAudit.headerBottom-1||memoryDrawerAudit.bottom>memoryDrawerAudit.viewport[1]+1||memoryDrawerAudit.right>memoryDrawerAudit.viewport[0]+1||memoryDrawerAudit.width>=memoryDrawerAudit.viewport[0])throw new Error(`memory drawer exceeds viewport: ${JSON.stringify(memoryDrawerAudit)}`);
  await page.screenshot({path:path.join(root,"artifacts/mockups/phone-memory-drawer-device-viewport.png")});await page.locator(".drawer-head [data-close-memory]").click();
  const promptAudit=[];for(const screen of ["topia","quests","people","glasses","intelligence","memory","testing"]){await page.goto(`${base}/?screen=${screen}`,{waitUntil:"networkidle"});promptAudit.push(await page.evaluate(name=>({screen:name,forbidden:/任务拆分|云端失败|端侧任务回退|拖动查看|双指缩放|prompt|提示词/i.test(document.body.innerText),controls:document.querySelectorAll(".voice,#voice-input,#plan-goal,input[placeholder]").length}),screen))}
  if(promptAudit.some(item=>item.forbidden||item.controls))throw new Error(`visible prompt audit failed: ${JSON.stringify(promptAudit)}`);
  if(consoleErrors.length||httpErrors.length)throw new Error(`browser errors: ${[...consoleErrors,...httpErrors].join(" | ")}`);
  process.stdout.write(`${JSON.stringify({ok:true,visualAudit,topiaAudit,moodDialogAudit,moodEffectAudit,filterAudit,peopleAudit,intelligenceAudit,settingsDecorationAudit,memoryDrawerAudit,promptAudit})}\n`);
}finally{await browser.close();preview?.kill("SIGTERM")}
