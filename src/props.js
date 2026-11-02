// 房间里的道具：宝箱（打 3 下打开）、泉水（靠近恢复）
// 它们放在 game.enemies 里，这样玩家的攻击判定能打到宝箱；alive = false 让它们不影响清场判断。
import { toScreen, hexA } from './config.js';
import { sfx } from './audio.js';
import { propsS, propsL, drawProp, PROP_SCALE } from './props_sprites.js';

export class Chest {
  constructor(x, y, opened = false) {
    Object.assign(this, { x, y, z: 0, vx: 0, w: 52, h: 42, team: 'prop', facing: 1, opened, hits: 0, shakeT: 0, t: 0 });
  }
  get alive() { return false; }
  canBeHit() { return !this.opened; }
  takeHit(h, dir, dmg, game) {
    if (this.opened) return null;
    this.hits++;
    this.shakeT = 8;
    if (this.hits >= 3) {
      this.opened = true;
      this.openT = 0; // 开盖动画从这一帧开始
      game.openChest(this);
    }
    return {};
  }
  update() {
    this.t++;
    if (this.shakeT > 0) this.shakeT--;
    if (this.openT != null) this.openT++;
  }
  draw(ctx, camX, t) {
    const [sx0, sy] = toScreen(this.x, this.y, 0, camX);
    const sx = sx0 + (this.shakeT ? Math.sin(this.shakeT * 2) * 3 : 0);
    if (propsS.ready) {
      // 逐帧：关闭 0，被打中晃动 1～2，开盖 3～6，打开 7（金光由引擎画）
      const i = this.opened ? (this.openT == null ? 7 : Math.min(7, 3 + Math.floor(this.openT / 4))) : this.shakeT ? 1 + (this.shakeT >> 2) % 2 : 0;
      if (!this.opened) this.drawGlow(ctx, sx, sy, t);
      drawProp(ctx, propsS, 'chest', i, sx, sy, { scale: PROP_SCALE.chest });
      if (this.opened) this.drawOpenGlow(ctx, sx, sy);
      return;
    }
    if (!this.opened) this.drawGlow(ctx, sx, sy, t);
    this.drawBody(ctx, sx, sy);
    if (this.opened) this.drawOpenGlow(ctx, sx, sy);
  }
  // 未开启时向上冒金光，提示可以互动
  drawGlow(ctx, sx, sy, t) {
    {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(0, sy - 120, 0, sy);
      g.addColorStop(0, hexA('#ffd65a', 0));
      g.addColorStop(1, hexA('#ffd65a', 0.22 + 0.08 * Math.sin(t * 0.08)));
      ctx.fillStyle = g;
      ctx.fillRect(sx - 30, sy - 120, 60, 120);
      ctx.restore();
    }
  }
  // 程序画的箱子（素材没载入时）
  drawBody(ctx, sx, sy) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0b0910';
    ctx.lineWidth = 3;
    // 箱体
    ctx.fillStyle = '#5a3a22';
    ctx.beginPath();
    ctx.rect(sx - 26, sy - 28, 52, 28);
    ctx.stroke();
    ctx.fill();
    ctx.fillStyle = '#c9a45c';
    ctx.fillRect(sx - 26, sy - 16, 52, 4);
    ctx.fillRect(sx - 4, sy - 22, 8, 12);
    // 箱盖
    ctx.save();
    ctx.translate(sx - 26, sy - 28);
    if (this.opened) ctx.rotate(-1.1);
    ctx.fillStyle = '#6a4628';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(52, 0);
    ctx.quadraticCurveTo(52, -16, 26, -18);
    ctx.quadraticCurveTo(0, -16, 0, 0);
    ctx.stroke();
    ctx.fill();
    ctx.fillStyle = '#c9a45c';
    ctx.fillRect(22, -18, 8, 18);
    ctx.restore();
  }
  drawOpenGlow(ctx, sx, sy) {
    {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = hexA('#ffd65a', 0.3);
      ctx.beginPath();
      ctx.ellipse(sx, sy - 28, 22, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

export class Shrine {
  constructor(x, y, used = false, onUse) {
    Object.assign(this, { x, y, z: 0, vx: 0, w: 60, h: 50, team: 'prop', facing: 1, used, t: 0, onUse });
  }
  get alive() { return false; }
  canBeHit() { return false; }
  takeHit() { return null; }
  update(game) {
    this.t++;
    const p = game.player;
    if (!this.used && Math.abs(p.x - this.x) < 60 && Math.abs(p.y - this.y) < 34) {
      this.used = true;
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.5);
      p.mp = p.maxMp;
      for (const k in p.cd) p.cd[k] = 0;
      game.fx.ring(p.x, p.y, 40, '#6fe38a', 20, 8, 24, 5);
      game.fx.flash('#6fe38a', 0.15);
      game.toast('泉水恢复了 50% 生命、全部魔力，技能冷却已重置', '#6fe38a');
      sfx('heal');
      this.onUse?.();
    }
  }
  draw(ctx, camX, t) {
    const [sx, sy] = toScreen(this.x, this.y, 0, camX);
    // 逐帧：泉水 4 帧水波循环；用过之后换成干涸的泉台。上升的光点和光柱仍由引擎画
    if (drawProp(ctx, propsL, this.used ? 'shrine_dry' : 'shrine', this.used ? 0 : Math.floor(t / 8) % 4, sx, sy, { scale: PROP_SCALE.shrine })) {
      if (!this.used) this.drawSparkle(ctx, sx, sy - 10, t);
      return;
    }
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0b0910';
    ctx.lineWidth = 3;
    ctx.fillStyle = '#3a3440';
    ctx.beginPath();
    ctx.moveTo(sx - 34, sy);
    ctx.lineTo(sx + 34, sy);
    ctx.lineTo(sx + 26, sy - 26);
    ctx.lineTo(sx - 26, sy - 26);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    const water = this.used ? '#2a4a3a' : '#6fe38a';
    ctx.fillStyle = water;
    ctx.beginPath();
    ctx.ellipse(sx, sy - 26, 26, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!this.used) this.drawSparkle(ctx, sx, sy, t);
  }
  drawSparkle(ctx, sx, sy, t) {
    {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const ph = (t * 0.02 + i / 5) % 1;
        ctx.globalAlpha = (1 - ph) * 0.7;
        ctx.fillStyle = '#b8ffd0';
        ctx.beginPath();
        ctx.arc(sx + Math.sin(i * 2.3 + t * 0.03) * 18, sy - 30 - ph * 70, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      const g = ctx.createLinearGradient(0, sy - 110, 0, sy - 20);
      g.addColorStop(0, hexA('#6fe38a', 0));
      g.addColorStop(1, hexA('#6fe38a', 0.25));
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.fillRect(sx - 26, sy - 110, 52, 90);
      ctx.restore();
    }
  }
}

// 陶罐：一刀打碎，掉金币，有时掉回血的光球
export class Urn {
  constructor(spot) {
    Object.assign(this, { x: spot.x, y: spot.y, z: 0, vx: 0, w: 26, h: 40, team: 'prop', facing: 1, spot, t: 0, variant: spot.variant });
  }
  get alive() { return false; }
  canBeHit() { return !this.spot.broken; }
  takeHit(h, dir, dmg, game) {
    if (this.spot.broken) return null;
    this.spot.broken = true;
    if (propsS.ready) {
      // 逐帧：晃动 → 开裂 → 碎裂残底留在地上；四块陶片飞出去
      this.breakT = 0;
      this.shards = [0, 1, 2, 3].map((i) => ({ i, x: this.x, z: 18, vx: dir * (1.5 + Math.random() * 3) + (Math.random() - 0.5) * 3, vz: 3 + Math.random() * 4, rot: 0, vr: (Math.random() - 0.5) * 0.5, life: 50 }));
    } else this.remove = true;
    game.breakUrn(this, dir);
    return {};
  }
  update() {
    this.t++;
    if (this.breakT != null) this.breakT++;
    for (const s of this.shards || []) {
      if (s.life <= 0) continue;
      s.life--;
      s.x += s.vx;
      s.z += s.vz;
      s.vz -= 0.5;
      s.rot += s.vr;
      if (s.z <= 0) { s.z = 0; s.vz = -s.vz * 0.35; s.vx *= 0.6; s.vr *= 0.6; }
    }
  }
  draw(ctx, camX) {
    const [sx, sy] = toScreen(this.x, this.y, 0, camX);
    const anim = this.variant ? 'urn_b' : 'urn_a';
    if (propsS.ready) {
      const i = this.breakT == null ? 0 : this.breakT < 3 ? 1 : this.breakT < 6 ? 2 : 3;
      drawProp(ctx, propsS, anim, i, sx, sy, { scale: PROP_SCALE.urn });
      for (const s of this.shards || []) {
        if (s.life <= 0) continue;
        const [px, py] = toScreen(s.x, this.y, s.z, camX);
        ctx.save();
        ctx.globalAlpha = Math.min(1, s.life / 15);
        ctx.translate(px, py);
        ctx.rotate(s.rot);
        drawProp(ctx, propsS, 'shards', s.i, 0, 0, { scale: PROP_SCALE.shards });
        ctx.restore();
      }
      return;
    }
    const tall = this.variant ? 1.15 : 1;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1, tall);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#120a16';
    ctx.lineWidth = 2.5;
    const g = ctx.createLinearGradient(-14, 0, 14, 0);
    g.addColorStop(0, '#b07a4e');
    g.addColorStop(0.4, '#8a5a3a');
    g.addColorStop(1, '#4a2e1e');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-6, -38);
    ctx.lineTo(6, -38);
    ctx.quadraticCurveTo(4, -32, 10, -28);
    ctx.quadraticCurveTo(18, -16, 10, 0);
    ctx.lineTo(-10, 0);
    ctx.quadraticCurveTo(-18, -16, -10, -28);
    ctx.quadraticCurveTo(-4, -32, -6, -38);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,15,10,.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-13, -18);
    ctx.quadraticCurveTo(0, -14, 13, -18);
    ctx.stroke();
    ctx.restore();
  }
}
