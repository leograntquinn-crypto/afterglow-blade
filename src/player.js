// 主角：状态机 + 招式执行 + 取消系统
//
//   idle/run ──攻击──> attack ──取消──> attack(下一招 / 延迟连段) / 技能 / 闪避 / 跳跃(命中后)
//      │  ├──按住攻击──> charge ──松开──> 蓄力斩 Lv1 / Lv2
//      │  └──跳跃──> air ──攻击──> 空中三连 / ↓攻击：坠星斩
//      │              └──闪避──> airdash（每次跳跃一次）
//      └──闪避──> dash（前 10 帧内被打中 = 极限闪避）──攻击──> 冲刺攻击
//   被打 → hurt / knock(击飞，空中按跳跃 = 受身) → down(倒地，按任意键快速起身) → idle

import { GRAVITY, DEPTH, world, clamp, lerp, toScreen, yLimits } from './config.js';
import { MOVES, SKILLS, SKILL_KEYS } from './moves.js';
import { SKILL_TREE } from './progression.js';
import { hitBox, overlaps } from './combat.js';
import { drawFighter, drawAura } from './rig.js';
import { sfx } from './audio.js';
import { heroSprite, heroFrame, bladeOf, runStep } from './sprite.js';
import { SLASH_FX } from './fx_data.js';
import { STAMINA, MANA } from './stamina_data.js';
import { ribbonTex, drawRibbon, drawTip } from './ribbon.js';

const SPEED_X = 4.2, SPEED_Y = 2.7, JUMP_V = 12.5;
const CHARGE_LV1 = 24, CHARGE_LV2 = 66, CHARGE_HOLD = 14;
const easeOut = (u) => 1 - (1 - u) * (1 - u);

export class Player {
  constructor(x, y, stats, look) {
    Object.assign(this, { x, y, z: 0, vx: 0, vy: 0, vz: 0, facing: 1, w: 34, h: 86, team: 'player' });
    this.look = look;
    this.glow = look.weapon.glow; // 刀光颜色跟随武器品质
    this.applyStats(stats, true);
    this.state = 'idle';
    this.st = 0; // 当前状态已持续的帧数
    this.flash = 0;
    this.invuln = 0;
    this.move = null;
    this.mf = 0; // 当前招式的帧数
    this.hitSets = [];
    this.landed = false; // 当前招式是否已命中
    this.cd = { skill1: 0, skill2: 0, skill3: 0, skill4: 0 };
    this.cdMax = { ...this.cd };
    this.dashCd = 0;
    // 耐力（stamina_data.js）：sta 当前值；staDelay 还要等几帧才开始回复；staLock 侧步冷却；staFlash 不够时耐力条闪红
    this.sta = STAMINA.max; this.staDelay = 0; this.staLock = 0; this.staFlash = 0; this.staGain = 0;
    this.airHangs = 0;
    this.airDashes = 0;
    this.walk = 0;
    this.ghosts = []; // 残影
    this.dmgTaken = 0;
    this.chain = null; // 延迟连段的窗口
    this.chargeLv = 0;
    this.trail = [];   // 武器拖尾：最近几帧刀的姿态
  }

  applyStats(S, full) {
    this.S = S;
    this.maxHp = S.maxHp;
    this.maxMp = S.maxMp;
    if (full) {
      this.hp = this.hpTrail = S.maxHp;
      this.mp = S.maxMp;
    }
  }

  setState(s) {
    if (s !== 'dash') this.weakStep = false;
    this.state = s;
    this.st = 0;
    this.teched = false; // 受身翻滚（只在刚受身的那次 air 状态里播）
    this.touchdown = false; // 刚落地（idle 开头播落地缓冲帧）
  }

  // 极限闪避的判定窗口：闪避 / 空中冲刺刚开始的那几帧
  inPerfectWindow() {
    if (this.weakStep) return false; // 耐力不够时的侧步没有极限闪避
    return (this.state === 'dash' && this.st <= 11) || (this.state === 'airdash' && this.st <= 9);
  }

  // ---------- 耐力（stamina_data.js）----------
  // 回复：停止消耗 delay 帧以后开始；放技能的动作里不回复；跑动中回得慢一点
  updateStamina() {
    if (this.staLock > 0) this.staLock--;
    if (this.staFlash > 0) this.staFlash--;
    if (this.staGain > 0) this.staGain--;
    if (this.state === 'attack' && this.move?.skill) return;
    if (this.staDelay > 0) { this.staDelay--; return; }
    if (this.sta < STAMINA.max) this.sta = Math.min(STAMINA.max, this.sta + (this.state === 'run' ? STAMINA.regenRun : STAMINA.regen));
  }
  spendStamina(n) {
    this.sta = Math.max(0, this.sta - n);
    this.staDelay = STAMINA.delay;
  }
  // 极限闪避、弹刀返还：并且马上开始回复
  gainStamina(n) {
    this.sta = Math.min(STAMINA.max, this.sta + n);
    this.staDelay = 0;
    this.staGain = 24;
  }
  // 按闪避：耐力够 → 正常闪避；不够 → 侧步（没有无敌帧、距离一半），之后一段时间不能再侧步；都不行就不动（耐力条闪红）
  tryDash(game, air = false) {
    const cost = air ? STAMINA.airDodge : STAMINA.dodge;
    if (this.sta >= cost) {
      this.spendStamina(cost);
      if (air) this.startAirDash(game); else this.startDash(game);
      // 第 1 关教耐力（stage_rules.js 的 teach.stamina）：第一次闪避讲规则，第一次快用光时提醒
      if (game.rules?.teach?.stamina) {
        game.teachOnce?.('stamina1', '闪避要花耐力（血条下面那条细的）：满耐力能连闪 3 次，停一下就回满；极限闪避会返还耐力', '#b8e88a');
        if (this.sta < cost) game.teachOnce?.('stamina2', '耐力快空了 —— 再按闪避只是一个没有无敌的侧步。别把闪避一次花光，留一次给真正要躲的那一下', '#b8e88a');
      }
      return true;
    }
    this.staFlash = STAMINA.flash;
    const sv = game.save;
    if (sv && !sv.tips?.stamina) { // 第一次耐力不够：讲一句规则（每个存档一次）
      sv.tips = { ...sv.tips, stamina: true };
      game.toast?.('耐力不足：闪避要花耐力，停下来一会儿就会回满；极限闪避、弹刀会返还耐力', '#b8e88a');
    }
    if (air || this.staLock > 0) return false;
    this.staLock = STAMINA.step.lockout;
    this.staDelay = STAMINA.delay;
    this.startDash(game, false, true);
    return true;
  }

  update(game) {
    this.st++;
    if (this.invuln > 0) this.invuln--;
    if (this.flash > 0) this.flash--;
    if (this.dashCd > 0) this.dashCd--;
    this.updateStamina();
    if (this.mpPause > 0) this.mpPause--; // 放技能后自然回复暂停（stamina_data.js 的 MANA）
    else this.mp = Math.min(this.maxMp, this.mp + this.S.mpRegen);
    this.hpTrail = this.hpTrail > this.hp ? Math.max(this.hp, this.hpTrail - this.maxHp * 0.004) : this.hp;
    this.readyFlash ??= {};
    for (const k in this.cd) {
      if (this.cd[k] > 0 && --this.cd[k] === 0) this.readyFlash[k] = 20; // 冷却结束，技能栏闪一下
      if (this.readyFlash[k] > 0) this.readyFlash[k]--;
    }
    if (this.parryT > 0) this.parryT--; // 弹刀动作的剩余帧数
    for (const g of this.ghosts) g.life--;
    this.ghosts = this.ghosts.filter((g) => g.life > 0);
    if (this.chain && game.frame > this.chain.until) this.chain = null;

    switch (this.state) {
      case 'idle':
      case 'run': this.updateGround(game); break;
      case 'air': this.updateAir(game); break;
      case 'attack': this.updateMove(game); break;
      case 'dash': this.updateDash(game); break;
      case 'airdash': this.updateAirDash(game); break;
      case 'charge': this.updateCharge(game); break;
      case 'ult': this.vx = this.vy = 0; break; // 必杀演出由 game 控制
      case 'hurt':
        this.vx *= 0.8; this.vy = 0;
        if (this.st >= this.hurtT) this.setState('idle');
        break;
      case 'knock':
        this.vy = 0;
        // 受身：被打飞后在空中按跳跃，翻身落地
        if (this.st > 8 && this.z > 12 && game.input.buffered('jump')) {
          game.input.consume('jump');
          this.setState('air');
          this.teched = true;
          this.vz = 6;
          this.vx = -this.facing * 3;
          this.invuln = 24;
          this.airDashes = 1;
          game.fx.ring(this.x, this.y, this.z + 40, this.glow, 14, 6, 14, 4);
          game.fx.label(this.x, this.y, this.z + 110, '受身', this.glow, 22);
          game.addStyle(40, 'tech');
          sfx('dash');
        }
        break;
      case 'down':
        this.vx *= 0.8; this.vy = 0;
        // 快速起身：倒地后按任意动作键
        if (this.st > 10 && (game.input.buffered('jump') || game.input.buffered('dash') || game.input.buffered('attack'))) {
          for (const a of ['jump', 'dash', 'attack']) game.input.consume(a);
          this.invuln = 30;
          this.setState('idle');
          this.startDash(game, true);
          break;
        }
        if (this.st >= 40) { this.setState('idle'); this.invuln = 45; }
        break;
      case 'dead':
        this.vy = 0;
        if (this.z <= 0) this.vx *= 0.85;
        break;
    }
    this.physics(game);
    this.sampleTrail(game);
  }

  // ---------- 武器拖尾 ----------
  // 每帧记录一次「肩膀位置 + 刀的角度」，绘制时在相邻两帧之间插值出平滑的弧
  sampleTrail(game) {
    for (const s of this.trail) s.life--;
    this.trail = this.trail.filter((s) => s.life > 0);
    if (this.state === 'run' && this.st % 10 === 0) game.fx.dust(this.x - this.facing * 8, this.y, 1, 0.5);
    let on = false;
    const m = this.move;
    if (this.state === 'attack' && m) {
      const at = m.swingAt ?? m.hits[0]?.at ?? 6, dur = m.swingDur ?? m.hits[0]?.dur ?? 4;
      // 出刀的那一帧：在程序刀光带上叠一道手绘刀光（光带跟着刀走，手绘刀光给笔刷质感）
      const sf = SLASH_FX[m.id];
      if (sf && this.mf === at && game.ticks - (this.slashFxAt ?? -9) > 2) {
        this.slashFxAt = game.ticks;
        game.fx.flip(sf[0], this.x + this.facing * 8, this.y, this.z + 58, { facing: this.facing, flipY: sf[1], scale: sf[2], color: this.glow, alpha: 0.9 });
      }
      on = m.spin || m.flurry || m.id === 'rush' || m.plunge || (this.mf >= at - 1 && this.mf <= at + dur + 2);
    } else if (this.state === 'ult') on = true;
    if (!on) { if (this.trail.length) this.trail[this.trail.length - 1].end = true; return; }
    if (heroSprite.ready) {
      // 逐帧精灵：记录当前帧里刀柄和刀尖的位置（素材处理时检测出来的）
      const b = bladeOf(heroFrame(this, 0), this.facing);
      if (b) {
        // kind：用哪条刀光条带（fx_blade_v1）—— 技能 / 必杀用 skill，重击、坠星用 heavy，其余 light
        const m = this.move, kind = this.state === 'ult' || m?.skill ? 'skill' : m?.heavy || m?.plunge ? 'heavy' : 'light';
        this.trail.push({ x: this.x, y: this.y, z: this.z, f: this.facing, b, life: 10, kind });
        // 刀尖甩出的细碎光点（刀尖移动得快时才有）
        const pv = this.trail[this.trail.length - 2];
        if (pv?.b && Math.hypot(b[2] - pv.b[2], b[3] - pv.b[3]) > 14 && Math.random() < 0.6) {
          game.fx.emit('trailMote', this.x + b[2], this.y, this.z - b[3], { dir: this.facing, color: this.glow });
        }
      } else if (this.trail.length) this.trail[this.trail.length - 1].end = true;
      return;
    }
    const p = this.pose(0);
    this.trail.push({ x: this.x, y: this.y, z: this.z, f: this.facing, a: p.angle, lean: p.lean || 0, crouch: p.crouch || 0, life: 9 });
  }

  // 武器拖尾：只用刀光素材（fx_blade_v1）沿真实刀尖轨迹铺开；主角素材或刀光素材没载好时不画（不再用代码画的色带）
  drawTrail(ctx, camX, glowPass = false) {
    if (this.trail.length < 2 || !heroSprite.ready) return;
    this.drawSpriteTrail(ctx, camX, glowPass);
  }

  // 内沿从刀身 30% 处开始，外沿比刀尖再长 20%：判定框比画出来的刀略远，刀光把这段距离补上
  drawSpriteTrail(ctx, camX, glowPass = false) {
    const T = this.trail, P = [];
    for (let i = 1; i < T.length; i++) {
      const s0 = T[i - 1], s1 = T[i];
      if (s0.end || s0.f !== s1.f || Math.abs(s0.x - s1.x) > 60) { P.push(null); continue; }
      const [h0x, h0y, t0x, t0y] = s0.b, [h1x, h1y, t1x, t1y] = s1.b;
      const a0 = Math.atan2(t0y - h0y, t0x - h0x), l0 = Math.hypot(t0x - h0x, t0y - h0y);
      let da = Math.atan2(t1y - h1y, t1x - h1x) - a0;
      da -= Math.round(da / (2 * Math.PI)) * 2 * Math.PI; // 走短的那一边
      const l1 = Math.hypot(t1x - h1x, t1y - h1y);
      const moved = Math.abs(da) > 0.05 || Math.hypot(h1x - h0x, h1y - h0y) > 2 || Math.abs(s1.z - s0.z) > 2 || Math.abs(s1.x - s0.x) > 2;
      if (!moved) { P.push(null); continue; }
      const steps = Math.min(10, 2 + Math.ceil(Math.abs(da) / 0.18));
      for (let k = P.length && P[P.length - 1] ? 1 : 0; k <= steps; k++) {
        const u = k / steps;
        const [bx, by] = toScreen(s0.x + (s1.x - s0.x) * u, s0.y + (s1.y - s0.y) * u, s0.z + (s1.z - s0.z) * u, camX);
        const hx = bx + h0x + (h1x - h0x) * u, hy = by + h0y + (h1y - h0y) * u;
        const a = a0 + da * u, len = l0 + (l1 - l0) * u, c = Math.cos(a), si = Math.sin(a);
        P.push({ ix: hx + c * len * 0.3, iy: hy + si * len * 0.3, ox: hx + c * len * 1.2, oy: hy + si * len * 1.2, life: (s0.life + (s1.life - s0.life) * u) / 10 });
      }
    }
    // 断开的地方（换方向、瞬移）分成几段分别画
    const runs = [];
    let cur = [];
    for (const q of P) {
      if (q) cur.push(q);
      else if (cur.length) { if (cur.length > 1) runs.push(cur); cur = []; }
    }
    if (cur.length > 1) runs.push(cur);
    if (!runs.length) return;
    // 沿刀尖轨迹铺刀光条带：外沿 = 刀尖扫过的路线（最亮），内沿往刀柄方向渐暗（ribbon.js）
    const kind = T[T.length - 1].kind || 'light', img = ribbonTex(kind);
    if (!img) return;
    for (const run of runs) {
      const head = run[run.length - 1];
      const pts = run.map((q) => ({ ox: q.ox, oy: q.oy, ix: q.ix, iy: q.iy, u: Math.max(0, Math.min(1, q.life)) }));
      drawRibbon(ctx, img, pts, this.glow, Math.min(1, 0.35 + head.life) * (glowPass ? 0.6 : 1), glowPass ? 0 : 0.55);
      if (!glowPass && head.life > 0.75) drawTip(ctx, head.ox, head.oy, 26, this.glow, head.life);
    }
  }

  physics(game) {
    if (this.state === 'run') this.runDist = (this.runDist ?? 0) + runStep(this.vx, this.vy); // 跑步换帧按距离（sprite.js runFrame / runStep）
    this.x += this.vx;
    this.y += this.vy;
    if (this.state !== 'airdash' && this.state !== 'ult' && (this.z > 0 || this.vz > 0)) {
      this.vz -= GRAVITY;
      this.z += this.vz;
      if (this.z <= 0) {
        this.z = 0;
        this.vz = 0;
        this.onLand(game);
      }
    }
    this.x = clamp(this.x, 30, world.w - 30);
    { const [lo, hi] = yLimits(this.x); this.y = clamp(this.y, lo, hi); } // 窄墓道：纵深收窄（terrain.js）
  }

  onLand(game) {
    game.fx.dust(this.x, this.y, 5);
    this.airHangs = 0;
    this.airDashes = 0;
    if (this.state === 'knock') {
      this.setState('down');
      game.fx.shake(4, 8);
      sfx('land');
    } else if (this.state === 'attack' && this.move?.plunge) {
      game.plungeImpact(this);
      this.startMove(game, 'plungeLand');
    } else if (this.state === 'air' || (this.state === 'attack' && this.move?.air)) {
      this.move = null;
      this.vx = 0;
      this.setState('idle');
      this.touchdown = true;
      sfx('land');
    }
  }

  // ---------- 地面 ----------
  updateGround(game) {
    const inp = game.input;
    if (this.tryActions(game)) return;
    this.vx = inp.dx * SPEED_X;
    this.vy = inp.dy * SPEED_Y;
    if (inp.dx) this.facing = Math.sign(inp.dx);
    const moving = Math.abs(inp.dx) > 0.1 || Math.abs(inp.dy) > 0.1;
    if (moving) {
      this.walk += 0.32;
      if (this.state !== 'run') this.setState('run');
    } else if (this.state !== 'idle') this.setState('idle');
  }

  // 优先级：必杀 > 技能 > 闪避 > 跳跃 > 攻击
  tryActions(game) {
    const inp = game.input;
    if (this.tryUlt(game)) return true;
    if (this.trySkill(game)) return true;
    if (inp.buffered('dash') && this.dashCd <= 0) { inp.consume('dash'); if (this.tryDash(game)) return true; }
    if (inp.buffered('jump')) { inp.consume('jump'); this.jump(game); return true; }
    if (inp.buffered('attack')) {
      inp.consume('attack');
      if (inp.dy < -0.5) this.startMove(game, 'upper');
      else if (inp.dy > 0.5) this.startMove(game, 'sweep');
      else if (this.chain) { this.startMove(game, this.chain.move); this.chain = null; }
      else this.startMove(game, 'slash1');
      return true;
    }
    return false;
  }

  tryUlt(game) {
    const inp = game.input;
    if (!inp.buffered('ult')) return false;
    inp.consume('ult');
    if (this.z > 0) return false;
    if (game.ult < 100) {
      game.fx.label(this.x, this.y, this.z + 110, '残光未满', '#9fb3c8', 18);
      sfx('deny');
      return false;
    }
    game.startUltimate();
    return true;
  }

  jump(game) {
    this.move = null;
    this.vz = JUMP_V;
    this.z = 0.01;
    this.vx = game.input.dx * SPEED_X;
    this.airHangs = 0;
    this.setState('air');
    game.fx.dust(this.x, this.y, 4);
    sfx('jump');
  }

  updateAir(game) {
    const inp = game.input;
    this.vx += (inp.dx * SPEED_X - this.vx) * 0.12;
    this.vy = inp.dy * 1.6;
    if (inp.dx) this.facing = Math.sign(inp.dx);
    if (inp.buffered('dash') && this.airDashes < 1) { inp.consume('dash'); if (this.tryDash(game, true)) return; }
    if (inp.buffered('attack')) {
      inp.consume('attack');
      this.startMove(game, inp.dy > 0.5 && this.z > 30 ? 'plunge' : 'airSlash');
    }
  }

  // ---------- 闪避（带无敌帧；前几帧被打中 = 极限闪避）----------
  // weak：耐力不够时的侧步（没有无敌帧、距离一半）
  startDash(game, roll = false, weak = false) {
    const dx = game.input.dx;
    if (dx) this.facing = Math.sign(dx);
    this.move = null;
    this.setState('dash');
    this.dashDy = game.input.dy;
    this.weakStep = weak;
    this.invuln = weak ? 0 : roll ? 30 : 14;
    this.dashCd = roll ? 10 : 26;
    game.fx.dust(this.x, this.y, 6);
    sfx('dash');
  }

  updateDash(game) {
    const t = this.st, inp = game.input;
    const k = this.weakStep ? STAMINA.step.dist : 1;
    this.vx = this.facing * 11 * k * Math.max(0, 1 - t / 20);
    this.vy = (inp.dy || this.dashDy) * 2.6 * k * Math.max(0, 1 - t / 20);
    if (t % 2 === 0 && !this.weakStep) this.addGhost();
    if (t >= 4 && inp.buffered('attack')) { inp.consume('attack'); this.startMove(game, 'dashAtk'); return; }
    if (t >= 6 && this.trySkill(game)) return;
    if (t >= 8 && inp.buffered('jump')) { inp.consume('jump'); this.jump(game); return; }
    if (t >= 20) this.setState('idle');
  }

  startAirDash(game) {
    const dx = game.input.dx;
    if (dx) this.facing = Math.sign(dx);
    this.move = null;
    this.airDashes++;
    this.setState('airdash');
    this.invuln = 10;
    this.vz = 0;
    sfx('dash');
  }

  updateAirDash(game) {
    const inp = game.input;
    this.vx = this.facing * 12 * Math.max(0.2, 1 - this.st / 16);
    this.vy = inp.dy * 1.4;
    if (this.st % 2 === 0) this.addGhost();
    if (this.st >= 4 && inp.buffered('attack')) {
      inp.consume('attack');
      this.vz = 1;
      this.startMove(game, inp.dy > 0.5 ? 'plunge' : 'airSlash');
      return;
    }
    if (this.st >= 14) { this.vz = 1; this.setState('air'); }
  }

  // ---------- 蓄力 ----------
  startCharge(game) {
    this.move = null;
    this.setState('charge');
    this.chargeLv = 0;
    this.vx = this.vy = 0;
  }

  updateCharge(game) {
    const inp = game.input, t = this.st;
    this.vx *= 0.7;
    const lv = t >= CHARGE_LV2 ? 2 : t >= CHARGE_LV1 ? 1 : 0;
    if (lv > this.chargeLv) {
      this.chargeLv = lv;
      game.fx.ring(this.x, this.y, 50, lv === 2 ? '#ffffff' : this.glow, 20, 8, 16, lv === 2 ? 6 : 4);
      game.fx.flash(this.glow, lv === 2 ? 0.18 : 0.08);
      sfx(lv === 2 ? 'charge2' : 'charge1');
    }
    if (t % 4 === 0) game.fx.converge(this.x + this.facing * 10, this.y, 50, lv === 2 ? 6 : 3, lv === 2 ? '#ffffff' : this.glow);
    // 闪避 / 跳跃可以取消蓄力
    if (inp.buffered('dash') && this.dashCd <= 0) { inp.consume('dash'); if (this.tryDash(game)) return; }
    if (inp.buffered('jump')) { inp.consume('jump'); this.jump(game); return; }
    if (inp.dx) this.facing = Math.sign(inp.dx);
    if (!inp.isHeld('attack') || t > 180) {
      if (lv === 0) this.setState('idle');
      else {
        this.startMove(game, lv === 2 ? 'chargeSlash2' : 'chargeSlash1');
        game.fx.label(this.x, this.y, this.z + 118, lv === 2 ? '破军' : '蓄力斩', this.glow, lv === 2 ? 30 : 24);
      }
    }
  }

  // ---------- 招式 ----------
  startMove(game, name) {
    const m = MOVES[name], inp = game.input;
    if (inp.dx && !m.air) this.facing = Math.sign(inp.dx);
    this.move = m;
    this.mf = 0;
    if (m.skill) game.lastSkill = name; // 残影的「镜像」复制你最后用过的技能
    this.landed = false;
    this.hitSets = m.hits.map(() => new Set());
    const chained = this.state === 'attack';
    this.setState('attack');
    this.chained = chained; // 从上一招取消接过来的：精灵跳过起手的站姿帧，直接从拉刀开始
    if (!m.air) { this.vx = 0; this.vy = 0; }
    if (m.hang && this.airHangs < 3 && this.vz < m.hang) { this.vz = m.hang; this.airHangs++; }
    if (m.plunge) { this.vz = 3; this.vx = this.facing * 2; }
  }

  updateMove(game) {
    const m = this.move, f = this.mf, inp = game.input;

    // 位移
    if (m.plunge) { this.vz = f < 4 ? 2 : -15; this.vx *= 0.9; this.vy = 0; }
    else if (m.moveDuring) { this.vx = inp.dx * m.moveDuring; this.vy = inp.dy * m.moveDuring * 0.7; }
    else if (m.lunge && f >= m.lunge[0] && f < m.lunge[1]) this.vx = this.facing * m.lunge[2];
    else if (!m.air) { this.vx *= 0.7; this.vy = 0; }
    if ((m.thrust || m.skill || m.plunge || m.id === 'chargeSlash2') && f % 2 === 0 && f < (m.flurry ? 50 : m.plunge ? 80 : 16)) this.addGhost();
    if (m.invuln && f >= m.invuln[0] && f < m.invuln[1]) this.invuln = Math.max(this.invuln, 2);

    m.events?.[f]?.(this, game);

    // 刀光
    const swingAt = m.swingAt ?? m.hits[0]?.at;
    if (f === swingAt && !m.spin && m.hits.length) {
      if (!heroSprite.ready || m.skill || m.id === 'chargeSlash2') game.fx.arc(this.x + this.facing * 6, this.y, this.z + 56, this.facing, m.heavy ? 84 : 64, m.swing[0], m.swing[1], this.glow, m.heavy ? 20 : 13);
      sfx(m.heavy ? 'swingHeavy' : 'swing');
    }

    // 判定
    m.hits.forEach((h, i) => {
      if (f === h.at && m.spin) {
        game.fx.ring(this.x, this.y, this.z + 50, this.glow, 40, 7, 10, 5);
        sfx('swing');
      }
      if (f === h.at && (m.flurry || h.stab) && i < m.hits.length - 1) {
        // 乱舞 / 连刺：每一刀随机角度的刀光
        const a0 = h.stab ? -0.2 + (Math.random() - 0.5) * 0.4 : -2.4 + Math.random() * 1.2;
        const a1 = h.stab ? a0 + 0.12 : a0 + 2.6 + Math.random();
        game.fx.arc(this.x + this.facing * (h.stab ? 70 : 40), this.y, this.z + 52 + (Math.random() - 0.5) * 20, this.facing, h.stab ? 40 : 60 + Math.random() * 20, a0, a1, this.glow, h.stab ? 7 : 11, 7);
        sfx('swing');
      }
      if (f < h.at || f >= h.at + h.dur) return;
      const box = hitBox(this, h);
      for (const e of game.enemies) {
        if (this.hitSets[i].has(e) || !overlaps(box, e)) continue;
        const dir = h.radial ? Math.sign(e.x - this.x) || this.facing : this.facing;
        if (game.applyHit(this, e, h, dir)) {
          this.hitSets[i].add(e);
          this.landed = true;
        }
      }
    });

    this.mf++;

    // 取消：连招的灵魂。到了 cancel 帧之后，可以提前进入下一个动作
    // 太刀「疾斩」：有取消窗口的招式提前 3 帧可以取消
    const early = this.S.school === 'katana' && m.cancel != null && m.cancel < m.total && !m.plunge ? 3 : 0;
    const canCancel = f >= (m.cancel ?? m.total) - early;
    if (canCancel && !m.plunge) {
      if (m.next && inp.buffered('attack')) {
        inp.consume('attack');
        const next = m.air && inp.dy > 0.5 && this.z > 30 ? 'plunge' : m.next;
        this.startMove(game, next);
        return;
      }
      if (m.air && inp.buffered('attack') && inp.dy > 0.5 && this.z > 30) { inp.consume('attack'); this.startMove(game, 'plunge'); return; }
      if (m.jumpCancel && this.z <= 0 && inp.buffered('jump')) { inp.consume('jump'); this.jump(game); return; }
    }
    // 命中后可以用跳跃取消（地面普攻），把敌人留在空中追打
    if (m.jcOnHit && this.landed && this.z <= 0 && f >= (m.hits[0]?.at ?? 0) + 3 && inp.buffered('jump')) { inp.consume('jump'); this.jump(game); return; }
    // 空中招式命中后可以空中冲刺取消
    if (m.air && !m.plunge && this.landed && this.airDashes < 1 && inp.buffered('dash')) { inp.consume('dash'); if (this.tryDash(game, true)) return; }
    // 普攻命中后可以立刻用技能 / 必杀取消；技能之间要等到 cancel 帧
    const skillOk = m.skill ? canCancel : canCancel || this.landed;
    if (!m.air && skillOk && (this.tryUlt(game) || this.trySkill(game))) return;
    if (!m.air && canCancel && this.dashCd <= 0 && inp.buffered('dash')) { inp.consume('dash'); if (this.tryDash(game)) return; }

    if (this.mf >= m.total && !m.plunge) {
      this.move = null;
      if (this.z > 0) return this.setState('air');
      // 按住攻击键不放 → 进入蓄力
      if (!m.skill && !m.air && inp.heldFor('attack') >= CHARGE_HOLD) return this.startCharge(game);
      // 二段斩结束后停顿一下再按攻击 → 延迟连段
      if (m.id === 'slash2') this.chain = { move: 'rush', until: game.frame + 16 };
      this.setState('idle');
    }
  }

  trySkill(game) {
    if (this.z > 0) return false;
    const inp = game.input;
    for (const key of SKILL_KEYS) {
      if (!inp.buffered(key)) continue;
      inp.consume(key);
      const s = SKILLS[key];
      const say = (text, color) => { game.fx.label(this.x, this.y, this.z + 110, text, color, 18); sfx('deny'); };
      if (!game.save.skills[key]) { say(`Lv.${SKILL_TREE.find((n) => n.key === key).unlock} 习得`, '#9fb3c8'); continue; }
      if (this.cd[key] > 0) { say('冷却中', '#9fb3c8'); continue; }
      if (this.mp < s.mp) { say('魔力不足', '#4fa3ff'); continue; }
      this.mp -= s.mp;
      this.mpPause = MANA.pauseAfterSkill;
      this.spendStamina(STAMINA.skill); // 技能：扣一点耐力，动作里不回复（updateStamina）
      this.cd[key] = this.cdMax[key] = Math.round(s.cd * (1 - this.S.cdr));
      this.startMove(game, s.move);
      game.fx.label(this.x, this.y, this.z + 118, s.name, this.glow, 28);
      sfx('skill');
      return true;
    }
    return false;
  }

  // ---------- 受击（伤害已经在 game.applyHit 里算好）----------
  takeHit(h, dir, dmg) {
    if (this.invuln > 0 || this.state === 'dead' || this.state === 'down' || this.state === 'ult') return null;
    this.hp = Math.max(0, this.hp - dmg);
    this.dmgTaken += dmg;
    this.flash = 6;
    this.chain = null;
    if (this.hp <= 0) {
      this.move = null;
      this.setState('dead');
      this.vz = 8;
      this.z = Math.max(this.z, 0.01);
      this.vx = dir * 4;
      return {};
    }
    if (this.state === 'attack' && this.move?.armor) return {}; // 霸体：吃伤害但不中断
    this.move = null;
    if ((h.launch ?? 0) > 0 || this.z > 0) {
      this.setState('knock');
      this.vz = Math.max(h.launch ?? 0, 5);
      this.z = Math.max(this.z, 0.01);
      this.vx = dir * h.kb;
    } else {
      this.setState('hurt');
      this.hurtT = h.stun ?? 16;
      this.vx = dir * h.kb;
    }
    this.facing = -dir;
    this.invuln = 8;
    return {};
  }

  // ---------- 绘制 ----------
  pose(t) {
    const s = this.state;
    const p = { lean: 0, walk: this.walk, crouch: 0, angle: 0.7, lie: 0, lift: 0 };
    if (s === 'idle') { p.walk = 0; p.crouch = 0.08 + Math.sin(t * 0.08) * 0.06; p.angle = 0.75; }
    else if (s === 'run') { p.lean = 5; p.angle = 1.0; p.lift = 1; p.backAngle = 1.35 - Math.sin(this.walk) * 0.8; }
    else if (s === 'air') { p.walk = 1.2; p.angle = this.vz > 0 ? -0.5 : 0.4; p.crouch = 0.3; p.lift = 1; p.backAngle = 2.4; }
    else if (s === 'dash' || s === 'airdash') { p.lean = 12; p.angle = 2.5; p.crouch = 0.35; p.walk = 1.4; p.backAngle = 2.8; }
    else if (s === 'charge') { p.lean = -4; p.crouch = 0.5 + Math.sin(t * 0.5) * 0.02 * this.chargeLv; p.angle = 2.75; p.backAngle = 2.9; p.walk = 0.9; }
    else if (s === 'ult') { p.lean = 6; p.crouch = 0.3; p.angle = this.ultPose ?? 2.6; p.backAngle = 3; p.walk = 0.8; }
    else if (s === 'hurt') { p.lean = -8; p.angle = 1.4; p.backAngle = 2.2; }
    else if (s === 'knock') { p.lie = Math.min(1, this.st / 14); p.angle = 2; }
    else if (s === 'down' || s === 'dead') { p.lie = s === 'down' && this.st > 30 ? 1 - (this.st - 30) / 10 : 1; p.angle = 2.2; }
    else if (s === 'attack') {
      const m = this.move, f = this.mf;
      p.walk = 0.6;
      p.backAngle = 2.5;
      if (m.spin) { p.angle = f * 0.9; p.crouch = 0.25; p.lean = 4; p.backAngle = f * 0.9 + Math.PI; }
      else if (m.flurry && f < 50) { p.angle = Math.sin(f * 1.7) * 2.2; p.lean = 10; p.crouch = 0.3; }
      else if (m.id === 'rush' && f < 26) { p.angle = (f % 4 < 2 ? 0.05 : 0.35); p.lean = 12; p.crouch = 0.3; p.backAngle = 3; }
      else if (m.plunge) { p.angle = f < 4 ? -2.6 : 1.5; p.crouch = 0.45; p.lean = 4; p.lift = 1; p.walk = 1.3; }
      else {
        const at = m.swingAt ?? m.hits[0]?.at ?? 6, dur = m.swingDur ?? m.hits[0]?.dur ?? 4;
        const u = clamp((f - at) / dur, 0, 1);
        p.angle = lerp(m.swing[0], m.swing[1], easeOut(u));
        p.lean = f < at ? -3 : 7;
        p.crouch = f < at ? (m.skill ? 0.45 : 0.25) : 0.1;
        if (m.low) { p.crouch = 0.6; p.lean = 9; }
        if (m.thrust) { p.lean = 12; p.crouch = 0.3; p.backAngle = 3; }
      }
    }
    return p;
  }

  addGhost() {
    this.ghosts.push({ x: this.x, y: this.y, z: this.z, facing: this.facing, pose: this.pose(0), frame: heroSprite.ready ? heroFrame(this, 0) : null, life: 12 });
  }

  draw(ctx, camX, t) {
    const sprite = heroSprite.ready;
    for (const g of this.ghosts) {
      const [gx, gy] = toScreen(g.x, g.y, g.z, camX);
      if (sprite) heroSprite.draw(ctx, g.frame, gx, gy, g.facing, { ghost: this.glow, alpha: (g.life / 12) * 0.4 });
      else drawFighter(ctx, gx, gy, this.look, g.pose, { facing: g.facing, ghost: this.glow, alpha: (g.life / 12) * 0.35, t });
    }
    const [sx, sy] = toScreen(this.x, this.y, this.z, camX);
    const blink = this.invuln > 0 && (this.state === 'idle' || this.state === 'run') && (t >> 2) % 2;
    const armored = this.state === 'attack' && this.move?.armor;
    if (armored) drawAura(ctx, sx, sy, this.h, this.glow, 1);
    if (this.state === 'charge') drawAura(ctx, sx, sy, this.h, this.chargeLv === 2 ? '#ffffff' : this.glow, 0.6 + this.chargeLv * 0.5 + 0.2 * Math.sin(t * 0.4));
    if (sprite) {
      heroSprite.draw(ctx, heroFrame(this, t), sx, sy, this.facing, { flash: this.flash > 3, alpha: blink ? 0.45 : 1, rim: '#b8d4ff', rimAlpha: 0.28 });
    } else {
      drawFighter(ctx, sx, sy, this.look, this.pose(t), { facing: this.facing, flash: this.flash > 3, alpha: blink ? 0.45 : 1, t });
    }
  }
}
