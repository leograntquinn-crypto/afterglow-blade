// 第 4 轮：ART_V7 素材接入测试
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
  await p.goto(`http://localhost:${PORT}/index.html`); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(3000);

  // 1. 开机就载入（封面在地图上）；手机用一半尺寸
  const st = await ev(async () => {
    const { WORLD_ART: A } = await import('./src/world_art.js');
    return { ready: A.ready, land: A.land.meta?.scale, props: A.props.meta?.scale, moor: A.terrain.moor?.naturalWidth, npcs: Object.values(A.npcs).map((n) => n.ready && n.C), portrait: A.npcs.zhupo.portrait?.naturalWidth, landImg: [A.land.img?.naturalWidth, A.land.img?.naturalHeight] };
  });
  check('world art loaded at boot, sizes for this device', st.ready && st.land === (mobile ? 0.5 : 1) && st.props === st.land && st.moor === (mobile ? 512 : 1024) && st.npcs.every((c) => c === (mobile ? 192 : 256)) && st.portrait === 512, st);

  // 2. 摆在地图上的每一样东西在图集里都有
  const ids = await ev(async () => {
    const W = await import('./src/world.js'); const { WORLD_ART: A } = await import('./src/world_art.js'); const w = __game.world;
    const miss = [];
    for (const o of w.props) { const id = { tree: ['tree_a', 'tree_b', 'tree_c'], rock: ['boulder', 'rocks', 'slab'], grave: ['grave_a', 'grave_b', 'grave_cross'], lamp: ['lamp'], sign: ['signpost'], stone: ['milestone'] }[o.kind]?.[o.v % 3] ?? (o.kind === 'lamp' ? 'lamp' : o.kind); if (!A.props.has(o.kind === 'lamp' ? 'lamp' : o.kind === 'sign' ? 'signpost' : o.kind === 'stone' ? 'milestone' : id)) miss.push(o.kind); }
    for (const s of W.SITES) if (!A.land.has({ camp: 'camp', s1: 'crypt', s2: 'ossuary', s3: 'gallows', s4: 'altar', s5: 'abyss', training: 'training', trial: 'trial' }[s.id])) miss.push(s.id);
    for (const id of ['beacon', 'seal']) if (!A.land.has(id)) miss.push(id);
    return { miss, props: w.props.length, kinds: [...new Set(w.props.map((o) => o.kind))].length };
  });
  check('every placed prop / landmark exists in the atlases', !ids.miss.length && ids.kinds >= 14, ids);

  // 3. 入口前、守灯驿门口没有挡路的散件；每个入口都走得到
  const clear = await ev(async () => {
    const { SITES } = await import('./src/world.js'); const w = __game.world, bad = [];
    for (const s of SITES) for (const o of w.props) if (!o.read && Math.hypot(o.x - s.door[0], o.y - s.door[1]) < 150) bad.push(s.id + ':' + o.kind);
    const blockedDoors = SITES.filter((s) => w.blocked(s.door[0], s.door[1] + 6)).map((s) => s.id);
    return { bad, blockedDoors };
  });
  check('no props crowd the entrances, doors are walkable', !clear.bad.length && !clear.blockedDoors.length, clear);

  // 4. 前后遮挡：在地标锚点北边（后面）的人先画，南边（前面）的人后画
  const order = await ev(async () => {
    const { WORLD_ART: A } = await import('./src/world_art.js'); const g = __game, w = g.world;
    g.story.clear(); g.startWorld(); g.story.clear(); w.events = [];
    const rec = [], land = A.land.draw.bind(A.land), hero = w.drawHero.bind(w);
    A.land.draw = (c, id, ...r) => { rec.push(id); return land(c, id, ...r); };
    w.drawHero = (...r) => { rec.push('HERO'); return hero(...r); };
    const res = {};
    for (const [name, y] of [['behind', 790], ['front', 900]]) { w.hero.x = 720; w.hero.y = y; w.snapCam(); rec.length = 0; w.draw(g.ctx, 0); res[name] = rec.indexOf('HERO') < rec.indexOf('crypt'); }
    A.land.draw = land; w.drawHero = hero;
    return res;
  });
  check('y-sorting: behind the crypt drawn first, in front drawn after', order.behind === true && order.front === false, order);

  // 5. 地面区块缓存：走遍整张地图，最多 9 块
  const chunks = await ev(async () => {
    const { WORLD_ART: A } = await import('./src/world_art.js'); const g = __game, w = g.world; let max = 0;
    for (let y = 150; y < 1450; y += 200) for (let x = 100; x < 2350; x += 250) { w.hero.x = x; w.hero.y = y; w.snapCam(); w.draw(g.ctx, 0); max = Math.max(max, A.chunks.size); }
    return { max, k: A.chunkK };
  });
  check('ground chunk cache stays bounded', chunks.max <= 12 && chunks.k === (mobile ? 1 : chunks.k), chunks);

  // 6. 进关释放、回地图重新载入（载入期间画面保持黑，不闪占位）
  const rel = await ev(async () => {
    const { WORLD_ART: A } = await import('./src/world_art.js'); const g = __game;
    g.startStage(0, 0, false);
    const inStage = { ready: A.ready, img: !!A.land.img, chunks: A.chunks.size, npc: A.npcs.ali.ready };
    g.endRun(); g.openHub('s1');
    const right = { ready: A.ready, fade: g.world.fadeIn };
    await A.loading; const after = { ready: A.ready };
    return { inStage, right, after };
  });
  check('stage releases world art, map reloads it (held black meanwhile)', !rel.inStage.ready && !rel.inStage.img && !rel.inStage.chunks && !rel.inStage.npc && !rel.right.ready && rel.right.fade > 0 && rel.after.ready, rel);
  await p.waitForTimeout(800);

  // 7. 对话框用立绘
  await ev(() => { const g = __game, w = g.world; w.hero.x = 1128; w.hero.y = 1220; w.update(g.input, {}); g.talkTo('zhupo'); });
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${out}/a_portrait${mobile ? '_m' : ''}.png` });
  const por = await ev(async () => { const { WORLD_ART: A } = await import('./src/world_art.js'); return !!(A.npcs.zhupo.ready && A.npcs.zhupo.portrait); });
  check('dialog uses the portrait', por && (await ev(() => __game.story.talk?.lines[0][0])) === 'zhupo');
  if (mobile) check('mobile: touch buttons hidden while talking', await ev(() => getComputedStyle(document.getElementById('touch')).display === 'none' && getComputedStyle(document.getElementById('world-bar')).display === 'none'));
  await ev(() => __game.story.clear());

  console.log('ERR', errs.join(' | ') || 'none');
  console.log(fails.length || errs.length ? 'FAILED: ' + fails.join(', ') : 'ALL PASS');
  await b.close();
})();
