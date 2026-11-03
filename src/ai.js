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
import { AI_PROFILES, DIRECTOR } from './ai_data.js';
import { VIEW_W, DEPTH, world, clamp, toScreen, FONT_UI } from './config.js';

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
    this.hist[this.f % HIST] = {
      f: this.f, x: p.x, y: p.y, z: p.z, vx: p.vx, facing: p.facing, state: p.state,
      move: m?.id ?? null, mf: p.mf, moveStart: attacking ? this.f - p.mf : -1,
      attacking,
      recovering: attacking && p.mf >= activeEnd,
      // 挥空：地面普攻（不是技能、不是空中招）的有效帧已经过了，一个敌人都没打中
      whiff: attacking && !m.skill && !m.air && m.hits.length > 0 && p.mf >= activeEnd && !p.landed,
      dodging: p.state === 'dash' || p.state === 'airdash',
      charging: p.state === 'charge',
      air: p.z > 0,
    };
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
    return this.g.enemies.filter((e) => e.alive && !e.dummy && !e.isBoss && e.T.brain && AI_PROFILES[e.T.brain] && e.state !== 'spawn');
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

  onAttackStart() { this.lastAttackF = this.f; }
  onPlayerHit(target) { this.lastHit = { e: target, f: this.f }; }

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
      const txt = brain ? `${{ front: '前锋', flank: '包抄', ring: '外圈' }[this.role(e)]} · ${INTENT_NAME[ai?.intent] ?? '—'}${e.punishCd > 0 ? ' · 惩罚冷却' : ''}` : '原有逻辑';
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
    ];
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    ctx.fillRect(8, 150, 330, lines.length * 17 + 8);
    ctx.fillStyle = '#9fe8ff';
    lines.forEach((l, i) => ctx.fillText(l, 14, 162 + i * 17));
    ctx.restore();
  }

  // 背后来袭的方向提示：有敌人在主角背后开始预警 → 主角背后一个闪动的红色箭头（不只限新大脑，所有敌人都提示）
  drawCues(ctx, camX, t) {
    const g = this.g, p = g.player;
    if (p.state === 'dead') return null;
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

export const INTENT_NAME = { press: '压上', space: '踩线', retreat: '后撤', strafe: '侧移', flank: '绕位', punish: '惩罚' };

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
        if (e.punishCd <= 0 && adx < P.punish.range && Math.abs(dy) < 40 && token && may && onScreen && A.rand() < P.punish.chance[lvl]) {
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
          press: W.press * (canPress ? 1 : 0.15) * (A.pressBoost(e) ? 2 : 1) * (role === 'ring' ? 0.35 : 1),
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
      let tx = e.x, ty = clamp(s.y + (role === 'ring' ? e.yOff : 0), 8, DEPTH - 8), spdK = 1;
      const intent = ai.intent;
      if (intent === 'press') tx = s.x + side * atk.range * 0.7;
      else if (intent === 'retreat') tx = s.x + side * (atk.range + 170);
      else if (intent === 'strafe') { tx = s.x + side * (atk.range + 40); ty = clamp(s.y + (e.y >= s.y ? 1 : -1) * 58, 8, DEPTH - 8); }
      else if (intent === 'flank' && side !== A.flankSide) {
        // 绕到另一侧：先往纵深让开（不从主角身上穿过去），再横着绕过去
        const detour = clamp(s.y + (e.y >= s.y ? 1 : -1) * P.flank.depth, 8, DEPTH - 8);
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
        if (rdx <= atk.range + 8) { e.startWindup(game); return true; }
      }
      return true;
    },
  },
};
