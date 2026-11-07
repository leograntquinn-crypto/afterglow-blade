// 敌人智能第 2 轮：铁甲屠夫、影弓手的确定性场景测试（固定随机种子）
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765, SEED = process.env.SEED || 2468;
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
      g.ai.f = 0; g.ai.hist.fill(null); g.ai.lastHit = null; g.ai.guardFrom = null; g.combo = 0; g.comboT = 0;
      const { Enemy } = await import('./src/enemy.js');
      T.mk = (type, x, y = 85, o = {}) => { const e = new Enemy(type, x, y, g, { lv: 1 }); e.state = 'idle'; e.st = 0; Object.assign(e, o); g.enemies.push(e); return e; };
      return g;
    };
    T.run = (n, each) => { const g = __game; for (let i = 0; i < n; i++) { g.player.hp = 1e7; each?.(i); g.update(); } };
    T.hit = (e, h = {}) => __game.applyHit(__game.player, e, { dmg: 1, kb: 0, stun: 1, stop: 0, ...h }, __game.player.facing);
  });

  // ---------- 铁甲屠夫 ----------
  // 1. 正面格挡：你面向它蓄力 → 反应时间后举斧；正面挡住、背后打得到；不到一秒放下
  const gd = await p.evaluate(async () => {
    const g = await T.setup(0); const e = T.mk('brute', 720, 85, { attackCd: 9999 });
    T.run(20, () => { g.player.x = 600; g.player.facing = 1; e.x = 720; });
    // 主角保持蓄力姿势（冻结主角自己的更新，不然没按住攻击键会马上放开）
    let at = null; const upd = g.player.update; g.player.update = () => {};
    g.player.setState('charge');
    T.run(60, (i) => { g.player.x = 600; g.player.facing = 1; e.x = 720; if (at == null && e.guardT > 0) at = i; });
    g.player.update = upd; g.player.setState('idle');
    const hp0 = e.hp; const front = T.hit(e, { dmg: 50, heavy: true }); const frontLoss = hp0 - e.hp;
    const hp1 = e.hp; g.player.x = 840; g.player.facing = -1; T.hit(e, { dmg: 50 }); const backLoss = hp1 - e.hp;
    T.run(80, () => { g.player.x = 600; });
    return { at, frontLoss, backLoss, after: e.guardT };
  });
  check('brute guard: raises after the reaction delay when you charge; blocks front, not back; drops soon', gd.at != null && gd.at >= 18 && gd.at <= 40 && gd.frontLoss === 0 && gd.backLoss > 0 && gd.after === 0, gd);

  // 2. 甩开贪刀：短时间内被连打够数 → 「甩开」、身边一圈红圈、把你震开；少一下就不甩
  const sv = await p.evaluate(async () => {
    const g = await T.setup(0); const { AI_PROFILES } = await import('./src/ai_data.js'); const N = AI_PROFILES.brute.shove.hits[0];
    const run = async (n) => {
      await T.setup(0); const e = T.mk('brute', 660, 85, { attackCd: 9999, armor: 1e9, maxArmor: 1e9 });
      T.run(10, () => { g.player.x = 600; e.x = 660; });
      for (let i = 0; i < n; i++) { T.hit(e); T.run(6, () => { g.player.x = 600; e.x = 660; }); }
      let start = null, hz = null;
      const px0 = g.player.x; let pushed = 0;
      // 甩开开始以后就不再把主角拉回原位（看它能不能把你震开）
      T.run(90, (i) => { if (start == null) g.player.x = 600; g.player.invuln = 0; if (start == null && e.state === 'windup') { start = i; hz = g.hazards.find((h) => h.owner === e); hz = hz && { dx: Math.round(hz.x - e.x), rx: hz.rx, shove: !!e.atk.shove }; } pushed = Math.max(pushed, Math.abs(g.player.x - px0)); });
      return { start, hz, pushed: Math.round(pushed) };
    };
    return { N, yes: await run(N), no: await run(N - 1) };
  });
  check('brute shove: after N quick hits, a ring around itself that throws you out; N-1 hits do nothing', sv.yes.start != null && sv.yes.hz?.shove && Math.abs(sv.yes.hz.dx) < 2 && sv.yes.hz.rx > 100 && sv.yes.pushed > 40 && sv.no.start == null, sv);

  // 3. 延迟重砸：预警过半时你在闪避 → 多举一会儿再砸，红圈位置不变；不闪避就照常
  const dl = await p.evaluate(async () => {
    const g = await T.setup(2);
    const res = {};
    for (const dodge of [false, true]) {
      await T.setup(2); const e = T.mk('brute', 690, 85, { attackCd: 0 });
      let started = null, fired = null, hx0 = null, hx1 = null;
      for (let i = 0; i < 200 && fired == null; i++) {
        g.player.hp = 1e7; g.player.invuln = 999; g.player.x = 600; g.player.y = 85;
        if (started != null && dodge && e.st >= Math.floor(e.windup * 0.4) - 12 && e.st < e.windup) g.player.state = 'dash';
        else if (g.player.state === 'dash') g.player.state = 'idle';
        g.update();
        if (started == null && e.state === 'windup') { started = i; hx0 = g.hazards.find((h) => h.owner === e)?.x; }
        if (started != null && e.state === 'attack') { fired = i - started; hx1 = g.hazards.find((h) => h.owner === e)?.x; }
      }
      res[dodge ? 'dodge' : 'plain'] = { fired, hold: e.holdT, same: hx0 === hx1 || hx1 == null };
    }
    return res;
  });
  check('brute delayed slam: holds when you dodge, same red circle; normal timing otherwise', dl.dodge.fired > dl.plain.fired && dl.dodge.hold > 0 && dl.plain.hold === 0 && dl.dodge.same, dl);

  // 4. 逼墙角：你靠左墙，屠夫在你和墙之间 → 它从纵深绕到开阔的一边（不穿过你），把你往墙那边逼
  const cn = await p.evaluate(async () => {
    const g = await T.setup(0); const e = T.mk('brute', 90, 85, { attackCd: 99999 });
    let minDy = 999;
    T.run(600, () => { g.player.x = 230; g.player.y = 85; g.player.invuln = 99; if (Math.abs(e.x - 230) < 50) minDy = Math.min(minDy, Math.abs(e.y - 85)); });
    return { side: Math.sign(e.x - 230), x: Math.round(e.x), minDy: Math.round(minDy) };
  });
  check('brute corners you: circles to the open side without walking through you', cn.side === 1 && cn.minDy > 25, cn);

  // ---------- 影弓手 ----------
  // 5. 躲到屠夫身后：冷却中，弓手站到屠夫背后（相对你）
  const cv = await p.evaluate(async () => {
    const g = await T.setup(0); const br = T.mk('brute', 780, 85, { attackCd: 99999 }), ar = T.mk('archer', 1000, 40, { attackCd: 99999 });
    T.run(300, () => { g.player.x = 520; g.player.invuln = 99; br.x = 780; br.y = 85; });
    return { behind: Math.sign(ar.x - br.x) === Math.sign(br.x - 520), gap: Math.round(Math.abs(ar.x - br.x)), dy: Math.round(Math.abs(ar.y - br.y)), intent: ar.ai?.intent };
  });
  check('archer takes cover behind the brute while reloading', cv.behind && cv.gap < 120 && cv.dy < 40, cv);

  // 6. 射线：同伴挡在中间时不隔着同伴放箭，换个纵深再射
  const ln = await p.evaluate(async () => {
    const g = await T.setup(0); const gr = T.mk('grunt', 760, 85, { attackCd: 99999 }), ar = T.mk('archer', 900, 85, { attackCd: 0 });
    let shot = null;
    T.run(400, (i) => {
      g.player.x = 600; g.player.y = 85; g.player.invuln = 99; gr.x = 760; gr.y = 85; gr.vx = gr.vy = 0;
      if (ar.state === 'windup' && ar.st === 1) shot = shot ?? { i, dy: Math.round(Math.abs(ar.y - 85)) };
    });
    return { shot };
  });
  check('archer moves off a blocked line before shooting', ln.shot != null && ln.shot.dy >= 20, ln);

  // 7. 预判：你一直往纵深一个方向走，箭射向你要去的位置；红线就是箭的路线
  const ld = await p.evaluate(async () => {
    const g = await T.setup(2); const ar = T.mk('archer', 900, 60, { attackCd: 0 });
    let aim = null, arrow = null;
    T.run(300, () => {
      g.player.x = 600; g.player.invuln = 99; g.player.vy = 1.0; g.player.y = 60 + ((g.player.y - 60 + 0.4) % 50);
      if (!aim && ar.state === 'windup' && ar.aim) aim = { ...ar.aim, y: ar.y };
      if (!arrow) arrow = g.projectiles.find((q) => q.owner === ar);
    });
    return { aimVy: aim?.vy, arrowVy: arrow?.vy };
  });
  check('archer leads your depth movement; the arrow flies along the shown line', ld.aimVy > 0 && Math.abs(ld.arrowVy - ld.aimVy) < 1e-6, ld);

  // 8. 被逼到墙边：先侧闪（纵深），再飞踢把你踢开
  const kk = await p.evaluate(async () => {
    const g = await T.setup(0); const ar = T.mk('archer', 70, 85, { attackCd: 0 });
    let side = null, kick = null, hit = false; const hp0 = g.player.hp;
    g.camX = 0;
    T.run(240, () => {
      g.player.x = Math.min(g.player.x, ar.x + 80); g.player.y = ar.y; g.player.facing = -1; g.camX = 0;
      if (side == null && ar.state === 'hop') side = { vy: ar.vy, vx: ar.vx };
      if (kick == null && ar.state === 'windup' && ar.atk.kind === 'kick') kick = true;
      if (g.player.state === 'hurt' || g.player.state === 'knock') hit = true;
    });
    return { side, kick, hit };
  });
  check('cornered archer side-dodges in depth, then kicks you away', kk.side && kk.side.vx === 0 && Math.abs(kk.side.vy) > 0 && kk.kick && kk.hit, kk);

  // 9. 画面外不射；混合场面攻击令牌不超；连段保护对屠夫 / 弓手也生效
  const mx = await p.evaluate(async () => {
    const g = await T.setup(0);
    const ar = T.mk('archer', 1500, 85, { attackCd: 0 });
    let off = false;
    T.run(80, () => { g.player.x = 400; g.camX = 0; ar.x = 1500; if (ar.state === 'windup') off = true; });
    await T.setup(0);
    const es = [T.mk('brute', 700), T.mk('archer', 900, 60), T.mk('archer', 300, 110), T.mk('grunt', 480), T.mk('grunt', 760, 120)];
    let max = 0;
    T.run(1500, () => { g.player.x = 600; g.player.invuln = 99; for (const e of es) if (e.attackCd > 40) e.attackCd = 40; max = Math.max(max, es.filter((e) => e.state === 'windup' || e.state === 'attack').length); });
    await T.setup(0);
    const A = T.mk('grunt', 650, 85, { attackCd: 99999, hp: 1e9, maxHp: 1e9 }), ar2 = T.mk('archer', 850, 85, { attackCd: 40 }), br = T.mk('brute', 540, 85, { attackCd: 40 });
    let during = false;
    T.run(150, (i) => { g.player.x = 600; g.player.facing = 1; g.player.invuln = 99; if (i % 12 === 0) T.hit(A, { stun: 30 }); if (g.ai.guarding && ((ar2.state === 'windup' && ar2.st <= 1) || (br.state === 'windup' && br.st <= 1))) during = true; });
    return { off, max, cap: g.maxAttackers, during };
  });
  check('no off-screen shots; token cap holds with brutes + archers + grunts; combo protection covers them', !mx.off && mx.max <= mx.cap && mx.max >= 1 && !mx.during, mx);

  console.log('ERR', errs.join(' | ') || 'none');
  console.log(fails.length || errs.length ? 'FAILED: ' + fails.join(', ') : 'ALL PASS');
  await b.close();
})();
