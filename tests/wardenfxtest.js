// 子轮 H：守护者特效：推进真实招式，记录素材、染色和成功生成的粒子。
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765;
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };

async function exercise() {
  const g = __game;
  const { FX_ART, flipbook } = await import('./src/fx_art.js');
  const { Boss } = await import('./src/boss.js');
  const { Lane } = await import('./src/combat.js');
  const { BOSS_SPRITES } = await import('./src/enemy_sprites.js');
  const { tinted } = await import('./src/fx_tex.js');
  const { toScreen } = await import('./src/config.js');
  const { BOSS_FX } = await import('./src/fx_data.js');
  const { fbIndex } = await import('./src/enemy_fx.js');
  const { Brazier } = await import('./src/boss_moves.js');
  const pack = FX_ART.wardenv2, out = {};
  const enter = (n) => { g.story.clear(); g.startStage(n, 0, false); g.story.clear(); };
  const wait = async (fn) => { for (let i = 0; i < 100 && !fn(); i++) await new Promise(r => setTimeout(r, 100)); return !!fn(); };
  enter(3);
  const loaded = await wait(() => FX_ART.warden.ready && pack.ready);
  const items = [Object.keys(FX_ART.warden.items).length, Object.keys(pack.items).length];
  enter(1);
  const released = [FX_ART.warden, pack].every(p => !p.ready && !p.loading && !Object.keys(p.items).length);
  out.stage = { ok: loaded && items.every(n => n > 0) && released, loaded, items, released };
  enter(3);
  for (const p of [FX_ART.warden, pack, FX_ART.hero, FX_ART.bladeTex, FX_ART.blade, FX_ART.enemy, FX_ART.enemyTex]) await p.load();
  await wait(() => BOSS_SPRITES.warden.sheet.ready);
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
      if (method === 'arc') calls.push(args);
      return p;
    };
  }
  const at = (id) => flips.filter((p) => p.id === id);
  const cv = document.createElement('canvas'); cv.width = 960; cv.height = 540;
  const ctx = cv.getContext('2d'), images = new Map();
  const colors = [...BOSS_FX.warden.colors, '#ffffff', '#ff4d5e', '#ffb347'];
  for (const key of ['boneLord', 'nightRaven', 'ironJaw', 'afterimage']) {
    const b = new Boss(key, 850, 90, g, g.stage.lv); colors.push(b.B.glow);
  }
  function register(id, asset) {
    (asset?.frames || (asset ? [asset] : [])).forEach((img, index) => {
      if (!img) return;
      images.set(img, { id, index, color: null });
      for (const color of colors) for (const mode of ['fill', 'mul']) images.set(tinted(img, color, mode), { id, index, color });
    });
  }
  for (const p of [pack, FX_ART.warden, FX_ART.enemy, FX_ART.enemyTex])
    for (const [id, asset] of Object.entries(p.items)) register(id, asset);
  let draws = [], shapes = {};
  const paint = ctx.drawImage.bind(ctx);
  ctx.drawImage = (img, ...args) => {
    if (images.has(img) && ctx.globalAlpha > 0) draws.push(images.get(img));
    return paint(img, ...args);
  };
  for (const name of ['fillRect', 'arc', 'stroke']) {
    const original = ctx[name].bind(ctx);
    ctx[name] = (...args) => { shapes[name] = (shapes[name] || 0) + 1; return original(...args); };
  }
  const draw = (fn) => { draws = []; shapes = {}; fn(); return draws; };
  const has = (rows, id) => rows.some(p => p.id === id);
  const body = b => draw(() => b.draw(ctx, 0, g.ticks));
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
  function scene(move, key = 'warden', vulnerable = false) {
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
  const finish = (b) => until(() => !b.act, 300, '收招');
  try {
    check('flame', () => {
      const rows = [];
      for (let phase = 0; phase < 3; phase++) {
        const b = scene(); b.phase = phase; step(4);
        const before = b.wardenFlameTime, first = body(b).find(p => p.id === 'warden_flame');
        step(5); const second = body(b).find(p => p.id === 'warden_flame');
        rows.push({ phase, color: first?.color, expected: BOSS_FX.warden.colors[phase], delta: b.wardenFlameTime - before, frames: [first?.index, second?.index], expectedFrames: [fbIndex(flipbook('warden_flame'), before), fbIndex(flipbook('warden_flame'), b.wardenFlameTime)] });
      }
      return { ok: JSON.stringify(BOSS_FX.warden.colors) === JSON.stringify(['#ffb347', '#6fe38a', '#d6ffe0']) && rows.every((r, i) => r.color === r.expected && Math.abs(r.delta - (i === 2 ? 8 : 5)) < 1e-6 && r.frames.every((f, j) => Number.isInteger(f) && f === r.expectedFrames[j])), rows, expectedDelta: [5, 5, 8] };
    });
    check('brazier', () => {
      const b = scene(), prop = new Brazier(700, 90, b); prop.t = 4;
      g.enemies.push(prop);
      const art = draw(() => prop.draw(ctx, 0, g.ticks)), counts = { ...shapes };
      prop.takeHit({ heavy: true }, 1, 0, g); prop.takeHit({ heavy: true }, 1, 0, g);
      step(5);
      return { ok: has(art, 'brazier') && has(art, 'brazier_flame') && !Object.values(counts).some(Boolean) && at('brazier_break').length === 1, art, counts, breaks: at('brazier_break').length, expectedBreaks: 1 };
    });
    check('judgment', () => {
      const b = scene('judgment'); step(4);
      const lanes = g.hazards.filter(h => h instanceof Lane);
      const laneArt = lanes.map(h => has(draw(() => h.drawFloor(ctx, 0)), 'fire_lane'));
      finish(b);
      const arcs = calls.filter(a => a[4] === 220).length;
      return { ok: lanes.length === 2 && laneArt.every(Boolean) && at('judgment_sweep').length === 2 && arcs === 0, lanes: lanes.length, laneArt, sweeps: at('judgment_sweep').length, arcs, expected: { lanes: 2, sweeps: 2, arcs: 0 } };
    });
    check('isolation', () => {
      const rows = [];
      for (const key of ['boneLord', 'nightRaven', 'ironJaw', 'afterimage']) {
        const b = scene(null, key); step(4);
        const art = body(b), lane = new Lane({ x: 850, y: 90, facing: -1, life: 40, half: 30 });
        const band = draw(() => lane.drawFloor(ctx, 0));
        rows.push({ key, idle: has(art, 'aura_guard'), flame: has(art, 'warden_flame'), band: has(band, 'lane_band'), fire: has(band, 'fire_lane') });
      }
      return { ok: rows.every(r => r.idle && !r.flame && r.band && !r.fire), rows };
    });
    check('ignite', () => {
      const b = scene(), counts = [];
      for (const phase of [1, 2]) {
        b.hp = b.maxHp * (b.B.phases[phase].at - 0.01);
        until(() => b.phase === phase && at('phase_ignite').length === phase, 10, '换阶段');
        finish(b); step(5); counts.push(at('phase_ignite').length);
      }
      return { ok: counts[0] === 1 && counts[1] === 2, counts, expected: [1, 2] };
    });
    check('channel', () => {
      let b = scene('channel'); step(4);
      const active = has(body(b), 'inferno_gather'), early = at('inferno_burst').length;
      finish(b); const burst = at('inferno_burst').length, visible = has(air(), 'inferno_burst');
      b = scene('channel'); step(4);
      const before = has(body(b), 'inferno_gather'), deadline = b.channel.T;
      for (let i = 0; i < 10 && b.channel; i++) g.channelHit(b, { ult: true });
      const immediate = !b.act && !b.channel && !has(body(b), 'inferno_gather') && !has(air(), 'inferno_burst');
      step(deadline + 5); const late = at('inferno_burst').length;
      return { ok: active && early === 0 && burst === 1 && visible && before && immediate && late === 0, active, early, burst, visible, before, immediate, late, expectedBurst: 1, expectedInterruptedBurst: 0 };
    });
    check('death', () => {
      const b = scene(); g.applyHit(pl, b, { dmg: 1e9, kb: 0, launch: 0, stun: 1, stop: 0 }, 1);
      step(70); const initial = at('warden_death').length; step(65);
      return { ok: initial === 1 && at('warden_death').length === 1, initial, count: at('warden_death').length, expected: 1 };
    });
    check('legacy', () => {
      const rows = [];
      for (const move of [null, 'summon', 'soulBraziers', 'channel']) {
        const b = scene(move); if (move) finish(b); else step(60);
        rows.push({ move: move || 'idle', soul: at('soul_fire').length, circle: at('summon_circle').length, expectedSoul: 1, expectedCircle: move ? 1 : 0 });
      }
      return { ok: rows.every(r => r.soul === r.expectedSoul && r.circle === r.expectedCircle), rows };
    });
    check('fallback', () => {
      const ready = [FX_ART.warden.ready, pack.ready], parts = {};
      FX_ART.warden.ready = pack.ready = false;
      try {
        for (const move of ['judgment', 'soulBraziers', 'channel', 'summon']) {
          const b = scene(move); let clean = true;
          for (let i = 0; i < 300 && b.act; i++) {
            step();
            const art = [...body(b), ...air(), ...draw(() => g.hazards.forEach(h => h.drawFloor(ctx, 0)))];
            for (const prop of g.enemies.filter(e => e instanceof Brazier)) art.push(...draw(() => prop.draw(ctx, 0, g.ticks)));
            clean &&= !art.some(p => pack.items[p.id]);
          }
          parts[move] = clean && !flips.some(p => pack.items[p.id]);
        }
        const b = scene(), prop = new Brazier(700, 90, b);
        const art = draw(() => prop.draw(ctx, 0, g.ticks));
        parts.brazier = !art.some(p => pack.items[p.id]) && !Object.values(shapes).some(Boolean);
        prop.shatter(g); parts.break = !at('brazier_break').length;
        b.hp = b.maxHp * 0.49; step(100); parts.ignite = !at('phase_ignite').length;
        g.applyHit(pl, b, { dmg: 1e9, kb: 0, launch: 0, stun: 1, stop: 0 }, 1); step(100); parts.death = !at('warden_death').length;
        return { ok: Object.values(parts).every(Boolean), parts };
      } finally { [FX_ART.warden.ready, pack.ready] = ready; }
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
    ['stage', '第 4 关两套载入，换关全部释放'],
    ['flame', '三阶段火焰按表染色，第三阶段播放速度 1.6 倍'],
    ['brazier', '炉身和炉火用素材，不调用 fillRect / arc / stroke，打碎一次'],
    ['judgment', '两条 fire_lane、两次 judgment_sweep，无半径 220 通用刀光'],
    ['isolation', '其他首领 bossIdle 和 lane_band 保持原样'],
    ['ignite', '每次换阶段 phase_ignite 一次'],
    ['channel', '读条聚火与结束爆发，打断两段立即消失'],
    ['death', '死亡 warden_death 一次'],
    ['legacy', 'soul_fire 和 summon_circle 保持原触发次数'],
    ['fallback', '素材未载入时新加部分不画且无页面错误'],
  ];
  for (const [key, label] of checks) {
    ok(r[key]?.ok && (key !== 'fallback' || !errs.length),
      label + (r[key]?.error ? ' ' + r[key].error : setupError ? ' 未执行（' + setupError + '）' : ''));
  }
  ok(!setupError && !errs.length, 'PAGE ERRORS ' + (errs.join(' | ') || (setupError ? '未执行' : 'none')));
  console.log(bad ? 'WARDENFXTEST FAIL ' + bad : 'WARDENFXTEST ok');
  if (bad) process.exitCode = 1;
})();
