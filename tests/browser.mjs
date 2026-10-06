import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import sharp from "sharp";
const gallery = JSON.parse(
  await readFile("public/gallery/manifest.json", "utf8"),
);
const latest = gallery.photos.filter(
  (p) => p.collection === gallery.collections.at(-1).id,
);
const earliest = gallery.photos.filter(
  (p) => p.collection === gallery.collections[0].id,
);
await mkdir(".test-output", { recursive: true });
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("requestfailed", request => {
  if (new URL(request.url()).pathname.startsWith("/gallery/"))
    errors.push(`Failed gallery request: ${request.url()}`);
});
page.on("response", response => {
  if (new URL(response.url()).pathname.startsWith("/gallery/") && response.status() >= 400)
    errors.push(`Gallery response ${response.status()}: ${response.url()}`);
});
async function assertCanvasRendered(canvas) {
  const stats = await sharp(await canvas.screenshot()).stats();
  assert.ok(stats.channels.slice(0, 3).some(channel => channel.stdev > 10), "canvas contains rendered scene pixels");
}
const detailPaths = new Set(gallery.photos.map(photo => `/${photo.preview}`));
const detailRequests = [];
page.on("request", request => {
  const pathname = new URL(request.url()).pathname;
  if (detailPaths.has(pathname)) detailRequests.push(pathname);
});
try {
  await page.goto(process.env.PORTFOLIO_TEST_URL ?? "http://127.0.0.1:5173", { waitUntil: "networkidle" });
  await page.screenshot({ path: ".test-output/entrance.png" });
  await page.getByRole("button", { name: "进入作品展" }).click();
  await page.locator(".gallery-screen").waitFor({ state: "visible" });
  await page.waitForTimeout(1800);
  assert.equal(
    await page.locator("#photo-title").textContent(),
    latest.at(-1).id,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "下一分类", exact: true })
      .isDisabled(),
    true,
  );
  const buttonStyle = await page.locator(".open-photo").evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      height: el.getBoundingClientRect().height,
      border: s.borderTopWidth,
      font: s.fontFamily,
    };
  });
  assert.ok(buttonStyle.height >= 50);
  assert.equal(buttonStyle.border, "1px");
  assert.match(buttonStyle.font, /Microsoft YaHei/);
  await page.keyboard.press("ArrowRight");
  assert.match(await page.locator("#photo-counter").textContent(), /2026/);
  await page.getByRole("button", { name: "下一张照片", exact: true }).click();
  assert.equal(await page.locator("#photo-title").textContent(), latest[0].id);
  await page.getByRole("button", { name: "上一张照片", exact: true }).click();
  assert.equal(await page.locator(".collection-nav button").count(), 6);
  await page.locator('[data-collection="0"]').click();
  assert.equal(
    await page
      .getByRole("button", { name: "上一分类", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "下一分类", exact: true }).click();
  await page.getByRole("button", { name: "上一分类", exact: true }).click();
  await page.keyboard.press("ArrowLeft");
  assert.match(await page.locator("#photo-counter").textContent(), /2024/);
  await page.keyboard.press("ArrowDown");
  assert.equal(
    await page.locator("#photo-title").textContent(),
    earliest[0].id,
  );
  await page.keyboard.press("ArrowDown");
  assert.equal(
    await page.locator("#photo-title").textContent(),
    earliest[1].id,
  );
  await page.locator('[data-collection="5"]').click();
  await page.waitForTimeout(1300);
  await page.screenshot({ path: ".test-output/gallery.png" });
  await assertCanvasRendered(page.locator(".scene-host canvas"));
  assert.deepEqual(detailRequests, [], "browsing and selection load only thumbnails");
  await page.locator('.selection-hint').waitFor({ state: 'visible' });
  await page.locator('.selection-hint').click();
  await page.waitForTimeout(1800);
  assert.deepEqual(detailRequests, [`/${latest.at(-1).preview}`], "opening details loads only the selected full-resolution image");
  assert.equal(
    await page.locator(".photo-note").count(),
    latest.at(-1).description ? 1 : 0,
  );
  await page.screenshot({ path: ".test-output/detail.png" });
  const detailCanvas = page.locator(".detail-stage canvas");
  await assertCanvasRendered(detailCanvas);
  const rect = await detailCanvas.boundingBox();
  const beforeZoom = await detailCanvas.screenshot();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(700);
  const zoomed = await detailCanvas.screenshot();
  assert.notEqual(
    beforeZoom.equals(zoomed),
    true,
    "wheel changes photo framing",
  );
  assert.equal(
    await page.locator("#detail-title").textContent(),
    latest.at(-1).id,
  );
  await page.getByRole("button", { name: "缩小照片", exact: true }).click();
  await page.getByRole("button", { name: "放大照片", exact: true }).click();
  await page.getByRole("button", { name: "复位", exact: true }).click();
  await page.mouse.move(rect.x + rect.width * 0.5, rect.y + rect.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(
    rect.x + rect.width * 0.65,
    rect.y + rect.height * 0.45,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.waitForTimeout(500);
  await page.screenshot({ path: ".test-output/detail-interaction.png" });
  await page.keyboard.press("Escape");
  await page.locator('[data-collection="5"]').click();
  await page.getByRole("button", { name: "查看照片" }).click();
  await page.locator('.detail-actions [data-action="next"]').click();
  assert.equal(await page.locator(".photo-note").count(), 0);
  for (const item of latest[0].exif)
    assert.ok(
      (await page.locator("#exif-list").textContent()).includes(item.value),
    );
  await page.getByRole("button", { name: "360° 旋转" }).click();
  await page.waitForTimeout(1000);
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.locator("#detail-title").textContent(), latest[0].id);
  await page.screenshot({ path: ".test-output/viewer.png" });
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".viewer-overlay").count(), 0);
  await page.keyboard.press("Escape");
  await page.locator('.top-actions [data-action="settings"]').click();
  await page.locator('[data-setting="dark"]').check();
  await page.locator('[data-setting="quality"]').selectOption("performance");
  const title = await page.locator("#photo-title").textContent();
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.locator("#photo-title").textContent(), title);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  await page.screenshot({ path: ".test-output/dark.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: ".test-output/mobile.png" });
  await assertCanvasRendered(page.locator(".scene-host canvas"));
  await page.getByRole("button", { name: "查看照片" }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: ".test-output/mobile-detail.png" });
  await assertCanvasRendered(detailCanvas);
  const mobileRect = await detailCanvas.boundingBox();
  const session = await page.context().newCDPSession(page);
  const cx = mobileRect.x + mobileRect.width / 2,
    cy = mobileRect.y + mobileRect.height / 2;
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: cx - 30, y: cy, id: 1 },
      { x: cx + 30, y: cy, id: 2 },
    ],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: cx - 65, y: cy, id: 1 },
      { x: cx + 65, y: cy, id: 2 },
    ],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "复位", exact: true }).click();
  await session.detach();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Browser checks passed: entrance, configured collections, latest selection, finite collections, looping photos, EXIF, descriptions, viewer, settings, mobile.",
  );
} finally {
  await browser.close();
}
