// Capture Nusantara Sky Post screenshots + self-test + autopilot play-test in
// headless Chrome via playwright-core (from the npx cache, as previous entries
// did). Run from the repo root. Serves game/ on 127.0.0.1:8081 — start
// `node serve.ts --port 8081` first.
const { chromium } = require('/home/hatch/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core');
const { join, resolve } = require('node:path');
const { statSync, readFileSync } = require('node:fs');

const here = resolve(__dirname);
const BASE = 'http://127.0.0.1:8081';
const shots = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8'));

function clickRect(page, canvasRect, rect) {
  const x = canvasRect.x + (rect.x + rect.w / 2) * (canvasRect.width / 1280);
  const y = canvasRect.y + (rect.y + rect.h / 2) * (canvasRect.height / 720);
  return page.mouse.click(x, y);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/home/hatch/cft-dl/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-gpu', '--force-color-profile=srgb'],
  });
  const errors = [];
  // --- Screenshots ---
  for (const shot of shots) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push(`pageerror ${shot.name}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console ${shot.name}: ${m.text()}`); });
    await page.goto(`${BASE}/${shot.query}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 30000 });
    const out = join(here, 'screenshots', shot.name);
    await page.screenshot({ path: out, type: 'jpeg', quality: 82 });
    const size = statSync(out).size;
    console.log('SHOT_OK', shot.name, `${size} bytes`, size <= 262144 ? 'UNDER_256K' : 'OVER_256K!');
    await page.close();
  }
  // --- Self-test (logic-only autopilot campaigns) ---
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => errors.push(`pageerror selftest: ${e.message}`));
    await page.goto(`${BASE}/?selftest=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__selftest !== undefined, null, { timeout: 60000 });
    console.log('SELFTEST', JSON.stringify(await page.evaluate(() => window.__selftest)));
    await page.close();
  }
  // --- Autopilot play-test: a full campaign win, driven in real time at 4x ---
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => errors.push(`pageerror playtest: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console playtest: ${m.text()}`); });
    await page.goto(`${BASE}/?ff=4&seed=7`, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    console.log('PLAYTEST title:', await page.evaluate(() => window.__sky.screen()));
    await page.keyboard.press('Enter'); // title -> briefing
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter'); // briefing -> takeoff leg 1
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__sky.autopilot(true));
    let guard = 0;
    let lastLeg = 0;
    while (guard < 400) {
      guard++;
      const st = await page.evaluate(() => window.__sky.state());
      if (st.leg !== lastLeg) { console.log('PLAYTEST leg', st.leg, 'score', st.score, 'coins', st.coins, 'medals', JSON.stringify(st.medals)); lastLeg = st.leg; }
      if (st.over) { console.log('PLAYTEST over:', JSON.stringify(st)); break; }
      if (st.screen === 'debrief') {
        await page.waitForTimeout(300);
        await page.keyboard.press('Enter'); // debrief -> briefing next leg
        await page.waitForTimeout(300);
        await page.keyboard.press('Enter'); // briefing -> takeoff
        await page.waitForTimeout(300);
        await page.evaluate(() => window.__sky.autopilot(true));
      }
      await page.waitForTimeout(1000);
    }
    if (guard >= 400) console.log('PLAYTEST TIMEOUT — last state:', JSON.stringify(await page.evaluate(() => window.__sky.state())));
    await page.close();
  }
  // --- Crash-path test: throttle cut right after takeoff should end in a crash ---
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => errors.push(`pageerror crashtest: ${e.message}`));
    await page.goto(`${BASE}/?ff=4&seed=7`, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__sky.autopilot(true));
    // Let it get airborne, then kill the autopilot and cut throttle to zero.
    await page.waitForTimeout(12000);
    await page.evaluate(() => window.__sky.autopilot(false));
    await page.keyboard.down('KeyS');
    let st = null;
    for (let i = 0; i < 90; i++) {
      st = await page.evaluate(() => window.__sky.state());
      if (st.screen === 'gameover') break;
      await page.waitForTimeout(1000);
    }
    console.log('CRASHTEST final:', JSON.stringify(st));
    await page.close();
  }
  console.log('ERRORS', errors.length ? JSON.stringify(errors, null, 2) : 'none');
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
