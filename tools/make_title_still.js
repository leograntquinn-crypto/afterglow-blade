// 生成封面定格图 assets/world/title_still(_m).webp：用真实素材渲染封面镜头的第一帧（不带标题字）。
// 大地图素材（图集）还没下完的时候，封面先显示这张小图，而不是程序画的占位地图。地图素材或封面镜头改了就重新生成。
// 用法：先在项目根目录起一个静态服务器（python3 -m http.server 8765），然后 node tools/make_title_still.js
const { chromium } = require('playwright');
const fs = require('fs');
const PORT = process.env.PORT || 8765;
(async () => {
  const b = await chromium.launch();
  // 桌面：1920×1080（2 倍）；手机：960×540
  for (const [suf, w, h, mobile, q] of [['', 1920, 1080, false, 0.62], ['_m', 960, 540, true, 0.6]]) {
    const ctx = await b.newContext(mobile ? { viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    await p.goto(`http://localhost:${PORT}/index.html`);
    await p.waitForFunction(() => window.__game?.world?.mapReady(), null, { timeout: 60000 });
    const data = await p.evaluate(async (q) => {
      const g = __game, W = g.world;
      // 封面镜头第一帧的位置（world.js 的 titleCam：从深渊上方开始）
      W.cam.x = Math.max(0, Math.min(2400 - 960, 1200 - 960 / 2));
      W.cam.y = Math.max(0, Math.min(1500 - 540, 300 - 540 * 0.58));
      W.motes = [];
      for (let i = 0; i < 90; i++) W.updateMotes(); // 深渊的光点铺开一点
      g.paused = true;
      g.stillCapture = true;
      // 地面区块一帧只画一块：多画几次，确保都画好了
      for (let i = 0; i < 12; i++) g.render();
      g.stillCapture = false;
      return g.canvas.toDataURL('image/webp', q);
    }, q);
    const out = `assets/world/title_still${suf}.webp`;
    fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
    console.log(out, fs.statSync(out).size, 'bytes');
    await ctx.close();
  }
  await b.close();
})();
