const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message + '\n' + e.stack)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:8765/index.html');
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(1200);
  await p.keyboard.press('KeyJ'); await p.waitForTimeout(300);
  const out = {};
  out.lockedCard = await p.evaluate(() => { __game.story.clear(); __game.openSite('trial'); return !!document.querySelector('#site-panel .stage.trial.locked'); });
  await p.evaluate(() => { __game.save.cleared.s1 = true; __game.openSite('trial'); });
  await p.click('#site-panel [data-act="trial"]'); await p.waitForTimeout(800);
  // 清层：把敌人打死，直到出现选择
  const clearFloor = async () => p.evaluate(() => {
    const g = __game; g.player.hp = g.player.maxHp; g.player.invuln = 999;
    for (let i = 0; i < 4000 && !g.trialChoice && g.scene === 'play'; i++) {
      for (const e of g.enemies) if (e.alive && e.team !== 'prop' && e.state !== 'spawn') { e.hp = 1; g.applyHit(g.player, e, { dmg: 99999, kb: 1 }, 1); }
      g.update();
    }
    return { floor: g.trial.floor, choice: g.trialChoice, pool: { ...g.trial.pool }, boss: g.room.type, overlay: !document.querySelector('#trial-choice').hidden };
  });
  out.f1 = await clearFloor();
  await p.screenshot({ path: process.argv[2] + '/trial_choice.png' });
  for (let k = 0; k < 4; k++) { await p.keyboard.press('KeyJ'); await p.waitForTimeout(100); out['f' + (k + 2)] = await clearFloor(); }
  out.afterBoss = out.f5;
  // 进第 6 层，截个图看看 HUD
  await p.keyboard.press('KeyJ'); await p.waitForTimeout(100);
  await p.evaluate(() => { const g = __game; for (let i = 0; i < 120; i++) g.update(); g.banner = null; });
  await p.screenshot({ path: process.argv[2] + '/trial_hud.png' });
  out.f6info = await p.evaluate(() => ({ floor: __game.trial.floor, lv: __game.stage.lv, theme: __game.stage.theme, waves: __game.room.waves.length, normalAffix: __game.D.normalAffix }));
  out.f6 = await clearFloor();
  // 离开（L）
  await p.keyboard.press('KeyL'); await p.waitForTimeout(300);
  out.leave = await p.evaluate(() => (__game.openSite('trial'), { scene: __game.scene, stones: __game.save.stones, best: __game.save.trialBest, result: __game.trial.result, card: document.querySelector('.stage.trial .rec')?.textContent }));
  // 再来一次：过 2 层后阵亡
  await p.click('#site-panel [data-act="trial"]'); await p.waitForTimeout(800);
  await clearFloor(); await p.keyboard.press('KeyJ'); await p.waitForTimeout(100); await clearFloor();
  out.die = await p.evaluate(() => {
    const g = __game; const pool = { ...g.trial.pool }; g.trialContinue();
    g.player.invuln = 0; g.player.hp = 1; const e = g.enemies.find(x => x.team !== 'prop') || null;
    const src = { team: 'enemy', x: g.player.x + 30, y: g.player.y, dmgMul: 1, owner: null };
    for (let i = 0; i < 20 && g.player.state !== 'dead'; i++) { g.player.invuln = 0; g.applyHit(src, g.player, { dmg: 9999, kb: 1 }, -1); g.update(); }
    for (let i = 0; i < 200 && g.scene === 'play'; i++) g.update();
    return { scene: g.scene, pool, result: g.trial.result, best: g.save.trialBest };
  });
  await p.waitForTimeout(2500); await p.screenshot({ path: process.argv[2] + '/trial_dead.png' });
  console.log(JSON.stringify(out, null, 1)); console.log('ERR', errs.join('\n') || 'none');
  await b.close();
})();
