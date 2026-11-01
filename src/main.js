// 游戏主循环与场景管理
//
// 固定时间步长（Fixed Timestep）：不管显示器是 60Hz 还是 144Hz，
// 游戏逻辑都按每秒 60 次更新。这样帧数据（招式第几帧出判定）在任何设备上都一致。

import { VIEW_W, VIEW_H, ARENA_W, DEPTH, COLORS, FONT_TITLE, FONT_NUM, clamp, rand } from './config.js';
import { Input } from './input.js';
import { initAudio, sfx } from './audio.js';
import { FX } from './fx.js';
import { Player } from './player.js';
import { Enemy } from './enemy.js';
import { WAVES, grade } from './waves.js';
import { drawBackground, drawVignette, drawShadow } from './draw.js';
import { drawHUD, drawTitle, drawDead, drawClear } from './hud.js';

const BEST_KEY = 'afterglow-blade-best';

function loadBest() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY)) || null; } catch { return null; }
}
function saveBest(b) {
  try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch { /* 无痕模式等情况下存不了，忽略 */ }
}

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new Input();
    this.touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.best = loadBest();
    this.scene = 'title';
    this.sceneT = 0;
    this.ticks = 0;
    this.resetWorld();

    this.input.onPress((a) => {
      initAudio(); // 浏览器要求：声音必须由用户操作启动
      if (a === 'attack' || a === 'start' || a === 'jump') this.tryStart();
    });
    canvas.addEventListener('pointerdown', () => {
      canvas.focus();
      initAudio();
      this.tryStart();
    });
  }

  tryStart() {
    if (this.scene === 'play') return;
    if (this.scene !== 'title' && this.sceneT < 40) return; // 防止误触立刻重开
    this.start();
  }

  resetWorld() {
    this.player = new Player(320, DEPTH / 2);
    this.enemies = [];
    this.projectiles = [];
    this.hazards = [];
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

  start() {
    this.resetWorld();
    this.scene = 'play';
    this.sceneT = 0;
    this.input.clearBuffer();
    this.nextWave();
  }

  setScene(s) {
    this.scene = s;
    this.sceneT = 0;
  }

  // ---------------- 波次 ----------------
  nextWave() {
    this.wave++;
    if (this.wave >= WAVES.length) return this.finish();
    const w = WAVES[this.wave];
    this.spawnQueue = w.enemies.map((type, i) => ({ type, at: this.frame + 50 + i * 30 }));
    this.waveActive = true;
    this.banner = { title: w.title, sub: w.sub, t: 0 };
    sfx('wave');
  }

  spawnEnemy(type) {
    this.spawnSide = -this.spawnSide;
    const x = clamp(this.spawnSide > 0 ? this.camX + VIEW_W - 70 : this.camX + 70, 60, ARENA_W - 60);
    const y = rand(20, DEPTH - 20);
    const e = new Enemy(type, x, y, this);
    e.facing = -this.spawnSide;
    this.enemies.push(e);
    this.fx.dust(x, y, 10, 1.5);
    this.fx.ring(x, y, 4, '#8a5cff', 10, 6, 18, 3);
  }

  updateWaves() {
    while (this.spawnQueue.length && this.spawnQueue[0].at <= this.frame) this.spawnEnemy(this.spawnQueue.shift().type);
    if (this.waveActive && !this.spawnQueue.length && !this.enemies.some((e) => e.alive)) {
      this.waveActive = false;
      this.waveClearAt = this.frame;
    }
    if (this.waveClearAt != null && this.frame - this.waveClearAt > 110) {
      this.waveClearAt = null;
      this.nextWave();
    }
  }

  finish() {
    const p = this.player;
    this.result = grade({ time: this.frame / 60, hpLostPct: p.dmgTaken / p.maxHp, maxCombo: this.maxCombo });
    const b = this.best;
    this.newBest = !b || this.result.total > b.total || (this.result.total === b.total && this.frame / 60 < b.time);
    if (this.newBest) {
      this.best = { letter: this.result.letter, total: this.result.total, time: this.frame / 60, maxCombo: this.maxCombo };
      saveBest(this.best);
    }
    this.setScene('clear');
    sfx('clear');
  }

  // ---------------- 命中处理：打击感集中在这里 ----------------
  applyHit(src, target, h, dir) {
    const r = target.takeHit(h, dir, this);
    if (!r) return false;
    const fromPlayer = src.team === 'player';
    const hz = target.z + target.h * 0.55;
    const hx = target.x - dir * target.w * 0.25;

    // 1. 火花 + 冲击环
    this.fx.spark(hx, target.y, hz, dir, h.heavy ? 14 : 8, fromPlayer ? '#fff1c2' : '#ff8a7a');
    this.fx.ring(hx, target.y, hz, fromPlayer ? COLORS.blade : COLORS.blood, 6, h.heavy ? 7 : 4, 10, h.heavy ? 5 : 3);
    // 2. 伤害数字
    this.fx.number(target.x, target.y, target.z + target.h + 6, r.dmg, { crit: r.crit, color: fromPlayer ? null : COLORS.blood });
    // 3. 顿帧：整个世界停住几帧，让「砍中」的瞬间被看清
    this.hitstop = Math.max(this.hitstop, (h.stop ?? 4) + (r.crit ? 2 : 0));
    // 4. 震屏
    if (h.shake) this.fx.shake(h.shake, 10 + h.shake);
    // 5. 音效
    sfx(h.heavy || r.crit ? 'heavy' : 'hit');

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
      if (r.killed) this.onKill();
    } else {
      this.fx.flash(COLORS.blood, 0.22);
      sfx('hurt');
    }
    return true;
  }

  onKill() {
    this.kills++;
    sfx('kill');
    // 清场的最后一击：慢动作 + 白闪
    if (!this.spawnQueue.length && !this.enemies.some((e) => e.alive)) {
      this.slowmo = 26;
      this.hitstop = Math.max(this.hitstop, 10);
      this.fx.flash('#ffffff', 0.35);
      this.fx.shake(10, 24);
    }
  }

  // ---------------- 每帧逻辑 ----------------
  update() {
    this.ticks++;
    this.sceneT++;
    this.fx.update();
    if (this.slowmo > 0) this.slowmo--;
    if (this.banner && ++this.banner.t > 130) this.banner = null;
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
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    this.hazards = this.hazards.filter((h) => !h.dead);
    this.enemies = this.enemies.filter((e) => !e.remove);
    if (this.focus?.remove) this.focus = null;

    // 镜头：跟随主角，略微看向前方
    const target = clamp(this.player.x - VIEW_W / 2 + this.player.facing * 60, 0, ARENA_W - VIEW_W);
    this.camX += (target - this.camX) * 0.08;

    this.updateWaves();
    if (this.player.state === 'dead' && this.player.st > 90) { this.setScene('dead'); sfx('lose'); }
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
    this.fx.drawFloor(ctx, camX);
    for (const h of this.hazards) h.drawFloor(ctx, camX);
    const actors = [this.player, ...this.enemies];
    for (const a of actors) drawShadow(ctx, a, camX);
    // 按纵深排序：靠前（y 大）的后画，挡住靠后的
    const list = [...actors, ...this.projectiles].sort((a, b) => a.y - b.y);
    for (const o of list) o.draw(ctx, camX, t);
    this.fx.draw(ctx, camX);
    this.fx.drawTexts(ctx, camX);
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
game.resize();
addEventListener('resize', () => game.resize());

if (game.touch) {
  const touchUI = document.getElementById('touch');
  touchUI.hidden = false;
  game.input.bindTouch(touchUI);
}

document.fonts?.load(`40px ${FONT_TITLE}`, '残光之刃剑士连击第一二三波力竭墓穴肃清破防裂风崩').catch(() => {});
document.fonts?.load(`40px ${FONT_NUM}`, '0123456789').catch(() => {});

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
