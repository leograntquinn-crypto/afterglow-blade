// 首领（Boss）：多阶段 + 招式库
//
// 设计原则：
//   1. 每个招式都有明确的预警（红光、感叹号、地面红圈/红带），玩家看得懂才躲得开
//   2. 招式做成「库」，每个 Boss 按阶段从库里挑几招、配上权重 —— 加新 Boss 只需写配置
//   3. 血量降到阈值进入下一阶段：咆哮、震退玩家、霸体回满、出招更快、招式更多
//   4. 打破霸体会打断正在蓄力的招式，并且可以把 Boss 打上天连招 —— 这是最大的输出窗口

import { DEPTH, world, clamp, lerp, rand, toScreen, COLORS, FONT_NUM, FONT_TITLE } from './config.js';
import { Enemy, TYPES } from './enemy.js';
import { Projectile, Hazard, Lane, hitBox, overlaps } from './combat.js';
import { drawFighter, drawAura } from './rig.js';
import { heroSprite, shadowFrame } from './sprite.js';
import { sfx } from './audio.js';

const sign = (v) => Math.sign(v) || 1;
const PHASE_TITLES = ['', '第 二 阶 段', '最 终 阶 段'];

// ---------------- 首领配置 ----------------
const HERO_DARK = {
  rig: 'hero', h: 86, skin: '#c9b8c8', hair: '#e8e4f0', eye: '#b46bff', ribbon: '#b46bff',
  coat: '#1c1626', pants: '#120e18', boots: '#1a1420', glove: '#2a2030', belt: '#2a1e2e', buckle: '#b46bff',
  metal: '#4a4458', trim: '#b46bff', helm: null,
  weapon: { type: 'katana', len: 72, color: '#e6d0ff', glow: '#b46bff', glowA: 0.55, enh: 10 },
};

export const BOSSES = {
  boneLord: {
    name: '骸骨统领', title: '墓穴的守门人', base: 'grunt', scale: 1.5, glow: '#ff5a3c', hp: 1100, armor: 220, bars: 8, speed: 1.6,
    look: { armor: '#6a4a2a', eye: '#ff3b2a', weapon: { type: 'great', len: 60, color: '#b8ad9e', glow: '#ff5a3c', glowA: 0.25 } },
    minion: 'grunt', shot: 'arrow',
    phases: [
      { at: 1, attacks: { combo: 3, slam: 2, charge: 1 } },
      { at: 0.5, line: '骨骸重新拼合，发出愤怒的咆哮', attacks: { combo: 2, slam: 2, charge: 2, summon: 1, shockwave: 1 } },
    ],
  },
  nightRaven: {
    name: '夜鸦', title: '回廊的猎手', base: 'archer', scale: 1.35, glow: '#ff4dd2', hp: 1300, armor: 200, bars: 9, speed: 2.2,
    look: { cloak: '#1a1222', eye: '#ff4dd2', weapon: { type: 'bow', color: '#5a3a6a' } },
    minion: 'archer', shot: 'arrow', keepAway: 300,
    phases: [
      { at: 1, attacks: { volley: 3, teleport: 2, rain: 1 } },
      { at: 0.5, line: '夜色笼罩了整条回廊', attacks: { volley: 2, teleport: 2, rain: 2, summon: 1 } },
    ],
  },
  ironJaw: {
    name: '铁颚', title: '刑场之主', base: 'brute', scale: 1.3, glow: '#ff7a2e', hp: 2200, armor: 480, bars: 12, speed: 1.3,
    look: { metal: '#7a3a2a', skin: '#9a6f5e', eye: '#ff3b2a' },
    minion: 'grunt', shot: 'arrow',
    phases: [
      { at: 1, attacks: { slam: 3, charge: 2, combo: 1 } },
      { at: 0.55, line: '铁颚扯断了身上的锁链', attacks: { slam: 2, charge: 2, shockwave: 2, summon: 1 } },
    ],
  },
  warden: {
    name: '祭坛守护者', title: '深渊的看门者', base: 'brute', scale: 1.35, glow: '#6fe38a', hp: 2600, armor: 560, bars: 14, speed: 1.25,
    look: { metal: '#2e4a3a', skin: '#5a6a5e', leather: '#1e2a22', eye: '#6fe38a', weapon: { type: 'axe', len: 64, color: '#8fb8a0' } },
    minion: 'archer', shot: 'wave',
    phases: [
      { at: 1, attacks: { slam: 2, shockwave: 2, charge: 1 } },
      { at: 0.6, line: '祭坛的火焰变成了绿色', attacks: { shockwave: 2, rain: 2, charge: 2 } },
      { at: 0.3, line: '守护者燃尽了最后的生命', attacks: { rain: 2, shockwave: 2, summon: 1, charge: 2, slam: 1 } },
    ],
  },
  afterimage: {
    name: '残影', title: '深渊中的另一个你', base: null, scale: 1, glow: '#b46bff', hp: 2800, armor: 380, bars: 16, speed: 2.6,
    look: HERO_DARK, minion: 'grunt', shot: 'wave',
    phases: [
      { at: 1, attacks: { combo: 3, teleport: 2, volley: 1 } },
      { at: 0.6, line: '残影的剑光变得更加锋利', attacks: { combo: 2, teleport: 2, volley: 2, charge: 2 } },
      { at: 0.3, line: '它开始模仿你的每一个动作', attacks: { teleport: 3, rain: 2, volley: 2, combo: 2, charge: 1 } },
    ],
  },
};

// 把首领配置变成 Enemy 能用的「类型」
function bossType(B) {
  const base = B.base ? TYPES[B.base] : { w: 34, h: 86, look: {} };
  const look = { ...base.look, ...B.look, h: (B.look.h || base.look.h || 86) * B.scale };
  return {
    name: B.name, lvOff: 3, hp: B.hp, armor: B.armor, w: base.w * B.scale, h: base.h * B.scale,
    speed: B.speed, weight: 3, xp: 150, drop: 1, look, ranged: look.weapon?.type === 'bow', atk: { range: 100 },
  };
}

// ---------------- 招式库 ----------------
// ok(boss, player, game)：现在适不适合用这一招；tick(boss, game, t, d)：每帧执行，返回 true 表示结束
function melee(b, game, hit, set) {
  const p = game.player;
  if (!set.has(p) && overlaps(hitBox(b, hit), p) && game.applyHit(b, p, hit, b.facing)) set.add(p);
}
const dist = (b, p) => Math.abs(p.x - b.x);

const ATTACKS = {
  // 三连斩
  combo: {
    ok: (b, p) => dist(b, p) < 220 && Math.abs(p.y - b.y) < 40,
    tick(b, g, t, d) {
      const p = g.player, sz = b.B.scale;
      const swings = [24, 46, 68].map((s) => Math.round(s / b.spd));
      b.tele = t < swings[0] - 4;
      swings.forEach((s, k) => {
        const up = k % 2 === 1;
        if (t === s - 12) { b.facing = sign(p.x - b.x); b.pa = up ? 1.2 : -2.3; }
        if (t === s) {
          d.set = new Set();
          b.vx = b.facing * 6;
          g.fx.arc(b.x + b.facing * 10, b.y, b.h * 0.62, b.facing, 70 * sz, up ? 1.2 : -2.3, up ? -1.8 : 1.2, b.B.glow, 14);
          sfx('swing');
        }
        if (t >= s && t < s + 6) {
          b.pa = lerp(up ? 1.2 : -2.3, up ? -1.8 : 1.2, (t - s) / 6);
          melee(b, g, { box: { x: 58 * sz, w: 130 * sz, d: 34, z0: 0, z1: 130 * sz }, dmg: 14, kb: 5, stun: 20, stop: 5, shake: 5 }, d.set);
        }
      });
      b.vx *= 0.82;
      return t >= swings[2] + 26;
    },
  },
  // 跳劈：前方大范围红圈
  slam: {
    ok: (b, p) => dist(b, p) < 300,
    tick(b, g, t, d) {
      const D = Math.round(48 / b.spd);
      if (t === 0) {
        b.facing = sign(g.player.x - b.x);
        g.hazards.push(new Hazard({ x: clamp(b.x + b.facing * 110 * b.B.scale, 60, world.w - 60), y: b.y, rx: 150, ry: 56, delay: D, owner: b, ownerState: 'attack',
          hit: { dmg: 26, kb: 9, launch: 10, stop: 9, shake: 12, heavy: true }, color: b.B.glow }));
        sfx('warn');
      }
      b.tele = t < D;
      b.pa = t < D ? -2.6 : 1.2;
      b.pc = t < D ? 0.35 : 0.1;
      return t >= D + 30;
    },
  },
  // 震地波：从脚下向两侧一圈圈扩散。跳起来或者拉开纵深距离可以躲
  shockwave: {
    ok: () => true,
    tick(b, g, t) {
      const D = Math.round(34 / b.spd);
      b.tele = t < D;
      b.pa = t < D ? -2.6 : 1.2;
      b.pc = t < D ? 0.35 : 0.1;
      if (t === D) { g.fx.shake(8, 14); g.fx.dust(b.x, b.y, 14, 2); sfx('heavy'); }
      if (t >= D && (t - D) % 10 === 0 && t < D + 60) {
        const i = (t - D) / 10 + 1;
        for (const s of [-1, 1]) {
          const x = b.x + s * i * 95;
          if (x < 20 || x > world.w - 20) continue;
          g.hazards.push(new Hazard({ x, y: b.y, rx: 58, ry: 62, delay: 22, hit: { dmg: 18, kb: 6, launch: 7, stop: 5, shake: 6 }, color: b.B.glow }));
        }
      }
      return t >= D + 90;
    },
  },
  // 冲锋：先对齐你所在的纵深，地上出现红色路线，然后横穿全场。撞墙会晕眩一会儿
  charge: {
    ok: (b, p) => dist(b, p) > 160,
    tick(b, g, t, d) {
      const p = g.player, T0 = Math.round(42 / b.spd);
      if (t === 0) { b.facing = sign(p.x - b.x); g.hazards.push(new Lane({ follow: b, x: b.x, y: b.y, facing: b.facing, life: T0, half: 30 * b.B.scale })); }
      if (t < T0) {
        b.vy = clamp(p.y - b.y, -2.4, 2.4);
        b.tele = true; b.pc = 0.4; b.pl = 10; b.pa = 2.6;
        return false;
      }
      if (t === T0) { d.set = new Set(); sfx('dash'); }
      if (!d.stop) {
        b.vx = b.facing * 15 * b.spd;
        b.vy = 0;
        b.tele = false;
        if (t % 2 === 0) g.fx.dust(b.x, b.y, 2, 1);
        melee(b, g, { box: { x: 30, w: 110 * b.B.scale, d: 36, z0: 0, z1: 120 * b.B.scale }, dmg: 22, kb: 10, launch: 8, stop: 8, shake: 9, heavy: true }, d.set);
        const wall = b.x <= 60 || b.x >= world.w - 60;
        if (wall || t > T0 + 70) {
          d.stop = t;
          d.stunned = wall;
          b.vx = 0;
          if (wall) { g.fx.shake(10, 18); g.fx.dust(b.x, b.y, 14, 2); sfx('heavy'); g.fx.label(b.x, b.y, b.h + 30, '撞墙晕眩', COLORS.ember, 22); }
        }
        return false;
      }
      b.pa = 2.2; b.pl = -6; b.pc = d.stunned ? 0.4 : 0.1;
      return t >= d.stop + (d.stunned ? 80 : 26);
    },
  },
  // 三连齐射：三条红线标出弹道，然后发射
  volley: {
    ok: (b, p) => dist(b, p) > 120,
    tick(b, g, t, d) {
      const p = g.player, T0 = Math.round(38 / b.spd), twice = b.phase > 0;
      const fire = (offsets) => {
        b.facing = sign(p.x - b.x);
        d.lanes = offsets.map((o) => clamp(p.y + o, 6, DEPTH - 6));
        for (const y of d.lanes) g.hazards.push(new Lane({ x: b.x, y, facing: b.facing, life: T0, half: 14 }));
      };
      if (t === 0) fire([-55, 0, 55]);
      if (twice && t === T0 + 10) fire([-28, 28]);
      b.tele = t < T0;
      b.pa = 0;
      b.pd = Math.min(1, ((t % (T0 + 10)) / T0));
      const shoot = (t === T0) || (twice && t === T0 * 2 + 10);
      if (shoot) {
        const wave = b.B.shot === 'wave';
        for (const y of d.lanes) {
          g.projectiles.push(new Projectile({
            x: b.x + b.facing * 40, y, z: wave ? 0 : 52, vx: b.facing * 9, life: 130, team: 'enemy', kind: b.B.shot, color: b.B.glow, owner: b,
            hit: { box: wave ? { w: 50, d: 22, z0: 0, z1: 100 } : { w: 30, d: 18, z0: -20, z1: 20 }, dmg: 12, kb: 4, stun: 18, stop: 4, shake: 4 },
          }));
        }
        sfx('shoot');
      }
      return t >= (twice ? T0 * 2 + 10 : T0) + 30;
    },
  },
  // 天降：一片光球落下，其中一颗正对着你
  rain: {
    ok: () => true,
    tick(b, g, t) {
      b.tele = t < 20;
      b.pa = -1.6;
      b.pc = 0.2;
      if (t === 20) {
        const p = g.player, n = 6 + b.phase * 2;
        for (let i = 0; i < n; i++) {
          const x = i === 0 ? p.x : clamp(p.x + rand(-420, 420), 40, world.w - 40);
          const y = i === 0 ? p.y : rand(10, DEPTH - 10);
          g.hazards.push(new Hazard({ x, y, rx: 62, ry: 26, delay: 56 + i * 6, kind: 'meteor', color: b.B.glow, hit: { dmg: 16, kb: 5, launch: 6, stop: 5, shake: 6 } }));
        }
        sfx('warn');
      }
      return t >= 64;
    },
  },
  // 召唤小怪
  summon: {
    ok: (b, p, g) => g.enemies.filter((e) => e.alive && !e.isBoss).length < 2,
    tick(b, g, t) {
      b.pa = -1.4;
      b.pc = 0.2;
      if (t === 24) {
        for (const s of [-1, 1]) g.spawnMinion(b.B.minion, clamp(b.x + s * 170, 60, world.w - 60), clamp(b.y + rand(-40, 40), 10, DEPTH - 10));
        g.fx.flash(b.B.glow, 0.15);
        sfx('roar');
      }
      return t >= 54;
    },
  },
  // 瞬移到你背后斩击
  teleport: {
    ok: () => true,
    tick(b, g, t, d) {
      const p = g.player;
      if (t === 0) { g.fx.ring(b.x, b.y, b.h * 0.5, b.B.glow, 10, 8, 14, 4); sfx('dash'); }
      if (t < 22) { b.fade = 1 - t / 22; b.invuln = 2; }
      if (t === 22) {
        b.x = clamp(p.x - p.facing * 110, 40, world.w - 40);
        b.y = p.y;
        b.facing = sign(p.x - b.x);
        g.fx.ring(b.x, b.y, b.h * 0.5, b.B.glow, 10, 8, 14, 4);
      }
      if (t >= 22 && t < 44) { b.fade = (t - 22) / 22; b.tele = true; b.pa = -2.3; b.pc = 0.3; }
      if (t === 44) {
        d.set = new Set();
        b.fade = 1;
        b.tele = false;
        g.fx.arc(b.x + b.facing * 10, b.y, b.h * 0.6, b.facing, 76 * b.B.scale, -2.3, 1.2, b.B.glow, 16);
        sfx('swing');
      }
      if (t >= 44 && t < 50) {
        b.pa = lerp(-2.3, 1.2, (t - 44) / 6);
        melee(b, g, { box: { x: 55 * b.B.scale, w: 140 * b.B.scale, d: 36, z0: 0, z1: 130 * b.B.scale }, dmg: 20, kb: 8, launch: 6, stop: 7, shake: 7, heavy: true }, d.set);
      }
      return t >= 76;
    },
  },
  // 进入新阶段：咆哮，把玩家震开（不造成伤害）
  roar: {
    tick(b, g, t) {
      b.invuln = 2;
      b.pa = -2.0;
      b.pl = -8;
      if (t === 1) {
        g.banner = { title: PHASE_TITLES[b.phase], sub: b.B.phases[b.phase].line, t: 0, color: b.B.glow };
        g.fx.flash(b.B.glow, 0.35);
        g.fx.shake(14, 40);
        sfx('roar');
      }
      if (t === 30) {
        const p = g.player;
        if (Math.abs(p.x - b.x) < 300 && p.state !== 'dead') {
          p.move = null;
          p.setState('hurt');
          p.hurtT = 18;
          p.vx = sign(p.x - b.x) * 12;
        }
        g.fx.ring(b.x, b.y, b.h * 0.5, b.B.glow, 30, 16, 20, 6);
      }
      return t >= 90;
    },
  },
};

// ---------------- Boss ----------------
export class Boss extends Enemy {
  constructor(key, x, y, game, lv) {
    const B = BOSSES[key];
    super(bossType(B), x, y, game, { lv });
    this.B = B;
    this.isBoss = true;
    this.phase = 0;
    this.act = null;
    this.restT = 50;
    this.fade = 1;
    this.bars = B.bars;
  }

  get spd() { return 1 + this.phase * 0.18; } // 阶段越高出招越快

  setState(s) {
    if (s !== 'attack') { this.act = null; this.tele = false; this.fade = 1; }
    super.setState(s);
  }

  update(game) {
    const next = this.B.phases[this.phase + 1];
    if (next && this.alive && this.z <= 0 && this.state !== 'spawn' && this.hp / this.maxHp <= next.at) {
      this.phase++;
      this.armor = this.maxArmor;
      this.brokenT = 0;
      this.startAct('roar');
    }
    super.update(game);
  }

  think(game) {
    const p = game.player;
    if (p.state === 'dead') { this.vx *= 0.8; this.vy = 0; return; }
    this.facing = sign(p.x - this.x);
    if (this.restT > 0) {
      this.restT--;
      // 休息时保持一个舒服的距离
      const want = this.B.keepAway || 150;
      const dx = p.x - this.x, tx = p.x - sign(dx) * want;
      this.vx = Math.abs(tx - this.x) > 10 ? sign(tx - this.x) * this.T.speed * 0.8 : 0;
      this.vy = Math.abs(p.y - this.y) > 6 ? sign(p.y - this.y) * this.T.speed * 0.5 : 0;
      if (this.vx || this.vy) this.walk += 0.15 * this.T.speed;
      return;
    }
    const table = this.B.phases[this.phase].attacks;
    const opts = Object.entries(table).filter(([n]) => ATTACKS[n].ok(this, p, game));
    if (!opts.length) {
      this.vx = sign(p.x - this.x) * this.T.speed;
      this.vy = Math.abs(p.y - this.y) > 6 ? sign(p.y - this.y) * this.T.speed * 0.6 : 0;
      this.walk += 0.15 * this.T.speed;
      return;
    }
    let r = Math.random() * opts.reduce((a, [, w]) => a + w, 0);
    for (const [name, w] of opts) {
      r -= w;
      if (r <= 0) return this.startAct(name);
    }
  }

  startAct(name) {
    this.setState('attack');
    this.act = { name, t: 0, d: {} };
    this.vx = this.vy = 0;
    this.pa = 0.8; this.pc = 0; this.pl = 0; this.pd = 0;
    this.tele = false;
  }

  updateAttack(game) {
    const a = this.act;
    if (!a) return this.setState('idle');
    const done = ATTACKS[a.name].tick(this, game, a.t, a.d);
    a.t++;
    if (done) {
      this.setState('idle');
      this.restT = (rand(28, 56) / this.spd) | 0;
    }
  }

  pose(t) {
    if (this.state === 'attack' && this.act) return { angle: this.pa, crouch: this.pc, lean: this.pl, walk: 0, draw: this.pd, lift: 0, backAngle: 2.2 };
    return super.pose(t);
  }

  draw(ctx, camX, t) {
    let [sx, sy] = toScreen(this.x, this.y, this.z, camX);
    if (this.game.ticks < (this.shakeUntil ?? 0)) sx += (Math.random() - 0.5) * 2 * (this.shakeAmp ?? 3);
    let alpha = this.fade;
    if (this.state === 'dying' && this.z <= 0) alpha *= Math.max(0, 1 - this.deadT / 45);
    if (this.state === 'spawn') alpha *= Math.min(1, this.st / 24);
    if (this.tele) drawAura(ctx, sx, sy, this.h, '#ff2a2a', (1.3 + 0.5 * Math.sin(t * 0.6)) * alpha);
    else if (this.alive) drawAura(ctx, sx, sy, this.h, this.armor > 0 ? this.B.glow : COLORS.ember, (0.8 + 0.25 * Math.sin(t * 0.1) + this.phase * 0.3) * alpha);
    const flash = this.game.ticks < (this.flashUntil ?? 0);
    if (this.B === BOSSES.afterimage && heroSprite.ready) {
      // 残影：和主角同一套动画，盖一层暗紫色，外圈紫色轮廓光
      heroSprite.draw(ctx, shadowFrame(this, t), sx, sy, this.facing, { alpha, flash, overlay: '#12061f', overlayAlpha: 0.74, rim: '#9a5cff', rimAlpha: 0.5 });
    } else {
      drawFighter(ctx, sx, sy, this.look, this.pose(t), { facing: this.facing, flash, alpha, t });
    }
    const top = sy - this.h - 18;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.tele && this.fade > 0.5) {
      const s = 1 + 0.15 * Math.sin(t * 0.5);
      ctx.font = `600 ${38 * s}px ${FONT_NUM}`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#1a0606';
      ctx.strokeText('!', sx, top - 10);
      ctx.fillStyle = '#ff3b3b';
      ctx.fillText('!', sx, top - 10);
    } else if (this.brokenT > 0 && this.alive) {
      ctx.font = `22px ${FONT_TITLE}`;
      ctx.fillStyle = COLORS.ember;
      ctx.fillText('破防', sx, top - 10);
    }
    ctx.restore();
  }
}
