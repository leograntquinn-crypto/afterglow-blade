// 游戏主循环与场景管理
//
// 场景流程：标题 → 营地（HTML 界面）→ 地下城（一间间房间 → 首领）→ 结算 → 营地 ……
//
// 固定时间步长（Fixed Timestep）：不管显示器是 60Hz 还是 144Hz，
// 游戏逻辑都按每秒 60 次更新。这样帧数据（招式第几帧出判定）在任何设备上都一致。

import { VIEW_W, VIEW_H, GROUND_TOP, REDUCED_MOTION, world, DEPTH, COLORS, FONT_TITLE, FONT_NUM, clamp, rand } from './config.js';
import { Input } from './input.js';
import { initAudio, sfx } from './audio.js';
import { FX } from './fx.js';
import { Player } from './player.js';
import { Enemy } from './enemy.js';
import { AFFIXES, rollAffixes, blocks, breakGuard, onAffixDeath } from './affix.js';
import { Training } from './training.js';
import { Loot } from './loot.js';
import { STAGES, grade } from './stages.js';
import { STYLE_RANKS, STYLE_MAX } from './style.js';
import { generateDungeon, DIRS } from './dungeon.js';
import { Boss, BOSSES } from './boss.js';
import { Chest, Shrine, Urn } from './props.js';
import { SKILLS, SKILL_KEYS } from './moves.js';
import { computeStats, addXp, autoUnlock, skillMul, playerLook, BAG_MAX } from './progression.js';
import { RARITY, randomDrop, sellPrice, itemTitle } from './items.js';
import { SaveStore } from './save.js';
import { Hub } from './hub.js';
import { drawDoors, drawVignette, drawShadow } from './draw.js';
import { THEMES, drawScenery, drawFog, drawForeground } from './scenery.js';
import { Post } from './post.js';
import { music } from './music.js';
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
    this.post = new Post();
    this.quality = 2;
    this.zoom = 0; // 镜头推近量，重击时短暂变大
    this.hitLights = []; // 命中瞬间的闪光，给光照系统用
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
      music.start();
      if (a === 'mute') { this.toggleMusic(); return; }
      if (this.scene === 'play') {
        if (a === 'pause') this.setPaused(!this.paused);
        if (this.training && a === 'trainToggle') this.training.toggleCounter();
        if (this.training && a === 'trainReset') this.training.spawn();
        return;
      }
      if (a === 'attack' || a === 'start' || a === 'jump') this.advance();
    });
    canvas.addEventListener('pointerdown', () => {
      canvas.focus();
      initAudio();
      music.start();
      this.advance();
    });
    this.pauseEl.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'resume') this.setPaused(false);
      if (act === 'retreat') { this.setPaused(false); this.endRun(); this.openHub(); }
      if (act === 'train-counter' && this.training) { this.training.toggleCounter(); this.setPaused(false); }
      if (act === 'train-reset' && this.training) { this.training.spawn(); this.setPaused(false); }
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

  toggleMusic() {
    const muted = music.toggleMute();
    if (this.scene === 'hub') this.hub.render();
    else this.toast(muted ? '音乐已关闭（M 键开关）' : '音乐已开启', COLORS.ink);
  }

  setPaused(v) {
    this.paused = v;
    music.setDuck(v);
    this.pauseEl.hidden = !v;
    for (const el of this.pauseEl.querySelectorAll('.train-only')) el.hidden = !this.training;
    for (const el of this.pauseEl.querySelectorAll('.run-only')) el.hidden = !!this.training;
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
    this.seenAffix ??= new Set(); // 本次游戏里已经提示过的词缀
    this.loots = [];
    this.toasts = [];
    this.attackers = new Set();
    this.fx = new FX();
    this.hitstop = 0;
    this.slowmo = 0;
    this.camX = 0;
    this.combo = 0;
    this.comboDmg = 0;
    this.comboT = 0;
    this.style = { pts: 0, rank: 0, peak: 0, recent: [], pop: 0, idle: 0 };
    this.ult = 0;          // 残光槽 0~100
    this.ultReadyShown = false;
    this.ultSeq = null;    // 必杀演出进行中
    this.witch = 0;        // 极限闪避后的子弹时间（敌人变慢）
    this.counterT = 0;     // 反击加成剩余帧数
    this.camKick = 0;      // 镜头朝命中方向的推动
    this.impactUntil = 0;  // 冲击帧（反色）持续到哪一帧
    this.maxAttackers = 2;
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
    this.training = null;
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

  // 训练场：一个没有门的长房间 + 两个打不死的木人（右边那个靠墙，练撞墙反弹）
  startTraining() {
    this.stage = { ...STAGES[0], id: 'training', name: '训练场', lv: this.save.lv };
    this.refreshStats();
    this.resetWorld();
    const room = { x: 0, y: 0, type: 'training', doors: {}, w: 1300, waves: [], cleared: true, visited: true };
    this.dungeon = { rooms: new Map([['0,0', room]]), start: room, mainLength: 1, get: (x, y) => (x === 0 && y === 0 ? room : undefined) };
    this.run = { xp: 0, gold: 0, items: [], ups: [], firstClear: false, ended: false, training: true };
    this.training = new Training(this);
    this.hub.hide();
    this.setScene('play');
    this.input.clearBuffer();
    this.canvas.focus();
    this.enterRoom(room, null);
    this.training.spawn();
    this.banner = { title: '训 练 场', sub: '完成右边的挑战 · 第一次完成有金币奖励 · Esc 返回营地', t: 0 };
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
    // 战斗房间里随机摆几个陶罐（打碎过的不会再出现）
    if (room.type === 'fight' || room.type === 'elite') {
      room.urns ??= Array.from({ length: 2 + Math.floor(Math.random() * 3) }, () => ({ x: rand(120, room.w - 120), y: rand(4, 40), broken: false, variant: Math.random() < 0.5 }));
      for (const spot of room.urns) if (!spot.broken) this.enemies.push(new Urn(spot));
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
    const type = spec.replace('*', '');
    const affixes = rollAffixes(type, elite, STAGES.indexOf(this.stage));
    const e = new Enemy(type, x, y, this, { lv: this.stage.lv, elite, affixes });
    // 第一次遇到某个词缀时提示打法
    for (const k of affixes) if (!this.seenAffix.has(k)) { this.seenAffix.add(k); this.toast(`${AFFIXES[k].name}：${AFFIXES[k].tip}`, AFFIXES[k].color); }
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

  breakUrn(u, dir) {
    this.fx.chips(u.x, u.y, 20, dir, 16, '#8a5a3a');
    this.fx.chips(u.x, u.y, 20, -dir, 6, '#b07a4e');
    this.fx.dust(u.x, u.y, 8, 1.4);
    sfx('pot');
    const L = this.stage.lv;
    for (let i = 0; i < 2; i++) this.loots.push(new Loot({ x: u.x, y: u.y, gold: Math.round(rand(3, 6) * (1 + L * 0.3)), vx: rand(-3, 3) }));
    if (Math.random() < 0.28) this.loots.push(new Loot({ x: u.x, y: u.y, heal: 0.1, vx: rand(-2, 2) }));
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
    if (this.run.training) { this.run.ended = true; this.training = null; this.store.save(); return; }
    this.run.ended = true;
    this.save.runs++;
    this.store.save();
  }

  finish() {
    const p = this.player, st = this.stage, s = this.save;
    this.result = grade({ time: this.frame / 60, hpLostPct: p.dmgTaken / p.maxHp, maxCombo: this.maxCombo, rooms: this.dungeon.mainLength, style: this.style.peak });
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
    if (loot.heal) {
      const n = Math.round(p.maxHp * loot.heal);
      p.hp = Math.min(p.maxHp, p.hp + n);
      this.fx.label(p.x, p.y, p.z + 100, `+${n}`, '#6fe38a', 20);
      this.fx.ring(p.x, p.y, 40, '#6fe38a', 12, 6, 14, 3);
      sfx('heal');
      return;
    }
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

  // ---------------- 风格评价（D → SSS）----------------
  addStyle(pts, tag) {
    const S = this.style;
    const rep = S.recent.filter((x) => x === tag).length;
    const mul = rep === 0 ? 1.25 : rep === 1 ? 0.9 : rep === 2 ? 0.55 : 0.25;
    S.recent.push(tag);
    if (S.recent.length > 8) S.recent.shift();
    S.pts = Math.min(STYLE_MAX, S.pts + pts * mul);
    S.idle = 0;
    this.updateRank();
    if (tag === 'tech') this.tr('tech');
  }

  styleHit() {
    const S = this.style;
    if (S.rank <= 0 && S.pts <= 0) return;
    S.pts = STYLE_RANKS[Math.max(0, S.rank - 2)].at;
    this.updateRank();
    sfx('rankDown');
  }

  updateRank() {
    const S = this.style;
    let r = 0;
    for (let i = 0; i < STYLE_RANKS.length; i++) if (S.pts >= STYLE_RANKS[i].at) r = i;
    if (r > S.rank) { S.pop = 22; sfx('rank'); }
    S.rank = r;
    S.peak = Math.max(S.peak, r);
    if (r >= 4) this.tr('styleS');
    this.maxAttackers = 2 + (r >= 4 ? 1 : 0); // 打得越好，敌人越凶
  }

  addUlt(n) {
    if (this.ultSeq) return;
    this.ult = Math.min(100, this.ult + n);
    if (this.ult >= 100 && !this.ultReadyShown) {
      this.ultReadyShown = true;
      this.toast(this.touch ? '残光已满 · 点「觉」释放' : '残光已满 · 按 H 释放', '#ffd65a');
      sfx('ultReady');
    }
  }

  // ---------------- 极限闪避 → 子弹时间 + 反击 ----------------
  // 训练场挑战：机制触发时打勾（不在训练场时什么也不做）
  tr(id) {
    this.training?.event(id);
  }

  perfectDodge() {
    this.tr('perfect');
    const p = this.player;
    p.invuln = Math.max(p.invuln, 24);
    if (this.witch > 0) return;
    this.witch = 150;
    this.counterT = 170;
    this.hitstop = Math.max(this.hitstop, 6);
    this.fx.ring(p.x, p.y, p.z + 45, '#ffffff', 20, 14, 22, 5);
    this.fx.ring(p.x, p.y, p.z + 45, p.glow, 30, 18, 28, 3);
    this.fx.flash(p.glow, 0.25);
    this.fx.label(p.x, p.y, p.z + 130, '极 限 闪 避', '#ffffff', 30);
    if (!REDUCED_MOTION) this.zoom = Math.max(this.zoom, 0.06);
    this.addStyle(220, 'perfect');
    this.addUlt(12);
    sfx('witch');
  }

  // 天花板落下碎石（重击、撞墙、砸地时）
  debris(n) {
    for (let i = 0; i < n; i++) {
      const y = rand(0, DEPTH);
      this.fx.chips(this.camX + rand(20, VIEW_W - 20), y, GROUND_TOP + y + rand(0, 40), Math.random() < 0.5 ? -1 : 1, 1, '#4a4050');
    }
  }

  parry(e) {
    this.tr('parry');
    const p = this.player, dir = Math.sign(e.x - p.x) || p.facing;
    this.impactUntil = this.ticks + 2;
    const mx = (p.x + e.x) / 2, mz = 60;
    p.invuln = Math.max(p.invuln, 12);
    this.counterT = Math.max(this.counterT, 90);
    this.hitstop = Math.max(this.hitstop, 10);
    this.fx.spark(mx, p.y, mz, 1, 14, '#ffffff');
    this.fx.spark(mx, p.y, mz, -1, 14, '#fff1c2');
    this.fx.ring(mx, p.y, mz, '#ffffff', 8, 10, 14, 5);
    this.fx.flash('#ffffff', 0.2);
    this.fx.shake(8, 14);
    this.hitLights.push({ x: mx, y: p.y, z: mz, r: 300, life: 8 });
    this.fx.label(mx, p.y, mz + 70, '弹 刀', '#ffffff', 30);
    if (!REDUCED_MOTION) this.zoom = Math.max(this.zoom, 0.05);
    sfx('parry');
    this.addStyle(170, 'parry');
    this.addUlt(8);
    if (e.isBoss) {
      // 首领：削掉三分之一霸体，削空就破防
      e.armor -= e.maxArmor * 0.35;
      if (e.armor <= 0) { e.armor = 0; e.brokenT = 240; e.setState('hurt'); e.hitstun = 60; this.fx.label(e.x, e.y, e.h + 40, '破 防 !', COLORS.ember, 32); }
      else e.vx = dir * 3;
    } else {
      if (e.armor > 0) { e.armor = 0; e.brokenT = 220; this.fx.label(e.x, e.y, e.h + 40, '破 防 !', COLORS.ember, 30); }
      breakGuard(e);
      e.setState('hurt');
      e.hitstun = 55;
      e.vx = dir * 4;
      e.flash = 6;
    }
  }

  // ---------------- 撞墙 / 坠星冲击 / 弹球 ----------------
  onWallBounce(e) {
    this.tr('wall');
    const wx = e.x < world.w / 2 ? 10 : world.w - 10;
    this.debris(8);
    this.fx.crack(wx, e.y);
    this.fx.dust(wx, e.y, 14, 2);
    this.fx.ring(wx, e.y, e.z + 40, COLORS.ember, 10, 10, 16, 5);
    this.fx.chips(wx, e.y, e.z + 50, -Math.sign(e.vx) || 1, 10, '#9a8a7a');
    this.fx.shake(10, 18);
    this.hitstop = Math.max(this.hitstop, 6);
    this.fx.label(e.x, e.y, e.z + e.h + 30, '撞 墙', COLORS.ember, 24);
    this.addStyle(90, 'wall');
    sfx('heavy');
  }

  plungeImpact(p) {
    this.tr('plunge');
    this.fx.ring(p.x, p.y, 4, p.glow, 20, 12, 18, 6);
    this.fx.ring(p.x, p.y, 4, '#ffffff', 10, 9, 12, 3);
    this.fx.dust(p.x, p.y, 20, 2.6);
    this.fx.crack(p.x, p.y);
    this.fx.shake(10, 18);
    this.hitLights.push({ x: p.x, y: p.y, z: 20, r: 300, life: 8 });
    sfx('heavy');
    const h = { dmg: 18, kb: 4, launch: 7.5, otg: true, stop: 7, shake: 8, heavy: true, styleTag: 'plungeWave' };
    for (const e of this.enemies) {
      if (Math.abs(e.x - p.x) < 135 && Math.abs(e.y - p.y) < 46 && e.z < 70) this.applyHit(p, e, h, Math.sign(e.x - p.x) || p.facing);
    }
  }

  pinball() {
    for (const a of this.enemies) {
      if (!a.flying || Math.abs(a.vx) < 4 || a.team === 'prop') continue;
      for (const b of this.enemies) {
        if (b === a || !b.alive || b.team === 'prop' || b.isBoss || a.pinSet.has(b) || this.frame < (b.pinCd ?? 0)) continue;
        if (Math.abs(a.x - b.x) < (a.w + b.w) * 0.5 && Math.abs(a.y - b.y) < 24 && Math.abs(a.z - b.z) < 70) {
          a.pinSet.add(b);
          b.pinCd = this.frame + 40; // 同一个敌人 40 帧内只会被撞一次，避免挤在一起时刷屏
          const h = { dmg: 6 + (a.flyDmg || 10) * 0.35, kb: 7, launch: 4.5, stun: 24, stop: 5, shake: 6, styleTag: 'pinball' };
          if (this.applyHit(this.player, b, h, Math.sign(a.vx))) {
            a.vx *= 0.75;
            if (this.frame >= (this.pinLabelAt ?? 0)) {
              this.pinLabelAt = this.frame + 24;
              this.fx.label(b.x, b.y, b.z + b.h + 30, '撞 击', COLORS.ember, 20);
            }
          }
        }
      }
    }
  }

  // ---------------- 残光·终焉（必杀）----------------
  startUltimate() {
    this.tr('ult');
    const p = this.player;
    this.ult = 0;
    this.ultReadyShown = false;
    p.move = null;
    p.setState('ult');
    p.invuln = 999;
    this.ultSeq = { t: 0, i: 0, home: { x: p.x, y: p.y } };
    this.fx.flash('#ffffff', 0.35);
    sfx('ultStart');
  }

  updateUltimate() {
    const U = this.ultSeq, p = this.player;
    U.t++;
    const onScreen = () => this.enemies.filter((e) => e.alive && e.team !== 'prop' && e.x > this.camX - 40 && e.x < this.camX + VIEW_W + 40);
    if (U.t >= 52 && U.t < 128 && U.t % 6 === 0) {
      // 瞬身连斩：在画面内的敌人之间来回穿梭
      const list = onScreen();
      const e = list.length ? list[U.i++ % list.length] : null;
      for (let g = 0; g < 2; g++) p.addGhost();
      if (e) {
        const side = U.i % 2 ? 1 : -1;
        p.x = clamp(e.x - side * 70, 40, world.w - 40);
        p.y = e.y;
        p.facing = side;
        p.ultPose = U.i % 2 ? -2.2 : 1.2;
        const a0 = -2.6 + Math.random() * 1.4;
        this.fx.arc(e.x, e.y, e.z + e.h * 0.55, side, 70 + Math.random() * 30, a0, a0 + 2.8, p.glow, 16, 10);
        this.applyHit(p, e, { dmg: 20, kb: 0.3, stun: 80, stop: 2, shake: 4, ult: true, styleTag: 'ult' }, side);
      } else {
        p.x = clamp(p.x + (Math.random() - 0.5) * 300, 60, world.w - 60);
        this.fx.arc(p.x, p.y, 60, 1, 80, -2.4, 0.6, p.glow, 16, 10);
      }
      sfx('swing');
    }
    if (U.t === 136) {
      p.x = clamp(this.camX + VIEW_W / 2, 60, world.w - 60);
      p.ultPose = -2.9;
    }
    if (U.t === 150) {
      // 终结：全屏斩
      p.ultPose = 1.4;
      this.fx.flash('#ffffff', 0.8);
      for (let i = 0; i < 3; i++) this.fx.ring(p.x, p.y, 50, i ? p.glow : '#ffffff', 30 + i * 20, 22 - i * 4, 26 + i * 6, 7);
      this.fx.shake(20, 40);
      if (!REDUCED_MOTION) this.zoom = 0.08;
      sfx('quake');
      for (const e of onScreen()) {
        e.invuln = 0;
        this.applyHit(p, e, { dmg: 110, kb: 9, launch: 13, stop: 18, shake: 18, heavy: true, radial: true, ult: true, wallBounce: true, styleTag: 'ultEnd' }, Math.sign(e.x - p.x) || 1);
      }
      this.slowmo = 36;
      this.impactUntil = this.ticks + 3;
      this.debris(14);
    }
    if (U.t >= 175) {
      this.ultSeq = null;
      p.ultPose = null;
      p.setState('idle');
      p.invuln = 40;
    }
  }

  // ---------------- 伤害计算 ----------------
  calcDamage(src, target, h) {
    let dmg = h.dmg * (0.92 + Math.random() * 0.16);
    let crit = false;
    if (src.team === 'player') {
      const S = this.stats;
      dmg *= S.atk / 20; // 20 = 1 级的攻击力，招式表里的伤害以它为基准
      dmg *= h.skill ? skillMul(S, h.skill) : h.ult ? 1.4 + this.save.lv * 0.05 : S.normalMul;
      crit = Math.random() < S.crit || this.counterT > 0; // 极限闪避后的反击必定暴击
      if (crit) dmg *= S.critDmg;
      if (this.counterT > 0) dmg *= 1.35;
      if (target.brokenT > 0) dmg *= 1.3;
      if (target.state === 'down') dmg *= 0.6; // 追打倒地伤害打折
    } else {
      dmg *= (src.owner || src).dmgMul ?? 1;
      dmg *= 100 / (100 + this.stats.def); // 防御减伤：100 防御 = 伤害减半
    }
    return { dmg: Math.max(1, Math.round(dmg)), crit };
  }

  // ---------------- 命中处理：打击感集中在这里 ----------------
  applyHit(src, target, h, dir) {
    // 极限闪避：闪避刚开始的几帧里「本该被打中」→ 不受伤，触发子弹时间
    if (target === this.player && src.team !== 'player' && target.inPerfectWindow()) {
      this.perfectDodge();
      return false;
    }
    // 弹刀：敌人的近战攻击打到你时，你正好在出刀的前 8 帧、而且面朝对方 → 把这一刀弹开
    if (target === this.player && src instanceof Enemy && target.state === 'attack' && target.move && !target.move.air
      && target.mf <= 8 && Math.sign(src.x - target.x) === target.facing) {
      this.parry(src);
      return false;
    }
    if (target.canBeHit && !target.canBeHit(h)) return false;
    // 坚盾：正面挡住普通攻击（不扣血），火花 + 金属声，把玩家轻轻弹开
    if (src.team === 'player' && blocks(target, src, h)) {
      const hz = target.z + target.h * 0.55, hx = target.x + target.facing * target.w * 0.5;
      this.fx.spark(hx, target.y, hz, -target.facing, 10, '#cfe6ff');
      this.fx.ring(hx, target.y, hz, AFFIXES.shield.color, 6, 5, 10, 3);
      target.shakeUntil = this.ticks + 4;
      target.shakeAmp = 2;
      this.hitstop = Math.max(this.hitstop, 3);
      if (src === this.player) this.player.vx = target.facing * 2.5; // 玩家在盾的正前方，往外推
      if (this.frame - (this.blockLabelAt ?? -99) > 40) {
        this.blockLabelAt = this.frame;
        this.fx.label(target.x, target.y, target.z + target.h + 30, '格挡', AFFIXES.shield.color, 20);
      }
      sfx('hitMetal');
      return true;
    }
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
    // 材质碎片：骷髅掉骨渣、屠夫冒金属火星、弓手掉布屑
    const chip = target.look?.bone || target.look?.cloak || target.look?.metal || '#cfc3ad';
    this.fx.chips(hx, target.y, hz, dir, h.heavy ? 9 : 4, chip);
    if (fromPlayer && h.heavy) this.camKick += dir * 9;
    // 斩痕：沿挥砍方向的一道锐利白线
    if (fromPlayer && (src.move || h.ult)) {
      const sw = src.move?.swing;
      let ang = h.ult ? (Math.random() - 0.5) * 2.4 : !sw || Math.abs(sw[1] - sw[0]) < 0.2 ? (Math.random() - 0.5) * 0.2 : (sw[1] > sw[0] ? 0.62 : -0.62);
      if (dir < 0) ang = Math.PI - ang;
      this.fx.cut(target.x, target.y, hz, ang + (Math.random() - 0.5) * 0.3, h.heavy ? 170 : 110, this.player.glow);
    }
    // 受击闪白只持续 3 个真实帧（不受顿帧影响），之后露出原样配合抖动
    target.flashUntil = this.ticks + 3;
    // 受击抖动：顿帧期间被打中的一方原地颤动
    target.shakeUntil = this.ticks + (h.stop ?? 4) + 3;
    target.shakeAmp = h.heavy ? 5 : 3;
    // 冲击帧 + 天花板落石
    if (fromPlayer && (h.stop ?? 0) >= 11) this.impactUntil = this.ticks + 2;
    if ((h.shake ?? 0) >= 9) this.debris(h.shake >= 14 ? 10 : 5);
    // 2. 伤害数字
    this.fx.number(target.x, target.y, target.z + target.h + 6, dmg, { crit, color: fromPlayer ? null : COLORS.blood });
    // 3. 顿帧：整个世界停住几帧，让「砍中」的瞬间被看清
    this.hitstop = Math.max(this.hitstop, (h.stop ?? 4) + (crit ? 2 : 0));
    // 4. 震屏 + 命中闪光 + 重击时镜头轻推
    if (h.shake) this.fx.shake(h.shake, 10 + h.shake);
    this.hitLights.push({ x: hx, y: target.y, z: hz, r: h.heavy ? 280 : 180, life: 8 });
    if (fromPlayer && (h.heavy || crit) && !REDUCED_MOTION) this.zoom = Math.max(this.zoom, h.heavy ? 0.045 : 0.025);
    // 5. 音效：通用的「打中」+ 材质层（骨头脆响 / 金属鸣响 / 布料闷响）
    sfx(h.heavy || crit ? 'heavy' : 'hit');
    const rig = target.look?.rig;
    sfx(rig === 'grunt' ? 'hitBone' : rig === 'archer' ? 'hitCloth' : 'hitMetal');

    if (fromPlayer) {
      // 风格评价：伤害越高、越在空中、越是新的招式，分越高；反复用同一招分数递减
      const tag = h.styleTag || src.styleTag || src.move?.id || 'misc';
      let pts = 10 + h.dmg * 0.9;
      if (target.z > 20) pts *= 1.35;
      if (r.otg) pts += 12;
      if (this.counterT > 0) pts *= 1.6;
      this.addStyle(pts, tag);
      this.addUlt(h.skill ? 0.45 : h.ult ? 0 : 0.8);
      this.combo++;
      this.comboDmg += dmg;
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
      if (this.training) {
        const id = src.move?.id;
        this.training.onDamage(dmg);
        if (id === 'slash3') this.tr('combo3');
        if (id === 'rush' && h.wallBounce) this.tr('rush');
        if (id?.startsWith('airSlash') && target.juggle >= 2) this.tr('upper');
        if (id === 'airSlash3') this.tr('air3');
        if (id === 'plunge' || id === 'plungeLand') this.tr('plunge');
        if (r.otg) this.tr('otg');
        if (id === 'chargeSlash2') this.tr('charge2');
      }
    } else {
      this.fx.flash(COLORS.blood, 0.22);
      sfx('hurt');
      this.styleHit();
      this.addUlt(4);
    }
    return true;
  }

  onKill(e) {
    this.kills++;
    sfx('kill');
    this.addUlt(2.5);
    this.addStyle(40, 'kill');
    this.fx.chips(e.x, e.y, e.z + e.h * 0.5, Math.sign(e.vx) || 1, 18, e.look?.bone || e.look?.cloak || e.look?.metal || '#cfc3ad');
    this.gainXp(e.xp);
    this.fx.label(e.x, e.y, e.z + e.h + 50, `+${e.xp} EXP`, '#c8b6ff', 16);
    this.dropLoot(e);
    onAffixDeath(e, this);
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
    music.setMode(this.scene === 'play' ? (this.boss?.alive ? 'boss' : this.enemies.some((e) => e.alive) ? 'battle' : 'calm')
      : this.scene === 'title' || this.scene === 'hub' ? this.scene : 'calm');
    if (this.paused) return;
    this.sceneT++;
    this.fx.update();
    this.zoom *= 0.86;
    for (const hl of this.hitLights) hl.life--;
    this.hitLights = this.hitLights.filter((hl) => hl.life > 0);
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
    if (this.comboT > 0 && --this.comboT === 0) { this.combo = 0; this.comboDmg = 0; }

    // 风格分随时间衰减，越高的评级掉得越快；一段时间没命中衰减加倍
    const S = this.style;
    S.idle++;
    if (S.pop > 0) S.pop--;
    if (S.pts > 0) {
      S.pts = Math.max(0, S.pts - (0.5 + S.rank * 0.32) * (S.idle > 90 ? 2.2 : 1));
      this.updateRank();
    }
    if (this.counterT > 0) this.counterT--;
    this.camKick *= 0.8;

    // 必杀演出期间：敌人全部定格
    if (this.ultSeq) this.updateUltimate();
    // 子弹时间：敌人和敌方弹道只在每 4 帧里动 1 帧
    const enemyTick = !this.ultSeq && (this.witch <= 0 || this.frame % 4 === 0);
    if (this.witch > 0) this.witch--;

    this.player.update(this);
    for (const e of this.enemies) if (enemyTick || e.team === 'prop') e.update(this);
    this.training?.update();
    this.separate();
    this.pinball();
    for (const p of this.projectiles) if (enemyTick || p.team === 'player') p.update(this);
    if (enemyTick) for (const h of this.hazards) h.update(this);
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
    const ctx = this.ctx, camX = this.camX, t = this.ticks, post = this.post;
    const themeName = this.stage && (this.scene === 'play' || this.scene === 'clear' || this.scene === 'dead') ? this.stage.theme : 'crypt';
    const th = THEMES[themeName];
    const inWorld = this.scene !== 'hub';
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);

    // 世界层的变换：震屏 + 以主角为中心的镜头推近
    let [ox, oy] = this.fx.shakeOffset();
    ox += this.camKick;
    const z = 1 + this.zoom;
    const fx0 = this.player.x - camX, fy0 = GROUND_TOP + this.player.y - 40;
    const rot = this.fx.rot;
    const view = (c) => { c.translate(ox, oy); c.translate(fx0, fy0); c.rotate(rot); c.scale(z, z); c.translate(-fx0, -fy0); };
    const toView = (x, y) => [(x - fx0) * z + fx0 + ox, (y - fy0) * z + fy0 + oy];
    const at = (wx, wy, wz = 0) => toView(wx - camX, GROUND_TOP + wy - wz);

    // 1. 场景 + 角色
    ctx.save();
    view(ctx);
    const torches = drawScenery(ctx, camX, t, themeName);
    if (inWorld) {
      drawDoors(ctx, camX, this.room, t);
      this.fx.drawFloor(ctx, camX);
      for (const h of this.hazards) h.drawFloor(ctx, camX);
      const actors = this.scene === 'title' ? [] : [this.player, ...this.enemies];
      for (const a of actors) drawShadow(ctx, a, camX);
      // 按纵深排序：靠前（y 大）的后画，挡住靠后的
      const list = [...actors, ...this.projectiles, ...this.loots].sort((a, b) => a.y - b.y);
      for (const o of list) o.draw(ctx, camX, t);
    }
    if (this.quality > 0) drawFog(ctx, camX, t, themeName);
    ctx.restore();

    // 2. 光照：收集这一帧的所有光源，然后压暗其余部分
    for (const [tx, ty, fl] of torches) post.addLight(...toView(tx, ty), 240 * fl, 0.8);
    if (inWorld) {
      const p = this.player;
      post.addLight(...at(p.x, p.y, p.z + 45), 270, 0.95);
      for (const e of this.enemies) {
        if (e.isBoss && e.alive) post.addLight(...at(e.x, e.y, e.h * 0.5), 230, 0.7);
        else if (e.alive || e.team === 'prop') post.addLight(...at(e.x, e.y, 40), 120, 0.45);
      }
      for (const h of this.hazards) post.addLight(...at(h.x, h.y), (h.rx || 140) * 1.5, 0.6);
      for (const pr of this.projectiles) post.addLight(...at(pr.x, pr.y, pr.z + 30), 110, 0.8);
      for (const l of this.loots) post.addLight(...at(l.x, l.y, 20), l.item ? 70 + l.item.rar * 30 : 50, 0.65);
      for (const hl of this.hitLights) post.addLight(...at(hl.x, hl.y, hl.z), hl.r, hl.life / 8);
      if (this.room?.cleared) {
        if (this.room.doors.e) post.addLight(...at(world.w - 40, DEPTH / 2), 200, 0.7);
        if (this.room.doors.w) post.addLight(...at(40, DEPTH / 2), 200, 0.7);
      }
    }
    if (this.scene === 'title') post.addLight(VIEW_W * 0.3, 360, 340, 1);
    post.applyLighting(ctx, th.ambient);

    // 3. 自发光的特效画在黑暗之上，再加泛光
    if (inWorld) {
      const g = post.beginGlow(view);
      this.player.drawTrail(g, camX);
      this.fx.draw(g, camX, true);
      for (const pr of this.projectiles) pr.draw(g, camX, t);
      for (const l of this.loots) if (l.item) l.draw(g, camX, t);
      ctx.save();
      view(ctx);
      this.player.drawTrail(ctx, camX);
      this.fx.draw(ctx, camX);
      ctx.restore();
      if (this.quality > 0) post.applyBloom(ctx);
      ctx.save();
      view(ctx);
      this.fx.drawTexts(ctx, camX);
      ctx.restore();
    }

    // 4. 前景、暗角、调色、颗粒
    ctx.save();
    view(ctx);
    drawForeground(ctx, camX, t, themeName);
    ctx.restore();
    drawVignette(ctx);
    post.applyGrade(ctx, th.grade, t, this.quality > 1);
    // 子弹时间：画面去色 + 冷色调，边缘有缓慢脉动的光圈
    if (this.witch > 0 && this.scene === 'play') {
      const a = Math.min(1, this.witch / 20, (150 - this.witch) / 8 + 0.2);
      ctx.save();
      ctx.globalCompositeOperation = 'saturation';
      ctx.globalAlpha = 0.65 * a;
      ctx.fillStyle = 'hsl(0,0%,50%)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = 0.5 * a;
      ctx.fillStyle = '#3a7aff';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalCompositeOperation = 'source-over';
      const edge = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.45, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.9);
      edge.addColorStop(0, 'rgba(127,243,255,0)');
      edge.addColorStop(1, `rgba(127,243,255,${0.22 * a * (0.7 + 0.3 * Math.sin(t * 0.15))})`);
      ctx.globalAlpha = 1;
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.restore();
    }
    // 必杀演出时世界压暗，只有剑光亮着
    if (this.ultSeq && this.ultSeq.t < 150) {
      ctx.fillStyle = `rgba(4,2,8,${Math.min(0.55, this.ultSeq.t / 20)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    if (this.transition) {
      const tt = this.transition.t;
      ctx.fillStyle = `rgba(5,4,8,${tt < 16 ? tt / 16 : (32 - tt) / 16})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (this.fx.flashA > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.fx.flashA * 0.8;
      ctx.fillStyle = this.fx.flashColor;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.restore();
    }

    // 冲击帧：极重的一击让画面反色 2 帧（动画里常用的手法）
    if (this.ticks < this.impactUntil && !REDUCED_MOTION) {
      ctx.save();
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.restore();
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

  // 运行时错误：记录到控制台（每种错误只报一次），然后继续跑，不让整个游戏冻住
  reportError(err) {
    this.errors ??= new Set();
    const key = String(err?.message);
    if (this.errors.has(key)) return;
    this.errors.add(key);
    console.error('[残光之刃] 运行时错误：', err);
  }

  // 画质：2 高（原生分辨率）/ 1 中（最高 1280 宽，关颗粒）/ 0 低（960 宽，关雾和泛光）
  // 帧率持续偏低时自动降一档
  resize() {
    const stage = this.canvas.parentElement;
    const s = Math.min(stage.clientWidth / VIEW_W, stage.clientHeight / VIEW_H);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const maxW = [960, 1280, 3840][this.quality ?? 2];
    const w = Math.min(Math.round(VIEW_W * s * dpr), maxW);
    this.canvas.style.width = `${VIEW_W * s}px`;
    this.canvas.style.height = `${VIEW_H * s}px`;
    this.canvas.width = w;
    this.canvas.height = Math.round((w * VIEW_H) / VIEW_W);
    this.scale = w / VIEW_W;
  }

  watchPerf(dt) {
    this.frameEma = this.frameEma == null ? 16 : this.frameEma * 0.95 + dt * 0.05;
    this.perfT = (this.perfT || 0) + 1;
    if (this.perfT > 150 && this.frameEma > 24 && this.quality > 0) {
      this.quality--;
      this.perfT = 0;
      this.resize();
    }
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
  // 先预约下一帧：就算这一帧出了错，游戏也不会整个停住
  requestAnimationFrame(frame);
  const dt = Math.min(100, now - last);
  last = now;
  if (!document.hidden) game.watchPerf(dt);
  acc += dt * (game.slowmo > 0 ? 0.3 : 1);
  let steps = 0;
  try {
    while (acc >= STEP && steps < 5) {
      game.update();
      acc -= STEP;
      steps++;
    }
    if (steps === 5) acc = 0;
    game.render();
  } catch (err) {
    acc = 0;
    game.reportError(err);
  }
}
requestAnimationFrame(frame);
