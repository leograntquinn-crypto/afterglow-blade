// 招式表 —— 数据驱动设计
//
// 动作游戏的手感，很大程度上就是这张表里的数字。
// 所有时间单位都是「帧」（60 帧 = 1 秒）。改这里的数字就能调手感，不用改逻辑代码。
//
//   total   招式总帧数
//   cancel  从第几帧起可以「取消」进下一招（连招的关键）
//   next    普攻连段的下一招
//   lunge   [开始帧, 结束帧, 速度] 出招时向前踏步
//   swing   [起始角度, 结束角度] 武器挥动轨迹（画刀光用）
//   armor   霸体：被打不会硬直
//   hits    判定列表：
//     at/dur  第几帧开始生效、持续几帧
//     box     判定框
//     dmg 伤害 | kb 击退 | launch 浮空 | stun 硬直帧 | stop 顿帧 | shake 震屏
//     spike   向下砸（落地反弹）| radial 以自身为中心向外击退

import { Projectile } from './combat.js';
import { sfx } from './audio.js';

const MELEE = { x: 48, w: 92, d: 30, z0: 0, z1: 100 };

export const MOVES = {
  // ---------- 普攻三连 ----------
  slash1: {
    total: 22, cancel: 10, next: 'slash2', lunge: [2, 7, 2.2], swing: [-2.0, 0.9],
    hits: [{ at: 5, dur: 4, box: MELEE, dmg: 10, kb: 2.5, stun: 20, stop: 4, shake: 2 }],
  },
  slash2: {
    total: 22, cancel: 10, next: 'slash3', lunge: [2, 7, 2.6], swing: [1.0, -1.6],
    hits: [{ at: 5, dur: 4, box: MELEE, dmg: 12, kb: 2.8, stun: 20, stop: 4, shake: 2 }],
  },
  slash3: {
    total: 34, cancel: 20, lunge: [3, 10, 4.5], swing: [-2.4, 1.2], heavy: true,
    hits: [{ at: 8, dur: 5, box: { x: 55, w: 112, d: 34, z0: 0, z1: 110 }, dmg: 22, kb: 8, stun: 26, stop: 8, shake: 7, heavy: true }],
  },
  // ---------- 上挑（↑ + 攻击）：把敌人打上天，可以跳跃取消去追击 ----------
  upper: {
    total: 30, cancel: 13, jumpCancel: true, lunge: [2, 6, 2], swing: [1.3, -2.0],
    hits: [{ at: 6, dur: 5, box: { x: 42, w: 84, d: 30, z0: 0, z1: 130 }, dmg: 14, kb: 1.2, launch: 12, stop: 6, shake: 4 }],
  },
  // ---------- 空中攻击 ----------
  airSlash: {
    air: true, total: 20, cancel: 9, next: 'airSlash2', swing: [-1.8, 0.8], hang: 2.5,
    hits: [{ at: 4, dur: 5, box: { x: 44, w: 94, d: 32, z0: -50, z1: 80 }, dmg: 11, kb: 1.5, launch: 5, stop: 5, shake: 2 }],
  },
  airSlash2: {
    air: true, total: 24, cancel: 14, swing: [-2.4, 1.6], hang: 1, heavy: true,
    hits: [{ at: 5, dur: 5, box: { x: 40, w: 98, d: 34, z0: -70, z1: 70 }, dmg: 16, kb: 2, spike: true, stop: 8, shake: 6, heavy: true }],
  },
  // ---------- 冲刺攻击（闪避中按攻击）----------
  dashAtk: {
    total: 28, cancel: 18, lunge: [0, 10, 9], swing: [0.05, 0.05], thrust: true,
    hits: [{ at: 3, dur: 8, box: { x: 50, w: 100, d: 30, z0: 0, z1: 100 }, dmg: 16, kb: 7, stun: 24, stop: 6, shake: 4 }],
  },

  // ---------- 技能 ----------
  wave: {
    skill: true, total: 30, cancel: 20, armor: true, swing: [-2.3, 1.0], swingAt: 8, swingDur: 4, heavy: true,
    events: { 10: spawnWave },
    hits: [],
  },
  whirl: {
    skill: true, total: 56, cancel: 46, armor: true, moveDuring: 2.4, spin: true,
    hits: [6, 14, 22, 30, 38].map((at, i) => {
      const last = i === 4;
      return {
        at, dur: 4, radial: true, box: { x: 0, w: 176, d: 46, z0: -10, z1: 120 },
        dmg: last ? 14 : 8, kb: last ? 7 : -1.5, launch: last ? 7 : 0, stun: 22,
        stop: last ? 7 : 3, shake: last ? 6 : 2, heavy: last,
      };
    }),
  },
  quake: {
    skill: true, total: 66, cancel: 50, armor: true, invuln: [0, 34], swing: [-2.9, 1.3], swingAt: 28, swingDur: 3, heavy: true,
    events: { 0: charge, 8: charge, 16: charge, 30: quakeBurst },
    hits: [{ at: 30, dur: 4, absZ: true, radial: true, box: { x: 30, w: 340, d: 80, z0: -10, z1: 170 }, dmg: 55, kb: 5, launch: 14, stop: 14, shake: 16, heavy: true }],
  },
  // 千刃·残光：突进 + 八连斩 + 重斩收尾
  flurry: {
    skill: true, total: 80, cancel: 70, armor: true, invuln: [0, 22], lunge: [0, 10, 9], flurry: true, heavy: true,
    swing: [-2.2, 1.4], swingAt: 56, swingDur: 4,
    events: { 0: flurryStart, 56: flurryEnd },
    hits: [
      ...[8, 13, 18, 23, 28, 33, 38, 43].map((at) => ({
        at, dur: 3, box: { x: 34, w: 150, d: 40, z0: -10, z1: 140 }, dmg: 9, kb: 0.6, stun: 30, stop: 2, shake: 2,
      })),
      { at: 56, dur: 4, box: { x: 50, w: 190, d: 46, z0: -10, z1: 160 }, dmg: 50, kb: 7, launch: 12, stun: 30, stop: 13, shake: 13, heavy: true },
    ],
  },
};

export const SKILLS = {
  skill1: { key: 'U', name: '裂空斩', glyph: '裂', move: 'wave', mp: 15, cd: 150 },
  skill2: { key: 'I', name: '回风斩', glyph: '风', move: 'whirl', mp: 22, cd: 330 },
  skill3: { key: 'O', name: '崩山击', glyph: '崩', move: 'quake', mp: 40, cd: 720 },
  skill4: { key: 'P', name: '千刃·残光', glyph: '千', move: 'flurry', mp: 50, cd: 900 },
};
export const SKILL_KEYS = Object.keys(SKILLS);

// 给技能的判定打上标签，伤害计算时按技能等级加成
for (const [key, s] of Object.entries(SKILLS)) for (const h of MOVES[s.move].hits) h.skill = key;

// ---------- 招式事件 ----------
function spawnWave(p, game) {
  game.projectiles.push(new Projectile({
    x: p.x + p.facing * 40, y: p.y, z: 0, vx: p.facing * 10.5, life: 46, team: 'player', kind: 'wave', pierce: true,
    hit: { box: { w: 56, d: 30, z0: 0, z1: 100 }, dmg: 26, kb: 3, launch: 8, stop: 6, shake: 5, heavy: true, skill: 'skill1' },
    color: p.glow,
  }));
  game.fx.ring(p.x + p.facing * 40, p.y, 50, p.glow, 10, 6, 12, 4);
}

function charge(p, game) {
  game.fx.converge(p.x, p.y, p.z + 50, 14, p.glow);
  game.fx.flash(p.glow, 0.08);
}

function flurryStart(p, game) {
  game.fx.dust(p.x, p.y, 10, 2);
  game.fx.flash(p.glow, 0.12);
}

function flurryEnd(p, game) {
  game.fx.flash('#ffffff', 0.3);
  game.fx.ring(p.x + p.facing * 60, p.y, 60, p.glow, 20, 10, 16, 6);
  game.fx.spark(p.x + p.facing * 60, p.y, 60, p.facing, 16, p.glow);
}

function quakeBurst(p, game) {
  const x = p.x + p.facing * 30;
  game.fx.flash('#ffffff', 0.55);
  game.fx.shake(16, 28);
  for (let i = 0; i < 3; i++) game.fx.ring(x, p.y, 2, i ? p.glow : '#ffffff', 20 + i * 12, 12 - i * 2, 18 + i * 4, 6);
  game.fx.dust(x, p.y, 26, 3);
  game.fx.spark(x, p.y, 10, 1, 10, p.glow);
  game.fx.spark(x, p.y, 10, -1, 10, p.glow);
  game.fx.crack(x, p.y);
  sfx('quake');
}
