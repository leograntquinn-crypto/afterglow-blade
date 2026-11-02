// 演出：技能和必杀的「三拍」
//   蓄力 —— 世界压暗、只留主角身边一圈光（聚光），集中线从屏幕边缘向主角收拢
//   爆发 —— 集中线从主角向外炸开（配合闪光、冲击帧、地面冲击波、光柱，由各招式自己喷）
//   余韵 —— 压暗慢慢退去，残光从地面升起飘散（粒子，由招式喷）
// 这里只管屏幕级的两件事：压暗 + 聚光，和集中线。都只是画面，不影响任何判定和时间。
import { VIEW_W, VIEW_H, REDUCED_MOTION } from './config.js';
import { settings } from './settings.js';
import { tex, tinted } from './fx_tex.js';

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
  drawDim(ctx, fx, fy) {
    if (this.dim <= 0) return;
    const r0 = 110, r1 = 360;
    const g = ctx.createRadialGradient(fx, fy, r0, fx, fy, r1);
    g.addColorStop(0, 'rgba(3,2,8,0)');
    g.addColorStop(1, `rgba(3,2,8,${0.82 * this.dim})`);
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();
  }

  drawLines(ctx, fx, fy) {
    if (!this.lines.length) return;
    const T = tex(), img = tinted(T.needle, this.lineColor);
    const m = ctx.getTransform();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const L of this.lines) {
      const t = L.life / L.max, c = Math.cos(L.a), s = Math.sin(L.a);
      const mid = L.r + (L.out ? L.len / 2 : -L.len / 2);
      const x = fx + c * mid, y = fy + s * mid;
      ctx.globalAlpha = (L.out ? 1 - t : Math.min(1, t * 3) * (1 - t * 0.5)) * 0.55;
      const kx = L.len / 128, ky = L.w / 6;
      ctx.setTransform(m.a * c * kx + m.c * s * kx, m.b * c * kx + m.d * s * kx, -m.a * s * ky + m.c * c * ky, -m.b * s * ky + m.d * c * ky, m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f);
      ctx.drawImage(img, -64, -6);
    }
    ctx.restore();
  }
}
