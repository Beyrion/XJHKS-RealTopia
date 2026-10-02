import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from '../phone/app/node_modules/playwright-core/index.mjs';
import { installTopiaCommandMock } from './topia-command-mock.mjs';

const browser=await chromium.launch({executablePath:process.env.REALTOPIA_CHROME??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-swiftshader']});
try {
  for(const onboarding of [false,true]) {
    const page=await browser.newPage({viewport:{width:800,height:400}});
    await installTopiaCommandMock(page,path.resolve('.'));
    await page.addInitScript(onboarding=>{
      if(!onboarding)localStorage.setItem('realtopia.migration.roster-20261002.v2','done');
      const original=window.__TAURI_INTERNALS__.invoke;
      window.failCreate=false;
      window.__TAURI_INTERNALS__.invoke=async(command,args)=>{
        if(command!=='generate_topia_world')return original(command,args);
        await new Promise(r=>setTimeout(r,200));
        if(window.failCreate)throw new Error('fixture generation failed');
        const payload=await original('load_topia_world',{context:args.input.context});
        payload.world.id='successful-create-fixture';payload.world.source='cloud';
        payload.studio.needsOnboarding=false;
        payload.studio.activeWorldId=payload.world.id;
        localStorage.setItem('realtopia.topiaStudio.v2',JSON.stringify(payload.studio));
        return payload;
      };
    },onboarding);
    await page.goto(process.env.REALTOPIA_PREVIEW_URL??'http://127.0.0.1:4187');
    await page.locator('canvas[data-topia-unsupported]').waitFor();
    if(!onboarding)await page.getByRole('button',{name:'打开 Topia 工坊',exact:true}).click();
    await page.locator('.topia-entry-cards button').nth(onboarding?1:0).click();
    for(let i=0;i<3;i++)await page.locator('.topia-studio-dialog footer button').filter({hasText:'下一页'}).click();
    // A failed request must leave the wizard available for retry.
    await page.evaluate(()=>{window.failCreate=true;});
    await page.getByRole('button',{name:'生成新的 Topia'}).click();
    await page.locator('.topia-generation-wait').waitFor({state:'detached'});
    assert.equal(await page.locator('.topia-studio-overlay').count(),1);
    await page.evaluate(()=>{window.failCreate=false;});
    await page.getByRole('button',{name:'生成新的 Topia'}).click();
    await page.locator('.topia-studio-overlay').waitFor({state:'detached'});
    await page.waitForFunction(()=>document.querySelector('[data-topia-world]')?.dataset.topiaWorld==='successful-create-fixture');
    assert.equal(await page.locator('.topia-studio-overlay, .topia-drawer-backdrop, .topia-delete-overlay').count(),0);
    assert.equal(await page.locator('[data-topia-location="exterior"].active').count(),1);
    // Reopening later is explicit user action, not an automatic return to entry.
    await page.getByRole('button',{name:'打开 Topia 工坊',exact:true}).click();
    await page.locator('.topia-entry-cards').waitFor();
    console.log(JSON.stringify({onboarding,failureKeepsWizard:true,successClosesAllTopiaDialogs:true,worldDisplayed:true}));
    await page.close();
  }
} finally {await browser.close();}
