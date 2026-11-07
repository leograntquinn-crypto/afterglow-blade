// 敌人智能第 3 轮：确定性场景测试（固定随机种子）
// 佯攻（腐骨兵 / 屠夫 / 烬翼）、频率上限、读习惯（提示一次、上限 30%）、司祭（护挨打的、先找掩护、陷阱堵落点）、
// 烬翼（假冲 + 真冲、起跳散开、落地俯冲）、令牌和连段保护不变
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765, SEED = process.env.SEED || 97531;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(`window.__aiSeed = ${SEED}`);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  const fails = [];
  const check = (name, ok, info) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); if (!ok) fails.push(name); };
  await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(1500);
  await p.evaluate(() => {
    window.T = {};
    T.setup = async (diff = 0) => {
      const g = __game; g.story.clear();
      g.startStage(0, diff, false); g.story.clear();
      for (let i = 0; i < 5; i++) g.update();
      g.enemies = []; g.spawnQueue = []; g.hazards = []; g.projectiles = []; g.waveActive = true; g.banner = null;
      const pl = g.player; pl.hp = pl.maxHp = 1e7; pl.x = 600; pl.y = 85; pl.z = 0; pl.facing = 1; pl.setState('idle');
      const { AI } = await import('./src/ai.js');
      g.ai = new AI(g); g.attackers.clear(); g.combo = 0;
      const { Enemy } = await import('./src/enemy.js');
      T.mk = (type, x, y = 85, o = {}) => { const e = new Enemy(type, x, y, g, { lv: 1 }); e.state = 'idle'; e.st = 0; Object.assign(e, o); g.enemies.push(e); return e; };
      T.D = await import('./src/ai_data.js');
      T.A = await import('./src/ai.js');
      return g;
    };
    T.run = (n, each) => { const g = __game; for (let i = 0; i < n; i++) { g.player.hp = 1e7; each?.(i); g.update(); } };
    T.hit = (e, h = {}) => __game.applyHit(__game.player, e, { dmg: 1, kb: 0, stun: 1, stop: 0, ...h }, __game.player.facing);
    // 临时改表，测完还原
    T.with = async (obj, patch, fn) => { const keep = {}; for (const k in patch) { keep[k] = obj[k]; obj[k] = patch[k]; } try { return await fn(); } finally { Object.assign(obj, keep); } };
  });

  // 1. 腐骨兵佯攻：前半段和真打一样，收招前露出「?」，收招不伤人，紧接着真打一下
  const gf = await p.evaluate(async () => {
    const g = await T.setup(0); const F = T.D.FEINT;
    return T.with(F, { chance: [1, 1, 1], global: [0, 0, 0] }, async () => {
      const e = T.mk('grunt', 680, 85, { attackCd: 0 });
      let start = null, revealAt = null, cancelAt = null, hp0 = g.player.dmgTaken ?? 0, dmgFeint = 0, realStart = null, realFeint = null, hz = 0, w = 0;
      T.run(400, (i) => {
        g.player.x = 600; g.player.y = 85; g.player.invuln = 0;
        if (start == null && e.state === 'windup' && e.atk.feint) { start = i; w = e.windup; }
        if (start != null && revealAt == null && T.A.feintRevealed(e)) revealAt = i - start;
        if (start != null && cancelAt == null && e.state === 'idle') { cancelAt = i - start; dmgFeint = (g.player.dmgTaken ?? 0) - hp0; }
        if (cancelAt != null && realStart == null && e.state === 'windup') { realStart = i - start; realFeint = !!e.atk.feint; }
      });
      return { start, w, revealAt, cancelAt, expectCancel: Math.round(w * F.cancelAt), reveal: F.reveal, dmgFeint, realStart, realFeint, feintCd: e.feintCd };
    });
  });
  check('grunt feint: same windup, "?" shows before the cancel, no damage, then a real attack', gf.start != null && gf.revealAt === gf.expectCancel - gf.reveal && Math.abs(gf.cancelAt - gf.expectCancel - 1) <= 1 && gf.dmgFeint === 0 && gf.realStart != null && gf.realStart - gf.cancelAt <= 40 && gf.realFeint === false, gf);

  // 2. 屠夫佯攻：红圈也是假的（收招时红圈消失、不伤人）
  const bf = await p.evaluate(async () => {
    const g = await T.setup(0); const F = T.D.FEINT;
    return T.with(F, { chance: [1, 1, 1], global: [0, 0, 0] }, async () => {
      const e = T.mk('brute', 700, 85, { attackCd: 0 });
      let start = null, hzFeint = null, hzGone = null, dmg = 0, d0 = g.player.dmgTaken ?? 0, real = null;
      T.run(500, (i) => {
        g.player.x = 600; g.player.y = 85; g.player.invuln = 0; g.player.facing = 1;
        if (start == null && e.state === 'windup' && e.atk.feint) { start = i; const h = g.hazards.find((h) => h.owner === e); hzFeint = !!h?.feint; }
        if (start != null && hzGone == null && e.state === 'idle') { hzGone = !g.hazards.some((h) => h.owner === e && !h.dead) || g.hazards.filter((h) => h.owner === e).every((h) => { h.update(g); return h.dead; }); dmg = (g.player.dmgTaken ?? 0) - d0; }
        if (hzGone != null && real == null && e.state === 'windup') real = { feint: !!e.atk.feint, shove: !!e.atk.shove };
      });
      return { start, hzFeint, hzGone, dmg, real };
    });
  });
  check('brute feint: red circle marked as a feint, vanishes on the cancel, no damage, real swing follows', bf.start != null && bf.hzFeint && bf.hzGone && bf.dmg === 0 && bf.real && !bf.real.feint, bf);

  // 3. 频率上限：概率拉满，全场两次佯攻至少隔 global、同一个至少隔 cd；连段保护期间不佯攻
  const cap = await p.evaluate(async () => {
    const g = await T.setup(0); const F = T.D.FEINT;
    return T.with(F, { chance: [1, 1, 1] }, async () => {
      const es = [700, 500, 760, 440].map((x) => T.mk('grunt', x));
      const feints = [];
      T.run(3000, (i) => { g.player.x = 600; g.player.invuln = 99; for (const e of es) { if (e.state === 'windup' && e.st === 1 && e.atk.feint) feints.push([g.ai.f, es.indexOf(e)]); if (e.hp < e.maxHp) e.hp = e.maxHp; } });
      let minGap = 1e9, minSame = 1e9;
      for (let i = 1; i < feints.length; i++) minGap = Math.min(minGap, feints[i][0] - feints[i - 1][0]);
      for (let i = 0; i < feints.length; i++) for (let j = i + 1; j < feints.length; j++) if (feints[i][1] === feints[j][1]) { minSame = Math.min(minSame, feints[j][0] - feints[i][0]); break; }
      // 连段保护中
      g.ai.lastHit = { e: es[0], f: g.ai.f }; g.combo = 5; g.ai.updateGuard();
      const during = g.ai.guarding ? g.ai.feintFor(es[1]) : 'no-guard';
      return { n: feints.length, minGap, minSame, global: F.global[0], cd: F.cd, during };
    });
  });
  check('feint caps: global spacing and per-enemy cooldown hold even at 100% chance; never during combo protection', cap.n >= 3 && cap.minGap >= cap.global && cap.minSame >= cap.cd && cap.during === false, cap);

  // 4. 普通难度少用：去掉冷却只看概率，普通 < 噩梦 < 地狱，且和表里的数一致
  const rate = await p.evaluate(async () => {
    const out = {};
    for (const d of [0, 1, 2]) {
      const g = await T.setup(d); const F = T.D.FEINT, A = g.ai;
      const e = T.mk('grunt', 700);
      let n = 0; const N = 4000;
      for (let i = 0; i < N; i++) { e.feintCd = 0; A.lastFeintF = -1e9; if (A.feintFor(e)) n++; }
      out[d] = { ratio: +(n / N).toFixed(3), table: F.chance[d] };
    }
    return out;
  });
  check('feints are rarer on normal than on nightmare / hell (matches the table)', rate[0].ratio < rate[1].ratio && rate[1].ratio < rate[2].ratio && [0, 1, 2].every((d) => Math.abs(rate[d].ratio - rate[d].table) < 0.02), rate);

  // 5. 读习惯：每次预警都闪 → 提示一次（只一次），佯攻倍率升到上限 1.3 为止；落点被记下
  const hb = await p.evaluate(async () => {
    const g = await T.setup(0); const A = g.ai, H = A.habits;
    const toasts = []; const t0 = g.toast?.bind(g); g.toast = (m, c) => { toasts.push(m); return t0?.(m, c); };
    const foe = T.mk('grunt', 700, 85, { attackCd: 99999 });
    const series = [];
    // 直接喂感知层（不跑整套更新，只看「看得见的主角」）
    const P = g.player, tick = (n, f) => { for (let i = 0; i < n; i++) { f?.(i); A.tick(); } };
    for (let k = 0; k < 14; k++) {
      A.onAttackStart(foe); // 敌人在你身边预警
      tick(4, () => { P.state = 'idle'; P.x = 600; P.y = 85; });
      // 你往左闪（远离敌人），落点在左 90、纵深 +20
      tick(8, (i) => { P.state = 'dash'; P.x = 600 - (i + 1) * 11.25; P.y = 85 + (i + 1) * 2.5; });
      tick(30, () => { P.state = 'idle'; P.x = 510; P.y = 105; });
      series.push(+H.mult('feint').toFixed(3));
    }
    return { toasts, series, max: Math.max(...series), h: H.h('dodge'), land: H.landing() };
  });
  const dodgeToasts = hb.toasts.filter((t) => t.includes('闪避'));
  check('habit read: dodging every tell → one toast, feint multiplier rises but never past 1.3', dodgeToasts.length === 1 && hb.series[0] === 1 && hb.max > 1.2 && hb.max <= 1.3 + 1e-9, { toasts: hb.toasts, series: hb.series });
  check('habit read: remembers where your dodges land (relative, away from the threat)', hb.land && Math.abs(hb.land.ax - 90) < 15 && Math.abs(hb.land.dy - 20) < 6, hb.land);

  // 6. 贪刀习惯：屠夫最多早 30% 甩开（普通 6 下 → 5 下）；不贪的时候 5 下不甩
  const gr = await p.evaluate(async () => {
    const run = async (greedy) => {
      const g = await T.setup(0);
      if (greedy) { for (let k = 0; k < 6; k++) { g.combo = 7; g.ai.tick(); g.combo = 0; g.ai.tick(); } }
      const m = g.ai.habits.mult('greed');
      const e = T.mk('brute', 660, 85, { attackCd: 9999, armor: 1e9, maxArmor: 1e9 });
      T.run(10, () => { g.player.x = 600; e.x = 660; });
      for (let i = 0; i < 5; i++) { T.hit(e); T.run(6, () => { g.player.x = 600; e.x = 660; }); }
      let shove = false;
      T.run(60, () => { g.player.x = 600; if (e.state === 'windup' && e.atk.shove) shove = true; });
      return { m: +m.toFixed(2), shove };
    };
    return { greedy: await run(true), calm: await run(false), hits: T.D.AI_PROFILES.brute.shove.hits[0] };
  });
  check('greed habit: brute shoves one hit earlier (≤30%), not without the habit', gr.greedy.m === 1.3 && gr.greedy.shove && !gr.calm.shove && gr.calm.m === 1, gr);

  // 7. 司祭：优先护你正在打的那个（三个同伴，挨打的那个最远也排第一）
  const pr = await p.evaluate(async () => {
    const run = async (hitFar) => {
      const g = await T.setup(0);
      const pri = T.mk('priest', 1000, 85, { attackCd: 9999 });
      const a = T.mk('grunt', 900, 85, { attackCd: 99999 }), c = T.mk('grunt', 880, 95, { attackCd: 99999 }), far = T.mk('grunt', 700, 85, { attackCd: 99999, hp: 1e6, maxHp: 1e6 });
      const pin = () => { g.player.x = 600; g.player.invuln = 99; pri.x = 1000; a.x = 900; c.x = 880; far.x = 700; a.y = 85; c.y = 95; far.y = 85; };
      T.run(30, pin);
      if (hitFar) T.hit(far);
      pri.attackCd = 0;
      let warded = null, intent = null;
      T.run(160, () => { pin(); if (pri.state === 'windup' && pri.atk.kind === 'trap') { pri.setState('idle'); pri.attackCd = 0; } if (!intent && pri.state === 'windup') intent = pri.ai?.intent; if (!warded && (a.ward || c.ward || far.ward)) warded = { a: !!a.ward, c: !!c.ward, far: !!far.ward }; });
      return { warded, intent };
    };
    return { hit: await run(true), none: await run(false) };
  });
  check('priest wards the ally you are hitting first', pr.hit.warded?.far && pr.hit.intent === 'protect' && pr.none.warded && !pr.none.warded.far, pr);

  // 8. 司祭：读条前先确认身前有同伴挡着 —— 没有就先走到同伴身后，挡好了才读
  const sc = await p.evaluate(async () => {
    const g = await T.setup(0);
    const pri = T.mk('priest', 820, 85, { attackCd: 0 });
    const ally = T.mk('grunt', 1000, 85, { attackCd: 99999 }); // 同伴在司祭身后（离你更远）
    let first = null, screenedAtStart = null, sawScreen = false;
    T.run(400, () => {
      g.player.x = 600; g.player.y = 85; g.player.invuln = 99; ally.x = 1000; ally.y = 85;
      if (pri.ai?.intent === 'screen') sawScreen = true;
      if (first == null && pri.state === 'windup' && pri.atk.kind === 'ward') { first = Math.round(pri.x); screenedAtStart = pri.x > ally.x; }
      if (pri.state === 'windup' && pri.atk.kind === 'trap') pri.setState('idle'); // 这里只看护咒
    });
    return { first, screenedAtStart, sawScreen, allyX: 1000 };
  });
  check('priest steps behind an ally before channelling a ward', sc.sawScreen && sc.first != null && sc.screenedAtStart, sc);

  // 9. 司祭：陷阱下在你常闪避的落点（没读到就下在你脚下）
  const tp = await p.evaluate(async () => {
    const run = async (read) => {
      const g = await T.setup(0);
      const pri = T.mk('priest', 900, 85, { attackCd: 9999 });
      T.mk('grunt', 680, 85, { attackCd: 99999 }); // 离你最近的敌人在右边 → 你往左闪
      if (read) for (let k = 0; k < 4; k++) g.ai.habits.land.push({ ax: 80, dy: 30 });
      g.player.x = 600; g.player.y = 85;
      pri.startWindup(g, pri.T.trap);
      let trap = null;
      T.run(60, () => { g.player.x = 600; g.player.y = 85; g.player.invuln = 99; trap ??= g.hazards.find((h) => h.owner === pri && h.arm); });
      return trap && { x: Math.round(trap.x), y: Math.round(trap.y), read: trap.read };
    };
    return { read: await run(true), plain: await run(false) };
  });
  check('priest trap lands on your usual dodge landing spot', tp.read && tp.read.x === 520 && tp.read.y === 115 && tp.read.read && tp.plain && tp.plain.x === 600 && tp.plain.y === 85, tp);

  // 10. 烬翼：一只假冲（「?」、只冲一半、不伤人），另一只在假冲预警进行到 pair 时开始真冲（会伤人）
  const wf = await p.evaluate(async () => {
    const g = await T.setup(0); const F = T.D.FEINT, W = T.D.AI_PROFILES.wing;
    return T.with(F, { chance: [1, 1, 1], global: [0, 0, 0] }, async () => {
      const w1 = T.mk('wing', 700, 85, { attackCd: 0, z: 127 }), w2 = T.mk('wing', 520, 85, { attackCd: 30, z: 127 });
      let fake = null, fakeW = 0, real = null, realE = null, fakeHit = false, revealDash = false, minFakeZ = 999, realHit = false;
      const ah = g.applyHit.bind(g); g.applyHit = (src, tgt, ...r) => { if (tgt === g.player && src.atk?.fake) fakeHit = true; if (tgt === g.player && src === realE) realHit = true; return ah(src, tgt, ...r); };
      T.run(300, (i) => {
        g.player.x = 600; g.player.y = 85; g.player.invuln = 0;
        for (const w of [w1, w2]) {
          if (fake == null && w.state === 'windup' && w.atk.fake) { fake = { i, who: w === w1 ? 1 : 2 }; fakeW = w.windup; }
          if (fake && real == null && w.state === 'windup' && !w.atk.feint) { real = i - fake.i; realE = w; }
          if (w.state === 'attack' && w.atk.fake) { revealDash ||= T.A.feintRevealed(w); minFakeZ = Math.min(minFakeZ, w.z); }
        }
      });
      g.applyHit = ah;
      return { fake, real, expect: Math.round(fakeW * W.pair), fakeHit, revealDash, minFakeZ: Math.round(minFakeZ), realHit };
    });
  });
  check('wings: one fake dive (amber, pulls up halfway, harmless) baits, the partner\'s real dive follows', wf.fake && wf.real != null && Math.abs(wf.real - wf.expect) <= 2 && !wf.fakeHit && wf.revealDash && wf.minFakeZ > 50 && wf.realHit, wf);

  // 11. 烬翼：轮流俯冲（没有佯攻时，两只不同时冲）
  const tn = await p.evaluate(async () => {
    const g = await T.setup(0); const F = T.D.FEINT;
    return T.with(F, { chance: [0, 0, 0] }, async () => {
      const ws = [700, 520, 760].map((x) => T.mk('wing', x, 85, { attackCd: 0, z: 127 }));
      let both = 0, dives = 0;
      T.run(1200, () => { g.player.x = 600; g.player.invuln = 99; const n = ws.filter((w) => w.state === 'windup' || (w.state === 'attack' && w.st < w.atk.dur)).length; if (n > 1) both++; for (const w of ws) { if (w.state === 'windup' && w.st === 1) dives++; if (w.hp < w.maxHp) w.hp = w.maxHp; } });
      return { both, dives };
    });
  });
  check('wings take turns diving', tn.both === 0 && tn.dives >= 4, tn);

  // 12. 烬翼：看到你起跳 → 近的散开，你在空中时不俯冲；看到你落地 → 冷却快好的那只马上俯冲
  const sj = await p.evaluate(async () => {
    const g = await T.setup(0); const W = T.D.AI_PROFILES.wing, R = W.reaction[0];
    const w = T.mk('wing', 700, 85, { attackCd: 9999, z: 127 });
    T.run(60, () => { g.player.x = 600; w.x = 700; w.y = 85; });
    const d0 = Math.abs(w.x - 600);
    let diveAir = false, maxD = 0;
    // 起跳 50 帧
    T.run(50, (i) => { g.player.x = 600; g.player.z = 60; g.player.vz = 0; g.player.state = 'air'; if (i === R + 2) w.attackCd = 0; if (w.state === 'windup' && w.st === 1 && i >= R) diveAir = true; maxD = Math.max(maxD, Math.abs(w.x - 600)); });
    const scattered = w.ai?.intent;
    // 落地：冷却设到 40（不到 land.cd），看它在反应时间之后马上俯冲
    w.setState('idle'); w.attackCd = 40; w.ai.scatterT = 0; w.x = 700; w.z = 127;
    g.player.z = 0; g.player.vz = 0; g.player.setState('idle');
    let landDive = null, intent = null;
    T.run(80, (i) => { g.player.x = 600; g.player.z = 0; w.z = Math.max(w.z, 120); if (landDive == null && w.state === 'windup') { landDive = i; intent = w.ai.intent; } });
    // 对照：不起跳、冷却 40 → 要等冷却好
    const g2 = await T.setup(0);
    const w2 = T.mk('wing', 700, 85, { attackCd: 40, z: 127 });
    let plain = null;
    T.run(80, (i) => { g2.player.x = 600; w2.z = Math.max(w2.z, 120); if (plain == null && w2.state === 'windup') plain = i; });
    return { d0, maxD: Math.round(maxD), diveAir, scattered, landDive, intent, plain, R };
  });
  check('wings scatter when you jump and never dive at you mid-air', sj.maxD > sj.d0 + 60 && !sj.diveAir, sj);
  check('wings dive right after you land (after the reaction delay), sooner than their cooldown', sj.landDive != null && sj.landDive >= sj.R && sj.landDive <= sj.R + 8 && sj.intent === 'landdive' && sj.plain >= 38, sj);

  // 13. 令牌上限、连段保护在佯攻 / 配合下照样成立（腐骨兵、屠夫、烬翼、司祭混战，佯攻拉满）
  const mix = await p.evaluate(async () => {
    const g = await T.setup(1); const F = T.D.FEINT;
    return T.with(F, { chance: [1, 1, 1], global: [0, 0, 0] }, async () => {
      const es = [T.mk('grunt', 700), T.mk('grunt', 480), T.mk('brute', 780), T.mk('wing', 650, 85, { z: 127 }), T.mk('wing', 540, 85, { z: 127 }), T.mk('priest', 950)];
      let max = 0, during = 0; const who = [];
      // 子轮 G 修正：按「开始出招的那一帧」连段保护开没开来判（原来在第 1 帧才看：保护恰好在出招开始后的下一帧打开时会误报，v45 上 40 次里 2 次）
      const startGuard = new Map();
      T.run(2400, (i) => {
        g.player.x = 600; g.player.invuln = 99;
        for (const e of es) { if (e.hp < e.maxHp) e.hp = e.maxHp; e.ward = null; if (e.state === 'windup' && e.st === 0) startGuard.set(e, g.ai.guarding); }
        max = Math.max(max, es.filter((e) => e.state === 'windup' || e.state === 'attack').length);
        if (i > 1200 && i < 1500) { if (i % 12 === 0) T.hit(es[0], { stun: 30 }); for (const e of es) if (e !== es[0] && e.state === 'windup' && e.st === 1 && e.atk.kind !== 'ward' && startGuard.get(e)) { during++; who.push(e.T.ai || e.type || e.T.name, e.atk.kind || 'atk', e.ai?.intent); } }
      });
      return { max, cap: g.maxAttackers, during, who };
    });
  });
  check('attack-token cap and combo protection still hold with feints and pair dives', mix.max <= mix.cap && mix.during === 0, mix); console.log('MIX', JSON.stringify(mix));

  console.log('ERR', errs.join(' | ') || 'none');
  console.log(fails.length || errs.length ? 'FAILED: ' + fails.join(', ') : 'ALL PASS');
  await b.close();
})();
