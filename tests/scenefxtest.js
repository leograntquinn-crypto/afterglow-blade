// 场景模块：固定时钟，在独立画布记录贴图身份和路径调用，不依赖截图像素。
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765;
let bad = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };

async function exercise(proc) {
  const g = window.__game;
  const art = await import('./src/fx_art.js');
  const scenery = await import('./src/scenery.js');
  const { drawDoors } = await import('./src/draw.js');
  const { propsL, propsS } = await import('./src/props_sprites.js');
  const { tinted } = await import('./src/fx_tex.js');
  const { worldSave } = await import('./src/world_story.js');
  const wait = async (fn) => {
    for (let i = 0; i < 100 && !fn(); i++) await new Promise(r => setTimeout(r, 100));
    if (!fn()) throw new Error('素材载入超时');
  };
  const own = Object.hasOwn(g, 'update'), update = g.update;
  g.update = () => {};
  const out = {};
  try {
    await wait(() => art.FX_ART.scene.ready && art.FX_ART.light.ready);
    out.boot = !g.stage && ['title', 'world'].includes(g.scene);
    const cv = document.createElement('canvas'); cv.width = 960; cv.height = 540;
    const ctx = cv.getContext('2d'), assets = new Map();
    let rows = [], counts = {};
    const register = (id, asset, color = null) => {
      (asset?.frames || (asset ? [asset] : [])).forEach((img, frame) => {
        if (img) assets.set(color ? tinted(img, color) : img, { id, frame, color });
      });
    };
    const color = 'rgb(' + scenery.THEMES.crypt.torch + ')';
    register('torch_flame', art.flipbook('torch_flame'), color);
    register('torch_glow_base', art.sceneTex('torch_glow_base'), color);
    register('stairs_down', art.sceneTex('stairs_down'));
    for (const c of ['#ff4d5e', '#7ff3ff']) register('stairs_glow', art.sceneTex('stairs_glow'), c);
    register('trial_runes', art.sceneTex('trial_runes'), '#7ff3ff');
    register('glow_warm', art.lightTex('glow_warm'), color);
    for (const c of ['rgb(255,77,94)', 'rgb(127,243,255)']) register('door_light', art.lightTex('door_light'), c);
    for (const name of ['drawImage', 'ellipse', 'lineTo', 'stroke', 'fill', 'fillRect', 'beginPath', 'arc', 'moveTo', 'closePath']) {
      const original = ctx[name].bind(ctx);
      ctx[name] = (...args) => {
        counts[name] = (counts[name] || 0) + 1;
        if (name === 'drawImage' && assets.has(args[0])) rows.push({ ...assets.get(args[0]), xy: args.slice(1) });
        return original(...args);
      };
    }
    const draw = fn => { rows = []; counts = {}; ctx.clearRect(0, 0, 960, 540); const result = fn(); return { rows, counts, result }; };
    const has = (r, id) => r.rows.some(q => q.id === id);
    const no = (r, ...names) => names.every(n => !r.counts[n]);
    // 用真实地图生成试炼碑发光列表，再单独测 drawGlow，避免地图本体的路径干扰计数。
    g.save.cleared.s1 = true; worldSave(g.save).trial = true;
    const W = g.world;
    W.flare.trial = null; W.motes = [];
    W.draw(ctx, 60);
    W.frameGlows = W.frameGlows.filter(q => q.rune);
    const rune = draw(() => W.drawGlow(ctx, 60));
    out.runes = W.frameGlows.length > 0 && has(rune, 'trial_runes') && no(rune, 'ellipse', 'stroke');
    g.story.clear(); g.startStage(0, 0, false); g.story.clear();
    if (!proc) await wait(() => scenery.envStatus().ready && propsS.ready);
    if (proc && scenery.envStatus().ready) throw new Error('程序场景隔离失败');
    const torch = t => draw(() => scenery.drawScenery(ctx, 0, t, 'crypt', g.room));
    let sample, tick;
    // 透明帧是合法空帧；在一个周期内找相邻两支都可见的确定时刻。
    for (tick = 0; tick < 120; tick++) {
      sample = torch(tick);
      if (sample.rows.filter(q => q.id === 'torch_flame').length === sample.result.length && sample.result.length >= 2) break;
    }
    const flames = sample.rows.filter(q => q.id === 'torch_flame');
    const repeat = torch(tick).rows.filter(q => q.id === 'torch_flame');
    out.torches = no(sample, 'ellipse') && has(sample, 'torch_glow_base') && flames.length >= 2 &&
      flames[0].frame !== flames[1].frame && JSON.stringify(flames) === JSON.stringify(repeat);
    out.torchDetail = { tick, frames: flames.map(q => q.frame), counts: sample.counts };
    for (const cleared of [false, true]) {
      const r = draw(() => drawDoors(ctx, 0, { doors: { s: true }, cleared }, 60));
      out[cleared ? 'stairsOpen' : 'stairsLocked'] = has(r, 'stairs_down') &&
        r.rows.some(q => q.id === 'stairs_glow' && q.color === (cleared ? '#7ff3ff' : '#ff4d5e')) && no(r, 'lineTo', 'stroke');
    }
    const ready = propsL.ready;
    propsL.ready = false;
    try {
      out.arch = [false, true].every(cleared => {
        const r = draw(() => drawDoors(ctx, 0, { doors: { n: true }, cleared }, 60));
        return has(r, 'door_light') && r.counts.drawImage === 1 && no(r, 'fill', 'stroke', 'beginPath', 'lineTo', 'arc');
      });
      if (proc) {
        const r = draw(() => scenery.drawForeground(ctx, 0, 60, 'crypt', g.room));
        // 浮尘保留：只允许原有的小矩形，不应出现贴图或链条、骨头路径。
        out.foreground = r.counts.fillRect === 70 && no(r, 'drawImage', 'beginPath', 'ellipse', 'lineTo', 'stroke', 'fill');
      }
      const sceneReady = art.FX_ART.scene.ready;
      art.FX_ART.scene.ready = false;
      try {
        const t = torch(tick);
        const s = draw(() => drawDoors(ctx, 0, { doors: { s: true }, cleared: false }, 60));
        const r = draw(() => W.drawGlow(ctx, 60));
        const a = draw(() => drawDoors(ctx, 0, { doors: { n: true }, cleared: false }, 60));
        out.unloaded = ![t, s, r].some(x => x.rows.some(q => ['torch_flame', 'torch_glow_base', 'stairs_down', 'stairs_glow', 'trial_runes'].includes(q.id))) &&
          has(t, 'glow_warm') && has(a, 'door_light') && no(t, 'ellipse') && no(s, 'lineTo', 'stroke') && no(r, 'ellipse', 'stroke');
      } finally { art.FX_ART.scene.ready = sceneReady; }
    } finally { propsL.ready = ready; }
    return out;
  } finally { if (own) g.update = update; else delete g.update; }
}

(async () => {
  let browser;
  const errors = [];
  try {
    browser = await chromium.launch();
    for (const proc of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
      try {
        await context.addInitScript(() => { localStorage.clear(); window.__aiSeed = 2468; });
        if (proc) await context.route('**/assets/env/**', route => route.abort());
        const page = await context.newPage();
        page.on('pageerror', e => errors.push(e.message));
        await page.goto('http://localhost:' + PORT + '/index.html');
        await page.waitForFunction(() => !!window.__game);
        const r = await page.evaluate(exercise, proc);
        console.log(JSON.stringify({ proc, ...r }));
        for (const key of ['boot', 'torches', 'stairsLocked', 'stairsOpen', 'runes', 'arch', 'unloaded', ...(proc ? ['foreground'] : [])]) {
          ok(r[key], (proc ? '程序场景 ' : '素材场景 ') + key);
        }
      } finally { await context.close(); }
    }
  } catch (e) { ok(false, e.stack || e.message); }
  finally { await browser?.close(); }
  ok(!errors.length, 'PAGE ERRORS ' + (errors.join(' | ') || 'none'));
  console.log(bad ? 'SCENEFXTEST FAIL ' + bad : 'SCENEFXTEST ok');
  if (bad) process.exitCode = 1;
})();
