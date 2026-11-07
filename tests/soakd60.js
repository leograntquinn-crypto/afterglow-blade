const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message + '\n' + e.stack));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(`http://localhost:${PORT}/index.html`); await p.addInitScript(`window.__DIFF = ${process.env.DIFF || 0}`);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(800);
  await p.keyboard.press('KeyJ'); await p.waitForTimeout(200);
  for (let stage = 0; stage < 5; stage++) {
    const r = await p.evaluate(async (stage) => { const process = { env: { DIFF: window.__DIFF } };
      const g = __game;
      const { addXp, autoUnlock } = await import('./src/progression.js');
      if (g.save.lv < 16) { addXp(g.save, 30000); autoUnlock(g.save); g.refreshStats(); }
      for (const s of ['s1', 's2', 's3', 's4']) g.save.cleared[s] = true;
      g.startStage(stage, +(process.env.DIFF||0));
      const inp = g.input, D = g.dungeon;
      const dirs = { e: [1, 0], w: [-1, 0], n: [0, -1], s: [0, 1] };
      const key = (x, y) => x + ',' + y;
      const route = () => {
        const r = g.room; const prev = new Map([[key(r.x, r.y), null]]); const q = [r];
        while (q.length) { const c = q.shift(); if (c.type === 'boss') { let cur = c, first = null; while (prev.get(key(cur.x, cur.y))) { const [pr, d] = prev.get(key(cur.x, cur.y)); first = d; cur = pr; } return first; }
          for (const d of Object.keys(c.doors)) { const n = D.get(c.x + dirs[d][0], c.y + dirs[d][1]); if (n && !prev.has(key(n.x, n.y))) { prev.set(key(n.x, n.y), [c, d]); q.push(n); } } }
        return null;
      };
      const held = new Set();
      const hold = (a) => { if (!held.has(a)) { inp.press(a); held.add(a); } };
      const rel = (a) => { if (held.has(a)) { inp.release(a); held.delete(a); } };
      const tap = (a) => { inp.press(a); inp.release(a); };
      const acts = ['atk', 'atk', 'atk', 'down', 'up', 'air', 'plunge', 'dash', 'skill1', 'skill2', 'skill3', 'skill4', 'ult', 'charge'];
      let chargeT = 0, plan = null, stuck = { s: '', n: 0, max: 0, where: '' }, err = null, f = 0;
      let lunges = 0, lungesBoss = 0; const stats = { frames: 0, perfect: 0, parry: 0, maxStyle: 0, ults: 0, rooms: 0 };
      const origPD = g.perfectDodge.bind(g); g.perfectDodge = function () { stats.perfect++; return origPD(); };
      const origParry = g.parry.bind(g); g.parry = function (e) { stats.parry++; return origParry(e); };
      const origUlt = g.startUltimate.bind(g); g.startUltimate = function () { stats.ults++; stuck.n = 0; stuck.s = 'ult:#' + stats.ults; return origUlt(); }; // 每次必杀单独计时（挂机脚本强制补满残光槽时，必杀可能首尾相接）
      for (f = 0; f < 60000 && g.scene === 'play'; f++) {
        const pl = g.player;
        pl.hp = pl.maxHp; pl.mp = pl.maxMp;
        if (f % 600 === 0) g.ult = 100;
        for (const a of ['left', 'right', 'up', 'down']) rel(a);
        const foes = g.enemies.filter(e => e.alive && e.team !== 'prop');
        if (chargeT > 0) { chargeT--; if (chargeT === 0) rel('attack'); }
        else if (foes.length) {
          const t = foes.reduce((a, e) => Math.abs(e.x - pl.x) + Math.abs(e.y - pl.y) < Math.abs(a.x - pl.x) + Math.abs(a.y - pl.y) ? e : a);
          const dx = t.x - pl.x, dy = t.y - pl.y;
          if (Math.abs(dy) > 10) hold(dy > 0 ? 'down' : 'up');
          // 一半时间保持中距离，把突刺、弓箭这类攻击引出来
          const kite = Math.floor(f / 600) % 2 === 1;
          if (kite && Math.abs(dx) < 150) hold(dx > 0 ? 'left' : 'right');
          else if (Math.abs(dx) > 80) hold(dx > 0 ? 'right' : 'left');
          // 敌人出招时尝试闪避（测试极限闪避）
          if ((t.state === 'windup' || t.state === 'attack') && Math.random() < 0.15) tap('dash');
          else if (f % 8 === 0) {
            const a = acts[(Math.random() * acts.length) | 0];
            if (Math.abs(dx) > 4) hold(dx > 0 ? 'right' : 'left');
            if (a === 'atk') tap('attack');
            else if (a === 'down') { hold('down'); tap('attack'); }
            else if (a === 'up') { hold('up'); tap('attack'); }
            else if (a === 'air') { tap('jump'); }
            else if (a === 'plunge') { if (pl.z > 40) { hold('down'); tap('attack'); } else tap('attack'); }
            else if (a === 'charge') { hold('attack'); chargeT = 70 + ((Math.random() * 40) | 0); }
            else tap(a === 'skill1' || a === 'skill2' || a === 'skill3' || a === 'skill4' || a === 'ult' || a === 'dash' ? a : 'attack');
            if (pl.state === 'air' && Math.random() < 0.5) tap('attack');
          }
        } else if (g.room.cleared && !g.transition && g.bossDownAt == null) {
          const d = route();
          if (d) {
            if (d === 'e') { pl.x = Math.max(pl.x, g.room.w - 40); hold('right'); }
            if (d === 'w') { pl.x = Math.min(pl.x, 40); hold('left'); }
            if (d === 'n') { pl.x = g.room.w / 2; pl.y = 0; hold('up'); }
            if (d === 's') { pl.x = g.room.w / 2; pl.y = 170; hold('down'); }
          }
        }
        try { g.update(); if (f % 6 === 0) g.render(); } catch (e) { err = e.message + '\n' + e.stack; break; }
        // 卡死检测：主角同一个状态 + 同一招持续太久
        const sig = pl.state === 'ult' ? stuck.s : pl.state + ':' + (pl.move?.id || '');
        if (sig === stuck.s && !['idle', 'run'].includes(pl.state)) { stuck.n++; if (stuck.n > stuck.max) { stuck.max = stuck.n; stuck.where = sig; } } else { stuck.s = sig; stuck.n = 0; }
        stats.maxStyle = Math.max(stats.maxStyle, g.style.rank);
        for (const e of g.enemies) if (e.state === 'attack' && e.atk?.speed && e.st === 1) { lunges++; if (g.room.type === 'boss') lungesBoss++; }
      }
      for (const a of [...held]) rel(a);
      stats.frames = f;
      stats.rooms = [...D.rooms.values()].filter(r => r.visited).length;
      const res = { stage, lunges, lungesBoss, scene: g.scene, err, stuckMax: stuck.max, stuckWhere: stuck.where, kills: g.kills, ...stats, boss: g.boss ? g.boss.name + ' hp=' + Math.round(g.boss.hp) + ' ph=' + g.boss.phase : null };
      if (g.scene !== 'play') { g.openHub(); }
      else { g.endRun(); g.openHub(); }
      return res;
    }, stage);
    console.log(JSON.stringify(r));
  }
  console.log('PAGE ERRORS', errs.join('\n') || 'none');
  await b.close();
})();
