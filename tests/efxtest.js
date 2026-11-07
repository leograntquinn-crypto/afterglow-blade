// 子轮 G：敌人特效第 1 批（fx_enemy_v1_common）确定性测试
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765;
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.goto(`http://localhost:${PORT}/index.html`); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(1500);
  const r = await p.evaluate(async () => {
    const out = {}, g = __game;
    const { FX_ART } = await import('./src/fx_art.js');
    for (let i = 0; i < 80 && !(FX_ART.enemy.ready && FX_ART.enemyTex.ready); i++) await new Promise((r) => setTimeout(r, 100));
    const EF = await import('./src/enemy_fx.js'); const { ENEMY_FX, ENEMY_TYPE_FX } = await import('./src/fx_data.js');
    const { Enemy } = await import('./src/enemy.js'); const { Hazard, Projectile } = await import('./src/combat.js');
    const { FEINT } = await import('./src/ai_data.js'); const { GUARD_MAX, onAffixHit, updateAffixes } = await import('./src/affix.js');
    const { Trap } = await import('./src/enemies_ext.js');
    // 1. 两套图集载入、id / 帧数齐全
    const fbs = { aura_threat: 8, aura_feint: 8, aura_guard: 8, arrow_break: 6, warn_ring: 8, warn_ring_fake: 8, warn_flash: 6, meteor: 6, shield_arc: 4, blink_flash: 6, volatile_core: 6, elite_crown: 8, ward_shell: 8, ward_break: 8, trap_rune: 8, trap_draw: 6 };
    out.ready = FX_ART.enemy.ready && FX_ART.enemyTex.ready;
    out.fbOk = Object.entries(fbs).every(([id, n]) => EF && FX_ART.enemy.items[id]?.frames.length === n);
    out.loopOk = ['aura_threat', 'aura_feint', 'aura_guard', 'warn_ring', 'warn_ring_fake', 'meteor', 'volatile_core', 'elite_crown', 'ward_shell', 'trap_rune'].every((id) => FX_ART.enemy.items[id].loop) && !FX_ART.enemy.items.ward_break.loop && FX_ART.enemy.items.shield_arc.fps === 0;
    out.texOk = ['aim_line', 'aim_mark', 'arrow', 'arrow_trail', 'threat_back', 'warn_fill', 'lane_band'].every((id) => FX_ART.enemyTex.items[id]);
    out.arrowNormal = FX_ART.enemyTex.items.arrow.add === false && FX_ART.enemyTex.items.aim_line.add === true;
    // 画到一张空画布上，统计画出来的颜色
    const cv = document.createElement('canvas'); cv.width = 600; cv.height = 400; const cx = cv.getContext('2d');
    const stat = () => { const d = cx.getImageData(0, 0, 600, 400).data; let n = 0, R = 0, G = 0, B = 0, A = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 8) { n++; R += d[i]; G += d[i + 1]; B += d[i + 2]; A += d[i + 3]; } return { n, r: R / (n || 1), g: G / (n || 1), b: B / (n || 1), a: A }; };
    const clr = () => { cx.setTransform(1, 0, 0, 1, 0, 0); cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over'; cx.clearRect(0, 0, 600, 400); };
    const dummy = { h: 100, w: 40, facing: 1, id: 1, x: 0, y: 0, z: 0 };
    // 2. 三种状态光：素材画得出来、染色对（红 / 琥珀 / 冷蓝），而且假动作比真预警「断续」（同一时刻画出来的光少得多）
    const aura = (k) => { clr(); const drew = EF.drawEnemyAura(cx, dummy, 300, 350, k, 10); return { drew, ...stat() }; };
    const th = aura('threat'), fe = aura('feint'), gu = aura('guard');
    out.auraDrew = th.drew && fe.drew && gu.drew;
    out.threatRed = th.r > 2 * th.g && th.r > 2 * th.b;
    out.feintAmber = fe.r > fe.b * 2 && fe.g > fe.b * 1.5 && fe.g / fe.r > 0.5;
    out.guardBlue = gu.b > gu.r;
    // 断续：8 帧里亮度起伏，假动作的帧间起伏（最大 / 最小）比真预警大
    const sweep = (k) => { const v = []; for (let t = 0; t < 32; t += 4) { clr(); EF.drawEnemyAura(cx, dummy, 300, 350, k, t); v.push(stat().a); } return Math.max(...v) / Math.max(1, Math.min(...v)); };
    out.flicker = [sweep('threat'), sweep('feint')].map((x) => +x.toFixed(2));
    // 3. 敌人在各状态下选对状态光（Enemy.draw 记下 auraKey）
    g.story.clear(); g.startStage(2, 0, false); g.story.clear();
    for (let i = 0; i < 30; i++) g.update();
    g.enemies = []; g.spawnQueue = []; g.hazards = []; g.projectiles = []; g.attackers.clear();
    const pl = g.player; pl.hp = pl.maxHp = 1e6; pl.x = 300; pl.y = 90;
    const mk = (t, o = {}) => { const e = new Enemy(t, 500, 90, g, { lv: 3, ...o }); e.setState('idle'); e.st = 99; e.attackCd = 9999; e.facing = -1; g.enemies.push(e); return e; };
    const key = (e) => { clr(); e.draw(cx, 200, g.ticks); return e.auraKey; };
    const s = {};
    let e = mk('grunt'); s.none = key(e);
    e.startWindup(g, { ...e.T.atk }); e.windup = 60; e.st = 10; s.windup = key(e);
    e.startWindup(g, { ...e.T.atk, feint: true }); e.windup = 60; e.st = Math.round(60 * FEINT.cancelAt) - 1; s.feint = key(e);
    e = mk('brute'); e.guardT = 30; s.guard = key(e); e.guardT = 0; s.armor = key(e);
    e = mk('archer'); e.blinkFlash = 10; s.blink = key(e); e.blinkFlash = 0; e.enraged = true; s.frenzy = key(e);
    e = mk('grunt', { elite: true }); s.elite = key(e);
    out.auraKeys = s;
    // 4. 坚盾按已挡次数选帧
    e = mk('grunt', { affixes: ['shield'] }); const frames = [];
    for (let gd = GUARD_MAX; gd >= 1; gd--) { e.guard = gd; key(e); frames.push(e.shieldFrame); }
    out.shieldFrames = frames;
    // 5. 地面预警圈：普通的一直是真圈；屠夫佯攻露出破绽后换成假圈；真假画出来颜色分得开
    g.hazards = [];
    const br = mk('brute'); br.startWindup(g, { ...br.T.atk, slam: true, feint: true }); const hz = g.hazards[g.hazards.length - 1];
    const br2 = mk('brute'); br2.startWindup(g, { ...br2.T.atk, slam: true, feint: false }); const hz2 = g.hazards[g.hazards.length - 1];
    const seen = { fakeEarly: false, fakeLate: false, realFake: false };
    const cut = Math.round(br.windup * FEINT.cancelAt) - FEINT.reveal;
    for (let t = 1; t < cut + 4; t++) { br.st = t; br2.st = t; hz.t = hz2.t = Math.min(t, hz.delay - 1); clr(); hz.drawFloor(cx, 0); hz2.drawFloor(cx, 0); if (t < cut && hz.ringFake) seen.fakeEarly = true; if (t >= cut && hz.ringFake) seen.fakeLate = true; if (hz2.ringFake) seen.realFake = true; }
    out.ring = seen;
    clr(); out.warnReal = EF.drawWarn(cx, 300, 200, 120, 45, 0.6, 10, false, 1) && stat(); clr(); out.warnFake = EF.drawWarn(cx, 300, 200, 120, 45, 0.6, 10, true, 1) && stat();
    clr(); out.flash = EF.drawWarnFlash(cx, 300, 200, 120, 45, 3, '#ff8a5a') && stat().n > 1000;
    // 6. 迅影：离开和出现各一次撕裂光缝
    const count = (id) => g.fx.live.filter((q) => q.kind === 'flip' && q.fb?.id === id).length;
    e = mk('grunt', { affixes: ['blink'] }); e.blinkCd = 0; const b0 = count('blink_flash');
    for (let i = 0; i < 7; i++) onAffixHit(e, g); g.hitstop = 0; updateAffixes(e, g);
    out.blinkFlips = count('blink_flash') - b0;
    // 7. 咒盾：画外壳，破碎时播 ward_break
    e = mk('grunt'); e.ward = { hp: 10, max: 10, t: 600 }; clr(); e.draw(cx, 200, g.ticks); const wardPix = stat().n;
    const w0 = count('ward_break'); e.takeHit({ dmg: 999, kb: 1 }, 1, 999); out.wardBreak = count('ward_break') - w0; out.wardPix = wardPix;
    // 8. 陷阱符：先画出来再循环
    const tr = new Trap({ x: 300, y: 90, owner: null }); const seq = [];
    for (const t of [0, 10, 29, 31, 60]) { tr.t = t; clr(); tr.drawFloor(cx, 0); seq.push(EF.drawTrapRune.last); }
    out.trapSeq = seq;
    // 9. 箭：素材画；打中主角播 arrow_break
    clr(); cx.translate(300, 200); out.arrowDrew = EF.drawArrow(cx); cx.setTransform(1, 0, 0, 1, 0, 0); const as = stat(); out.arrowPix = as.n;
    const a0 = count('arrow_break'); pl.invuln = 0; pl.setState('idle');
    const arw = new Projectile({ x: pl.x + 30, y: pl.y, z: 52, vx: -7.5, life: 60, team: 'enemy', kind: 'arrow', hit: { box: { w: 20, d: 18, z0: -60, z1: 60 }, dmg: 1, kb: 0 } });
    g.projectiles = [arw]; for (let i = 0; i < 10 && !arw.dead; i++) arw.update(g);
    out.arrowBreak = count('arrow_break') - a0;
    // 10. 瞄准线、背后来袭、路线光带
    clr(); out.aim = EF.drawAimLine(cx, 50, 200, 550, 180, 0.8, 10) && stat().n;
    clr(); out.back = EF.drawThreatBack(cx, 300, 200, -1, 1) && stat().n;
    clr(); out.lane = EF.drawLaneBand(cx, 550, 200, -1, 500, 26, 10, '#ff4d5e', 0.5) && stat().n;
    clr(); out.meteor = EF.drawMeteor(cx, 300, 300, 100, 5, '#ff6a3d') && stat().n;
    // 11. 第 2 批（types）还没到：查表查得到，但不画，也不出错
    const spec2 = ['grunt_glint', 'grunt_slash', 'bone_chips', 'bone_collapse', 'brute_heat', 'brute_cleave', 'metal_spark', 'armor_fall', 'shadow_fade', 'lantern_flare', 'rune_shatter', 'candle_smoke', 'ember_crack', 'ember_pop', 'ash_fall'];
    const ids = Object.values(ENEMY_TYPE_FX).flatMap((t) => Object.values(t).map((x) => x.fb));
    out.type2Ids = ids.every((id) => spec2.includes(id)) && ['grunt', 'brute', 'archer', 'priest', 'wing'].every((k) => ENEMY_TYPE_FX[k]);
    let drew2 = 0; for (const rig of ['grunt', 'brute', 'archer', 'priest', 'wing']) { const x = mk(rig); for (const k of ['tele', 'attack', 'hit', 'death']) if (EF.typeFx(g, x, k)) drew2++; }
    out.type2Drew = drew2;
    // 12. 素材没载好：退回代码画的（预警照样看得到），不出错
    FX_ART.enemy.ready = false; FX_ART.enemyTex.ready = false;
    e = mk('grunt'); e.startWindup(g, { ...e.T.atk }); e.windup = 60; e.st = 10; clr(); e.draw(cx, 200, g.ticks); out.fallbackAura = e.auraKey === 'threat' && !EF.drawEnemyAura(cx, e, 0, 0, 'threat', 1);
    clr(); cx.translate(300, 200); const arrNone = !EF.drawArrow(cx); cx.setTransform(1, 0, 0, 1, 0, 0); out.noStandIn = arrNone && stat().n === 0 && !EF.drawAimLine(cx, 0, 0, 100, 0, 1, 1) && !EF.drawLaneBand(cx, 0, 0, 1, 100, 20, 1, '#fff', 1) && stat().n === 0;
    clr(); hz2.t = 20; hz2.drawFloor(cx, 0); out.fallbackRing = stat().n > 500 && !EF.drawWarn(cx, 0, 0, 1, 1, 0.5, 1, false, 1);
    FX_ART.enemy.ready = true; FX_ART.enemyTex.ready = true;
    return out;
  });
  console.log(JSON.stringify(r));
  ok(r.ready && r.fbOk && r.texOk && r.loopOk, '两套图集载入，16 组序列帧 / 7 张贴图的帧数、循环、shield_arc 不按时间播');
  ok(r.arrowNormal, '箭是带颜色的实物（normal），瞄准线是发光（add）');
  ok(r.auraDrew && r.threatRed && r.feintAmber && r.guardBlue, '状态光：出手红、佯攻琥珀、格挡冷蓝');
  ok(r.flicker[1] > r.flicker[0] * 1.3, `佯攻的光断断续续（帧间亮度起伏 ${r.flicker[1]}）明显大于出手预警（${r.flicker[0]}）`);
  const k = r.auraKeys;
  ok(k.none === null && k.windup === 'threat' && k.feint === 'feint' && k.guard === 'guard' && k.armor === 'armor' && k.blink === 'blink' && k.frenzy === 'frenzy' && k.elite === 'elite', '各状态选对状态光 ' + JSON.stringify(k));
  ok(JSON.stringify(r.shieldFrames) === '[0,1,2,3]', '坚盾按已挡次数选帧 ' + JSON.stringify(r.shieldFrames));
  ok(!r.ring.fakeEarly && r.ring.fakeLate && !r.ring.realFake, '地面预警：佯攻露出破绽前是真圈、之后换假圈；真砸一直是真圈 ' + JSON.stringify(r.ring));
  ok(r.warnReal && r.warnFake && r.warnReal.r > 2 * r.warnReal.g && r.warnFake.g / r.warnFake.r > 0.5 && r.warnFake.a < r.warnReal.a * 0.7, '真圈红、假圈琥珀且明显更「不完整」');
  ok(r.flash, '爆发闪光 warn_flash');
  ok(r.blinkFlips === 2, `迅影：离开 + 出现各一次撕裂光缝（${r.blinkFlips}）`);
  ok(r.wardPix > 500 && r.wardBreak === 1, `咒盾外壳画出来（${r.wardPix} 像素），破碎播 ward_break（${r.wardBreak}）`);
  ok(JSON.stringify(r.trapSeq) === '["trap_draw","trap_draw","trap_draw","trap_rune","trap_rune"]', '陷阱符先画出来再循环 ' + JSON.stringify(r.trapSeq));
  ok(r.arrowDrew && r.arrowPix > 200 && r.arrowBreak === 1, `箭的素材（${r.arrowPix} 像素），打中播 arrow_break（${r.arrowBreak}）`);
  ok(r.aim > 500 && r.back > 300 && r.lane > 3000 && r.meteor > 300, `瞄准线 ${r.aim} / 背后来袭 ${r.back} / 路线光带 ${r.lane} / 陨落 ${r.meteor} 像素`);
  ok(r.type2Ids && r.type2Drew === 0, '第 2 批：五种敌人都有表、id 都在规格里；素材没到时一个都不画');
  ok(r.fallbackAura && r.noStandIn, '素材没载好：状态光、箭、瞄准线、光带都不画（第 14 项：不用代码画的替身），不出错');
  ok(r.fallbackRing, '素材没载好：地面红圈退回原来的手绘环贴图（不是代码画的形状）');
  ok(!errs.length, 'PAGE ERRORS ' + (errs.join(' | ') || 'none'));
  console.log(bad ? `EFXTEST FAIL ${bad}` : 'EFXTEST ok');
  await b.close();
})();
