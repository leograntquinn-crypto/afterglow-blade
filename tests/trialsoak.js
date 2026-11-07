const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message + '\n' + e.stack));
  await p.goto('http://localhost:8765/index.html');
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(1200);
  await p.keyboard.press('KeyJ'); await p.waitForTimeout(300);
  const r = await p.evaluate(async () => {
    const g = __game; g.save.cleared.s1 = true; g.startTrial();
    const log = [];
    for (let floor = 1; floor <= 26; floor++) {
      const pl = g.player; pl.hp = pl.maxHp = 1e6;
      let f = 0;
      for (; f < 6000 && !g.trialChoice; f++) {
        // 前 100 帧让敌人正常进攻，之后逐个打掉
        if (f > 100 && f % 10 === 0) for (const e of g.enemies) if (e.alive && e.team !== 'prop' && e.state !== 'spawn') { e.invuln = 0; e.hp = 1; g.applyHit(pl, e, { dmg: 999999, kb: 1, heavy: true, launch: 9 }, 1); }
        if (f % 7 === 0 && pl.state === 'idle') pl.startMove(g, 'slash1');
        g.update();
      }
      log.push(`${floor}:${g.room.type === 'boss' ? 'B(' + g.stage.boss + ')' : 'F'}${g.stage.theme[0]}/${f}`);
      if (!g.trialChoice) { log.push('STUCK'); break; }
      g.trialContinue();
    }
    const pool = { ...g.trial.pool };
    g.endTrial(false);
    return { log: log.join(' '), pool, best: g.save.trialBest, stones: g.save.stones, contracts: g.save.contracts.list.map(c => `${c.type} ${c.prog}/${c.n}`) };
  });
  console.log(JSON.stringify(r, null, 1)); console.log('ERR', errs.join('\n') || 'none');
  await b.close();
})();
