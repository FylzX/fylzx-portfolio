import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({channel:'msedge', headless:true});
const page = await browser.newPage({viewport:{width:1440,height:900}});
try {
  await page.goto('http://127.0.0.1:5173', {waitUntil:'networkidle'});
  await page.getByRole('button',{name:'进入作品展'}).click();
  await page.locator('[data-collection="0"]').click();
  await page.waitForTimeout(1800);
  await page.evaluate(async () => {
    const moduleURL = performance.getEntriesByType('resource').map(r=>r.name).find(url=>url.includes('/src/scene.ts'));
    const {GalleryScene} = await import(moduleURL);
    const original = GalleryScene.prototype.update;
    window.edgeFrames = [];
    GalleryScene.prototype.update = function(dt, time) {
      original.call(this, dt, time);
      window.edgeFrames.push({dt, time, x:this.camera.position.x, lane:this.navigation.lane});
    };
  });
  const reports=[];
  for (const direction of ['right','left','right','left']) {
    await page.evaluate(()=>window.edgeFrames=[]);
    await page.locator(`[data-action="nav-${direction}"]`).click();
    await page.waitForTimeout(1400);
    const frames=await page.evaluate(()=>window.edgeFrames);
    const maxStep=Math.max(...frames.slice(1).map((f,i)=>Math.abs(f.x-frames[i].x)));
    reports.push({direction,maxStep,frames:frames.length});
  }
  console.log(JSON.stringify(reports));
  assert.ok(reports.every(r=>r.frames>10 && r.maxStep<0.7),'left edge must not snap by 2 world units');
} finally {await browser.close();}
