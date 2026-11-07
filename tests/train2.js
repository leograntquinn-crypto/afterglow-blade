const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message + '\n' + e.stack));
  await p.goto(`http://localhost:${PORT}/index.html`);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(1200);
  await p.keyboard.press('KeyJ'); await p.waitForTimeout(300);
  await p.evaluate(() => { __game.story.clear(); __game.openSite('training'); }); await p.click('#site-panel [data-act="train"]'); await p.waitForTimeout(800);
  const r = await p.evaluate(() => {
    const g = __game, pl = g.player, T = g.training; const run = (n) => { for (let i = 0; i < n; i++) g.update(); };
    run(60); const d = g.enemies.filter(e => e.dummy)[0];
    const near = (dx = -60) => { pl.setState('idle'); pl.x = d.x + dx; pl.y = d.y; pl.z = 0; pl.vz = 0; pl.facing = 1; };
    // 上挑 → 跳 → 空中斩 ×3
    near(); pl.startMove(g, 'upper'); run(12);
    pl.z = d.z; pl.x = d.x - 50; pl.setState('air'); pl.vz = 3; pl.startMove(g, 'airSlash'); run(10);
    pl.startMove(g, 'airSlash2'); run(10); pl.startMove(g, 'airSlash3'); run(10);
    run(80);
    // 坠星斩
    near(-20); pl.z = 120; pl.setState('air'); pl.startMove(g, 'plunge'); run(60);
    run(60);
    // 破军
    near(); pl.startMove(g, 'chargeSlash2'); run(50); run(80);
    // 30 连击 / 风格 S
    g.combo = 30; run(2); g.addStyle(2000, 'x'); run(2);
    // 反击模式：弹刀
    T.toggleCounter(); run(60); near(-55); d.setState('idle'); d.attackCd = 0;
    for (let i = 0; i < 300 && !T.done.has('parry'); i++) { if (d.state === 'attack' && d.st === d.atk.hitAt - 2) { pl.setState('idle'); pl.facing = 1; pl.startMove(g, 'slash1'); } g.update(); }
    // 受身：被打飞后按跳
    run(120); near(-55); d.setState('idle'); d.attackCd = 0; pl.invuln = 0;
    for (let i = 0; i < 400 && !T.done.has('tech'); i++) { if (pl.state === 'knock' && pl.st > 9) { g.input.press('jump'); g.input.release('jump'); } g.update(); pl.invuln = pl.state === 'knock' ? pl.invuln : 0; }
    return { done: [...T.done], missing: ['combo3','rush','upper','air3','plunge','otg','wall','charge2','perfect','parry','tech','combo30','styleS','ult'].filter(x => !T.done.has(x)), hp: pl.hp, state: pl.state };
  });
  console.log(JSON.stringify(r)); console.log('ERR', errs.join('\n') || 'none');
  await b.close();
})();
