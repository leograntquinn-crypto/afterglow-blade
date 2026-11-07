const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message + '\n' + e.stack)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:8765/index.html');
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(1200);
  await p.keyboard.press('KeyJ'); await p.waitForTimeout(400);
  await p.screenshot({ path: process.argv[2] + '/t0-hub.png' });
  await p.evaluate(() => { __game.story.clear(); __game.openSite('training'); }); await p.click('#site-panel [data-act="train"]'); await p.waitForTimeout(800);
  const r = await p.evaluate(async () => {
    const g = __game, pl = g.player, T = g.training;
    const run = (n) => { for (let i = 0; i < n; i++) g.update(); };
    run(60);
    const d = g.enemies.filter(e => e.dummy);
    const res = { dummies: d.length, scene: g.scene };
    const near = (e, dx = -60) => { pl.setState('idle'); pl.x = e.x + dx; pl.y = e.y; pl.z = 0; pl.facing = Math.sign(-dx); };
    // 三连斩
    near(d[0]); pl.startMove(g, 'slash1'); run(10); pl.startMove(g, 'slash2'); run(10); pl.startMove(g, 'slash3'); run(30);
    // 扫腿追打倒地：先让木人倒地
    run(60); d[0].setState('down'); d[0].z = 0; near(d[0]); pl.startMove(g, 'sweep'); run(30);
    // 打不死
    d[0].hp = 5; near(d[0]); pl.startMove(g, 'slash1'); run(30);
    res.alive = d[0].alive && d[0].hp > 0;
    // 撞墙：右边木人靠墙，五连刺
    run(60); near(d[1]); d[1].setState('idle'); pl.startMove(g, 'rush'); run(80);
    // 必杀
    g.ult = 100; pl.setState('idle'); g.startUltimate(); run(200);
    // 反击模式下极限闪避
    T.toggleCounter();
    res.counter = T.counter;
    run(30); near(d[0], -50); d[0].setState('idle'); d[0].attackCd = 0;
    let dodged = false;
    for (let i = 0; i < 300 && !dodged; i++) { if (d[0].state === 'attack' && d[0].st === d[0].atk.hitAt - 1) { pl.setState('idle'); pl.startDash(g); } g.update(); dodged = T.done.has('perfect'); }
    res.done = [...T.done];
    res.saved = g.save.training;
    res.gold = g.save.gold;
    res.dps = T.dps;
    return res;
  });
  await p.waitForTimeout(200);
  await p.evaluate(() => { __game.paused = false; });
  await p.screenshot({ path: process.argv[2] + '/t1-train.png' });
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.screenshot({ path: process.argv[2] + '/t2-pause.png' });
  await p.click('[data-act="retreat"]'); await p.waitForTimeout(400);
  const after = await p.evaluate(() => ({ scene: __game.scene, training: !!__game.training, runs: __game.save.runs }));
  console.log(JSON.stringify(r), JSON.stringify(after)); console.log('ERR', errs.join('\n') || 'none');
  await b.close();
})();
