// 精英词缀：让精英怪不只是「血厚」，而是每只都要换一种打法
//
//   坚盾  正面挡住普通攻击 → 绕到背后打、用重击 / 上挑 / 弹刀破盾
//   狂暴  血量低于一半后移动、出招都变快 → 留好爆发技能收尾
//   迅影  被连续打中会瞬移到你身后反击 → 连段别贪，看到紫光就闪避
//   爆裂  死后原地爆炸 → 离开红圈；把它打进敌群里，爆炸也会炸到别的敌人
import { rand, clamp, world, DEPTH, FONT_UI } from './config.js';
import { Hazard } from './combat.js';
import { sfx } from './audio.js';

export const AFFIXES = {
  shield: { name: '坚盾', color: '#8fc4ff', types: ['grunt'], tip: '正面挡住普通攻击。等它出招后的空隙、冲刺绕到背后，或用重击、上挑、弹刀破盾' },
  frenzy: { name: '狂暴', color: '#ff5a3c', types: ['grunt', 'archer', 'brute', 'priest', 'wing'], tip: '血量低于一半后变快' },
  blink: { name: '迅影', color: '#c48bff', types: ['grunt', 'archer'], tip: '被连续打中会瞬移到你身后反击' },
  volatile: { name: '爆裂', color: '#ffb347', types: ['grunt', 'archer', 'brute', 'priest'], tip: '死后爆炸；爆炸也会伤到其他敌人' },
};

// 按关卡抽词缀：精英第 1 关 1 条、第 3 关起 2 条；第 3 关起普通怪也有小概率带 1 条
// 高难度（D）：精英多带 D.affix 条，普通怪带词缀的概率提高到 D.normalAffix
export function rollAffixes(type, elite, stageIdx, D = null) {
  const normalChance = Math.max(stageIdx >= 2 ? 0.12 : 0, D?.normalAffix ?? 0);
  const n = elite ? (stageIdx >= 2 ? 2 : 1) + (D?.affix ?? 0) : Math.random() < normalChance ? 1 : 0;
  const pool = Object.keys(AFFIXES).filter((k) => AFFIXES[k].types.includes(type));
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
  return out;
}

export const GUARD_MAX = 4; // 坚盾能挡几下普通攻击
const BLINK_HITS = 7; // 迅影：连续挨几下后瞬移

// 打到坚盾上会不会被挡住。返回 true = 挡住了（不扣血），由 game 负责反馈
export function blocks(e, src, h) {
  if (!e.aff?.has('shield') || e.guardBrokenT > 0 || !e.alive) return false;
  if (!(e.state === 'idle' || e.state === 'windup' || e.state === 'hurt') || e.z > 0) return false;
  if (Math.sign(src.x - e.x) !== e.facing) return false; // 背后打不到盾
  if (h.heavy || (h.launch ?? 0) >= 8 || h.ult || h.wallBounce) {
    breakGuard(e);
    return false; // 破盾的这一下照常命中
  }
  e.guard--;
  if (e.guard <= 0) {
    breakGuard(e);
    return false;
  }
  return true;
}

export function breakGuard(e) {
  if (!e.aff?.has('shield') || e.guardBrokenT > 0) return;
  e.guardBrokenT = 420;
  e.guard = 0;
  const g = e.game;
  g.fx.label(e.x, e.y, e.z + e.h + 40, '破 盾 !', AFFIXES.shield.color, 30);
  g.fx.chips(e.x + e.facing * 20, e.y, e.z + e.h * 0.55, e.facing, 14, '#9fb4c8');
  g.fx.shake(6, 14);
  g.hitstop = Math.max(g.hitstop, 8);
  g.addStyle(80, 'guardBreak');
  sfx('break');
}

export function updateAffixes(e, game) {
  if (!e.aff) return;
  if (e.guardBrokenT > 0 && --e.guardBrokenT === 0) e.guard = GUARD_MAX;
  // 狂暴：血量过半时触发一次
  if (e.aff.has('frenzy') && !e.enraged && e.alive && e.hp < e.maxHp * 0.5) {
    e.enraged = true;
    game.fx.label(e.x, e.y, e.z + e.h + 40, '狂 暴', AFFIXES.frenzy.color, 28);
    game.fx.ring(e.x, e.y, e.h * 0.5, AFFIXES.frenzy.color, 12, 8, 20, 4);
    sfx('rank');
  }
  // 迅影：连续挨打计数，一段时间没被打就清零
  if (e.blinkCd > 0) e.blinkCd--;
  if (game.frame - (e.lastHitAt ?? -999) > 80) e.hitsTaken = 0;
  if (e.blinkPending && e.alive && game.hitstop <= 0) {
    e.blinkPending = false;
    blinkBehind(e, game);
  }
}

// 迅影：被打中时计数，攒够了就在顿帧结束后瞬移
export function onAffixHit(e, game) {
  if (!e.aff?.has('blink')) return;
  e.lastHitAt = game.frame;
  if (++e.hitsTaken >= BLINK_HITS && e.blinkCd <= 0 && e.hp > 0) {
    e.blinkPending = true;
    e.blinkCd = 360;
    e.hitsTaken = 0;
  }
}

function blinkBehind(e, game) {
  const p = game.player, c = AFFIXES.blink.color;
  game.fx.ring(e.x, e.y, e.z + e.h * 0.5, c, 10, 8, 18, 4);
  game.fx.converge(e.x, e.y, e.z + e.h * 0.5, 10, c);
  const side = -p.facing; // 落到玩家背后
  e.x = clamp(p.x + side * 110, 40, world.w - 40);
  e.y = clamp(p.y + rand(-10, 10), 0, DEPTH);
  e.z = 0;
  e.vx = e.vy = e.vz = 0;
  e.juggle = 0;
  e.invuln = 18;
  e.setState('idle');
  e.facing = Math.sign(p.x - e.x) || 1;
  e.attackCd = 14; // 落地马上出招：玩家看到紫光要立刻闪避
  e.blinkFlash = 30;
  game.fx.ring(e.x, e.y, e.h * 0.5, c, 6, 12, 22, 5);
  game.fx.label(e.x, e.y, e.h + 40, '迅 影', c, 26);
  sfx('dash');
}

// 爆裂：死后在原地留下一个延时爆炸，炸到玩家也炸到敌人
export function onAffixDeath(e, game) {
  if (!e.aff?.has('volatile')) return;
  game.fx.label(e.x, e.y, e.h + 40, '爆 裂', AFFIXES.volatile.color, 26);
  sfx('warn');
  game.hazards.push(new Hazard({
    x: e.x, y: e.y, rx: 120, ry: 46, delay: 54, color: AFFIXES.volatile.color, dmgMul: e.dmgMul, hitsEnemies: true,
    hit: { dmg: 16, kb: 9, launch: 9, stop: 8, shake: 10, heavy: true, styleTag: 'blast' },
  }));
}

// 头顶的词缀标签和坚盾的盾面
export function drawAffixes(ctx, e, sx, sy, top) {
  if (!e.aff || !e.alive) return;
  // 盾：面朝方向的一面半透明弧形
  if (e.aff.has('shield') && e.guardBrokenT <= 0 && e.state !== 'spawn') {
    const fx = sx + e.facing * (e.w * 0.55), fy = sy - e.h * 0.5;
    const a = 0.35 + 0.15 * (e.guard / GUARD_MAX);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(143,196,255,${a + 0.3})`;
    ctx.fillStyle = `rgba(143,196,255,${a * 0.35})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(fx, fy, 9, e.h * 0.42, 0, -Math.PI / 2, Math.PI / 2, e.facing < 0);
    ctx.fill();
    ctx.stroke();
    // 盾上的裂纹：每挡一下多一道
    ctx.lineWidth = 1.5;
    for (let i = 0; i < GUARD_MAX - e.guard; i++) {
      const yy = fy - e.h * 0.3 + i * e.h * 0.18;
      ctx.beginPath();
      ctx.moveTo(fx + e.facing * 2, yy);
      ctx.lineTo(fx + e.facing * 8, yy + 6);
      ctx.lineTo(fx + e.facing * 3, yy + 12);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.save();
  ctx.font = `600 12px ${FONT_UI}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const names = [...e.aff].map((k) => AFFIXES[k]);
  const w = 34;
  names.forEach((A, i) => {
    const x = sx + (i - (names.length - 1) / 2) * (w + 4), y = top - 50; // 留出预警感叹号的位置
    ctx.fillStyle = 'rgba(10,6,14,.72)';
    ctx.fillRect(x - w / 2, y - 8, w, 16);
    ctx.strokeStyle = A.color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - w / 2 + 0.5, y - 7.5, w - 1, 15);
    ctx.fillStyle = A.color;
    ctx.fillText(A.name, x, y + 1);
  });
  ctx.restore();
}
