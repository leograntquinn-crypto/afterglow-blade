// 训练场：两个打不死的木人 + 一张挑战清单
//
// 游戏里有不少「藏着的」机制（延迟连段、极限闪避、弹刀、受身、撞墙、追打倒地……），
// 只看出招表很难学会。训练场把每个机制做成一条挑战，做到了就打勾、第一次完成给金币。
// 木人默认不还手；按 T（或暂停菜单里的按钮）让它反击，用来练闪避、弹刀和受身。
import { DEPTH, COLORS, FONT_UI, FONT_NUM, FONT_TITLE } from './config.js';
import { Enemy, TYPES } from './enemy.js';
import { sfx } from './audio.js';

export const CHALLENGES = [
  { id: 'combo3', name: '三连斩', how: 'J J J' },
  { id: 'rush', name: '五连刺', how: 'J J ·停一拍· J' },
  { id: 'upper', name: '上挑追击', how: 'W+J 挑起 → K → 空中 J' },
  { id: 'air3', name: '空中三连', how: '空中 J J J' },
  { id: 'plunge', name: '坠星斩', how: '空中 S+J' },
  { id: 'otg', name: '追打倒地', how: '木人倒地时 S+J' },
  { id: 'wall', name: '撞墙反弹', how: '五连刺 / 破军把木人打到墙上' },
  { id: 'charge2', name: '破军', how: '按住 J 蓄满两段再松开' },
  { id: 'perfect', name: '极限闪避', how: '木人出刀的瞬间 L', counter: true },
  { id: 'parry', name: '弹刀', how: '木人出刀的瞬间面朝它 J', counter: true },
  { id: 'tech', name: '受身', how: '被打飞时按 K', counter: true },
  { id: 'counter', name: '破招', how: '木人举刀（红光）时抢先打中它', counter: true },
  { id: 'combo30', name: '30 连击', how: '浮空、追打、取消串起来' },
  { id: 'styleS', name: '风格 S', how: '少重复，多换招' },
  { id: 'ult', name: '残光·终焉', how: '残光槽满了按 H' },
];
const REWARD = 40, ALL_REWARD = 400;

// 木人：腐骨兵的身体，血量打不空；反击时的攻击会把人打飞（为了练受身）
const DUMMY = {
  ...TYPES.grunt, name: '训练木人', lvOff: 0, hp: 4000, xp: 0, drop: 0, lunge: null,
  atk: { ...TYPES.grunt.atk, windup: 30, cd: [90, 150], hit: { ...TYPES.grunt.atk.hit, dmg: 4, launch: 7 } },
};

export class Training {
  constructor(game) {
    this.g = game;
    this.done = new Set(game.save.training || []);
    this.flashAt = {}; // 每条挑战最近一次达成的帧，用来闪一下
    this.counter = false;
    this.log = []; // [帧, 伤害]，算每秒伤害
    this.bestCombo = 0;
  }

  spawn() {
    const g = this.g;
    g.enemies = g.enemies.filter((e) => !e.dummy);
    for (const x of [620, 1195]) {
      const e = new Enemy(DUMMY, x, DEPTH / 2, g, { lv: g.save.lv });
      e.dummy = true;
      e.home = x;
      e.hold = !this.counter;
      e.facing = -1;
      g.enemies.push(e);
    }
  }

  toggleCounter() {
    this.counter = !this.counter;
    this.g.toast(this.counter ? '木人开始反击：练极限闪避、弹刀、受身' : '木人不再反击', this.counter ? '#ff8a7a' : COLORS.blade);
    sfx('click');
  }

  event(id) {
    const g = this.g;
    this.flashAt[id] = g.frame;
    if (this.done.has(id) || !CHALLENGES.some((x) => x.id === id)) return;
    this.done.add(id);
    g.save.training = [...this.done];
    const c = CHALLENGES.find((x) => x.id === id);
    g.gainGold(REWARD);
    g.toast(`训练完成「${c.name}」 +${REWARD} 金币`, COLORS.gold);
    sfx('rank');
    if (this.done.size === CHALLENGES.length) {
      g.gainGold(ALL_REWARD);
      g.banner = { title: '出 师', sub: `训练全部完成 · +${ALL_REWARD} 金币`, t: 0, color: COLORS.gold };
    }
    g.store.save();
  }

  onDamage(d) {
    this.log.push([this.g.frame, d]);
  }

  update() {
    const g = this.g, p = g.player;
    // 训练场不会死，魔力无限，残光槽慢慢回满
    if (p.hp < p.maxHp * 0.35) p.hp = p.maxHp;
    p.mp = p.maxMp;
    if (!g.ultSeq) g.ult = Math.min(100, g.ult + 0.12);
    for (const e of g.enemies) if (e.dummy) e.hold = !this.counter;
    const cut = g.frame - 300;
    while (this.log.length && this.log[0][0] < cut) this.log.shift();
    if (g.combo >= 30) this.event('combo30');
    this.bestCombo = Math.max(this.bestCombo, g.comboDmg);
  }

  get dps() {
    return Math.round(this.log.reduce((a, [, d]) => a + d, 0) / 5);
  }
}

// 左侧的挑战清单：只列接下来要做的几条（刚完成的那条留一会儿打勾），不挡住右边的连击和风格评价
export function drawTraining(ctx, game) {
  const T = game.training;
  if (!T) return;
  const fresh = (c) => game.frame - (T.flashAt[c.id] ?? -999) < 120;
  const rows = CHALLENGES.filter((c) => !T.done.has(c.id) || fresh(c)).slice(0, game.touch ? 4 : 6);
  const w = 250, x = 14, y0 = 196, rowH = 24;
  const h = 52 + Math.max(1, rows.length) * rowH + 50;
  ctx.save();
  ctx.fillStyle = 'rgba(12,8,18,.7)';
  ctx.fillRect(x, y0, w, h);
  ctx.strokeStyle = 'rgba(232,196,120,.35)';
  ctx.strokeRect(x + 0.5, y0 + 0.5, w - 1, h - 1);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `20px ${FONT_TITLE}`;
  ctx.fillStyle = COLORS.gold;
  ctx.fillText('训练挑战', x + 12, y0 + 18);
  ctx.font = `13px ${FONT_UI}`;
  ctx.fillStyle = '#b9aec4';
  ctx.textAlign = 'right';
  ctx.fillText(`已完成 ${T.done.size} / ${CHALLENGES.length}`, x + w - 12, y0 + 18);
  ctx.textAlign = 'left';
  ctx.fillStyle = T.counter ? '#ff8a7a' : '#8f86a0';
  ctx.fillText(game.touch ? `木人反击：${T.counter ? '开' : '关'}（暂停菜单切换）` : `T 木人反击：${T.counter ? '开' : '关'}　R 重置木人`, x + 12, y0 + 38);
  if (!rows.length) {
    ctx.fillStyle = COLORS.gold;
    ctx.fillText('全部完成，已出师', x + 12, y0 + 52 + rowH / 2);
  }
  rows.forEach((c, i) => {
    const y = y0 + 52 + i * rowH + rowH / 2;
    const done = T.done.has(c.id);
    if (fresh(c)) {
      ctx.fillStyle = 'rgba(255,214,120,.16)';
      ctx.fillRect(x + 4, y - rowH / 2 + 1, w - 8, rowH - 2);
    }
    const locked = c.counter && !T.counter && !done;
    ctx.font = `15px ${FONT_UI}`;
    ctx.fillStyle = done ? COLORS.gold : locked ? '#6e6680' : '#e2d9ea';
    ctx.fillText(done ? '✓' : '○', x + 12, y);
    ctx.fillText(c.name, x + 30, y);
    ctx.font = `12px ${FONT_UI}`;
    ctx.fillStyle = locked ? '#7d6a80' : '#9a90ac';
    ctx.textAlign = 'right';
    ctx.fillText(locked ? '先开启木人反击' : c.how, x + w - 10, y + 1);
    ctx.textAlign = 'left';
  });
  const yb = y0 + 52 + Math.max(1, rows.length) * rowH + 12;
  ctx.font = `13px ${FONT_UI}`;
  ctx.fillStyle = '#b9aec4';
  ctx.fillText('每秒伤害', x + 12, yb + 2);
  ctx.fillText('单次连击最高伤害', x + 12, yb + 24);
  ctx.font = `500 20px ${FONT_NUM}`;
  ctx.fillStyle = '#fff1c2';
  ctx.textAlign = 'right';
  ctx.fillText(String(T.dps), x + w - 12, yb + 3);
  ctx.fillText(String(Math.round(T.bestCombo)), x + w - 12, yb + 25);
  ctx.restore();
}
