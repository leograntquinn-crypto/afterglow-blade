// 耐力（第 7 项 7a）确定性测试：闪避消耗、不够时侧步、侧步冷却、回复延迟和速度、极限闪避 / 弹刀返还、技能消耗和动作里不回复、普攻不花耐力
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  const fails = []; const check = (n, ok, info) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + ' ' + JSON.stringify(info)); if (!ok) fails.push(n); };
  await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(1500);
  await p.evaluate(async () => {
    window.T = {};
    T.S = (await import('./src/stamina_data.js')).STAMINA;
    T.setup = () => { const g = __game; g.story.clear(); g.startStage(0, 0, false); g.story.clear(); for (let i = 0; i < 5; i++) g.update();
      g.enemies = []; g.spawnQueue = []; g.hazards = []; g.projectiles = []; g.waveActive = true; g.banner = null;
      const pl = g.player; pl.hp = pl.maxHp = 1e7; pl.x = 500; pl.y = 85; pl.setState('idle'); pl.sta = T.S.max; pl.staDelay = 0; pl.staLock = 0; return g; };
    T.run = (n, f) => { const g = __game; for (let i = 0; i < n; i++) { f?.(i); g.player.hp = 1e7; g.update(); } };
    T.dash = () => { const g = __game; g.input.press('right'); g.input.press('dash'); g.update(); g.input.release('dash'); const r = { state: g.player.state, inv: g.player.invuln, weak: !!g.player.weakStep, sta: Math.round(g.player.sta) }; let x0 = g.player.x; T.run(26); g.input.release('right'); r.dist = Math.round(g.player.x - x0); T.run(2); return r; };
  });
  // 1. 满耐力连闪 3 次正常（有无敌帧），第 4 次侧步（没有无敌帧、距离短），第 5 次在侧步冷却里不动
  const d = await p.evaluate(() => { T.setup(); const r = []; for (let i = 0; i < 5; i++) r.push(T.dash()); return r; });
  check('three full dodges, then a weak side-step (no i-frames, shorter), then nothing during lockout',
    d.slice(0, 3).every((x) => x.state === 'dash' && x.inv > 0 && !x.weak) && d[3].state === 'dash' && d[3].weak && d[3].inv === 0 && d[3].dist < d[0].dist * 0.7 && d[4].state !== 'dash', d);
  // 2. 回复：停止消耗 delay 帧内不回；之后按每帧 regen 回
  const rg = await p.evaluate(() => { const g = T.setup(); const pl = g.player; pl.spendStamina(60); const s0 = pl.sta; T.run(T.S.delay - 2); const s1 = pl.sta; T.run(62); const s2 = pl.sta; return { s0, s1, s2: +s2.toFixed(1), want: +(s0 + 60 * T.S.regen).toFixed(1) }; });
  check('regen waits for the delay, then refills at the table rate', rg.s1 === rg.s0 && Math.abs(rg.s2 - rg.want) < 2, rg);
  // 3. 极限闪避返还 + 马上开始回复；侧步不能极限闪避
  const pf = await p.evaluate(async () => {
    const g = T.setup(), pl = g.player; const { Enemy } = await import('./src/enemy.js');
    const e = new Enemy('grunt', 560, 85, g, { lv: 1 }); e.state = 'idle'; g.enemies.push(e);
    pl.sta = 40; pl.staDelay = 0; pl.startDash(g); pl.spendStamina(30); const before = pl.sta;
    const ok = g.applyHit(e, pl, { dmg: 5, kb: 1, stun: 5, stop: 0 }, 1); const after = pl.sta, delay = pl.staDelay;
    T.setup(); pl.sta = 5; pl.staLock = 0; pl.tryDash(g); const weak = pl.weakStep, perfectWeak = pl.inPerfectWindow();
    return { before, after, delay, ok, weak, perfectWeak };
  });
  check('perfect dodge refunds stamina and restarts regen at once; the weak side-step has no perfect-dodge window', pf.ok === false && Math.round(pf.after - pf.before) === 25 && pf.delay === 0 && pf.weak && !pf.perfectWeak, pf);
  // 4. 弹刀返还
  const pr = await p.evaluate(async () => { const g = T.setup(), pl = g.player; const { Enemy } = await import('./src/enemy.js'); const e = new Enemy('grunt', 560, 85, g, { lv: 1 }); g.enemies.push(e); pl.sta = 20; g.parry(e); return { sta: Math.round(pl.sta) }; });
  check('parry refunds stamina', pr.sta === 35, pr);
  // 5. 技能：扣耐力、动作里不回；普攻不花耐力
  const sk = await p.evaluate(() => {
    const g = T.setup(), pl = g.player; g.save.skills.skill1 = true; pl.mp = pl.maxMp; pl.cd.skill1 = 0; pl.sta = 80; pl.staDelay = 99;
    g.input.press('skill1'); g.update(); g.input.release('skill1');
    const inSkill = pl.state === 'attack' && !!pl.move?.skill, afterCast = pl.sta; let regenDuring = 0;
    while (pl.state === 'attack' && pl.move?.skill) { const s = pl.sta; T.run(1); if (pl.sta > s) regenDuring++; }
    T.setup(); pl.sta = 50; for (let i = 0; i < 4; i++) { g.input.press('attack'); g.update(); g.input.release('attack'); T.run(14); }
    return { inSkill, afterCast: Math.round(afterCast), regenDuring, afterAttacks: Math.round(pl.sta) };
  });
  check('a skill costs stamina and blocks regen while it plays; normal attacks cost none', sk.inSkill && sk.afterCast === 70 && sk.regenDuring === 0 && sk.afterAttacks >= 50, sk);
  // 6. HUD 能画（满、不够闪红）
  const hud = await p.evaluate(() => { const g = T.setup(); g.render(); g.player.sta = 5; g.player.staFlash = 20; g.render(); return true; });
  check('HUD stamina bar renders', hud, {});
  console.log('ERR', errs.join(' | ') || 'none');
  console.log(fails.length || errs.length ? 'FAILED: ' + fails.join(', ') : 'ALL PASS');
  await b.close();
})();
