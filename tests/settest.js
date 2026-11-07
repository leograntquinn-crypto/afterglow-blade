const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message + '\n' + e.stack)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:8765/index.html');
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(1200);
  await p.keyboard.press('KeyJ'); await p.waitForTimeout(300);
  const out = {};
  await p.evaluate(() => { const g = __game; g.story.clear(); g.save.world.greeted = true; g.world.events = []; }); await p.waitForTimeout(100); // 跳过地图开场对话（对话时菜单按钮收起）
  await p.click('#world-bar [data-menu="settings"]'); await p.waitForTimeout(150);
  await p.screenshot({ path: process.argv[2] + '/settings_hub.png' });
  // 点：震屏关、闪屏关、推近关、伤害数字只看暴击、音效低、按钮大
  for (const [k, v] of [['shake', '0'], ['flash', 'false'], ['zoom', 'false'], ['numbers', '"crit"'], ['sfx', '0.4'], ['touch', '1.2']]) {
    await p.click(`#settings [data-set="${k}"][data-v='${v}']`); await p.waitForTimeout(60);
  }
  out.saved = await p.evaluate(() => JSON.parse(localStorage.getItem('afterglow-settings')));
  out.onButtons = await p.evaluate(() => [...document.querySelectorAll('#settings .seg .btn.on')].map(b => b.textContent));
  await p.click('#settings [data-set-close]'); await p.waitForTimeout(100);
  out.closed = await p.evaluate(() => document.querySelector('#settings').hidden);
  // 效果
  out.effects = await p.evaluate(async () => {
    const g = __game; g.startStage(0); for (let i = 0; i < 80; i++) g.update();
    const { Enemy } = await import('./src/enemy.js');
    g.enemies = g.enemies.filter(e => e.team === 'prop'); g.spawnQueue = [];
    const e = new Enemy('grunt', 500, 90, g, { lv: 1 }); e.setState('idle'); e.attackCd = 9999; g.enemies.push(e);
    g.fx.shakeT = 0; g.fx.texts = [];
    g.fx.shake(10, 20); const shakeT = g.fx.shakeT;
    g.fx.flashA = 0; g.fx.flash('#fff', 0.5); const flashA = g.fx.flashA;
    g.fx.number(500, 90, 50, 12, {}); const plain = g.fx.texts.filter(t => t.k === 'num').length;
    g.fx.number(500, 90, 50, 30, { crit: true }); const crit = g.fx.texts.filter(t => t.k === 'num').length;
    g.fx.number(500, 90, 50, 8, { color: '#f00' }); const hurt = g.fx.texts.filter(t => t.k === 'num').length;
    return { shakeT, flashA, numbersAfterPlain: plain, afterCrit: crit, afterHurt: hurt, tscale: getComputedStyle(document.documentElement).getPropertyValue('--tscale').trim() };
  });
  // 暂停菜单里也能打开
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  await p.click('#pause [data-act="settings"]'); await p.waitForTimeout(150);
  out.fromPause = await p.evaluate(() => !document.querySelector('#settings').hidden);
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  out.closedOnResume = await p.evaluate(() => document.querySelector('#settings').hidden && !__game.paused);
  // 重新加载后保持
  await p.reload(); await p.waitForTimeout(1000);
  out.persist = await p.evaluate(async () => { const { settings } = await import('./src/settings.js'); return { shake: settings.shake, numbers: settings.numbers, touch: settings.touch }; });
  // 手机：大按钮截图
  const m = await b.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await m.goto('http://localhost:8765/index.html'); await m.evaluate(() => localStorage.setItem('afterglow-settings', JSON.stringify({ touch: 1.2 }))); await m.reload(); await m.waitForTimeout(1200);
  await m.evaluate(() => { const g = __game; g.startStage(0); for (let i = 0; i < 100; i++) g.update(); g.banner = null; g.paused = true; });
  await m.waitForTimeout(200); await m.screenshot({ path: process.argv[2] + '/touch_large.png' });
  console.log(JSON.stringify(out, null, 1)); console.log('ERR', errs.join('\n') || 'none');
  await b.close();
})();
