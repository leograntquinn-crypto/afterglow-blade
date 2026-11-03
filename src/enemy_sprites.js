// 敌人的逐帧精灵：状态 → 动画帧
//
// 敌人出招分两段：windup（预警，停在「一眼看得出要出什么招」的姿势上，引擎同时画红光和感叹号）→ attack（出招）。
// 素材里每个攻击动画标了预警帧（windup）和接触帧（contact），这里把它们对到游戏的预警时长和出伤帧上。
import { prepareBossFx } from './fx_art.js';
import { SpriteSheet } from './sprite.js';
import { tex, tinted } from './fx_tex.js';

const sheet = (name) => {
  const s = new SpriteSheet('assets/enemies/', name, { avatar: 'avatar' });
  s.load();
  return s;
};
// 按关卡载入的敌人（灰烛司祭、烬翼）：先不载入，进关卡时由 prepareEnemySprites 决定
const lazySheet = (name) => new SpriteSheet('assets/enemies/', name, { avatar: 'avatar' });

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
  // ART_V6。灰烛司祭：三种招式各用一组动画；读护咒时提灯亮起（after）
  priest: { sheet: lazySheet('ashpriest'), lazy: true, standH: 172, stride: 0.9, attack: (e) => PRIEST_ANIM[e.atk.kind] ?? 'shove', rim: '#d6ccec', rimAlpha: 0.32, lift: 0.26, after: priestGlow },
  // 烬翼：没有脚，锚点是身体最低点；整套状态映射自己写（frames），身上的余烬微光由引擎画（after）
  wing: { sheet: lazySheet('emberwing'), lazy: true, standH: 62, frames: wingFrame, rim: '#ffb48a', rimAlpha: 0.3, lift: 0.3, after: wingGlow },
};
const PRIEST_ANIM = { ward: 'cast_ward', trap: 'cast_trap', shove: 'shove' };

// 进入关卡 / 试炼层时调用：载入这一关会出现的「按关卡载入」的敌人，释放其他的（回营地时传空列表）
export function prepareEnemySprites(types) {
  const need = new Set(types);
  for (const [k, SP] of Object.entries(ENEMY_SPRITES)) {
    if (!SP.lazy) continue;
    if (need.has(k)) SP.sheet.load();
    else if (SP.sheet.ready || SP.sheet.loading) SP.sheet.release();
  }
}
// 关卡配置里出现过的敌人类型（普通波次 + 精英波次，去掉精英标记 *）
export const stageEnemyTypes = (st) => [...new Set([...(st.pool ?? []), ...(st.elite ?? [])].flat().map((n) => n.replace('*', '')))];

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
  const wf = meta.windup[meta.windup.length - 1] ?? 2, c0 = meta.contact[0] ?? 3, c1 = meta.contact[meta.contact.length - 1] ?? c0;
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
  if (SP.frames) return SP.frames(S, e, t);
  const c = common(S, e, t);
  if (c) return c;
  if (e.state === 'windup' || e.state === 'attack') {
    const anim = typeof SP.attack === 'function' ? SP.attack(e) : e.atk.speed && SP.lunge ? SP.lunge : SP.attack;
    // 护咒的读条很长：举灯（0–1）之后在高举的姿势里循环（2–5），被打断就停
    if (anim === 'cast_ward' && e.state === 'windup') return S.frame(anim, e.st < 5 ? 0 : e.st < 10 ? 1 : 2 + (Math.floor((e.st - 10) / 8) % 4));
    return attackFrame(S, anim, e, e.atk);
  }
  return S.frame('idle', 0);
}

// ---------- 烬翼 ----------
// 盘旋 = fly 循环；预警 = dive_windup 越来越紧绷；俯冲 = dive（接触帧 1 贯穿整段冲刺）；
// 被打下来 = fall 翻滚 → grounded 在地上挣扎 → takeoff 按离地高度重新飞起来
function wingFrame(S, e, t) {
  const F = (a, i) => S.frame(a, i);
  const fly = () => F('fly', loopAt(S, 'fly', t * 16.7 + e.id * 211));
  const lift = () => (e.z < 8 ? F('takeoff', 0) : e.z < 30 ? F('takeoff', 1) : e.z < 55 ? F('takeoff', 2) : e.z < 80 ? F('takeoff', 3) : fly());
  switch (e.state) {
    case 'spawn': return fly();
    case 'idle': return lift();
    case 'windup': return F('dive_windup', Math.min(3, Math.floor((e.st / Math.max(1, e.windup)) * 4)));
    case 'attack': {
      const D = e.atk.dur ?? 16;
      if (e.st < D) return F('dive', e.st < 3 ? 0 : e.st < D - 3 ? 1 : 2);
      if (e.st < D + 6) return F('dive', 3);
      return e.st < D + 16 ? F('takeoff', e.st < D + 11 ? 2 : 3) : lift();
    }
    case 'hurt': {
      const u = e.st / Math.max(1, e.hitstun);
      return F('hurt', e.st < 3 ? 0 : u < 0.5 ? 1 : u < 0.8 ? 2 : 3);
    }
    case 'air': return F('fall', Math.floor(e.st / 4) % 4);
    case 'down':
      if (e.st > 34) return F('takeoff', 0);
      return F('grounded', loopAt(S, 'grounded', e.st * 16.7));
    case 'dying': return e.z > 0 ? F('fall', Math.floor(e.st / 4) % 4) : F('grounded', 0);
  }
  return fly();
}

// 素材是干净帧，光由引擎画。坐标都是「相对锚点、256 格子」，乘上 scale 换成游戏像素
// 烬翼：龟裂里的余烬微光，跟着身体
function wingGlow(ctx, e, t, o) {
  if (!e.alive) return;
  const s = o.scale, y = e.state === 'down' || e.z <= 0 ? -10 * s : -22 * s;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = o.alpha * (e.state === 'windup' ? 0.75 : 0.38);
  ctx.drawImage(tinted(tex().glow, e.look.crack), -36 * s, y - 36 * s, 72 * s, 72 * s);
  ctx.restore();
}
// 灰烛司祭：读护咒时提灯亮起紫光（读条的提示）。提灯位置按帧标注（cast_ward 0–6）
const LANTERN = [[54, -162], [52, -186], [32, -200], [34, -201], [31, -200], [30, -200], [93, -168]];
function priestGlow(ctx, e, t, o) {
  if (!e.alive || e.atk?.kind !== 'ward' || (e.state !== 'windup' && !(e.state === 'attack' && e.st < 8))) return;
  const name = enemyFrame(e, t), i = +name.slice(-2), L = LANTERN[i];
  if (!name.startsWith('cast_ward') || !L) return;
  const s = o.scale, x = L[0] * s * e.facing, y = L[1] * s, r = (e.state === 'attack' ? 60 : 34 + 6 * Math.sin(t * 0.3)) * Math.max(0.6, s * 1.6);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = o.alpha * (e.state === 'attack' ? 0.9 : 0.6);
  ctx.drawImage(tinted(tex().glow, '#b48cff'), x - r, y - r, r * 2, r * 2);
  ctx.restore();
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

// ---------- 首领专属素材（ART_V4：骸骨统领、祭坛守护者；ART_V6：夜鸦、铁颚）----------
// 只在自己那一关载入、离开就释放（见 prepareBossSprites）。没有专属素材的首领继续借用杂兵素材
// standH：站立高度（256 格子，含举起的武器）
// 首领包里的道具图（夜鸦的羽刃、铁颚的钩子和链环）跟着图集一起载入、一起释放，画飞行道具时用（见 combat.js）
export const BOSS_SPRITES = {
  boneLord: { sheet: new SpriteSheet('assets/bosses/', 'bone_lord', { avatar: 'avatar' }), standH: 180, frames: boneLordFrame },
  warden: { sheet: new SpriteSheet('assets/bosses/', 'altar_warden', { avatar: 'avatar' }), standH: 198, frames: wardenFrame },
  nightRaven: { sheet: new SpriteSheet('assets/bosses/', 'night_raven', { avatar: 'avatar', feather: 'feather' }), standH: 180, frames: nightRavenFrame },
  // hand：甩出锁链钩时（chain_throw 4–7）锁链从画面里伸出去的位置（相对锚点、256 格子）
  ironJaw: { sheet: new SpriteSheet('assets/bosses/', 'iron_jaw', { avatar: 'avatar', hook: 'hook', link: 'link' }), standH: 180, frames: ironJawFrame, hand: [138, 126] },
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
    case 'rendChase': {
      // 裂地追斩：巨剑拖地蓄势，然后一路斩出去
      const D = Math.round(30 / b.spd);
      if (t < D) return seq(S, 'cleave', t < 8 ? 1 : 2);
      return seq(S, 'cleave', t < D + 10 ? 4 : t < D + 40 ? 5 : 6);
    }
    case 'slam': case 'shockwave': case 'boneCage': {
      // 跳劈 / 震地 / 骨牢：预警段蓄势（最后 8 帧腾空），出手瞬间砸地
      const D = Math.round((name === 'slam' ? 48 : name === 'boneCage' ? 44 : 34) / b.spd);
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
    case 'rain': case 'soulBraziers': return b.tele ? seq(S, 'invoke', t < 6 ? 0 : 1) : seq(S, 'invoke', t < 30 ? 2 : 3);
    case 'judgment': {
      // 审判长戟：举戟蓄势，两次横扫
      const D = Math.round(40 / b.spd);
      if (t < D) return seq(S, 'slam', t < 6 ? 1 : t < 12 ? 2 : 3);
      const k = (t - D) % 18;
      return seq(S, 'slam', k < 5 ? 4 : k < 12 ? 5 : 6);
    }
    case 'charge':
      if (b.tele) return seq(S, 'charge', 0);
      if (Math.abs(b.vx) > 3) return seq(S, 'charge', Math.floor(t / 4) % 4);
      return b.act.d?.stunned ? seq(S, 'stunned', Math.floor(t / 8) % 4) : seq(S, 'idle', 0);
    case 'channel': return seq(S, 'channel', Math.floor(t / 8) % 4);
    case 'summon': case 'roar': return seq(S, 'roar', Math.min(3, Math.floor(t / 6)));
  }
  return b.tele ? seq(S, 'slam', 3) : seq(S, 'idle', 0);
}

// 夜鸦：齐射 / 鸦影分身拉弓放箭（shoot 的接触帧 3、7 对齐每一轮放箭），天降向上射（sky_shot 接触帧 2），
// 瞬移 = 化作黑羽消失（vanish）→ 浮现（appear）→ 挥臂斩，羽刃回旋（feather_throw 接触帧 4 = 出手的那一帧）
// bowShots：start 开始拉弓，rels 是每一轮放箭的时刻；单数轮用 0–3，双数轮用 4–7
function bowShots(S, t, start, rels) {
  for (let i = 0; i < rels.length; i++) {
    const r = rels[i], from = i ? rels[i - 1] + 5 : start, base = i % 2 ? 4 : 0;
    if (t < r) return seq(S, 'shoot', base + Math.min(2, Math.floor(((t - from) / Math.max(1, r - from)) * 3)));
    if (t < r + 5) return seq(S, 'shoot', base + 3);
  }
  const last = rels.length - 1;
  return t < rels[last] + 14 ? seq(S, 'shoot', last % 2 ? 7 : 3) : seq(S, 'idle', 0);
}

// 首领的 act.t 在每次 tick 之后才 +1，所以画面上「刚执行完的那一帧」是 act.t - 1。
// 用它来对接触帧：tick(t = D) 扔出羽刃之后的第一次绘制，正好画 feather_throw_04；之前那次绘制还是 03
function nightRavenFrame(S, b) {
  const { name } = b.act, t = b.act.t - 1;
  switch (name) {
    case 'volley': {
      const T0 = Math.round(38 / b.spd);
      return bowShots(S, t, 0, b.phase > 0 ? [T0, T0 * 2 + 10] : [T0]);
    }
    case 'ravenSplit': {
      const D = Math.round(44 / b.spd);
      if (t < 8) return seq(S, 'split', Math.floor(t / 2)); // 化作黑羽散开
      return bowShots(S, t, 8, [8 + D, 8 + D + 26]);
    }
    case 'rain':
      // 第 20 帧放出光球 = sky_shot 的接触帧 2
      return seq(S, 'sky_shot', t < 10 ? 0 : t < 20 ? 1 : t < 28 ? 2 : 3);
    case 'teleport':
      if (t < 22) return seq(S, 'vanish', Math.min(3, Math.floor((t / 22) * 4)));
      if (t < 36) return seq(S, 'appear', Math.min(3, Math.floor(((t - 22) / 14) * 4)));
      // 第 44 帧出斩 = 挥臂的接触帧
      return seq(S, 'feather_throw', t < 40 ? 2 : t < 44 ? 3 : t < 50 ? 4 : t < 58 ? 5 : t < 66 ? 6 : 7);
    case 'featherRang': {
      // 第 D 帧扔出羽刃。feather_throw 的接触帧是 0 起的第 4 帧（feather_throw_04）：
      // 预警段 0–3（展开斗篷、手里捏着羽刃），出手那一帧正好切到 04，不会提前一帧
      const D = Math.round(30 / b.spd);
      if (t < D) return seq(S, 'feather_throw', Math.min(3, Math.floor((t / D) * 4)));
      return seq(S, 'feather_throw', t < D + 6 ? 4 : t < D + 16 ? 5 : t < D + 30 ? 6 : 7);
    }
    case 'channel': return seq(S, 'channel', Math.floor(t / 9) % 4);
    case 'summon': case 'roar': return seq(S, 'roar', Math.min(3, Math.floor(t / 6)));
  }
  return b.tele ? seq(S, 'shoot', 2) : seq(S, 'idle', 0);
}

// 铁颚：重砸 / 震地（slam 接触帧 4）、三连斩（每一下都是 slam）、冲锋、撞墙晕眩，
// 锁链钩（chain_throw 接触帧 4 = 甩出；钩中后 chain_yank 拉回再接 slam 重锤），刑台三震（stomp_triple 接触帧 2、4、6）
function slamAt(S, t, D) {
  const lead = Math.min(18, D * 0.5);
  if (t < D) return seq(S, 'slam', t < lead ? Math.floor((t / lead) * 3) : 3);
  return seq(S, 'slam', t < D + 6 ? 4 : t < D + 14 ? 5 : t < D + 24 ? 6 : 7);
}

function ironJawFrame(S, b) {
  const { name, d } = b.act, t = b.act.t - 1; // 同夜鸦：对齐刚执行完的那一帧
  switch (name) {
    case 'slam': return slamAt(S, t, Math.round(48 / b.spd));
    case 'shockwave': return slamAt(S, t, Math.round(34 / b.spd));
    case 'combo': {
      const sw = [24, 46, 68].map((s) => Math.round(s / b.spd));
      for (const s of sw) {
        if (t < s) return seq(S, 'slam', t >= s - 8 ? 3 : 2);
        if (t < s + 6) return seq(S, 'slam', 4);
        if (t < s + 12) return seq(S, 'slam', 5);
      }
      return seq(S, 'slam', t < sw[2] + 22 ? 6 : 7);
    }
    case 'charge':
      if (b.tele) return seq(S, 'charge', 0);
      if (Math.abs(b.vx) > 3) return seq(S, 'charge', Math.floor(t / 4) % 4);
      return d?.stunned ? seq(S, 'stunned', Math.floor(t / 8) % 4) : seq(S, 'slam', 7);
    case 'chainHook': {
      const D = Math.round(36 / b.spd);
      if (d.pulledAt != null) {
        // 钩中：拉回（chain_yank 接触帧 1 = 你被拽到面前），举锤，第 24 帧砸下 = slam 接触帧 4
        const k = t - d.pulledAt;
        if (k < 24) return seq(S, 'chain_yank', k < 4 ? 0 : k < 12 ? 1 : k < 18 ? 2 : 3);
        return seq(S, 'slam', k < 30 ? 4 : k < 40 ? 5 : k < 50 ? 6 : 7);
      }
      // 头顶甩钩（1–3 循环转圈），第 D 帧甩出 = chain_throw 接触帧 4，之后拉直锁链；没钩中就收回来
      if (t < D) return seq(S, 'chain_throw', t < 6 ? 0 : 3 - (Math.floor((D - 1 - t) / 5) % 3)); // 倒着排相位：出手前一帧一定是 03
      if (t < D + 30) return seq(S, 'chain_throw', t < D + 6 ? 4 : t < D + 12 ? 5 : t < D + 20 ? 6 : 7);
      return seq(S, 'chain_yank', t < D + 40 ? 0 : 1);
    }
    case 'tripleStomp': {
      // 三下分别在 D、D+16、D+32 落地，对齐接触帧 2、4、6；两下之间是迈步举锤（3、5）
      const D = Math.round(40 / b.spd);
      if (t < D) return seq(S, 'stomp_triple', t < D * 0.45 ? 0 : 1);
      const k = t - D, i = Math.min(2, Math.floor(k / 16)), u = k - i * 16;
      if (i < 2) return seq(S, 'stomp_triple', u < 8 ? 2 + i * 2 : 3 + i * 2);
      return seq(S, 'stomp_triple', u < 10 ? 6 : 7);
    }
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
