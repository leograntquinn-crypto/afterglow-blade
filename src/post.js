// 后期处理：光照、泛光（Bloom）、调色、胶片颗粒
//
// 光照图（Light Map）：
//   在一张离屏画布上铺满「黑暗」，再用 destination-out 在每个光源处「挖洞」，
//   最后盖到画面上 —— 光源附近明亮，其他地方沉入黑暗。几十个径向渐变，开销很小。
//
// 泛光：
//   把发光的东西（火花、刀光、剑气、光柱）再画一份到 glow 画布，
//   缩小到 1/4、1/8 再放大回来（等于便宜的模糊），用 lighter 叠加 —— 亮的东西会「晕开」。

import { VIEW_W, VIEW_H } from './config.js';

const mk = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

export class Post {
  constructor() {
    this.light = mk(VIEW_W, VIEW_H);
    this.lctx = this.light.getContext('2d');
    this.glow = mk(VIEW_W, VIEW_H);
    this.gctx = this.glow.getContext('2d');
    this.s1 = mk(VIEW_W / 4, VIEW_H / 4);
    this.s2 = mk(VIEW_W / 8, VIEW_H / 8);
    this.lights = [];
    // 颗粒噪点贴图
    this.grain = mk(256, 256);
    const g = this.grain.getContext('2d'), img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }

  // 光源（屏幕坐标）：r 半径，a 亮度（0~1）
  addLight(x, y, r, a = 1) {
    if (x < -r || x > VIEW_W + r || y < -r || y > VIEW_H + r) return;
    this.lights.push(x, y, r, a);
  }

  // 每帧开始时清空泛光层，并设置与世界层相同的变换（震屏、镜头推近）
  beginGlow(apply) {
    const g = this.gctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, VIEW_W, VIEW_H);
    apply(g);
    g.globalCompositeOperation = 'lighter';
    return g;
  }

  applyLighting(ctx, ambient) {
    const L = this.lctx, ls = this.lights;
    L.globalCompositeOperation = 'source-over';
    L.clearRect(0, 0, VIEW_W, VIEW_H);
    L.fillStyle = ambient;
    L.fillRect(0, 0, VIEW_W, VIEW_H);
    L.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < ls.length; i += 4) {
      const x = ls[i], y = ls[i + 1], r = ls[i + 2], a = ls[i + 3];
      const g = L.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${a})`);
      g.addColorStop(0.5, `rgba(0,0,0,${a * 0.55})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      L.fillStyle = g;
      L.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ls.length = 0;
    ctx.drawImage(this.light, 0, 0, VIEW_W, VIEW_H);
  }

  applyBloom(ctx, strength = 1) {
    const a = this.s1.getContext('2d'), b = this.s2.getContext('2d');
    a.clearRect(0, 0, this.s1.width, this.s1.height);
    a.drawImage(this.glow, 0, 0, this.s1.width, this.s1.height);
    b.clearRect(0, 0, this.s2.width, this.s2.height);
    b.drawImage(this.s1, 0, 0, this.s2.width, this.s2.height);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.75 * strength;
    ctx.drawImage(this.s1, 0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = 0.9 * strength;
    ctx.drawImage(this.s2, 0, 0, VIEW_W, VIEW_H);
    ctx.restore();
  }

  // 调色（柔光叠一层主题色）+ 会跳动的颗粒
  applyGrade(ctx, color, t, grain = true) {
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (!grain) { ctx.restore(); return; }
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.07;
    const ox = (t * 73) % 256, oy = (t * 151) % 256;
    for (let x = -ox; x < VIEW_W; x += 256) for (let y = -oy; y < VIEW_H; y += 256) ctx.drawImage(this.grain, x, y);
    ctx.restore();
  }
}
