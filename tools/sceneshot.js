// 场景截图：默认桌面，--mobile 使用手机图集；比较端在左，本分支在右。
const fs = require('node:fs');
const path = require('node:path');
const VIEW_W = 960, VIEW_H = 540, TILE_W = 480, TILE_H = 270;
const USAGE = 'node tools/sceneshot.js <输出.png> [--port N] [--compare N] [--mobile]';
const CELLS = [
  ...Array.from({ length: 5 }, (_, stage) => ({ label: 'Stage ' + (stage + 1) + ' torch', stage, kind: 'torch' })),
  { label: 'South exit locked', stage: 0, kind: 'south', cleared: false },
  { label: 'South exit cleared', stage: 0, kind: 'south', cleared: true },
  { label: 'World trial stele', kind: 'trial' },
];
function readPort(value, option) {
  if (!/^\d+$/.test(value ?? '') || Number(value) < 1 || Number(value) > 65535) throw new Error(option + ' 需要 1～65535 的端口号');
  return Number(value);
}
function readArgs([output, ...flags]) {
  if (!output || !/\.png$/i.test(output)) throw new Error(USAGE);
  let port = readPort(process.env.PORT || '8765', 'PORT'), compare, mobile = false;
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] === '--port') port = readPort(flags[++i], '--port');
    else if (flags[i] === '--compare') compare = readPort(flags[++i], '--compare');
    else if (flags[i] === '--mobile') mobile = true;
    else throw new Error(USAGE);
  }
  return { output, port, compare, mobile };
}
async function captureCell({ cell, vw, vh, tw, th }) {
  const g = window.__game;
  const src = name => import('./src/' + name);
  const [{ FX_ART }, scenery, { settings }, { WORLD_ART }] = await Promise.all([
    src('fx_art.js'), src('scenery.js'), src('settings.js'), src('world_art.js')
  ]);
  const wait = async fn => {
    for (let i = 0; i < 120 && !fn(); i++) await new Promise(r => setTimeout(r, 100));
    if (!fn()) throw new Error('素材载入超时');
  };
  const own = Object.hasOwn(g, 'update'), update = g.update;
  const old = { numbers: settings.numbers, zoom: settings.zoom, shake: settings.shake };
  g.update = () => {};
  try {
    settings.numbers = 'off'; settings.zoom = false; settings.shake = 0;
    g.story.clear();
    // 比较端允许没有 fx_scene；已有的光照和场景贴图仍须等到载好。
    await wait(() => FX_ART.light.ready && (!FX_ART.scene || FX_ART.scene.ready));
    if (cell.kind === 'trial') {
      const { worldSave } = await src('world_story.js');
      const { site } = await src('world.js');
      g.save.cleared.s1 = true; worldSave(g.save).trial = true;
      g.openHub(); g.story.clear();
      await wait(() => WORLD_ART.ready);
      const W = g.world, s = site('trial');
      W.ev = null; W.caption = null; W.flare.trial = null; W.motes = [];
      W.hero.x = s.x; W.hero.y = s.y + 100; W.snapCam();
      g.setScene('world');
    } else {
      g.startStage(cell.stage, 0, false); g.story.clear();
      const room = cell.kind === 'south'
        ? [...g.dungeon.rooms.values()].find(r => r.doors.s)
        : g.room;
      if (!room) throw new Error('没有南出口房间');
      if (room !== g.room) g.enterRoom(room, null);
      // drawScenery 首次选中该关远景，等它载好再拍，避免切关时拍到空背景。
      const probe = document.createElement('canvas').getContext('2d');
      await wait(() => {
        scenery.drawScenery(probe, 0, 60, g.stage.theme, room);
        const status = scenery.envStatus();
        return status.ready && status.loaded.includes(status.stage);
      });
      g.enemies = []; g.boss = null; g.spawnQueue = []; g.hazards = []; g.projectiles = []; g.loots = [];
      g.attackers.clear(); g.waveActive = true;
      room.cleared = !!cell.cleared; room.openedAt = null;
      Object.assign(g.player, { x: room.w / 2, y: 90, z: 0, invuln: 1e9 });
      g.player.setState('idle');
      g.camX = Math.max(0, (room.w - vw) / 2);
      // 用真实场景返回的光源验证所选视野确实有火把。
      if (cell.kind === 'torch') {
        const probe = document.createElement('canvas').getContext('2d');
        if (!scenery.drawScenery(probe, g.camX, 60, g.stage.theme, room).length) throw new Error('视野内没有火把');
      }
    }
    g.ticks = 60; g.banner = null;
    g.fx.live.length = 0; g.fx.texts.length = 0; g.fx.flashA = 0; g.fx.shakeT = 0;
    g.render();
    const canvas = document.querySelector('canvas#game, #game canvas') || g.ctx.canvas;
    // 保留完整逻辑画面：南台阶贴近下沿，不能沿用敌人截图的中心裁切。
    const sx = canvas.width / vw, sy = canvas.height / vh;
    const tile = document.createElement('canvas'); tile.width = tw; tile.height = th;
    tile.getContext('2d').drawImage(canvas, 0, 0, Math.round(vw * sx), Math.round(vh * sy), 0, 0, tw, th);
    return tile.toDataURL('image/png');
  } finally {
    if (own) g.update = update; else delete g.update;
    Object.assign(settings, old);
  }
}
async function captureVersion(browser, port, mobile) {
  const context = await browser.newContext(mobile
    ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 720 } });
  try {
    await context.addInitScript(() => { localStorage.clear(); window.__aiSeed = 2468; });
    const page = await context.newPage(), errors = [], tiles = [];
    page.on('pageerror', e => errors.push(e.message));
    const response = await page.goto('http://localhost:' + port + '/index.html');
    if (!response?.ok()) throw new Error('index.html 无法访问：' + port);
    await page.waitForFunction(() => !!window.__game);
    for (const cell of CELLS) {
      try {
        tiles.push(await page.evaluate(captureCell, { cell, vw: VIEW_W, vh: VIEW_H, tw: TILE_W, th: TILE_H }));
        if (errors.length) throw new Error(errors.join(' | '));
      } catch (e) { throw new Error(port + ' / ' + cell.label + ': ' + e.message); }
    }
    return { port, tiles };
  } finally { await context.close(); }
}
async function assemble({ versions, labels, columns, tw, th }) {
  const gap = 6, split = 18, header = versions.length > 1 ? 30 : 0;
  const rows = Math.ceil(labels.length / columns);
  const panelW = columns * (tw + gap) + gap;
  const sheet = document.createElement('canvas');
  sheet.width = versions.length * panelW + (versions.length - 1) * split;
  sheet.height = rows * (th + gap) + gap + header;
  const ctx = sheet.getContext('2d');
  ctx.fillStyle = '#16151d';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.font = '16px sans-serif';
  ctx.textBaseline = 'top';
  for (const [side, version] of versions.entries()) {
    const offset = side * (panelW + split);
    if (header) {
      ctx.fillStyle = '#fff';
      ctx.fillText('localhost:' + version.port, offset + gap, 8);
    }
    for (const [i, tile] of version.tiles.entries()) {
      const image = new Image();
      image.src = tile;
      await image.decode();
      const x = offset + gap + (i % columns) * (tw + gap);
      const y = header + gap + Math.floor(i / columns) * (th + gap);
      ctx.drawImage(image, x, y);
      ctx.fillStyle = 'rgba(0,0,0,0.76)';
      ctx.fillRect(x, y, Math.min(tw, ctx.measureText(labels[i]).width + 16), 27);
      ctx.fillStyle = '#fff';
      ctx.fillText(labels[i], x + 8, y + 5, tw - 16);
    }
  }
  const png = sheet.toDataURL('image/png').split(',')[1];
  if (!png) throw new Error('拼图尺寸超出浏览器画布限制，请减少格子或列数');
  return png;
}

async function main() {
  const { output, port, compare, mobile } = readArgs(process.argv.slice(2));
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    const versions = [];
    if (compare !== undefined) versions.push(await captureVersion(browser, compare, mobile));
    versions.push(await captureVersion(browser, port, mobile));
    const page = await browser.newPage();
    const png = await page.evaluate(assemble, { versions, labels: CELLS.map(c => c.label), columns: 2, tw: TILE_W, th: TILE_H });
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, Buffer.from(png, 'base64'));
    console.log('已写出 ' + output + '（8 格 × ' + versions.length + ' 版本，' + (mobile ? '手机' : '桌面') + '）');
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
