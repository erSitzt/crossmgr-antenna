// Regenerates the manual's screenshots (docs/images/*.png).
//   1. start the dev server:  npm run dev
//   2. run:                   npm run docs:screenshots
// Uses an installed Chrome / Edge (set BROWSER=path to override) and drives the app through the
// development-only hooks window.store / window.live / window.__camera.
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const APP = process.env.APP_URL ?? 'http://localhost:5173/';
const OUT = fileURLToPath(new URL('../../docs/images/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const candidates = [
  process.env.BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));
if (!executablePath) throw new Error('No Chrome/Edge found – set BROWSER=/path/to/chrome');

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 },
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-first-run'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.evaluateOnNewDocument(() => {
  if (!sessionStorage.getItem('docs-init')) {
    localStorage.clear();
    sessionStorage.setItem('docs-init', '1');
  }
});
await page.goto(APP, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => !!window.store && !!window.__camera, { timeout: 30000 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const act = (fn, ...args) => page.evaluate(fn, ...args);
async function settle(extra = 600) {
  await sleep(400);
  await page.waitForFunction(() => !window.store.getState().computing && !window.store.getState().simBusy, { timeout: 120000 });
  await sleep(extra);
}
async function tab(label) {
  await act((l) => [...document.querySelectorAll('.tabs button')].find((b) => b.textContent === l).click(), label);
  await sleep(400);
}
async function click(text) {
  await act((t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t).click(), text);
}
async function camera(pos, target) {
  await act((p, t) => window.__camera.set(p, t), pos, target);
  await sleep(500);
}
async function shot(name) {
  await page.screenshot({ path: OUT + name });
  console.log('✓', name);
}
async function viewport(name) {
  const el = await page.$('.viewport');
  await el.screenshot({ path: OUT + name });
  console.log('✓', name);
}
// let the sidebar grow to full height so tall sections are captured completely
async function unclip(on) {
  await act((v) => {
    let st = document.getElementById('docs-unclip');
    if (v && !st) {
      st = document.createElement('style');
      st.id = 'docs-unclip';
      st.textContent = '.app{height:auto!important;align-items:flex-start}.sidebar{height:auto!important}.panel{overflow:visible!important}';
      document.head.appendChild(st);
    } else if (!v && st) st.remove();
  }, on);
  await sleep(250);
}
async function section(name, title) {
  await unclip(true);
  const handle = await page.evaluateHandle(
    (t) => [...document.querySelectorAll('.section')].find((s) => s.querySelector('h3')?.textContent.startsWith(t)),
    title,
  );
  const el = handle.asElement();
  if (!el) throw new Error(`section "${title}" not found`);
  await el.screenshot({ path: OUT + name });
  await unclip(false);
  console.log('✓', name);
}
async function box(name, startsWith) {
  await unclip(true);
  const handle = await page.evaluateHandle(
    (t) => [...document.querySelectorAll('.arch')].find((s) => s.innerText.trim().startsWith(t)),
    startsWith,
  );
  const el = handle.asElement();
  if (!el) throw new Error(`box "${startsWith}" not found`);
  await el.screenshot({ path: OUT + name });
  await unclip(false);
  console.log('✓', name);
}
async function setField(label, value) {
  await act(
    (l, v) => {
      const f = [...document.querySelectorAll('label.field')].find((x) => x.querySelector('span')?.textContent === l);
      const i = f.querySelector('input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, String(v));
      i.dispatchEvent(new Event('input', { bubbles: true }));
    },
    label,
    value,
  );
}

// ---------------------------------------------------------------------------------------------
// Scenario: finish table after a 90° right turn (the default example of the manual)
await act(() => {
  const s = window.store.getState();
  s.newFromTemplate('tableAfterRight');
  s.updateEnv({ readerSensDbm: -80 });
  s.setView({ bikeS: -1.5 });
});
await settle(1500);
await act(() => window.store.getState().setSim({ selectedLane: 3 }));

// Overview
await tab('Antennas');
await camera([-10, 7.5, 11], [-1, 1.5, 0]);
await shot('overview.png');

// Track & view
await tab('Track & view');
await section('track-editor.png', 'Track');
await section('arch-settings.png', 'Finish arch');
await section('view-settings.png', 'View');
await act(() => window.store.getState().setView({ showZones: false, showHorizontal: false, showBike: false, showPasses: false }));
await settle();
await camera([-10, 5, 14], [-9, 0.8, 0]);
await viewport('track-table-3d.png');

// Width taper example (narrow approach, wide table), top view
await act(() => {
  const s = window.store.getState();
  const ids = s.setup.track.segments.map((g) => g.id);
  const w = [6, 6, 10, 10, 6, 6];
  const taper = [false, false, true, false, true, false];
  ids.forEach((id, i) => s.updateSegment(id, { widthM: w[i], taper: taper[i] }));
});
await settle();
await camera([-10, 38, 0.01], [-10, 0, 0]);
await viewport('track-width-top.png');
await act(() => window.store.getState().newFromTemplate('tableAfterRight'));
await act(() => window.store.getState().updateEnv({ readerSensDbm: -80 }));
await settle();

// Antennas: selection + gizmo + properties
await tab('Antennas');
await act(() => {
  const s = window.store.getState();
  s.setView({ showZones: false, showHorizontal: false, showBike: false, showPasses: false });
  s.select(s.setup.antennas[1].id);
  s.setTransformMode('rotate');
});
await settle();
await camera([-3.5, 3.2, -8.5], [0, 2.2, -4]);
await viewport('antenna-gizmo.png');
await section('antenna-props.png', 'Antenna P2');
await section('scene-objects.png', 'Scene objects');

// Obstacles
await act(() => {
  const s = window.store.getState();
  s.setTransformMode('translate');
  s.addObstacle('hay-dry');
  const id = window.store.getState().selectedId; // the new obstacle
  window.store.getState().updateObstacle(id, { base: 'track', position: [0, 0, -3.6], sizeM: [1.2, 0.9, 0.8], count: 3 });
  window.store.getState().setView({ showZones: true });
});
await settle(1500);
await camera([-8, 6.5, -7], [0, 1.6, -2.5]);
await viewport('obstacles-3d.png');
await section('obstacle-props.png', 'Obstacle');
await act(() => {
  const s = window.store.getState();
  s.removeObstacle(s.setup.obstacles[0].id);
  s.select(null);
});
await settle();

// Read zones and heatmaps
await act(() => window.store.getState().setView({ showZones: true, showHorizontal: false, showBike: false, showPasses: false }));
await settle(1500);
await camera([-11, 7, 10], [0, 2, 0]);
await viewport('read-zones.png');
await act(() => window.store.getState().setView({ showZones: false, showHorizontal: true, sliceMode: 'dominant', sliceHeight: 0.5 }));
await settle(1500);
await camera([0, 26, 0.01], [0, 0, 0]);
await viewport('heatmap-dominant.png');
await act(() => window.store.getState().setView({ sliceMode: 'overlap' }));
await settle(800);
await viewport('heatmap-overlap.png');
await act(() => window.store.getState().setView({ sliceMode: 'rssi' }));
await settle(800);
await viewport('heatmap-rssi.png');
// "what limits the read" with pessimistic values (Rx −70 dBm, 10 dB bike shadow), then the defaults
await act(() => {
  const s = window.store.getState();
  s.updateEnv({ readerSensDbm: -70 });
  s.updateTag({ shadowDb: 10 });
  s.setView({ sliceMode: 'limit' });
});
await settle(1500);
await viewport('heatmap-limit-pessimistic.png');
await act(() => {
  const s = window.store.getState();
  s.updateEnv({ readerSensDbm: -80 });
  s.updateTag({ shadowDb: 6 });
});
await settle(1500);
await viewport('heatmap-limit.png');
await act(() => window.store.getState().setView({ showHorizontal: false, showFinishSlice: true, sliceMode: 'dominant' }));
await settle(1500);
await camera([-13, 3.5, 0.01], [0, 2.5, 0]);
await viewport('finish-slice.png');
await act(() => window.store.getState().setView({ showFinishSlice: false, showHorizontal: true }));

// Tag, bike, second tag
await act(() => {
  const s = window.store.getState();
  s.setTag2Enabled(true);
  s.setView({ showBike: true, bikeLinks: true, showZones: false, showHorizontal: false, bikeS: -1.5 });
  s.setSim({ selectedLane: 3 });
});
await settle(1500);
await tab('Antennas');
await camera([-0.5, 2.8, 4.5], [-2.5, 1.2, 0]);
await viewport('bike-view.png');
await section('tag-settings.png', 'Tag, reader');
await box('bike-view-table.png', 'Bike view');
await camera([-0.2, 2.3, -1.9], [-1.5, 1.8, 0]);
await act(() => window.store.getState().setView({ bikeLinks: false }));
await sleep(600);
await viewport('bike-closeup.png');
await act(() => {
  const s = window.store.getState();
  s.setTag2Enabled(false);
  s.setView({ bikeLinks: true });
});

// Simulation
await tab('Simulation');
await act(() => {
  const s = window.store.getState();
  s.setView({ showPasses: true, showBike: false, showZones: false, showHorizontal: true, sliceMode: 'dominant' });
});
await settle(1500);
await act(() => {
  const s = window.store.getState();
  s.setSim({ selectedLane: s.sim.lanes.findIndex((l) => l.kind === 'line') });
});
await sleep(600);
await camera([-4, 30, 0.01], [-4, 0, 0]);
await shot('simulation.png');
await section('rider-lines.png', 'Rider lines');
await section('virtual-wall.png', 'Virtual wall');
await section('pass-sim-settings.png', 'Pass simulation');

// Power optimiser
await click('Optimise power');
await page.waitForFunction(() => [...document.querySelectorAll('.section h3')].some((h) => h.textContent === 'Suggested power'), { timeout: 180000 });
await sleep(500);
await section('optimize-power.png', 'Suggested power');
await click('Discard');

// Layout search (small, for speed)
await setField('Max antennas', 3);
await setField('Trials while searching', 2);
await sleep(300);
await click('Find best layout');
await page.waitForFunction(
  () => [...document.querySelectorAll('button')].some((b) => b.textContent === 'Find best layout') &&
    [...document.querySelectorAll('.section')].some((s) => s.querySelector('h3')?.textContent === 'Antenna layout search' && s.querySelector('table')),
  { timeout: 300000 },
);
await sleep(500);
await section('layout-search.png', 'Antenna layout search');

// Live: reader connection and simulated reader
await tab('Live reader');
await act(() => window.live.setState({ log: [] }));
await section('live-reader.png', 'Reader connection');
await click('Simulated from model');
await sleep(300);
await act(() => window.live.setState({ log: [] }));
await setField('Rider every', 1);
await setField('Port 2', 3);
await sleep(200);
await click('Start riders');
await sleep(40000);
await click('Stop');
await sleep(5000);
await act(() => window.store.getState().setView({ showPasses: false, showHorizontal: false, showZones: true }));
await settle(1200);
await camera([-10, 7.5, 11], [-1, 1.5, 0]);
await shot('live-sim.png');
await section('live-sim-controls.png', 'Reader connection');
await section('live-passes.png', 'Passes');
await section('calibration.png', 'Calibration');

await browser.close();
console.log('done →', OUT);
