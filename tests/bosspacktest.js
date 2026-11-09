// 子轮 H：首领特效包按关卡载入 / 释放（H-1、H-5）：每一关只载这一关首领的那套，换关释放别的
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765;
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.goto(`http://localhost:${PORT}/index.html`); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(1500);
  const r = await p.evaluate(async () => {
    const g = __game; const { FX_ART } = await import('./src/fx_art.js');
    for (const s of ['s1', 's2', 's3', 's4']) g.save.cleared[s] = true;
    const packs = ['bone', 'bonev2', 'raven', 'ironjaw', 'warden', 'wardenv2', 'afterimage'];
    const want = { 0: ['bone', 'bonev2'], 1: ['raven'], 2: ['ironjaw'], 3: ['warden', 'wardenv2'], 4: ['afterimage'] };
    const out = {};
    for (const st of [0, 1, 2, 3, 4, 2, 0]) {
      g.story.clear(); g.startStage(st, 0, false); g.story.clear();
      for (let i = 0; i < 80 && want[st].some((k) => !FX_ART[k].ready); i++) await new Promise((r) => setTimeout(r, 100));
      const state = Object.fromEntries(packs.map((k) => [k, FX_ART[k].ready]));
      const items = want[st].map((k) => Object.keys(FX_ART[k].items).length);
      out[`${st}_${Object.keys(out).length}`] = { boss: g.stage.boss, state, items };
    }
    return out;
  });
  console.log(JSON.stringify(r));
  const want = { 0: ['bone', 'bonev2'], 1: ['raven'], 2: ['ironjaw'], 3: ['warden', 'wardenv2'], 4: ['afterimage'] };
  for (const [k, v] of Object.entries(r)) {
    const st = +k.split('_')[0];
    const only = Object.entries(v.state).every(([name, ready]) => ready === want[st].includes(name));
    ok(only && v.items.every((n) => n > 0), `第 ${st + 1} 关（${v.boss}）：只载入 ${want[st].join(' + ')}（${v.items.join(' + ')} 项），其他首领的特效包都释放了`);
  }
  ok(!errs.length, 'PAGE ERRORS ' + (errs.join(' | ') || 'none'));
  console.log(bad ? `BOSSPACKTEST FAIL ${bad}` : 'BOSSPACKTEST ok');
  await b.close();
})();
