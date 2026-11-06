// 演出：技能和必杀的「三拍」
//   蓄力 —— 世界压暗、只留主角身边一圈光（聚光；压暗的形状是光照包的 dim_hole），集中线从屏幕边缘向主角收拢
//   爆发 —— 集中线从主角向外炸开（配合闪光、冲击帧、地面冲击波、光柱，由各招式自己喷）
//   余韵 —— 压暗慢慢退去，残光从地面升起飘散（粒子，由招式喷）
// 这里只管屏幕级的两件事：压暗 + 聚光，和集中线。都只是画面，不影响任何判定和时间。
import { VIEW_W, VIEW_H, REDUCED_MOTION } from './config.js';
import { settings } from './settings.js';
import { tex, tinted } from './fx_tex.js';
import { lightTex } from './fx_art.js';

const DIM_COLOR = '#030208';

const MAXL = 56;

export class Cine {
  constructor() {
    this.dim = 0;        // 当前压暗程度（0～1）
    this.dimHold = 0;    // 还要保持多少帧
    this.dimTo = 0;      // 保持期间的目标值
    this.focus = null;   // 聚光跟随的对象（有 x, y, z）
    this.lineMode = null; // 'in' 收拢 / 'out' 炸开
    this.lineT = 0;
    this.lineColor = '#ffffff';
    this.lines = [];
  }

  // 压暗 + 聚光：dim 目标程度，frames 保持多久，focus 跟着谁
  hold(dim, frames, focus) {
    if (dim >= this.dimTo || this.dimHold <= 0) this.dimTo = dim;
    this.dimHold = Math.max(this.dimHold, frames);
    if (focus) this.focus = focus;
  }
  // 集中线
  speed(mode, frames, color = '#ffffff') {
    if (REDUCED_MOTION || !settings.flash) frames = Math.min(frames, 6);
    this.lineMode = mode;
    this.lineT = frames;
    this.lineColor = color;
    if (mode === 'out') this.lines.length = 0; // 炸开时清掉还在收拢的线
  }
  clear() {
    this.dim = this.dimTo = this.dimHold = this.lineT = 0;
    this.lines.length = 0;
    this.focus = null;
  }

  update() {
    if (this.dimHold > 0) this.dimHold--;
    else this.dimTo = 0;
    // 压下去快（4 帧），退回来慢（约 20 帧），余韵就是这段慢慢亮回来的时间
    this.dim += (this.dimTo - this.dim) * (this.dimTo > this.dim ? 0.25 : 0.06);
    if (this.dim < 0.004) this.dim = 0;
    if (this.lineT > 0) {
      this.lineT--;
      const n = this.lineMode === 'out' ? 7 : 4;
      for (let i = 0; i < n && this.lines.length < MAXL; i++) {
        const a = Math.random() * Math.PI * 2;
        this.lines.push({
          a, w: 1 + Math.random() * 2.5, life: 0, max: this.lineMode === 'out' ? 8 + Math.random() * 6 : 10 + Math.random() * 6,
          r: this.lineMode === 'out' ? 40 + Math.random() * 60 : 560 + Math.random() * 80, len: 90 + Math.random() * 160, out: this.lineMode === 'out',
        });
      }
    }
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const L = this.lines[i];
      L.life++;
      L.r += L.out ? 38 : -30;
      if (L.life >= L.max || (!L.out && L.r < 90)) this.lines.splice(i, 1);
    }
  }

  // 画面变换之外（屏幕坐标）。fx, fy：聚光中心在屏幕上的位置
  // 压暗：光照包的 dim_hole（中心一个柔和的透明洞，往外渐变成不透明的暗色）对准演出焦点。
  // 洞的「半透明」半径约在贴图半宽的 0.68 处：贴图半宽取 345 像素 → 洞边约 235、完全变暗约 310（和原来渐变的 110～360 相当）；
  // 贴图外面用同样的暗色铺满屏幕
  drawDim(ctx, fx, fy) {
    if (this.dim <= 0) return;
    const img = lightTex('dim_hole');
    if (!img) return;
    const R = 345, k = (R * 2) / img.fw, x0 = fx - img.cx * k, y0 = fy - img.cy * k, w = img.width * k, h = img.height * k;
    ctx.save();
    ctx.globalAlpha = 0.82 * this.dim;
    ctx.drawImage(tinted(img, DIM_COLOR), x0, y0, w, h);
    ctx.fillStyle = DIM_COLOR;
    ctx.fillRect(0, 0, VIEW_W, Math.max(0, y0));
    ctx.fillRect(0, y0 + h, VIEW_W, Math.max(0, VIEW_H - y0 - h));
    ctx.fillRect(0, y0, Math.max(0, x0), h);
    ctx.fillRect(x0 + w, y0, Math.max(0, VIEW_W - x0 - w), h);
    ctx.restore();
  }

  drawLines(ctx, fx, fy) {
    if (!this.lines.length) return;
    const T = tex();
    if (!T.light) return;
    const img = tinted(T.streak, this.lineColor); // 集中线用光照包的长光条 light_streak（亮的部分占全长约 3/4）
    const m = ctx.getTransform();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const L of this.lines) {
      const t = L.life / L.max, c = Math.cos(L.a), s = Math.sin(L.a);
      const mid = L.r + (L.out ? L.len / 2 : -L.len / 2);
      const x = fx + c * mid, y = fy + s * mid;
      ctx.globalAlpha = (L.out ? 1 - t : Math.min(1, t * 3) * (1 - t * 0.5)) * 0.55;
      // 光条亮的芯约占贴图高度的 1/3（原来的针芒是实心的），所以按芯的粗细算：线宽 2w 对应 0.35 倍贴图高
      const kx = L.len / img.width, ky = (L.w * 2) / (img.height * 0.35);
      ctx.setTransform(m.a * c * kx + m.c * s * kx, m.b * c * kx + m.d * s * kx, -m.a * s * ky + m.c * c * ky, -m.b * s * ky + m.d * c * ky, m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
    }
    ctx.restore();
  }
}
