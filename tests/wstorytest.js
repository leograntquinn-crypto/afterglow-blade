// 大地图剧情测试（第 3 轮）：三个 NPC 的对话和选项、「!」提示、按进度换台词、刻字、老存档迁移、结局尾声、剧情关闭、手机点选项
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
  const m = mobile ? '_m' : '';
  const use = async () => { if (mobile) await p.tap('.tbtn.atk'); else await p.keyboard.press('KeyJ'); };
  // 对话框里点一下（手机点画面，桌面按 J）
  const next = async () => { if (mobile) await p.tap('#game', { position: { x: 300, y: 300 } }); else await p.keyboard.press('KeyJ'); };
  // 一直翻到出现选项（或者说完）
  const toChoices = async () => { for (let i = 0; i < 40; i++) { const s = await ev(() => { const S = __game.story; return S.talk ? (S.talkChoosing(S.talk) ? 'choose' : 'talk') : 'none'; }); if (s !== 'talk') return s; await p.waitForTimeout(120); await next(); } return 'stuck'; };
  // 选第 k 项：手机点选项方块，桌面按 S 移到那一项再按 J
  const pick = async (k) => {
    await p.waitForTimeout(350); // 选项出现 0.25 秒后才接受确认
    if (mobile) {
      const r = await ev((k) => __game.story.choiceRects[k], k);
      const box = await p.$eval('#game', (c) => { const b = c.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; });
      await p.mouse.click(box[0] + ((r[0] + r[2] / 2) / 960) * box[2], box[1] + ((r[1] + r[3] / 2) / 540) * box[3]);
    } else { for (let i = 0; i < k; i++) await p.keyboard.press('KeyS'); await p.keyboard.press('KeyJ'); }
    await p.waitForTimeout(200);
  };
  const stand = (x, y) => ev(([x, y]) => { const W = __game.world; W.hero.x = x; W.hero.y = y; W.snapCam(); }, [x, y]);

  await p.goto(`http://localhost:${PORT}/index.html`); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(1200);
  // 剧情设成「只看第一次」，跳过前提卡和问候，直接测对话
  await ev(() => { const g = __game; g.startWorld(); g.story.clear(); g.save.world.greeted = true; g.world.events = []; });
  await p.waitForTimeout(200);

  // 1. 三个人都在、头上有「!」；靠近有「交谈」提示
  const npcs = await ev(async () => { const { NPCS, hasNew } = await import('./src/world_story.js'); return NPCS.map((n) => [n.id, hasNew(n.id, __game.save)]); });
  check('three NPCs, all have new lines', npcs.length === 3 && npcs.every(([, h]) => h), npcs);
  const near = {};
  for (const [id] of npcs) { const n = await ev((id) => __game.world.constructor && (async () => (await import('./src/world_story.js')).NPCS.find((x) => x.id === id))(), id); await stand(n.x, n.y + 22); await p.waitForTimeout(150); near[id] = await ev(() => __game.world.near?.kind + ':' + __game.world.near?.id); }
  check('standing near each NPC → talk prompt', Object.entries(near).every(([id, v]) => v === 'npc:' + id), near);

  // 2. 墨衡：第一段话、逐字（第一下显示全句）、说完选「看看装备」→ 角色面板
  await stand(1296, 1212); await p.waitForTimeout(150); await use(); await p.waitForTimeout(30);
  // 逐字：同步检查（页面自己的循环在跑，分两次 evaluate 时间对不准）
  const [t0, t1, t2] = await ev(() => {
    const S = __game.story, tk = S.talk; tk.t = 7;
    const a = { who: tk.lines[0][0], full: S.talkFull(tk), n: tk.lines.length, talking: __game.world.talking };
    S.press('attack'); const b = { i: tk.i, full: S.talkFull(tk) };
    S.press('attack'); return [a, b, { i: tk.i }];
  });
  // 选项刚出现时按 J 不会误选
  const guard = await ev(() => { const S = __game.story, tk = S.talk; tk.i = tk.lines.length - 1; tk.t = 999; tk.ct = 0; S.press('attack'); return !!S.talk && S.talkChoosing(tk); });
  check('choices ignore confirm for a moment after appearing', guard);
  await ev(() => { const tk = __game.story.talk; tk.i = 0; tk.t = 0; });
  check('typewriter: first press shows whole line, second goes on', t0.who === 'moheng' && !t0.full && t1.i === 0 && t1.full && t2.i === 1 && t0.talking === 'moheng', { t0, t1, t2 });
  await p.screenshot({ path: `${out}/s_talk${m}.png` });
  check('moheng: talk reaches choices', (await toChoices()) === 'choose');
  await p.screenshot({ path: `${out}/s_choice${m}.png` });
  await pick(0);
  const gear = await ev(() => ({ menu: !__game.hub.root.hidden, tab: __game.hub.tab, heard: !!__game.save.world.heard['moheng:0'] }));
  await ev(() => __game.closeMenu());
  check('moheng → 看看装备 opens hero tab, marks heard', gear.menu && gear.tab === 'hero' && gear.heard, gear);

  // 3. 阿砾：「给我指路」→ 箭头指向墓穴入口；走到附近箭头消失
  await stand(1262, 1268); await p.waitForTimeout(150); await use(); await p.waitForTimeout(80);
  await toChoices(); await pick(0);
  const guide = await ev(() => ({ g: __game.world.guide?.id }));
  await stand(640, 905); await p.waitForTimeout(200);
  const gone = await ev(() => !__game.world.guide);
  check('ali → 给我指路 points to s1, clears near it', guide.g === 's1' && gone, { guide, gone });

  // 4. 烛婆：「看看委托」→ 委托页；再说一次选「回看往事」→ 回看剧情里有守灯驿的话
  await stand(1128, 1220); await p.waitForTimeout(150); await use(); await toChoices(); await pick(0);
  const con = await ev(() => ({ menu: !__game.hub.root.hidden, tab: __game.hub.tab }));
  await ev(() => __game.closeMenu());
  await use(); await toChoices(); await pick(1);
  const log = await ev(() => ({ open: !__game.storyEl.hidden, html: __game.storyEl.querySelector('.story-body').innerHTML }));
  await ev(() => { __game.storyEl.hidden = true; });
  check('zhupo → 委托 / 回看往事 (log has 守灯驿 sections)', con.menu && con.tab === 'contracts' && log.open && /守灯驿 · 烛婆/.test(log.html) && /守灯驿 · 墨衡/.test(log.html), { con, open: log.open });
  // Esc / 闪避 在选项时 = 告辞
  await use(); await toChoices();
  if (mobile) await pick(2); else { await p.keyboard.press('Escape'); await p.waitForTimeout(150); }
  check('告辞 / Esc closes without opening anything', await ev(() => !__game.story.talk && __game.hub.root.hidden && __game.storyEl.hidden));
  const newAfter = await ev(async () => { const { NPCS, hasNew } = await import('./src/world_story.js'); return NPCS.map((n) => hasNew(n.id, __game.save)); });
  check('「!」 gone after talking to all three', newAfter.every((h) => !h), newAfter);

  // 5. 刻字：每一块都能读，读过记下来，回看剧情里出现
  const reads = await ev(async () => {
    const { INSCRIPTIONS } = await import('./src/world_story.js'); const g = __game, W = g.world, r = {};
    for (const c of INSCRIPTIONS) { W.hero.x = c.x; W.hero.y = c.y + 20; W.update(g.input, {}); r[c.id] = W.near?.kind === 'read' && W.near.id === c.id; }
    return r;
  });
  check('every inscription reachable', Object.values(reads).every(Boolean), reads);
  await stand(1092, 1196); await p.waitForTimeout(150); await use(); await p.waitForTimeout(100);
  const rd = await ev(() => ({ who: __game.story.talk?.lines[0][0], title: __game.story.talk?.title, text: __game.story.talk?.lines.map((l) => l[1]).join('|') }));
  await p.screenshot({ path: `${out}/s_read${m}.png` });
  await toChoices();
  check('read camp sign', rd.who === 'stone' && rd.title === '路牌' && /墓园/.test(rd.text) && (await ev(() => !!__game.save.world.read.camp_sign)), rd);

  // 6. 进度换台词：通关 3 关后墨衡讲刑场的事；4 关后烛婆说出影子
  const prog = await ev(async () => {
    const { talkFor, TALKS, hasNew } = await import('./src/world_story.js'); const s = __game.save;
    for (const k of ['s1', 's2', 's3']) { s.cleared[k] = true; s.world.lit[k] = true; } s.world.trial = true;
    const m3 = talkFor('moheng', s) === TALKS.moheng[3], newM = hasNew('moheng', s);
    s.cleared.s4 = true; s.world.lit.s4 = true;
    return { m3, newM, z4: talkFor('zhupo', s) === TALKS.zhupo[4], z4text: /影子/.test(talkFor('zhupo', s).map((l) => l[1]).join('')) };
  });
  check('lines change with progress (墨衡@3 刑场, 烛婆@4 影子), new ! appears', prog.m3 && prog.newM && prog.z4 && prog.z4text, prog);

  // 7. 结局尾声：看完结局回到地图 → 镜头到长明灯塔，全亮，三个人各说一句
  await ev(() => { const g = __game, s = g.save; s.cleared.s5 = true; s.world.lit.s5 = true; s.story.ending = true; g.openHub('s5'); });
  const seen = new Set(); let cap = null, shot = false;
  for (let i = 0; i < 90; i++) {
    await p.waitForTimeout(140);
    const st = await ev(() => ({ ev: __game.world.ev?.e.kind, cap: __game.world.caption?.text, talk: !!__game.story.talk }));
    if (st.ev) seen.add(st.ev);
    cap = cap ?? st.cap;
    if (st.cap && !shot) { await p.waitForTimeout(600); await p.screenshot({ path: `${out}/s_ending${m}.png` }); shot = true; }
    if (st.talk) await next();
    if (!st.ev && !st.talk && seen.size) break;
  }
  const end = await ev(async () => { const { hasNew } = await import('./src/world_story.js'); return { ended: __game.world.ended(), lit: __game.world.litCount(), heardEnd: !hasNew('ali', __game.save) }; });
  check('ending epilogue on the map', seen.has('ending') && cap === '长明灯塔，重新亮了' && end.ended && end.lit === 5 && end.heardEnd, { seen: [...seen], cap, end });
  await stand(1200, 1240); await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/s_after_ending${m}.png` });

  // 8. 老存档（没有 save.world）：已经通关的烽灯直接亮着，不补播，不再问候
  await ev(() => { const g = __game, s = g.save; delete s.world; s.cleared = { s1: true, s2: true }; delete s.story.ending; g.store.save(); });
  await p.reload(); await p.waitForTimeout(1200);
  await ev(() => __game.startWorld()); await p.waitForTimeout(500);
  const old = await ev(() => ({ events: __game.world.events.length, ev: !!__game.world.ev, talk: !!__game.story.talk, lit: __game.world.litCount(), awake: __game.world.trialAwake() }));
  check('old save migrates silently', !old.events && !old.ev && !old.talk && old.lit === 2 && old.awake, old);

  // 9. 剧情关：问候不播；烽灯照样点亮，但没有对话
  await ev(async () => { const { setSetting } = await import('./src/settings.js'); setSetting('story', 'off'); const g = __game; g.save.cleared.s3 = true; g.openHub('s3'); });
  let talked = false, sawEv = false;
  for (let i = 0; i < 40; i++) { await p.waitForTimeout(120); const st = await ev(() => ({ ev: !!__game.world.ev, talk: !!__game.story.talk })); talked ||= st.talk; sawEv ||= st.ev; if (sawEv && !st.ev) break; }
  check('story off: beacon still lights, no talk', sawEv && !talked && (await ev(() => __game.world.litCount())) === 3, { sawEv, talked });
  await ev(async () => { const { setSetting } = await import('./src/settings.js'); setSetting('story', 'first'); });

  console.log('ERR', errs.join(' | ') || 'none');
  console.log(fails.length || errs.length ? 'FAILED: ' + fails.join(', ') : 'ALL PASS');
  await b.close();
})();
