// 游戏主循环与场景管理
//
// 场景流程：标题 → 营地（HTML 界面）→ 地下城（一间间房间 → 首领）→ 结算 → 营地 ……
//
// 固定时间步长（Fixed Timestep）：不管显示器是 60Hz 还是 144Hz，
// 游戏逻辑都按每秒 60 次更新。这样帧数据（招式第几帧出判定）在任何设备上都一致。

import { VIEW_W, VIEW_H, world, DEPTH, COLORS, FONT_TITLE, FONT_NUM, clamp, rand } from './config.js';
import { Input } from './input.js';
import { initAudio, sfx } from './audio.js';
import { FX } from './fx.js';
import { Player } from './player.js';
import { Enemy } from './enemy.js';
import { Loot } from './loot.js';
import { STAGES, grade } from './stages.js';
import { generateDungeon, DIRS } from './dungeon.js';
import { Boss, BOSSES } from './boss.js';
import { Chest, Shrine } from './props.js';
import { SKILLS, SKILL_KEYS } from './moves.js';
import { computeStats, addXp, autoUnlock, skillMul, playerLook, BAG_MAX } from './progression.js';
import { RARITY, randomDrop, sellPrice, itemTitle } from './items.js';
import { SaveStore } from './save.js';
import { Hub } from './hub.js';
import { drawBackground, drawDoors, drawVignette, drawShadow, THEMES } from './draw.js';
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
    this.waveIdx = -1;
    this.waveActive = false;
    this.waveClearAt = null;
    this.spawnQueue = [];
    this.spawnSide = 1;
    this.banner = null;
    this.frame = 0;
    this.dungeon = null;
    this.room = null;
    this.boss = null;
    this.bossAt = null;
    this.bossDownAt = null;
    this.transition = null;
    this.roomsCleared = 0;
  }

  startStage(i) {
    this.stage = STAGES[i];
    this.refreshStats();
    this.resetWorld();
    this.dungeon = generateDungeon(this.stage);
    this.run = { xp: 0, gold: 0, items: [], ups: [], firstClear: false, ended: false };
    this.hub.hide();
    this.setScene('play');
    this.input.clearBuffer();
    this.canvas.focus();
    this.enterRoom(this.dungeon.start, null);
    const B = BOSSES[this.stage.boss];
    this.banner = { title: this.stage.name, sub: `${this.dungeon.mainLength} 个房间 · 首领「${B.name}」在地图上的「王」处`, t: 0 };
    sfx('wave');
  }

  // ---------------- 房间 ----------------
  // from：玩家是朝哪个方向走进来的（'e' = 从西边的门向东走进来）
  enterRoom(room, from) {
    this.room = room;
    room.visited = true;
    world.w = room.w;
    this.enemies = [];
    this.projectiles = [];
    this.hazards = [];
    this.loots = [];
    this.attackers.clear();
    this.focus = null;
    this.boss = null;
    this.bossAt = null;
    this.waveIdx = -1;
    this.waveActive = false;
    this.waveClearAt = null;
    this.spawnQueue = [];

    const p = this.player;
    p.vx = p.vy = 0;
    if (!from) { p.x = 200; p.y = DEPTH / 2; }
    else if (from === 'e') p.x = 70;
    else if (from === 'w') p.x = world.w - 70;
    else if (from === 'n') { p.x = world.w / 2; p.y = DEPTH - 12; }
    else if (from === 's') { p.x = world.w / 2; p.y = 12; }
    this.camX = clamp(p.x - VIEW_W / 2, 0, world.w - VIEW_W);

    // 道具房：状态记在房间上，回来时保持
    if (room.type === 'treasure') {
      this.enemies.push(new Chest(world.w / 2, DEPTH / 2, room.chestOpened));
      if (!room.chestOpened) this.toast('攻击宝箱 3 次打开它', COLORS.gold);
    }
    if (room.type === 'rest') {
      this.enemies.push(new Shrine(world.w / 2, DEPTH / 2 - 20, room.shrineUsed, () => (room.shrineUsed = true)));
      if (!room.shrineUsed) this.toast('靠近泉水恢复生命和魔力', '#6fe38a');
    }
    if (room.cleared) return;
    if (room.type === 'treasure' || room.type === 'rest') { room.cleared = true; return; }
    if (room.type === 'boss') {
      const B = BOSSES[this.stage.boss];
      this.bossAt = this.frame + 70;
      this.banner = { title: B.name, sub: B.title, t: 0, color: B.glow, boss: true };
      sfx('bossIntro');
      return;
    }
    if (room.type === 'elite') this.banner = { title: '精 英', sub: '精英怪必定掉落精良以上的装备', t: 0, color: COLORS.gold, small: true };
    this.nextWave();
  }

  nextWave() {
    this.waveIdx++;
    const waves = this.room.waves;
    if (this.waveIdx >= waves.length) return this.roomCleared();
    this.spawnQueue = waves[this.waveIdx].map((spec, i) => ({ spec, at: this.frame + 40 + i * 26 }));
    this.waveActive = true;
    if (this.waveIdx > 0) this.banner = { title: `第 ${this.waveIdx + 1} 波`, sub: '', t: 0, small: true };
  }

  roomCleared() {
    this.room.cleared = true;
    this.roomsCleared++;
    sfx('door');
    if (Object.keys(this.room.doors).length) this.toast('通道已开启', COLORS.blade);
  }

  spawnEnemy(spec) {
    const elite = spec.endsWith('*');
    this.spawnSide = -this.spawnSide;
    const x = clamp(this.spawnSide > 0 ? this.camX + VIEW_W - 70 : this.camX + 70, 60, world.w - 60);
    const y = rand(20, DEPTH - 20);
    const e = new Enemy(spec.replace('*', ''), x, y, this, { lv: this.stage.lv, elite });
    e.facing = -this.spawnSide;
    this.enemies.push(e);
    this.fx.dust(x, y, 10, 1.5);
    this.fx.ring(x, y, 4, elite ? COLORS.gold : '#8a5cff', 10, 6, 18, 3);
  }

  // Boss 召唤的小怪
  spawnMinion(type, x, y) {
    const e = new Enemy(type, x, y, this, { lv: this.stage.lv });
    e.minion = true;
    this.enemies.push(e);
    this.fx.ring(x, y, 4, '#8a5cff', 10, 6, 18, 3);
  }

  updateWaves() {
    if (this.bossAt != null && this.frame >= this.bossAt) {
      this.bossAt = null;
      this.boss = new Boss(this.stage.boss, world.w - 300, DEPTH / 2, this, this.stage.lv);
      this.boss.facing = -1;
      this.enemies.push(this.boss);
      this.fx.ring(this.boss.x, this.boss.y, 4, this.boss.B.glow, 20, 10, 30, 5);
      this.fx.shake(10, 30);
    }
    while (this.spawnQueue.length && this.spawnQueue[0].at <= this.frame) this.spawnEnemy(this.spawnQueue.shift().spec);
    if (this.waveActive && !this.spawnQueue.length && !this.enemies.some((e) => e.alive)) {
      this.waveActive = false;
      this.waveClearAt = this.frame;
      for (const l of this.loots) l.magnet = true; // 清场后，地上的东西自动飞过来
    }
    if (this.waveClearAt != null && this.frame - this.waveClearAt > 70) {
      this.waveClearAt = null;
      this.nextWave();
    }
    if (this.bossDownAt != null && this.frame - this.bossDownAt === 50) for (const l of this.loots) l.magnet = true;
    if (this.bossDownAt != null && this.frame - this.bossDownAt > 150) {
      this.bossDownAt = null;
      this.finish();
    }
  }

  // 走到打开的门口并继续往门的方向走 → 转场到隔壁房间
  checkDoors() {
    if (!this.room.cleared || this.transition || this.bossDownAt != null) return;
    const p = this.player, d = this.room.doors, inp = this.input;
    if (p.state !== 'idle' && p.state !== 'run') return;
    let dir = null;
    if (d.e && p.x >= world.w - 34 && inp.dx > 0) dir = 'e';
    else if (d.w && p.x <= 34 && inp.dx < 0) dir = 'w';
    else if (d.n && p.y <= 1 && inp.dy < 0 && Math.abs(p.x - world.w / 2) < 70) dir = 'n';
    else if (d.s && p.y >= DEPTH - 1 && inp.dy > 0 && Math.abs(p.x - world.w / 2) < 90) dir = 's';
    if (dir) { this.transition = { t: 0, dir }; sfx('dash'); }
  }

  updateTransition() {
    const tr = this.transition;
    tr.t++;
    if (tr.t === 16) {
      const [dx, dy] = DIRS[tr.dir];
      this.enterRoom(this.dungeon.get(this.room.x + dx, this.room.y + dy), tr.dir);
    }
    if (tr.t >= 32) this.transition = null;
  }

  openChest(chest) {
    this.room.chestOpened = true;
    const L = this.stage.lv;
    sfx('chest');
    this.fx.flash(COLORS.gold, 0.2);
    this.fx.ring(chest.x, chest.y, 30, COLORS.gold, 20, 8, 24, 5);
    for (let i = 0; i < 4; i++) this.loots.push(new Loot({ x: chest.x, y: chest.y, gold: Math.round(rand(8, 14) * (1 + L * 0.3)), vx: rand(-4, 4) }));
    for (let i = 0; i < 2; i++) this.dropItem(chest.x, chest.y, randomDrop(L, { minRar: 1, luck: 1 }));
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
    this.result = grade({ time: this.frame / 60, hpLostPct: p.dmgTaken / p.maxHp, maxCombo: this.maxCombo, rooms: this.dungeon.mainLength });
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

  dropItem(x, y, item) {
    this.loots.push(new Loot({ x, y, item, vx: rand(-3, 3) }));
    if (item.rar === 3) { sfx('legend'); this.fx.flash(RARITY[3].color, 0.25); this.fx.shake(6, 20); }
    else if (item.rar === 2) sfx('rare');
  }

  dropLoot(e) {
    const L = this.stage.lv;
    if (e.minion) return; // Boss 召唤的小怪不掉东西，防止刷
    const coins = e.isBoss ? 8 : e.elite ? 3 : 1;
    for (let i = 0; i < coins; i++) this.loots.push(new Loot({ x: e.x, y: e.y, gold: Math.round(rand(4, 9) * (1 + L * 0.3)) }));
    if (e.isBoss) {
      // 首领：两件稀有以上（第一关是精良以上），传说概率大幅提高
      for (let i = 0; i < 2; i++) this.dropItem(e.x, e.y, randomDrop(L, { minRar: L > 1 ? 2 : 1, luck: 2 }));
    } else if (Math.random() < (e.elite ? 1 : e.T.drop)) {
      this.dropItem(e.x, e.y, randomDrop(L, { minRar: e.elite ? 1 : 0, luck: e.elite ? 0.6 : 0 }));
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
    if (target.team === 'prop') {
      // 打宝箱：只要火花和声音
      this.fx.spark(target.x - dir * 20, target.y, 24, dir, 6, '#ffd65a');
      this.hitstop = Math.max(this.hitstop, 3);
      sfx('hit');
      return true;
    }
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
    if (e.isBoss) {
      // 首领倒下：长慢动作、所有小怪一起倒下、准备结算
      this.slowmo = 60;
      this.hitstop = Math.max(this.hitstop, 16);
      this.fx.flash('#ffffff', 0.6);
      this.fx.shake(16, 40);
      this.banner = { title: '击 破', sub: `${e.B.name} 倒下了`, t: 0, color: e.B.glow };
      for (const m of this.enemies) if (m.alive && m !== e && m.setState) { m.setState('dying'); m.vz = 6; m.z = Math.max(m.z, 0.01); }
      this.room.cleared = true;
      this.bossDownAt = this.frame;
      return;
    }
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

    if (this.transition) this.updateTransition();
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
    const target = clamp(this.player.x - VIEW_W / 2 + this.player.facing * 60, 0, world.w - VIEW_W);
    this.camX += (target - this.camX) * 0.08;

    this.updateWaves();
    this.checkDoors();
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
    drawBackground(ctx, camX, t, THEMES[this.stage && this.scene !== 'hub' ? this.stage.theme : 'crypt']);
    if (this.scene !== 'hub') {
      drawDoors(ctx, camX, this.room, t);
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
    if (this.transition) {
      const tt = this.transition.t;
      ctx.fillStyle = `rgba(5,4,8,${tt < 16 ? tt / 16 : (32 - tt) / 16})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (this.fx.flashA > 0) {
      ctx.globalAlpha = this.fx.flashA;
      ctx.fillStyle = this.fx.flashColor;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
    }

    if (this.scene === 'play') {
      drawHUD(ctx, this);
      if (this.touch) this.updateTouchCooldowns();
    }
    else if (this.scene === 'title') drawTitle(ctx, this);
    else if (this.scene === 'dead') drawDead(ctx, this);
    else if (this.scene === 'clear') drawClear(ctx, this);
    else if (this.scene === 'hub') this.hub.drawPreview(t);
  }

  // 触屏：把技能冷却直接显示在按钮上（CSS 变量驱动扇形遮罩）
  updateTouchCooldowns() {
    this.touchBtns ??= SKILL_KEYS.map((k) => document.querySelector(`.tbtn[data-action="${k}"]`));
    const p = this.player;
    SKILL_KEYS.forEach((k, i) => {
      const b = this.touchBtns[i];
      if (!b) return;
      const learned = this.save.skills[k] > 0;
      const v = Math.round((p.cd[k] > 0 ? p.cd[k] / p.cdMax[k] : 0) * 40) / 40;
      if (b._cd !== v) { b._cd = v; b.style.setProperty('--cd', v); }
      b.classList.toggle('locked', !learned);
      b.classList.toggle('nomp', learned && p.mp < SKILLS[k].mp);
    });
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
