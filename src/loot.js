// 掉落物：金币和装备。装备会冒出对应品质颜色的光柱（光照包 loot_beam 序列帧，按稀有度染色），品质越高光柱越高
import { toScreen, FONT_TITLE } from './config.js';
import { RARITY, isLegend, itemGlyph } from './items.js';
import { lightFb } from './fx_art.js';
import { tinted } from './fx_tex.js';
import { drawLightTex } from './draw.js';

const BEAM = [36, 90, 150, 210, 260];

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
    if (this.heal) {
      // 回血光球：绿色发光、上下浮动
      const bob = Math.sin(t * 0.12 + this.x) * 3;
      drawLightTex(ctx, 'glow_soft', '#6fe38a', sx, sy - 14 + bob, 60, 60, 1);
      drawLightTex(ctx, 'glow_core', '#c8ffd7', sx, sy - 14 + bob, 34, 34, 1);
      return;
    }
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
      if ((t + this.x) % 40 < 6) drawLightTex(ctx, 'glow_core', null, sx, sy - 9, 14, 14, 1 - ((t + this.x) % 40) / 6); // 金币闪一下
      return;
    }

    const it = this.item, color = RARITY[it.rar].color;
    if (this.z <= 0) {
      // 光柱
      // 光柱：loot_beam 6 帧循环（12 fps），锚点在底部；高度按品质（原画布 384 高 → BEAM），宽度跟着按比例
      const fb = lightFb('loot_beam');
      if (fb) {
        const H = BEAM[isLegend(it) ? 4 : it.rar] * (0.9 + 0.1 * Math.sin(t * 0.08 + this.x)), k = H / (fb.h * 0.95), n = fb.frames.length;
        const fr = fb.frames[(Math.floor(t / (60 / fb.fps) + this.x * 0.1) % n + n) % n];
        if (fr) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.9;
          ctx.drawImage(tinted(fr, color), sx - fr.cx * k * 1.2, gy - fr.cy * k, fr.width * k * 1.2, fr.height * k);
          ctx.restore();
        }
      }
      // 地上的一圈光：柔光压扁成地面透视
      drawLightTex(ctx, 'glow_soft', color, sx, gy, 54 + 6 * Math.sin(t * 0.1), 20, 0.7);
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
