import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const app=express();app.use(express.static(resolve('client/dist')));app.use((_req,res)=>res.sendFile(resolve('client/dist/index.html')));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const output=resolve('outputs/map-editor');mkdirSync(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const errors=[], apiRequests=[];
const origin=`http://127.0.0.1:${server.address().port}`;
const editorPath='/demo/showcase/map-editor/experience/';
try {
  const page=await browser.newPage({viewport:{width:1440,height:1050}});page.on('pageerror',e=>errors.push(e.message));
  page.on('request',req=>{if(new URL(req.url()).pathname.startsWith('/api/'))apiRequests.push(req.url());});
  await page.goto(origin+'/demo/');
  await page.getByLabel('主题',{exact:true}).selectOption('地图工具');
  assert.equal(await page.locator('.demo-card').count(),1);
  await page.getByLabel('组件',{exact:true}).selectOption('map-editor');
  await page.locator('.demo-card[data-demo-id="map-editor"]').click();
  await page.locator('.map-editor.me-embedded').waitFor();
  assert.equal(new URL(page.url()).pathname,editorPath);
  assert.equal(await page.locator('main').count(),1,'embedded editor does not create nested page landmarks');
  assert.equal(await page.title(),'DEMO 展示中心');
  const button=name=>page.getByRole('button',{name,exact:true});
  const cell=(x,y)=>page.getByRole('button',{name:new RegExp(`^${x},${y} `)});
  const draft=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('competition-map-editor-v1')));
  await cell(1,0).click();await cell(2,0).click();assert.equal((await draft()).coins.length,2);
  await button('↶ 撤销').click();assert.equal((await draft()).coins.length,1);
  await button('↷ 重做').click();assert.equal((await draft()).coins.length,2);
  await button('▶ 开始试走').click();await button('→ 右').click();await button('→ 右').click();await page.getByText('✓ 已完成',{exact:false}).waitFor();
  await button('返回编辑').click();
  await page.reload();assert.equal((await draft()).coins.length,2);
  const downloadPromise=page.waitForEvent('download');await button('导出地图 ↗').click();const download=await downloadPromise;
  const exported=JSON.parse(readFileSync(await download.path(),'utf8'));assert.equal(exported.expected_optimal_steps,2);
  await button('新建空白').click();assert.equal((await draft()).coins.length,0);
  await page.locator('input[type=file]').setInputFiles({name:'roundtrip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});
  await page.getByRole('status').filter({hasText:'地图已导入'}).waitFor();
  assert.equal((await draft()).coins.length,2);
  const before=await draft();
  await page.locator('input[type=file]').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...exported,start:[999,0]}))});
  await page.getByRole('status').filter({hasText:'导入失败'}).waitFor();assert.deepEqual(await draft(),before);
  // Details and browser history must restore the same draft when the editor remounts.
  for(const tab of ['规则','技术方案','版本与复用']) {
    await page.getByRole('link',{name:tab,exact:true}).click();await page.reload();
    assert.equal(await page.getByRole('link',{name:tab,exact:true}).getAttribute('aria-current'),'page');
    assert.equal(await page.locator('.map-editor').count(),0);
    assert.deepEqual(await draft(),before);
  }
  await page.getByText(/下方下载的是编辑器嵌入配置/).waitFor();
  const presetDownload=page.waitForEvent('download');await button('下载示例配置').click();
  const preset=JSON.parse(readFileSync(await (await presetDownload).path(),'utf8'));
  assert.equal(preset.demoId,'map-editor');assert.deepEqual(preset.configuration,{embedded:true});
  await page.getByRole('link',{name:'体验',exact:true}).click();await cell(1,0).waitFor();
  assert.deepEqual(await draft(),before);
  await page.goBack();await page.getByRole('heading',{name:'版本与复用',exact:true}).waitFor();
  await page.goForward();await cell(1,0).waitFor();assert.deepEqual(await draft(),before);
  await page.getByRole('link',{name:'独立打开编辑器 ↗',exact:true}).click();
  await page.locator('.map-editor.me-standalone').waitFor();
  assert.equal(new URL(page.url()).pathname,'/editor/');assert.deepEqual(await draft(),before);
  assert.equal(await page.title(),'地图工坊 · 测试赛地图编辑器');
  await cell(3,0).click();const standaloneDraft=await draft();assert.equal(standaloneDraft.coins.length,3);
  await page.screenshot({path:resolve(output,'00-standalone.png'),fullPage:true});
  await page.goto(origin+editorPath);await cell(3,0).waitFor();assert.deepEqual(await draft(),standaloneDraft);
  assert.equal(await page.title(),'DEMO 展示中心');
  await page.getByLabel('从现有关卡开始').selectOption('L20');await button('载入参考地图').click();
  await page.screenshot({path:resolve(output,'01-coin-desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'✦ 未来城市',exact:false}).click();
  // Resizing must work even when the original robot grid is fully paved.
  await page.getByRole('button',{name:'↟ 起点',exact:true}).click();await cell(7,7).click();
  await button('◉ 打卡点（金币）').click();await cell(6,7).click();
  const beforeResize=await draft();
  const width=page.getByRole('spinbutton',{name:'宽度',exact:true});
  const height=page.getByRole('spinbutton',{name:'高度',exact:true});
  await width.fill('5');await width.press('Enter');
  assert.equal((await draft()).width,5);assert.equal((await draft()).robot.cells.length,40);
  assert.equal((await draft()).coins.length,0);assert.ok((await draft()).start[0]<5);
  assert.equal(await page.locator('.me-cell').count(),40);
  await button('↶ 撤销').click();assert.deepEqual(await draft(),beforeResize);
  await width.fill('5');await width.press('Enter');await height.fill('4');await height.press('Tab');
  assert.equal(await page.locator('.me-cell').count(),20);assert.equal((await draft()).robot.cells.length,20);
  assert.ok((await draft()).start[1]<4);
  await page.getByRole('button',{name:'⌫ 橡皮擦',exact:true}).click();await cell(1,1).click();
  await width.fill('8');await width.press('Enter');await height.fill('8');await height.press('Tab');
  assert.equal((await draft()).robot.cells.length,63,'new area paved, original hole preserved');
  assert.ok(!(await draft()).robot.cells.some(p=>p[0]===1&&p[1]===1));
  await width.fill('99');await width.press('Enter');assert.equal(await width.inputValue(),'8');
  await button('新建空白').click();
  await page.getByRole('button',{name:'初始朝向右',exact:true}).click();
  await button('◉ 打卡点（金币）').click();await cell(1,0).click();await cell(2,0).click();
  assert.equal((await draft()).robot.facing,'right');assert.equal((await draft()).coins[0].type,'checkpoint');
  await page.reload();assert.equal((await draft()).robot.facing,'right');assert.equal((await draft()).coins[0].type,'checkpoint');
  await button('▶ 开始试走').click();await button('前进').click();
  assert.ok(await page.getByText('完成 1/2',{exact:false}).count());
  await button('前进').click();await page.getByText('✓ 已完成',{exact:false}).waitFor();await button('返回编辑').click();
  const checkpointDownload=page.waitForEvent('download');await button('导出地图 ↗').click();
  const checkpointMap=JSON.parse(readFileSync(await (await checkpointDownload).path(),'utf8'));
  await button('新建空白').click();
  await page.locator('input[type=file]').setInputFiles({name:'checkpoints.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(checkpointMap))});
  await page.getByRole('status').filter({hasText:'地图已导入'}).waitFor();
  assert.equal((await draft()).robot.facing,'right');assert.equal((await draft()).coins[0].type,'checkpoint');
  // Build a short delivery route through the actual drawing controls.
  await button('新建空白').click();
  await button('↟ 起点').click();await cell(1,1).click();await button('初始朝向上').click();
  await page.getByRole('button',{name:'货物',exact:false}).first().click();await cell(1,2).click();
  await button('◎ 泊位').click();await cell(1,0).click();
  await button('▶ 开始试走').click();await button('夹取').click();await button('右转').click();await button('右转').click();await button('松开').click();await page.getByText('✓ 已完成',{exact:false}).waitFor();await button('返回编辑').click();
  await button('◎ 泊位').click();
  await cell(2,3).click();assert.deepEqual((await draft()).robot.deliveries.A,[2,3]);
  await button('新建空白').click();
  await page.getByRole('button',{name:'货物',exact:false}).first().click();await cell(1,0).click();
  await button('检查地图').click();await page.getByRole('status').filter({hasText:'同字母泊位'}).waitFor();
  await page.getByRole('button',{name:'泊位',exact:false}).first().click();await cell(2,0).click();
  await button('检查地图').click();await page.getByRole('status').filter({hasText:'结构检查通过'}).waitFor();
  // Current city templates contain home checkpoints and ordered patrols.
  for(const id of ['FL31','FL32','FL33','FL34','FL35','FL36']) {
    await page.getByLabel('从现有关卡开始').selectOption(id);await button('载入参考地图').click();
    await button('检查地图').click();await page.getByRole('status').filter({hasText:'结构检查通过'}).waitFor();
    const templateDraft=await draft();
    const templateDownload=page.waitForEvent('download');await button('导出地图 ↗').click();
    const templateMap=JSON.parse(readFileSync(await (await templateDownload).path(),'utf8'));
    assert.deepEqual(templateMap.robot,templateDraft.robot);assert.deepEqual(templateMap.coins,templateDraft.coins);
    await page.reload();await cell(0,0).waitFor();
    assert.deepEqual((await draft()).robot,templateDraft.robot,'refresh preserves current template rules');
    await page.locator('input[type=file]').setInputFiles({name:'template.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(templateMap))});
    await page.getByRole('status').filter({hasText:'地图已导入'}).waitFor();
    assert.deepEqual((await draft()).robot,templateDraft.robot,'JSON round trip preserves checkpoint order');
    if(id==='FL31') {
      await button('▶ 开始试走').click();
      for(let side=0;side<4;side++){for(let n=0;n<4;n++)await button('前进').click();if(side<3)await button('右转').click();}
      await page.getByText('✓ 已完成',{exact:false}).waitFor();await button('返回编辑').click();
    }
    if(id==='FL32') {
      await button('▶ 开始试走').click();await button('前进').click();await button('后退').click();
      await page.getByText('完成 0/5',{exact:false}).waitFor();await button('返回编辑').click();
      const ordered=await draft();
      await page.locator('input[type=file]').setInputFiles({name:'bad-order.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...ordered,robot:{...ordered.robot,checkpoint_order:['H','H']}}))});
      await page.getByRole('status').filter({hasText:'导入失败'}).waitFor();assert.deepEqual(await draft(),ordered);
      await button('⌫ 橡皮擦').click();await cell(3,6).click();
      assert.deepEqual((await draft()).robot.checkpoint_order,['B','C','D','H']);
      await page.reload();await cell(0,0).waitFor();assert.deepEqual((await draft()).robot.checkpoint_order,['B','C','D','H']);
    }
  }
  const lastDraft=await draft();
  await page.screenshot({path:resolve(output,'02-robot-desktop.png'),fullPage:true});
  await page.setViewportSize({width:768,height:1024});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await page.screenshot({path:resolve(output,'03-tablet.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(output,'03-mobile.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  // Lazy-loaded editor styles must not change the other hub views after leaving it.
  await page.locator('.demo-primary-nav a[href="/demo/"]').click();
  await page.getByRole('heading',{name:/从这里开始体验/}).waitFor();
  assert.equal(await page.locator('.map-editor').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await page.locator('.demo-primary-nav a[href="/demo/components/"]').click();
  const editorComponent=page.locator('.demo-component-grid article').filter({has:page.getByRole('heading',{name:'棋盘地图编辑器',exact:true})});
  await editorComponent.getByRole('link',{name:'地图编辑器 ↗',exact:true}).click();
  await cell(0,0).waitFor();assert.deepEqual(await draft(),lastDraft);
  assert.deepEqual(apiRequests,[],'editing and trial never call competition APIs');
  assert.deepEqual(errors,[]);
  const report={passed:true,checks:['DEMO card, topic/component filters and component library entry','embedded editor shares standalone code and draft','detail deep links, refresh and browser history preserve draft','editor preset download is distinct from map JSON','manual resize shrinks paved grid and relocates start','resize undo restores cropped objects','expansion paves new area and preserves existing holes','click placement','undo / redo','local draft reload','coin completion via shared rules','JSON download and round trip','invalid import preserves draft','existing templates for both competitions','initial direction controls first robot move','checkpoint-only completion without docks','heading and checkpoints survive reload and JSON import','robot grab / turn / delivery completion','paired dock movement and validation','768px tablet and 390px mobile without page overflow','leaving editor restores hub view','no competition API requests','no browser runtime errors']};
  writeFileSync(resolve(output,'verification.json'),JSON.stringify(report,null,2));console.log(report);
} finally {await browser.close();await new Promise(r=>server.close(r));}
