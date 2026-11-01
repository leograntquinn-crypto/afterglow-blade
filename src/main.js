// 游戏主循环与场景管理
//
// 场景流程：标题 → 营地（HTML 界面）→ 关卡战斗 → 结算 → 营地 ……
//
// 固定时间步长（Fixed Timestep）：不管显示器是 60Hz 还是 144Hz，
// 游戏逻辑都按每秒 60 次更新。这样帧数据（招式第几帧出判定）在任何设备上都一致。

import { VIEW_W, VIEW_H, ARENA_W, DEPTH, COLORS, FONT_TITLE, FONT_NUM, clamp, rand } from './config.js';
import { Input } from './input.js';
import { initAudio, sfx } from './audio.js';
import { FX } from './fx.js';
import { Player } from './player.js';
import { Enemy } from './enemy.js';
import { Loot } from './loot.js';
import { STAGES, WAVE_NAMES, grade } from './stages.js';
import { computeStats, addXp, autoUnlock, skillMul, playerLook, BAG_MAX } from './progression.js';
import { RARITY, randomDrop, sellPrice, itemTitle } from './items.js';
import { SaveStore } from './save.js';
import { Hub } from './hub.js';
import { drawBackground, drawVignette, drawShadow } from './draw.js';
import { drawHUD, drawTitle, drawDead, drawClear } from './hud.js';

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new Input();
    this.touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.store = new SaveStore();
    this.stats = computeStats(this.save);
    this.hub = new Hub(this, document.getElementById('hub'));
    this.pauseEl = document.getElementById('pause');
    this.scene = 'title';
    this.sceneT = 0;
    this.ticks = 0;
    this.paused = false;
    this.stage = null;
    this.resetWorld();

    // 云存档比本地新：不在战斗中就切换过去
    this.store.connectCloud((apply) => {
      if (this.scene === 'play') return false;
      apply();
      this.refreshStats();
      this.player.look = this.playerLook();
      if (this.scene === 'hub') this.hub.render();
      return true;
    }).then(() => { if (this.scene === 'hub') this.hub.render(); });

    this.input.onPress((a) => {
      initAudio(); // 浏览器要求：声音必须由用户操作启动
      if (this.scene === 'play') {
        if (a === 'pause') this.setPaused(!this.paused);
        return;
      }
      if (a === 'attack' || a === 'start' || a === 'jump') this.advance();
    });
    canvas.addEventListener('pointerdown', () => {
      canvas.focus();
      initAudio();
      this.advance();
    });
    this.pauseEl.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'resume') this.setPaused(false);
      if (act === 'retreat') { this.setPaused(false); this.endRun(); this.openHub(); }
    });
    document.getElementById('pause-btn').addEventListener('click', () => this.scene === 'play' && this.setPaused(!this.paused));
  }

  get save() { return this.store.data; }
  playerLook() { return playerLook(this.save); }

  refreshStats() {
    this.stats = computeStats(this.save);
    if (this.player) this.player.applyStats(this.stats, false);
  }

  setScene(s) {
    this.scene = s;
    this.sceneT = 0;
    document.body.dataset.scene = s;
  }

  setPaused(v) {
    this.paused = v;
    this.pauseEl.hidden = !v;
  }

  // 标题 / 结算画面上按键或点击 → 回营地
  advance() {
    if (this.scene === 'title') this.openHub();
    else if ((this.scene === 'clear' || this.scene === 'dead') && this.sceneT > 60) this.openHub();
  }

  openHub() {
    this.setScene('hub');
    this.resetWorld();
    this.hub.show();
  }

  resetWorld() {
    this.player = new Player(320, DEPTH / 2, this.stats, this.playerLook());
    this.enemies = [];
    this.projectiles = [];
    this.hazards = [];
    this.loots = [];
    this.toasts = [];
    this.attackers = new Set();
    this.fx = new FX();
    this.hitstop = 0;
    this.slowmo = 0;
    this.camX = 0;
    this.combo = 0;
    this.comboT = 0;
    this.comboPop = 0;
    this.maxCombo = 0;
    this.kills = 0;
    this.focus = null;
    this.wave = -1;
    this.waveActive = false;
    this.waveClearAt = null;
    this.spawnQueue = [];
    this.spawnSide = 1;
    this.banner = null;
    this.frame = 0;
  }

  startStage(i) {
    this.stage = STAGES[i];
    this.refreshStats();
    this.resetWorld();
    this.run = { xp: 0, gold: 0, items: [], ups: [], firstClear: false, ended: false };
    this.hub.hide();
    this.setScene('play');
    this.input.clearBuffer();
    this.canvas.focus();
    this.nextWave();
  }

  // ---------------- 波次 ----------------
  nextWave() {
    this.wave++;
    if (this.wave >= this.stage.waves.length) return this.finish();
    const list = this.stage.waves[this.wave];
    this.spawnQueue = list.map((spec, i) => ({ spec, at: this.frame + 50 + i * 30 }));
    this.waveActive = true;
    const last = this.wave === this.stage.waves.length - 1;
    this.banner = { title: last ? '最 终 波' : WAVE_NAMES[this.wave], sub: this.stage.subs[this.wave] || this.stage.name, t: 0, color: last ? COLORS.ember : null };
    sfx('wave');
  }

  spawnEnemy(spec) {
    const elite = spec.endsWith('*');
    this.spawnSide = -this.spawnSide;
    const x = clamp(this.spawnSide > 0 ? this.camX + VIEW_W - 70 : this.camX + 70, 60, ARENA_W - 60);
    const y = rand(20, DEPTH - 20);
    const e = new Enemy(spec.replace('*', ''), x, y, this, { lv: this.stage.lv, elite });
    e.facing = -this.spawnSide;
    this.enemies.push(e);
    this.fx.dust(x, y, 10, 1.5);
    this.fx.ring(x, y, 4, elite ? COLORS.gold : '#8a5cff', 10, 6, 18, 3);
  }

  updateWaves() {
    while (this.spawnQueue.length && this.spawnQueue[0].at <= this.frame) this.spawnEnemy(this.spawnQueue.shift().spec);
    if (this.waveActive && !this.spawnQueue.length && !this.enemies.some((e) => e.alive)) {
      this.waveActive = false;
      this.waveClearAt = this.frame;
      for (const l of this.loots) l.magnet = true; // 清场后，地上的东西自动飞过来
    }
    if (this.waveClearAt != null && this.frame - this.waveClearAt > 110) {
      this.waveClearAt = null;
      this.nextWave();
    }
  }

  // 结束一次出征（通关、死亡或撤退都会走这里）：存档
  endRun() {
    if (this.run.ended) return;
    this.run.ended = true;
    this.save.runs++;
    this.store.save();
  }

  finish() {
    const p = this.player, st = this.stage, s = this.save;
    this.result = grade({ time: this.frame / 60, hpLostPct: p.dmgTaken / p.maxHp, maxCombo: this.maxCombo, waves: st.waves.length });
    // 通关奖励
    const first = !s.cleared[st.id];
    const mul = first ? 3 : 1;
    this.run.firstClear = first;
    this.gainXp(Math.round(40 * st.lv * mul), false);
    this.gainGold(Math.round(60 * st.lv * mul));
    s.cleared[st.id] = true;
    const b = s.best[st.id];
    this.newBest = !b || this.result.total > b.total || (this.result.total === b.total && this.frame / 60 < b.time);
    if (this.newBest) s.best[st.id] = { letter: this.result.letter, total: this.result.total, time: this.frame / 60, maxCombo: this.maxCombo };
    this.endRun();
    this.setScene('clear');
    sfx('clear');
  }

  // ---------------- 成长：经验、金币、装备 ----------------
  gainXp(n, showFx = true) {
    this.run.xp += n;
    const ups = addXp(this.save, n);
    if (!ups.length) return;
    this.run.ups.push(...ups);
    const learned = autoUnlock(this.save);
    this.refreshStats();
    const p = this.player;
    p.hp = p.maxHp;
    p.mp = p.maxMp;
    sfx('levelup');
    if (showFx) {
      this.fx.label(p.x, p.y, p.z + 140, `LEVEL UP  Lv.${this.save.lv}`, COLORS.gold, 34);
      this.fx.ring(p.x, p.y, 40, COLORS.gold, 20, 8, 24, 5);
      this.fx.flash(COLORS.gold, 0.18);
      for (const name of learned) this.toast(`习得新技能：${name}`, COLORS.blade);
    }
  }

  gainGold(n) {
    this.run.gold += n;
    this.save.gold += n;
  }

  toast(text, color) {
    this.toasts.push({ text, color, life: 200 });
    if (this.toasts.length > 5) this.toasts.shift();
  }

  dropLoot(e) {
    const L = this.stage.lv;
    const coins = e.elite ? 3 : 1;
    for (let i = 0; i < coins; i++) this.loots.push(new Loot({ x: e.x, y: e.y, gold: Math.round(rand(4, 9) * (1 + L * 0.3)) }));
    if (Math.random() < (e.elite ? 1 : e.T.drop)) {
      const item = randomDrop(L, { minRar: e.elite ? 1 : 0, luck: e.elite ? 0.6 : 0 });
      this.loots.push(new Loot({ x: e.x, y: e.y, item, vx: (Math.random() - 0.5) * 3 }));
      if (item.rar === 3) { sfx('legend'); this.fx.flash(RARITY[3].color, 0.25); this.fx.shake(6, 20); }
      else if (item.rar === 2) sfx('rare');
    }
  }

  pickup(loot) {
    const p = this.player;
    if (loot.gold) {
      this.gainGold(loot.gold);
      this.fx.label(p.x, p.y, p.z + 100, `+${loot.gold}`, COLORS.gold, 18);
      sfx('coin');
      return;
    }
    const it = loot.item, color = RARITY[it.rar].color;
    if (this.save.bag.length >= BAG_MAX) {
      const g = sellPrice(it);
      this.gainGold(g);
      this.toast(`背包已满，自动出售 ${itemTitle(it)} +${g} 金币`, '#9fb3c8');
    } else {
      this.save.bag.push(it);
      this.run.items.push(it);
      this.toast(`获得 [${RARITY[it.rar].name}] ${itemTitle(it)}`, color);
    }
    this.fx.label(p.x, p.y, p.z + 110, it.name, color, 20);
    sfx(it.rar >= 2 ? 'rare' : 'pickup');
  }

  // ---------------- 伤害计算 ----------------
  calcDamage(src, target, h) {
    let dmg = h.dmg * (0.92 + Math.random() * 0.16);
    let crit = false;
    if (src.team === 'player') {
      const S = this.stats;
      dmg *= S.atk / 20; // 20 = 1 级的攻击力，招式表里的伤害以它为基准
      dmg *= h.skill ? skillMul(S, h.skill) : S.normalMul;
      crit = Math.random() < S.crit;
      if (crit) dmg *= S.critDmg;
      if (target.brokenT > 0) dmg *= 1.3;
    } else {
      dmg *= (src.owner || src).dmgMul ?? 1;
      dmg *= 100 / (100 + this.stats.def); // 防御减伤：100 防御 = 伤害减半
    }
    return { dmg: Math.max(1, Math.round(dmg)), crit };
  }

  // ---------------- 命中处理：打击感集中在这里 ----------------
  applyHit(src, target, h, dir) {
    if (target.canBeHit && !target.canBeHit()) return false;
    const { dmg, crit } = this.calcDamage(src, target, h);
    const r = target.takeHit(h, dir, dmg, this);
    if (!r) return false;
    const fromPlayer = src.team === 'player';
    const hz = target.z + target.h * 0.55;
    const hx = target.x - dir * target.w * 0.25;

    // 1. 火花 + 冲击环
    this.fx.spark(hx, target.y, hz, dir, h.heavy ? 14 : 8, fromPlayer ? '#fff1c2' : '#ff8a7a');
    this.fx.ring(hx, target.y, hz, fromPlayer ? this.player.glow : COLORS.blood, 6, h.heavy ? 7 : 4, 10, h.heavy ? 5 : 3);
    // 2. 伤害数字
    this.fx.number(target.x, target.y, target.z + target.h + 6, dmg, { crit, color: fromPlayer ? null : COLORS.blood });
    // 3. 顿帧：整个世界停住几帧，让「砍中」的瞬间被看清
    this.hitstop = Math.max(this.hitstop, (h.stop ?? 4) + (crit ? 2 : 0));
    // 4. 震屏
    if (h.shake) this.fx.shake(h.shake, 10 + h.shake);
    // 5. 音效
    sfx(h.heavy || crit ? 'heavy' : 'hit');

    if (fromPlayer) {
      this.combo++;
      this.comboT = 110;
      this.comboPop = 8;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.focus = target;
      if (r.broke) {
        this.fx.label(target.x, target.y, target.z + target.h + 34, '破 防 !', COLORS.ember, 32);
        this.fx.shake(8, 16);
        this.hitstop += 6;
        sfx('break');
      }
      if (r.killed) this.onKill(target);
    } else {
      this.fx.flash(COLORS.blood, 0.22);
      sfx('hurt');
    }
    return true;
  }

  onKill(e) {
    this.kills++;
    sfx('kill');
    this.gainXp(e.xp);
    this.fx.label(e.x, e.y, e.z + e.h + 50, `+${e.xp} EXP`, '#c8b6ff', 16);
    this.dropLoot(e);
    // 清场的最后一击：慢动作 + 白闪
    if (!this.spawnQueue.length && !this.enemies.some((x) => x.alive)) {
      this.slowmo = 26;
      this.hitstop = Math.max(this.hitstop, 10);
      this.fx.flash('#ffffff', 0.35);
      this.fx.shake(10, 24);
    }
  }

  // ---------------- 每帧逻辑 ----------------
  update() {
    this.ticks++;
    if (this.paused) return;
    this.sceneT++;
    this.fx.update();
    if (this.slowmo > 0) this.slowmo--;
    if (this.banner && ++this.banner.t > 130) this.banner = null;
    for (const t of this.toasts) t.life--;
    this.toasts = this.toasts.filter((t) => t.life > 0);
    if (this.scene !== 'play') return;

    // 顿帧期间世界静止（特效和震屏照常）
    if (this.hitstop > 0) { this.hitstop--; return; }

    this.input.tick();
    this.frame++;
    if (this.comboPop > 0) this.comboPop--;
    if (this.comboT > 0 && --this.comboT === 0) this.combo = 0;

    this.player.update(this);
    for (const e of this.enemies) e.update(this);
    this.separate();
    for (const p of this.projectiles) p.update(this);
    for (const h of this.hazards) h.update(this);
    for (const l of this.loots) l.update(this);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    this.hazards = this.hazards.filter((h) => !h.dead);
    this.loots = this.loots.filter((l) => !l.dead);
    this.enemies = this.enemies.filter((e) => !e.remove);
    if (this.focus?.remove) this.focus = null;

    // 镜头：跟随主角，略微看向前方
    const target = clamp(this.player.x - VIEW_W / 2 + this.player.facing * 60, 0, ARENA_W - VIEW_W);
    this.camX += (target - this.camX) * 0.08;

    this.updateWaves();
    if (this.player.state === 'dead' && this.player.st > 90 && this.scene === 'play') {
      this.endRun();
      this.setScene('dead');
      sfx('lose');
    }
  }

  // 敌人之间轻微互相推开，避免叠在一起
  separate() {
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) {
      for (let j = i + 1; j < es.length; j++) {
        const a = es[i], b = es[j];
        if (!a.alive || !b.alive || a.z > 0 || b.z > 0) continue;
        const dx = b.x - a.x, minD = (a.w + b.w) * 0.4;
        if (Math.abs(dx) < minD && Math.abs(b.y - a.y) < 14) {
          const push = (minD - Math.abs(dx)) * 0.1 * (Math.sign(dx) || 1);
          a.x -= push;
          b.x += push;
        }
      }
    }
  }

  // ---------------- 绘制 ----------------
  render() {
    const ctx = this.ctx, camX = this.camX, t = this.ticks;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    const [ox, oy] = this.fx.shakeOffset();

    ctx.save();
    ctx.translate(ox, oy);
    drawBackground(ctx, camX, t);
    if (this.scene !== 'hub') {
      this.fx.drawFloor(ctx, camX);
      for (const h of this.hazards) h.drawFloor(ctx, camX);
      const actors = [this.player, ...this.enemies];
      for (const a of actors) drawShadow(ctx, a, camX);
      // 按纵深排序：靠前（y 大）的后画，挡住靠后的
      const list = [...actors, ...this.projectiles, ...this.loots].sort((a, b) => a.y - b.y);
      for (const o of list) o.draw(ctx, camX, t);
      this.fx.draw(ctx, camX);
      this.fx.drawTexts(ctx, camX);
    }
    ctx.restore();

    drawVignette(ctx);
    if (this.fx.flashA > 0) {
      ctx.globalAlpha = this.fx.flashA;
      ctx.fillStyle = this.fx.flashColor;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
    }

    if (this.scene === 'play') drawHUD(ctx, this);
    else if (this.scene === 'title') drawTitle(ctx, this);
    else if (this.scene === 'dead') drawDead(ctx, this);
    else if (this.scene === 'clear') drawClear(ctx, this);
    else if (this.scene === 'hub') this.hub.drawPreview(t);
  }

  resize() {
    const stage = this.canvas.parentElement;
    const s = Math.min(stage.clientWidth / VIEW_W, stage.clientHeight / VIEW_H);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.style.width = `${VIEW_W * s}px`;
    this.canvas.style.height = `${VIEW_H * s}px`;
    this.canvas.width = Math.round(VIEW_W * s * dpr);
    this.canvas.height = Math.round(VIEW_H * s * dpr);
    this.scale = s * dpr;
  }
}

// ---------------- 启动 ----------------
const canvas = document.getElementById('game');
const game = new Game(canvas);
window.__game = game; // 方便在浏览器控制台里调试：__game.player.hp = 9999
game.setScene('title');
game.resize();
addEventListener('resize', () => game.resize());

if (game.touch) {
  const touchUI = document.getElementById('touch');
  touchUI.hidden = false;
  game.input.bindTouch(touchUI);
}

document.fonts?.load(`40px ${FONT_TITLE}`, '残光之刃剑士连击第一二三四波最终力竭肃清破防裂风崩千精心气墓穴入口骸骨回廊屠夫刑场深渊祭坛').catch(() => {});
document.fonts?.load(`40px ${FONT_NUM}`, '0123456789LEVEUPSABC').catch(() => {});

const STEP = 1000 / 60;
let last = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(100, now - last);
  last = now;
  acc += dt * (game.slowmo > 0 ? 0.3 : 1);
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    game.update();
    acc -= STEP;
    steps++;
  }
  if (steps === 5) acc = 0;
  game.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
