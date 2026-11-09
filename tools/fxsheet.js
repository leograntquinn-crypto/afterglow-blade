// 特效截图表：关卡序号从 0 开始，frames 从触发时刻起数。
// 配置用 { columns, cells }，也可直接给格子数组（默认 4 列）。
// --compare 的端口放左边，--port 的端口放右边。
const fs = require('node:fs');
const path = require('node:path');

const USAGE = 'node tools/fxsheet.js <配置.json> <输出.png> [--port N] [--compare N] [--mobile]';
const VIEW_W = 960, VIEW_H = 540;
const TILE_W = 448, TILE_H = 352;

function readPort(value, option) {
  if (!/^\d+$/.test(value ?? '') || Number(value) < 1 || Number(value) > 65535) {
    throw new Error(option + ' 需要 1～65535 的端口号');
  }
  return Number(value);
}

function readArgs([file, output, ...flags]) {
  if (!file || file.startsWith('--') || !output || !/\.png$/i.test(output)) throw new Error(USAGE);
  let port, compare, mobile = false;
  for (let i = 0; i < flags.length; i++) {
    const key = flags[i];
    if (key === '--port') port = readPort(flags[++i], key);
    else if (key === '--compare') compare = readPort(flags[++i], key);
    else if (key === '--mobile') mobile = true;
    else throw new Error('未知参数 ' + key + '\n' + USAGE);
  }
  return { file, output, port: port ?? readPort(process.env.PORT || '8765', 'PORT'), compare, mobile };
}

function readConfig(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cells = Array.isArray(data) ? data : data?.cells;
  const columns = (Array.isArray(data) ? undefined : data?.columns) ?? 4;
  if (!Array.isArray(cells) || !cells.length) throw new Error('配置需要至少一个格子（cells）');
  if (!Number.isInteger(columns) || columns < 1) throw new Error('columns 必须是正整数');
  cells.forEach((cell, i) => {
    const { label, stage, spawn, moment, frames, phase } = cell || {};
    if (typeof label !== 'string' || !label.trim() ||
        !Number.isSafeInteger(stage) || stage < 0 ||
        typeof spawn !== 'string' || !spawn.trim() ||
        typeof moment !== 'string' || !/^(tele|attack|hit|death|move:\S+)$/.test(moment) ||
        !Number.isSafeInteger(frames) || frames < 0 ||
        (phase !== undefined && (!Number.isSafeInteger(phase) || phase < 0 || phase > 2))) {
      throw new Error('第 ' + (i + 1) + ' 格配置无效，检查 label / stage / spawn / moment / frames / phase');
    }
  });
  return { cells, columns };
}

async function captureCell({ cell, vw, vh, tw, th }) {
  const src = (file) => import(new URL('src/' + file, location.href).href);
  const g = window.__game;
  const { stage, spawn, moment, frames } = cell;
  const bossMoves = {
    boneLord: 'combo', nightRaven: 'featherRang', ironJaw: 'chainHook',
    warden: 'soulBraziers', afterimage: 'execution'
  };
  const namedMove = moment.startsWith('move:');
  const isBoss = namedMove || Object.hasOwn(bossMoves, spawn);
  const [art, { settings }, actor] = await Promise.all([
    src('fx_art.js'), src('settings.js'), src(isBoss ? 'boss.js' : 'enemy.js')
  ]);
  const ownUpdate = Object.hasOwn(g, 'update');
  const update = g.update;
  const numbers = settings.numbers;
  const zoom = settings.zoom;
  const shake = settings.shake;
  const step = (count) => {
    for (let i = 0; i < count; i++) {
      g.hitstop = 0;
      update.call(g);
    }
  };

  // 等贴图和裁切期间，浏览器自己的循环不能把招式播完。
  g.update = () => {};
  try {
    settings.numbers = 'off';
    settings.zoom = false;
    settings.shake = 0;
    g.story.clear();
    g.startStage(stage, 0, false);
    g.story.clear();
    if (!g.stage || !g.player) throw new Error('无法进入关卡 ' + stage);

    const packs = [art.FX_ART?.enemy, art.FX_ART?.enemyTex];
    const typePack = art.FX_ART?.enemyType?.[spawn];
    if (typePack) {
      art.prepareEnemyFx?.([spawn]);
      packs.push(typePack);
    }
    // 比较端可能尚无某个包。只等已开始的载入，素材缺席时保留游戏自己的回退。
    for (let i = 0; i < 80 && packs.some((pack) => pack?.loading && !pack.ready); i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (packs.some((pack) => pack?.loading && !pack.ready)) throw new Error('特效图集载入超时');

    step(40);
    g.enemies = [];
    g.boss = null;
    g.spawnQueue = [];
    g.hazards = [];
    g.projectiles = [];
    g.loots = [];
    g.attackers.clear();
    g.waveActive = true;
    g.fx.live.length = 0;
    g.fx.texts.length = 0;
    g.fx.flashA = 0;
    g.fx.shakeT = 0;
    g.banner = null;

    const pl = g.player;
    const x = isBoss ? 700 : 560, y = 90;
    const gap = isBoss ? 280 : spawn === 'archer' ? 140 : 60;
    Object.assign(pl, { x: x - gap, y, z: 0, hp: pl.maxHp, invuln: 1e9, facing: 1 });
    pl.setState('idle');
    const e = isBoss
      ? new actor.Boss(spawn, x, y, g, g.stage.lv)
      : new actor.Enemy(spawn, x, y, g, { lv: g.stage.lv });
    e.setState('idle');
    e.st = 99;
    e.attackCd = 9999;
    e.facing = -1;
    if (e.T) e.T = { ...e.T, brain: null };
    if (spawn === 'wing') e.z = { tele: 100, attack: 80, hit: 60, death: 0 }[moment] ?? e.z;
    g.enemies = [e];
    if (isBoss) {
      g.boss = e;
      e.restT = 9999;
      // 可选 phase：满血时不会被阶段判定改回去，出招速度与染色都按该阶段走。
      if (cell.phase !== undefined) e.phase = cell.phase;
    }

    if (moment === 'hit' || moment === 'death') {
      const lethal = moment === 'death';
      g.applyHit(pl, e, { dmg: lethal ? 1e9 : 1, kb: 0, launch: 0, stun: lethal ? 1 : 30, stop: 0 }, 1);
    } else if (isBoss) {
      // 首领的预警和出招在同一 act 内，用 frames 选择所需时刻。
      const move = namedMove ? moment.slice(5) : bossMoves[spawn];
      e.startAct(move);
      if (e.act?.name !== move) throw new Error('首领 ' + spawn + ' 未启动招式 ' + move);
    } else {
      if (!e.T?.atk) throw new Error('敌人 ' + spawn + ' 没有可触发的攻击');
      const tele = moment === 'tele';
      const atk = { ...e.T.atk, windup: tele ? Math.max(60, frames + 1) : 1 };
      if (spawn === 'brute') atk.slam = !tele;
      if (spawn === 'priest' && !tele) atk.kind = 'trap';
      e.startWindup(g, atk);
    }

    step(frames);
    g.banner = null;
    g.fx.texts.length = 0;
    g.fx.shakeT = 0;
    g.render();

    const canvas = document.querySelector('canvas#game, #game canvas') || g.ctx.canvas;
    // camX 是横向世界偏移。竖向留足浮空、体型和落地特效的空间。
    const screenX = e.x - g.camX;
    const floorY = 320 + e.y;
    const screenY = floorY - (e.z || 0) / 2 - (e.h || 100) / 2;
    const clamp = (value, max) => Math.max(0, Math.min(value, max));
    const left = clamp(Math.round(screenX - tw * 0.60), vw - tw);
    const top = clamp(Math.round(screenY - th * 0.55), vh - th);
    const sx = canvas.width / vw, sy = canvas.height / vh;
    const x0 = Math.round(left * sx), y0 = Math.round(top * sy);
    const sw = Math.round((left + tw) * sx) - x0;
    const sh = Math.round((top + th) * sy) - y0;
    const tile = document.createElement('canvas');
    tile.width = tw;
    tile.height = th;
    tile.getContext('2d').drawImage(canvas, x0, y0, sw, sh, 0, 0, tw, th);
    return tile.toDataURL('image/png');
  } finally {
    if (ownUpdate) g.update = update;
    else delete g.update;
    settings.numbers = numbers;
    settings.zoom = zoom;
    settings.shake = shake;
  }
}

async function captureVersion(browser, port, mobile, cells) {
  // 设备参数与 worldtest.js 一致，页面启动时自行选用对应图集。
  const context = await browser.newContext(mobile
    ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 720 } });
  try {
    await context.addInitScript(() => { window.__aiSeed = 2468; });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const response = await page.goto('http://localhost:' + port + '/index.html');
    if (!response?.ok()) throw new Error('端口 ' + port + ' 的 index.html 无法访问');
    await page.waitForFunction(() => typeof window.__game?.update === 'function');
    const tiles = [];
    for (const cell of cells) {
      try {
        const tile = await page.evaluate(captureCell, { cell, vw: VIEW_W, vh: VIEW_H, tw: TILE_W, th: TILE_H });
        if (errors.length) throw new Error(errors.join(' | '));
        tiles.push(tile);
      } catch (error) {
        throw new Error('端口 ' + port + ' / ' + cell.label + ' / ' + cell.moment + '：' + error.message);
      }
    }
    return { port, tiles };
  } finally {
    await context.close();
  }
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
  const { file, output, port, compare, mobile } = readArgs(process.argv.slice(2));
  const { cells, columns } = readConfig(file);
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    const versions = [];
    if (compare !== undefined) versions.push(await captureVersion(browser, compare, mobile, cells));
    versions.push(await captureVersion(browser, port, mobile, cells));
    const page = await browser.newPage();
    const png = await page.evaluate(assemble, { versions, labels: cells.map((c) => c.label), columns, tw: TILE_W, th: TILE_H });
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, Buffer.from(png, 'base64'));
    console.log('已写出 ' + output + '（' + cells.length + ' 格 × ' + versions.length + ' 版本）');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
