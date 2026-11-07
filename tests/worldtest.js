// 大地图测试：封面 → 地图、前提卡只播一次、走路和碰撞、地点提示、锁住的入口、进关 / 回到入口前、
// 训练场和试炼、菜单（Esc / B / 右上角按钮）、面板打开时人不动、道路随进度打通、手机摇杆和「攻」
const { chromium } = require('playwright');
const out = process.argv[2], mobile = process.argv[3] === 'm', PORT = process.env.PORT || 8765;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext(mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  const fails = [];
  const check = (name, ok, info) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); if (!ok) fails.push(name); };
  const ev = (f, a) => p.evaluate(f, a);
  const tap = async () => { if (mobile) await p.tap('#game'); else await p.keyboard.press('KeyJ'); };
  const use = async () => { if (mobile) await p.tap('.tbtn.atk'); else await p.keyboard.press('KeyJ'); }; // 地图上交互：J / 「攻」
  await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(1500);

  // 1. 封面在地图上
  check('starts on title over the map', await ev(() => __game.scene === 'title'));
  await tap(); await p.waitForTimeout(300);
  const s1 = await ev(() => ({ scene: __game.scene, story: !!__game.story.card, premise: !!__game.save.story?.premise }));
  check('title → world with premise cards (first time)', s1.scene === 'world' && s1.story && s1.premise, s1);
  for (let i = 0; i < 6 && await ev(() => !!__game.story.card); i++) { await p.waitForTimeout(1100); await tap(); }
  // 前提卡之后：烛婆的问候（第 3 轮的剧情）
  await p.waitForTimeout(600);
  const greet = await ev(() => ({ talk: !!__game.story.talk, who: __game.story.talk?.lines[0][0] }));
  for (let i = 0; i < 30 && await ev(() => __game.story.active || !!__game.world.ev); i++) { await p.waitForTimeout(250); await tap(); }
  check('premise cards then 烛婆 greeting, then free', greet.talk && greet.who === 'zhupo' && !(await ev(() => __game.story.active)), greet);

  // 2. 走路（键盘 / 摇杆）、地图边缘和建筑挡路
  const walk = async (dx, dy, ms) => {
    if (mobile) await ev(([dx, dy]) => { __game.input.stick.x = dx; __game.input.stick.y = dy; }, [dx, dy]);
    else { if (dx) await p.keyboard.down(dx > 0 ? 'KeyD' : 'KeyA'); if (dy) await p.keyboard.down(dy > 0 ? 'KeyS' : 'KeyW'); }
    await p.waitForTimeout(ms);
    if (mobile) await ev(() => { __game.input.stick.x = 0; __game.input.stick.y = 0; });
    else { await p.keyboard.up('KeyD'); await p.keyboard.up('KeyA'); await p.keyboard.up('KeyS'); await p.keyboard.up('KeyW'); }
  };
  const pos = () => ev(() => ({ x: Math.round(__game.world.hero.x), y: Math.round(__game.world.hero.y) }));
  const a0 = await pos(); await walk(1, 0, 800); const a1 = await pos();
  check('walks right', a1.x > a0.x + 40, [a0, a1]);
  // 往北走进守灯驿的底座：会被挡住
  await ev(() => { const W = __game.world; W.hero.x = 1200; W.hero.y = 1215; W.snapCam(); });
  await walk(0, -1, 900); const a2 = await pos();
  check('camp blocks walking through it', a2.y > 1100, a2); // 守灯驿的栅栏底座在 y≈1138 以北
  await ev(() => { const W = __game.world; W.hero.x = 120; W.hero.y = 700; W.snapCam(); });
  await walk(-1, 0, 900); const a3 = await pos();
  check('map edge blocks', a3.x >= 80, a3);

  // 3. 每个地点的提示 / 锁
  const near = await ev(async () => {
    const { SITES } = await import('./src/world.js'); const W = __game.world, r = {};
    for (const s of SITES) { if (s.kind === 'camp') continue; W.hero.x = s.door[0]; W.hero.y = s.door[1] + 6; W.update(__game.input, {}); r[s.id] = [W.near?.id, W.unlocked(s)]; }
    return r;
  });
  check('every site is reachable and detected', Object.entries(near).every(([k, v]) => v[0] === k), near);
  check('fresh save: only s1 / training open', near.s1[1] && near.training[1] && !near.s2[1] && !near.s5[1] && !near.trial[1], near);
  // 锁住的入口：弹出的卡片没有出征按钮
  await ev(() => { const W = __game.world, s = W.constructor && null; void s; W.hero.x = 1000; W.hero.y = 645; W.snapCam(); });
  await p.waitForTimeout(200); await use(); await p.waitForTimeout(200);
  const lock = await ev(() => ({ open: !__game.siteEl.hidden, go: !!__game.siteEl.querySelector('[data-act="go"]'), lock: __game.siteEl.querySelector('.lock')?.textContent }));
  check('locked entrance shows lock, no go button', lock.open && !lock.go && /解锁/.test(lock.lock), lock);
  if (!mobile) { await p.keyboard.press('Escape'); await p.waitForTimeout(150); } else { await p.click('[data-site-close]'); await p.waitForTimeout(150); }
  check('panel closes', await ev(() => __game.siteEl.hidden));

  // 4. 面板打开时人不动
  await ev(() => { const W = __game.world; W.hero.x = 640; W.hero.y = 900; W.snapCam(); });
  await p.waitForTimeout(150); await use(); await p.waitForTimeout(200);
  const f0 = await pos(); await walk(1, 0, 500); const f1 = await pos();
  check('hero frozen while panel open', f0.x === f1.x, [f0, f1]);
  await p.screenshot({ path: `${out}/w_panel${mobile ? '_m' : ''}.png` });

  // 5. 出征 → 收拢黑屏 → 进关；回来站在入口前
  if (mobile) await p.click('#site-panel [data-primary]'); else await p.keyboard.press('KeyJ');
  await p.waitForTimeout(150);
  const mid = await ev(() => ({ scene: __game.scene, leave: !!__game.world.leave }));
  await p.waitForTimeout(1200);
  const inStage = await ev(() => ({ scene: __game.scene, stage: __game.stage?.id }));
  check('go: fade then stage 1', mid.scene === 'world' && mid.leave && inStage.scene === 'play' && inStage.stage === 's1', { mid, inStage });
  await ev(() => { __game.endRun(); __game.openHub(); }); await p.waitForTimeout(300);
  const back = await ev(() => ({ scene: __game.scene, last: __game.world.lastSite, saved: __game.save.worldSite, x: Math.round(__game.world.hero.x), y: Math.round(__game.world.hero.y) }));
  check('returns in front of the entrance', back.scene === 'world' && back.last === 's1' && back.saved === 's1' && Math.abs(back.x - 640) < 10 && Math.abs(back.y - (874 + 8)) < 12, back);

  // 6. 通关①：②和试炼碑解锁，道路打通（地面缓存重画）；回到地图播「烽灯点亮」和「试炼碑苏醒」，播完才算亮
  const unl = await ev(async () => {
    const { site } = await import('./src/world.js'); const g = __game, W = g.world;
    const k0 = W.groundKey; g.save.cleared.s1 = true; g.save.best.s1 = { letter: 'A' };
    W.draw(g.ctx, 0); const k1 = W.groundKey;
    return { k0, k1, s2: W.unlocked(site('s2')), trial: W.unlocked(site('trial')), litBefore: W.litCount(), info: W.siteInfo(site('s1')).sub };
  });
  await ev(() => __game.openHub('s1'));
  const seen = new Set(); let caption = null;
  for (let i = 0; i < 80; i++) {
    await p.waitForTimeout(150);
    const st = await ev(() => ({ ev: __game.world.ev?.e.kind, cap: __game.world.caption?.text, talk: !!__game.story.talk }));
    if (st.ev) seen.add(st.ev);
    if (st.cap) caption = caption ?? st.cap;
    if (st.talk) await tap(); // 对话中触屏按钮收起：点画面翻页
    if (!st.ev && !st.talk && seen.size >= 2) break;
  }
  const after = await ev(() => ({ lit: __game.world.litCount(), awake: __game.world.trialAwake(), saved: !!__game.save.world?.lit?.s1 }));
  check('clearing s1 unlocks s2 + trial, opens road', unl.k0 !== unl.k1 && unl.s2 && unl.trial && unl.litBefore === 0 && /最佳 A/.test(unl.info), unl);
  check('back on map: beacon event + trial awakening play, then lit', seen.has('beacon') && seen.has('trial') && caption === '墓穴入口的烽灯，亮了' && after.lit === 1 && after.awake && after.saved, { seen: [...seen], caption, after });
  await p.screenshot({ path: `${out}/w_lit${mobile ? '_m' : ''}.png` });

  // 7. 训练场、试炼从地图进入
  for (const [id, expect] of [['training', 'training'], ['trial', 'trial']]) {
    await ev((id) => { const g = __game; g.openHub(id); }, id); await p.waitForTimeout(250);
    const at = await ev(() => __game.world.near?.id);
    await use(); await p.waitForTimeout(200);
    if (mobile) await p.click('#site-panel [data-primary]'); else await p.keyboard.press('KeyJ');
    await p.waitForTimeout(1200);
    const r = await ev(() => ({ scene: __game.scene, training: !!__game.training, trial: !!__game.trial }));
    check(`${id}: enter from map`, at === id && r.scene === 'play' && r[expect], { at, r });
    await ev(() => { const g = __game; if (g.trial) g.endTrial(false); else { g.endRun(); g.openHub(); } }); await p.waitForTimeout(300);
    const r2 = await ev(() => ({ scene: __game.scene, last: __game.world.lastSite }));
    check(`${id}: back to map at site`, r2.scene === 'world' && r2.last === id, r2);
  }

  // 8. 菜单：Esc / B / 右上角按钮；菜单开着时人不动
  if (!mobile) {
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    const m1 = await ev(() => ({ open: !__game.hub.root.hidden, tab: __game.hub.tab }));
    const g0 = await pos(); await walk(1, 0, 300); const g1 = await pos();
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    const m2 = await ev(() => !__game.hub.root.hidden);
    await p.keyboard.press('KeyB'); await p.waitForTimeout(150);
    const m3 = await ev(() => ({ open: !__game.hub.root.hidden, tab: __game.hub.tab }));
    await p.keyboard.press('KeyB'); await p.waitForTimeout(150);
    check('Esc opens/closes menu, B opens hero, frozen meanwhile', m1.open && g0.x === g1.x && !m2 && m3.open && m3.tab === 'hero' && (await ev(() => __game.hub.root.hidden)), { m1, m2, m3 });
  }
  await p.click('#world-bar [data-menu="contracts"]'); await p.waitForTimeout(200);
  const c = await ev(() => ({ open: !__game.hub.root.hidden, tab: __game.hub.tab, cards: document.querySelectorAll('#hub-body .contract').length, bar: getComputedStyle(document.getElementById('world-bar')).display }));
  await p.screenshot({ path: `${out}/w_menu${mobile ? '_m' : ''}.png` });
  await p.click('[data-act="close-hub"]'); await p.waitForTimeout(150);
  check('world bar → contracts tab, back button closes', c.open && c.tab === 'contracts' && c.cards === 3 && c.bar === 'none' && (await ev(() => __game.hub.root.hidden)), c);
  await p.click('#world-bar [data-menu="settings"]'); await p.waitForTimeout(150);
  const set = await ev(() => !__game.setEl.hidden);
  if (!mobile) await p.keyboard.press('Escape'); else await p.click('[data-set-close]');
  await p.waitForTimeout(150);
  check('settings from world bar', set && (await ev(() => __game.setEl.hidden)));

  // 9. 手机：摇杆在、「攻」打开面板
  if (mobile) {
    const tv = await ev(() => ({ touch: getComputedStyle(document.getElementById('touch')).display, atk: getComputedStyle(document.querySelector('.tbtn.atk')).display, jump: getComputedStyle(document.querySelector('.tbtn.jump')).display }));
    await ev(() => __game.openHub('s1')); await p.waitForTimeout(250);
    await p.tap('.tbtn.atk'); await p.waitForTimeout(200);
    const opened = await ev(() => !__game.siteEl.hidden);
    const hid = await ev(() => getComputedStyle(document.getElementById('touch')).display);
    check('mobile: stick + atk only, atk opens site, touch hidden under panel', tv.touch !== 'none' && tv.atk !== 'none' && tv.jump === 'none' && opened && hid === 'none', { tv, opened, hid });
    await p.click('[data-site-close]');
  }

  // 10. 第二次进游戏不再播前提卡
  await p.reload(); await p.waitForTimeout(1500); await tap(); await p.waitForTimeout(300);
  check('premise only once', !(await ev(() => __game.story.active)) && (await ev(() => __game.scene)) === 'world');
  check('reload remembers last site', (await ev(() => __game.world.lastSite)) === 'trial');
  await p.screenshot({ path: `${out}/w_map${mobile ? '_m' : ''}.png` });
  console.log('ERR', errs.join(' | ') || 'none');
  console.log(fails.length || errs.length ? 'FAILED: ' + fails.join(', ') : 'ALL PASS');
  await b.close();
})();
