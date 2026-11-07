const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message + '\n' + e.stack));
  await p.goto(`http://localhost:${PORT}/index.html`);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(1200);
  await p.keyboard.press('KeyJ'); await p.waitForTimeout(300);
  const r = await p.evaluate(async () => {
    const { Enemy } = await import('./src/enemy.js'); const { makeItem, MARKS } = await import('./src/items.js');
    const g = __game; g.startStage(0); for (let i = 0; i < 80; i++) g.update();
    const pl = g.player; pl.hp = pl.maxHp;
    const out = {};
    const clear = () => { g.enemies = g.enemies.filter(e => e.team === 'prop'); g.spawnQueue = []; g.hazards = []; g.loots = []; g.attackers.clear(); };
    // 1) 战意：同一个敌人，D 评级 vs SSS 评级击杀的经验
    const killXp = (rank) => { clear(); const e = new Enemy('grunt', 500, 90, g, { lv: 1 }); e.setState('idle'); g.enemies.push(e); g.style.pts = [0,120,300,540,840,1200,1620][rank]; g.updateRank(); const xp0 = g.run.xp; e.hp = 1; g.applyHit(pl, e, { dmg: 5, kb: 1 }, 1); return g.run.xp - xp0; };
    out.spoils = { D: killXp(0), A: killXp(3), SSS: killXp(6), spoilsAtSSS: g.spoils };
    // 掉装备概率：各杀 400 个
    const dropRate = (rank) => { let n = 0; for (let k = 0; k < 400; k++) { clear(); const e = new Enemy('grunt', 500, 90, g, { lv: 1 }); e.setState('idle'); g.enemies.push(e); g.style.pts = [0,120,300,540,840,1200,1620][rank]; g.updateRank(); e.hp = 1; g.applyHit(pl, e, { dmg: 5, kb: 1 }, 1); n += g.loots.filter(l => l.item).length; } return n; };
    out.drops = { D: dropRate(0), SSS: dropRate(6) };
    g.style.pts = 0; g.updateRank();
    // 2) 刻印生成：稀有 / 传说
    let rare = 0, legend = 0; for (let k = 0; k < 500; k++) { if (makeItem('ring', 5, 2).mark) rare++; if (makeItem('ring', 5, 3).mark) legend++; }
    out.markGen = { rare: rare / 500, legend: legend / 500 };
    // 3) 刻印效果：给装备直接设刻印，比较伤害
    const dmgWith = (marks, setup) => {
      g.save.equip.ring = makeItem('ring', 1, 0); g.save.equip.ring.mark = marks[0]; g.save.equip.helm = marks[1] ? Object.assign(makeItem('helm', 1, 0), { mark: marks[1] }) : null; g.refreshStats();
      let s = 0; for (let k = 0; k < 300; k++) { clear(); const e = new Enemy('grunt', 500, 90, g, { lv: 1 }); e.setState('idle'); g.enemies.push(e); setup(e); s += g.calcDamage(pl, e, { dmg: 10 }).dmg; } return s / 300;
    };
    const base = dmgWith([null], () => {});
    out.marks = {
      base: +base.toFixed(1),
      air: +(dmgWith(['air'], (e) => { e.z = 50; }) / base).toFixed(2),
      pristine: +(dmgWith(['pristine'], () => { pl.hp = pl.maxHp; }) / base).toFixed(2),
      desperate: +(dmgWith(['desperate'], () => { pl.hp = pl.maxHp * 0.2; }) / base).toFixed(2),
      otgDown: +(dmgWith(['otg'], (e) => { e.setState('down'); }) / dmgWith([null], (e) => { e.setState('down'); })).toFixed(2),
      streak30: +(dmgWith(['streak'], () => { g.streak = 30; pl.hp = pl.maxHp; }) / base).toFixed(2),
      wall: +(dmgWith(['wall'], (e) => { g.onWallBounce(e); }) / base).toFixed(2),
      sameNoStack: (() => { dmgWith(['air', 'air'], () => {}); return g.stats.marks.size; })(),
    };
    pl.hp = pl.maxHp; g.streak = 0;
    // 4) 复盘：被不同攻击打中，看汇总
    g.save.equip.ring = null; g.save.equip.helm = null; g.refreshStats(); clear();
    const grunt = new Enemy('grunt', 500, 90, g, { lv: 1 }); grunt.setState('idle'); g.enemies.push(grunt);
    const brute = new Enemy('brute', 600, 90, g, { lv: 1 }); brute.setState('idle'); g.enemies.push(brute);
    pl.invuln = 0;
    for (let k = 0; k < 3; k++) { pl.invuln = 0; pl.setState('idle'); grunt.atk = grunt.T.atk; g.applyHit(grunt, pl, { dmg: 9, kb: 1 }, -1); }
    for (let k = 0; k < 4; k++) { pl.invuln = 0; pl.setState('attack'); pl.move = { id: 'slash1', hits: [], total: 22 }; pl.mf = 15; g.applyHit(brute, pl, { dmg: 22, kb: 1 }, -1); }
    const { hurtSummary } = await import('./src/hud.js');
    const R = hurtSummary(g.run);
    out.recap = { top: R.top.map(e => `${e.name} ${e.n}x ${e.dmg}`), busy: +R.busy.toFixed(2), tip: R.tip };
    return out;
  });
  console.log(JSON.stringify(r, null, 1)); console.log('ERR', errs.join('\n') || 'none');
  await b.close();
})();
