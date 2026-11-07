// 子轮 E（第 12 项）确定性测试：五关的地形 / 规则 + 首领动态难度 + 残影读习惯
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765;
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.goto(`http://localhost:${PORT}/index.html`); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(1500);
  const r = await p.evaluate(async () => {
    const g = __game, out = {};
    const { Enemy } = await import('./src/enemy.js'); const { Projectile } = await import('./src/combat.js');
    const { TERRAIN } = await import('./src/stage_rules.js'); const { bossBonus, REF_POWER } = await import('./src/boss_scale.js');
    const { STAGES } = await import('./src/stages.js'); const { world, DEPTH } = await import('./src/config.js');
    for (const s of ['s1', 's2', 's3', 's4']) g.save.cleared[s] = true;
    let pl = g.player;
    const go = (st, idx, diff = 0) => { g.story.clear(); g.startStage(st, diff, false); g.story.clear(); const room = [...g.dungeon.rooms.values()].find((r) => r.idx === idx) ?? g.dungeon.start; g.enterRoom(room, 'e'); g.enemies = g.enemies.filter((e) => e.team === 'prop'); g.spawnQueue = []; g.waveActive = false; room.cleared = true; pl = g.player; return room; };
    const step = (n = 1) => { for (let i = 0; i < n; i++) { g.update(); g.player.hp = Math.max(g.player.hp, 1); } };
    const foe = (type, x, y, o = {}) => { const e = new Enemy(type, x, y, g, { lv: g.stage.lv, ...o }); e.state = 'idle'; e.st = 99; g.enemies.push(e); return e; };

    // ① 窄墓道：纵深收窄（南北门附近敞开），强制佯攻，耐力教学
    g.save.tips = {};
    go(0, 1);
    const T1 = g.terrain;
    out.s1band = T1?.band && [T1.band.y0, T1.band.y1];
    pl.x = 400; pl.y = 5; step(2); out.s1yTop = Math.round(pl.y); pl.y = 165; step(2); out.s1yBot = Math.round(pl.y);
    out.s1force = g.forceFeint;
    const gr = foe('grunt', pl.x + 70, pl.y, {}); gr.facing = -1; gr.attackCd = 0;
    let feinted = false; for (let i = 0; i < 400 && !feinted; i++) { step(); if (gr.atk?.feint && gr.state === 'windup') feinted = true; pl.x = gr.x - 70; pl.hp = pl.maxHp; }
    out.s1feint = feinted; out.s1forceAfter = g.forceFeint;
    g.enemies = g.enemies.filter((e) => e !== gr);
    pl.sta = 100; pl.setState('idle'); g.input.press('dash'); step(); g.input.release('dash'); step(20);
    out.s1stamTip = !!g.save.tips.t_stamina1;
    out.s1narrowTip = !!g.save.tips.t_narrow;

    // ② 立柱：挡箭、挡剑气、挡路；弓手看到立柱挡住射线；烬翼成对俯冲
    go(1, 2);
    const T2 = g.terrain, P0 = T2.pillars[0];
    out.s2pillars = T2.pillars.length;
    pl.x = P0.x + 120; pl.y = P0.y; pl.setState('idle');
    const arrow = new Projectile({ x: P0.x - 140, y: P0.y, z: 52, vx: 7.5, life: 120, team: 'enemy', kind: 'arrow', hit: { box: { w: 20, d: 18, z0: -10, z1: 10 }, dmg: 9, kb: 3 } });
    g.projectiles.push(arrow); const hp0 = pl.hp; step(40);
    out.s2arrowBlocked = arrow.dead && pl.hp === hp0 && T2.stats.shotsBlocked >= 1;
    const wave = new Projectile({ x: P0.x + 100, y: P0.y, z: 0, vx: -10.5, life: 46, team: 'player', kind: 'wave', pierce: true, hit: { box: { w: 60, d: 30, z0: 0, z1: 120 }, dmg: 30, kb: 4 } });
    g.projectiles.push(wave); step(30); out.s2waveBlocked = wave.dead;
    const ar = foe('archer', P0.x - 200, P0.y); out.s2lineBlocked = T2.lineBlocked(ar.x, ar.y, pl.x, pl.y);
    g.enemies = g.enemies.filter((e) => e !== ar);
    pl.x = P0.x; pl.y = P0.y; step(2); out.s2pushOut = Math.hypot((pl.x - P0.x) / TERRAIN.pillar.rx, (pl.y - P0.y) / TERRAIN.pillar.ry) >= 0.99;
    // 烬翼成对：两只烬翼、你在中距离 → 一段时间里出现「假冲 + 真冲」
    pl.x = 700; pl.y = 85; T2.pillars.length = 0;
    const w1 = foe('wing', 640, 80), w2 = foe('wing', 760, 90); w1.attackCd = w2.attackCd = 0; w1.z = w2.z = 120;
    let fake = 0, real = 0; for (let i = 0; i < 900; i++) { step(); pl.hp = pl.maxHp; for (const w of [w1, w2]) { if (w.state === 'windup' && w.st === 1) { if (w.atk.fake) fake++; else real++; } } }
    out.s2wingPair = [fake, real];
    g.enemies = g.enemies.filter((e) => e !== w1 && e !== w2);
    // 技能打空：弓手抓后摇，抬手更短（伤害不变）
    pl.x = 600; pl.y = 85; pl.setState('idle'); pl.facing = -1;
    g.enemies = g.enemies.filter((e) => e.team !== 'prop'); g.attackers.clear(); // 打中陶罐不算打空：先把陶罐拿走；前面拿掉的烬翼还占着出手令牌，一起还掉
    step(30);
    g.save.skills.skill2 = 1; g.player.mp = g.player.maxMp; g.player.cd.skill2 = 0; g.input.press('skill2'); step(); g.input.release('skill2');
    const AD = await import('./src/ai_data.js'), keepCh = AD.AI_PROFILES.archer.punishSkill.chance; AD.AI_PROFILES.archer.punishSkill.chance = [1, 1, 1]; // 概率另测，这里只看行为
    const ap = foe('archer', 950, 85); ap.attackCd = 100; ap.facing = -1; // 技能放出去的同时出现、冷却还剩一点（看到打空时冷却刚好快好）
    let pun = null; for (let i = 0; i < 120 && !pun; i++) { step(); pl.hp = pl.maxHp; if (ap.state === 'windup' && ap.atk?.punish) pun = { windup: ap.windup, normal: ap.T.atk.windup, dmgSame: ap.atk.hit.dmg === ap.T.atk.hit.dmg }; }
    out.s2skillPunish = pun;
    // 剑气飞完一个都没打中（被柱子挡掉也算）→ 弓手也抓
    g.enemies = g.enemies.filter((e) => e !== ap); g.attackers.clear(); step(60);
    const ap2 = foe('archer', 950, 85); ap2.attackCd = 100; ap2.facing = -1;
    g.projectiles.push(new Projectile({ x: 560, y: 85, z: 0, vx: -10.5, life: 20, team: 'player', kind: 'wave', pierce: true, hit: { box: { w: 60, d: 30, z0: 0, z1: 120 }, dmg: 30, kb: 4 } }));
    let pun2 = null; for (let i = 0; i < 120 && !pun2; i++) { step(); pl.hp = pl.maxHp; if (ap2.state === 'windup' && ap2.atk?.punish) pun2 = { windup: ap2.windup }; }
    out.s2wavePunish = pun2; out.s2waveDbg = { tok: g.attackers.size, max: g.maxAttackers, st: ap2.state, cd: ap2.attackCd, intent: ap2.ai?.intent, wf: g.ai.waveWhiffF, f: g.ai.f, seen: ap2.ai?.seenSkillWhiff, x: Math.round(ap2.x), px: Math.round(pl.x), cam: Math.round(g.camX) };
    g.enemies = g.enemies.filter((e) => e !== ap2);
    AD.AI_PROFILES.archer.punishSkill.chance = keepCh;
    // ③ 绞索钩：钩住下面的主角 / 敌人；屠夫格挡反击
    go(2, 2);
    const T3 = g.terrain, H0 = T3.hooks[0];
    out.s3hooks = T3.hooks.length;
    pl.x = H0.x; pl.y = H0.y; pl.setState('idle'); pl.invuln = 0; H0.st = 'idle'; H0.t = 0; H0.len = 5;
    let caught = false; for (let i = 0; i < 90; i++) { step(); pl.x = H0.x; pl.y = H0.y; if (H0.st === 'hold' && H0.caught === pl) caught = true; }
    out.s3hookPlayer = caught && T3.stats.hooked === 1; out.s3dbg = [caught, T3.stats.hooked, H0.st, pl.invuln, pl.state];
    step(120);
    const gh = foe('grunt', H0.x, H0.y); H0.st = 'idle'; H0.t = 0; H0.len = 5; pl.x = H0.x - 300;
    let fc = false; for (let i = 0; i < 90; i++) { step(); gh.x = H0.x; gh.y = H0.y; if (H0.caught === gh) fc = true; }
    out.s3hookFoe = fc && T3.stats.foeHooked === 1;
    g.enemies = g.enemies.filter((e) => e !== gh);
    // 屠夫举斧格挡时，正面打来的技能被挡 → 马上反击（同一记重砸，抬手短）
    const br = foe('brute', 600, 85); br.facing = -1; pl.x = 540; pl.y = 85; pl.facing = 1; br.guardT = 50;
    const wv = new Projectile({ x: 560, y: 85, z: 0, vx: 10.5, life: 46, team: 'player', kind: 'wave', pierce: true, hit: { box: { w: 60, d: 30, z0: 0, z1: 120 }, dmg: 30, kb: 4 } });
    g.projectiles.push(wv); step(4);
    out.s3riposte = br.state === 'windup' && !!br.atk?.riposte && br.windup < br.T.atk.windup && br.atk.hit.dmg === br.T.atk.hit.dmg;
    g.enemies = g.enemies.filter((e) => e !== br); g.hazards = [];

    // ④ 火墙：周期、燃烧伤人、跳得够高越过；敌人不往火里走；精英词缀按组合
    go(3, 2);
    const T4 = g.terrain, F0 = T4.flames[0];
    out.s4flames = T4.flames.length;
    const FT = TERRAIN.flame, cyc = FT.dormant + FT.warn + FT.burn;
    const states = new Set(); for (let i = 0; i < cyc; i++) { T4.t++; states.add(T4.flameState(F0)); } out.s4states = [...states].sort().join(',');
    while (T4.flameState(F0) !== 'burn') T4.t++;
    pl.x = F0.x; pl.y = 85; pl.z = 0; pl.setState('idle'); pl.invuln = 0; const h4 = pl.hp; step(2); out.s4burn = pl.hp < h4;
    pl.hp = pl.maxHp; F0.burnAt.clear(); pl.x = F0.x; pl.z = FT.height + 20; pl.vz = 0; pl.invuln = 0; pl.setState('air'); const h5 = pl.hp; T4.update(); out.s4jumpOver = pl.hp === h5;
    pl.z = 0; pl.setState('idle');
    const ge = foe('grunt', F0.x - 80, 85); out.s4steer = T4.steerX(ge, F0.x + 200) < F0.x;
    g.enemies = g.enemies.filter((e) => e !== ge);
    const sets = []; for (let i = 0; i < 12; i++) { g.spawnEnemy('grunt*'); const e = g.enemies[g.enemies.length - 1]; sets.push([...e.aff].slice(0, 2).sort().join('+')); g.enemies.pop(); }
    const valid = new Set(['blink+shield', 'frenzy+volatile', 'shield+volatile', 'blink+frenzy']);
    out.s4sets = sets.every((k) => valid.has(k)); out.s4setSample = sets.slice(0, 4);

    // ⑤ 深渊裂口：走到边上停住、闪避冲进去掉下去、敌人打下去摔死、精英掉一截血、首领不掉
    go(4, 2);
    const T5 = g.terrain, G0 = T5.gaps[0];
    out.s5gaps = T5.gaps.length;
    pl.x = G0.x0 - 10; pl.y = 140; pl.setState('idle'); pl.invuln = 0; g.input.press('right'); step(30); g.input.release('right'); step(2);
    out.s5edgeStop = !T5.inGap(pl.x, pl.y) && T5.stats.falls === 0;
    pl.x = G0.x0 - 6; pl.y = 140; pl.z = 0; pl.invuln = 0; const h6 = pl.hp; pl.setState('hurt'); pl.hurtT = 20; pl.vx = 9; step(4);
    out.s5fall = T5.stats.falls === 1 && pl.hp < h6 && !T5.inGap(pl.x, pl.y) && Math.abs((h6 - pl.hp) - Math.round(pl.maxHp * TERRAIN.gap.fall)) <= 1;
    pl.setState('idle'); pl.x = G0.x0 - 200;
    pl.x = (G0.x0 + G0.x1) / 2; pl.y = (G0.bridge[0] + G0.bridge[1]) / 2; pl.setState('run'); step(2); out.s5bridge = T5.stats.falls === 1;
    pl.x = G0.x0 - 200; pl.y = 85; pl.setState('idle');
    const k0 = g.kills, fg = foe('grunt', G0.x0 + 20, 140); fg.setState('hurt'); fg.hitstun = 20; step(2);
    out.s5foeFall = !fg.alive && g.kills === k0 + 1 && T5.stats.foeFalls >= 1;
    const el = foe('grunt', G0.x0 + 20, 140, { elite: true }); el.setState('hurt'); el.hitstun = 20; const elHp = el.hp; step(30);
    out.s5eliteFall = el.alive && el.hp < elHp && !T5.inGap(el.x, el.y); out.s5dbg = [el.alive, el.hp, elHp, el.x, G0.x0, el.state];
    g.enemies = g.enemies.filter((e) => e !== el);

    // 魔力节奏：放技能后 90 帧不自然回复；普攻打中回 1.2
    { const { MANA } = await import('./src/stamina_data.js');
      const P = g.player; P.setState('idle'); g.enemies = g.enemies.filter((e) => e.team === 'prop'); P.x = 300; P.y = 85; P.mp = 60; P.cd.skill1 = 0; g.save.skills.skill1 = 1;
      g.input.press('skill1'); step(); g.input.release('skill1'); const m0 = P.mp; step(60); const m60 = P.mp; step(60); const m120 = P.mp;
      out.mana = { paused: Math.abs(m60 - m0) < 1e-6, resumed: m120 > m60, pause: MANA.pauseAfterSkill };
      P.setState('idle'); step(30); const tgt = foe('grunt', P.x + 40, P.y); tgt.facing = -1; P.facing = 1; P.mpPause = 999; const mA = P.mp;
      g.applyHit(P, tgt, { dmg: 1, kb: 0, stun: 1, stop: 0 }, 1); out.mana.onHit = +(P.mp - mA).toFixed(2);
      g.enemies = g.enemies.filter((e) => e !== tgt); P.mpPause = 0; }

    // 首领动态难度：公式、血量、连斩、休息
    out.bonus = [bossBonus(REF_POWER[10] * 0.8, 10), bossBonus(REF_POWER[10] * 1.0, 10), +bossBonus(REF_POWER[10] * 1.5, 10).toFixed(3), bossBonus(REF_POWER[10] * 2.5, 10)];
    const { Boss } = await import('./src/boss.js');
    const bo = new Boss('afterimage', 900, 85, g, 14); const hpBase = bo.maxHp;
    bo.dyn = { bonus: 0.5, comboAdd: 2 }; g.enemies.push(bo); bo.state = 'idle';
    pl.x = 800; pl.y = 85; bo.restT = 0; bo.startAct('combo'); let swings = 0; for (let i = 0; i < 200 && bo.state === 'attack'; i++) { const a0 = bo.act?.d?.set; step(); if (bo.act?.d?.set && bo.act.d.set !== a0) swings++; pl.hp = pl.maxHp; }
    out.comboSwings = swings;
    // 动态强化下休息时间缩短
    const rests = []; for (let i = 0; i < 40; i++) { bo.dyn.bonus = i < 20 ? 0 : 0.5; bo.act = { name: 'combo', t: 999, d: {} }; bo.state = 'attack'; bo.updateAttack = bo.updateAttack.bind(bo); bo.setState('idle'); bo.restT = ((Math.random() * 28 + 28) / bo.spd / (1 + bo.dyn.bonus)) | 0; rests.push(bo.restT); }
    out.restRatio = +(rests.slice(20).reduce((a, b) => a + b, 0) / rests.slice(0, 20).reduce((a, b) => a + b, 0)).toFixed(2);
    // 读习惯：你爱闪避 → 处决 / 三连斩权重上去
    const tbl = { combo: 2, teleport: 2, volley: 2, charge: 2, execution: 1 };
    const H = g.ai.habits, origH = H.h.bind(H); H.h = (k) => (k === 'dodge' ? 1 : 0);
    const t1 = bo.habitTable(g, tbl); H.h = origH;
    out.reads = [t1.execution / tbl.execution, t1.combo / tbl.combo, t1.volley / tbl.volley];
    g.enemies = g.enemies.filter((e) => e !== bo);
    // 首领房真实刷出来的首领：按战力强化、血量最多 +25%
    go(4, 0); const bossRoom = [...g.dungeon.rooms.values()].find((r) => r.type === 'boss'); g.enterRoom(bossRoom, 'e'); step(80);
    out.bossDyn = g.boss?.dyn ? { bonus: g.boss.dyn.bonus, hpRatio: +(g.boss.maxHp / hpBase).toFixed(3) } : null;
    // 地形不进试炼和训练场
    g.startTrial(); step(5); out.trialTerrain = g.terrain;
    return out;
  });
  ok(r.s1band && r.s1band[0] === 56 && r.s1yTop >= 56 && r.s1yBot <= 118, `① 窄墓道纵深 ${r.s1band} · 往上走到 ${r.s1yTop} / 往下 ${r.s1yBot}`);
  ok(r.s1force === 1 && r.s1feint && r.s1forceAfter === 0, `① 这间房第一个腐骨兵必定佯攻（${r.s1feint}）`);
  ok(r.s1stamTip && r.s1narrowTip, `① 耐力 / 窄墓道教学提示`);
  ok(r.s2pillars >= 2 && r.s2arrowBlocked, `② 立柱挡住了箭（${r.s2pillars} 根）`);
  ok(r.s2waveBlocked, '② 立柱也挡剑气');
  ok(r.s2lineBlocked, '② 弓手的射线被立柱挡住（会去找别的纵深）');
  ok(r.s2pushOut, '② 走不进立柱脚下');
  ok(r.s2wingPair[0] >= 2 && r.s2wingPair[1] >= 2, `② 烬翼成对俯冲：假冲 ${r.s2wingPair[0]} / 真冲 ${r.s2wingPair[1]}`);
  ok(r.s2skillPunish && r.s2skillPunish.windup < r.s2skillPunish.normal && r.s2skillPunish.dmgSame, `② 技能打空：弓手马上放箭（抬手 ${r.s2skillPunish?.windup} < 平时 ${r.s2skillPunish?.normal}，伤害不变）`);
  ok(r.s2wavePunish && r.s2wavePunish.windup < 38, `② 剑气打空：弓手也抓（抬手 ${r.s2wavePunish?.windup}）` + JSON.stringify(r.s2waveDbg));
  ok(r.s3hooks >= 2 && r.s3hookPlayer, '③ 绞索钩钩住站在下面的主角 ' + JSON.stringify(r.s3dbg));
  ok(r.s3hookFoe, '③ 绞索钩钩住敌人');
  ok(r.s3riposte, '③ 屠夫格挡住正面的技能后反击（抬手更短、伤害不变）');
  ok(r.s4flames === 2 && r.s4states === 'burn,off,warn', `④ 火墙周期：${r.s4states}`);
  ok(r.s4burn && r.s4jumpOver, '④ 燃烧时站在里面会被烧；跳得够高能越过去');
  ok(r.s4steer, '④ 敌人不往正在烧的火墙那边走');
  ok(r.s4sets, `④ 精英词缀按组合出：${r.s4setSample}`);
  ok(r.s5gaps >= 1 && r.s5edgeStop, '⑤ 自己走到裂口边上会停住');
  ok(r.s5fall, '⑤ 闪避冲进裂口：掉下去、损失 12% 生命、回到边上');
  ok(r.s5bridge, '⑤ 窄桥上走得过去');
  ok(r.s5foeFall, '⑤ 敌人被打进裂口直接摔死（算击杀）');
  ok(r.s5eliteFall, '⑤ 精英掉下去损失一截生命、回到边上 ' + JSON.stringify(r.s5dbg));
  ok(r.mana && r.mana.paused && r.mana.resumed && Math.abs(r.mana.onHit - 1.2) < 1e-6, `魔力节奏：放技能后 ${r.mana?.pause} 帧不自然回复、之后恢复；普攻打中 +${r.mana?.onHit}`);
  ok(r.bonus[0] === 0 && Math.abs(r.bonus[1]) < 1e-9 && r.bonus[2] === 0.3 && r.bonus[3] === 0.5, `首领动态难度公式：0.8x → ${r.bonus[0]} / 1x → ${r.bonus[1]} / 1.5x → ${r.bonus[2]} / 2.5x → ${r.bonus[3]}`);
  ok(r.comboSwings === 5, `强化 50%：三连斩变成 ${r.comboSwings} 刀`);
  ok(r.restRatio > 0.55 && r.restRatio < 0.8, `强化 50%：休息时间 ×${r.restRatio}`);
  ok(r.reads[0] > 2 && r.reads[1] > 2 && r.reads[2] === 1, `残影读习惯（爱闪避）：处决 ×${r.reads[0].toFixed(2)}、三连斩 ×${r.reads[1].toFixed(2)}、射击 ×${r.reads[2]}`);
  ok(r.bossDyn && r.bossDyn.hpRatio <= 1.25 + 1e-6 && r.bossDyn.hpRatio >= 1, `首领房：强化 ${r.bossDyn && Math.round(r.bossDyn.bonus * 100)}%、血量 ×${r.bossDyn?.hpRatio}（不超过 1.25）`);
  ok(r.trialTerrain == null, '试炼里没有关卡地形');
  ok(!errs.length, '无页面错误 ' + errs.join(' | '));
  console.log(bad ? `STAGETEST FAIL ${bad}` : 'STAGETEST ok'); await b.close();
})();
