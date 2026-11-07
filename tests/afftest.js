const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message + '\n' + e.stack));
  await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(1200);
  await p.keyboard.press('KeyJ'); await p.waitForTimeout(200);
  const r = await p.evaluate(async () => {
    const { Enemy } = await import('./src/enemy.js');
    const g = __game; for (const s of ['s1','s2','s3','s4']) g.save.cleared[s] = true; g.startStage(2);
    for (let i = 0; i < 80; i++) g.update();
    const out = {};
    const pl = g.player; pl.hp = pl.maxHp = 1e6;
    const fresh = (aff, x = 500) => {
      g.enemies = g.enemies.filter(e => e.team === 'prop'); g.spawnQueue = []; g.hazards = []; g.attackers.clear();
      const e = new Enemy('grunt', x, 90, g, { lv: 7, elite: true, affixes: aff });
      e.setState('idle'); e.attackCd = 9999; g.enemies.push(e);
      pl.x = 440; pl.y = 90; pl.facing = 1; pl.setState('idle'); e.facing = -1;
      return e;
    };
    const run = (n) => { for (let i = 0; i < n; i++) g.update(); };
    // 坚盾：正面普攻被挡
    let e = fresh(['shield']); let hp0 = e.hp;
    pl.startMove(g, 'slash1'); run(12); e.attackCd = 9999;
    out.shieldFront = { blocked: e.hp === hp0, guard: e.guard };
    // 背后打
    e = fresh(['shield']); run(30); pl.x = e.x + 60; pl.y = e.y; pl.facing = -1; hp0 = e.hp; pl.startMove(g, 'slash1'); run(12);
    out.shieldBack = { damaged: e.hp < hp0 };
    // 重击破盾
    e = fresh(['shield']); hp0 = e.hp; pl.startMove(g, 'slash3'); run(14);
    out.shieldHeavy = { damaged: e.hp < hp0, broken: e.guardBrokenT > 0 };
    // 狂暴
    e = fresh(['frenzy']); run(30); e.hp = e.maxHp * 0.4; run(3);
    out.frenzy = { enraged: !!e.enraged, windup: e.windup, base: e.atk.windup, spd: e.spdMul };
    // 迅影
    e = fresh(['blink']); const x0 = e.x;
    for (let k = 0; k < 9; k++) { pl.setState('idle'); pl.x = e.x - 60; pl.facing = 1; e.facing = -1; pl.startMove(g, 'slash1'); run(9); if (e.blinkFlash > 0) break; }
    run(20);
    out.blink = { moved: Math.abs(e.x - x0) > 20, behind: Math.sign(e.x - pl.x) === -pl.facing, flash: e.blinkFlash };
    // 爆裂
    e = fresh(['volatile']); const other = new Enemy('grunt', 540, 95, g, { lv: 7 }); other.setState('idle'); other.attackCd = 9999; g.enemies.push(other);
    const ohp = other.hp; pl.x = 300; e.hp = 1; e.invuln = 0;
    g.applyHit(pl, e, { dmg: 10, kb: 1 }, 1);
    const hz = g.hazards.length; run(70);
    out.volatile = { hazard: hz, otherDamaged: other.hp < ohp, playerSafe: pl.hp === pl.maxHp };
    // 词缀抽取分布
    const { rollAffixes } = await import('./src/affix.js');
    out.roll = [rollAffixes('grunt', true, 0), rollAffixes('brute', true, 3), rollAffixes('archer', true, 4)];
    return out;
  });
  console.log(JSON.stringify(r, null, 1)); console.log('ERR', errs.join('\n') || 'none');
  await b.close();
})();
