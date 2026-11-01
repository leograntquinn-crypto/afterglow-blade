// 敌人的逐帧精灵：状态 → 动画帧
//
// 敌人出招分两段：windup（预警，停在「一眼看得出要出什么招」的姿势上，引擎同时画红光和感叹号）→ attack（出刀）。
// 素材里每个攻击动画标了预警帧（windup）和接触帧（contact），这里把它们对到游戏的预警时长和出伤帧上。
import { SpriteSheet } from './sprite.js';

export const gruntSprite = new SpriteSheet('assets/enemies/', 'grunt', { avatar: 'avatar' });
gruntSprite.load();

// 有素材的敌人类型 → 精灵。站立高度：素材里约 165px（256 格子），按敌人的身高缩放
// rim/rimAlpha：轮廓光；lift：提亮（锈褐色的骨头在暗紫色地面上太暗，单靠轮廓光不够）
export const ENEMY_SPRITES = { grunt: { sheet: gruntSprite, standH: 165, rim: '#f0d6b0', rimAlpha: 0.34, lift: 0.3 } };

const loopAt = (S, anim, ms) => {
  const names = S.meta.anims[anim].frames;
  let t = ms % names.reduce((a, n) => a + S.meta.frames[n].ms, 0);
  for (let i = 0; i < names.length; i++) {
    t -= S.meta.frames[names[i]].ms;
    if (t < 0) return i;
  }
  return 0;
};

// 共用：移动、受击、浮空、倒地、起身、出场、死亡
function common(S, e, t) {
  const F = (a, i) => S.frame(a, i);
  switch (e.state) {
    case 'spawn': return F('getup', e.st < 12 ? 1 : e.st < 24 ? 2 : 3); // 从地上爬起来
    case 'idle':
      if (e.vx || e.vy) return F('walk', Math.floor(e.walk * 0.55) % 8); // 步频跟着实际移动速度走
      return F('idle', loopAt(S, 'idle', t * 16.7 + e.id * 137));
    case 'hop': return F('walk', 2);
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

// 攻击动画：预警段 0 → 预警帧（停住），出招段 接触帧对齐出伤帧，之后收招
function attackFrame(S, anim, e, A) {
  const meta = S.meta.anims[anim];
  const wf = meta.windup[0] ?? 2, c0 = meta.contact[0] ?? 3, c1 = meta.contact[meta.contact.length - 1] ?? c0;
  const n = meta.frames.length;
  if (e.state === 'windup') {
    const lead = Math.min(10, e.windup * 0.35); // 前 35%（最多 10 帧）举刀，剩下的时间停在预警帧上
    return S.frame(anim, e.st >= lead ? wf : Math.floor((e.st / lead) * wf));
  }
  const hitAt = A.hitAt ?? 0, act = A.dur ?? 5;
  if (e.st < hitAt - 1) return S.frame(anim, wf);
  if (e.st < hitAt + act) return S.frame(anim, c0 + Math.min(c1 - c0, Math.floor(((e.st - hitAt + 1) / (act + 1)) * (c1 - c0 + 1))));
  const u = (e.st - hitAt - act) / Math.max(1, A.recover - hitAt - act);
  return S.frame(anim, Math.min(n - 1, c1 + 1 + Math.floor(u * (n - c1 - 1))));
}

export function gruntFrame(e, t) {
  const S = gruntSprite;
  const c = common(S, e, t);
  if (c) return c;
  if (e.state === 'windup' || e.state === 'attack') return attackFrame(S, e.atk.speed ? 'lunge' : 'slash', e, e.atk);
  return S.frame('idle', 0);
}

// 骸骨统领（腐骨兵放大 + 染色）：首领的招式按武器角度 pa 选帧
//   pa < -1：刀举过肩（预警、蓄势）；pa > 0.8：刀已经劈下去；中间是挥砍中
export function boneLordFrame(b, t) {
  const S = gruntSprite;
  if (b.state !== 'attack' || !b.act) return common(S, b, t) || S.frame('idle', 0);
  const name = b.act.name;
  if (name === 'charge') {
    if (b.tele) return S.frame('lunge', 2);
    if (Math.abs(b.vx) > 3) return S.frame('lunge', b.act.t % 6 < 3 ? 3 : 4);
    return b.act.d?.stunned ? S.frame('hurt', 1 + (Math.floor(b.act.t / 10) % 2)) : S.frame('lunge', 6);
  }
  if (b.tele) return S.frame('slash', b.act.t < 8 ? 1 : 2);
  const pa = b.pa ?? 0;
  return S.frame('slash', pa < -1 ? 2 : pa > 0.8 ? 4 : 3);
}
