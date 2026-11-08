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
import { drawFighter } from './rig.js';
import { drawEnemyAura } from './enemy_fx.js';
import { ENEMY_FX } from './fx_data.js';
import { heroSprite, shadowFrame, runStep } from './sprite.js';
import { BOSS_SCALE } from './boss_scale.js';

const READ_TOAST = {
  dodge: '残影在学你：你爱闪避 —— 它开始用错开时机的多段斩逼你把闪避交早',
  parry: '残影在学你：你爱弹刀 —— 它改用弹不开的远程',
  greed: '残影在学你：你爱贪刀 —— 它会瞬移到你背后',
  whiff: '残影在学你：你常空挥 —— 它会冲过来抓你的空挥',
};
import { bossFrame, ENEMY_SPRITES, BOSS_SPRITES, bossOwnFrame } from './enemy_sprites.js';
import { sfx } from './audio.js';
import { updateNight } from './raven_night.js';
import { SIGNATURE, SIGNATURE_PHASES } from './boss_moves.js';

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
    channel: '亡骨号令',
    phases: [
      { at: 1, attacks: { combo: 3, slam: 2, charge: 1 } },
      { at: 0.5, line: '骨骸重新拼合，发出愤怒的咆哮', attacks: { combo: 2, slam: 2, charge: 2, summon: 1, shockwave: 1, channel: 1 } },
    ],
  },
  nightRaven: {
    name: '夜鸦', title: '回廊的猎手', base: 'archer', scale: 1.35, glow: '#ff4dd2', hp: 1300, armor: 200, bars: 9, speed: 2.2,
    look: { cloak: '#1a1222', eye: '#ff4dd2', weapon: { type: 'bow', color: '#5a3a6a' } },
    minion: 'archer', shot: 'arrow', keepAway: 300,
    channel: '夜幕箭雨',
    phases: [
      { at: 1, attacks: { volley: 3, teleport: 2, rain: 1 } },
      { at: 0.5, line: '夜色笼罩了整条回廊', attacks: { volley: 2, teleport: 2, rain: 2, summon: 1, channel: 1 } },
    ],
  },
  ironJaw: {
    name: '铁颚', title: '刑场之主', base: 'brute', scale: 1.3, glow: '#ff7a2e', hp: 2200, armor: 480, bars: 12, speed: 1.3,
    look: { metal: '#7a3a2a', skin: '#9a6f5e', eye: '#ff3b2a' },
    minion: 'grunt', shot: 'arrow',
    channel: '断头重锤',
    phases: [
      { at: 1, attacks: { slam: 3, charge: 2, combo: 1 } },
      { at: 0.55, line: '铁颚扯断了身上的锁链', attacks: { slam: 2, charge: 2, shockwave: 2, summon: 1, channel: 1 } },
    ],
  },
  warden: {
    name: '祭坛守护者', title: '深渊的看门者', base: 'brute', scale: 1.35, glow: '#6fe38a', hp: 2600, armor: 560, bars: 14, speed: 1.25,
    look: { metal: '#2e4a3a', skin: '#5a6a5e', leather: '#1e2a22', eye: '#6fe38a', weapon: { type: 'axe', len: 64, color: '#8fb8a0' } },
    minion: 'archer', shot: 'wave',
    channel: '祭坛炎狱',
    phases: [
      { at: 1, attacks: { slam: 2, shockwave: 2, charge: 1 } },
      { at: 0.6, line: '祭坛的火焰变成了绿色', attacks: { shockwave: 2, rain: 2, charge: 2, channel: 1 } },
      { at: 0.3, line: '守护者燃尽了最后的生命', attacks: { rain: 2, shockwave: 2, summon: 1, charge: 2, slam: 1, channel: 1 } },
    ],
  },
  afterimage: {
    name: '残影', title: '深渊中的另一个你', base: null, scale: 1, glow: '#b46bff', hp: 2800, armor: 380, bars: 16, speed: 2.6,
    look: HERO_DARK, minion: 'grunt', shot: 'wave',
    channel: '残光逆转',
    // 读习惯（第 12 项）：你的哪种习惯明显 → 哪些招式的权重加上去（boss.js 的 habitTable）
    reads: { dodge: ['execution', 'combo'], parry: ['volley', 'rain'], greed: ['teleport'], whiff: ['charge'] },
    phases: [
      { at: 1, attacks: { combo: 3, teleport: 2, volley: 1 } },
      { at: 0.6, line: '残影的剑光变得更加锋利', attacks: { combo: 2, teleport: 2, volley: 2, charge: 2, channel: 1 } },
      { at: 0.3, line: '它开始模仿你的每一个动作', attacks: { teleport: 3, rain: 2, volley: 2, combo: 2, charge: 1, channel: 1 } },
    ],
  },
};

// 每个首领的专属招式追加到各阶段的招式表（见 boss_moves.js）
for (const [key, list] of Object.entries(SIGNATURE_PHASES)) {
  BOSSES[key].phases.forEach((ph, i) => { ph.attacks = { ...ph.attacks, ...(list[i] || {}) }; });
}

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
      // 首领动态难度（boss_scale.js）：强化到一定幅度时三连斩多一两刀
      const swings = Array.from({ length: 3 + (b.dyn?.comboAdd ?? 0) }, (_, k) => Math.round((24 + 22 * k) / b.spd));
      b.tele = t < swings[0] - 4;
      swings.forEach((s, k) => {
        const up = k % 2 === 1;
        if (t === s - 12) { b.facing = sign(p.x - b.x); b.pa = up ? 1.2 : -2.3; }
        if (t === s) {
          d.set = new Set();
          b.vx = b.facing * 6;
          g.fx.arc(b.x + b.facing * 10, b.y, b.h * 0.62, b.facing, 70 * sz, up ? 1.2 : -2.3, up ? -1.8 : 1.2, b.B.glow, 14);
          if (b.key === 'boneLord') g.fx.flip('bone_rend', b.x + b.facing * 14, b.y, b.h * 0.6, { facing: b.facing, flipY: up ? -1 : 1, color: b.B.glow, scale: sz / 1.5 });
          sfx('swing');
        }
        if (t >= s && t < s + 6) {
          b.pa = lerp(up ? 1.2 : -2.3, up ? -1.8 : 1.2, (t - s) / 6);
          melee(b, g, { box: { x: 58 * sz, w: 130 * sz, d: 34, z0: 0, z1: 130 * sz }, dmg: 14, kb: 5, stun: 20, stop: 5, shake: 5 }, d.set);
        }
      });
      b.vx *= 0.82;
      return t >= swings[swings.length - 1] + 26;
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
          hit: { dmg: 26, kb: 9, launch: 10, stop: 9, shake: 12, heavy: true }, color: b.B.glow, art: b.key === 'boneLord' ? 'bone_spikes' : null }));
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
      if (t === D) { g.fx.shake(8, 14); g.fx.dust(b.x, b.y, 14, 2); g.fx.dustburst(b.x, b.y, 1.1); sfx('heavy'); }
      if (t >= D && (t - D) % 10 === 0 && t < D + 60) {
        const i = (t - D) / 10 + 1;
        for (const s of [-1, 1]) {
          const x = b.x + s * i * 95;
          if (x < 20 || x > world.w - 20) continue;
          g.hazards.push(new Hazard({ x, y: b.y, rx: 58, ry: 62, delay: 22, hit: { dmg: 18, kb: 6, launch: 7, stop: 5, shake: 6 }, color: b.B.glow, art: b.key === 'boneLord' ? 'bone_spikes' : null }));
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
      if (t === 0 && (b.key !== 'warden' || !g.fx.flip('summon_circle', b.x, b.y, 0, { ground: true, hold: 30, color: b.B.glow, scale: 0.65 }))) g.fx.rune(b.x, b.y, 1, b.B.glow, 120, 54, 0.02);
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
  // 读条大招（第二阶段起）：首领原地读条约 3 秒，脚下的红圈慢慢铺满整个房间。
  // 读条期间每次命中都累计打断值（见 main.js 的 applyHit），读条结束前打满 → 首领倒地破防；
  // 没打断 → 全场爆炸，跳到空中或极限闪避可以躲开。一场战斗里隔一段时间才会再读条
  channel: {
    ok: (b) => (b.channelCd ?? 0) <= 0,
    tick(b, g, t, d) {
      if (t === 0) {
        d.T = Math.round(180 / b.spd);
        d.need = 16 + b.phase * 3; // 打断值：普通命中 +1，重击 / 技能命中 +2，必杀 +4
        d.pts = 0;
        b.channel = d;
        b.channelCd = 900;
        g.hazards.push(new Hazard({ x: b.x, y: b.y, rx: 900, ry: 260, delay: d.T, owner: b, ownerState: 'attack', color: b.B.glow,
          hit: { dmg: 34, kb: 10, launch: 9, stop: 10, shake: 16, heavy: true } }));
        g.fx.label(b.x, b.y, b.h + 70, `「${b.B.channel}」`, b.B.glow, 34);
        if (b.key !== 'warden' || !g.fx.flip('summon_circle', b.x, b.y, 0, { ground: true, hold: d.T, color: b.B.glow, scale: 0.9 })) g.fx.rune(b.x, b.y, 1, b.B.glow, 170, d.T, -0.008);
        g.toast(`${b.B.name}在读条「${b.B.channel}」：打断它，或者跳起来 / 极限闪避躲开`, b.B.glow);
        sfx('roar');
      }
      b.tele = true;
      b.vx = b.vy = 0;
      b.pa = -2.6; b.pc = 0.3; b.pl = -4;
      if (t % 20 === 0) g.fx.ring(b.x, b.y, b.h * 0.5, b.B.glow, 16, 6, 24, 4);
      if (t >= d.T) {
        b.channel = null;
        g.fx.flash(b.B.glow, 0.45);
        g.fx.shake(18, 34);
        return true;
      }
      return false;
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
Object.assign(ATTACKS, SIGNATURE); // 五个首领各 2 个专属招式

// ---------------- Boss ----------------
export class Boss extends Enemy {
  constructor(key, x, y, game, lv) {
    const B = BOSSES[key];
    super(bossType(B), x, y, game, { lv });
    this.B = B;
    this.key = key;
    this.isBoss = true;
    this.phase = 0;
    this.act = null;
    this.restT = 50;
    this.fade = 1;
    this.bars = B.bars;
  }

  get spd() { return (1 + this.phase * 0.18) * (this.game.D?.bossSpd ?? 1); } // 阶段越高、难度越高，出招越快

  setState(s) {
    if (s !== 'attack') { this.act = null; this.tele = false; this.fade = 1; this.split = null; } // 被打断时分身也散了
    super.setState(s);
  }

  update(game) {
    if (this.state === 'idle' && (this.vx || this.vy)) this.runDist = (this.runDist ?? 0) + runStep(this.vx, this.vy); // 残影跑步换帧按距离（sprite.js runFrame / runStep）
    if (this.channelCd > 0) this.channelCd--;
    if (this.state !== 'attack' || this.act?.name !== 'channel') this.channel = null; // 被打断 / 破防时读条作废
    const next = this.B.phases[this.phase + 1];
    if (next && this.alive && this.z <= 0 && this.state !== 'spawn' && this.hp / this.maxHp <= next.at) {
      this.phase++;
      this.armor = this.maxArmor;
      this.brokenT = 0;
      this.startAct('roar');
    }
    super.update(game);
    updateNight(this, game); // 夜鸦第二阶段的夜色（raven_night.js）
    // 出招预警的一瞬间：脚下的红圈往里收、红光往身上聚（和「!」一起出现，告诉你要闪了）
    if (this.tele && !this.wasTele && this.alive) {
      game.fx.gwarn(this.x, this.y, '#ff3b3b', this.w * 1.4 + 70, this.w * 0.45, 24);
      game.fx.converge(this.x, this.y, this.h * 0.6, 8, '#ff4d4d');
    }
    this.wasTele = this.tele;
    // 祭坛守护者：香炉里的魂火（循环序列帧，跟着首领走）
    if (this.key === 'warden' && this.alive && this.state !== 'spawn' && !(this.soulFx?.life > 0 && this.soulFx.follow === this)) {
      this.soulFx = game.fx.flip('soul_fire', this.x, this.y, 0, { follow: this, ox: this.h * 0.03, oz: this.h * 0.31, color: this.B.glow, life: 240, scale: this.h / 200 }) || null;
    }
    // 首领身上不断往上飘的气：阶段越高越密
    if (this.alive && this.state !== 'spawn' && game.ticks % (this.phase >= 1 ? 3 : 5) === 0) {
      game.fx.emit('aura', this.x + rand(-this.w * 0.5, this.w * 0.5), this.y + rand(-6, 6), rand(0, this.h * 0.5), { color: this.B.glow, n: 1 });
    }
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
    const table = this.habitTable(game, this.B.phases[this.phase].attacks);
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

  // 残影读你的习惯（B.reads，第 12 项）：按 ai.js 的玩家模型调招式权重 —— 爱闪避 → 多用处决（多段、时机错开）和佯攻性的瞬身；
  // 爱弹刀 → 多用射击 / 箭雨（弹不了）；爱贪刀 → 多瞬移到你背后；爱空挥 → 多冲锋抓空挥。力度随动态难度加强
  habitTable(game, table) {
    const R = this.B.reads, H = game.ai?.habits;
    if (!R || !H) return table;
    const k = BOSS_SCALE.habit * (1 + (this.dyn?.bonus ?? 0)), out = { ...table };
    let top = null;
    for (const [habit, moves] of Object.entries(R)) {
      const h = H.h(habit);
      if (h > (top?.h ?? 0.35)) top = { habit, h };
      for (const m of moves) if (out[m] != null) out[m] *= 1 + h * k;
    }
    if (top && !this.readShown?.[top.habit]) {
      (this.readShown ??= {})[top.habit] = true;
      game.toast?.(READ_TOAST[top.habit], this.B.glow);
      game.fx.label(this.x, this.y, this.h + 50, '它在学你', this.B.glow, 22);
    }
    return out;
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
      this.restT = (rand(28, 56) / this.spd / (1 + (this.dyn?.bonus ?? 0))) | 0; // 动态难度：出招更频繁
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
    // 状态光（fx_enemy_v1）：出招 aura_threat（红），平时 aura_guard（有霸体用首领自己的颜色，否则余烬橙，阶段越高越亮）。素材没载好时不画
    if (this.tele) drawEnemyAura(ctx, this, sx, sy, 'bossThreat', t, alpha);
    else if (this.alive) {
      const I = ENEMY_FX.aura.bossIdle;
      drawEnemyAura(ctx, this, sx, sy, 'bossIdle', t, alpha * (1 + (this.phase * I.phase) / I.alpha), this.armor > 0 ? this.B.glow : COLORS.ember);
    }
    const flash = this.game.ticks < (this.flashUntil ?? 0);
    const drawBody = (sx, sy, alpha) => {
      if (this.B === BOSSES.afterimage && heroSprite.ready) {
        // 残影：和主角同一套动画，盖一层暗紫色，外圈紫色轮廓光
        heroSprite.draw(ctx, shadowFrame(this, t), sx, sy, this.facing, { alpha, flash, overlay: '#12061f', overlayAlpha: 0.74, rim: '#9a5cff', rimAlpha: 0.5 });
      } else if (BOSS_SPRITES[this.key]?.sheet.ready) {
        // 骸骨统领 / 夜鸦 / 铁颚 / 祭坛守护者：专属逐帧素材，外圈用首领的颜色做轮廓光
        const BS = BOSS_SPRITES[this.key];
        BS.sheet.draw(ctx, bossOwnFrame(this, t), sx, sy, this.facing, { scale: this.look.h / BS.standH, alpha, flash, rim: this.B.glow, rimAlpha: 0.32 });
      } else if (ENEMY_SPRITES[this.B.base]?.sheet.ready) {
        // 专属素材还没载入完（或载入失败）的首领：对应杂兵的逐帧动画放大，压暗一点，外圈用首领的颜色做轮廓光
        ENEMY_SPRITES[this.B.base].sheet.draw(ctx, bossFrame(this, t), sx, sy, this.facing, { scale: this.look.h / ENEMY_SPRITES[this.B.base].standH, alpha, flash, overlay: '#2a0805', overlayAlpha: 0.32, rim: this.B.glow, rimAlpha: 0.45 });
      } else {
        drawFighter(ctx, sx, sy, this.look, this.pose(t), { facing: this.facing, flash, alpha, t });
      }
    };
    drawBody(sx, sy, alpha);
    // 鸦影分身：另外两个身影（没有脚下的影子 —— 这是分辨真身的线索）
    if (this.split) {
      const k = Math.min(1, this.split.t / 10) * 0.85;
      for (const sp of this.split.spots) {
        const [dx, dy] = toScreen(sp.x, sp.y, this.z, camX);
        drawBody(dx, dy, alpha * k);
      }
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
