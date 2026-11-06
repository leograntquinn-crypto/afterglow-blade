// 战斗核心：判定框、飞行道具、地面范围攻击
import { flipbook } from './fx_art.js';
import { world, toScreen, COLORS } from './config.js';
import { sfx } from './audio.js';
import { tex, tinted } from './fx_tex.js';
import { BOSS_SPRITES } from './enemy_sprites.js';
import { FEINT } from './ai_data.js';

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
    this.dir0 = this.facing; // 回旋镖：出手时的方向
  }
  update(game) {
    this.x += this.vx;
    this.y += this.vy || 0; // 弓手预判过的箭会斜着飞一点
    this.age++;
    // 回旋镖（夜鸦的羽刃）：一直往回减速，掉头之后回程还能再打中一次
    if (this.boomerang) {
      this.vx -= this.dir0 * this.boomerang;
      this.facing = Math.sign(this.vx) || this.facing;
      if (!this.returned && Math.sign(this.vx) === -this.dir0) { this.returned = true; this.hitSet.clear(); }
    }
    if (--this.life <= 0 || this.x < -50 || this.x > world.w + 50) { this.dead = true; return; }
    const h = this.hit;
    const box = { cx: this.x, hw: h.box.w / 2, cy: this.y, d: h.box.d, z0: this.z + h.box.z0, z1: this.z + h.box.z1 };
    const targets = this.team === 'player' ? game.enemies : [game.player];
    for (const t of targets) {
      if (this.hitSet.has(t) || !overlaps(box, t)) continue;
      // 假箭（鸦影分身的分身射的）：打中只闪一下，不伤人
      if (this.fake) {
        game.fx.spark(this.x, this.y, this.z, this.facing, 4, '#9a7aa8');
        this.dead = true;
        return;
      }
      if (game.applyHit(this, t, h, this.facing)) {
        this.hitSet.add(t);
        this.onHit?.(game, t);
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
      // 剑气后面拖着两缕能量丝（手绘素材到了才有）
      if (T.wisp) {
        ctx.globalAlpha = a * 0.7;
        T.wisp.forEach((w, i) => ctx.drawImage(tinted(w, col), -170 * sc, (-82 + i * 50) * sc, 165 * sc, 34 * sc));
      }
      ctx.globalAlpha = a * 0.35;
      ctx.drawImage(tinted(T.glow, col), -60 * sc, -112 * sc, 80 * sc, 124 * sc);
      // 剑气本体：手绘序列帧 wave_crescent（fx_blade_v1，前缘最亮、往后渐暗，飞行中循环）。素材没载好时不画本体
      const fb = flipbook('wave_crescent');
      if (fb) {
        const n = fb.frames.length, fr = fb.frames[Math.floor(this.age * fb.fps / 60) % n];
        if (fr) {
          // 素材格子高 256（交付尺寸），新月约占 74%：按原来剑气的高度（约 108 × sc）换算
          const k = (146 * sc) / (fb.h / fb.sc) / fr.sc, w = fr.width * k, h = fr.height * k, x = -fr.cx * k - 40 * sc, y = -fr.cy * k - 50 * sc;
          ctx.globalAlpha = a;
          ctx.drawImage(tinted(fr, col), x, y, w, h);
          ctx.globalAlpha = a * 0.6;
          ctx.drawImage(fr, x, y, w, h);
        }
      }
    } else if (this.kind === 'feather') {
      // 羽刃：旋转的长条锋利黑羽，边缘带首领的颜色。夜鸦的素材（feather_blade）载入了就用素材，否则程序画
      const T = tex(), col = this.color || '#ff4dd2', BS = BOSS_SPRITES[this.owner?.key]?.sheet, img = BS?.ready && BS.feather;
      ctx.rotate(this.age * 0.5);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      ctx.drawImage(tinted(T.glow, col), -30, -13, 60, 26);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      if (img) {
        // 素材 256×256，羽刃横放、朝右、居中（长约 215px）→ 游戏里约 54px。先画两道拖在后面的残影，再画一圈首领颜色的描边
        const W = 64;
        for (const [da, a] of [[-0.5, 0.22], [-1, 0.1]]) {
          ctx.save();
          ctx.rotate(da);
          ctx.globalAlpha = a;
          ctx.drawImage(tinted(img, col), -W / 2, -W / 2, W, W);
          ctx.restore();
        }
        ctx.globalAlpha = 0.85;
        for (const [ox, oy] of [[0, -1.5], [0, 1.5]]) ctx.drawImage(tinted(img, col), -W / 2 + ox, -W / 2 + oy, W, W);
        ctx.globalAlpha = 1;
        ctx.drawImage(img, -W / 2, -W / 2, W, W);
      } else {
        ctx.fillStyle = '#16101c';
        ctx.beginPath();
        ctx.moveTo(-22, 0);
        ctx.quadraticCurveTo(0, -7, 24, 0);
        ctx.quadraticCurveTo(0, 5, -22, 0);
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    } else if (this.kind === 'hook') {
      // 锁链钩：从首领手里一节节连到钩头。铁颚的素材（chain_hook、chain_link）载入了就用素材，否则程序画
      const o = this.owner, B = BOSS_SPRITES[o?.key], BS = B?.sheet, art = BS?.ready && BS.hook && BS.link;
      if (o) {
        // 锁链的起点：素材里甩出锁链那几帧（chain_throw 4–7），锁链从画面右边伸出去的位置
        const k = art ? o.look.h / B.standH : 0;
        const [ox, oy] = art ? toScreen(o.x + o.facing * B.hand[0] * k, o.y, o.z + B.hand[1] * k, camX) : toScreen(o.x + o.facing * 30, o.y, 60, camX);
        const tail = art ? -34 : 0; // 钩子尾端（链环连着的那头）在钩头后面
        const dx = (ox - sx) * this.facing - tail, dy = oy - sy, L = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
        if (art && dx < 0) {
          // 链环交替「正面 / 侧面」，看起来是一节节扣在一起的锁链
          const step = 10, n = Math.floor(L / step);
          for (let i = 0; i < n; i++) {
            const u = (i + 0.5) / n;
            ctx.save();
            ctx.translate(tail + dx * u, dy * u);
            ctx.rotate(ang);
            ctx.scale(1, i % 2 ? 0.45 : 1);
            ctx.drawImage(BS.link, -8, -8, 16, 16);
            ctx.restore();
          }
        } else if (!art) {
          const n = Math.max(1, Math.floor(L / 9));
          ctx.strokeStyle = '#5a504a';
          ctx.lineWidth = 2.2;
          for (let i = 0; i < n; i++) {
            const u = i / n;
            ctx.beginPath();
            ctx.ellipse(dx * u, dy * u, 4, 2.6, ang, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }
      if (art) {
        // 钩子素材是竖着挂的（链在上、钩尖朝右）：转成横着飞，链环那头朝后
        ctx.save();
        ctx.rotate(-Math.PI / 2);
        ctx.scale(-1, 1);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.35;
        ctx.drawImage(tinted(tex().glow, this.color || '#ff7a2e'), -20, -26, 40, 52);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.drawImage(BS.hook, -32, -40, 64, 64);
        ctx.restore();
      } else {
        ctx.strokeStyle = '#8a7a6a';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(4, 4, 9, -Math.PI * 0.9, Math.PI * 0.6);
        ctx.stroke();
        ctx.fillStyle = '#8a7a6a';
        ctx.beginPath();
        ctx.moveTo(-6, 10);
        ctx.lineTo(-2, 16);
        ctx.lineTo(2, 10);
        ctx.fill();
      }
    } else if (this.kind === 'soul') {
      // 魂火：一团冷色的火球，带拖尾
      const T = tex(), col = this.color || '#6fe38a';
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.6;
      ctx.drawImage(tinted(T.glow, col), -26, -20, 52, 40);
      ctx.globalAlpha = 0.35;
      ctx.drawImage(tinted(T.glow, col), -54, -12, 44, 24);
      ctx.globalAlpha = 1;
      ctx.drawImage(tinted(T.core, col), -9, -9, 18, 18);
    } else if (this.kind === 'arrow') {
      if (this.vy) ctx.rotate(Math.atan2(this.vy, Math.abs(this.vx))); // 预判过的箭斜着飞
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
      game.fx.dustburst(this.x, this.y, Math.min(1.4, this.rx / 120));
      // 首领专属的地面特效（骸骨统领的骨刺）；没有或还没载好时用通用的地面爆发
      if (!this.art || !game.fx.flip(this.art, this.x, this.y, 0, { color: '#d8cbb8', scale: Math.min(1.3, this.rx / 120), facing: Math.random() < 0.5 ? -1 : 1 })) {
        game.fx.flip('impact_ground', this.x, this.y, 0, { color: col, scale: Math.min(1.2, this.rx / 140) });
      }
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
      // 屠夫佯攻的红圈：露出破绽后变淡、闪烁（这一下不会砸）
      if (this.feint && this.owner && this.owner.state === 'windup' && this.owner.st >= Math.round(this.owner.windup * FEINT.cancelAt) - FEINT.reveal) ctx.globalAlpha *= 0.3 + 0.2 * Math.sin(this.t * 1.4);
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
