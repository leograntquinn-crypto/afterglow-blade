// 后期处理：光照、泛光（Bloom）、调色、胶片颗粒
//
// 光照图（Light Map）：
//   在一张离屏画布上铺满「黑暗」，再用 destination-out 在每个光源处「挖洞」，
//   最后盖到画面上 —— 光源附近明亮，其他地方沉入黑暗。
//   洞的形状是光照包 fx_light_v1 的手绘 cookie（白 = 被照亮）：通用 light_round、火光 light_flame（4 帧摇曳）、
//   提灯 light_lantern、法术 light_magic。光照包没载好时不挖洞（只有环境暗度），不用代码画的渐变。
//
// 泛光：
//   把发光的东西（火花、刀光、剑气、光柱）再画一份到 glow 画布，
//   缩小到 1/4、1/8 再放大回来（等于便宜的模糊），用 lighter 叠加 —— 亮的东西会「晕开」。

import { VIEW_W, VIEW_H } from './config.js';
import { lightTex, lightFb } from './fx_art.js';

// 光的类型 → cookie
const COOKIE = { round: 'light_round', lantern: 'light_lantern', magic: 'light_magic' };
// cookie 画多大：手绘 cookie 比原来的渐变收得早（通用光约 0.85 半径处就到 0），按「总亮度和原来的渐变一样」放大
// （实测亮度比：通用 0.83、火光 0.81、法术 0.82、提灯 0.58 → 边长 × 1/√比）
const SIZE = { round: 1.1, flame: 1.11, magic: 1.1, lantern: 1.31 };

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
    this.grainC = null; // 颗粒（光照包 grain，按原来的强度换算一次）
  }

  // 光源（屏幕坐标）：r 半径，a 亮度（0~1），kind：round 通用 / flame 火光 / lantern 提灯、灯塔 / magic 法术、能量
  addLight(x, y, r, a = 1, kind = 'round') {
    if (x < -r || x > VIEW_W + r || y < -r || y > VIEW_H + r) return;
    this.lights.push({ x, y, r, a, kind });
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

  // t：帧计数（火光 cookie 按 8 fps 换帧；每个火光错开一点相位，不会一起跳）
  applyLighting(ctx, ambient, t = 0) {
    const L = this.lctx, ls = this.lights;
    L.globalCompositeOperation = 'source-over';
    L.clearRect(0, 0, VIEW_W, VIEW_H);
    L.fillStyle = ambient;
    L.fillRect(0, 0, VIEW_W, VIEW_H);
    L.globalCompositeOperation = 'destination-out';
    const flame = lightFb('light_flame');
    for (const l of ls) {
      let img;
      if (l.kind === 'flame' && flame) { const n = flame.frames.length; img = flame.frames[(((Math.floor(t / (60 / flame.fps) + l.x * 0.013)) % n) + n) % n]; }
      else img = lightTex(COOKIE[l.kind] ?? 'light_round');
      if (!img) continue;
      // cookie 的整张画布（裁边前）对应直径 2r
      const k = (l.r * 2 * (SIZE[l.kind] ?? 1.1)) / (img.fw ?? flame.w);
      L.globalAlpha = Math.min(1, l.a);
      L.drawImage(img, l.x - img.cx * k, l.y - img.cy * k, img.width * k, img.height * k);
    }
    L.globalAlpha = 1;
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
    const G = grain && this.grainTex();
    if (!G) { ctx.restore(); return; }
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.07;
    const S = G.width, ox = (t * 73) % S, oy = (t * 151) % S;
    for (let x = -ox; x < VIEW_W; x += S) for (let y = -oy; y < VIEW_H; y += S) ctx.drawImage(G, x, y);
    ctx.restore();
  }

  // 颗粒：光照包的 grain（四方连续的灰度噪点，起伏约 ±10；图集里存成不透明，见 build_fx.py）。
  // 画法沿用原来的 overlay 7%：把起伏按原来的强度放大（标准差 10 → 74），只算一次。没载好返回 null（不画颗粒）
  grainTex() {
    if (this.grainC) return this.grainC;
    const g = lightTex('grain');
    if (!g) return null;
    const c = mk(g.width, g.height), x = c.getContext('2d');
    x.drawImage(g, 0, 0);
    const img = x.getImageData(0, 0, c.width, c.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.max(0, Math.min(255, 128 + (d[i] - 128) * GRAIN_GAIN));
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    x.putImageData(img, 0, 0);
    return (this.grainC = c);
  }
}

// 颗粒强度换算：交付的 grain 起伏（标准差约 10）放大到原来随机噪点的起伏（约 74）
export const GRAIN_GAIN = 7.4;
