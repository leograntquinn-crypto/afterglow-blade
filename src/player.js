// 主角：状态机 + 招式执行 + 取消系统
//
// 状态机（State Machine）：角色任何时刻只处于一个状态，
// 每个状态只关心自己的逻辑和「能切换到哪些状态」。这让复杂的动作逻辑保持清晰。
//
//   idle/run ──攻击──> attack ──取消──> attack(下一招) / 技能 / 闪避
//      │  └──跳跃──> air ──攻击──> attack(空中)
//      └──闪避──> dash ──攻击──> attack(冲刺攻击)
//   被打 → hurt / knock(击飞) → down(倒地) → idle

import { GRAVITY, DEPTH, world, clamp, lerp, toScreen } from './config.js';
import { MOVES, SKILLS, SKILL_KEYS } from './moves.js';
import { SKILL_TREE } from './progression.js';
import { hitBox, overlaps } from './combat.js';
import { drawFighter } from './rig.js';
import { sfx } from './audio.js';

const SPEED_X = 4.2, SPEED_Y = 2.7, JUMP_V = 12.5;
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
    this.airHangs = 0;
    this.walk = 0;
    this.ghosts = []; // 残影
    this.dmgTaken = 0;
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
    this.state = s;
    this.st = 0;
  }

  update(game) {
    this.st++;
    if (this.invuln > 0) this.invuln--;
    if (this.flash > 0) this.flash--;
    if (this.dashCd > 0) this.dashCd--;
    this.mp = Math.min(this.maxMp, this.mp + this.S.mpRegen);
    this.hpTrail = this.hpTrail > this.hp ? Math.max(this.hp, this.hpTrail - this.maxHp * 0.004) : this.hp;
    for (const k in this.cd) if (this.cd[k] > 0) this.cd[k]--;
    for (const g of this.ghosts) g.life--;
    this.ghosts = this.ghosts.filter((g) => g.life > 0);

    switch (this.state) {
      case 'idle':
      case 'run': this.updateGround(game); break;
      case 'air': this.updateAir(game); break;
      case 'attack': this.updateMove(game); break;
      case 'dash': this.updateDash(game); break;
      case 'hurt':
        this.vx *= 0.8; this.vy = 0;
        if (this.st >= this.hurtT) this.setState('idle');
        break;
      case 'down':
        this.vx *= 0.8; this.vy = 0;
        if (this.st >= 40) { this.setState('idle'); this.invuln = 45; }
        break;
      case 'knock':
      case 'dead':
        this.vy = 0;
        if (this.z <= 0) this.vx *= 0.85;
        break;
    }
    this.physics(game);
  }

  physics(game) {
    this.x += this.vx;
    this.y += this.vy;
    if (this.z > 0 || this.vz > 0) {
      this.vz -= GRAVITY;
      this.z += this.vz;
      if (this.z <= 0) {
        this.z = 0;
        this.vz = 0;
        this.onLand(game);
      }
    }
    this.x = clamp(this.x, 30, world.w - 30);
    this.y = clamp(this.y, 0, DEPTH);
  }

  onLand(game) {
    game.fx.dust(this.x, this.y, 5);
    this.airHangs = 0;
    if (this.state === 'knock') {
      this.setState('down');
      game.fx.shake(4, 8);
      sfx('land');
    } else if (this.state === 'air' || (this.state === 'attack' && this.move?.air)) {
      this.move = null;
      this.vx = 0;
      this.setState('idle');
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

  // 优先级：技能 > 闪避 > 跳跃 > 攻击
  tryActions(game) {
    const inp = game.input;
    if (this.trySkill(game)) return true;
    if (inp.buffered('dash') && this.dashCd <= 0) { inp.consume('dash'); this.startDash(game); return true; }
    if (inp.buffered('jump')) { inp.consume('jump'); this.jump(game); return true; }
    if (inp.buffered('attack')) {
      inp.consume('attack');
      this.startMove(game, inp.dy < -0.5 ? 'upper' : 'slash1');
      return true;
    }
    return false;
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
    if (inp.buffered('attack')) { inp.consume('attack'); this.startMove(game, 'airSlash'); }
  }

  // ---------- 闪避（带无敌帧）----------
  startDash(game) {
    const dx = game.input.dx;
    if (dx) this.facing = Math.sign(dx);
    this.move = null;
    this.setState('dash');
    this.invuln = 14;
    this.dashCd = 30;
    game.fx.dust(this.x, this.y, 6);
    sfx('dash');
  }

  updateDash(game) {
    const t = this.st, inp = game.input;
    this.vx = this.facing * 11 * Math.max(0, 1 - t / 20);
    this.vy = inp.dy * 1.2;
    if (t % 2 === 0) this.addGhost();
    if (t >= 4 && inp.buffered('attack')) { inp.consume('attack'); this.startMove(game, 'dashAtk'); return; }
    if (t >= 6 && this.trySkill(game)) return;
    if (t >= 20) this.setState('idle');
  }

  // ---------- 招式 ----------
  startMove(game, name) {
    const m = MOVES[name], inp = game.input;
    if (inp.dx && !m.air) this.facing = Math.sign(inp.dx);
    this.move = m;
    this.mf = 0;
    this.landed = false;
    this.hitSets = m.hits.map(() => new Set());
    this.setState('attack');
    if (!m.air) { this.vx = 0; this.vy = 0; }
    if (m.hang && this.airHangs < 2 && this.vz < m.hang) { this.vz = m.hang; this.airHangs++; }
  }

  updateMove(game) {
    const m = this.move, f = this.mf, inp = game.input;

    // 位移
    if (m.moveDuring) { this.vx = inp.dx * m.moveDuring; this.vy = inp.dy * m.moveDuring * 0.7; }
    else if (m.lunge && f >= m.lunge[0] && f < m.lunge[1]) this.vx = this.facing * m.lunge[2];
    else if (!m.air) { this.vx *= 0.7; this.vy = 0; }
    if ((m.thrust || m.skill) && f % 2 === 0 && f < (m.flurry ? 50 : 16)) this.addGhost();
    if (m.invuln && f >= m.invuln[0] && f < m.invuln[1]) this.invuln = Math.max(this.invuln, 2);

    m.events?.[f]?.(this, game);

    // 刀光
    const swingAt = m.swingAt ?? m.hits[0]?.at;
    if (f === swingAt && !m.spin) {
      game.fx.arc(this.x + this.facing * 6, this.y, this.z + 56, this.facing, m.heavy ? 80 : 64, m.swing[0], m.swing[1], this.glow, m.heavy ? 18 : 13);
      sfx('swing');
    }

    // 判定
    m.hits.forEach((h, i) => {
      if (f === h.at && m.spin) {
        game.fx.ring(this.x, this.y, this.z + 50, this.glow, 40, 7, 10, 5);
        sfx('swing');
      }
      if (f === h.at && m.flurry && i < m.hits.length - 1) {
        // 乱舞：每一刀随机角度的刀光
        const a0 = -2.4 + Math.random() * 1.2;
        game.fx.arc(this.x + this.facing * 40, this.y, this.z + 50, this.facing, 60 + Math.random() * 20, a0, a0 + 2.6 + Math.random(), this.glow, 11, 7);
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
    const canCancel = f >= (m.cancel ?? m.total);
    if (canCancel) {
      if (m.next && inp.buffered('attack')) { inp.consume('attack'); this.startMove(game, m.next); return; }
      if (m.jumpCancel && this.z <= 0 && inp.buffered('jump')) { inp.consume('jump'); this.jump(game); return; }
    }
    // 普攻命中后可以立刻用技能取消；技能之间要等到 cancel 帧
    const skillOk = m.skill ? canCancel : canCancel || this.landed;
    if (!m.air && skillOk && this.trySkill(game)) return;
    if (!m.air && canCancel && this.dashCd <= 0 && inp.buffered('dash')) { inp.consume('dash'); this.startDash(game); return; }

    if (this.mf >= m.total) {
      this.move = null;
      this.setState(this.z > 0 ? 'air' : 'idle');
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
    if (this.invuln > 0 || this.state === 'dead' || this.state === 'down') return null;
    this.hp = Math.max(0, this.hp - dmg);
    this.dmgTaken += dmg;
    this.flash = 6;
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
    else if (s === 'dash') { p.lean = 12; p.angle = 2.5; p.crouch = 0.35; p.walk = 1.4; p.backAngle = 2.8; }
    else if (s === 'hurt') { p.lean = -8; p.angle = 1.4; p.backAngle = 2.2; }
    else if (s === 'knock') { p.lie = Math.min(1, this.st / 14); p.angle = 2; }
    else if (s === 'down' || s === 'dead') { p.lie = s === 'down' && this.st > 30 ? 1 - (this.st - 30) / 10 : 1; p.angle = 2.2; }
    else if (s === 'attack') {
      const m = this.move, f = this.mf;
      p.walk = 0.6;
      p.backAngle = 2.5;
      if (m.spin) { p.angle = f * 0.9; p.crouch = 0.25; p.lean = 4; p.backAngle = f * 0.9 + Math.PI; }
      else if (m.flurry && f < 50) { p.angle = Math.sin(f * 1.7) * 2.2; p.lean = 10; p.crouch = 0.3; }
      else {
        const at = m.swingAt ?? m.hits[0]?.at ?? 6, dur = m.swingDur ?? m.hits[0]?.dur ?? 4;
        const u = clamp((f - at) / dur, 0, 1);
        p.angle = lerp(m.swing[0], m.swing[1], easeOut(u));
        p.lean = f < at ? -3 : 7;
        p.crouch = f < at ? (m.skill ? 0.45 : 0.25) : 0.1;
        if (m.thrust) { p.lean = 12; p.crouch = 0.3; p.backAngle = 3; }
      }
    }
    return p;
  }

  addGhost() {
    this.ghosts.push({ x: this.x, y: this.y, z: this.z, facing: this.facing, pose: this.pose(0), life: 12 });
  }

  draw(ctx, camX, t) {
    for (const g of this.ghosts) {
      const [gx, gy] = toScreen(g.x, g.y, g.z, camX);
      drawFighter(ctx, gx, gy, this.look, g.pose, { facing: g.facing, ghost: this.glow, alpha: (g.life / 12) * 0.35, t });
    }
    const [sx, sy] = toScreen(this.x, this.y, this.z, camX);
    const blink = this.invuln > 0 && (this.state === 'idle' || this.state === 'run') && (t >> 2) % 2;
    const armored = this.state === 'attack' && this.move?.armor;
    ctx.save();
    if (armored) { ctx.shadowColor = this.glow; ctx.shadowBlur = 16; }
    drawFighter(ctx, sx, sy, this.look, this.pose(t), { facing: this.facing, flash: this.flash > 3, alpha: blink ? 0.45 : 1, t });
    ctx.restore();
  }
}
