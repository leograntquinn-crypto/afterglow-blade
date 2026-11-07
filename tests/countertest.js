const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message + '\n' + e.stack));
  await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(1200);
  await p.keyboard.press('KeyJ'); await p.waitForTimeout(300);
  const r = await p.evaluate(async () => {
    const { Enemy } = await import('./src/enemy.js'); const { Boss } = await import('./src/boss.js'); const { makeItem } = await import('./src/items.js');
    const g = __game; for (const s of ['s1','s2','s3']) g.save.cleared[s] = true;
    const setWeapon = (wt) => { g.save.equip.weapon = makeItem('weapon', 5, 1, wt); g.refreshStats(); };
    g.startStage(2); for (let i = 0; i < 80; i++) g.update();
    const pl = g.player; pl.hp = pl.maxHp = 1e6;
    const run = (n) => { for (let i = 0; i < n; i++) g.update(); };
    const fresh = (type, opts = {}) => {
      g.enemies = g.enemies.filter(e => e.team === 'prop'); g.spawnQueue = []; g.hazards = []; g.attackers.clear();
      const e = new Enemy(type, 520, 90, g, { lv: 7, ...opts }); e.setState('idle'); e.attackCd = 9999; e.facing = -1; g.enemies.push(e);
      pl.x = 470; pl.y = 90; pl.facing = 1; pl.setState('idle'); pl.invuln = 60; g.style.pts = 0; g.style.recent = [];
      return e;
    };
    const out = {};
    const hitOnce = (e, move) => { const hp0 = e.hp; pl.startMove(g, move); run(10); return hp0 - e.hp; };
    setWeapon('sword');
    // 普通命中伤害（对照）
    let e = fresh('grunt'); const dNormal = (() => { let s = 0; for (let k = 0; k < 6; k++) { e = fresh('grunt'); s += hitOnce(e, 'slash1'); } return s / 6; })();
    // 破招：腐骨兵预警中
    let sum = 0, interrupted = 0;
    pl.cd.skill1 = 300;
    for (let k = 0; k < 6; k++) { e = fresh('grunt'); e.startWindup(g); run(4); const hp0 = e.hp; pl.startMove(g, 'slash1'); run(10); sum += hp0 - e.hp; interrupted += e.state === 'hurt' ? 1 : 0; }
    out.grunt = { normal: Math.round(dNormal), counter: Math.round(sum / 6), interrupted: interrupted + '/6', cdAfter: pl.cd.skill1, style: Math.round(g.style.pts) };
    // 铁甲屠夫：普攻破招只削霸体，重击破招打断
    e = fresh('brute'); e.startWindup(g); run(4); const a0 = e.armor; pl.startMove(g, 'slash1'); run(10);
    out.bruteLight = { armorBefore: a0, armorAfter: Math.round(e.armor), state: e.state, hazards: g.hazards.length };
    e = fresh('brute'); e.startWindup(g); run(4); pl.startMove(g, 'slash3'); run(14);
    out.bruteHeavy = { state: e.state, hazardsAlive: g.hazards.filter(h => !h.dead).length };
    // 巨剑：普攻也能打断屠夫
    setWeapon('great'); e = fresh('brute'); e.startWindup(g); run(4); pl.startMove(g, 'slash1'); run(10);
    out.greatLight = { state: e.state, school: g.stats.school };
    // 太刀：取消窗口提前
    setWeapon('katana'); fresh('grunt'); pl.startMove(g, 'slash1'); let f = 0; g.input.press('attack'); g.input.release('attack');
    for (f = 0; f < 30 && pl.move?.id === 'slash1'; f++) { g.input.press('attack'); g.input.release('attack'); g.update(); }
    out.katanaCancelAt = pl.mf !== undefined ? f : null;
    setWeapon('sword'); fresh('grunt'); pl.startMove(g, 'slash1'); for (f = 0; f < 30 && pl.move?.id === 'slash1'; f++) { g.input.press('attack'); g.input.release('attack'); g.update(); }
    out.swordCancelAt = f;
    // 首领预警破招
    g.enemies = g.enemies.filter(x => x.team === 'prop'); const bo = new Boss('ironJaw', 540, 90, g, 7); bo.setState('idle'); g.enemies.push(bo); run(40);
    bo.startAct('slam'); run(3); pl.x = 480; pl.y = 90; pl.facing = 1; pl.setState('idle'); const ba0 = bo.armor; pl.startMove(g, 'slash1'); run(10);
    out.boss = { tele: bo.tele, armorBefore: Math.round(ba0), armorAfter: Math.round(bo.armor) };
    return out;
  });
  console.log(JSON.stringify(r, null, 1)); console.log('ERR', errs.join('\n') || 'none');
  await b.close();
})();
