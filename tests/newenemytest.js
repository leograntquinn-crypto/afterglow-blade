// 新敌人机制测试：灰烛司祭（护咒、打断、陷阱、破咒）和烬翼（盘旋高度、俯冲、被打落、重新起飞）
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message + ' ' + e.stack));
  await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(1000);
  await p.keyboard.press('KeyJ'); await p.waitForTimeout(200);
  const r = await p.evaluate(async () => {
    const g = __game; for (const s of ['s1', 's2', 's3']) g.save.cleared[s] = true; g.startStage(2);
    const { Enemy } = await import('./src/enemy.js'); const { Trap } = await import('./src/enemies_ext.js');
    const pl = g.player; const out = {};
    const reset = () => { for (let i = 0; i < 40; i++) g.update(); g.enemies = g.enemies.filter(e => e.team === 'prop'); g.attackers.clear(); g.spawnQueue = []; g.hazards = []; g.projectiles = []; g.waveActive = true; pl.hp = pl.maxHp = 1e6; pl.x = 300; pl.y = 90; pl.z = 0; pl.setState('idle'); };
    const mk = (type, x, y) => { const e = new Enemy(type, x, y, g, { lv: g.stage.lv }); g.enemies.push(e); return e; };
    // 1. 护咒：司祭给附近的腐骨兵套盾
    reset(); pl.x = 100;
    const pr = mk('priest', 640, 90), g1 = mk('grunt', 520, 80), g2 = mk('grunt', 560, 100);
    for (const e of [g1, g2]) { e.attackCd = 9999; }
    let warded = false, sawWardWindup = false;
    for (let i = 0; i < 1800 && !warded; i++) { pl.x = 100; pl.hp = 1e6; g.update(); if (pr.state === 'windup' && pr.atk.kind === 'ward') sawWardWindup = true; warded = !!(g1.ward || g2.ward); }
    out.ward = { sawWardWindup, warded, wardHp: Math.round((g1.ward || g2.ward)?.hp ?? 0) };
    // 盾在：普通命中不扣血不硬直；重击双倍削盾、破盾
    const w = g1.ward ? g1 : g2, hp0 = w.hp;
    g.applyHit(pl, w, { dmg: 10, kb: 2, stun: 20, stop: 1 }, 1);
    out.wardAbsorb = { hpUnchanged: w.hp === hp0, notStunned: w.state !== 'hurt', wardLeft: Math.round(w.ward?.hp ?? -1) };
    let n = 0; while (w.ward && n++ < 30) g.applyHit(pl, w, { dmg: 40, kb: 2, stun: 20, stop: 1, heavy: true }, 1);
    out.wardBreak = { broken: !w.ward, hits: n, state: w.state };
    // 2. 打断：读护咒时打中司祭 = 破招
    reset(); pl.x = 100;
    const pr2 = mk('priest', 640, 90), g3 = mk('grunt', 560, 90); g3.attackCd = 9999;
    let interrupted = null;
    for (let i = 0; i < 900; i++) {
      pl.x = 100; g.update();
      if (pr2.state === 'windup' && pr2.atk.kind === 'ward' && pr2.st > 10) { const ok = g.applyHit(pl, pr2, { dmg: 5, kb: 2, stun: 20, stop: 1 }, 1); interrupted = { ok, state: pr2.state, gruntWard: !!g3.ward }; break; }
    }
    for (let i = 0; i < 80; i++) g.update();
    out.interrupt = { ...interrupted, wardAfter: !!g3.ward };
    // 3. 陷阱：踩上去爆炸；坠星斩震掉
    reset();
    const t1 = new Trap({ x: pl.x, y: pl.y, owner: null }); g.hazards.push(t1);
    const hp1 = pl.hp; for (let i = 0; i < 45; i++) { pl.x = 300; pl.y = 90; g.update(); }
    out.trapHit = { exploded: t1.dead, damaged: pl.hp < hp1 };
    reset();
    const t2 = new Trap({ x: 300, y: 90, owner: null }); g.hazards.push(t2);
    pl.x = 400; for (let i = 0; i < 45; i++) g.update();
    g.plungeImpact({ ...pl, x: 300, y: 90, glow: pl.glow });
    out.trapDisarm = { disarmed: t2.dead };
    // 4. 烬翼：盘旋高度、地面普攻打不到、空中斩打得到、俯冲、被打落、重新起飞
    reset(); pl.x = 300;
    g.spawnEnemy('wing');
    const wings = g.enemies.filter(e => e.T?.ai === 'wing'); for (let i = 0; i < 60; i++) { pl.hp = 1e6; g.update(); }
    const { hitBox, overlaps } = await import('./src/combat.js');
    const { MOVES } = await import('./src/moves.js');
    const zs = wings.filter(e => e.state === 'idle' || e.state === 'windup').map(e => Math.round(e.z)); // 只看在盘旋的（俯冲中的那只高度本来就低）
    let minZ = 999, dived = false; for (let i = 0; i < 600; i++) { pl.hp = 1e6; g.update(); for (const e of wings) if (e.alive && e.state === 'attack') { dived = true; minZ = Math.min(minZ, e.z); } }
    const wv = wings.find(e => e.alive && e.state === 'idle' && e.z > 112) || wings[0];
    const fake = { x: wv.x - 50, y: wv.y, z: 0, facing: 1 };
    const groundHit = overlaps(hitBox(fake, MOVES.slash1.hits[0]), wv);
    const airHit = overlaps(hitBox({ ...fake, z: wv.z - 30 }, MOVES.airSlash.hits[0]), wv);
    g.applyHit(pl, wv, { dmg: 1, kb: 2, launch: 2, stun: 20, stop: 1 }, 1);
    let landed = false, rose = false;
    for (let i = 0; i < 260; i++) { pl.hp = 1e6; g.update(); if (wv.state === 'down') landed = true; if (landed && wv.state === 'idle' && wv.z > 100) rose = true; }
    out.wing = { count: wings.length, hoverZ: zs, groundHit, airHit, dived, minDiveZ: Math.round(minZ), landed, rose, hp: wv.hp };
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  const ok = r.ward.warded && r.wardAbsorb.hpUnchanged && r.wardAbsorb.notStunned && r.wardBreak.broken && r.interrupt.ok && !r.interrupt.wardAfter
    && r.trapHit.exploded && r.trapHit.damaged && r.trapDisarm.disarmed && r.wing.count === 3 && r.wing.hoverZ.length > 0 && r.wing.hoverZ.every(z => z >= 110 && z <= 145)
    && !r.wing.groundHit && r.wing.airHit && r.wing.dived && r.wing.minDiveZ < 60 && r.wing.landed && r.wing.rose;
  console.log(ok ? 'PASS' : 'FAIL', 'ERR', errs.join('|') || 'none');
  await b.close();
})();
