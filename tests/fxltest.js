// 光照包 fx_light_v1 接入回归（子轮 F）
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765;
const IDS = ['glow_soft', 'glow_warm', 'glow_core', 'spark_needle', 'light_streak', 'cut_mark', 'mote', 'ember', 'light_round', 'light_lantern', 'light_magic', 'vignette', 'dim_hole', 'grain', 'seal_fog', 'chest_glow', 'shrine_glow', 'door_light', 'exit_chevron'];
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  for (const mobile of [false, true]) {
    const ctx = await b.newContext(mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`http://localhost:${PORT}/index.html`); await p.waitForTimeout(2500);
    const r = await p.evaluate(async (IDS) => {
      const g = __game; const { FX_ART } = await import('./src/fx_art.js'); const { tex } = await import('./src/fx_tex.js'); const { VIEW_W, VIEW_H } = await import('./src/config.js');
      for (let i = 0; i < 50 && !(FX_ART.light.ready && FX_ART.lightFb.ready); i++) await new Promise((r) => setTimeout(r, 100));
      const items = FX_ART.light.items, fb = FX_ART.lightFb.items, T = tex();
      const o = { ready: FX_ART.light.ready && FX_ART.lightFb.ready, ids: Object.keys(items).sort().join(','), want: [...IDS].sort().join(','),
        flame: fb.light_flame && [fb.light_flame.frames.length, fb.light_flame.fps, fb.light_flame.loop], beam: fb.loot_beam && [fb.loot_beam.frames.length, fb.loot_beam.fps, fb.loot_beam.loop],
        texMap: T.glow === items.glow_soft && T.core === items.glow_core && T.needle === items.spark_needle && T.streak === items.light_streak && T.cut === items.cut_mark && T.ember === items.ember && !!T.glow.ux };
      // 源码里不再有代码生成的光效
      const src = async (f) => (await fetch('./src/' + f)).text();
      o.noProc = !/function make(Glow|Core|Streak|Needle)\b/.test(await src('fx_tex.js'));
      o.noGrad = [];
      for (const f of ['post.js', 'cine.js', 'draw.js', 'loot.js']) if (/create(Radial|Linear)Gradient/.test(await src(f))) o.noGrad.push(f);
      // props.js：宝箱、泉水的光（陶罐素材没载好时的程序占位画法有个渐变，不是光效，不算）
      const pr = await src('props.js'); if (/create(Radial|Linear)Gradient/.test(pr.slice(0, pr.indexOf('export class Urn')))) o.noGrad.push('props.js(宝箱/泉水)');
      // 光照：一个火光、一个通用光挖洞，洞心比环境暗度透明
      const post = g.post; post.addLight(300, 300, 200, 1, 'flame'); post.addLight(700, 300, 200, 1);
      const c = document.createElement('canvas'); c.width = VIEW_W; c.height = VIEW_H; const cx = c.getContext('2d');
      post.applyLighting(cx, 'rgba(0,0,0,0.6)', 10);
      const lk = post.light.width / VIEW_W, A = (x, y) => post.lctx.getImageData(Math.floor(x * lk), Math.floor(y * lk), 1, 1).data[3];
      o.light = [A(300, 290), A(700, 300), A(80, 80)];
      // 颗粒：不透明、起伏按原来的强度换算
      const G = post.grainTex(), gd = G.getContext('2d').getImageData(0, 0, G.width, G.height).data; let s = 0, s2 = 0, n = 0, op = true;
      for (let i = 0; i < gd.length; i += 4) { s += gd[i]; s2 += gd[i] * gd[i]; n++; if (gd[i + 3] !== 255) op = false; }
      o.grain = { std: +Math.sqrt(s2 / n - (s / n) ** 2).toFixed(1), opaque: op };
      // 压暗：焦点处透明、远处变暗
      g.cine.dim = 1; const d = document.createElement('canvas'); d.width = VIEW_W; d.height = VIEW_H; const dx = d.getContext('2d');
      g.cine.drawDim(dx, 300, 270); const D = (x, y) => dx.getImageData(x, y, 1, 1).data[3]; o.dim = [D(300, 270), D(920, 40), D(300 + 330, 270)]; g.cine.dim = 0;
      // 跑一段战斗 + 大地图（含 WebGL 合成），不出错
      g.story.clear(); g.startStage(0, 0, false); g.story.clear(); for (let i = 0; i < 120; i++) { g.update(); g.render(); g.player.hp = g.player.maxHp; }
      return o;
    }, IDS);
    const tag = mobile ? '[手机]' : '[桌面]';
    ok(r.ready && r.ids === r.want, `${tag} 19 张贴图齐全`);
    ok(JSON.stringify(r.flame) === '[4,8,true]' && JSON.stringify(r.beam) === '[6,12,true]', `${tag} 序列帧 light_flame ${r.flame} / loot_beam ${r.beam}`);
    ok(r.texMap, `${tag} glow/core/needle/streak/cut/ember 都是光照包的贴图`);
    ok(r.noProc, `${tag} fx_tex.js 里没有 makeGlow/makeCore/makeStreak/makeNeedle`);
    ok(!r.noGrad.length, `${tag} post/cine/draw/loot、宝箱 / 泉水里没有渐变 ${r.noGrad}`);
    ok(r.light[0] < 60 && r.light[1] < 40 && r.light[2] > 140, `${tag} 光照挖洞 火光 ${r.light[0]} / 通用 ${r.light[1]} / 远处 ${r.light[2]}`);
    ok(r.grain.opaque && r.grain.std > 50 && r.grain.std < 95, `${tag} 颗粒不透明、起伏 ${r.grain.std}`);
    ok(r.dim[0] < 10 && r.dim[1] > 190 && r.dim[2] > 150, `${tag} 压暗 焦点 ${r.dim[0]} / 角落 ${r.dim[1]} / 330 外 ${r.dim[2]}`);
    ok(!errs.length, `${tag} 页面无错误 ${errs.join('|')}`);
    await ctx.close();
  }
  // WebGL 合成（强制在软件渲染下打开）：暗角、颗粒贴图上传后不退回 Canvas
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`http://localhost:${PORT}/index.html?gl=force`); await p.waitForTimeout(2500);
  const gl = await p.evaluate(async () => { const g = __game; const { FX_ART } = await import('./src/fx_art.js'); for (let i = 0; i < 50 && !FX_ART.light.ready; i++) await new Promise((r) => setTimeout(r, 100));
    g.story.clear(); g.startStage(0, 0, false); g.story.clear(); for (let i = 0; i < 60; i++) { g.update(); g.render(); } return { ok: g.glpost.ok, art: !!g.glpost.art }; });
  ok(gl.ok && gl.art && !errs.length, `WebGL 合成：仍在用 ${gl.ok}、贴图已上传 ${gl.art} ${errs.join('|')}`);
  console.log(bad ? `FXLTEST FAIL ${bad}` : 'FXLTEST ok'); await b.close();
})();
