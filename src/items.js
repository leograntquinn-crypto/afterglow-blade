// 装备系统：品质、随机词条、强化、出售
//
// 设计思路：每件装备 = 基础属性（由部位和物品等级决定）+ 随机词条（数量由品质决定）
// 品质越高，基础属性倍率越高、词条越多。这就是 DNF/暗黑类游戏「刷装备」的核心循环。

import { rand } from './config.js';

export const RARITY = [
  { name: '普通', color: '#d8d3c8', mul: 1.0, w: 62 },
  { name: '精良', color: '#4fa3ff', mul: 1.15, w: 27 },
  { name: '稀有', color: '#b46bff', mul: 1.32, w: 9 },
  { name: '传说', color: '#ff9a2e', mul: 1.55, w: 2 },
];

export const SLOT_KEYS = ['weapon', 'helm', 'armor', 'ring'];
export const SLOT_NAME = { weapon: '武器', helm: '头盔', armor: '护甲', ring: '戒指' };
const SLOT_GLYPH = { helm: '盔', armor: '甲', ring: '戒' };

// 武器类型：影响攻击力倍率、外观长度，太刀自带暴击
// 武器类型 = 流派：除了数值，每种武器还有一个改变打法的特性（school），绯隼的动作不变
//   长剑「游刃」预判流：破招 / 极限闪避 / 弹刀回转的技能冷却翻倍
//   太刀「疾斩」手速流：普攻和技能的取消窗口提前 3 帧
//   巨剑「崩山」破甲流：削霸体 ×1.6，普攻破招也能直接打断有霸体的杂兵
export const WTYPES = {
  sword: { name: '长剑', glyph: '剑', atkMul: 1.0, len: 64, school: '游刃', schoolDesc: '破招、极限闪避、弹刀成功时，技能冷却回转 3 秒（其他武器 1.5 秒）' },
  katana: { name: '太刀', glyph: '刀', atkMul: 0.92, len: 72, crit: 0.04, school: '疾斩', schoolDesc: '普攻和技能的取消窗口提前 3 帧，连段更快' },
  great: { name: '巨剑', glyph: '巨', atkMul: 1.18, len: 70, school: '崩山', schoolDesc: '削霸体 ×1.6；普攻破招也能直接打断有霸体的敌人' },
};

const TIER_NAMES = {
  sword: ['铁剑', '青钢剑', '寒铁剑', '玄纹长剑', '星陨剑'],
  katana: ['打刀', '霜纹太刀', '月影太刀', '鬼切', '天羽太刀'],
  great: ['阔剑', '断岩巨剑', '镇狱巨剑', '裂地巨剑', '天崩巨剑'],
  helm: ['布头巾', '皮盔', '铁额冠', '玄铁战盔', '星纹头冠'],
  armor: ['布衣', '皮甲', '锁子甲', '玄铁战甲', '星纹战衣'],
  ring: ['铜戒', '银戒', '月石戒指', '血玉戒指', '星辰指环'],
};
const LEGEND_NAMES = {
  weapon: ['断月', '霜烬', '无归', '烛龙之牙'],
  helm: ['不眠者之冠', '烬灭头冠'],
  armor: ['残光战衣', '渊海鳞甲'],
  ring: ['时之环', '永夜之誓'],
};

// 词条池：k = 属性键，roll(物品等级) 生成数值
const pct = (a, b) => () => +rand(a, b).toFixed(3);
const flat = (base, per) => (L) => Math.max(1, Math.round(rand(0.6, 1) * (base + L * per)));
export const AFFIX = {
  str: { roll: flat(2, 0.8) },
  vit: { roll: flat(2, 0.8) },
  int: { roll: flat(2, 0.8) },
  agi: { roll: flat(2, 0.8) },
  hp: { roll: flat(12, 9) },
  crit: { roll: pct(0.01, 0.04) },
  critDmg: { roll: pct(0.06, 0.16) },
  cdr: { roll: pct(0.02, 0.05) },
  atkPct: { roll: pct(0.03, 0.08) },
  mpRegen: { roll: pct(0.08, 0.2) },
};

// 刻印：稀有 / 传说装备上的特殊词条，在你「做到某件事」时生效 —— 让装备奖励打法，而不是只奖励数字。
// 每条都挂在已有的战斗机制上；每件装备最多一条，同名不叠加（效果实现在 main.js 的 calcDamage 等处）
export const MARKS = {
  counter: { name: '断势', desc: '破招后 4 秒内暴击率 +30%', style: '预判抢攻' },
  air: { name: '凌空', desc: '对空中的敌人伤害 +25%', style: '浮空连' },
  dodge: { name: '残心', desc: '极限闪避后 3 秒内技能伤害 +40%', style: '闪避反击' },
  pristine: { name: '无瑕', desc: '满血时伤害 +20%', style: '无伤' },
  desperate: { name: '背水', desc: '生命低于 35% 时伤害 +35%', style: '卖血' },
  otg: { name: '追魂', desc: '追打倒地不打折，每次追打回复 2% 生命', style: '扫腿 / 坠星追打' },
  wall: { name: '震壁', desc: '撞墙反弹后 3 秒内，该敌人受到伤害 +40%', style: '推墙' },
  streak: { name: '连锋', desc: '连击每 10 下伤害 +5%（最多 +25%），被打中清零', style: '长连段' },
};

// 属性的显示名，以及是否按百分比显示
export const STAT_INFO = {
  atk: ['攻击力', false], def: ['防御', false], hp: ['生命', false],
  str: ['力量', false], vit: ['体力', false], int: ['智力', false], agi: ['敏捷', false],
  crit: ['暴击率', true], critDmg: ['暴击伤害', true], cdr: ['冷却缩减', true],
  atkPct: ['攻击力', true], mpRegen: ['魔力回复', true],
};

export function fmtStat(k, v) {
  const pctStat = STAT_INFO[k]?.[1];
  return pctStat ? `${(v * 100).toFixed(1)}%` : `${Math.round(v)}`;
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let seq = 0;
export const newId = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

// 掉落品质：关卡越深，高品质权重越高；精英怪有额外幸运
export function rollRarity(L, { minRar = 0, luck = 0 } = {}) {
  const w = RARITY.map((r, i) => (i === 0 ? r.w : r.w * (1 + L * 0.05 + luck) * (i === 3 ? 1 + L * 0.06 : 1)));
  let x = Math.random() * w.reduce((a, b) => a + b, 0);
  let rar = 0;
  for (let i = 0; i < w.length; i++) {
    x -= w[i];
    if (x <= 0) { rar = i; break; }
  }
  return Math.max(minRar, rar);
}

export function makeItem(slot, ilvl, rar, wtype) {
  const R = RARITY[rar];
  const it = { id: newId(), slot, rar, ilvl, enh: 0, base: {}, affix: [] };
  if (slot === 'weapon') {
    it.wtype = wtype || pick(Object.keys(WTYPES));
    const W = WTYPES[it.wtype];
    it.base.atk = Math.round((8 + ilvl * 3.2) * R.mul * W.atkMul);
    if (W.crit) it.base.crit = W.crit;
  } else if (slot === 'helm') {
    it.base.def = Math.round((3 + ilvl * 1.2) * R.mul);
    it.base.hp = Math.round((10 + ilvl * 6) * R.mul);
  } else if (slot === 'armor') {
    it.base.def = Math.round((5 + ilvl * 2) * R.mul);
    it.base.hp = Math.round((20 + ilvl * 10) * R.mul);
  } else {
    it.base.atk = Math.round((3 + ilvl * 1.2) * R.mul);
    it.base.crit = 0.01;
  }
  // 词条：普通 0 条、精良 1 条、稀有 2 条、传说 3 条（数值 ×1.3）
  const boost = rar === 3 ? 1.3 : 1;
  it.affix = shuffle(Object.keys(AFFIX)).slice(0, rar).map((k) => {
    const v = AFFIX[k].roll(ilvl) * boost;
    return { k, v: STAT_INFO[k][1] ? +v.toFixed(3) : Math.round(v) };
  });
  // 刻印：稀有 40% 带一条，传说必带一条
  if (rar === 3 || (rar === 2 && Math.random() < 0.4)) it.mark = pick(Object.keys(MARKS));
  const tier = Math.min(4, Math.floor(ilvl / 4));
  it.name = rar === 3 ? pick(LEGEND_NAMES[slot]) : TIER_NAMES[slot === 'weapon' ? it.wtype : slot][tier];
  return it;
}

export function randomDrop(L, opts) {
  const r = Math.random();
  const slot = r < 0.34 ? 'weapon' : r < 0.56 ? 'armor' : r < 0.78 ? 'helm' : 'ring';
  const ilvl = Math.max(1, L + Math.floor(rand(-1, 2)));
  return makeItem(slot, ilvl, rollRarity(L, opts));
}

export function starterGear() {
  const weapon = makeItem('weapon', 1, 0, 'sword');
  weapon.name = '旧铁剑';
  const armor = makeItem('armor', 1, 0);
  return { weapon, helm: null, armor, ring: null };
}

export const itemGlyph = (it) => (it.slot === 'weapon' ? WTYPES[it.wtype].glyph : SLOT_GLYPH[it.slot]);
export const itemTitle = (it) => `${it.enh ? `+${it.enh} ` : ''}${it.name}`;
export const itemKind = (it) => (it.slot === 'weapon' ? WTYPES[it.wtype].name : SLOT_NAME[it.slot]);

// 装备提供的全部属性（强化只加成基础属性，每级 +8%）
export function itemStats(it) {
  const s = {};
  const m = 1 + it.enh * 0.08;
  for (const [k, v] of Object.entries(it.base)) s[k] = (s[k] || 0) + (k === 'crit' ? v : v * m);
  for (const a of it.affix) s[a.k] = (s[a.k] || 0) + a.v;
  return s;
}

// 给装备打一个「分数」，用于比较好坏（绿色上箭头 / 红色下箭头）
const SCORE_W = { atk: 3, def: 2, hp: 0.25, str: 2, vit: 1.6, int: 1.2, agi: 1.5, crit: 300, critDmg: 80, cdr: 250, atkPct: 250, mpRegen: 40 };
export function itemScore(it) {
  if (!it) return 0;
  let s = 0;
  for (const [k, v] of Object.entries(itemStats(it))) s += (SCORE_W[k] || 0) * v;
  return Math.round(s);
}

// ---------- 强化 ----------
export const MAX_ENH = 10;
const ENH_RATE = [1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2];
export const enhRate = (it) => ENH_RATE[it.enh] ?? 0;
export const enhCost = (it) => Math.round((40 + it.ilvl * 20) * (1 + it.enh * 0.7) * (1 + it.rar * 0.3));
export const sellPrice = (it) => Math.round((5 + it.ilvl * 3) * [1, 3, 8, 25][it.rar] * (1 + it.enh * 0.25));
