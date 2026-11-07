// 跑步标定核对：战斗、地图两种跑速，横 / 竖 / 斜，一圈多少秒、着地脚在世界里漂了多少
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`http://localhost:${process.env.PORT || 8767}/index.html`); await p.waitForTimeout(2500);
  const r = await p.evaluate(async () => {
    const g = __game; const SP = await import('./src/sprite.js'); const { heroSprite, heroFrame, HERO_SCALE, RUN_FOOT, RUN_DIST, RUN_CYCLE_LEN } = SP; await heroSprite.load();
    // 一段帧序列 → 每圈帧数、着地脚（世界坐标）在同一只脚的着地帧之间漂了多少
    const stat = (frames, xs, faces, k) => {
      const starts = []; for (let i = 1; i < frames.length; i++) if (frames[i] === 0 && frames[i - 1] !== 0) starts.push(i);
      const cyc = starts.slice(1).map((s, j) => s - starts[j]);
      let maxDrift = 0, sum = 0, n = 0, anchor = null;
      for (let i = 0; i < frames.length; i++) { const f = frames[i]; if (f % 4 === 3) { anchor = null; continue; }
        if (i && frames[i - 1] === f) continue; // 只看每帧刚换上的那一刻
        const foot = xs[i] + faces[i] * (RUN_FOOT[f] - 220) * k;
        if (anchor === null || f % 4 === 0) anchor = foot; else { const d = Math.abs(foot - anchor); maxDrift = Math.max(maxDrift, d); sum += d; n++; } }
      const avg = cyc.length ? cyc.reduce((a, c) => a + c, 0) / cyc.length : 0;
      return { framesPerCycle: +avg.toFixed(1), seconds: +(avg / 60).toFixed(3), footDriftMax: +maxDrift.toFixed(1), footDriftAvg: +(sum / Math.max(1, n)).toFixed(1), seq: frames.slice(0, 64).join('') };
    };
    const out = { table: RUN_DIST.map((d) => +d.toFixed(2)), cycle: +RUN_CYCLE_LEN.toFixed(1) };
    // 地图
    const w = g.world; for (let t = 0; t < 200 && !w.mapReady(); t++) await new Promise((r) => setTimeout(r, 100)); out.mapReady = w.mapReady(); const MS = (0.54 * 58) / 96;
    for (const [name, dx, dy] of [['map_right', 1, 0], ['map_left', -1, 0], ['map_up', 0, -1], ['map_down', 0, 1], ['map_diag', 0.707, 0.707], ['map_half', 0.5, 0]]) {
      let fr = [], xs = [], fc = [];
      for (const [sx, sy] of [[1200, 1150], [1200, 1210], [900, 1000], [700, 1100], [1500, 1000], [1200, 800], [1000, 1300]]) {
        w.hero.x = sx; w.hero.y = sy; w.hero.phase = 0; w.ev = null; w.events = []; w.fadeIn = 0;
        const f2 = [], x2 = [], c2 = [];
        for (let i = 0; i < 200; i++) { const ox = w.hero.x, oy = w.hero.y; w.update({ dx, dy }, { title: false, frozen: false }); if (Math.hypot(w.hero.x - ox - dx * 2.4, w.hero.y - oy - dy * 1.92) > 0.05) { if (f2.length) break; continue; } f2.push(SP.runFrame(w.hero.phase)); x2.push(w.hero.x); c2.push(w.hero.facing); }
        if (f2.length > fr.length) { fr = f2; xs = x2; fc = c2; } }
      out[name] = { ...stat(fr, xs, fc, MS * 0.5), n: fr.length };
    }
    // 战斗
    for (const [name, keys] of [['battle_right', ['right']], ['battle_left', ['left']], ['battle_up', ['up']], ['battle_diag', ['right', 'down']], ['battle_stickdiag', 'stick']]) {
      g.story.clear(); g.startStage(0, 0, false); g.story.clear(); for (let i = 0; i < 30; i++) g.update();
      g.enemies = []; g.spawnQueue = []; const pl = g.player; pl.x = 500; pl.y = (g.stage?.floor?.[0] ?? pl.y);
      if (keys === 'stick') { g.input.stick.x = 0.707; g.input.stick.y = 0.707; } else for (const k of keys) g.input.press(k); const fr = [], xs = [], fc = [], ys = [];
      for (let i = 0; i < 240; i++) { if (keys === 'stick') { g.input.stick.x = 0.707; g.input.stick.y = 0.707; } g.update(); pl.hp = pl.maxHp; if (pl.state !== 'run' || Math.hypot(pl.x - (pl.__px ?? pl.x), pl.y - (pl.__py ?? pl.y)) < 0.5) { pl.__px = pl.x; pl.__py = pl.y; if (fr.length) break; continue; } pl.__px = pl.x; pl.__py = pl.y; fr.push(SP.runFrame(pl.runDist)); xs.push(pl.x); fc.push(pl.facing); ys.push(pl.y); }
      if (keys === 'stick') { g.input.stick.x = 0; g.input.stick.y = 0; } else for (const k of keys) g.input.release(k);
      out[name] = { ...stat(fr, xs, fc, HERO_SCALE * 0.5), faces: [...new Set(fc)].join(','), speed: +(Math.hypot(xs[20] - xs[10], ys[20] - ys[10]) / 10).toFixed(2), n: fr.length };
    }
    return out;
  });
  console.log(JSON.stringify(r, null, 1)); console.log('ERR', errs.join('|') || 'none'); await b.close(); })();
