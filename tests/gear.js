const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message + '\n' + e.stack)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`http://localhost:${PORT}/index.html`);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(1200);
  await p.keyboard.press('KeyJ'); await p.waitForTimeout(300);
  const out = {};
  await p.evaluate(async () => {
    const { makeItem } = await import('./src/items.js');
    const g = __game, s = g.save; s.gold = 100000; s.lv = 14; g.refreshStats();
    const old = makeItem('ring', 10, 1); old.enh = 7; s.equip.trinket1 = old;
    const nw = makeItem('ring', 14, 4); s.bag = [nw]; // 新传说：九词条、必带刻印
    if (nw.rar !== 4 || nw.affix.length !== 9 || !nw.mark) throw new Error('传说品质样本不符合新表');
    for (let k = 0; k < 6; k++) s.bag.push(makeItem('helm', 5, k % 2));       // 普通 / 精良
    const keep = makeItem('armor', 5, 1); keep.locked = true; s.bag.push(keep); // 锁定的精良
    const enh = makeItem('armor', 5, 0); enh.enh = 2; s.bag.push(enh);          // 强化过的普通
    window.__ids = { nw: nw.id, old: old.id };
    g.story.clear(); g.openMenu('hero');
  });
  await p.click(`[data-act="sel"][data-id="${await p.evaluate(() => window.__ids.nw)}"]`); await p.waitForTimeout(150);
  await p.screenshot({ path: process.argv[2] + '/gear_modal.png' });
  out.before = await p.evaluate(() => { const it = __game.save.bag[0]; return { affix: it.affix.map(a => a.k), enh: it.enh, gold: __game.save.gold, inheritBtn: document.querySelector('[data-act="inherit"]')?.textContent.trim() }; });
  // 重铸第 1 条，三次（九词条仍有一个未占用属性可供替换）
  for (let k = 0; k < 3; k++) { await p.click('[data-act="reforge"][data-i="0"]'); await p.waitForTimeout(80); }
  out.reforge = await p.evaluate(() => { const it = __game.save.bag[0]; return { affix: it.affix.map(a => a.k), distinct: new Set(it.affix.map(a => a.k)).size === it.affix.length, reforged: it.reforged, gold: __game.save.gold }; });
  // 传承（饰品默认对比目标是较弱的空槽 trinket2，先切到装着 +7 旧件的 trinket1）
  await p.click('[data-act="compareSlot"][data-slot="trinket1"]'); await p.waitForTimeout(150);
  await p.click('[data-act="inherit"]'); await p.waitForTimeout(100);
  out.inherit = await p.evaluate(() => { const it = __game.save.bag[0]; return { newEnh: it.enh, oldEnh: __game.save.equip.trinket1.enh, gold: __game.save.gold }; });
  if (out.inherit.newEnh !== 7 || out.inherit.oldEnh !== 0) throw new Error('传承应使新件+7、旧件归零');
  // 锁定 → 出售按钮禁用
  await p.click('[data-act="lock"]'); await p.waitForTimeout(80);
  out.lock = await p.evaluate(() => ({ locked: __game.save.bag[0].locked, sellDisabled: document.querySelector('[data-act="sell"]')?.disabled }));
  await p.click('[data-act="close"]'); await p.waitForTimeout(80);
  // 批量出售：精良及以下
  const n0 = await p.evaluate(() => __game.save.bag.length);
  await p.click('[data-act="sellJunk"][data-r="1"]'); await p.waitForTimeout(100);
  out.batch = await p.evaluate(() => ({ left: __game.save.bag.map(it => `${it.slot}:r${it.rar}${it.locked ? 'L' : ''}${it.enh ? '+' + it.enh : ''}${it.mark ? 'M' : ''}`) }));
  out.batch.before = n0;
  await p.screenshot({ path: process.argv[2] + '/gear_bag.png' });
  console.log(JSON.stringify(out, null, 1)); console.log('ERR', errs.join('\n') || 'none');
  await b.close();
})();
