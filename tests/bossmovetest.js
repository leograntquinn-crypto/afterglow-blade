// 首领专属招式测试：每个招式单独跑一遍，检查效果和收尾
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765;
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message + ' ' + e.stack));
  await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(1000);
  await p.keyboard.press('KeyJ'); await p.waitForTimeout(200);
  const r = await p.evaluate(async () => {
    const g = __game; let pl = g.player; const out = {};
    for (const s of ['s1', 's2', 's3', 's4']) g.save.cleared[s] = true;
    // 记录打到玩家身上的命中（不靠血量差：测试里血量会被上限夹住）
    let hits = 0; const origHit = g.applyHit.bind(g);
    g.applyHit = function (src, target, h, dir) { const r = origHit(src, target, h, dir); if (target === pl && r) hits++; return r; };
    const { Boss } = await import('./src/boss.js'); const { Brazier, Streak } = await import('./src/boss_moves.js');
    const run = (stage, key, act, setup, n = 400, each) => {
      g.startStage(stage); pl = g.player; for (let i = 0; i < 40; i++) g.update();
      g.enemies = g.enemies.filter(e => e.team === 'prop'); g.spawnQueue = []; g.hazards = []; g.projectiles = []; g.banner = null;
      pl.hp = pl.maxHp = 1e6; pl.x = 420; pl.y = 90; pl.z = 0; pl.invuln = 0; pl.setState('idle');
      const bo = new Boss(key, 700, 90, g, g.stage.lv); bo.setState('idle'); bo.restT = 9999; g.enemies.push(bo); g.boss = bo;
      for (let i = 0; i < 40; i++) g.update();
      setup?.(bo);
      bo.startAct(act);
      const info = { maxHaz: 0, done: false, frames: 0, hp0: pl.hp }; hits = 0;
      for (let i = 0; i < n; i++) {
        pl.x = info.lockX ?? pl.x; g.update(); info.frames = i;
        info.maxHaz = Math.max(info.maxHaz, g.hazards.length);
        each?.(bo, info, i);
        if (bo.state !== 'attack' || !bo.act || bo.act.name !== act) { info.done = true; break; }
      }
      info.dmg = hits; info.hpNow = pl.hp; info.maxHp = pl.maxHp;
      return [bo, info];
    };
    // 骸骨统领
    { const [bo, i] = run(0, 'boneLord', 'boneCage'); out.boneCage = { hazards: i.maxHaz, done: i.done, dmg: i.dmg }; }
    { const seen = new Set(); const [bo, i] = run(0, 'boneLord', 'rendChase', null, 400, () => g.hazards.forEach(h => seen.add(h))); out.rendChase = { hazards: seen.size, done: i.done }; }
    // 夜鸦
    { let feathers = 0, returned = false;
      const [bo, i] = run(1, 'nightRaven', 'featherRang', null, 400, () => { const f = g.projectiles.filter(x => x.kind === 'feather'); feathers = Math.max(feathers, f.length); if (f.some(x => x.returned)) returned = true; });
      out.featherRang = { feathers, returned, done: i.done }; }
    { let split = 0, fakes = 0;
      const [bo, i] = run(1, 'nightRaven', 'ravenSplit', null, 400, (bo) => { if (bo.split) split = bo.split.spots.length; fakes = Math.max(fakes, g.projectiles.filter(x => x.fake).length); });
      out.ravenSplit = { decoys: split, fakeArrows: fakes, done: i.done };
      let seen = false;
      const [bo2, i2] = run(1, 'nightRaven', 'ravenSplit', null, 400, (bo) => { if (bo.split && bo.split.t > 12 && !seen) { seen = true; g.applyHit(pl, bo, { dmg: 5, kb: 1, stun: 5, stop: 1 }, 1); } });
      out.ravenSplitReveal = { hitReal: seen, splitCleared: !bo2.split, endedEarly: i2.frames < 60 }; }
    // 铁颚：站在钩子线上 → 被拉过去、挨重锤
    { let minDist = 999;
      const [bo, i] = run(2, 'ironJaw', 'chainHook', (bo) => { pl.y = bo.y; pl.x = 420; }, 400, (bo) => { minDist = Math.min(minDist, Math.abs(bo.x - pl.x)); });
      out.chainHook = { pulledTo: Math.round(minDist), dmg: i.dmg, done: i.done }; }
    { const [bo, i] = run(2, 'ironJaw', 'tripleStomp'); out.tripleStomp = { hazards: i.maxHaz, done: i.done }; }
    // 祭坛守护者：魂火炉召出来、会吐魂火、能打碎
    { const [bo, i] = run(3, 'warden', 'soulBraziers');
      const br = g.enemies.filter(e => e instanceof Brazier);
      let souls = 0; for (let k = 0; k < 260; k++) { pl.hp = 1e6; g.update(); souls = Math.max(souls, g.projectiles.filter(x => x.kind === 'soul').length); }
      const one = br[0]; for (let k = 0; k < 3 && !one.remove; k++) g.applyHit(pl, one, { dmg: 5, kb: 1, stop: 1 }, 1);
      out.soulBraziers = { braziers: br.length, souls, broken: !!one.remove, done: i.done }; }
    { const [bo, i] = run(3, 'warden', 'judgment', (bo) => { pl.y = 90; }); out.judgment = { dmg: i.dmg, done: i.done }; }
    // 残影：镜像复制最后用过的技能；处决全部躲过会力竭
    { const [bo, i] = run(4, 'afterimage', 'mirror', () => { g.lastSkill = 'quake'; }); out.mirrorQuake = { hazards: i.maxHaz, done: i.done }; }
    { let waves = 0; const [bo, i] = run(4, 'afterimage', 'mirror', () => { g.lastSkill = 'wave'; }, 400, () => { waves = Math.max(waves, g.projectiles.filter(x => x.kind === 'wave' && x.team === 'enemy').length); }); out.mirrorWave = { waves, done: i.done }; }
    { let streaks = 0; const [bo, i] = run(4, 'afterimage', 'execution', () => {}, 400, () => { streaks = Math.max(streaks, g.hazards.filter(x => x instanceof Streak).length); }); out.execution = { streaks, dmg: i.dmg, done: i.done }; }
    { const [bo, i] = run(4, 'afterimage', 'execution', () => { pl.invuln = 9999; }, 400);
      out.executionDodged = { exhausted: bo.state === 'hurt' && bo.hitstun >= 150, done: i.done }; }
    return out;
  });
  console.log(JSON.stringify(r));
  const ok = r.boneCage.hazards >= 6 && r.boneCage.done && r.rendChase.hazards >= 4 && r.featherRang.feathers === 3 && r.featherRang.returned
    && r.ravenSplit.decoys === 2 && r.ravenSplit.fakeArrows >= 2 && r.ravenSplitReveal.splitCleared && r.ravenSplitReveal.endedEarly
    && r.chainHook.pulledTo < 110 && r.chainHook.dmg > 0 && r.tripleStomp.hazards >= 3 && r.soulBraziers.braziers === 3 && r.soulBraziers.souls > 0 && r.soulBraziers.broken
    && r.judgment.dmg > 0 && r.mirrorQuake.hazards >= 1 && r.mirrorWave.waves >= 1 && r.execution.streaks === 5 && r.executionDodged.exhausted
    && Object.values(r).every(x => x.done !== false);
  console.log(ok ? 'PASS' : 'FAIL', 'ERR', errs.join('|') || 'none');
  await b.close();
})();
