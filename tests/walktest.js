const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(1500);
  await p.keyboard.press('KeyJ'); await p.waitForTimeout(300);
  const r = await p.evaluate(async () => {
    const g = __game; g.startStage(0); for (let i = 0; i < 100; i++) g.update();
    g.enemies = g.enemies.filter(e => e.team === 'prop'); g.spawnQueue = [];
    const { Enemy } = await import('./src/enemy.js'); const { enemyFrame, stepWalk } = await import('./src/enemy_sprites.js');
    const out = {};
    const run = (type, vx, vy, n = 60) => {
      const e = new Enemy(type, 500, 90, g, { lv: 1 }); e.setState('idle'); e.facing = 1;
      const seq = []; let x0 = e.x;
      for (let i = 0; i < n; i++) { e.vx = vx; e.vy = vy; e.x += vx; stepWalk(e); seq.push(enemyFrame(e, i).replace(/^walk_0/, 'w').replace(/^idle_0/, 'i')); }
      return seq.join(' ');
    };
    out.gruntFwd = run('grunt', 1.7, 0);
    out.gruntBack = run('grunt', -1.7, 0);
    out.gruntCreep = run('grunt', 0.25, 0);
    out.gruntDepth = run('grunt', 0, 1.2, 30);
    // 实际 AI：攻击后后退时
    const e = new Enemy('grunt', 500, 90, g, { lv: 1 }); e.setState('idle'); g.enemies.push(e); g.player.x = 440; g.player.y = 90; e.attackCd = 60;
    const seq = []; for (let i = 0; i < 40; i++) { g.update(); seq.push(`${e.vx.toFixed(1)}:${enemyFrame(e, i).replace(/^walk_0/, 'w').replace(/^idle_0/, 'i')}`); }
    out.aiRetreat = seq.join(' ');
    return out;
  });
  for (const [k, v] of Object.entries(r)) console.log(k.padEnd(10), v);
  console.log('ERR', errs.join('|') || 'none');
  await b.close();
})();
