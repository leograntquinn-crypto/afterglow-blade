const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message + '\n' + e.stack));
  await p.goto(`http://localhost:${PORT}/index.html`);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(1200);
  await p.keyboard.press('KeyJ'); await p.waitForTimeout(300);
  await p.evaluate(() => { const g = __game; g.save.cleared.s1 = true; g.save.cleared['s1@nm'] = true; g.save.best['s1@nm'] = { letter: 'A', total: 8, time: 200, maxCombo: 30 }; g.save.cleared.s2 = true; g.hub.render(); });
  await p.waitForTimeout(200);
  await p.screenshot({ path: process.argv[2] + '/d0-hub.png' });
  const r = await p.evaluate(async () => {
    const g = __game; const { Enemy } = await import('./src/enemy.js'); const { Boss } = await import('./src/boss.js');
    const out = {};
    for (const d of [0, 1, 2]) {
      g.startStage(0, d);
      const e = new Enemy('grunt', 500, 90, g, { lv: g.stage.lv });
      const bo = new Boss('boneLord', 700, 90, g, g.stage.lv);
      const aff = []; for (let k = 0; k < 20; k++) { g.spawnEnemy('grunt*'); aff.push(g.enemies[g.enemies.length - 1].aff?.size || 0); }
      let normalAff = 0; for (let k = 0; k < 100; k++) { g.spawnEnemy('grunt'); normalAff += g.enemies[g.enemies.length - 1].aff ? 1 : 0; }
      out[d] = { name: g.stage.name, lv: g.stage.lv, hp: e.maxHp, dmgMul: +e.dmgMul.toFixed(2), windup: e.windup, bossHp: bo.maxHp, bossSpd: bo.spd, eliteAffMax: Math.max(...aff), normalAffPct: normalAff, attackers: g.maxAttackers };
    }
    // 通关地狱：存档 key
    g.startStage(0, 2); g.style.peak = 3; g.finish();
    out.saved = Object.keys(g.save.cleared); out.unlocked = g.unlockedDiff; 
    g.startStage(0, 1); g.finish(); out.unlockedAfterNm = g.unlockedDiff?.name;
    return out;
  });
  console.log(JSON.stringify(r, null, 0)); console.log('ERR', errs.join('\n') || 'none');
  await b.close();
})();
