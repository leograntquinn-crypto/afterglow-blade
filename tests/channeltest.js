const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message + '\n' + e.stack));
  await p.addInitScript(`window.__LV = ${process.env.LV || 7}`); await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(1200);
  await p.keyboard.press('KeyJ'); await p.waitForTimeout(300);
  const r = await p.evaluate(async () => {
    const { Boss } = await import('./src/boss.js'); const { addXp, autoUnlock } = await import('./src/progression.js');
    const g = __game; for (const s of ['s1','s2','s3']) g.save.cleared[s] = true; g.save.lv = +(window.__LV || 7); g.save.skills.skill2 = 3; autoUnlock(g.save); g.refreshStats();
    const out = {};
    const setup = (key) => {
      g.startStage(2); for (let i = 0; i < 60; i++) g.update();
      g.enemies = g.enemies.filter(e => e.team === 'prop'); g.spawnQueue = []; g.hazards = [];
      const pl = g.player; pl.hp = pl.maxHp = 1e6; pl.mp = pl.maxMp = 9999;
      const bo = new Boss(key, 600, 90, g, g.stage.lv); bo.setState('idle'); g.enemies.push(bo); g.boss = bo;
      for (let i = 0; i < 40; i++) g.update();
      bo.phase = 1; bo.startAct('channel'); g.update();
      pl.x = 545; pl.y = 90; pl.facing = 1; pl.setState('idle');
      return { bo, pl };
    };
    const cyc = ['slash1', 'slash2', 'slash3'];
    // 1) 只用普攻连按：看能不能打断
    let { bo, pl } = setup('ironJaw'); let k = 0, frames = 0; bo.channel.need = 999; let maxPts = 0;
    while (bo.channel && frames < 400) { maxPts = bo.channel.pts; if (pl.state === 'idle' || (pl.move && pl.mf >= (pl.move.cancel ?? 99) && !pl.move.skill)) { pl.startMove(g, cyc[k++ % 3]); } pl.x = bo.x - 55; g.update(); frames++; }
    out.normalOnly = { armor: Math.round(bo.armor), maxArmor: bo.maxArmor, maxPts, interrupted: bo.state === 'hurt', pts: bo.channel?.pts ?? 'done', frames, hpLost: pl.dmgTaken };
    // 2) 普攻 + 技能
    ({ bo, pl } = setup('ironJaw')); k = 0; frames = 0; let usedSkill = false;
    const T = bo.channel.T, need = bo.channel.need; bo.channel.need = 999; let maxS = 0;
    while (bo.channel && frames < 400) {
      if (pl.state === 'idle' || (pl.move && pl.mf >= (pl.move.cancel ?? 99))) { if (!usedSkill && frames > 30) { pl.startMove(g, 'whirl'); usedSkill = true; } else pl.startMove(g, cyc[k++ % 3]); }
      maxS = bo.channel.pts; pl.x = bo.x - 55; const before = bo.channel?.pts; g.update(); frames++; if (bo.channel) out.trace = (out.trace || '') + (bo.channel.pts !== before ? bo.channel.pts + '@' + frames + '(' + (pl.move?.id||pl.state) + ') ' : '');
    }
    out.withSkill = { maxS, interrupted: bo.state === 'hurt', brokenT: bo.brokenT, frames, T, need, hazards: g.hazards.filter(h => !h.dead).length };
    // 3) 不打：读条结束爆炸；站地上挨打 vs 跳起来
    ({ bo, pl } = setup('boneLord')); pl.x = 300; const hp0 = pl.hp; for (let i = 0; i < 260 && bo.state === 'attack'; i++) g.update();
    out.ignored = { hitPlayer: pl.hp < hp0, dmg: hp0 - pl.hp };
    ({ bo, pl } = setup('boneLord')); pl.x = 300; const hp1 = pl.hp; const T2 = bo.channel.T;
    for (let i = 0; i < 260 && bo.state === 'attack'; i++) { if (bo.act && bo.act.t === T2 - 14) pl.jump(g); g.update(); }
    out.jumped = { hitPlayer: pl.hp < hp1 };
    return out;
  });
  console.log(JSON.stringify(r, null, 1)); console.log('ERR', errs.join('\n') || 'none');
  await b.close();
})();
