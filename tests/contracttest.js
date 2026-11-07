const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message + '\n' + e.stack)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:8765/index.html');
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(1200);
  await p.keyboard.press('KeyJ'); await p.waitForTimeout(400);
  await p.evaluate(() => { __game.story.clear(); __game.openMenu('contracts'); }); await p.waitForTimeout(200);
  const out = {};
  out.initial = await p.evaluate(async () => {
    const { contractText } = await import('./src/contracts.js');
    const B = __game.save.contracts; return { n: B.list.length, types: B.list.map(c => c.type), distinct: new Set(B.list.map(c => c.type)).size, texts: B.list.map(contractText), stones: __game.save.stones, cards: document.querySelectorAll('.contract').length };
  });
  await p.screenshot({ path: process.argv[2] + '/hub_contracts.png' });
  // 强制一张破招委托，打一局：在关卡里触发事件
  out.progress = await p.evaluate(async () => {
    const g = __game, B = g.save.contracts;
    B.list[0] = { id: 'tA', type: 'counter', n: 3, prog: 0, claimed: false };
    B.list[1] = { id: 'tB', type: 'flawless', n: 1, prog: 0, claimed: false };
    B.list[2] = { id: 'tC', type: 'clearStage', n: 1, prog: 0, claimed: false, stage: 0, diff: 0 };
    const { Enemy } = await import('./src/enemy.js');
    g.startStage(0); for (let i = 0; i < 80; i++) g.update();
    const pl = g.player; pl.hp = pl.maxHp = 1e6;
    // 破招 ×3（每次换一个新敌人，避免 40 帧节流）
    for (let k = 0; k < 3; k++) {
      g.enemies = g.enemies.filter(e => e.team === 'prop'); g.spawnQueue = [];
      const e = new Enemy('grunt', 520, 90, g, { lv: 1 }); e.setState('idle'); e.attackCd = 9999; e.facing = -1; g.enemies.push(e);
      pl.x = 470; pl.y = 90; pl.facing = 1; pl.setState('idle'); e.startWindup(g); for (let i = 0; i < 4; i++) g.update();
      pl.startMove(g, 'slash1'); for (let i = 0; i < 14; i++) g.update();
    }
    // 无伤清房：清掉剩余敌人，等房间结算
    g.enemies.forEach(e => { if (e.team !== 'prop') e.hp = 0; }); g.enemies = g.enemies.filter(e => e.team === 'prop'); g.spawnQueue = []; g.waveActive = true; g.roomDmg0 = pl.dmgTaken;
    for (let i = 0; i < 200 && !g.room.cleared; i++) g.update();
    // 通关
    g.finish();
    return { list: g.save.contracts.list.map(c => `${c.type} ${c.prog}/${c.n}`), toasts: g.toasts.map(t => t.text) };
  });
  // 回营地领取
  await p.evaluate(() => { __game.openHub(); __game.openMenu('contracts'); }); await p.waitForTimeout(300);
  const claimBtns = await p.$$('[data-act="claim"]'); out.claimButtons = claimBtns.length;
  for (let k = 0; k < 5 && await p.$('[data-act="claim"]'); k++) { await p.click('[data-act="claim"]'); await p.waitForTimeout(100); }
  out.afterClaim = await p.evaluate(() => ({ stones: __game.save.stones, gold: __game.save.gold, claimed: __game.save.contracts.list.filter(c => c.claimed).length, chip: document.querySelector('#h-stones').textContent }));
  // 换一个：只剩已领取的，先造一张没完成的
  out.reroll = await p.evaluate(async () => {
    const { rerollContract } = await import('./src/contracts.js');
    const g = __game, B = g.save.contracts; B.list[0] = { id: 'tX', type: 'parry', n: 5, prog: 1, claimed: false }; B.rerolls = 1;
    const a = rerollContract(g.save, 'tX'); const again = rerollContract(g.save, B.list[0].id);
    return { first: a, second: again, newType: B.list[0].type };
  });
  // 第二天：已领取的格子补上
  out.nextDay = await p.evaluate(async () => {
    const { ensureContracts } = await import('./src/contracts.js');
    const g = __game; g.save.contracts.day = '2000-01-01'; const B = ensureContracts(g.save);
    return { n: B.list.length, claimed: B.list.filter(c => c.claimed).length, rerolls: B.rerolls };
  });
  // 铭刻
  await p.evaluate(async () => {
    const { makeItem } = await import('./src/items.js');
    const g = __game; const it = makeItem('ring', 5, 2); it.mark = null; g.save.bag.push(it); window.__rid = it.id; g.openMenu('hero');
  });
  await p.click(`[data-act="sel"][data-id="${await p.evaluate(() => window.__rid)}"]`); await p.waitForTimeout(150);
  await p.click('[data-act="engrave"]'); await p.waitForTimeout(150);
  await p.screenshot({ path: process.argv[2] + '/engrave.png' });
  await p.click('[data-act="engraveMark"][data-k="air"]'); await p.waitForTimeout(150);
  out.engrave = await p.evaluate(() => { const it = __game.save.bag.find(x => x.id === window.__rid); return { mark: it.mark, stones: __game.save.stones, modalHasMark: document.querySelector('.mark')?.textContent || '' }; });
  console.log(JSON.stringify(out, null, 1)); console.log('ERR', errs.join('\n') || 'none');
  await b.close();
})();
