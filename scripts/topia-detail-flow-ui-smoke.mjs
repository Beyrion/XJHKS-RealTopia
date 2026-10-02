import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from '../phone/app/node_modules/esbuild/lib/main.js';
import { chromium } from '../phone/app/node_modules/playwright-core/index.mjs';

const bundle=await build({stdin:{contents:`import React from 'react'; import {createRoot} from 'react-dom/client';
  import {TopiaStudioDialog} from './phone/app/src/components/topia/TopiaStudioDialog.tsx';
  import {topiaNarration} from './phone/app/src/utils/topiaNarration.ts';
  import {refineSouvenir} from './phone/app/src/services/souvenirDesign.ts';
  export {React,createRoot,TopiaStudioDialog,topiaNarration,refineSouvenir};`,resolveDir:process.cwd()},
  bundle:true,write:false,format:'iife',globalName:'DetailQA',platform:'browser',jsx:'automatic',nodePaths:[`${process.cwd()}/phone/app/node_modules`]});
const design=process.env.REALTOPIA_SOUVENIR_FIXTURE
  ? JSON.parse(await readFile(process.env.REALTOPIA_SOUVENIR_FIXTURE,'utf8'))
  : {name:'薄荷星罗盘',description:'合成测试：木板与铰链上的共同努力化成一枚引路罗盘。',emoji:'🧭',modelKind:'star-compass',colors:[0x7cab88,0xccbb88,0x88bbee],material:'wood',ornaments:['leaf','ring'],preferredLocation:'interior'};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage();
  await page.goto(process.env.REALTOPIA_HARNESS_URL??'http://127.0.0.1:4187');
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  const result=await page.evaluate(async design=>{
    const {React,createRoot,TopiaStudioDialog,topiaNarration,refineSouvenir}=DetailQA;
    const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const show=stage=>root.render(React.createElement(TopiaStudioDialog,{open:true,mode:'manage',studio:{worlds:[],assets:{},needsOnboarding:false},progress:{stage,mode:'create',progress:40,message:'technical details must stay hidden'},generating:true}));
    const phases=[];
    for(const stage of ['preparing','design','concept','exterior-blueprint','assembly','detail-plan','detail-review','review','assets','complete']) {
      show(stage);await wait(80);
      const text=host.querySelector('h3').textContent;
      if(!topiaNarration(stage).lines.includes(text))throw Error('wrong phase narration '+stage);
      if(host.textContent.includes('technical details'))throw Error('backend progress leaked');
      phases.push({stage,text});
    }
    show('detail-plan');await wait(80);const first=host.querySelector('h3').textContent;
    await wait(2450);const rotated=host.querySelector('h3').textContent;
    root.unmount();host.remove();
    let calls=0;
    window.__TAURI_INTERNALS__={...window.__TAURI_INTERNALS__,invoke:async command=>{
      if(command!=='design_topia_souvenir')throw Error('unexpected command');calls++;await wait(80);return design;
    }};
    const seed={id:'synthetic-souvenir',questId:'synthetic-task',personId:'synthetic-person',name:'临时造型',description:'占位',emoji:'✨',acquiredAt:'2026-10-02',designState:'pending',presentation:{scale:.8}};
    const quest={id:seed.questId,title:'测试木制信箱',body:'测试',steps:[]};
    const a=refineSouvenir(seed,quest,undefined,[]),b=refineSouvenir(seed,quest,undefined,[]);
    const refined=await a;
    const {mountSouvenirPreview}=await import('/src/utils/topiaScene.ts');
    const box=document.createElement('div');box.style.cssText='width:300px;height:240px';document.body.append(box);
    const canvas=document.createElement('canvas');box.append(canvas);
    const object={id:'qa-preview',prefab:'crystal',layer:'souvenir',position:[0,0,0],colors:design.colors,params:{souvenirKind:design.modelKind,souvenirMaterial:design.material}};
    let dispose=mountSouvenirPreview(canvas,object);const baseMeshes=Number(canvas.dataset.souvenirPreviewMeshCount);dispose();
    dispose=mountSouvenirPreview(canvas,{...object,params:{...object.params,souvenirOrnaments:design.ornaments.join(',')}});
    const detailedMeshes=Number(canvas.dataset.souvenirPreviewMeshCount);dispose();box.remove();
    return {phases,first,rotated,calls,deduplicated:a===b,refined,seed,baseMeshes,detailedMeshes};
  },design);
  assert.notEqual(result.first,result.rotated,'phase text must rotate to a different line');
  assert.equal(result.calls,1);assert(result.deduplicated);
  for(const key of ['id','questId','personId','acquiredAt'])assert.equal(result.refined[key],result.seed[key]);
  assert.equal(result.refined.designState,'ready');
  assert.deepEqual(result.refined.presentation.colors,design.colors);
  assert(result.detailedMeshes>result.baseMeshes,'cloud ornaments must add actual geometry, not only rename/recolor');
  console.log(JSON.stringify({phases:result.phases,rotatingText:true,deduplicated:true,identityPreserved:true,baseMeshes:result.baseMeshes,detailedMeshes:result.detailedMeshes}));
} finally {await browser.close();}
