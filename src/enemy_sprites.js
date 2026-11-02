// 敌人的逐帧精灵：状态 → 动画帧
//
// 敌人出招分两段：windup（预警，停在「一眼看得出要出什么招」的姿势上，引擎同时画红光和感叹号）→ attack（出招）。
// 素材里每个攻击动画标了预警帧（windup）和接触帧（contact），这里把它们对到游戏的预警时长和出伤帧上。
import { prepareBossFx } from './fx_art.js';
import { SpriteSheet } from './sprite.js';

const sheet = (name) => {
  const s = new SpriteSheet('assets/enemies/', name, { avatar: 'avatar' });
  s.load();
  return s;
};

// 有素材的敌人（按 look.rig 查）。
//   standH  素材里站立高度（256 格子），按敌人身高缩放
//   stride  走一个完整循环（8 帧、左右各一步）身体前进的距离，按身高的倍数算（精英、首领个子大，步子也大）。脚步和地面速度靠它对上
//   attack  普通攻击用哪组动画；lunge 突刺用哪组
//   rim/rimAlpha 轮廓光；lift 提亮（暗场景里看清）
//   pingpong 来回播放的循环动画：腐骨兵的待机一帧比一帧低，播完直接跳回第一帧会「一抽」，来回播就是连续的呼吸
export const ENEMY_SPRITES = {
  grunt: { sheet: sheet('grunt'), standH: 165, stride: 1.0, attack: 'slash', lunge: 'lunge', pingpong: ['idle'], rim: '#f0d6b0', rimAlpha: 0.34, lift: 0.3 },
  brute: { sheet: sheet('brute'), standH: 150, stride: 0.86, attack: 'slam', rim: '#ffd9a8', rimAlpha: 0.26, lift: 0.18 },
  archer: { sheet: sheet('archer'), standH: 165, stride: 1.0, attack: 'shoot', rim: '#cdb6ff', rimAlpha: 0.34, lift: 0.22 },
};

const loopAt = (S, anim, ms) => {
  const names = S.meta.anims[anim].frames;
  let t = ms % names.reduce((a, n) => a + S.meta.frames[n].ms, 0);
  for (let i = 0; i < names.length; i++) {
    t -= S.meta.frames[names[i]].ms;
    if (t < 0) return i;
  }
  return 0;
};

function idleIndex(S, e, t) {
  const ms = t * 16.7 + e.id * 137;
  if (!ENEMY_SPRITES[e.look.rig]?.pingpong?.includes('idle')) return loopAt(S, 'idle', ms);
  const n = S.meta.anims.idle.frames.length;
  const order = [...Array(n).keys(), ...Array.from({ length: n - 2 }, (_, k) => n - 2 - k)]; // 0 1 2 3 2 1
  const each = S.meta.frames[S.meta.anims.idle.frames[0]].ms;
  return order[Math.floor(ms / each) % order.length];
}

// 走路相位：每帧由 Enemy.update 调用。
//   按实际移动距离推进（走得慢脚就迈得慢，不会原地踏步）；
//   后退时（移动方向和朝向相反）倒着播，不会「太空步」；
//   速度用平滑值判断走 / 停，接近目标时速度忽大忽小也不会在待机和走路之间来回闪
export function stepWalk(e) {
  const SP = ENEMY_SPRITES[e.look?.rig];
  const sp = Math.hypot(e.vx, e.vy * 1.25);
  e.moveEma = (e.moveEma ?? 0) * 0.8 + sp * 0.2;
  if (!SP || e.state !== 'idle') return;
  const back = e.vx * e.facing < -0.1 && Math.abs(e.vx) >= Math.abs(e.vy) ? -1 : 1;
  e.walkPhase = (e.walkPhase ?? 0) + back * (sp / (SP.stride * e.look.h)) * 8;
}

const walking = (e) => (e.moveEma ?? 0) > 0.45;
const walkIndex = (e) => (((Math.floor(e.walkPhase ?? 0) % 8) + 8) % 8);

// 共用：移动、受击、浮空、倒地、起身、出场、死亡
function common(S, e, t) {
  const F = (a, i) => S.frame(a, i);
  switch (e.state) {
    case 'spawn': return F('getup', e.st < 12 ? 1 : e.st < 24 ? 2 : 3); // 从地上爬起来
    case 'idle':
      if (walking(e)) return F('walk', walkIndex(e));
      return F('idle', idleIndex(S, e, t));
    case 'hop':
      // 影弓手后跳：起跳下蹲 → 腾空 → 下落 → 落地蹲
      if (!S.meta.anims.hop) return F('walk', 2);
      return F('hop', e.st < 3 ? 0 : e.vz > 1.5 ? 1 : e.z > 6 ? 2 : 3);
    case 'hurt': {
      // 前两帧最有力度：被打的一瞬间往后一缩、后仰到底，剩下的硬直时间慢慢恢复
      const u = e.st / Math.max(1, e.hitstun);
      return F('hurt', e.st < 3 ? 0 : u < 0.55 ? 1 : u < 0.8 ? 2 : 3);
    }
    case 'air':
      if (e.st < 3) return F('air_hurt', 0);
      return F('air_hurt', e.vz > 3 ? 1 : e.vz > -3 ? 2 : 3);
    case 'down':
      if (e.st > 34) return F('getup', Math.min(3, Math.floor((e.st - 34) / 3))); // 倒地末帧 = 起身首帧，直接接上
      return F('down', e.st < 4 ? 0 : e.st < 9 ? 1 : 2);
    case 'dying':
      if (e.z > 0) return F('air_hurt', 3);
      return F('down', e.deadT < 4 ? 0 : e.deadT < 9 ? 1 : 2);
  }
  return null;
}

// 攻击动画：预警段 起手 → 预警帧（停住），出招段 接触帧对齐出伤帧，之后收招
function attackFrame(S, anim, e, A) {
  const meta = S.meta.anims[anim];
  const wf = meta.windup[0] ?? 2, c0 = meta.contact[0] ?? 3, c1 = meta.contact[meta.contact.length - 1] ?? c0;
  const n = meta.frames.length;
  if (e.state === 'windup') {
    const lead = Math.min(10, e.windup * 0.35); // 前 35%（最多 10 帧）起手，剩下的时间停在预警帧上
    return S.frame(anim, e.st >= lead ? wf : Math.floor((e.st / lead) * wf));
  }
  const hitAt = A.hitAt ?? 0, act = A.dur ?? 5;
  if (e.st < hitAt - 1) return S.frame(anim, wf);
  if (e.st < hitAt + act) return S.frame(anim, c0 + Math.min(c1 - c0, Math.floor(((e.st - hitAt + 1) / (act + 1)) * (c1 - c0 + 1))));
  const u = (e.st - hitAt - act) / Math.max(1, A.recover - hitAt - act);
  return S.frame(anim, Math.min(n - 1, c1 + 1 + Math.floor(u * (n - c1 - 1))));
}

export function enemyFrame(e, t) {
  const SP = ENEMY_SPRITES[e.look.rig], S = SP.sheet;
  const c = common(S, e, t);
  if (c) return c;
  if (e.state === 'windup' || e.state === 'attack') return attackFrame(S, e.atk.speed && SP.lunge ? SP.lunge : SP.attack, e, e.atk);
  return S.frame('idle', 0);
}

// ---------- 首领：同一套素材放大 + 染色，招式按状态和武器角度 pa 借用 P0 的帧 ----------
//   pa < -1：武器举过肩（预警、蓄势）；pa > 0.8：已经劈 / 砸下去；中间是挥动中
const BOSS_FRAMES = {
  grunt(S, b) {
    const { name, t } = b.act;
    if (name === 'charge') {
      if (b.tele) return S.frame('lunge', 2);
      if (Math.abs(b.vx) > 3) return S.frame('lunge', t % 6 < 3 ? 3 : 4);
      return b.act.d?.stunned ? S.frame('hurt', 1 + (Math.floor(t / 10) % 2)) : S.frame('lunge', 6);
    }
    if (b.tele) return S.frame('slash', t < 8 ? 1 : 2);
    const pa = b.pa ?? 0;
    return S.frame('slash', pa < -1 ? 2 : pa > 0.8 ? 4 : 3);
  },
  // 铁颚、祭坛守护者：没有冲锋的素材，冲锋时用走路帧快速循环（身体前倾的步伐）
  brute(S, b) {
    const { name, t } = b.act;
    if (name === 'charge') {
      if (b.tele) return S.frame('slam', 1);
      if (Math.abs(b.vx) > 3) return S.frame('walk', Math.floor(t / 2) % 8);
      return b.act.d?.stunned ? S.frame('hurt', 1 + (Math.floor(t / 10) % 2)) : S.frame('slam', 6);
    }
    if (b.tele) return S.frame('slam', t < 6 ? 1 : t < 12 ? 2 : 3);
    const pa = b.pa ?? 0;
    return S.frame('slam', pa < -1 ? 3 : pa > 0.8 ? 5 : 4);
  },
  // 夜鸦：齐射 / 箭雨拉满弓预警，放箭后收弓；瞬移消失时用后跳的腾空姿势
  archer(S, b) {
    const { name, t } = b.act;
    if (name === 'teleport') return b.fade < 0.9 || b.tele ? S.frame('hop', 1) : S.frame('shoot', 5);
    if (b.tele) {
      b.teleT = t;
      return S.frame('shoot', t < 6 ? 2 : t < 12 ? 3 : 4);
    }
    const since = t - (b.teleT ?? 0);
    return S.frame('shoot', since < 6 ? 5 : since < 14 ? 6 : 7);
  },
};

export function bossFrame(b, t) {
  const SP = ENEMY_SPRITES[b.B.base], S = SP.sheet;
  if (b.state !== 'attack' || !b.act) return common(S, b, t) || S.frame('idle', 0);
  return BOSS_FRAMES[b.B.base](S, b);
}

// ---------- 首领专属素材（ART_V4：骸骨统领、祭坛守护者）----------
// 只在自己那一关载入、离开就释放（见 prepareBossSprites）。没有专属素材的首领继续借用杂兵素材
// standH：站立高度（256 格子，含举起的武器）
export const BOSS_SPRITES = {
  boneLord: { sheet: new SpriteSheet('assets/bosses/', 'bone_lord', { avatar: 'avatar' }), standH: 180, frames: boneLordFrame },
  warden: { sheet: new SpriteSheet('assets/bosses/', 'altar_warden', { avatar: 'avatar' }), standH: 198, frames: wardenFrame },
};

// 进入关卡时调用：载入这一关首领的图集，释放别的首领
export function prepareBossSprites(key) {
  prepareBossFx(key); // 首领专属的手绘特效也只在这一关载入
  for (const [k, B] of Object.entries(BOSS_SPRITES)) {
    if (k === key) B.sheet.load();
    else if (B.sheet.ready || B.sheet.loading) B.sheet.release();
  }
}

// 攻击动画按时间推进：预警阶段停在预警帧（windup），出手后依次播接触帧和收招
const seq = (S, anim, idx) => S.frame(anim, idx);

// 骸骨统领：三连斩 = 劈（cleave）/ 反手上撩（backhand）/ 劈；跳劈、冲锋、震地、召唤、读条各有专属动作
function boneLordFrame(S, b) {
  const { name, t } = b.act;
  const pa = b.pa ?? 0;
  switch (name) {
    case 'combo':
      // 每一刀开始前 pa 被设成起手角度：-2.3 = 下劈，1.2 = 反手上撩
      if (pa === -2.3) b.swing = 'cleave';
      else if (pa === 1.2 && b.swing !== 'cleave-done') b.swing = 'backhand';
      if (b.tele) return seq(S, 'cleave', t < 8 ? 1 : 2);
      if (b.swing === 'backhand') {
        const u = (1.2 - pa) / 3; // 1.2 → -1.8
        return seq(S, 'backhand', u <= 0 ? 1 : u < 0.5 ? 3 : u < 1 ? 4 : 5);
      }
      { const u = (pa + 2.3) / 3.5; // -2.3 → 1.2
        if (u >= 1) b.swing = 'cleave-done';
        return seq(S, 'cleave', u <= 0 ? 2 : u < 0.4 ? 3 : u < 1 ? 4 : 5); }
    case 'slam': case 'shockwave': {
      // 跳劈 / 震地：预警段蓄势（最后 8 帧腾空），出手瞬间砸地
      const D = Math.round((name === 'slam' ? 48 : 34) / b.spd);
      if (t < D - 8) return seq(S, 'leap_slam', t < 6 ? 1 : 2);
      if (t < D) return seq(S, 'leap_slam', t < D - 4 ? 3 : 4);
      return seq(S, 'leap_slam', t < D + 6 ? 5 : t < D + 16 ? 6 : 7);
    }
    case 'charge':
      if (b.tele) return seq(S, 'charge', 0);
      if (Math.abs(b.vx) > 3) return seq(S, 'charge', Math.floor(t / 4) % 4);
      return b.act.d?.stunned ? seq(S, 'stunned', Math.floor(t / 8) % 4) : seq(S, 'idle', 0);
    case 'channel': return seq(S, 'channel', Math.floor(t / 8) % 4);
    case 'summon': case 'roar': return seq(S, 'roar', Math.min(3, Math.floor(t / 6)));
  }
  return b.tele ? seq(S, 'cleave', 2) : seq(S, 'idle', 0);
}

// 祭坛守护者：重砸、跺地（震地波）、召唤落石（天降）、冲锋、读条
function wardenFrame(S, b) {
  const { name, t } = b.act;
  switch (name) {
    case 'slam': {
      const D = Math.round(48 / b.spd);
      if (t < D) return seq(S, 'slam', t < 6 ? 1 : t < 12 ? 2 : 3);
      return seq(S, 'slam', t < D + 5 ? 4 : t < D + 14 ? 5 : t < D + 22 ? 6 : 7);
    }
    case 'shockwave': {
      const D = Math.round(34 / b.spd);
      if (t < D) return seq(S, 'stomp', t < 6 ? 0 : 1);
      return seq(S, 'stomp', t < D + 8 ? 2 : 3);
    }
    case 'rain': return b.tele ? seq(S, 'invoke', t < 6 ? 0 : 1) : seq(S, 'invoke', t < 30 ? 2 : 3);
    case 'charge':
      if (b.tele) return seq(S, 'charge', 0);
      if (Math.abs(b.vx) > 3) return seq(S, 'charge', Math.floor(t / 4) % 4);
      return b.act.d?.stunned ? seq(S, 'stunned', Math.floor(t / 8) % 4) : seq(S, 'idle', 0);
    case 'channel': return seq(S, 'channel', Math.floor(t / 8) % 4);
    case 'summon': case 'roar': return seq(S, 'roar', Math.min(3, Math.floor(t / 6)));
  }
  return b.tele ? seq(S, 'slam', 3) : seq(S, 'idle', 0);
}

// 有专属素材的首领：普通状态（走、受击、倒地……）共用 common()，招式用各自的映射
export function bossOwnFrame(b, t) {
  const B = BOSS_SPRITES[b.key];
  if (b.state !== 'attack' || !b.act) return common(B.sheet, b, t) || B.sheet.frame('idle', 0);
  return B.frames(B.sheet, b);
}
