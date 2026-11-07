// 子轮 G 第 2 批（fx_enemy_v1_types）确定性测试 + fx.flip 透明度 / 贴地参数的回归
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765;
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.goto(`http://localhost:${PORT}/index.html`); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(1500);
  const r = await p.evaluate(async () => {
    const out = {}, g = __game;
    const FA = await import('./src/fx_art.js'); const EF = await import('./src/enemy_fx.js'); const { ENEMY_FX } = await import('./src/fx_data.js');
    const { Enemy } = await import('./src/enemy.js'); const { FEINT } = await import('./src/ai_data.js');
    g.story.clear(); g.startStage(1, 0, false); g.story.clear(); // 第 2 关：腐骨兵、弓手、屠夫、烬翼
    const T = FA.FX_ART.enemyType;
    for (let i = 0; i < 80 && ['grunt', 'archer', 'brute', 'wing'].some((k) => !T[k].ready && !T[k].loading === false); i++) await new Promise((r) => setTimeout(r, 100));
    for (let i = 0; i < 80 && ['grunt', 'archer', 'brute', 'wing'].some((k) => !T[k].ready); i++) await new Promise((r) => setTimeout(r, 100));
    // 1. 按关卡载入：第 2 关有的四种载入、司祭没载；回地图全部释放
    out.stage2 = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v.ready || !!v.loading]));
    FA.prepareEnemyFx(['grunt', 'brute', 'archer', 'priest', 'wing']);
    for (let i = 0; i < 80 && Object.values(T).some((v) => !v.ready); i++) await new Promise((r) => setTimeout(r, 100));
    const spec = { grunt: { grunt_glint: 4, grunt_slash: 6, bone_chips: 6, bone_collapse: 8 }, brute: { brute_heat: 6, brute_cleave: 8, metal_spark: 6, armor_fall: 8 }, archer: { shadow_fade: 8 }, priest: { lantern_flare: 6, rune_shatter: 6, candle_smoke: 8 }, wing: { ember_crack: 6, ember_pop: 6, ash_fall: 8 } };
    out.frames = Object.entries(spec).every(([k, ids]) => Object.entries(ids).every(([id, n]) => T[k].items[id]?.frames.length === n));
    out.loops = T.brute.items.brute_heat.loop && T.wing.items.ember_crack.loop && !T.grunt.items.bone_collapse.loop;
    out.blend = !T.grunt.items.bone_chips.add && !T.archer.items.shadow_fade.add && T.grunt.items.grunt_slash.add;
    out.trailTex = !!FA.FX_ART.enemyTex.items.ember_trail;
    for (let i = 0; i < 30; i++) g.update();
    g.enemies = []; g.spawnQueue = []; g.hazards = []; g.projectiles = []; g.attackers.clear();
    const pl = g.player; pl.hp = pl.maxHp = 1e9; pl.x = 500; pl.y = 90; pl.invuln = 1e9;
    const live = (k) => g.fx.live.filter((q) => q.kind === 'flip' && q.fb?.id === k).length;
    const kinds = (k) => g.fx.live.filter((q) => q.kind === k).length;
    const mk = (t, o = {}) => { g.fx.live.length = 0; const e = new Enemy(t, 560, 90, g, { lv: 3, ...o }); e.setState('idle'); e.st = 99; e.attackCd = 9999; e.facing = -1; e.T = { ...e.T, brain: null }; g.enemies = [e]; return e; };
    const step = (n) => { for (let i = 0; i < n; i++) { g.hitstop = 0; g.update(); pl.x = 500; } };
    const cv = document.createElement('canvas'); cv.width = 960; cv.height = 540; const cx = cv.getContext('2d');
    // 2. 预警
    let e = mk('grunt'); e.startWindup(g, { ...e.T.atk, windup: 99 }); out.gruntTele = live('grunt_glint');
    e = mk('priest'); e.startWindup(g, { ...e.T.atk, windup: 99 }); out.priestTele = live('lantern_flare');
    e = mk('brute'); e.startWindup(g, { ...e.T.atk, slam: false, windup: 60 }); e.st = 10; e.draw(cx, 0, g.ticks); out.bruteHeat = e.teleColor;
    e.startWindup(g, { ...e.T.atk, slam: false, feint: true, windup: 60 }); e.st = Math.round(60 * FEINT.cancelAt) - 1; e.teleColor = null; e.draw(cx, 0, g.ticks); out.bruteHeatFeint = e.teleColor;
    e.setState('idle'); e.teleColor = null; e.draw(cx, 0, g.ticks); out.bruteHeatIdle = e.teleColor; // 不在预警就不画
    e = mk('wing', { }); e.z = 100; e.startWindup(g, { ...e.T.atk, windup: 60 }); e.st = 10; e.draw(cx, 0, g.ticks); out.wingCrack = e.teleColor;
    // 3. 出招：腐骨兵用自己的刀光，不再出通用新月；屠夫重砸出斧光
    e = mk('grunt'); e.startWindup(g, { ...e.T.atk, windup: 1 }); step(8); out.gruntSlash = [live('grunt_slash'), kinds('arc')];
    e = mk('brute'); e.startWindup(g, { ...e.T.atk, slam: true, windup: 1 }); step(3); out.bruteCleave = live('brute_cleave');
    // 烬翼俯冲拖尾（假冲琥珀）
    e = mk('wing'); e.z = 80; e.atk = { ...e.T.atk }; e.dive = { vx: -6, vy: 0, vz: -3 };
    out.trail = EF.drawEmberTrail(cx, e, 300, 300, false) && EF.drawEmberTrail(cx, e, 300, 300, true);
    // 4. 命中：各自的命中，代替通用碎片；弓手没有自己的命中 → 照旧通用碎片
    const hitOf = (t, id) => { const x = mk(t); if (t === 'wing') x.z = 60; g.applyHit(pl, x, { dmg: 1, kb: 0, stun: 30, stop: 0 }, 1); return [live(id), kinds('chip')]; };
    out.hits = { grunt: hitOf('grunt', 'bone_chips'), brute: hitOf('brute', 'metal_spark'), priest: hitOf('priest', 'rune_shatter'), wing: hitOf('wing', 'ember_pop'), archer: hitOf('archer', 'none') };
    // 5. 死亡：尸体落地播死亡特效，不再冒通用的消散光点、不撒击杀碎片
    const dieOf = (t, id) => { const x = mk(t); g.applyHit(pl, x, { dmg: 1e9, kb: 0, launch: 0, stun: 1, stop: 0 }, 1); const chipsAtKill = kinds('chip'); step(40); return [live(id), !!x.deathFx, chipsAtKill, g.fx.live.filter((q) => q.kind === 'ember' && q.color === '#b9a6ff').length]; };
    out.deaths = { grunt: dieOf('grunt', 'bone_collapse'), brute: dieOf('brute', 'armor_fall'), archer: dieOf('archer', 'shadow_fade'), priest: dieOf('priest', 'candle_smoke'), wing: dieOf('wing', 'ash_fall') };
    // 骨堆停在最后一帧再淡出（不闪）
    const q = g.fx.flip('bone_collapse', 0, 0, 0, { size: 0.3, hold: 50, holdFade: true });
    out.holdFade = q.holdFade === true;
    // 6. fx.flip 的透明度 / 贴地参数（v46 的回归：这一行被注释掉过）
    const f = g.fx.flip('hit_light', 0, 0, 0, { alpha: 0.37, ground: true });
    out.flipParams = f && f.alpha === 0.37 && f.ground === true && g.fx.flip('hit_light', 0, 0, 0, {}).alpha === 1;
    // 7. 这一种没载好（换关释放了）：用回通用的（新月刀光、碎片、消散光点），不出错
    FA.prepareEnemyFx([]);
    e = mk('grunt'); e.startWindup(g, { ...e.T.atk, windup: 1 }); step(8); out.fallbackArc = [live('grunt_slash'), kinds('arc')];
    const x2 = mk('grunt'); g.applyHit(pl, x2, { dmg: 1, kb: 0, stun: 30, stop: 0 }, 1); out.fallbackChips = kinds('chip');
    return out;
  });
  console.log(JSON.stringify(r));
  const s2 = r.stage2;
  ok(s2.grunt && s2.archer && s2.brute && s2.wing && !s2.priest, '第 2 关只载入关里有的四种（司祭没载） ' + JSON.stringify(s2));
  ok(r.frames && r.loops && r.blend && r.trailTex, '五套图集：15 组帧数、循环、混合方式对；ember_trail 在 fx_enemy_tex');
  ok(r.gruntTele === 1 && r.priestTele === 1, '预警：腐骨兵骨刀锈光、司祭提灯（一次性）');
  ok(r.bruteHeat === '#ff5a2a' && r.bruteHeatFeint === '#ffb347' && r.bruteHeatIdle == null && r.wingCrack === '#ff3a2e', `预警：屠夫斧刃烧红（佯攻露馅变琥珀、不在预警不画）、烬翼裂纹 ${r.bruteHeat}/${r.bruteHeatFeint}/${r.wingCrack}`);
  ok(r.gruntSlash[0] === 1 && r.gruntSlash[1] === 0 && r.bruteCleave === 1, `出招：腐骨兵自己的刀光、不再出通用新月 ${JSON.stringify(r.gruntSlash)}；屠夫斧光 ${r.bruteCleave}`);
  ok(r.trail, '烬翼俯冲拖尾（真 / 假）');
  const h = r.hits;
  ok(['grunt', 'brute', 'priest', 'wing'].every((k) => h[k][0] === 1 && h[k][1] === 0) && h.archer[1] > 0, '命中：四种用自己的（骨屑 / 金属火花 / 符文碎裂 / 余烬爆开）、不出通用碎片；弓手照旧通用碎片 ' + JSON.stringify(h));
  const d = r.deaths;
  // 击杀那一下的碎片：有自己命中特效的四种是 0；弓手没有自己的命中，只剩击杀那一下的命中碎片（12），不再多撒 18 片击杀碎片
  ok(Object.entries(d).every(([k, x]) => x[0] >= 1 && x[1] && x[3] === 0 && (k === 'archer' ? x[2] === 12 : x[2] === 0)), '死亡：尸体落地播各自的死亡特效，没有消散光点和击杀碎片 ' + JSON.stringify(d));
  ok(r.holdFade, '骨堆 / 甲片停在最后一帧淡出');
  ok(r.flipParams, 'fx.flip 的 alpha / ground 参数生效（v46 回归）');
  ok(r.fallbackArc[0] === 0 && r.fallbackArc[1] === 1 && r.fallbackChips > 0, '这一种的特效没载：用回通用的新月刀光和碎片 ' + JSON.stringify(r.fallbackArc));
  ok(!errs.length, 'PAGE ERRORS ' + (errs.join(' | ') || 'none'));
  console.log(bad ? `EFX2TEST FAIL ${bad}` : 'EFX2TEST ok');
  await b.close();
})();
