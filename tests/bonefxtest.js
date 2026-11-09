// 子轮 H：骸骨特效：推进真实招式，记录实际绘制、光丝端点和成功生成的粒子。
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765;
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };

async function exercise() {
  const g = __game;
  const { FX_ART, flipbook } = await import('./src/fx_art.js');
  const { Boss } = await import('./src/boss.js');
  const { Projectile } = await import('./src/combat.js');
  const { BOSS_SPRITES } = await import('./src/enemy_sprites.js');
  const { tinted } = await import('./src/fx_tex.js');
  const { toScreen } = await import('./src/config.js');
  const { BOSS_FX } = await import('./src/fx_data.js');
  const pack = FX_ART.bonev2, out = {};
  const enter = (n) => { g.story.clear(); g.startStage(n, 0, false); g.story.clear(); };
  const wait = async (fn) => { for (let i = 0; i < 100 && !fn(); i++) await new Promise(r => setTimeout(r, 100)); return !!fn(); };
  enter(0);
  const loaded = await wait(() => FX_ART.bone.ready && pack.ready);
  const items = [Object.keys(FX_ART.bone.items).length, Object.keys(pack.items).length];
  enter(1);
  const released = [FX_ART.bone, pack].every(p => !p.ready && !p.loading && !Object.keys(p.items).length);
  out.stage = { ok: loaded && items.every(n => n > 0) && released, loaded, items, released };
  enter(0);
  for (const p of [FX_ART.bone, pack, FX_ART.hero, FX_ART.bladeTex, FX_ART.blade]) await p.load();
  await wait(() => BOSS_SPRITES.boneLord.sheet.ready);
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
  // 画布变换按单精度存，读回的屏幕坐标有约 1e-5 的误差：比对画出来的线段端点用 0.01 逻辑像素
  const nearPx = (a, b) => Math.abs(a - b) < 0.01;
  const cv = document.createElement('canvas'); cv.width = 960; cv.height = 540;
  const ctx = cv.getContext('2d'), paint = ctx.drawImage.bind(ctx), stroke = ctx.stroke.bind(ctx);
  const images = new Map();
  function register(id, asset) {
    for (const img of asset?.frames || (asset ? [asset] : [])) {
      if (!img) continue; // 图集里全透明帧存为 null，跳过
      images.set(img, id);
      for (const color of ['#ff5a3c', '#ffffff', g.player.glow]) for (const mode of ['fill', 'mul']) images.set(tinted(img, color, mode), id);
    }
  }
  for (const [id, asset] of Object.entries(pack.items)) register(id, asset);
  for (const id of ['wave_crescent']) register(id, flipbook(id));
  for (const [id, asset] of Object.entries(FX_ART.bladeTex.items)) register(id, asset);
  { const band = FX_ART.enemyTex.items.lane_band; if (band) { images.set(band, 'lane_band'); images.set(tinted(band, '#ff4d5e'), 'lane_band'); } } // 处决路线兜底
  let draws = [], strokes = 0, clips = [], clip;
  const rect = ctx.rect.bind(ctx);
  ctx.rect = (x, y, w, h) => { const m = ctx.getTransform(); clip = { x: m.e, y: m.f, ex: m.e + m.a * w, ey: m.f + m.b * w }; return rect(x, y, w, h); };
  ctx.drawImage = (img, ...args) => {
    if (images.get(img) === 'marrow_tether' && clip && !clips.includes(clip)) clips.push(clip);
    if (images.has(img) && ctx.globalAlpha > 0) draws.push({ id: images.get(img), y: ctx.getTransform().f });
    return paint(img, ...args);
  };
  ctx.stroke = (...args) => { strokes++; return stroke(...args); };
  const draw = (fn) => { draws = []; strokes = 0; clips = []; clip = null; fn(); return draws; };
  const has = (rows, id) => rows.some((p) => p.id === id);
  const body = (b) => draw(() => b.draw(ctx, 0, g.ticks));
  const floor = () => draw(() => g.hazards.forEach(h => h.drawFloor(ctx, 0)));
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
  function scene(move, key = 'boneLord', vulnerable = false) {
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
    check('cage', () => {
      const b = scene('boneCage'); step(4);
      const art = floor(), segments = clips.map(p => ({ ...p })), slots = b.act.d.boneSlots;
      const pairs = slots.flatMap((a, i) => a && slots[(i + 1) % slots.length] ? [[a, slots[(i + 1) % slots.length]]] : []);
      const matched = pairs.map(([a, z]) => { const p = toScreen(a.x, a.y, 0, 0), q = toScreen(z.x, z.y, 0, 0); return segments.some(s => nearPx(s.x, p[0]) && nearPx(s.y, p[1]) && nearPx(s.ex, q[0]) && nearPx(s.ey, q[1])); });
      const warning = b.tele && has(art, 'cage_tighten');
      return { ok: warning && pairs.length === 5 && segments.length === pairs.length && matched.every(Boolean), warning, expected: pairs.length, observed: segments.length, matched, gap: slots.findIndex(p => !p), segments };
    });
    check('drag', () => {
      let b = scene(); step(4); const idle = has(body(b), 'drag_sparks');
      b = scene('rendChase'); step(4); const rend = has(body(b), 'drag_sparks'); finish(b); const afterRend = has(body(b), 'drag_sparks');
      b = scene('charge'); step(4); const warning = has(body(b), 'drag_sparks');
      until(() => b.vx && !b.tele && !b.act.d.stop, 80, '冲锋'); const charge = has(body(b), 'drag_sparks');
      finish(b); const afterCharge = has(body(b), 'drag_sparks');
      b = scene('combo'); step(4); const other = has(body(b), 'drag_sparks');
      return { ok: !idle && rend && !afterRend && !warning && charge && !afterCharge && !other, idle, rend, afterRend, warning, charge, afterCharge, other };
    });
    check('shards', () => {
      const b = scene();
      g.applyHit(pl, b, { dmg: 10, heavy: true, kb: 0, launch: 0, stun: 1, stop: 0 }, 1);
      const shards = g.hazards.filter(h => has(draw(() => h.drawFloor(ctx, 0)), 'shard_return'));
      const e = BOSS_FX.boneLord.shard, initial = shards.map(h => ({ x: h.x, y: h.y, z: h.z }));
      step(e.scatter); const scattered = shards.every((h, i) => Math.hypot(h.x - initial[i].x, h.z - initial[i].z) > 1);
      b.x += 40; b.y += 5;
      step(e.pause + e.back);
      const returned = shards.map(h => near(h.x, b.x) && near(h.y, b.y) && near(h.z, b.z + b.h * e.chest));
      const gone = shards.every(h => h.dead && !g.hazards.includes(h)) && !has(floor(), 'shard_return');
      return { ok: shards.length >= 3 && shards.length <= 5 && scattered && returned.every(Boolean) && gone, expected: '3–5，全部回到移动首领胸口并消失', count: shards.length, scattered, returned, gone };
    });
    check('reform', () => {
      const b = scene(); b.hp = b.maxHp * (b.B.phases[1].at - 0.01);
      until(() => b.phase === 1 && at('bone_reform').length, 10, '二阶段');
      const initial = at('bone_reform').length; step(100);
      return { ok: initial === 1 && at('bone_reform').length === 1, initial, count: at('bone_reform').length };
    });
    check('channel', () => {
      let b = scene('channel'); step(4);
      const active = has(floor(), 'bone_sigil') && has(body(b), 'marrow_glow'), early = at('bone_call_burst').length;
      finish(b); const burst = at('bone_call_burst').length, visible = has(air(), 'bone_call_burst');
      b = scene('channel'); step(4); const before = has(floor(), 'bone_sigil') && has(body(b), 'marrow_glow'), deadline = b.channel.T;
      for (let i = 0; i < 10 && b.channel; i++) g.channelHit(b, { ult: true });
      const immediate = !b.act && !b.channel && !has(floor(), 'bone_sigil') && !has(body(b), 'marrow_glow') && !has(air(), 'bone_call_burst');
      step(deadline + 5); const late = at('bone_call_burst').length;
      return { ok: active && early === 0 && burst === 1 && visible && before && immediate && late === 0, active, early, burst, visible, before, immediate, late };
    });
    check('summon', () => {
      const b = scene('summon'); until(() => at('summon_rise').length > 0, 50, '召唤');
      const minions = g.enemies.filter(e => e !== b), rise = at('summon_rise');
      const matched = minions.map(e => rise.filter(p => near(p.xyz[0], e.x) && near(p.xyz[1], e.y)).length);
      return { ok: minions.length === 2 && rise.length === 2 && matched.every(n => n === 1), minions: minions.length, rise: rise.length, matched };
    });
    check('death', () => {
      const b = scene(); g.applyHit(pl, b, { dmg: 1e9, kb: 0, launch: 0, stun: 1, stop: 0 }, 1);
      step(70); const initial = at('bonelord_death').length; step(65);
      return { ok: initial === 1 && at('bonelord_death').length === 1, initial, count: at('bonelord_death').length };
    });
    check('legacy', () => {
      const counts = {};
      for (const [move, expected] of [['boneCage', 7], ['rendChase', 3], ['slam', 1], ['combo', 0]]) {
        const b = scene(move); finish(b); step(30);
        counts[move] = { spikes: at('bone_spikes').length, expected, rend: at('bone_rend').length, expectedRend: move === 'combo' ? 3 : 0 };
      }
      return { ok: Object.values(counts).every(c => c.spikes === c.expected && c.rend === c.expectedRend), counts };
    });
    check('fallback', () => {
      const ready = [FX_ART.bone.ready, pack.ready], parts = {};
      FX_ART.bone.ready = pack.ready = false;
      try {
        for (const move of ['boneCage', 'rendChase', 'charge', 'channel', 'summon']) {
          const b = scene(move); let clean = true;
          for (let i = 0; i < 250 && b.act; i++) { step(); clean &&= ![...floor(), ...body(b), ...air()].some(p => pack.items[p.id]); }
          parts[move] = clean && !flips.some(p => pack.items[p.id]);
        }
        const b = scene(); g.applyHit(pl, b, { dmg: 10, heavy: true, kb: 0, launch: 0, stun: 1, stop: 0 }, 1);
        parts.shards = !has(floor(), 'shard_return');
        b.hp = b.maxHp * 0.49; step(100); parts.reform = !at('bone_reform').length;
        g.applyHit(pl, b, { dmg: 1e9, kb: 0, launch: 0, stun: 1, stop: 0 }, 1); step(100); parts.death = !at('bonelord_death').length;
        return { ok: Object.values(parts).every(Boolean), parts };
      } finally { [FX_ART.bone.ready, pack.ready] = ready; }
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
    ['stage', '第 1 关两套载入，换关全部释放'],
    ['cage', '骨牢预警绘制收紧，光丝只连接存在的相邻骨刺且不跨缺口'],
    ['drag', '拖地火星只在裂地追斩和实际冲锋期间绘制'],
    ['shards', '重击生成 3–5 骨片，全部回到首领并消失'],
    ['reform', '二阶段 bone_reform 一次'],
    ['channel', '读条两段和结束爆发，打断立即消失'],
    ['summon', '每只召唤小怪一次 summon_rise'],
    ['death', '死亡 bonelord_death 一次'],
    ['legacy', 'bone_spikes 和 bone_rend 保持原触发次数'],
    ['fallback', '未载入素材时新加部分不画且无页面错误'],
  ];
  for (const [key, label] of checks) {
    ok(r[key]?.ok && (key !== 'fallback' || !errs.length),
      label + (r[key]?.error ? ' ' + r[key].error : setupError ? ' 未执行（' + setupError + '）' : ''));
  }
  ok(!setupError && !errs.length, 'PAGE ERRORS ' + (errs.join(' | ') || (setupError ? '未执行' : 'none')));
  console.log(bad ? 'BONEFXTEST FAIL ' + bad : 'BONEFXTEST ok');
  if (bad) process.exitCode = 1;
})();
