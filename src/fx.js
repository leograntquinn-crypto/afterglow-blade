// 特效系统：火花、刀光、冲击环、尘土、伤害数字、震屏、闪屏
import { toScreen, FONT_NUM, FONT_TITLE, rand, REDUCED_MOTION } from './config.js';

export class FX {
  constructor() {
    this.parts = [];
    this.texts = [];
    this.shakeT = 0;
    this.shakeDur = 1;
    this.shakeMag = 0;
    this.flashA = 0;
    this.flashColor = '#fff';
  }

  // ---------- 屏幕级效果 ----------
  shake(mag, dur = 12) {
    if (REDUCED_MOTION) mag *= 0.35;
    const cur = this.shakeT > 0 ? this.shakeMag * (this.shakeT / this.shakeDur) : 0;
    if (mag >= cur) {
      this.shakeMag = mag;
      this.shakeT = dur;
      this.shakeDur = dur;
    }
  }
  flash(color, a) {
    this.flashColor = color;
    this.flashA = Math.max(this.flashA, REDUCED_MOTION ? a * 0.4 : a);
  }
  shakeOffset() {
    if (this.shakeT <= 0) return [0, 0];
    const m = this.shakeMag * (this.shakeT / this.shakeDur);
    return [rand(-m, m), rand(-m, m) * 0.7];
  }

  // ---------- 粒子 ----------
  spark(x, y, z, dir, n = 8, color = '#fff3c4') {
    for (let i = 0; i < n; i++) {
      const a = (dir > 0 ? 0 : Math.PI) + rand(-1.1, 1.1);
      const sp = rand(5, 13);
      this.parts.push({ k: 'spark', x, y, z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, life: rand(8, 15) | 0, max: 15, w: rand(1.5, 3.2), color });
    }
  }
  ring(x, y, z, color = '#fff', r = 8, grow = 5, life = 10, w = 3) {
    this.parts.push({ k: 'ring', x, y, z, r, grow, life, max: life, w, color });
  }
  dust(x, y, n = 6, spread = 1) {
    for (let i = 0; i < n; i++) {
      this.parts.push({ k: 'dust', x: x + rand(-10, 10), y, z: rand(0, 6), vx: rand(-2.5, 2.5) * spread, vz: rand(0.5, 2.5), r: rand(5, 11), life: rand(18, 30) | 0, max: 30 });
    }
  }
  // 刀光：一段圆弧，a0 -> a1（弧度，0 = 正前方，负数 = 向上）
  arc(x, y, z, facing, r, a0, a1, color, w = 14, life = 9) {
    this.parts.push({ k: 'arc', x, y, z, facing, r, a0, a1, color, w, life, max: life });
  }
  // 蓄力：粒子从四周向中心汇聚
  converge(x, y, z, n, color) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), d = rand(70, 120), life = 18;
      this.parts.push({ k: 'mote', x: x + Math.cos(a) * d, y, z: z + Math.sin(a) * d, vx: -Math.cos(a) * d / life, vz: -Math.sin(a) * d / life, life, max: life, color });
    }
  }
  crack(x, y) {
    const rays = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rand(-0.2, 0.2);
      const pts = [[0, 0]];
      let px = 0, py = 0;
      for (let j = 0; j < 4; j++) {
        px += Math.cos(a + rand(-0.4, 0.4)) * rand(18, 34);
        py += Math.sin(a + rand(-0.4, 0.4)) * rand(6, 12);
        pts.push([px, py]);
      }
      rays.push(pts);
    }
    this.parts.push({ k: 'crack', x, y, z: 0, rays, life: 150, max: 150 });
  }

  // ---------- 文字 ----------
  number(x, y, z, value, { crit = false, color = null } = {}) {
    this.texts.push({ k: 'num', x: x + rand(-14, 14), y, z, vz: 2.4, life: 48, max: 48, value, crit, color });
  }
  label(x, y, z, text, color, size = 22) {
    this.texts.push({ k: 'label', x, y, z, vz: 1.2, life: 60, max: 60, text, color, size });
  }

  update() {
    if (this.shakeT > 0) this.shakeT--;
    if (this.flashA > 0) this.flashA = Math.max(0, this.flashA - 0.04);
    for (const p of this.parts) {
      p.life--;
      switch (p.k) {
        case 'spark': p.x += p.vx; p.z += p.vz; p.vx *= 0.82; p.vz = p.vz * 0.82 - 0.3; break;
        case 'ring': p.r += p.grow; p.grow *= 0.85; break;
        case 'dust': p.x += p.vx; p.z += p.vz; p.vx *= 0.9; p.vz *= 0.92; p.r += 0.35; break;
        case 'mote': p.x += p.vx; p.z += p.vz; break;
      }
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const t of this.texts) { t.life--; t.z += t.vz; t.vz *= 0.92; }
    this.texts = this.texts.filter((t) => t.life > 0);
  }

  // 地面上的效果（裂痕），在角色之前画
  drawFloor(ctx, camX) {
    for (const p of this.parts) {
      if (p.k !== 'crack') continue;
      const [sx, sy] = toScreen(p.x, p.y, 0, camX);
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life / 40) * 0.8;
      ctx.strokeStyle = '#0a0709';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      for (const ray of p.rays) {
        ctx.beginPath();
        ray.forEach(([rx, ry], i) => (i ? ctx.lineTo(sx + rx, sy + ry) : ctx.moveTo(sx + rx, sy + ry)));
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // glowPass = true 时只画发光的部分（给泛光层用）
  draw(ctx, camX, glowPass = false) {
    // 尘土：普通混合
    ctx.fillStyle = '#b8aa9a';
    for (const p of this.parts) {
      if (p.k !== 'dust' || glowPass) continue;
      const [sx, sy] = toScreen(p.x, p.y, p.z, camX);
      ctx.globalAlpha = (p.life / p.max) * 0.35;
      ctx.beginPath();
      ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 发光类：叠加混合（lighter），越叠越亮
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const p of this.parts) {
      const [sx, sy] = toScreen(p.x, p.y, p.z, camX);
      const t = p.life / p.max;
      if (p.k === 'spark') {
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = Math.min(1, t * 1.5);
        ctx.lineWidth = p.w;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - p.vx * 1.8, sy + p.vz * 1.8);
        ctx.stroke();
      } else if (p.k === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = t;
        ctx.lineWidth = p.w * t + 0.5;
        ctx.beginPath();
        ctx.ellipse(sx, sy, p.r, p.r * 0.75, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.k === 'arc') {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(p.facing, 1);
        const ccw = p.a1 < p.a0;
        for (let i = 0; i < 3; i++) {
          ctx.globalAlpha = t * (1 - i * 0.3);
          ctx.strokeStyle = i === 0 ? '#ffffff' : p.color;
          ctx.lineWidth = Math.max(0.5, p.w * t * (1 - i * 0.25));
          ctx.beginPath();
          ctx.arc(0, 0, Math.max(4, p.r - i * 7), p.a0, p.a1, ccw);
          ctx.stroke();
        }
        ctx.restore();
      } else if (p.k === 'mote') {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 1 - t * 0.5;
        ctx.beginPath();
        ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawTexts(ctx, camX) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const t of this.texts) {
      const [sx, sy] = toScreen(t.x, t.y, t.z, camX);
      const age = t.max - t.life;
      const pop = age < 6 ? 1 + ((6 - age) / 6) * 0.8 : 1; // 出现时先放大再回弹
      ctx.globalAlpha = Math.min(1, t.life / 15);
      ctx.strokeStyle = 'rgba(16,6,10,.9)';
      ctx.lineWidth = 5;
      if (t.k === 'num') {
        const size = (t.crit ? 46 : 30) * pop;
        const s = String(t.value);
        ctx.save();
        ctx.translate(sx, sy);
        ctx.transform(1, 0, -0.16, 1, 0, 0); // 斜体，更有冲击感
        ctx.font = `600 ${size}px ${FONT_NUM}`;
        ctx.lineWidth = t.crit ? 5 : 4;
        ctx.strokeStyle = 'rgba(14,4,10,.92)';
        ctx.strokeText(s, 0, 0);
        const g = ctx.createLinearGradient(0, -size * 0.4, 0, size * 0.35);
        if (t.color) { g.addColorStop(0, '#ffb0b8'); g.addColorStop(1, t.color); }
        else if (t.crit) { g.addColorStop(0, '#fffbe0'); g.addColorStop(0.5, '#ffd65a'); g.addColorStop(1, '#ff7a2e'); }
        else { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c9c0dc'); }
        ctx.fillStyle = g;
        ctx.fillText(s, 0, 0);
        ctx.restore();
        if (t.crit) {
          ctx.font = `${18 * pop}px ${FONT_TITLE}`;
          ctx.lineWidth = 4;
          ctx.strokeText('暴击', sx, sy - size * 0.66);
          ctx.fillStyle = '#ffd65a';
          ctx.fillText('暴击', sx, sy - size * 0.66);
        }
      } else {
        ctx.font = `${t.size * pop}px ${FONT_TITLE}`;
        ctx.strokeText(t.text, sx, sy);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, sx, sy);
      }
    }
    ctx.restore();
  }
}
