// 敌人智能第 1 轮：确定性场景测试（固定随机种子）
// 感知延迟、惩罚打空（及不该惩罚的情况）、踩线、包抄夹击（绕开主角、只在画面内出手）、攻击令牌、连段保护、背后提示、
// 原有敌人 / 训练木人不受影响、难度档、调试层
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript('window.__aiSeed = 12345');
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  const fails = [];
  const check = (name, ok, info) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); if (!ok) fails.push(name); };
  await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(1500);
  // 公共：开第 1 关、清场、主角站好；mk 生成一个跳过出场动画的敌人
  await p.evaluate(() => {
    window.T = {};
    T.setup = async (diff = 0) => {
      const g = __game; g.story.clear();
      g.startStage(0, diff, false); g.story.clear();
      for (let i = 0; i < 5; i++) g.update();
      g.enemies = []; g.spawnQueue = []; g.hazards = []; g.projectiles = []; g.waveActive = true; g.banner = null;
      const pl = g.player; pl.hp = pl.maxHp = 1e7; pl.x = 600; pl.y = 85; pl.z = 0; pl.facing = 1; pl.setState('idle');
      g.ai.f = 0; g.ai.hist.fill(null); g.ai.lastHit = null; g.ai.guardFrom = null; g.combo = 0;
      const { Enemy } = await import('./src/enemy.js');
      T.mk = (type, x, y = 85, o = {}) => { const e = new Enemy(type, x, y, g, { lv: 1 }); e.state = 'idle'; e.st = 0; Object.assign(e, o); g.enemies.push(e); return e; };
      return g;
    };
    T.run = (n, each) => { const g = __game; for (let i = 0; i < n; i++) { g.player.hp = 1e7; each?.(i); g.update(); } };
  });

  // 1. 惩罚打空：挥空 → 反应时间以后才出手，「破绽」字样，突刺；挥中了不惩罚；太远不惩罚
  const pun = await p.evaluate(async () => {
    const g = await T.setup(0); const { AI_PROFILES } = await import('./src/ai_data.js');
    const P = AI_PROFILES.grunt, keep = P.punish.chance; P.punish.chance = [1, 1, 1];
    const e = T.mk('grunt', 760, 85, { attackCd: 9999 });
    const labels = []; const lab = g.fx.label.bind(g.fx); g.fx.label = (...a) => { labels.push(a[3]); return lab(...a); };
    T.run(30, () => { g.player.x = 600; g.player.facing = 1; });
    e.x = 760; e.y = 85;
    // 挥空：对着 160 外的空气出一刀
    const pl = g.player; pl.facing = 1; pl.startMove(g, 'slash1');
    let whiffF = null, startF = null, atk = null;
    for (let i = 0; i < 80; i++) {
      g.update(); pl.hp = 1e7;
      const s = g.ai.hist[(g.ai.f - 1) % 32];
      if (whiffF == null && s.whiff) whiffF = g.ai.f - 1;
      if (startF == null && e.state === 'windup') { startF = g.ai.f; atk = { punish: !!e.atk.punish, windup: e.windup, speed: e.atk.speed }; }
    }
    const res1 = { whiffF, startF, delay: startF - whiffF, reaction: P.reaction[0], atk, label: labels.includes('破绽') };
    // 挥中了：不惩罚
    await T.setup(0);
    const e2 = T.mk('grunt', 660, 85, { attackCd: 9999 }), e3 = T.mk('grunt', 800, 85, { attackCd: 9999 });
    T.run(10); e2.x = 660; e3.x = 800; e3.y = 85;
    g.player.x = 600; g.player.facing = 1; g.player.startMove(g, 'slash1');
    let hitPunish = false;
    T.run(70, () => { if (e3.state === 'windup') hitPunish = true; });
    // 太远：不惩罚
    await T.setup(0);
    const e4 = T.mk('grunt', 900, 85, { attackCd: 9999 });
    T.run(10); e4.x = 900;
    g.player.x = 600; g.player.facing = 1; g.player.startMove(g, 'slash1');
    let farPunish = false;
    T.run(70, () => { if (e4.state === 'windup') farPunish = true; });
    P.punish.chance = keep;
    return { res1, hitPunish, farPunish, landed: true };
  });
  check('punish a whiff: after the reaction delay, with a 破绽 tell, as a dash-stab', pun.res1.startF != null && pun.res1.delay >= pun.res1.reaction && pun.res1.delay <= pun.res1.reaction + 10 && pun.res1.atk.punish && pun.res1.atk.speed > 0 && pun.res1.atk.windup >= 20 && pun.res1.label, pun.res1);
  check('no punish when the swing connects, or when too far', !pun.hitPunish && !pun.farPunish, { hit: pun.hitPunish, far: pun.farPunish });

  // 2. 反应时间按难度：地狱更快
  const lvl = await p.evaluate(async () => {
    const g = await T.setup(2); const { AI_PROFILES } = await import('./src/ai_data.js');
    return { level: g.ai.level(), reaction: AI_PROFILES.grunt.reaction[g.ai.level()] };
  });
  check('difficulty: hell reacts faster', lvl.level === 2 && lvl.reaction === 10, lvl);

  // 3. 踩线：冷却中守在攻击距离外，进进退退；主角面向它逼近 → 后撤
  const sp = await p.evaluate(async () => {
    const g = await T.setup(0); const e = T.mk('grunt', 900, 85, { attackCd: 99999 });
    const ds = [];
    T.run(400, (i) => { g.player.x = 600; g.player.facing = 1; if (i > 150) ds.push(Math.abs(e.x - 600)); });
    const range = e.T.atk.range;
    // 主角面向它往前走
    let backed = 0, n = 0;
    T.run(60, () => { g.player.x += 1.2; g.player.vx = 1.2; g.player.facing = 1; g.player.setState?.('run'); if (e.vx > 0) backed++; n++; });
    return { min: Math.min(...ds), max: Math.max(...ds), range, spread: Math.max(...ds) - Math.min(...ds), backed, n, intent: e.ai?.intent };
  });
  check('spacing: hovers just outside its reach, moving in and out', sp.min > sp.range + 15 && sp.max < sp.range + 110 && sp.spread > 15, sp);
  check('spacing: backs off when the hero walks at it', sp.backed > sp.n * 0.5, sp);

  // 4. 包抄：两个腐骨兵都在主角右边 → 一个绕到左边；绕的时候不从主角身上穿过（纵深让开）
  const fl = await p.evaluate(async () => {
    const g = await T.setup(0);
    const a = T.mk('grunt', 760, 85, { attackCd: 99999 }), c = T.mk('grunt', 860, 85, { attackCd: 99999 });
    let minDyCross = 999;
    T.run(420, () => {
      g.player.x = 600; g.player.y = 85; g.player.facing = 1;
      for (const e of [a, c]) if (Math.abs(e.x - 600) < 45) minDyCross = Math.min(minDyCross, Math.abs(e.y - 85));
    });
    return { sides: [Math.sign(a.x - 600), Math.sign(c.x - 600)], roles: [g.ai.role(a), g.ai.role(c)], minDyCross };
  });
  check('flank: one grunt circles to the other side', fl.sides[0] !== fl.sides[1] && fl.roles.includes('flank') && fl.roles.includes('front'), fl);
  check('flank: detours around the hero instead of walking through', fl.minDyCross > 25, fl);

  // 5. 包抄的那个只在画面内出手
  const off = await p.evaluate(async () => {
    const g = await T.setup(0);
    const a = T.mk('grunt', 760, 85, { attackCd: 99999 }), c = T.mk('grunt', 860, 85, { attackCd: 99999 });
    T.run(200, () => { g.player.x = 600; g.player.facing = 1; });
    const fl = g.ai.role(a) === 'flank' ? a : c;
    // 把镜头挪开，让包抄的那个在画面外；冷却清零、站进距离里
    fl.attackCd = 0; let attacked = false;
    T.run(60, () => { g.camX = fl.x + 80; fl.x = g.player.x - 50; fl.y = g.player.y; if (fl.state === 'windup') attacked = true; });
    return { attacked };
  });
  check('flanker never attacks from off-screen', !off.attacked, off);

  // 6. 攻击令牌：4 个腐骨兵一直想打，同时出招的不超过上限
  const tok = await p.evaluate(async () => {
    const g = await T.setup(0);
    const es = [700, 760, 480, 420].map((x) => T.mk('grunt', x));
    let max = 0;
    T.run(1500, () => { g.player.x = 600; g.player.invuln = 99; for (const e of es) if (e.attackCd > 40) e.attackCd = 40; max = Math.max(max, es.filter((e) => e.state === 'windup' || e.state === 'attack').length); });
    return { max, cap: g.maxAttackers };
  });
  check('attack token cap still holds', tok.max <= tok.cap && tok.max >= 1, tok);

  // 7. 连段保护：主角在打 A 的连段时，B 不插进来；连段停了以后 B 照常进攻
  const cg = await p.evaluate(async () => {
    const g = await T.setup(0);
    // B 的冷却 40 帧后才好（那时 A 已经挨了 3 下，连段保护生效）；只统计保护生效之后 B 新开始的预警
    const A = T.mk('grunt', 650, 85, { attackCd: 99999, hp: 1e9, maxHp: 1e9 }), B = T.mk('grunt', 560, 85, { attackCd: 40 });
    let duringB = false, afterB = false;
    T.run(150, (i) => {
      g.player.x = 600; g.player.facing = 1; g.player.invuln = 99;
      if (i % 12 === 0) { g.applyHit(g.player, A, { dmg: 1, kb: 0, stun: 30, stop: 0 }, 1); }
      if (g.ai.guarding && B.state === 'windup' && B.st <= 1) duringB = true;
    });
    const guardWas = g.ai.guarding;
    T.run(200, () => { g.player.x = 600; g.player.invuln = 99; if (B.state === 'windup') afterB = true; });
    return { duringB, afterB, guardWas, combo: g.combo };
  });
  check('combo protection: others hold off during the hero\'s combo, attack after', !cg.duringB && cg.afterB && cg.guardWas, cg);

  // 8. 背后来袭的方向提示
  const cue = await p.evaluate(async () => {
    const g = await T.setup(0);
    const e = T.mk('grunt', 540, 85, { attackCd: 0 });
    g.player.facing = 1; e.facing = 1; e.startWindup(g);
    const r = g.ai.drawCues(g.ctx, g.camX, 0);
    g.player.facing = -1; const r2 = g.ai.drawCues(g.ctx, g.camX, 0);
    return { behind: !!r, front: !!r2 };
  });
  check('back-attack cue only when the windup is behind the hero', cue.behind && !cue.front, cue);

  // 9. 原有敌人、训练木人不用新大脑；调试层能画
  const leg = await p.evaluate(async () => {
    const g = await T.setup(0);
    const ar = T.mk('archer', 900), br = T.mk('brute', 760), du = T.mk('grunt', 500, 85, { dummy: true, hold: true, home: 500 });
    T.run(120, () => { g.player.x = 600; g.player.invuln = 99; });
    g.aiDebug = true; g.render(); g.aiDebug = false;
    return { archer: !!ar.ai, brute: !!br.ai, dummy: !!du.ai, dummyX: Math.round(du.x) };
  });
  // 第 2 轮起弓手和屠夫也有大脑；训练木人始终不用
  check('archer / brute use their brains (round 2); training dummy keeps its old logic; debug overlay renders', leg.archer && leg.brute && !leg.dummy && leg.dummyX === 500, leg);

  console.log('ERR', errs.join(' | ') || 'none');
  console.log(fails.length || errs.length ? 'FAILED: ' + fails.join(', ') : 'ALL PASS');
  await b.close();
})();
