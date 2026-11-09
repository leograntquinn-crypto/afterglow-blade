// 子轮 H：铁颚专属特效。逐帧推进真实招式，只记录实际绘制和成功生成的粒子。
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765;
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };

async function exercise() {
  const g = __game;
  const { FX_ART } = await import('./src/fx_art.js');
  const { Boss } = await import('./src/boss.js');
  const { Hazard } = await import('./src/combat.js');
  const { BOSS_FX } = await import('./src/fx_data.js');
  const { BOSS_SPRITES } = await import('./src/enemy_sprites.js');
  const { tinted } = await import('./src/fx_tex.js');
  const pack = FX_ART.ironjaw, sheet = BOSS_SPRITES.ironJaw.sheet, iron = BOSS_FX.ironJaw;
  const out = {};
  const enter = (stage) => { g.story.clear(); g.startStage(stage, 0, false); g.story.clear(); };
  const wait = async (ready) => {
    for (let i = 0; i < 80 && !ready(); i++) await new Promise((r) => setTimeout(r, 100));
    return !!ready();
  };

  enter(2);
  const loaded = await wait(() => pack.ready && pack.items.chain_glow && pack.items.ironjaw_death);
  await wait(() => !sheet.loading);
  enter(0);
  const released = !pack.ready && !pack.loading && Object.keys(pack.items).length === 0;
  out.stage = { ok: loaded && released, loaded, released };
  // 等第 1 关这次读取结束再换关，避免对照包的请求被换关取消。
  await FX_ART.bone.loading;
  enter(2);
  await wait(() => pack.ready && sheet.ready && FX_ART.hero.ready);
  // 对照用真实骨刺图集，与铁颚在同一场地推进。
  await FX_ART.bone.load();
  const boneReady = FX_ART.bone.ready && !!FX_ART.bone.items.bone_spikes;
  for (let i = 0; i < 30; i++) g.update();

  const calls = [], flips = [], originals = new Map();
  for (const method of ['flip', 'arc', 'dust', 'dustburst', 'rune', 'flash', 'emit']) {
    const original = g.fx[method];
    originals.set(method, original);
    g.fx[method] = function (...args) {
      const p = original.apply(this, args);
      if (method === 'flip') {
        if (p?.kind === 'flip' && p.fb?.id === args[0]) {
          flips.push({
            id: args[0], xyz: args.slice(1, 4), tick: g.ticks, size: p.size,
            ground: p.ground, followsPlayer: p.follow === g.player, particle: p,
          });
        }
      } else {
        calls.push({ method, first: args[0] });
      }
      return p;
    };
  }
  const at = (id) => flips.filter((f) => f.id === id);
  const called = (method, first) => calls.some((c) => c.method === method && (first === undefined || c.first === first));
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  const atPoint = (f, p) => near(f.xyz[0], p.x) && near(f.xyz[1], p.y);

  const cv = document.createElement('canvas'); cv.width = 960; cv.height = 540;
  const ctx = cv.getContext('2d'), paint = ctx.drawImage.bind(ctx);
  const images = new Map([[sheet.hook, 'hook'], [sheet.link, 'link']]);
  function register(id, color, mode) {
    const asset = pack.items[id];
    for (const img of asset?.frames || (asset ? [asset] : [])) {
      if (img) images.set(tinted(img, color, mode), id);
    }
  }
  register('chain_glow', iron.chain.color);
  register('execution_mark', iron.mark.color, 'mul');
  register('headsman_glint', iron.glint.color);
  register('chain_drag', iron.drag.color);
  register('charge_sparks', iron.charge.color);
  let draws = [];
  ctx.drawImage = (image, ...args) => {
    const id = images.get(image);
    // 忽略平铺起点之前被裁掉的那一格。
    if (id && ctx.globalAlpha > 0 && (id !== 'chain_glow' || args[0] >= 0)) draws.push(id);
    return paint(image, ...args);
  };
  const draw = (fn) => { draws = []; fn(); return draws; };
  const body = (b) => draw(() => b.draw(ctx, 0, g.ticks));
  const floor = () => draw(() => g.hazards.forEach((h) => h.drawFloor(ctx, 0)));
  const particles = () => draw(() => g.fx.drawFloor(ctx, 0));
  const shotArt = (q) => draw(() => q.draw(ctx, 0));

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
  function scene(move, key = 'ironJaw', vulnerable = false) {
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
  const startHook = () => {
    const b = scene('chainHook', 'ironJaw', true);
    pl.x = 500;
    const q = until(() => g.projectiles.find((p) => p.kind === 'hook'), 65, '锁链钩发射');
    step(15); // 留足两节贴图的可见链长，但还没接触主角。
    if (!g.projectiles.includes(q)) throw new Error('链光取样时钩子已离场');
    return { b, q };
  };
  const hookHit = (b) => {
    until(() => b.act?.d.pulled, 25, '锁链钩命中');
    pl.invuln = 1e9;
  };
  const hammer = (b) => {
    until(() => b.act?.d.pulledAt != null && b.act.t - b.act.d.pulledAt >= 26, 40, '拉近重锤');
  };
  const kill = (b) => {
    g.applyHit(pl, b, { dmg: 1e9, kb: 0, launch: 0, stun: 1, stop: 0 }, 1);
    until(() => b.deadT > 0, 65, '尸体落地');
  };
  const roar = (b) => {
    b.hp = b.maxHp * (b.B.phases[1].at - 0.01);
    until(() => b.phase === 1 && b.act?.name === 'roar' && b.act.t >= 2, 10, '二阶段咆哮');
  };
  const slam = (key) => {
    const b = scene('slam', key);
    step();
    const h = g.hazards.find((q) => q instanceof Hazard && q.owner === b);
    if (!h) throw new Error(key + ' 重砸未布置 Hazard');
    step(h.delay);
    return h;
  };
  const shockwave = (key) => {
    const b = scene('shockwave', key);
    const h = until(() => g.hazards.find((q) => q instanceof Hazard), 70, '冲击波 Hazard');
    step(h.delay);
    return { b, h };
  };
  const check = (key, fn) => {
    try { out[key] = fn(); }
    catch (e) { out[key] = { ok: false, error: e.message }; }
  };

  try {
    check('hook', () => {
      const { b, q } = startHook();
      const art = shotArt(q), before = at('hook_spark').length, hp = pl.hp;
      hookHit(b);
      const hitTick = g.ticks, spark = at('hook_spark');
      until(() => b.act?.d.pulledAt != null, 5, '开始拖拽');
      const drag = at('chain_drag'), p = drag[0]?.particle;
      const x = pl.x, y = pl.y;
      step();
      const follows = !!p && near(p.x, x) && near(p.y, y) && pl.x > x &&
        particles().includes('chain_drag');
      hammer(b);
      const cleave = at('heavy_cleave'), quake = at('stomp_quake');
      const tiling = art.filter((id) => id === 'chain_glow').length;
      const flight = tiling >= 2 && art.includes('link') && art.includes('hook');
      const contact = before === 0 && pl.hp < hp && spark.length === 1 &&
        spark[0].tick === hitTick && atPoint(spark[0], q) && near(spark[0].xyz[2], q.z);
      const pull = drag.length === 1 && drag[0].followsPlayer && drag[0].ground && follows &&
        !particles().includes('chain_drag');
      const impact = cleave.length === 1 && quake.length === 1 && cleave[0].tick === quake[0].tick;
      return { ok: flight && contact && pull && impact, flight, tiling, contact, pull, impact };
    });

    check('ground', () => {
      const h = slam('ironJaw');
      const quake = at('stomp_quake'), slamArt = quake.length === 1 && quake[0].ground &&
        atPoint(quake[0], h) && !at('impact_ground').length;
      const { b, h: wave } = shockwave('ironJaw');
      const waves = at('stomp_wave');
      const shockArt = waves.some((f) => f.ground && atPoint(f, b)) &&
        waves.some((f) => f.ground && atPoint(f, wave)) && !at('impact_ground').length;
      return { ok: slamArt && shockArt, slamArt, shockArt, waveCount: waves.length };
    });

    check('stomp', () => {
      const b = scene('tripleStomp');
      step();
      const hits = g.hazards.filter((h) => h instanceof Hazard && h.owner === b);
      if (hits.length !== 3) throw new Error('三震未生成三处判定');
      step(hits[2].delay - hits[2].t);
      const q = at('stomp_quake'), w = at('stomp_wave'), sizes = q.map((f) => f.size);
      const ratios = sizes.map((size) => size / sizes[0]);
      const order = q.length === 3 && q.every((f, i) => f.ground && atPoint(f, hits[i])) &&
        q[0].tick < q[1].tick && q[1].tick < q[2].tick &&
        ratios.every((ratio, i) => near(ratio, [1, 1.2, 1.5][i]));
      const third = w.length === 1 && w[0].ground && w[0].tick === q[2]?.tick && atPoint(w[0], hits[2]);
      return { ok: order && third, sizes, ratios, third };
    });

    check('common', () => {
      scene('combo'); step(115);
      const cleaves = at('heavy_cleave').length;
      const combo = cleaves === 3 && !called('arc');
      const b = scene('charge');
      step();
      const early = body(b).includes('charge_sparks');
      until(() => b.vx && !b.tele, 60, '铁颚冲锋');
      const charge = !early && body(b).includes('charge_sparks') && !called('dust');
      scene('summon'); step(8);
      const summon = floor().includes('execution_mark') && !called('rune');
      return { ok: combo && charge && summon, combo, cleaves, charge, summon };
    });

    check('channel', () => {
      let b = scene('channel'); step(4);
      const active = !!b.channel && floor().includes('execution_mark') && body(b).includes('headsman_glint');
      const earlyDrop = at('execution_drop').length;
      until(() => !b.act, 220, '读条完成');
      step(4);
      const success = earlyDrop === 0 && at('execution_drop').length === 1 && !floor().includes('execution_mark');

      b = scene('channel'); step(4);
      const visible = floor().includes('execution_mark') && body(b).includes('headsman_glint');
      const deadline = b.channel.T;
      for (let i = 0; i < 10 && b.channel; i++) g.channelHit(b, { ult: true });
      const immediate = !b.channel && !b.act && !floor().includes('execution_mark') && !body(b).includes('headsman_glint');
      step(deadline + 5);
      const interrupted = visible && immediate && !at('execution_drop').length;
      return { ok: active && success && interrupted, active, success, immediate, interrupted };
    });

    check('roar', () => {
      const b = scene();
      roar(b);
      const initial = at('chain_break').length;
      step(95);
      const count = at('chain_break').length;
      return { ok: initial === 1 && count === 1, phase: b.phase + 1, initial, count };
    });

    check('death', () => {
      const b = scene();
      kill(b);
      const initial = at('ironjaw_death').length;
      step(65);
      const count = at('ironjaw_death').length, generic = called('emit', 'dissolve');
      return { ok: initial === 1 && count === 1 && !generic, initial, count, generic };
    });

    check('fallback', () => {
      const ready = pack.ready;
      pack.ready = false;
      try {
        const { b, q } = startHook(), hook = shotArt(q);
        hookHit(b); hammer(b);
        const chain = hook.includes('hook') && hook.includes('link') && !hook.includes('chain_glow');
        const pull = !at('hook_spark').length && !at('chain_drag').length &&
          !at('heavy_cleave').length && !at('stomp_quake').length && called('dustburst');
        slam('ironJaw');
        const slamFx = at('impact_ground').length === 1 && !at('stomp_quake').length;
        const caster = scene('channel'); step(4);
        const tell = called('rune') && !floor().includes('execution_mark') && !body(caster).includes('headsman_glint');
        until(() => !caster.act, 220, '退路读条完成');
        const channel = tell && called('flash') && !at('execution_drop').length;
        scene('combo'); step(115);
        const combo = called('arc') && !at('heavy_cleave').length;
        const runner = scene('charge');
        until(() => runner.vx && !runner.tele, 60, '退路冲锋'); step(4);
        const charge = called('dust') && !body(runner).includes('charge_sparks');
        scene('summon'); step(8);
        const summon = called('rune') && !floor().includes('execution_mark');
        roar(scene());
        const phase = called('flash') && !at('chain_break').length;
        kill(scene()); step(15);
        const death = called('emit', 'dissolve') && !at('ironjaw_death').length;
        const parts = { chain, pull, slamFx, channel, combo, charge, summon, phase, death };
        return { ok: Object.values(parts).every(Boolean), ...parts };
      } finally { pack.ready = ready; }
    });

    check('isolation', () => {
      const h = slam('boneLord');
      const bone = at('bone_spikes');
      const boneImpact = { ready: boneReady, id: h.art, flips: flips.map(({ id, xyz }) => ({ id, xyz })) };
      const boneSlam = boneReady && bone.length === 1 && atPoint(bone[0], h) &&
        !at('impact_ground').length && !at('stomp_quake').length;
      slam('afterimage');
      const genericSlam = at('impact_ground').length === 1 && !at('stomp_quake').length && !at('bone_spikes').length;
      shockwave('afterimage');
      const genericWave = called('dustburst') && at('impact_ground').length > 0 && !at('stomp_wave').length;
      scene('combo', 'afterimage'); step(115);
      const genericCombo = called('arc') && !at('heavy_cleave').length;
      const runner = scene('charge', 'afterimage');
      until(() => runner.vx && !runner.tele, 60, '通用冲锋'); step(4);
      const genericCharge = called('dust') && !body(runner).includes('charge_sparks');
      return { ok: boneSlam && genericSlam && genericWave && genericCombo && genericCharge,
        boneSlam, boneImpact, genericSlam, genericWave, genericCombo, genericCharge };
    });
  } finally {
    FX_ART.bone.release();
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
    ['stage', '第 3 关载入铁颚特效，第 1 关释放'],
    ['hook', '飞行链光平铺，命中火星、贴脚拖拽、拉近重锤各在对应时刻出现'],
    ['ground', '铁颚重砸和冲击波各自使用专属地面素材'],
    ['stomp', '三震大小比 1 / 1.2 / 1.5，第三震同帧追加震地波'],
    ['common', '铁颚三连斩、冲锋和召唤各自使用专属素材'],
    ['isolation', '骸骨统领重砸仍画骨刺，残影通用重砸、冲击波、连斩和冲锋保持原样'],
    ['channel', '读条画烙印和闪光，结束一次落斧，打断当帧消失且不落斧'],
    ['roar', '二阶段咆哮恰好一次断链'],
    ['death', '尸体落地恰好一次死亡余烬'],
    ['fallback', '铁颚图集未就绪时保留原有画法，新加素材不画且页面无报错'],
  ];
  for (const [key, label] of checks) {
    ok(r[key]?.ok && (key !== 'fallback' || !errs.length),
      label + (r[key]?.error ? ' ' + r[key].error : setupError ? ' 未执行（' + setupError + '）' : ''));
  }
  ok(!setupError && !errs.length, 'PAGE ERRORS ' + (errs.join(' | ') || (setupError ? '未执行' : 'none')));
  console.log(bad ? 'IRONJAWFXTEST FAIL ' + bad : 'IRONJAWFXTEST ok');
  if (bad) process.exitCode = 1;
})();
