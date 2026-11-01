// 掉落物：金币和装备。装备会冒出对应品质颜色的光柱，品质越高光柱越高
import { toScreen, hexA, FONT_TITLE } from './config.js';
import { RARITY, itemGlyph } from './items.js';

const BEAM = [36, 90, 150, 260];

export class Loot {
  // { x, y, item } 或 { x, y, gold }
  constructor(o) {
    Object.assign(this, { z: 20, vz: 7, vx: (Math.random() - 0.5) * 5, t: 0, dead: false, magnet: false, w: 12, h: 12 }, o);
  }
  update(game) {
    this.t++;
    if (this.z > 0 || this.vz > 0) {
      this.vz -= 0.6;
      this.z += this.vz;
      this.x += this.vx;
      if (this.z <= 0) {
        this.z = 0;
        this.vz = this.vz < -3 ? -this.vz * 0.35 : 0;
        this.vx *= 0.4;
      }
    }
    const p = game.player;
    if (this.magnet) {
      this.x += (p.x - this.x) * 0.16;
      this.y += (p.y - this.y) * 0.16;
    }
    if (this.t > 18 && p.state !== 'dead' && Math.hypot(p.x - this.x, (p.y - this.y) * 1.6) < 36) {
      this.dead = true;
      game.pickup(this);
    }
  }
  draw(ctx, camX, t) {
    const [sx, gy] = toScreen(this.x, this.y, 0, camX);
    const sy = gy - this.z;
    if (this.gold) {
      for (let i = 0; i < 3; i++) {
        const ox = (i - 1) * 5, oy = -i * 2;
        ctx.fillStyle = '#7a5a1a';
        ctx.beginPath();
        ctx.ellipse(sx + ox, sy + oy - 3, 5, 3.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd65a';
        ctx.beginPath();
        ctx.ellipse(sx + ox, sy + oy - 4, 4.2, 2.7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if ((t + this.x) % 40 < 6) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(sx - 1, sy - 9, 2, 2);
      }
      return;
    }

    const it = this.item, color = RARITY[it.rar].color;
    if (this.z <= 0) {
      // 光柱
      const H = BEAM[it.rar] * (0.85 + 0.15 * Math.sin(t * 0.08 + this.x));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const [w, a] of [[26, 0.18], [10, 0.45]]) {
        const g = ctx.createLinearGradient(0, gy - H, 0, gy);
        g.addColorStop(0, hexA(color, 0));
        g.addColorStop(1, hexA(color, a));
        ctx.fillStyle = g;
        ctx.fillRect(sx - w / 2, gy - H, w, H);
      }
      ctx.strokeStyle = hexA(color, 0.6);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(sx, gy, 16 + 3 * Math.sin(t * 0.1), 6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // 物品图标：菱形底座 + 字
    ctx.save();
    ctx.translate(sx, sy - 12);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#120e16';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.fillRect(-9, -9, 18, 18);
    ctx.strokeRect(-9, -9, 18, 18);
    ctx.restore();
    ctx.font = `15px ${FONT_TITLE}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(itemGlyph(it), sx, sy - 11);
  }
}
