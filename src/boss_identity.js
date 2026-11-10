// 首领身份机制（第 9 项「每个首领要补到的身份」，设计见 docs/AUDIT_PRE_GODOT.md 第 9 项）。
// 夜鸦的夜色在 raven_night.js；这里是另外四个：
//   铁颚「刑场的重量」：场地中央一座刑台。锁链钩中你，会把你拖上刑台、它自己落在台边砍下来；站在台上挨它的打更痛。
//   祭坛守护者「借来的火」：第二阶段起，魂火炉活着就给它续霸体，打碎一座就削它一截；第三阶段火焰失控：它自己慢慢烧血，审判扫过的地方留下余火。
//   骸骨统领「拼合的骨」：骨片飞散后落地停一会儿再飞回来，飞回来的骨片会补它的霸体 / 缩短破防；落地时踩碎就回不去。
//   残影「你的反面」：记住你这一战最常用的技能。镜像照它出；第二阶段起你再放这招，它会看穿、瞬身到你背后。
// 数值都在 IDENTITY 表里；画法借各首领已有的素材包（boss_fx.js），素材没载好时退回已载入的敌人通用素材，不画代码形状。
import { DEPTH, world } from './config.js';
import { sfx } from './audio.js';
import { drawIronJawPlatform, drawWardenEmbers } from './boss_fx.js';

export const IDENTITY = {
  ironJaw: {
    platform: { rx: 120, ry: 50, edge: 70 }, // 刑台：场地正中的椭圆；edge = 拖拽时铁颚落在离台心多远的地方
    mul: 1.25, // 你站在刑台上时，铁颚的伤害倍率
    pull: 0.28, // 拖拽时每帧靠近目标的比例（12 帧拖完）
  },
  warden: {
    feed: 0.012, // 每座活着的魂火炉，每秒给守护者回复最大霸体的这么多（只在有霸体时）
    shatter: 0.12, // 打碎一座炉子，守护者霸体立刻减少最大值的这么多
    burn: 0.0025, // 第三阶段：每秒烧掉自己最大生命的这么多
    burnFloor: 0.03, // 自烧不会把它烧到这个血量以下（要你亲手结束）
    embers: { life: 90, every: 30, dmg: 5, half: 22, z: 40, alpha: 0.65 }, // 余火：持续帧数、每隔几帧烫一次、伤害、半宽、高度
  },
  boneLord: {
    trample: { x: 36, y: 22, z: 20 }, // 骨片落地停留时，你走到这么近就踩碎它
    armor: 0.03, // 每片飞回来的骨片补最大霸体的这么多（霸体没破时）
    broken: 30, // 破防期间每片飞回来的骨片让破防时间缩短这么多帧
  },
  afterimage: {
    minUses: 3, // 一招用到第几次起，残影会看穿它
    cd: 360, // 看穿之后多久才会再看穿
    range: 420, // 离你多远以内才会看穿
    fromPhase: 1, // 从第几阶段（0 起算）开始看穿
  },
};

const SKILL_GLYPH = { wave: '裂', whirl: '风', quake: '崩', flurry: '千' };

// 每帧由 Boss.update 调用
export function updateIdentity(b, game) {
  if (!b.identityInit) {
    b.identityInit = true;
    if (b.key === 'afterimage') game.skillUse = {}; // 只算这一战
  }
  if (b.key === 'ironJaw') keepPlatform(b, game);
  else if (b.key === 'warden') updateWarden(b, game);
  else if (b.key === 'afterimage') updateAfterimage(b, game);
}

// ---------------- 铁颚：刑台 ----------------
function keepPlatform(b, game) {
  if (!b.alive) return;
  const P = IDENTITY.ironJaw.platform;
  if (!b.platform) {
    b.platform = {
      x: world.w / 2, y: DEPTH / 2, rx: P.rx, ry: P.ry, t: 0, dead: false, boss: b,
      update() { this.t++; if (!this.boss.alive) this.dead = true; },
      drawFloor(ctx, camX) { if (!this.dead) drawIronJawPlatform(ctx, this, camX); },
    };
  }
  // 换房间 / 测试清空地面队列时补回去（刑台跟着首领走，不跟着某一次招式）
  if (!b.platform.dead && !game.hazards.includes(b.platform)) game.hazards.push(b.platform);
}

export function onPlatform(b, p) {
  const P = b.platform;
  if (!P || P.dead) return false;
  const dx = (p.x - P.x) / P.rx, dy = (p.y - P.y) / P.ry;
  return dx * dx + dy * dy <= 1 && (p.z ?? 0) < 40;
}

// 锁链钩中后的目标：你被拖到台心，铁颚落在台边（留在它原来那一侧），面朝台心
export function hookDestination(b) {
  const P = b.platform;
  if (b.key !== 'ironJaw' || !P || P.dead) return null;
  const side = Math.sign(b.x - P.x) || -1, E = IDENTITY.ironJaw.platform.edge;
  return { px: P.x, py: P.y, bx: Math.max(40, Math.min(world.w - 40, P.x + side * E)), by: P.y, facing: -side };
}

// main.js calcDamage：敌方伤害的额外倍率
export function bossDamageMul(src, target) {
  if (src?.key === 'ironJaw' && target?.team === 'player' && onPlatform(src, target)) return IDENTITY.ironJaw.mul;
  return 1;
}

// ---------------- 祭坛守护者：借来的火 / 火焰失控 ----------------
const isBrazierOf = (e, b) => e.owner === b && e.team === 'prop' && !e.remove && e.hp > 0;

function updateWarden(b, game) {
  if (!b.alive) return;
  const W = IDENTITY.warden;
  if (b.phase >= 1 && b.armor > 0 && !(b.brokenT > 0)) {
    const n = game.enemies.filter((e) => isBrazierOf(e, b)).length;
    if (n) b.armor = Math.min(b.maxArmor, b.armor + (b.maxArmor * W.feed * n) / 60);
  }
  if (b.phase >= 2) b.hp = Math.max(Math.min(b.hp, b.maxHp * W.burnFloor), b.hp - (b.maxHp * W.burn) / 60);
}

// 魂火炉被打碎（Brazier.shatter 调用）
export function brazierBroken(game, brazier) {
  const b = brazier.owner;
  if (b?.key !== 'warden' || !b.alive || !(b.armor > 0)) return;
  b.armor = Math.max(1, b.armor - b.maxArmor * IDENTITY.warden.shatter); // 不在这里替你破防：破防仍要靠打
  game.fx.label(b.x, b.y, b.h + 40, '炉 火 熄 灭', b.B.glow, 24);
}

// 第三阶段审判横扫之后留下的余火（judgment 的 sweep 调用）
export function wardenEmbers(game, b, x0, x1, y) {
  if (b.key !== 'warden' || b.phase < 2) return false;
  const E = IDENTITY.warden.embers, lo = Math.min(x0, x1), hi = Math.max(x0, x1);
  game.hazards.push({
    x: (lo + hi) / 2, y, rx: (hi - lo) / 2, x0, x1, lo, hi, facing: Math.sign(x1 - x0) || 1, half: E.half,
    t: 0, life: E.life, dead: false, warden: b,
    update(g) {
      if (++this.t >= this.life) { this.dead = true; return; }
      if (this.t % E.every) return;
      const p = g.player;
      if (p.alive !== false && p.hp > 0 && (p.z ?? 0) < E.z && Math.abs(p.y - this.y) < this.half && p.x >= this.lo - 10 && p.x <= this.hi + 10) {
        g.applyHit(b, p, { dmg: E.dmg, kb: 0, launch: 0, stun: 6, stop: 0, shake: 2 }, this.facing);
      }
    },
    drawFloor(ctx, camX) {
      if (this.dead) return;
      const fade = Math.min(1, (this.life - this.t) / 20, (this.t + 1) / 6);
      drawWardenEmbers(ctx, this, camX, E.alpha * fade);
    },
  });
  return true;
}

// ---------------- 骸骨统领：骨片飞回 ----------------
// 骨片落地停留期间（boss_fx.js 的 boneShards）每帧问一次：你踩上来就碎
export function trampled(game, shard) {
  const p = game.player, T = IDENTITY.boneLord.trample;
  return Math.abs(p.x - shard.x) < T.x && Math.abs(p.y - shard.y) < T.y && (p.z ?? 0) < T.z;
}

export function shardReturned(boss) {
  if (boss.key !== 'boneLord' || !boss.alive) return;
  const B = IDENTITY.boneLord;
  if (boss.brokenT > 0) boss.brokenT = Math.max(1, boss.brokenT - B.broken);
  else if (boss.armor > 0) boss.armor = Math.min(boss.maxArmor, boss.armor + boss.maxArmor * B.armor);
}

// ---------------- 残影：看穿你最常用的技能 ----------------
export function favoriteSkill(game) {
  const use = game.skillUse ?? {};
  let best = null;
  for (const [k, n] of Object.entries(use)) if (!best || n > use[best] || (n === use[best] && k === game.lastSkill)) best = k;
  return best;
}

function updateAfterimage(b, game) {
  const A = IDENTITY.afterimage;
  if (b.counterCd > 0) b.counterCd--;
  if (!b.alive || b.phase < A.fromPhase || b.counterCd > 0 || b.state !== 'idle') return;
  if (game.lastSkillAt == null || game.ticks - game.lastSkillAt > 1) return;
  const fav = favoriteSkill(game), p = game.player;
  if (!fav || game.lastSkill !== fav || (game.skillUse[fav] ?? 0) < A.minUses || Math.abs(p.x - b.x) > A.range) return;
  b.counterCd = A.cd;
  b.startAct('teleport');
  game.fx.label(b.x, b.y, b.h + 46, `看 穿 · ${SKILL_GLYPH[fav] ?? '?'}`, b.B.glow, 26);
  sfx('witch');
}
