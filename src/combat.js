// 战斗核心：判定框、飞行道具、地面范围攻击
import { world, toScreen, COLORS } from './config.js';
import { sfx } from './audio.js';
import { tex, tinted } from './fx_tex.js';

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

// 新月形：外沿是半个椭圆，内沿是更扁的半个椭圆，两头尖、中间厚 th
function crescent(ctx, cx, cy, rx, ry, th) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, -Math.PI / 2, Math.PI / 2);
  ctx.ellipse(cx, cy, Math.max(1, rx - th), ry, 0, Math.PI / 2, -Math.PI / 2, true);
  ctx.fill();
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
    if (--this.life <= 0 || this.x < -50 || this.x > world.w + 50) { this.dead = true; return; }
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
    if (this.kind === 'wave') {
      if (this.age % 2 === 0) game.fx.dust(this.x - this.facing * 10, this.y, 1, 0.5);
      // 剑气后面甩出的光点
      const sc = this.scale || 1;
      game.fx.emit('trailMote', this.x - this.facing * 8, this.y, this.z + (10 + Math.random() * 90) * sc, { dir: -this.facing, color: this.color || COLORS.blade, n: 1 });
    }
  }
  draw(ctx, camX) {
    const [sx, sy] = toScreen(this.x, this.y, this.z, camX);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(this.facing, 1);
    if (this.kind === 'wave') {
      // 剑气：新月形，后面拖两层渐淡的残像；外层柔光 + 刀刃白芯
      ctx.globalCompositeOperation = 'lighter';
      const a = Math.min(1, this.life / 10), sc = this.scale || 1, col = this.color || COLORS.blade, T = tex();
      ctx.globalAlpha = a * 0.35;
      ctx.drawImage(tinted(T.glow, col), -60 * sc, -112 * sc, 80 * sc, 124 * sc);
      for (let i = 2; i >= 0; i--) {
        const off = -i * 16 * sc, k = 1 - i * 0.12;
        ctx.globalAlpha = a * (i ? 0.28 / i : 0.9);
        ctx.fillStyle = col;
        crescent(ctx, off, -50 * sc, 20 * sc * k, 54 * sc * k, 11 * sc * k);
        if (!i) {
          ctx.globalAlpha = a;
          ctx.fillStyle = '#ffffff';
          crescent(ctx, off + 3 * sc, -50 * sc, 20 * sc, 54 * sc, 3.5 * sc);
        }
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
    // 施法者被打断（比如被破防）→ 取消。普通敌人出招状态叫 windup，Boss 叫 attack
    if (this.t < this.delay && this.owner && this.owner.state !== (this.ownerState || 'windup')) { this.dead = true; return; }
    if (this.t === this.delay) {
      const p = game.player;
      const dx = (p.x - this.x) / this.rx, dy = (p.y - this.y) / this.ry;
      if (dx * dx + dy * dy <= 1 && p.z < 50) game.applyHit(this, p, this.hit, Math.sign(p.x - this.x) || 1);
      // 爆裂词缀的爆炸：敌人也会被炸到，算玩家的伤害（把它打进敌群里是一种打法）
      if (this.hitsEnemies) {
        const src = { team: 'player', x: this.x, y: this.y, styleTag: 'blast' };
        for (const e of game.enemies) {
          if (!e.alive || e.team === 'prop' || e.isBoss) continue;
          const ex = (e.x - this.x) / this.rx, ey = (e.y - this.y) / this.ry;
          if (ex * ex + ey * ey <= 1 && e.z < 50) game.applyHit(src, e, { ...this.hit, dmg: this.hit.dmg * 2.5 }, Math.sign(e.x - this.x) || 1);
        }
      }
      game.fx.shake(this.hit.shake ?? 8, 18);
      game.fx.dust(this.x, this.y, 16, 2.5);
      game.fx.ring(this.x, this.y, 2, this.color || '#ff6a3d', 20, 10, 16, 6);
      // 爆发：贴地冲击波 + 光柱 + 火星
      const col = this.color || '#ff6a3d';
      game.fx.gring(this.x, this.y, col, this.rx * 0.4, this.rx * 1.5, 20, 7);
      game.fx.shock(this.x, this.y, 10, this.rx * 1.6, 0.016, 18);
      game.fx.pillar(this.x, this.y, col, Math.min(90, this.rx * 0.7), 260 + this.rx, 18);
      game.fx.spark(this.x, this.y, 10, 1, 8, col);
      game.fx.spark(this.x, this.y, 10, -1, 8, col);
      if (this.rx > 90) game.fx.crack(this.x, this.y);
      sfx('heavy');
    }
    if (this.t > this.delay + 14) this.dead = true;
  }
  drawFloor(ctx, camX) {
    const [sx, sy] = toScreen(this.x, this.y, 0, camX);
    ctx.save();
    if (this.t < this.delay) {
      // 预警：发光的边缘（越临近爆发闪得越快）+ 从中心往外填满的红光 + 一圈往里收的细环
      const u = this.t / this.delay, T = tex();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(this.t * (0.35 + u * 0.6));
      ctx.drawImage(tinted(T.ring[2], '#ff4636'), sx - this.rx * 1.04, sy - this.ry * 1.04, this.rx * 2.08, this.ry * 2.08);
      ctx.globalAlpha = 0.25 + 0.45 * u;
      ctx.drawImage(tinted(T.glow, '#ff3a2e'), sx - this.rx * u * 1.3, sy - this.ry * u * 1.3, this.rx * u * 2.6, this.ry * u * 2.6);
      const k = 1 - ((this.t * 0.04) % 1) * 0.85;
      ctx.globalAlpha = 0.5 * u;
      ctx.drawImage(tinted(T.ring[0], '#ffb0a0'), sx - this.rx * k, sy - this.ry * k, this.rx * k * 2, this.ry * k * 2);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      if (this.kind === 'meteor') {
        // 从天而降的光球，落地时刚好爆炸
        const h = (1 - u) * 340;
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = this.color || '#ff6a3d';
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.arc(sx, sy - h, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(sx, sy - h, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(sx - 2, sy - h - 40, 4, 34);
      }
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

// 地面预警带：Boss 冲锋 / 齐射前，在它要经过的路线上画一条红色光带（只提示，不造成伤害）
export class Lane {
  constructor(o) {
    Object.assign(this, { t: 0, dead: false, half: 26, color: '#ff4d5e' }, o);
  }
  update() {
    if (this.follow) {
      this.x = this.follow.x;
      this.y = this.follow.y;
      this.facing = this.follow.facing;
    }
    if (++this.t >= this.life) this.dead = true;
  }
  drawFloor(ctx, camX) {
    const [sx, sy] = toScreen(this.x, this.y, 0, camX);
    const len = this.facing > 0 ? world.w - this.x : this.x;
    const a = 0.12 + 0.18 * (this.t / this.life) + 0.08 * Math.sin(this.t * 0.6);
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.globalAlpha = a;
    ctx.fillRect(this.facing > 0 ? sx : sx - len, sy - this.half / 2, len, this.half);
    ctx.globalAlpha = a * 2;
    ctx.fillRect(this.facing > 0 ? sx : sx - len, sy - 1, len, 2);
    ctx.restore();
  }
}
