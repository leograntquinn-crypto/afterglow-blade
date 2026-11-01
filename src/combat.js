// 战斗核心：判定框、飞行道具、地面范围攻击
import { ARENA_W, toScreen, COLORS } from './config.js';
import { sfx } from './audio.js';

// 把招式里「相对角色」的判定框，换算成世界坐标
// box: { x: 向前偏移, w: 宽, d: 纵深容差, z0/z1: 高度范围 }
export function hitBox(ent, h) {
  const b = h.box;
  const baseZ = h.absZ ? 0 : ent.z; // absZ：以地面为基准（例如震地技能）
  return { cx: ent.x + ent.facing * b.x, hw: b.w / 2, cy: ent.y, d: b.d, z0: baseZ + b.z0, z1: baseZ + b.z1 };
}

// 2.5D 判定：左右要重叠、纵深要接近、高度区间要相交 —— 三个条件都满足才算打中
export function overlaps(box, t) {
  return (
    Math.abs(t.x - box.cx) <= box.hw + t.w / 2 &&
    Math.abs(t.y - box.cy) <= box.d &&
    t.z + t.h >= box.z0 &&
    t.z <= box.z1
  );
}

export class Projectile {
  constructor(o) {
    Object.assign(this, { z: 0, life: 60, pierce: false, dead: false }, o);
    this.facing = Math.sign(this.vx) || 1;
    this.hitSet = new Set(); // 穿透型道具：每个目标只打一次
    this.age = 0;
  }
  update(game) {
    this.x += this.vx;
    this.age++;
    if (--this.life <= 0 || this.x < -50 || this.x > ARENA_W + 50) { this.dead = true; return; }
    const h = this.hit;
    const box = { cx: this.x, hw: h.box.w / 2, cy: this.y, d: h.box.d, z0: this.z + h.box.z0, z1: this.z + h.box.z1 };
    const targets = this.team === 'player' ? game.enemies : [game.player];
    for (const t of targets) {
      if (this.hitSet.has(t) || !overlaps(box, t)) continue;
      if (game.applyHit(this, t, h, this.facing)) {
        this.hitSet.add(t);
        if (!this.pierce) { this.dead = true; return; }
      }
    }
    if (this.kind === 'wave' && this.age % 2 === 0) game.fx.dust(this.x - this.facing * 10, this.y, 1, 0.5);
  }
  draw(ctx, camX) {
    const [sx, sy] = toScreen(this.x, this.y, this.z, camX);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(this.facing, 1);
    if (this.kind === 'wave') {
      ctx.globalCompositeOperation = 'lighter';
      const a = Math.min(1, this.life / 10);
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = a * (0.9 - i * 0.25);
        ctx.strokeStyle = i === 0 ? '#ffffff' : COLORS.blade;
        ctx.lineWidth = 10 - i * 2.5;
        ctx.beginPath();
        ctx.ellipse(-i * 14, -50, 18, 52, 0, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
      }
    } else if (this.kind === 'arrow') {
      ctx.strokeStyle = 'rgba(255,90,70,.35)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(-40, 0);
      ctx.lineTo(0, 0);
      ctx.stroke();
      ctx.strokeStyle = '#d9c9a8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-26, 0);
      ctx.lineTo(0, 0);
      ctx.stroke();
      ctx.fillStyle = '#ff8a6a';
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-2, -4);
      ctx.lineTo(-2, 4);
      ctx.fill();
    }
    ctx.restore();
  }
}

// 地面范围攻击：先显示红圈预警，延迟后爆发。施法者被打断则取消。
export class Hazard {
  constructor(o) {
    Object.assign(this, { t: 0, dead: false, team: 'enemy' }, o);
  }
  update(game) {
    this.t++;
    if (this.t < this.delay && this.owner && this.owner.state !== 'windup') { this.dead = true; return; }
    if (this.t === this.delay) {
      const p = game.player;
      const dx = (p.x - this.x) / this.rx, dy = (p.y - this.y) / this.ry;
      if (dx * dx + dy * dy <= 1 && p.z < 50) game.applyHit(this, p, this.hit, Math.sign(p.x - this.x) || 1);
      game.fx.shake(this.hit.shake ?? 8, 18);
      game.fx.dust(this.x, this.y, 16, 2.5);
      game.fx.ring(this.x, this.y, 2, '#ff6a3d', 20, 10, 16, 6);
      game.fx.crack(this.x, this.y);
      sfx('heavy');
    }
    if (this.t > this.delay + 14) this.dead = true;
  }
  drawFloor(ctx, camX) {
    const [sx, sy] = toScreen(this.x, this.y, 0, camX);
    ctx.save();
    if (this.t < this.delay) {
      const u = this.t / this.delay;
      ctx.strokeStyle = `rgba(255,70,60,${0.5 + 0.4 * Math.sin(this.t * 0.5)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(sx, sy, this.rx, this.ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,60,50,${0.12 + 0.25 * u})`;
      ctx.beginPath();
      ctx.ellipse(sx, sy, this.rx * u, this.ry * u, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const u = 1 - (this.t - this.delay) / 14;
      ctx.fillStyle = `rgba(255,200,120,${0.5 * u})`;
      ctx.beginPath();
      ctx.ellipse(sx, sy, this.rx * (1.2 - 0.2 * u), this.ry * (1.2 - 0.2 * u), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
