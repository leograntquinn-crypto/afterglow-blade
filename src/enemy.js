// 敌人：类型表 + 简单 AI + 受击反应（硬直 / 浮空 / 倒地 / 霸体破防）
import { GRAVITY, DEPTH, world, clamp, lerp, rand, toScreen, COLORS, FONT_NUM, FONT_TITLE, yLimits } from './config.js';
import { hitBox, overlaps, Projectile, Hazard } from './combat.js';
import { drawFighter, drawAura } from './rig.js';
import { sfx } from './audio.js';
import { AFFIXES, GUARD_MAX, updateAffixes, onAffixHit, drawAffixes } from './affix.js';
import { ENEMY_SPRITES, enemyFrame, stepWalk } from './enemy_sprites.js';
import { EXT_TYPES, AI, drawWard } from './enemies_ext.js';
import { BRAINS, feintRevealed } from './ai.js';
import { FEINT } from './ai_data.js';
import { ENEMY_FX } from './fx_data.js';
import { drawEnemyAura, drawCrown, drawVolatile, wardBreakFx, typeFx } from './enemy_fx.js';

export const TYPES = {
  grunt: {
    // brain：用 ai.js 的哪个大脑（踩线、惩罚打空、包抄；性格数据见 ai_data.js）
    name: '腐骨兵', lvOff: 0, hp: 140, w: 36, h: 82, speed: 1.7, weight: 1, armor: 0, xp: 12, drop: 0.22, brain: 'grunt',
    look: { rig: 'grunt', h: 82, bone: '#e2d7c0', cloth: '#3d2f28', armor: '#5a3d2e', eye: '#ff5a3c', weapon: { type: 'sword', len: 44, color: '#8d8178' } },
    atk: { range: 62, windup: 26, hitAt: 4, recover: 34, cd: [70, 130],
      hit: { box: { x: 46, w: 76, d: 26, z0: 0, z1: 90 }, dmg: 9, kb: 4, stun: 18, stop: 4, shake: 4 } },
    // 第二种攻击：中距离突刺（看到红光后横向或纵向躲开）
    lunge: { range: 190, minRange: 100, windup: 32, hitAt: 2, dur: 12, recover: 40, speed: 9, cd: [110, 170],
      hit: { box: { x: 40, w: 70, d: 24, z0: 0, z1: 90 }, dmg: 11, kb: 6, stun: 20, stop: 5, shake: 5 } },
  },
  archer: {
    name: '影弓手', lvOff: 1, hp: 95, w: 34, h: 84, speed: 2.0, weight: 0.9, armor: 0, ranged: true, xp: 14, drop: 0.25, brain: 'archer',
    look: { rig: 'archer', h: 84, cloak: '#2a2233', cloth: '#3a3044', wrap: '#4a4054', leather: '#5a4232', boots: '#2a2028', eye: '#c48bff', weapon: { type: 'bow', color: '#8a6a4a' } },
    atk: { range: 330, windup: 38, recover: 30, cd: [110, 170],
      hit: { box: { w: 30, d: 18, z0: -20, z1: 20 }, dmg: 8, kb: 3, stun: 16, stop: 3, shake: 3 } },
  },
  brute: {
    name: '铁甲屠夫', lvOff: 3, hp: 520, w: 58, h: 112, speed: 1.05, weight: 1.6, armor: 90, xp: 45, drop: 0.7, brain: 'brute',
    look: { rig: 'brute', h: 112, bulk: 1.5, twoHand: true, skin: '#8a6f5e', pants: '#3a2a26', metal: '#6f6a66', leather: '#4a2b22', eye: '#ffb347', weapon: { type: 'axe', len: 58, color: '#a9a29a' } },
    atk: { range: 95, windup: 54, recover: 46, cd: [110, 160], slam: true,
      hit: { dmg: 22, kb: 8, launch: 9, stop: 8, shake: 10, heavy: true } },
  },
  // 灰烛司祭、烬翼：见 enemies_ext.js
  ...EXT_TYPES,
};

let nextId = 0;

export class Enemy {
  // lv：关卡等级，决定血量和伤害；elite：精英怪（更大、更硬、必掉好装备）
  // type 可以是 TYPES 里的名字，也可以直接传一个类型配置（Boss 用）
  constructor(type, x, y, game, { lv = 1, elite = false, affixes = [] } = {}) {
    const T = typeof type === 'string' ? TYPES[type] : type;
    this.T = T;
    this.game = game;
    this.id = nextId++;
    this.elite = elite;
    const size = elite ? 1.12 : 1;
    Object.assign(this, { x, y, z: 0, vx: 0, vy: 0, vz: 0, facing: -1, w: T.w * size, h: T.h * size, team: 'enemy' });
    this.look = { ...T.look, h: T.look.h * size };
    this.name = (elite ? '精英·' : '') + T.name;
    this.lv = lv + T.lvOff + (elite ? 2 : 0);
    const scale = 1 + (lv - 1) * 0.32;
    this.maxHp = this.hp = this.hpTrail = Math.round(T.hp * scale * (elite ? 2.6 : 1));
    this.maxArmor = this.armor = Math.round(T.armor * scale * (elite ? 1.5 : 1));
    this.dmgMul = (1 + (lv - 1) * 0.2) * (elite ? 1.3 : 1);
    this.xp = Math.round(T.xp * (1 + (lv - 1) * 0.35) * (elite ? 3 : 1));
    // 难度：在等级之外再乘一层血量和伤害
    const D = game.D;
    if (D && !this.dummy) {
      this.maxHp = this.hp = this.hpTrail = Math.round(this.maxHp * D.hp);
      this.maxArmor = this.armor = Math.round(this.maxArmor * D.hp);
      this.dmgMul *= D.dmg;
    }
    this.brokenT = 0;
    this.state = 'spawn';
    this.st = 0;
    this.flash = 0;
    this.invuln = 0;
    this.walk = 0;
    this.attackCd = rand(40, 100) | 0;
    this.hitSet = new Set();
    this.juggle = 0; // 被连续浮空的次数 —— 越多下落越快，防止无限连
    this.yOff = rand(-40, 40);
    this.slot = this.id % 3;
    this.remove = false;
    this.deadT = 0;
    this.atk = T.atk;    // 当前这次出招用的是哪一种攻击
    this.evadeCd = 0;
    this.punishCd = 0; // 两次「惩罚打空」之间的冷却（ai.js）
    this.guardT = this.guardCd = this.shoveCd = 0; // 屠夫：举斧格挡剩余帧、格挡冷却、甩开冷却（ai.js）
    this.hitLog = []; // 最近被主角打中的帧（屠夫判断「贪刀」用）
    this.flying = 0;     // 被打飞后的若干帧内，撞到同伴会把同伴也撞倒
    this.pinSet = new Set();
    this.wallReady = false;
    this.squash = 0;
    // 精英词缀
    this.aff = affixes.length ? new Set(affixes) : null;
    this.guard = GUARD_MAX;
    this.guardBrokenT = 0;
    this.hitsTaken = 0;
    this.blinkCd = 0;
    if (this.aff) this.name += ' · ' + affixes.map((k) => AFFIXES[k].name).join(' ');
  }

  // 狂暴后移动、出招、冷却都变快
  get spdMul() { return this.enraged ? 1.45 : 1; }
  get windup() { return Math.round(this.atk.windup * (this.enraged ? 0.72 : 1) * (this.game.D?.windup ?? 1)); }

  get alive() {
    return this.state !== 'dying';
  }

  setState(s) {
    // 离开出招状态时归还「攻击令牌」
    if ((this.state === 'windup' || this.state === 'attack') && s !== 'attack') this.game.attackers.delete(this);
    this.state = s;
    this.st = 0;
  }

  update(game) {
    this.st++;
    if (this.flash > 0) this.flash--;
    if (this.invuln > 0) this.invuln--;
    if (this.attackCd > 0) this.attackCd--;
    if (this.evadeCd > 0) this.evadeCd--;
    if (this.punishCd > 0) this.punishCd--;
    if (this.guardT > 0) this.guardT--;
    else this.riposteLock = false;
    if (this.guardCd > 0) this.guardCd--;
    if (this.shoveCd > 0) this.shoveCd--;
    if (this.feintCd > 0) this.feintCd--;
    if (this.flying > 0) this.flying--;
    if (this.squash > 0) this.squash--;
    this.hpTrail = this.hpTrail > this.hp ? Math.max(this.hp, this.hpTrail - this.maxHp * 0.006) : this.hp;
    if (this.brokenT > 0 && --this.brokenT === 0) this.armor = this.maxArmor;
    if (this.blinkFlash > 0) this.blinkFlash--;
    if (this.ward && --this.ward.t <= 0) this.ward = null; // 咒盾到时间就散了
    updateAffixes(this, game);
    const ai = AI[this.T.ai];
    ai?.update?.(this, game);

    switch (this.state) {
      case 'spawn': if (this.st >= 36) this.setState('idle'); break;
      case 'idle': this.think(game); break;
      case 'windup':
        if (ai?.windup) ai.windup(this, game);
        else { this.vx *= 0.7; this.vy = 0; }
        if (this.T.brain && !this.dummy && !this.isBoss && game.ai) BRAINS[this.T.brain]?.windup?.(this, game); // 屠夫：看你闪避晚半拍砸
        // 佯攻：预警进行到 cancelAt 就收招（不伤人），紧接着真打一下（烬翼的假冲另算，见 enemies_ext.js）
        if (this.atk.feint && !this.atk.noCancel && this.st >= Math.round(this.windup * FEINT.cancelAt)) {
          this.setState('idle');
          this.attackCd = FEINT.follow;
          game.fx.label(this.x, this.y, this.h + 30, '虚晃', '#ffb347', 16);
          if (this.teachFeint) { this.teachFeint = false; game.teachOnce?.('feint', '假动作！「!」变成琥珀色的「?」就是要收招 —— 别急着闪，等紧接着的那一下真的再躲', '#ffb347'); }
          if (this.ai) { this.ai.intent = 'press'; this.ai.t = 0; } // 收招后坚持「压上」一小段，紧接着真打
          break;
        }
        if (this.st >= this.windup + Math.max(0, this.holdT || 0)) this.doAttack(game);
        break;
      case 'hop':
        if (this.z <= 0 && this.st > 4) this.setState('idle');
        break;
      case 'attack': this.updateAttack(game); break;
      case 'hurt':
        this.vx *= Math.abs(this.vx) > 6 ? 0.93 : 0.85; this.vy = 0;
        if (Math.abs(this.vx) > 5 && this.st % 3 === 0) game.fx.dust(this.x, this.y, 1, 0.4); // 被击退时脚下拖出尘土
        if (this.st >= this.hitstun) this.setState('idle');
        break;
      case 'air': this.vy = 0; break;
      case 'down':
        this.vx *= 0.8;
        if (this.st >= 46) { this.setState('idle'); this.invuln = 24; this.juggle = 0; this.otgUsed = false; }
        break;
      case 'dying':
        this.vy = 0;
        if (this.z <= 0) {
          this.vx *= 0.85;
          if (++this.deadT > 45) this.remove = true;
          // 化成光点消散（首领更密、用自己的颜色）
          else if (this.deadT < 40 && (this.isBoss || this.deadT % 2 === 0)) {
            game.fx.emit('dissolve', this.x + rand(-this.w / 2, this.w / 2), this.y + rand(-6, 6), rand(4, this.h * 0.75), { color: this.isBoss ? this.B.glow : '#b9a6ff', n: this.isBoss ? 3 : 1 });
          }
        }
        break;
    }
    this.physics(game);
    stepWalk(this);
  }

  // ---------- AI ----------
  // 设计原则：敌人要「公平」——出招前有明显预警（红光 + 感叹号），
  // 同一时间最多 2 个敌人进攻（攻击令牌），玩家不会被围殴到无法反应。
  think(game) {
    if (AI[this.T.ai]) return AI[this.T.ai].think(this, game);
    const p = game.player, T = this.T, A = T.atk;
    const dxp = p.x - this.x, adx = Math.abs(dxp), dyp = p.y - this.y;
    if (p.state === 'dead') { this.vx *= 0.8; this.vy = 0; return; }
    // 坚盾转身慢：玩家绕到背后要过一会儿它才转过来，冲刺穿过去打背后是一种解法
    if (this.aff?.has('shield') && this.guardBrokenT <= 0 && Math.sign(dxp) !== this.facing) {
      if (++this.turnT < 28) { this.vx *= 0.5; this.vy *= 0.5; return; }
    }
    this.turnT = 0;
    this.facing = Math.sign(dxp) || this.facing;
    // 训练木人（不反击时）：站在原位，被打走了就慢慢走回去
    if (this.hold) {
      const hx = this.home - this.x;
      this.vx = Math.abs(hx) > 8 ? Math.sign(hx) * 1.4 : 0;
      this.vy = 0;
      if (this.vx) this.walk += 0.25;
      return;
    }
    // 有大脑的敌人（腐骨兵）：感知 + 意图打分 + 导演分工（ai.js）。训练木人和首领不用
    if (this.T.brain && BRAINS[this.T.brain] && !this.dummy && !this.isBoss && game.ai) { BRAINS[this.T.brain].think(this, game); return; }

    let tx, ty = p.y;
    if (T.ranged) tx = adx < 200 ? this.x - this.facing * 80 : p.x - this.facing * 300;
    else if (this.attackCd > 0 || game.attackers.size >= 2) { tx = p.x - this.facing * (A.range + 80 + this.slot * 30); ty = p.y + this.yOff; }
    else tx = p.x - this.facing * A.range * 0.7;

    const mx = tx - this.x, my = ty - this.y;
    const spd = T.speed * this.spdMul;
    this.vx = Math.abs(mx) > 6 ? Math.sign(mx) * Math.min(spd, Math.abs(mx)) : 0;
    this.vy = Math.abs(my) > 4 ? Math.sign(my) * Math.min(spd * 0.7, Math.abs(my)) : 0;
    if (this.vx || this.vy) this.walk += 0.2 * spd;

    // 弓手被贴身时后跳拉开距离
    if (T.ranged && adx < 130 && this.evadeCd <= 0) {
      this.setState('hop');
      this.vz = 7;
      this.z = 0.01;
      this.vx = -this.facing * 6;
      this.evadeCd = 200;
      return;
    }
    const cap = game.maxAttackers ?? 2;
    const inRange = T.ranged ? adx > 120 && adx < 520 : adx <= A.range + 8;
    if (this.attackCd <= 0 && Math.abs(dyp) < 18 && game.attackers.size < cap && (game.ai?.mayAttack(this) ?? true)) { // 连段保护期间先别插进来
      const L = T.lunge;
      if (L && adx > L.minRange && adx < L.range && Math.random() < 0.03) return this.startWindup(game, L);
      if (inRange) this.startWindup(game);
    }
  }

  startWindup(game, atk = this.T.atk) {
    this.atk = atk;
    this.aim = null; // 弓手的瞄准线（ai.js 出招时再设）
    this.holdT = 0; // 屠夫延迟重砸多举的帧数
    this.setState('windup');
    game.attackers.add(this);
    game.ai?.onAttackStart(this);
    if (!this.isBoss) typeFx(game, this, 'tele', { life: this.windup }); // 第 2 批：各敌人自己的预警（素材没到时不画）
    this.vx = this.vy = 0;
    this.hitSet.clear();
    if (atk.slam) {
      // slamX / slamR：红圈的位置和大小（屠夫的「甩开」是绕在自己身边的一圈）
      game.hazards.push(new Hazard({ x: this.x + this.facing * (atk.slamX ?? 95), y: this.y, rx: atk.slamR?.[0] ?? 115, ry: atk.slamR?.[1] ?? 44, delay: this.windup, hit: atk.hit, owner: this, feint: !!atk.feint }));
      sfx('warn');
    }
  }

  doAttack(game) {
    const A = this.atk;
    this.setState('attack');
    if (!this.isBoss) typeFx(game, this, 'attack'); // 第 2 批：各敌人自己的出招（素材没到时不画）
    if (AI[this.T.ai]) return AI[this.T.ai].doAttack(this, game);
    if (A.speed) { this.vx = this.facing * A.speed; sfx('dash'); return; }
    if (this.T.ranged) {
      // vy：弓手预判过的纵深偏移（ai.js，预警时的瞄准线就是这条路线）
      game.projectiles.push(new Projectile({ x: this.x + this.facing * 30, y: this.y, z: 52, vx: this.facing * 7.5, vy: this.aim?.vy ?? 0, life: 110, team: 'enemy', kind: 'arrow', hit: A.hit, owner: this }));
      sfx('shoot');
    } else if (!A.slam) {
      this.vx = this.facing * 5;
    }
  }

  updateAttack(game) {
    if (AI[this.T.ai]) return AI[this.T.ai].updateAttack(this, game);
    const A = this.atk;
    if (A.speed) {
      // 突刺：高速前冲，前冲期间都有判定
      if (this.st < A.hitAt + A.dur) { this.vx = this.facing * A.speed; if (this.st % 2 === 0) game.fx.dust(this.x, this.y, 1, 0.6); }
      else this.vx *= 0.8;
    } else this.vx *= 0.8;
    if ((!this.T.ranged || A.kind === 'kick') && !A.slam) { // 弓手的飞踢也是近身判定
      if (this.st === A.hitAt) {
        game.fx.arc(this.x + this.facing * 6, this.y, 50, this.facing, 56, A.speed ? -0.1 : -2.0, A.speed ? 0.1 : 0.9, '#ff6a5a', 10);
        sfx('swing');
      }
      if (this.st >= A.hitAt && this.st < A.hitAt + (A.dur ?? 5)) {
        const p = game.player;
        if (!this.hitSet.has(p) && overlaps(hitBox(this, A.hit), p) && game.applyHit(this, p, A.hit, this.facing)) this.hitSet.add(p);
      }
    }
    if (this.st >= A.recover) {
      this.setState('idle');
      const cd = A.cd ?? this.T.atk.cd ?? [80, 140];
      this.attackCd = (rand(cd[0], cd[1]) * (this.elite ? 0.8 : 1) * (this.enraged ? 0.6 : 1)) | 0;
    }
  }

  // ---------- 受击 ----------
  // h.otg：能打到倒地的敌人（追打）
  canBeHit(h) {
    if (!this.alive || this.state === 'spawn' || this.invuln > 0) return false;
    if (this.state === 'down') return this.T.flyer || (!!h?.otg && this.st < 40 && !this.otgUsed); // 掉在地上的烬翼什么攻击都能打
    return true;
  }

  // dmg 已在 game.applyHit 里按攻击力、技能等级、暴击算好
  takeHit(h, dir, dmg) {
    if (!this.canBeHit(h)) return null;
    // 咒盾：先吸收伤害，盾在的时候不会被打出硬直；重击、破招、必杀对盾造成双倍
    if (this.ward) {
      this.ward.hp -= dmg * (h.heavy || h.counterMul || h.ult ? 2 : 1);
      this.flash = 4;
      this.squash = 4;
      if (this.ward.hp > 0) return { warded: true };
      this.ward = null;
      this.game.fx.label(this.x, this.y, this.h + 30, '咒盾破碎', '#b48cff', 20);
      if (!wardBreakFx(this.game, this)) this.game.fx.ring(this.x, this.y, this.h * 0.5, '#b48cff', 14, 10, 18, 5); // 咒盾碎裂（素材没载好时用冲击环）
      sfx('break');
      this.setState('hurt');
      this.hitstun = 34;
      this.vx = dir * 3;
      return { broke: true };
    }
    this.hp -= dmg;
    if (this.dummy && this.hp <= 0) this.hp = this.maxHp; // 训练木人打不死
    onAffixHit(this, this.game);
    this.flash = 6;
    this.squash = 8;
    if (h.wallBounce || (h.kb ?? 0) >= 10) this.wallReady = true;
    // 被重击打飞：一段时间内会撞倒路上的同伴
    if ((h.kb ?? 0) >= 6 || h.wallBounce) { this.flying = 26; this.flyDmg = h.dmg; this.pinSet.clear(); }

    if (this.hp > 0) typeFx(this.game, this, 'hit'); // 第 2 批：各敌人自己的挨打（死亡的在 game.onKill）
    if (this.hp <= 0) {
      this.hp = 0;
      this.setState('dying');
      this.vz = Math.max(h.launch ?? 0, 7);
      this.z = Math.max(this.z, 0.01);
      this.vx = dir * ((h.kb ?? 0) + 3);
      return { killed: true };
    }

    // 追打倒地的敌人：伤害打折，带浮空的招式能把它重新捞起来（每次倒地只能捞一次）
    if (this.state === 'down') {
      this.otgUsed = true;
      if ((h.launch ?? 0) > 0) {
        this.vz = h.launch * 0.75;
        this.z = 0.01;
        this.juggle++;
        this.setState('air');
      } else this.st = Math.max(0, this.st - 8);
      return { otg: true };
    }

    // 霸体：扣血、扣护甲，但不会被打断
    if (this.armor > 0) {
      this.armor -= dmg * (h.armorDmg ?? 1);
      if (this.armor <= 0) {
        this.armor = 0;
        this.brokenT = 240;
        this.flying = 0;
        this.setState('hurt');
        this.hitstun = 50;
        this.vx = dir * 4;
        return { broke: true };
      }
      return {};
    }

    const airborne = this.z > 0 || (h.launch ?? 0) > 0;
    if (airborne) {
      this.juggle++;
      const decay = Math.max(0.3, 1 - this.juggle * 0.07);
      this.vz = h.spike ? -11 : Math.max(this.vz * 0.3, ((h.launch || 3) * decay) / this.T.weight);
      this.z = Math.max(this.z, 0.01);
      this.vx = dir * (h.kb ?? 0) * 0.6;
      this.spiked = !!h.spike;
      this.setState('air');
    } else {
      this.setState('hurt');
      this.hitstun = h.stun ?? 16;
      this.vx = (dir * (h.kb ?? 0)) / this.T.weight;
    }
    this.facing = -dir;
    return {};
  }

  physics(game) {
    this.x += this.vx;
    this.y += this.vy;
    if (!this.hover && (this.z > 0 || this.vz > 0)) {
      this.vz -= GRAVITY * (1 + this.juggle * 0.05);
      this.z += this.vz;
      if (this.z <= 0) {
        this.z = 0;
        const v = this.vz;
        this.vz = 0;
        this.onLand(game, v);
      }
    }
    // 撞墙反弹：被重击打飞撞到房间边缘 → 弹回来并浮空，可以接着连
    if (this.wallReady && (this.x <= 24 || this.x >= world.w - 24) && Math.abs(this.vx) > 4 && (this.state === 'air' || this.state === 'hurt')) {
      this.wallReady = false;
      this.vx = -this.vx * 0.45;
      this.vz = Math.max(this.vz, 6);
      this.z = Math.max(this.z, 0.01);
      this.setState('air');
      game.onWallBounce(this);
    }
    this.x = clamp(this.x, 20, world.w - 20);
    { const [lo, hi] = yLimits(this.x); this.y = clamp(this.y, lo, hi); }
  }

  onLand(game, v) {
    if (this.state === 'dying') {
      game.fx.dust(this.x, this.y, 8);
      return;
    }
    if (this.state !== 'air') return;
    // 被砸下来或者摔得很重 → 弹起一次，给玩家追打的机会
    if (this.spiked || (v < -9 && !this.bounced)) {
      const hard = this.spiked;
      this.spiked = false;
      this.bounced = true;
      this.vz = hard ? 6.5 : 4;
      this.z = 0.01;
      game.fx.dust(this.x, this.y, 10, 1.6);
      game.fx.shake(hard ? 6 : 3, 10);
      sfx('land');
      return;
    }
    this.bounced = false;
    this.wallReady = false;
    this.otgUsed = false;
    this.setState('down');
    game.fx.dust(this.x, this.y, 8);
  }

  // ---------- 绘制 ----------
  pose(t) {
    const s = this.state, A = this.atk;
    const p = { lean: 0, walk: this.walk, crouch: 0, angle: 0.8, lie: 0, draw: 0, lift: 0 };
    switch (s) {
      case 'idle':
        if (!this.vx && !this.vy) { p.walk = 0; p.crouch = 0.06 + Math.sin(t * 0.07 + this.id) * 0.05; }
        else { p.lean = 3; p.lift = 1; }
        break;
      case 'windup':
        p.crouch = 0.3; p.lean = -5; p.angle = A.slam ? -2.6 : A.speed ? 2.8 : -2.3;
        p.draw = Math.min(1, this.st / (A.windup * 0.6));
        break;
      case 'attack':
        p.lean = A.speed ? 14 : 8;
        p.angle = A.speed ? 0.05 : lerp(A.slam ? -2.6 : -2.3, 1.1, clamp((this.st - (A.hitAt ?? 0) + 2) / 5, 0, 1));
        break;
      case 'hop': p.crouch = 0.3; p.walk = 1.2; p.angle = 0; break;
      case 'hurt': p.lean = -9; p.angle = 1.5; p.crouch = 0.15; break;
      case 'air':
      case 'dying': p.lie = this.z > 0 ? clamp(0.3 + this.st / 18, 0, 1) : 1; p.angle = 2.2; break;
      case 'down': p.lie = this.st > 34 ? Math.max(0, 1 - (this.st - 34) / 12) : 1; p.angle = 2.2; break;
      case 'spawn': p.crouch = Math.max(0, 0.6 - this.st / 60); break;
    }
    if (this.T.ranged && (s === 'idle' || s === 'windup' || s === 'attack')) p.angle = 0;
    return p;
  }

  draw(ctx, camX, t) {
    let [sx, sy] = toScreen(this.x, this.y, this.z, camX);
    if (this.game.ticks < (this.shakeUntil ?? 0)) sx += (Math.random() - 0.5) * 2 * (this.shakeAmp ?? 3);
    let alpha = 1;
    if (this.state === 'dying' && this.z <= 0) alpha = Math.max(0, 1 - this.deadT / 45);
    if (this.state === 'spawn') alpha = Math.min(1, this.st / 24);

    // 状态光（fx_enemy_v1 的 aura_threat / aura_feint / aura_guard，染色见 fx_data.js 的 ENEMY_FX.aura）；素材没载好时退回代码画的径向光
    // strength：代码画的那种的亮度（素材本身会跳动 / 呼吸，不再额外闪）
    const feint = feintRevealed(this); // 佯攻露出破绽：光变成琥珀色、断断续续，「!」变成「?」、武器抖动
    let aura = null, strength = 1;
    if (feint) { aura = 'feint'; strength = 0.9 + 0.5 * Math.sin(this.st * 1.3); }
    else if (this.state === 'windup') { aura = 'threat'; strength = 1.2 + 0.5 * Math.sin(this.st * 0.6); }
    else if (this.guardT > 0 && this.alive) { aura = 'guard'; strength = 1.1 + 0.3 * Math.sin(this.st * 0.5); } // 屠夫举斧格挡：冷色光
    else if (this.armor > 0 && this.alive) { aura = 'armor'; strength = 0.8; }
    else if (this.blinkFlash > 0) { aura = 'blink'; strength = 1.4; }
    else if (this.enraged && this.alive) { aura = 'frenzy'; strength = 0.9 + 0.3 * Math.sin(t * 0.3); }
    else if (this.elite && this.alive) { aura = 'elite'; strength = 0.8 + 0.2 * Math.sin(t * 0.1); }
    if (aura && !drawEnemyAura(ctx, this, sx, sy, aura, t, alpha)) drawAura(ctx, sx, sy, this.h, ENEMY_FX.aura[aura].color, strength);
    this.auraKey = aura; // 测试用：这一帧画的是哪种状态光
    if (feint) sx += Math.sin(this.st * 2.1) * 1.6;
    // 受击时挤压一下（横向撑开、纵向压扁），让打击有「肉感」
    const q = this.squash / 8;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1 + q * 0.14, 1 - q * 0.1);
    const flash = this.game.ticks < (this.flashUntil ?? 0);
    const SP = ENEMY_SPRITES[this.look.rig];
    if (AI[this.T.ai] && !SP?.sheet.ready) {
      // 灰烛司祭 / 烬翼：素材还没载入完（或载入失败）时用程序画的占位
      AI[this.T.ai].draw(ctx, this, t, { flash, alpha });
    } else if (SP?.sheet.ready) {
      // 逐帧精灵（腐骨兵、铁甲屠夫、影弓手、灰烛司祭、烬翼）。轮廓光和提亮让它们在暗背景里也看得清
      const o = { scale: this.look.h / SP.standH, flash, alpha, rim: SP.rim, rimAlpha: SP.rimAlpha, lift: SP.lift };
      SP.sheet.draw(ctx, enemyFrame(this, t), 0, 0, this.facing, o);
      SP.after?.(ctx, this, t, o); // 素材是干净帧：提灯、余烬这些光由引擎叠上去
    } else {
      drawFighter(ctx, 0, 0, this.look, this.pose(t), { facing: this.facing, flash, alpha, t });
    }
    ctx.restore();

    // 精英的冠光、爆裂的核：叠在身体前面（素材没载好时不画，精英照旧有金色的状态光）
    if (this.alive && this.state !== 'spawn') {
      if (this.elite) drawCrown(ctx, this, sx, sy, t);
      if (this.aff?.has('volatile')) drawVolatile(ctx, this, sx, sy, t);
    }
    if (this.ward && this.alive) drawWard(ctx, this, sx, sy, t);
    const top = sy - this.h - 14;
    drawAffixes(ctx, this, sx, sy, top);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 出招预警
    if (this.state === 'windup') {
      const s = 1 + 0.15 * Math.sin(this.st * 0.5);
      ctx.font = `600 ${30 * s}px ${FONT_NUM}`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#1a0606';
      const mark = feint ? '?' : '!';
      ctx.strokeText(mark, sx, top - 14);
      ctx.fillStyle = feint ? '#ffb347' : '#ff3b3b';
      ctx.fillText(mark, sx, top - 14);
    }
    if (this.brokenT > 0 && this.alive) {
      ctx.font = `18px ${FONT_TITLE}`;
      ctx.fillStyle = COLORS.ember;
      ctx.fillText('破防', sx, top - 14);
    }
    // 咒盾条（紫色，叠在血条上方）
    if (this.ward && this.alive) {
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillRect(sx - 25, top - 6, 50, 4);
      ctx.fillStyle = '#b48cff';
      ctx.fillRect(sx - 24, top - 5, 48 * Math.max(0, this.ward.hp / this.ward.max), 2);
    }
    // 头顶小血条
    if (this.hp < this.maxHp && this.alive && this.state !== 'spawn') {
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillRect(sx - 25, top, 50, 5);
      ctx.fillStyle = '#e8e0d0';
      ctx.fillRect(sx - 24, top + 1, 48 * (this.hpTrail / this.maxHp), 3);
      ctx.fillStyle = COLORS.blood;
      ctx.fillRect(sx - 24, top + 1, 48 * (this.hp / this.maxHp), 3);
    }
    ctx.restore();
  }
}
