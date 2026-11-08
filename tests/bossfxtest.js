// 子轮 H：夜鸦专属特效。直接推进游戏帧，在测试画布记录真正提交的绘制。
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765;
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };

async function exercise() {
  const g = __game;
  const { FX_ART, enemyTex, enemyFb } = await import('./src/fx_art.js');
  const { Boss } = await import('./src/boss.js');
  const { BOSS_FX, ENEMY_FX } = await import('./src/fx_data.js');
  const { BOSS_SPRITES } = await import('./src/enemy_sprites.js');
  const { tinted } = await import('./src/fx_tex.js');
  const { toScreen } = await import('./src/config.js');
  const R = BOSS_FX.nightRaven, pack = FX_ART.raven;
  const sheet = BOSS_SPRITES.nightRaven.sheet;
  const out = {};
  const enter = (stage) => { g.story.clear(); g.startStage(stage, 0, false); g.story.clear(); };
  const wait = async (ready) => {
    for (let i = 0; i < 80 && !ready(); i++) await new Promise((r) => setTimeout(r, 100));
    return !!ready();
  };
  const item = (id) => pack.items[id];

  enter(1);
  const loaded = await wait(() => pack.ready && item(R.arrow.tex));
  enter(0);
  const released = !pack.ready && !pack.loading && !Object.keys(pack.items).length;
  out.stage = { ok: loaded && released, loaded, released };
  enter(1);
  await wait(() => pack.ready && sheet.ready && FX_ART.enemy.ready && FX_ART.enemyTex.ready);
  for (let i = 0; i < 30; i++) g.update();

  // 一次性特效只记实际生成的粒子，同时保留旧特效调用供退路验收。
  const calls = [], flips = [], originals = new Map();
  for (const method of ['flip', 'emit', 'ring', 'rune', 'flash']) {
    const original = g.fx[method];
    originals.set(method, original);
    g.fx[method] = function (...args) {
      const result = original.apply(this, args);
      if (method === 'flip') {
        if (result?.kind === 'flip' && result.fb?.id === args[0]) {
          flips.push({ id: args[0], xyz: args.slice(1, 4), tick: g.ticks });
        }
      } else {
        calls.push({ method, args });
      }
      return result;
    };
  }
  const at = (id) => flips.filter((q) => q.id === id);
  const called = (method, first) => calls.some((q) => q.method === method && (first === undefined || q.args[0] === first));
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  const samePoints = (particles, spots) =>
    particles.length === spots.length &&
    spots.every((s) => particles.filter((q) => near(q.xyz[0], s.x) && near(q.xyz[1], s.y)).length === 1);

  const cv = document.createElement('canvas'); cv.width = 960; cv.height = 540;
  const ctx = cv.getContext('2d');
  const paint = ctx.drawImage.bind(ctx);
  const assets = new Map();
  let draws = [];
  function register(id, asset, color = null) {
    const frames = asset?.frames || (asset ? [asset] : []);
    frames.forEach((image, frame) => {
      if (!image) return;
      assets.set(color ? tinted(image, color) : image, { id, frame, sc: image.sc });
    });
  }
  register(R.feather.fb, item(R.feather.fb));
  register(R.feather.trail, item(R.feather.trail), R.feather.trailColor);
  register(R.arrow.tex, item(R.arrow.tex));
  register('arrow', enemyTex(ENEMY_FX.arrow.tex));
  register('feather_blade', sheet.feather);
  for (const e of [R.glint, R.wisps, R.gather, R.rain]) register(e.fb, item(e.fb), e.color);
  register(R.sigil.tex, item(R.sigil.tex), R.sigil.color);
  register(R.veil.tex, item(R.veil.tex));
  const meteor = enemyFb(ENEMY_FX.meteor.fb);
  for (const color of ['#ff4dd2', '#b46bff']) register(ENEMY_FX.meteor.fb, meteor, color);
  ctx.drawImage = (image, ...args) => {
    const marker = assets.get(image);
    if (marker) {
      const { a, b, d, e, f } = ctx.getTransform();
      draws.push({ ...marker, a, b, d, x: e, y: f, alpha: ctx.globalAlpha });
    }
    return paint(image, ...args);
  };
  const draw = (fn) => { draws = []; ctx.clearRect(0, 0, cv.width, cv.height); fn(); return draws; };
  const has = (rows, id) => rows.some((q) => q.id === id);
  const body = (boss) => draw(() => boss.draw(ctx, 0, g.ticks));
  const shotArt = (shot) => draw(() => shot.draw(ctx, 0));
  const floor = (hazards = g.hazards) => draw(() => hazards.forEach((h) => h.drawFloor(ctx, 0)));

  const pl = g.player;
  const pin = () => Object.assign(pl, { x: 500, y: 90, z: 0, vx: 0, vy: 0, vz: 0, invuln: 1e9 });
  const step = (n = 1) => { for (let i = 0; i < n; i++) { pin(); g.hitstop = 0; g.update(); } };
  function until(find, limit, label, advance = step) {
    for (let i = 0; i <= limit; i++) {
      const found = find();
      if (found) return found;
      if (i < limit) advance();
    }
    throw new Error(label + ' 未在 ' + limit + ' 帧内出现');
  }
  function scene(move, key = 'nightRaven') {
    // 清掉上个场景的通关倒计时，避免后续测试被结算冻结。
    g.bossDownAt = null; g.waveClearAt = null; g.room.cleared = false;
    g.spawnQueue = []; g.hazards = []; g.projectiles = []; g.attackers.clear();
    if (g.terrain?.pillars) g.terrain.pillars.length = 0;
    g.fx.live.length = 0; flips.length = 0; calls.length = 0;
    g.banner = null;
    pl.hp = pl.maxHp = 1e9; pl.setState('idle'); pin();
    const b = new Boss(key, 850, 90, g, g.stage.lv);
    b.setState('idle'); b.restT = 1e9; b.facing = -1;
    g.enemies = [b]; g.boss = b;
    if (move) b.startAct(move);
    return b;
  }
  const arrows = () => g.projectiles.filter((q) => q.kind === 'arrow');
  const feather = () => until(() => g.projectiles.find((q) => q.kind === 'feather'), 65, '回旋羽');
  const rain = () => until(() => g.hazards.find((q) => q.kind === 'meteor'), 30, '天降');
  const land = (h) => { h.t = h.delay - 1; h.update(g); };
  const finishChannel = (b) => until(() => !b.act, 250, '读条结束');
  const kill = (b) => {
    g.applyHit(pl, b, { dmg: 1e9, kb: 0, launch: 0, stun: 1, stop: 0 }, 1);
    step(70);
  };
  const check = (key, fn) => {
    try { out[key] = fn(); }
    catch (e) { out[key] = { ok: false, error: e.message }; }
  };

  try {
    check('feather', () => {
      scene('featherRang');
      const q = feather(); g.projectiles = [q];
      const air = shotArt(q), before = at(R.burst.fb).length;
      until(() => q.returned, 80, '羽刃掉头');
      const turnTick = g.ticks, turn = at(R.burst.fb);
      step(4);
      const count = at(R.burst.fb).length;
      return {
        ok: has(air, R.feather.fb) && has(air, R.feather.trail) && before === 0 &&
          turn.length === 1 && turn[0].tick === turnTick && count === 1,
        draw: air.map((q) => q.id), before, turn, turnTick, count,
      };
    });

    check('volley', () => {
      const b = scene('volley');
      let glint = false;
      const shots = until(() => arrows().length && arrows(), 80, '齐射箭', () => {
        step();
        if (b.tele && !arrows().length) glint ||= has(body(b), R.glint.fb);
      });
      const own = shots.every((q) => q.owner?.key === 'nightRaven' && has(shotArt(q), R.arrow.tex));
      return { ok: glint && own && shots.length === 3, glint, own, shots: shots.length };
    });

    check('split', () => {
      const b = scene('ravenSplit');
      step(); const opened = at(R.burst.fb).length;
      until(() => b.split, 15, '三处分身');
      const spots = [b, ...b.split.spots].map(({ x, y }) => ({ x, y }));
      const appear = at(R.appear.fb), threeAppear = samePoints(appear, spots);
      const samples = [];
      for (const t of [11, 17, 24]) {
        until(() => b.split?.t >= t, 32, '丝缕第 ' + t + ' 帧');
        const wisps = body(b).filter((q) => q.id === R.wisps.fb);
        const fb = item(R.wisps.fb);
        const frame = Math.floor(b.split.t * fb.fps / 60) % fb.frames.length;
        const projected = spots.map((s) => toScreen(s.x, s.y, b.z, 0));
        const same = wisps.length === 3 &&
          projected.every(([x, y]) => wisps.filter((q) => near(q.x, x) && near(q.y, y)).length === 1) &&
          wisps.every((q) => q.frame === frame && near(q.alpha, R.wisps.alpha * b.fade) &&
            near(q.d, b.h / 260 * R.wisps.size / q.sc) && near(q.a, q.d * b.facing) && near(q.b, 0));
        samples.push({ same, frame, draws: wisps });
      }
      const shots = until(() => arrows().length >= 3 && arrows(), 60, '分身射箭');
      const fakes = shots.filter((q) => q.fake);
      const fakeArt = fakes.length === 2 && fakes.every((q) => q.owner === b && has(shotArt(q), R.arrow.tex));
      const copies = b.split.spots.slice(), n = at(R.burst.fb).length;
      b.hp -= 1; // 只触发招式自己的识破判定，排除受击硬直提前打断。
      step();
      const reveal = at(R.burst.fb).slice(n);
      return {
        ok: opened === 1 && threeAppear && samples.every((s) => s.same) &&
          new Set(samples.map((s) => s.frame)).size > 1 && fakeArt && !b.split && samePoints(reveal, copies),
        opened, threeAppear, samples, fakeArt, cleared: !b.split, reveal,
      };
    });

    check('teleport', () => {
      const b = scene('teleport'), from = { x: b.x, y: b.y };
      step(); const burst = at(R.burst.fb);
      until(() => at(R.appear.fb).length, 30, '瞬移出现'); step(4);
      const appear = at(R.appear.fb);
      return {
        ok: samePoints(burst, [from]) && samePoints(appear, [b]) && at(R.burst.fb).length === 1 &&
          (b.x !== from.x || b.y !== from.y) && burst[0].tick < appear[0].tick,
        burst, appear,
      };
    });

    check('rain', () => {
      scene('rain'); const h = rain(); const raven = floor([h]);
      land(h); const impact = at(R.rain.impact);
      scene('rain', 'afterimage'); const other = rain(), shadow = floor([other]); land(other);
      return {
        ok: has(raven, R.rain.fb) && !has(raven, ENEMY_FX.meteor.fb) && samePoints(impact, [h]) &&
          has(shadow, ENEMY_FX.meteor.fb) && !has(shadow, R.rain.fb) && at(R.rain.impact).length === 0,
        raven: raven.map((q) => q.id), impact, shadow: shadow.map((q) => q.id),
      };
    });

    check('channel', () => {
      let b = scene('channel'); step(8);
      const sigil = has(floor(), R.sigil.tex), gather = has(body(b), R.gather.fb);
      const before = has(body(b), R.veil.tex);
      finishChannel(b);
      const flash = has(body(b), R.veil.tex);
      step(16); const faded = !has(body(b), R.veil.tex);
      b = scene('channel'); step(8);
      const active = has(floor(), R.sigil.tex) && has(body(b), R.gather.fb);
      b.setState('hurt'); // 同一帧就重画，不能等 Hazard.update 清队列。
      const stopped = !has(floor(), R.sigil.tex) && !has(body(b), R.gather.fb) && !has(body(b), R.veil.tex);
      step(16); const stayedOff = !has(body(b), R.veil.tex);
      return { ok: sigil && gather && !before && flash && faded && active && stopped && stayedOff,
        sigil, gather, before, flash, faded, active, stopped, stayedOff };
    });

    check('death', () => {
      const b = scene(); kill(b); const death = at(R.death.fb);
      return { ok: death.length === 1 && near(death[0].xyz[2], 0), death };
    });

    check('fallback', () => {
      const ready = pack.ready;
      pack.ready = false;
      try {
        scene('featherRang'); const q = feather(); g.projectiles = [q];
        const f = shotArt(q);
        until(() => q.returned, 80, '退路羽刃掉头');
        const blade = has(f, 'feather_blade') && !has(f, R.feather.fb) &&
          !has(f, R.feather.trail) && at(R.burst.fb).length === 0;

        let b = scene('volley'), glint = false;
        const shots = until(() => arrows().length && arrows(), 80, '退路齐射', () => {
          step(); glint ||= has(body(b), R.glint.fb);
        });
        const arrow = !glint && shots.every((q) => {
          const row = shotArt(q); return has(row, 'arrow') && !has(row, R.arrow.tex);
        });

        b = scene('ravenSplit'); step();
        const soul = called('emit', 'soul');
        until(() => b.split, 15, '退路分身'); step(10);
        const split = soul && at(R.burst.fb).length === 0 && at(R.appear.fb).length === 0 &&
          !has(body(b), R.wisps.fb);

        scene('teleport'); step(23);
        const teleport = calls.filter((q) => q.method === 'ring').length >= 2 &&
          !at(R.burst.fb).length && !at(R.appear.fb).length;

        scene('rain'); const h = rain(), storm = floor([h]); land(h);
        const rainArt = has(storm, ENEMY_FX.meteor.fb) && !has(storm, R.rain.fb) &&
          at('impact_ground').length === 1 && !at(R.rain.impact).length;

        b = scene('channel'); step(8);
        const rune = called('rune') && !has(floor(), R.sigil.tex) && !has(body(b), R.gather.fb);
        finishChannel(b);
        const channel = rune && called('flash') && !has(body(b), R.veil.tex);

        b = scene(); kill(b);
        const death = !at(R.death.fb).length && called('emit', 'dissolve');
        const result = { blade, arrow, split, teleport, rainArt, channel, death };
        return { ok: Object.values(result).every(Boolean), ...result };
      } finally { pack.ready = ready; }
    });
  } finally {
    for (const [method, original] of originals) g.fx[method] = original;
  }
  return out;
}

(async () => {
  const errs = []; let browser, r = {}, setupError;
  try {
    browser = await chromium.launch();
    const p = await browser.newPage({ viewport: { width: 960, height: 540 } });
    p.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
    const res = await p.goto('http://localhost:' + PORT + '/index.html');
    if (!res?.ok()) throw new Error('index.html HTTP ' + (res?.status() ?? 'unknown'));
    await p.evaluate(() => localStorage.clear()); await p.reload();
    await p.waitForFunction(() => !!globalThis.__game);
    r = await p.evaluate(exercise);
  } catch (e) {
    setupError = e.message.split('\n')[0];
    console.error(e.stack || e);
  } finally { await browser?.close(); }
  console.log(JSON.stringify(r));
  const checks = [
    ['stage', '第 2 关载入夜鸦特效，第 1 关释放'],
    ['feather', '回旋羽实际绘制羽刃和拖尾，掉头当帧一次爆羽'],
    ['volley', '齐射预警画弓弦闪光，三支箭归属夜鸦并画夜鸦箭'],
    ['split', '分身消散与三处浮现，丝缕同尺寸同透明度同帧，识破各爆羽一次'],
    ['teleport', '瞬移出发一次爆羽，落点一次浮现'],
    ['rain', '夜鸦天降画箭束并爆发，残影天降仍画陨石'],
    ['channel', '读条法阵和聚羽，结束闪夜幕，打断即停'],
    ['death', '落地死亡恰好生成一次专属特效'],
    ['fallback', '夜鸦图集未就绪时回退且无页面错误'],
  ];
  for (const [key, label] of checks) {
    ok(r[key]?.ok && (key !== 'fallback' || !errs.length),
      label + (r[key]?.error ? ' ' + r[key].error : setupError ? ' 未执行（' + setupError + '）' : ''));
  }
  ok(!setupError && !errs.length, 'PAGE ERRORS ' + (errs.join(' | ') || (setupError ? '未执行' : 'none')));
  console.log(bad ? 'BOSSFXTEST FAIL ' + bad : 'BOSSFXTEST ok');
  if (bad) process.exitCode = 1;
})();
