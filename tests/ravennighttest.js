// 子轮 H：夜鸦第二阶段的夜色（src/raven_night.js）确定性测试
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765;
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.goto(`http://localhost:${PORT}/index.html`); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(1500);
  const r = await p.evaluate(async () => {
    const out = {}, g = __game;
    const { Boss } = await import('./src/boss.js'); const RN = await import('./src/raven_night.js'); const { Lane } = await import('./src/combat.js');
    for (const s of ['s1', 's2', 's3', 's4']) g.save.cleared[s] = true;
    g.story.clear(); g.startStage(1, 0, false); g.story.clear();
    for (let i = 0; i < 40; i++) g.update();
    g.enemies = []; g.spawnQueue = []; g.hazards = []; g.projectiles = []; g.banner = null;
    const pl = g.player; pl.hp = pl.maxHp = 1e9; pl.x = 420; pl.y = 90; pl.invuln = 1e9;
    const bo = new Boss('nightRaven', 760, 90, g, g.stage.lv); bo.setState('idle'); bo.restT = 1e9; g.enemies.push(bo); g.boss = bo;
    const step = (n) => { for (let i = 0; i < n; i++) { bo.restT = 1e9; g.update(); g.banner = null; } };
    // 灯光记录：替换 post.addLight 数一下
    const lights = () => { const L = []; const post = { addLight: (x, y, r, a, k) => L.push({ x, y, r, a, k }) }; RN.nightLights(g, bo, post, (x, y, z = 0) => [x, y - z]); return L; };
    step(30);
    out.p0 = { night: bo.night ?? 0, raven: !!RN.nightRaven(g), amb: RN.nightAmbient('rgba(3,5,12,0.62)', 0) };
    // 进入第二阶段（半血）：夜色在 ramp 帧里升满
    bo.hp = bo.maxHp * 0.45; step(5); out.phase = bo.phase;
    step(RN.NIGHT.ramp + 10); bo.setState('idle'); bo.tele = false; bo.revealT = 0; bo.lastHp = bo.hp;
    out.p1 = { night: +bo.night.toFixed(2), raven: !!RN.nightRaven(g), amb: RN.nightAmbient('rgba(3,5,12,0.62)', bo.night) };
    // 不出招、没挨打：自己不发光
    out.darkLights = lights().length;
    // 出招预警：身上一盏 + 弓上一盏洋红的光
    bo.tele = true; const tl = lights(); out.teleLights = tl.length; out.teleMagic = tl.filter((l) => l.k === 'magic').length; bo.tele = false;
    // 被打中：现身 hitReveal 帧
    g.applyHit(pl, bo, { dmg: 1, kb: 0, stun: 0, stop: 0 }, 1); step(1); bo.tele = false; bo.setState('idle'); bo.tele = false;
    out.hitReveal = bo.revealT > 0 && lights().length === 1;
    step(RN.NIGHT.hitReveal + 2); bo.tele = false; out.hitGone = lights().length === 0;
    // 分身期间：三处的光完全一样
    bo.split = { spots: [{ x: 900, y: 40 }, { x: 980, y: 140 }], t: 20 }; bo.tele = true;
    const sl = lights(); const rs = (x) => sl.filter((l) => Math.abs(l.x - x - bo.facing * bo.h * RN.NIGHT.glint.x) < 1 || Math.abs(l.x - x) < 1).map((l) => [l.r, +l.a.toFixed(3), l.k].join());
    out.splitParity = JSON.stringify(rs(bo.x).sort()) === JSON.stringify(rs(900).sort()) && JSON.stringify(rs(900).sort()) === JSON.stringify(rs(980).sort()) && rs(bo.x).length === 2;
    bo.split = null; bo.tele = false;
    // 地面光带：夜里沿光带补光
    g.hazards.push(new Lane({ x: bo.x, y: 90, facing: -1, life: 60, half: 14 })); out.laneLights = lights().length;
    g.hazards = [];
    // 夜鸦死了（或回到第一阶段）：夜色退去
    bo.hp = 0; bo.setState('dying'); step(RN.NIGHT.ramp + 5); out.after = +(bo.night ?? 0).toFixed(2); out.ravenAfter = !!RN.nightRaven(g);
    // 素材层（fx_boss_raven，H-1）：第 2 关载入 → 夜幕画得出来、夜里飘黑羽；回第 1 关释放 → 不画、不出错
    const { FX_ART } = await import('./src/fx_art.js');
    for (let i = 0; i < 80 && !FX_ART.raven.ready; i++) await new Promise((r) => setTimeout(r, 100));
    out.packLoaded = FX_ART.raven.ready && !!FX_ART.raven.items.night_veil && !!FX_ART.raven.items.feather_drift?.frames;
    const c = document.createElement('canvas').getContext('2d'); bo.night = 1; bo.alive !== undefined;
    out.veilDraws = RN.drawVeil(c, bo, 100, 100) === true;
    bo.hp = bo.maxHp * 0.4; bo.setState('idle'); bo.night = 1; bo.drift = []; for (let i = 0; i < 60; i++) { RN.updateNight(bo, g); g.ticks++; } out.drift = bo.drift.length;
    out.driftDraws = RN.drawDrift(c, bo, 0) === true;
    bo.night = 0;
    // 渲染一帧不出错（素材包载好、夜色满）
    bo.hp = bo.maxHp * 0.4; bo.setState('idle'); bo.night = 1; g.render(); out.render = true;
    // 回第 1 关：夜鸦素材包释放
    g.story.clear(); g.startStage(0, 0, false); g.story.clear(); out.released = !FX_ART.raven.ready;
    const bo2 = { night: 1, drift: [{ x: 0, y: 0, t: 5, phase: 0, flip: 1 }] }; out.veilNoPack = RN.drawVeil(c, bo2, 100, 100) === false && RN.drawDrift(c, bo2, 0) === false;
    return out;
  });
  console.log(JSON.stringify(r));
  ok(r.p0.night === 0 && !r.p0.raven && r.p0.amb === 'rgba(3,5,12,0.62)', '第一阶段：没有夜色，环境暗度不变');
  ok(r.phase === 1 && r.p1.night === 1 && r.p1.raven && /0\.880\)$/.test(r.p1.amb), '半血进第二阶段：夜色升满，环境暗度到 0.88 ' + r.p1.amb);
  ok(r.darkLights === 0, '夜里不出招、没挨打：夜鸦自己不发光');
  ok(r.teleLights === 2 && r.teleMagic === 1, '出招预警：身上的光 + 弓上一盏洋红的光');
  ok(r.hitReveal && r.hitGone, '被打中现身一会儿，过后又隐入夜色');
  ok(r.splitParity, '鸦影分身：真身和两个分身的光完全一样（不泄露真身）');
  ok(r.laneLights >= 3, `地面光带夜里沿线补光（${r.laneLights} 盏）`);
  ok(r.after === 0 && !r.ravenAfter, '夜鸦死了：夜色退去');
  ok(r.packLoaded && r.veilDraws && r.drift > 0 && r.driftDraws && r.render, `夜鸦素材包载入：夜幕画出来、夜里飘黑羽（${r.drift} 片），渲染不出错`);
  ok(r.released && r.veilNoPack, '回第 1 关：夜鸦素材包释放，夜幕 / 黑羽不画、不出错');
  ok(!errs.length, 'PAGE ERRORS ' + (errs.join(' | ') || 'none'));
  console.log(bad ? `RAVENNIGHTTEST FAIL ${bad}` : 'RAVENNIGHTTEST ok');
  await b.close();
})();
