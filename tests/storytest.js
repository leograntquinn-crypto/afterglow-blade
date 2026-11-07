// 剧情测试：开场卡（第一次）、卡片期间敌人不出、战前台词期间首领不出手、结局 + 制作名单、设置关闭、回看剧情
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765, out = process.argv[2], mobile = process.argv[3] === 'm';
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext(mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message + ' ' + e.stack));
  await p.goto(`http://localhost:${PORT}/index.html`);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(1000);
  // 桌面：按 J 从封面进地图 —— 前提卡改在第一次进地图时播（之后出征第 1 关只剩开场卡 1 页）；手机不按，出征时照旧先播前提
  if (!mobile) { await p.keyboard.press('KeyJ'); await p.waitForTimeout(300); }
  const worldPremise = await p.evaluate(() => __game.story.card?.title === '长夜' && __game.story.card.pages.length === 2);
  const sm = mobile ? '_m' : '';
  const step = async (n) => p.evaluate((n) => { const g = __game; for (let i = 0; i < n; i++) g.update(); g.render(); }, n);
  const press = async (a) => p.evaluate((a) => { const g = __game; g.input.press(a); g.input.release(a); }, a);
  const R = {};
  // 1. 第一次从营地出征第 1 关：前提 2 页 + 开场卡 1 页
  await p.evaluate(() => __game.startStage(0, 0, true));
  await step(30);
  await p.screenshot({ path: `${out}/card1${sm}.png` });
  R.card = await p.evaluate(() => { const g = __game; return { pages: g.story.card?.pages.length, banner: !!g.banner, enemies: g.enemies.filter(e => e.alive).length }; });
  // 不到 1 秒按键不翻页（同一次 evaluate 里做完，避免截图时页面自己跑帧）
  R.earlySkipIgnored = await p.evaluate(() => { const g = __game; g.story.card.t = 30; g.input.press('attack'); g.input.release('attack'); g.update(); return g.story.card?.i === 0; });
  await step(70); await press('attack'); await step(30);
  await p.screenshot({ path: `${out}/card2${sm}.png` });
  await step(40); await press('attack'); await step(70); await press('attack'); await step(2);
  R.afterCards = await p.evaluate(() => { const g = __game; for (let i = 0; i < 120; i++) g.update(); return { card: !!g.story.card, banner: !!g.banner, enemies: g.enemies.filter(e => e.alive && e.team !== 'prop').length, seen: g.save.story }; });
  // 2. 战前台词：首领出场后站着不出手
  await p.evaluate(() => { const g = __game; g.enemies = g.enemies.filter(e => e.team === 'prop'); g.spawnQueue = []; g.waveActive = false; g.bossAt = g.frame; g.updateWaves(); });
  await step(40);
  await p.screenshot({ path: `${out}/dialog${sm}.png` });
  R.dialog = await p.evaluate(() => { const g = __game; return { lines: g.story.dialog?.lines.length, bossIdle: g.boss.state !== 'attack', restT: g.boss.restT }; });
  for (let k = 0; k < 3; k++) { await step(30); await press('attack'); }
  await step(5);
  R.afterDialog = await p.evaluate(() => { const g = __game; return { dialog: !!g.story.dialog, restT: g.boss.restT }; });
  // 3. 再出征第 1 关：只看第一次 → 没有卡片
  await p.evaluate(() => __game.startStage(0, 0, true)); await step(5);
  R.secondTime = await p.evaluate(() => !!__game.story.card);
  // 4. 结局：通关第 5 关（模拟）
  await p.evaluate(() => { const g = __game; g.save.cleared.s4 = true; g.startStage(4, 0, true); g.story.clear(); g.finish(); });
  await step(40);
  await p.screenshot({ path: `${out}/ending${sm}.png` });
  // 结局期间 advance（点屏幕 / 回车）只翻剧情、不会离开结算画面；把卡片计时固定在 1 秒内，避免截图期间页面自己跑帧
  R.ending = await p.evaluate(() => { const g = __game; g.story.card.t = 10; g.advance(); return { scene: g.scene, pages: g.story.card?.pages.length, page: g.story.card?.i }; });
  for (let k = 0; k < 3; k++) { await step(70); await press('attack'); }
  await step(240);
  await p.screenshot({ path: `${out}/credits${sm}.png` });
  R.credits = await p.evaluate(() => !!__game.story.credits);
  await step(70); await press('attack'); await step(2);
  R.afterEnding = await p.evaluate(() => ({ active: __game.story.active, endingSeen: !!__game.save.story.ending, scene: __game.scene }));
  // 5. 设置「关」：没有卡片
  await p.evaluate(async () => { const { setSetting } = await import('./src/settings.js'); setSetting('story', 'off'); __game.startStage(2, 0, true); });
  R.off = await p.evaluate(() => !!__game.story.card);
  await p.evaluate(async () => { const { setSetting } = await import('./src/settings.js'); setSetting('story', 'first'); });
  // 6. 营地回看剧情
  await p.evaluate(() => { __game.openHub(); __game.openStoryLog(); });
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/log${sm}.png` });
  R.log = await p.evaluate(() => document.querySelectorAll('#story-log .story-sec').length);
  console.log(JSON.stringify(R));
  R.worldPremise = worldPremise;
  const ok = R.card.pages === (mobile ? 3 : 1) && (mobile || worldPremise) && !R.card.banner && R.card.enemies === 0 && R.earlySkipIgnored && !R.afterCards.card && R.afterCards.enemies > 0 && R.afterCards.seen.premise && R.afterCards.seen.s1
    && R.dialog.lines === 2 && R.dialog.bossIdle && R.dialog.restT > 1000 && !R.afterDialog.dialog && R.afterDialog.restT <= 30 && !R.secondTime
    && R.ending.scene === 'clear' && R.ending.pages === 3 && R.ending.page === 0 && R.credits && !R.afterEnding.active && R.afterEnding.endingSeen && !R.off && R.log >= 3;
  console.log(ok ? 'PASS' : 'FAIL', 'ERR', errs.join('|') || 'none');
  await b.close();
})();
