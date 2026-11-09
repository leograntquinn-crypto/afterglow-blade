// 子轮 H：残影特效；推进真实招式，记录实际贴图、粒子次数与路线描线调用。
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765;
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };

async function exercise() {
  const g = __game;
  const { FX_ART, flipbook } = await import('./src/fx_art.js');
  const { Boss } = await import('./src/boss.js');
  const { Projectile } = await import('./src/combat.js');
  const { Streak } = await import('./src/boss_moves.js');
  const { tinted } = await import('./src/fx_tex.js');
  const { toScreen } = await import('./src/config.js');
  const { BOSS_FX } = await import('./src/fx_data.js');
  const pack = FX_ART.afterimage, out = {};
  g.story.clear(); g.startStage(4, 0, false); g.story.clear();
  for (const p of [pack, FX_ART.hero, FX_ART.bladeTex, FX_ART.blade]) await p.load();
  for (let i = 0; i < 30; i++) g.update();
  // 固定招式路线与表现用的随机源，重复运行仍生成同一组线段。
  const random = Math.random;
  let seed = 9;
  Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const calls = [], flips = [], originals = new Map();
  for (const method of ['flip', 'arc']) {
    const original = g.fx[method]; originals.set(method, original);
    g.fx[method] = function (...args) {
      const p = original.apply(this, args);
      if (method === 'flip' && p?.fb?.id === args[0]) flips.push({ id: args[0], xyz: args.slice(1, 4), tick: g.ticks, facing: p.facing, rot: p.rot, scaleX: p.scaleX });
      if (method === 'arc') calls.push(g.fx.live[g.fx.live.length - 1]);
      return p;
    };
  }
  const at = (id) => flips.filter((p) => p.id === id);
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  const cv = document.createElement('canvas'); cv.width = 960; cv.height = 540;
  const ctx = cv.getContext('2d'), paint = ctx.drawImage.bind(ctx), stroke = ctx.stroke.bind(ctx);
  const images = new Map();
  function register(id, asset) {
    for (const img of asset?.frames || (asset ? [asset] : [])) {
      if (!img) continue; // 图集里全透明帧存为 null，跳过
      images.set(img, id);
      for (const color of ['#b46bff', g.player.glow]) for (const mode of ['fill', 'mul']) images.set(tinted(img, color, mode), id);
    }
  }
  for (const [id, asset] of Object.entries(pack.items)) register(id, asset);
  for (const id of ['wave_crescent']) register(id, flipbook(id));
  for (const [id, asset] of Object.entries(FX_ART.bladeTex.items)) register(id, asset);
  let draws = [], strokes = 0;
  ctx.drawImage = (img, ...args) => {
    if (images.has(img) && ctx.globalAlpha > 0) draws.push({ id: images.get(img), y: ctx.getTransform().f });
    return paint(img, ...args);
  };
  ctx.stroke = (...args) => { strokes++; return stroke(...args); };
  const draw = (fn) => { draws = []; strokes = 0; fn(); return draws; };
  const has = (rows, id) => rows.some((p) => p.id === id);
  const body = (b) => draw(() => b.draw(ctx, 0, g.ticks));
  const air = () => draw(() => g.fx.draw(ctx, 0));
  const check = (key, fn) => { try { out[key] = fn(); } catch (e) { out[key] = { ok: false, error: e.message }; } };
  const pl = g.player;
  const step = (n = 1) => { for (let i = 0; i < n; i++) { g.hitstop = 0; g.update(); } };
  function until(find, limit, label) {
    for (let i = 0; i <= limit; i++) {
      const found = find();
      if (found) return found;
      if (i < limit) step();
    }
    throw new Error(label + ' 未在 ' + limit + ' 帧内出现');
  }
  function scene(move, key = 'afterimage', vulnerable = false) {
    // 隔离结算、旧的弹道、粒子和地形碰撞，保留招式实际的命中与位移。
    g.bossDownAt = null; g.waveClearAt = null; g.room.cleared = false;
    g.spawnQueue = []; g.hazards = []; g.projectiles = []; g.loots = []; g.attackers.clear();
    g.terrain = null; g.banner = null; g.witch = 0;
    g.fx.live.length = 0; flips.length = 0; calls.length = 0;
    pl.setState('idle');
    Object.assign(pl, { x: 600, y: 90, z: 0, vx: 0, vy: 0, vz: 0, hp: pl.maxHp, invuln: vulnerable ? 0 : 1e9 });
    const b = new Boss(key, 850, 90, g, g.stage.lv);
    b.setState('idle'); b.restT = 1e9; b.facing = -1;
    g.enemies = [b]; g.boss = b;
    if (move) b.startAct(move);
    return b;
  }
  const arcArt = (p) => { p.life = p.max - 2; return draw(() => g.fx.drawArc(ctx, p, 400, 200, false)).map((q) => q.id); };
  const firstArc = () => until(() => calls[0], 80, '出刀');
  const finish = (b) => until(() => !b.act, 260, '收招');
  try {
    check('blade', () => {
      scene('combo'); const p = firstArc(), after = arcArt(p), dedicated = p.ribbon === pack.items.rev_ribbon;
      scene('combo', 'boneLord'); const other = firstArc();
      const otherArt = arcArt(other), originalOther = !other.ribbon;
      scene(); pl.startMove(g, 'chargeSlash2'); const hero = firstArc(), heroArt = arcArt(hero);
      return { ok: dedicated && after.includes('rev_ribbon') && originalOther && otherArt.includes('blade_ribbon_heavy') && !hero.ribbon && heroArt.includes('blade_ribbon_heavy'), after, otherArt, heroArt };
    });
    check('wave', () => {
      g.lastSkill = 'wave'; scene('mirror');
      const q = until(() => g.projectiles.find((p) => p.kind === 'wave'), 80, '镜像剑气');
      const enemy = draw(() => q.draw(ctx, 0)).map((p) => p.id);
      const hero = new Projectile({ x: 500, y: 90, z: 0, vx: 9, life: 60, kind: 'wave', team: 'player', owner: pl, color: pl.glow });
      const own = draw(() => hero.draw(ctx, 0)).map((p) => p.id);
      return { ok: enemy.includes('rev_wave') && !enemy.includes('wave_crescent') && own.includes('wave_crescent') && !own.includes('rev_wave'), enemy, own };
    });
    check('mirror', () => {
      g.lastSkill = 'wave'; const b = scene('mirror'); step(4);
      const sigils = body(b).filter((p) => p.id === 'mirror_sigil');
      const overhead = sigils.length === 1 && sigils[0].y < toScreen(b.x, b.y, b.z, 0)[1] - b.h;
      finish(b); const gone = !has(body(b), 'mirror_sigil');
      return { ok: overhead && gone, sigils, overhead, gone };
    });
    check('teleport', () => {
      const b = scene('teleport'), from = { x: b.x, y: b.y }; finish(b);
      const exits = at('shadow_step_out'), entries = at('shadow_step_in');
      return { ok: exits.length === 1 && entries.length === 1 && near(exits[0].xyz[0], from.x) && near(entries[0].xyz[0], b.x) && exits[0].tick < entries[0].tick, exits, entries };
    });
    check('route', () => {
      scene('execution'); step(); const routes = g.hazards.filter((h) => h instanceof Streak);
      const samples = routes.map((h) => { const art = draw(() => h.drawFloor(ctx, 0)); return { tiles: art.filter((p) => p.id === 'streak_line').length, strokes }; });
      return { ok: routes.length === 5 && samples.every((s) => s.tiles >= 2 && s.strokes === 0), samples };
    });
    check('dash', () => {
      const b = scene('execution'); step(); const pts = b.act.d.pts.map((p) => ({ ...p })); finish(b);
      const dash = at('exec_dash');
      const segments = pts.slice(1).map((p, i) => {
        const a = pts[i], d = dash[i], dx = p.x - a.x, dy = p.y - a.y;
        return !!d && near(d.xyz[0], (a.x + p.x) / 2) && near(d.xyz[1], (a.y + p.y) / 2) && near(d.rot, Math.atan2(dy, dx)) && near(d.scaleX, Math.hypot(dx, dy) / (384 * 0.5)) && (!i || d.tick - dash[i - 1].tick === 14);
      });
      return { ok: dash.length === 5 && segments.every(Boolean) && !at('slash_sweep').length, count: dash.length, segments, dash };
    });
    check('read', () => {
      const b = scene(), original = g.ai.habits.h, habit = Object.keys(b.B.reads)[0];
      try {
        g.ai.habits.h = (name) => name === habit ? 1 : 0;
        b.habitTable(g, b.B.phases[0].attacks); const initial = at('habit_read').length;
        b.habitTable(g, b.B.phases[0].attacks);
        return { ok: initial === 1 && at('habit_read').length === 1, initial, count: at('habit_read').length };
      } finally { g.ai.habits.h = original; }
    });
    check('channel', () => {
      let b = scene('channel'); step(4); const gather = has(body(b), 'reversal_gather'), early = at('reversal_burst').length;
      finish(b); const burst = at('reversal_burst').length, visibleBurst = has(air(), 'reversal_burst');
      b.setState('hurt'); const burstGone = !has(air(), 'reversal_burst');
      b = scene('channel'); step(4); const active = has(body(b), 'reversal_gather'), deadline = b.channel.T;
      for (let i = 0; i < 10 && b.channel; i++) g.channelHit(b, { ult: true });
      const immediate = !b.act && !b.channel && !has(body(b), 'reversal_gather') && !has(air(), 'reversal_burst');
      step(deadline + 5); const count = at('reversal_burst').length;
      return { ok: gather && early === 0 && burst === 1 && visibleBurst && burstGone && active && immediate && count === 0, gather, early, burst, visibleBurst, burstGone, active, immediate, count };
    });
    check('death', () => {
      const samples = [-1, 1].map((side) => {
        const b = scene(); pl.x = b.x + side * 100; b.facing = side;
        g.applyHit(pl, b, { dmg: 1e9, kb: 0, launch: 0, stun: 1, stop: 0 }, 1);
        step(70); const initial = at('afterimage_death').length; step(65);
        return { side, initial, count: at('afterimage_death').length, facing: at('afterimage_death')[0]?.facing };
      });
      return { ok: samples.every((s) => s.initial === 1 && s.count === 1 && s.facing === -s.side), samples };
    });
    check('fallback', () => {
      const ready = pack.ready; pack.ready = false;
      const parts = {};
      const noNew = (rows) => rows.every((p) => !pack.items[p.id]) && flips.every((p) => !pack.items[p.id]);
      try {
        scene('combo'); const p = firstArc(); parts.blade = !p.ribbon && arcArt(p).includes('blade_ribbon_heavy') && !flips.length;
        g.lastSkill = 'wave'; let b = scene('mirror'); step(4); parts.sigil = noNew(body(b));
        const q = until(() => g.projectiles.find((p) => p.kind === 'wave'), 80, '退路剑气');
        const wave = draw(() => q.draw(ctx, 0)); parts.wave = has(wave, 'wave_crescent') && noNew(wave);
        b = scene('teleport'); finish(b); parts.teleport = noNew(air());
        b = scene('execution'); step(); const routes = g.hazards.filter((h) => h instanceof Streak);
        const rows = draw(() => routes.forEach((h) => h.drawFloor(ctx, 0))); parts.route = routes.length === 5 && rows.length === 0 && strokes === 0;
        finish(b); parts.dash = !at('exec_dash').length && at('slash_sweep').length === 5;
        b = scene(); const h = g.ai.habits.h;
        try { g.ai.habits.h = () => 1; b.habitTable(g, b.B.phases[0].attacks); parts.read = !at('habit_read').length; } finally { g.ai.habits.h = h; }
        b = scene('channel'); step(4); parts.gather = noNew(body(b)); finish(b); parts.burst = noNew(air());
        b = scene(); g.applyHit(pl, b, { dmg: 1e9, kb: 0, launch: 0, stun: 1, stop: 0 }, 1); step(70); parts.death = noNew(air());
        return { ok: Object.values(parts).every(Boolean), ...parts };
      } finally { pack.ready = ready; }
    });
  } finally {
    Math.random = random;
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
    ['blade', '残影刀光用 rev_ribbon，主角及其他首领保持原条带'],
    ['wave', '残影剑气画 rev_wave，主角剑气仍画 wave_crescent'],
    ['mirror', '镜像期间头顶印记，结束即消失'],
    ['teleport', '瞬移出发和出现各一次'],
    ['route', '处决路线平铺 streak_line，drawFloor 不调用 stroke'],
    ['dash', '处决五段各一次 exec_dash'],
    ['read', '读到同一习惯只播一次 habit_read'],
    ['channel', '读条汇聚和爆发，打断当帧全部消失'],
    ['death', '死亡一次，主角在右边时镜像'],
    ['fallback', '素材未就绪时新加部分不画且无页面错误'],
  ];
  for (const [key, label] of checks) {
    ok(r[key]?.ok && (key !== 'fallback' || !errs.length),
      label + (r[key]?.error ? ' ' + r[key].error : setupError ? ' 未执行（' + setupError + '）' : ''));
  }
  ok(!setupError && !errs.length, 'PAGE ERRORS ' + (errs.join(' | ') || (setupError ? '未执行' : 'none')));
  console.log(bad ? 'AFTERIMAGEFXTEST FAIL ' + bad : 'AFTERIMAGEFXTEST ok');
  if (bad) process.exitCode = 1;
})();
