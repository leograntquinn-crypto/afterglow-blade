// 敌人智能：感知层 + 意图打分 + 战场导演 + 调试可视化。设计见 docs/DESIGN_AI.md，性格数据见 ai_data.js
//
// 六条原则：
//   1. 不作弊：只看玩家屏幕上也看得到的东西（位置、朝向、正在出的招、收招、闪避、空中），不读按键缓冲
//   2. 有反应时间：每个敌人看到的是 N 帧以前的主角（Perception 存最近 32 帧）
//   3. 每个新行为都有可读的提示和解法（后撤步、「破绽」字样、背后来袭的方向提示；原有的红光预警不变）
//   4. 保留攻击令牌（game.attackers / maxAttackers）
//   5. 连段保护（导演）
//   6. 数据化（ai_data.js）
// 执行层（预警、出招、受击）还是 enemy.js 原来那一套，这里只决定「下一步做什么」。
import { STAMINA } from './stamina_data.js';
import { AI_PROFILES, DIRECTOR, FEINT, HABITS } from './ai_data.js';
import { VIEW_W, DEPTH, world, clamp, clampY, toScreen, FONT_UI } from './config.js';

const HIST = 32;

// AI 自己的随机数（可以设种子：测试里 window.__aiSeed）
function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class AI {
  constructor(game) {
    this.g = game;
    this.hist = new Array(HIST).fill(null);
    this.f = 0; // 这一场战斗经过的帧数（只在战斗世界前进时计数）
    this.roles = new Map(); // 敌人 → 'front' | 'flank' | 'ring'
    this.flankSide = 0;
    this.lastAttackF = 0; // 最近一次有敌人开始进攻
    this.lastHit = null; // 主角最近打中的 { e, f }
    this.guardFrom = null; // 连段保护从哪一帧开始
    const seed = typeof window !== 'undefined' && window.__aiSeed != null ? window.__aiSeed : (Math.random() * 1e9) | 0;
    this.rand = mulberry(seed);
    this.habits = new Habits(this); // 读习惯（玩家模型）
    this.lastFeintF = -9999; // 全场最近一次佯攻
    this.threatUntil = -1; // 到这一帧为止，主角身边有敌人在预警（判断「看到预警就闪 / 弹刀」）
    this.threat = null;
  }

  // 难度档：0 普通、1 噩梦、2 地狱（试炼：第 10 层起噩梦、第 20 层起地狱）
  level() {
    const g = this.g;
    if (g.trial) return g.trial.floor >= 20 ? 2 : g.trial.floor >= 10 ? 1 : 0;
    const k = g.D?.key;
    return k === 'hell' ? 2 : k === 'nm' ? 1 : 0;
  }

  // ---------- 感知层 ----------
  // 每帧（敌人更新之前）记下主角「看得见的样子」
  tick() {
    const g = this.g, p = g.player, m = p.move;
    let activeEnd = 0;
    if (m) for (const h of m.hits) activeEnd = Math.max(activeEnd, h.at + h.dur);
    const attacking = p.state === 'attack' && !!m;
    const prev = this.f > 0 ? this.hist[(this.f - 1) % HIST] : null;
    this.hist[this.f % HIST] = {
      f: this.f, x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, facing: p.facing, state: p.state,
      move: m?.id ?? null, mf: p.mf, moveStart: attacking ? this.f - p.mf : -1,
      attacking,
      recovering: attacking && p.mf >= activeEnd,
      // 挥空：地面普攻（不是技能、不是空中招）的有效帧已经过了，一个敌人都没打中
      whiff: attacking && !m.skill && !m.air && m.hits.length > 0 && p.mf >= activeEnd && !p.landed,
      // 重击 / 技能正在打过来（还没过有效帧）
      heavy: attacking && (m.heavy || m.skill) && p.mf < activeEnd,
      dodging: p.state === 'dash' || p.state === 'airdash',
      charging: p.state === 'charge',
      air: p.z > 0,
      parry: (p.parryT ?? 0) > 0,
      landing: !!prev?.air && p.z <= 0, // 这一帧刚落地
      winded: (p.sta ?? STAMINA.max) < STAMINA.dodge, // 耐力不够闪避了（耐力条在画面上看得到：闪红 / 偏黄）
    };
    this.habits.observe(this.hist[this.f % HIST], prev);
    this.f++;
    if (this.f % DIRECTOR.period === 0) this.assignRoles();
    this.updateGuard();
  }

  // 这个敌人「看到」的主角：reaction 帧以前的那一份
  see(e) {
    const P = AI_PROFILES[e.T.brain];
    const d = Math.min(HIST - 1, P ? P.reaction[this.level()] : 0);
    const k = Math.max(0, this.f - 1 - d);
    return this.hist[k % HIST] ?? this.hist[(this.f - 1 + HIST) % HIST];
  }

  // ---------- 战场导演 ----------
  brained() {
    // 只有参与分工的大脑（腐骨兵）：屠夫、弓手有自己的站位逻辑
    return this.g.enemies.filter((e) => e.alive && !e.dummy && !e.isBoss && e.T.brain && AI_PROFILES[e.T.brain]?.roles && e.state !== 'spawn');
  }

  // 前锋：离主角最近的；包抄：第二近的，去主角另一侧（另一侧太窄就不包抄）；其余外圈。
  // 角色有粘性：前锋只有在别人明显更近时才换，包抄的人只要还活着就一直包抄（不然绕到一半就和前锋互换，来回摇摆）
  assignRoles() {
    const p = this.g.player, list = this.brained();
    const dist = (e) => Math.abs(e.x - p.x) + Math.abs(e.y - p.y);
    this.roles.clear();
    if (!list.length) { this.front = this.flanker = null; return; }
    list.sort((a, b) => dist(a) - dist(b));
    let front = list.includes(this.front) && this.front !== this.flanker ? this.front : null;
    const closest = list.find((e) => e !== this.flanker) ?? list[0];
    if (!front || dist(closest) < dist(front) - 120) front = closest;
    this.front = front;
    this.roles.set(front, 'front');
    const side = -(Math.sign(front.x - p.x) || 1);
    const P = AI_PROFILES[front.T.brain];
    const room = side > 0 ? world.w - 40 - p.x : p.x - 40;
    const canFlank = room > (P.flank?.minRoom ?? 9999) + front.T.atk.range;
    if (!list.includes(this.flanker) || this.flanker === front) this.flanker = null;
    if (!this.flanker && canFlank) this.flanker = list.find((e) => e !== front) ?? null;
    if (this.flanker) { this.roles.set(this.flanker, 'flank'); this.flankSide = side; }
    for (const e of list) if (!this.roles.has(e)) this.roles.set(e, 'ring');
  }
  role(e) { return this.roles.get(e) ?? 'ring'; }

  // 太久没人进攻：前锋的「压上」分数加倍（总有人在压，不让大家都在踩线干等）
  pressBoost(e) { return this.role(e) === 'front' && this.f - this.lastAttackF > DIRECTOR.pressAfter[this.level()]; }

  onAttackStart(e) {
    this.lastAttackF = this.f;
    // 主角身边的预警：之后的这段时间里闪避 / 弹刀，算「看到预警就闪 / 弹」
    const p = this.g.player;
    if (e && Math.abs(e.x - p.x) < 260 && Math.abs(e.y - p.y) < 80) {
      this.threatUntil = Math.max(this.threatUntil, this.f + (e.windup ?? 30) + 6);
      this.threat = e;
      this.habits.exposure();
    }
  }

  // ---------- 佯攻 ----------
  // 这次出招要不要是佯攻：概率按难度（读到你爱闪避 / 弹刀时最多 ×1.3），同一个敌人、全场都有冷却（频率上限），连段保护期间不骗
  feintFor(e) {
    const lvl = this.level();
    // 第 1 关的教学：这间房里第一个出手的近战敌人必定佯攻（只一次，stage_rules.js 的 feintRoom）
    if (this.g.forceFeint > 0 && e.T?.brain === 'grunt') {
      this.g.forceFeint--;
      this.lastFeintF = this.f;
      e.feintCd = FEINT.cd;
      e.teachFeint = true;
      return true;
    }
    if ((e.feintCd ?? 0) > 0 || this.f - this.lastFeintF < FEINT.global[lvl] || this.guarding) return false;
    if (this.rand() >= FEINT.chance[lvl] * this.habits.mult('feint')) return false;
    this.lastFeintF = this.f;
    e.feintCd = FEINT.cd;
    return true;
  }
  onPlayerHit(target) {
    this.lastHit = { e: target, f: this.f };
    if (target.hitLog) { target.hitLog.push(this.f); if (target.hitLog.length > 12) target.hitLog.shift(); } // 屠夫判断「贪刀」
  }

  // ---------- 连段保护 ----------
  updateGuard() {
    const G = DIRECTOR.comboGuard, L = this.lastHit, g = this.g;
    const on = !!L && g.combo >= G.combo && this.f - L.f < G.recent;
    if (on && this.guardFrom == null) this.guardFrom = this.f;
    if (!on) this.guardFrom = null;
  }
  get guarding() { return this.guardFrom != null && this.f - this.guardFrom < DIRECTOR.comboGuard.max; }
  // 这个敌人现在能不能开始一次新的进攻（连段保护期间，除了正在挨打的那个，都先别插进来）
  mayAttack(e) { return !this.guarding || this.lastHit?.e === e; }

  // ---------- 调试可视化（F3 或地址加 ?ai=1）----------
  drawDebug(ctx, camX) {
    const g = this.g;
    ctx.save();
    ctx.font = `12px ${FONT_UI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const e of g.enemies) {
      if (!e.alive || e.team === 'prop') continue;
      const [x, y] = toScreen(e.x, e.y, e.z + e.h + 46, camX);
      const ai = e.ai, brain = e.T.brain && AI_PROFILES[e.T.brain] && !e.dummy && !e.isBoss;
      const roleTxt = AI_PROFILES[e.T.brain]?.roles ? `${{ front: '前锋', flank: '包抄', ring: '外圈' }[this.role(e)]} · ` : '';
      const txt = brain ? `${roleTxt}${INTENT_NAME[ai?.intent] ?? '—'}${e.punishCd > 0 ? ' · 惩罚冷却' : ''}${e.guardT > 0 ? ' · 格挡' : ''}` : '原有逻辑';
      const w = ctx.measureText(txt).width + 12;
      ctx.fillStyle = 'rgba(0,0,0,.65)';
      ctx.fillRect(x - w / 2, y - 9, w, 18);
      ctx.fillStyle = brain ? '#9fe8ff' : '#aaa';
      ctx.fillText(txt, x, y);
    }
    const s = this.hist[(this.f - 1 + HIST) % HIST];
    const lines = [
      `AI 难度档 ${this.level()} · 反应 ${AI_PROFILES.grunt.reaction[this.level()]} 帧 · 令牌 ${g.attackers.size}/${g.maxAttackers ?? 2}`,
      `连段保护 ${this.guarding ? '开' : '关'}（连段 ${g.combo}）· 距上次进攻 ${this.f - this.lastAttackF} 帧`,
      `主角：${s?.state ?? '-'} ${s?.move ?? ''}${s?.whiff ? ' 挥空' : s?.recovering ? ' 收招' : ''}`,
      `读习惯：闪避 ${this.habits.h('dodge').toFixed(2)} · 弹刀 ${this.habits.h('parry').toFixed(2)} · 贪刀 ${this.habits.h('greed').toFixed(2)} · 空挥 ${this.habits.h('whiff').toFixed(2)}`,
      `佯攻倍率 ×${this.habits.mult('feint').toFixed(2)} · 距上次佯攻 ${this.f - this.lastFeintF} 帧 · 落点 ${(() => { const L = this.habits.landing(); return L ? `${L.ax | 0},${L.dy | 0}` : '—'; })()}`,
    ];
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    ctx.fillRect(8, 150, 380, lines.length * 17 + 8);
    ctx.fillStyle = '#9fe8ff';
    lines.forEach((l, i) => ctx.fillText(l, 14, 162 + i * 17));
    ctx.restore();
  }

  // 背后来袭的方向提示：有敌人在主角背后开始预警 → 主角背后一个闪动的红色箭头（不只限新大脑，所有敌人都提示）
  drawCues(ctx, camX, t) {
    const g = this.g, p = g.player;
    if (p.state === 'dead') return null;
    // 弓手的瞄准线：预警时画出箭的真实路线（预判过的），看线躲
    for (const e of g.enemies) {
      if (!e.alive || e.state !== 'windup' || !e.aim) continue;
      const [x0, y0] = toScreen(e.x + e.facing * 30, e.y, 52, camX), [x1, y1] = toScreen(e.x + e.facing * (30 + e.aim.len), e.y + e.aim.vy * (e.aim.len / e.aim.vx), 52, camX);
      const u = Math.min(1, e.st / Math.max(1, e.windup));
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.45 * u;
      ctx.strokeStyle = '#ff4a3a';
      ctx.lineWidth = 1 + u * 1.5;
      ctx.setLineDash([10, 6]);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.restore();
    }
    let behind = null;
    for (const e of g.enemies) {
      if (!e.alive || e.isBoss || e.state !== 'windup' || Math.abs(e.x - p.x) > 320) continue;
      if (Math.sign(e.x - p.x) === -p.facing) { behind = e; break; }
    }
    if (!behind) return null;
    const dir = Math.sign(behind.x - p.x);
    const [x, y] = toScreen(p.x + dir * 40, p.y, p.z + 62, camX);
    ctx.save();
    ctx.globalAlpha = 0.65 + 0.35 * Math.sin(t * 0.5);
    ctx.fillStyle = '#ff3b3b';
    ctx.strokeStyle = '#1a0606';
    ctx.lineWidth = 2;
    for (const k of [0, 1]) {
      const ox = x + dir * k * 9;
      ctx.beginPath();
      ctx.moveTo(ox + dir * 9, y);
      ctx.lineTo(ox - dir * 3, y - 9);
      ctx.lineTo(ox - dir * 3, y + 9);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
    }
    ctx.restore();
    return behind;
  }
}

// 佯攻露出破绽了没有（Enemy.draw 用：「!」变成琥珀色的「?」、光变色、武器抖动）
export function feintRevealed(e) {
  if (!e.atk?.feint) return false;
  if (e.state === 'attack') return !!e.atk.fake; // 烬翼假冲：冲下去的那一段也是琥珀色
  if (e.state !== 'windup') return false;
  const end = e.atk.noCancel ? e.windup : Math.round(e.windup * FEINT.cancelAt);
  return e.st >= end - FEINT.reveal;
}

// ---------------- 读习惯（玩家模型）----------------
// 只看画面上看得到的东西：敌人预警时你闪不闪 / 弹不弹、连段打多长、普攻挥空多不多、闪避往哪落。
// 统计随时间打折（慢慢忘掉旧习惯）；h(k) 是 0～1 的「习惯程度」，mult(k) = 1 + 0.3 × h（影响上限 30%）
class Habits {
  constructor(ai) {
    this.ai = ai;
    this.c = { exposures: 0, dodges: 0, parries: 0, attacks: 0, whiffs: 0, combos: 0, greedy: 0 };
    this.land = []; // 最近几次闪避的落点（相对起点：ax 往远离威胁的方向，dy 纵深）
    this.dash = null;
    this.shown = new Set();
    this.lastMove = -1;
    this.lastWhiff = -1;
    this.maxCombo = 0;
  }
  exposure() { this.c.exposures++; }
  observe(s, prev) {
    const A = this.ai, g = A.g, c = this.c;
    if (A.f % HABITS.decayEvery === 0 && A.f) for (const k in c) c[k] *= HABITS.decay;
    const threat = A.f <= A.threatUntil;
    // 闪避：开始时记下有没有预警、从哪闪；结束时记下落点
    if (s.dodging && !prev?.dodging) {
      if (threat) c.dodges++;
      const t = A.threat, away = t ? Math.sign(s.x - t.x) || 1 : s.facing;
      this.dash = { x: s.x, y: s.y, away };
    }
    if (!s.dodging && prev?.dodging && this.dash) {
      this.land.push({ ax: (s.x - this.dash.x) * this.dash.away, dy: s.y - this.dash.y });
      if (this.land.length > 8) this.land.shift();
      this.dash = null;
    }
    if (s.parry && !prev?.parry && threat) c.parries++;
    // 普攻：出了几刀、挥空几刀
    if (s.attacking && s.moveStart !== this.lastMove) { this.lastMove = s.moveStart; c.attacks++; }
    if (s.whiff && s.moveStart !== this.lastWhiff) { this.lastWhiff = s.moveStart; c.whiffs++; }
    // 连段：一段连段结束时记下有多长（6 下以上算「贪」）
    if (g.combo > 0) this.maxCombo = Math.max(this.maxCombo, g.combo);
    else if (this.maxCombo > 0) { c.combos++; if (this.maxCombo >= 6) c.greedy++; this.maxCombo = 0; }
    for (const k of ['dodge', 'parry', 'greed', 'whiff']) if (!this.shown.has(k) && this.h(k) >= HABITS.show) this.notify(k);
  }
  // 习惯程度 0～1
  h(k) {
    const c = this.c, H = HABITS[k];
    const [n, d] = { dodge: [c.dodges, c.exposures], parry: [c.parries, c.exposures], greed: [c.greedy, c.combos], whiff: [c.whiffs, c.attacks] }[k];
    if (d < H.min) return 0;
    return clamp((n / d - H.base) / H.span, 0, 1);
  }
  // 参数倍率（影响上限 30%）。feint：你爱闪避或爱弹刀时佯攻更多
  mult(k) {
    const h = k === 'feint' ? Math.max(this.h('dodge'), this.h('parry')) : this.h(k);
    return 1 + HABITS.cap * h;
  }
  // 第一次读到某个习惯：提示（每场一次）
  notify(k) {
    this.shown.add(k);
    const g = this.ai.g;
    g.toast?.(HABITS[k].toast, '#ffb347');
    g.fx?.label(g.player.x, g.player.y, g.player.z + 120, '敌人在读你的打法', '#ffb347', 18);
  }
  // 你常闪去的落点（相对起点，按「远离威胁」的方向）；记录太少返回 null
  landing() {
    const P = AI_PROFILES.priest.trap;
    if (this.land.length < P.min) return null;
    const ax = this.land.reduce((a, l) => a + l.ax, 0) / this.land.length, dy = this.land.reduce((a, l) => a + l.dy, 0) / this.land.length;
    return { ax: clamp(ax, -P.maxX, P.maxX), dy: clamp(dy, -P.maxY, P.maxY) };
  }
}

export const INTENT_NAME = { press: '压上', space: '踩线', retreat: '后撤', strafe: '侧移', flank: '绕位', punish: '惩罚', corner: '逼墙角', shove: '甩开', kite: '拉开', cover: '掩体', lane: '找射线', kick: '侧闪踢', feint: '佯攻', fake: '假冲', real: '真冲', scatter: '散开', landdive: '落地俯冲', screen: '躲到同伴后', guard: '格挡', delay: '晚砸', protect: '护同伴', ward: '护咒', trap: '下陷阱', orbit: '盘旋', riposte: '格挡反击' };

const onScreen = (e, game, m) => e.x > game.camX + m && e.x < game.camX + VIEW_W - m;
// 走向目标点（纵深方向慢一点，和原来一样）
function steer(e, tx, ty, k = 1) {
  if (e.game?.terrain) tx = e.game.terrain.steerX(e, tx); // 关卡地形：不往裂口、正在烧的火墙那边走
  const mx = clamp(tx, 30, world.w - 30) - e.x, my = clampY(ty, 8) - e.y, spd = e.T.speed * e.spdMul * k;
  e.vx = Math.abs(mx) > 6 ? Math.sign(mx) * Math.min(spd, Math.abs(mx)) : 0;
  e.vy = Math.abs(my) > 4 ? Math.sign(my) * Math.min(spd * 0.7, Math.abs(my)) : 0;
  if (e.vx || e.vy) e.walk += 0.2 * spd;
}
// 意图打分：sc 里分数最高的（加一点随机），选中的至少坚持 commit 帧
function pick(e, A, P, sc) {
  const ai = e.ai;
  ai.t++;
  if (--ai.next > 0 || ai.t < P.commit) return ai.intent;
  ai.next = P.think;
  let best = ai.intent, bv = -1;
  for (const k in sc) { const v = sc[k] + A.rand() * P.noise; if (v > bv) { bv = v; best = k; } }
  if (best !== ai.intent) { ai.intent = best; ai.t = 0; }
  return best;
}

// ---------------- 大脑：腐骨兵 ----------------
// 返回 true 表示已经处理（开始出招）；移动速度写在 e.vx / e.vy
export const BRAINS = {
  grunt: {
    think(e, game) {
      const A = game.ai, P = AI_PROFILES.grunt, T = e.T, atk = T.atk, lvl = A.level(), s = A.see(e);
      if (!s) return;
      const dx = s.x - e.x, adx = Math.abs(dx), dy = s.y - e.y;
      const side = Math.sign(e.x - s.x) || -e.facing; // 我在主角的哪一边
      const role = A.role(e);
      const cap = game.maxAttackers ?? 2;
      const token = game.attackers.size < cap, may = A.mayAttack(e);
      const ai = (e.ai ??= { intent: 'space', t: 0, next: 0 });

      // 1. 惩罚打空：看到（反应时间以前的）主角挥空了 → 头上冒「破绽」、短预警突刺。每次挥空只判断一次
      if (s.whiff && s.moveStart !== ai.seenWhiff && T.lunge) {
        ai.seenWhiff = s.moveStart;
        const onScreen = e.x > game.camX + P.flank.onScreen && e.x < game.camX + VIEW_W - P.flank.onScreen;
        if (e.punishCd <= 0 && adx < P.punish.range && Math.abs(dy) < 40 && token && may && onScreen && A.rand() < Math.min(1, P.punish.chance[lvl] * A.habits.mult('whiff'))) {
          e.punishCd = P.punish.cd[lvl];
          ai.intent = 'punish';
          e.startWindup(game, { ...T.lunge, windup: P.punish.windup, minRange: 0, punish: true });
          game.fx.label(e.x, e.y, e.h + 30, '破绽', '#ffb347', 20);
          return true;
        }
      }

      // 2. 重新打分（每 think 帧；选中的意图至少坚持 commit 帧）
      ai.t++;
      if (--ai.next <= 0 && ai.t >= P.commit) {
        ai.next = P.think;
        const W = P.weights, canPress = e.attackCd <= 0 && token && may;
        const facingMe = Math.sign(dx) === -s.facing;
        const closing = Math.sign(s.vx) === Math.sign(e.x - s.x) && Math.abs(s.vx) > 0.5;
        const threat = facingMe && adx < P.backoff && (closing || s.attacking);
        const onFlankSide = side === A.flankSide;
        const sc = {
          press: W.press * (canPress ? 1 : 0.15) * (A.pressBoost(e) ? 2 : 1) * (role === 'ring' ? 0.35 : 1) * (s.winded ? 1.4 : 1), // 你喘息时更敢压上
          space: W.space * (canPress ? 0.45 : 1) + (threat ? 0.4 : 0),
          retreat: W.retreat * (threat && e.hp < e.maxHp * 0.35 ? 1.4 : 0.05),
          strafe: W.strafe * (s.charging && facingMe && Math.abs(dy) < 30 ? 1.6 : 0.02),
          flank: role === 'flank' && !onFlankSide ? W.flank * 1.6 : 0,
        };
        let best = 'space', bv = -1;
        for (const k in sc) { const v = sc[k] + A.rand() * P.noise; if (v > bv) { bv = v; best = k; } }
        if (best !== ai.intent) { ai.intent = best; ai.t = 0; }
      }

      // 3. 按意图走位（目标点按「看到的」主角算）
      let tx = e.x, ty = clampY(s.y + (role === 'ring' ? e.yOff : 0), 8), spdK = 1;
      const intent = ai.intent;
      if (intent === 'press') tx = s.x + side * atk.range * 0.7;
      else if (intent === 'retreat') tx = s.x + side * (atk.range + 170);
      else if (intent === 'strafe') { tx = s.x + side * (atk.range + 40); ty = clampY(s.y + (e.y >= s.y ? 1 : -1) * 58, 8); }
      else if (intent === 'flank' && side !== A.flankSide) {
        // 绕到另一侧：先往纵深让开（不从主角身上穿过去），再横着绕过去
        const detour = clampY(s.y + (e.y >= s.y ? 1 : -1) * P.flank.depth, 8);
        ty = detour;
        tx = Math.abs(e.y - detour) > 12 && adx < 150 ? e.x : s.x + A.flankSide * (atk.range + 40);
        spdK = 1.15;
      } else {
        // 踩线：在攻击距离外进进退退；主角逼近就后撤一步（倒着走，看得出来是在退）
        const B = P.space, ph = ((A.f + e.id * 37) % B.period) / B.period;
        let dist = role === 'ring' ? atk.range + B.ring + e.slot * 30 : atk.range + (ph < 0.5 ? B.band[1] : B.band[0]);
        const facingMe = Math.sign(dx) === -s.facing;
        if (facingMe && adx < P.backoff && (s.attacking || Math.abs(s.vx) > 0.5)) dist = Math.max(dist, atk.range + B.band[1] + 30);
        tx = s.x + side * dist;
      }
      tx = clamp(tx, 30, world.w - 30);
      const mx = tx - e.x, my = ty - e.y, spd = T.speed * e.spdMul * spdK;
      e.vx = Math.abs(mx) > 6 ? Math.sign(mx) * Math.min(spd, Math.abs(mx)) : 0;
      e.vy = Math.abs(my) > 4 ? Math.sign(my) * Math.min(spd * 0.7, Math.abs(my)) : 0;
      if (e.vx || e.vy) e.walk += 0.2 * spd;

      // 4. 出招：冷却到了、有令牌、没被连段保护挡住、同一纵深、在距离内（踩线时你走进它的距离也会出手）
      //    只在画面内出手（不从画面外打你；包抄绕到身后时尤其要紧）。出手判断用真实位置（和原来一样），预警时长不变
      const p = game.player, rdx = Math.abs(p.x - e.x), rdy = Math.abs(p.y - e.y);
      const onScreen = e.x > game.camX + P.flank.onScreen && e.x < game.camX + VIEW_W - P.flank.onScreen;
      if (e.attackCd <= 0 && token && may && rdy < 18 && onScreen) {
        const L = T.lunge;
        if (L && intent === 'press' && rdx > L.minRange && rdx < L.range && A.rand() < 0.03) { e.startWindup(game, L); return true; }
        if (rdx <= atk.range + 8) {
          // 佯攻：频率有上限，普通难度少用；读到你爱闪避 / 弹刀时稍多
          if (A.feintFor(e)) { e.startWindup(game, { ...atk, feint: true }); ai.intent = 'feint'; } else e.startWindup(game);
          return true;
        }
      }
      return true;
    },
  },

  // ---------------- 铁甲屠夫 ----------------
  brute: {
    think(e, game) {
      const A = game.ai, P = AI_PROFILES.brute, T = e.T, atk = T.atk, lvl = A.level(), s = A.see(e);
      if (!s) return;
      const ai = (e.ai ??= { intent: 'corner', t: 0, next: 0 });
      const dx = s.x - e.x, adx = Math.abs(dx), dy = s.y - e.y, side = Math.sign(e.x - s.x) || -e.facing;
      const token = game.attackers.size < (game.maxAttackers ?? 2), may = A.mayAttack(e), vis = onScreen(e, game, P.onScreen);
      const facingMe = Math.sign(dx) === -s.facing;
      // 1. 正面格挡：看到你面向它蓄力、或者重击 / 技能正朝它打过来
      if (e.guardT <= 0 && e.guardCd <= 0 && facingMe && adx < P.guard.range && Math.abs(dy) < 40 && (s.charging || s.heavy)) {
        e.guardT = P.guard.time;
        e.guardCd = P.guard.cd[lvl];
        game.fx.label(e.x, e.y, e.h + 30, '举斧格挡', '#9fd0ff', 18);
      }
      if (e.guardT > 0) { e.vx *= 0.6; e.vy *= 0.6; ai.intent = 'guard'; return true; } // 格挡时站稳不动
      // 2. 甩开贪刀：最近被你连打了好几下、你还贴着它
      const hits = (e.hitLog ?? []).filter((f) => A.f - f < P.shove.window).length;
      const need = Math.max(3, Math.round(P.shove.hits[lvl] / A.habits.mult('greed'))); // 读到你爱贪刀：最多早 30% 甩开
      if (hits >= need && adx < P.shove.near && e.shoveCd <= 0 && token && may && vis) {
        e.shoveCd = P.shove.cd[lvl];
        e.hitLog = [];
        ai.intent = 'shove';
        e.startWindup(game, { slam: true, slamX: 0, slamR: P.shove.r, windup: P.shove.windup, recover: P.shove.recover, cd: [60, 90], hit: P.shove.hit, shove: true });
        game.fx.label(e.x, e.y, e.h + 30, '甩开', '#ff7a4a', 22);
        return true;
      }
      // 3. 逼墙角：你离墙近 → 从开阔的那一侧逼过去（你后面就是墙）
      const wall = s.x < world.w / 2 ? -1 : 1, wallDist = wall < 0 ? s.x : world.w - s.x;
      let want = side;
      if (wallDist < P.corner.wallDist) want = -wall;
      ai.intent = want !== side ? 'corner' : 'press';
      let tx = s.x + want * atk.range * 0.8, ty = s.y;
      if (want !== side) {
        // 绕边：先往纵深让开（不穿过你），让开了再横着绕过去
        const detour = clampY(s.y + (e.y >= s.y ? 1 : -1) * P.corner.depth, 8);
        ty = detour;
        if (Math.abs(e.y - detour) > 12 && adx < 160) tx = e.x;
      }
      steer(e, tx, ty);
      // 4. 重砸：和原来一样（冷却、令牌、同一纵深、在距离内），只在画面内出手
      const p = game.player;
      if (e.attackCd <= 0 && token && may && vis && Math.abs(p.y - e.y) < 18 && Math.abs(p.x - e.x) <= atk.range + 8) {
        if (A.feintFor(e)) { e.startWindup(game, { ...atk, feint: true }); ai.intent = 'feint'; } else e.startWindup(game);
        return true;
      }
      return true;
    },
    // 预警期间：重砸预警过半时看到你在闪避 → 斧头多举一会儿再砸（红圈位置不变，只是晚一点炸）
    windup(e, game) {
      const A = game.ai, P = AI_PROFILES.brute, lvl = A.level();
      if (e.atk !== e.T.atk || e.holdT || e.st < e.windup * 0.4) return;
      const s = A.see(e);
      if (!s?.dodging) return;
      if (A.rand() >= Math.min(1, P.delay.chance[lvl] * A.habits.mult('dodge'))) { e.holdT = -1; return; } // 这一次不骗（每次预警只判断一次）；读到你爱闪避时更常骗
      e.holdT = P.delay.extra[lvl];
      for (const h of game.hazards) if (h.owner === e && h.t < h.delay) h.delay += e.holdT;
      e.ai && (e.ai.intent = 'delay');
    },
  },

  // ---------------- 影弓手 ----------------
  archer: {
    think(e, game) {
      const A = game.ai, P = AI_PROFILES.archer, T = e.T, lvl = A.level(), s = A.see(e);
      if (!s) return;
      const ai = (e.ai ??= { intent: 'kite', t: 0, next: 0 });
      const dx = s.x - e.x, adx = Math.abs(dx), side = Math.sign(e.x - s.x) || -e.facing;
      const token = game.attackers.size < (game.maxAttackers ?? 2), may = A.mayAttack(e), vis = onScreen(e, game, P.onScreen);
      const p = game.player, rdx = Math.abs(p.x - e.x);
      // 1. 被逼到墙边：后面就是墙、你贴上来 → 先侧闪（往纵深跳开），再接一记飞踢
      const backX = e.x + side * P.corner.wall, cornered = backX < 40 || backX > world.w - 40;
      if (cornered && rdx < P.corner.near) {
        if (e.evadeCd <= 0) {
          e.setState('hop');
          e.vz = 5; e.z = 0.01; e.vx = 0;
          e.vy = (e.y > (world.band ? (world.band.y0 + world.band.y1) / 2 : DEPTH / 2) ? -1 : 1) * P.corner.side; // 往开阔的纵深闪
          e.evadeCd = 170;
          ai.kick = true;
          ai.intent = 'kick';
          return true;
        }
        const K = P.corner.kick;
        if (ai.kick && rdx < K.range + 20 && Math.abs(p.y - e.y) < 26 && e.attackCd <= 0 && token && may && vis) {
          ai.kick = false;
          e.startWindup(game, { ...K, cd: [K.cd[lvl], K.cd[lvl] + 30] });
          return true;
        }
      } else if (rdx < 130 && e.evadeCd <= 0) {
        // 平时被贴身：和原来一样后跳拉开
        e.setState('hop'); e.vz = 7; e.z = 0.01; e.vx = -e.facing * 6; e.evadeCd = 200;
        return true;
      }
      // 2. 意图：拉开距离 / 躲到屠夫身后 / 找干净的射线
      let brute = null, bd = P.cover.search;
      for (const o of game.enemies) {
        if (o === e || !o.alive || o.T.brain !== 'brute') continue;
        const d = Math.abs(o.x - e.x) + Math.abs(o.y - e.y);
        if (d < bd) { bd = d; brute = o; }
      }
      const aimY = this.aimAt(e, s, lvl, P);
      const blocked = this.blocked(e, game, aimY);
      const W = P.weights, ready = e.attackCd <= 30;
      const intent = pick(e, A, P, {
        kite: W.kite,
        cover: brute && !ready ? W.cover : 0,
        lane: blocked && ready ? W.lane : 0,
      });
      let tx, ty = s.y;
      const band = P.kite, dist = band[0] + (band[1] - band[0]) * (0.5 + 0.5 * Math.sin((A.f + e.id * 50) * 0.02));
      if (intent === 'cover' && brute) {
        const cs = Math.sign(brute.x - s.x) || side; // 屠夫在你哪边，我就躲在它后面
        tx = brute.x + cs * P.cover.behind; ty = brute.y + (e.id % 2 ? 14 : -14);
      } else if (intent === 'lane') {
        tx = s.x + side * dist;
        const opts = [s.y + P.lane.step, s.y - P.lane.step, s.y + P.lane.step * 1.6, s.y - P.lane.step * 1.6].map((y) => clampY(y, 8));
        ty = opts.find((y) => !this.blocked({ ...e, y }, game, s.y)) ?? opts[0];
      } else tx = s.x + side * dist;
      steer(e, tx, ty);
      // 3. 射：冷却、令牌、在画面内、距离合适、纵深差不太大、射线没被同伴挡 → 预警时画出瞄准线（预判过的真实路线）
      const dyAim = Math.abs(aimY - e.y);
      if (e.attackCd <= 0 && token && may && vis && rdx > 120 && rdx < 520 && dyAim < P.lane.maxDy && !blocked) {
        const flight = rdx / 7.5;
        e.startWindup(game);
        e.aim = { vx: 7.5, vy: (aimY - e.y) / flight, len: rdx + 120 };
        return true;
      }
      return true;
    },
    // 预判：看到的你在纵深上怎么动 → 箭射向你（预警 + 飞行）之后会在的纵深
    aimAt(e, s, lvl, P) {
      const flight = Math.abs(s.x - e.x) / 7.5, t = e.T.atk.windup + flight;
      const lead = clamp((s.vy || 0) * t * P.lead.k[lvl], -P.lead.max, P.lead.max);
      return clampY(s.y + lead, 6);
    },
    // 射线上有没有同伴（箭会从同伴身边擦过去 —— 弓手不会隔着同伴放箭）
    blocked(e, game, aimY) {
      const P = AI_PROFILES.archer, px = game.player.x;
      if (game.terrain?.lineBlocked(e.x, e.y, px, aimY)) return true; // 立柱挡着射线（第 2 关）：换个纵深再射
      for (const o of game.enemies) {
        if (o === e || !o.alive || o.team === 'prop' || o.z > 30) continue;
        if ((o.x - e.x) * (px - e.x) <= 0 || Math.abs(o.x - e.x) >= Math.abs(px - e.x)) continue; // 不在我和你之间
        const u = (o.x - e.x) / (px - e.x), ly = e.y + (aimY - e.y) * u;
        if (Math.abs(o.y - ly) < P.lane.clear) return true;
      }
      return false;
    },
  },
};
