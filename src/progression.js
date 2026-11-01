// 成长系统：经验与等级、属性点、技能树、最终属性计算
//
// 所有「成长」都汇总到 computeStats() 一个函数里：
//   等级 + 属性点 + 装备 + 技能 → 攻击力、生命、暴击……
// 战斗代码只读这个结果，不关心它从哪来。修改平衡性时只需要改这一个地方。

import { SLOT_KEYS, itemStats, starterGear, RARITY, WTYPES } from './items.js';
import { SKILLS } from './moves.js';

export const MAX_LV = 30;
export const BAG_MAX = 40;
export const xpToNext = (lv) => Math.round(50 * Math.pow(lv, 1.5) + 30);

export const ATTRS = [
  { key: 'str', name: '力量', hint: '攻击力 +2' },
  { key: 'vit', name: '体力', hint: '生命 +12，防御 +0.5' },
  { key: 'int', name: '智力', hint: '魔力 +5，技能伤害 +1.2%' },
  { key: 'agi', name: '敏捷', hint: '暴击率 +0.5%' },
];

// 技能树：主动技能到达等级自动习得 1 级；之后每级消耗 1 技能点
// 技能等级上限 = 1 + (角色等级 - 解锁等级)，防止前期把点全堆在一个技能上
export const SKILL_TREE = [
  { key: 'skill1', active: true, unlock: 1, max: 10, desc: '向前方斩出贯穿剑气，命中的敌人全部击飞。', per: '伤害 +12%' },
  { key: 'skill2', active: true, unlock: 3, max: 10, desc: '持剑旋转连斩并可移动，最后一击把周围敌人打飞。霸体。', per: '伤害 +12%' },
  { key: 'skill3', active: true, unlock: 6, max: 10, desc: '蓄力后震碎大地，大范围浮空。蓄力期间无敌。', per: '伤害 +12%' },
  { key: 'skill4', active: true, unlock: 10, max: 10, desc: '化作残影突进，八连斩后以一记重斩收尾。', per: '伤害 +12%' },
  { key: 'mastery', unlock: 1, max: 10, name: '剑术精通', glyph: '精', desc: '普通攻击、上挑、空中攻击和冲刺攻击的伤害提高。', per: '普攻伤害 +6%' },
  { key: 'focus', unlock: 4, max: 10, name: '残心', glyph: '心', desc: '看破破绽，提高暴击率。', per: '暴击率 +1.5%' },
  { key: 'flow', unlock: 8, max: 10, name: '回气', glyph: '气', desc: '调整呼吸，加快魔力回复并缩短技能冷却。', per: '魔力回复 +10%，冷却 -2%' },
];
for (const n of SKILL_TREE) if (n.active) Object.assign(n, { name: SKILLS[n.key].name, glyph: SKILLS[n.key].glyph, keyLabel: SKILLS[n.key].key });

export function newSave() {
  return {
    v: 1, savedAt: 0,
    lv: 1, xp: 0, gold: 0,
    statPts: 0, stats: { str: 0, vit: 0, int: 0, agi: 0 },
    sp: 0, skills: { skill1: 1, skill2: 0, skill3: 0, skill4: 0, mastery: 0, focus: 0, flow: 0 },
    equip: starterGear(), bag: [],
    cleared: {}, best: {}, runs: 0,
  };
}

export const skillCap = (save, node) => (save.lv < node.unlock ? 0 : Math.min(node.max, 1 + save.lv - node.unlock));

export function autoUnlock(save) {
  const learned = [];
  for (const n of SKILL_TREE) {
    if (n.active && save.lv >= n.unlock && save.skills[n.key] < 1) {
      save.skills[n.key] = 1;
      learned.push(n.name);
    }
  }
  return learned;
}

// 返回升到的等级列表（一次可能连升多级）
export function addXp(save, n) {
  const ups = [];
  if (save.lv >= MAX_LV) return ups;
  save.xp += n;
  while (save.lv < MAX_LV && save.xp >= xpToNext(save.lv)) {
    save.xp -= xpToNext(save.lv);
    save.lv++;
    save.statPts += 3;
    save.sp += 1;
    ups.push(save.lv);
  }
  if (save.lv >= MAX_LV) save.xp = 0;
  return ups;
}

export function computeStats(save) {
  const eq = {};
  for (const slot of SLOT_KEYS) {
    const it = save.equip[slot];
    if (it) for (const [k, v] of Object.entries(itemStats(it))) eq[k] = (eq[k] || 0) + v;
  }
  const g = (k) => eq[k] || 0;
  const lv = save.lv, sk = save.skills;
  const str = save.stats.str + g('str');
  const vit = save.stats.vit + g('vit');
  const int = save.stats.int + g('int');
  const agi = save.stats.agi + g('agi');
  return {
    lv, str, vit, int, agi,
    atk: (6 + lv * 3 + g('atk') + str * 2) * (1 + g('atkPct')),
    def: g('def') + vit * 0.5,
    maxHp: Math.round(280 + lv * 20 + vit * 12 + g('hp')),
    maxMp: Math.round(116 + lv * 4 + int * 5),
    mpRegen: 0.11 * (1 + g('mpRegen') + sk.flow * 0.1),
    crit: Math.min(0.75, 0.08 + agi * 0.005 + g('crit') + sk.focus * 0.015),
    critDmg: 1.5 + g('critDmg'),
    cdr: Math.min(0.4, g('cdr') + sk.flow * 0.02),
    normalMul: 1 + sk.mastery * 0.06,
    intMul: 1 + int * 0.012,
    skillLv: { skill1: sk.skill1, skill2: sk.skill2, skill3: sk.skill3, skill4: sk.skill4 },
  };
}

export const skillMul = (S, key) => (1 + (S.skillLv[key] - 1) * 0.12) * S.intMul;

// 「战力」：把各种属性折算成一个数字，给玩家直观的成长反馈
export const power = (S) => Math.round(S.atk * (1 + S.crit * (S.critDmg - 1)) * 8 + S.maxHp * 0.6 + S.def * 6);

export function resetStats(save) {
  for (const k of Object.keys(save.stats)) {
    save.statPts += save.stats[k];
    save.stats[k] = 0;
  }
}

export function resetSkills(save) {
  for (const n of SKILL_TREE) {
    const base = n.active && save.lv >= n.unlock ? 1 : 0;
    save.sp += Math.max(0, save.skills[n.key] - base);
    save.skills[n.key] = base;
  }
}

// 主角外观由装备决定：武器类型和品质光、护甲镶边、头盔
export function playerLook(save) {
  const w = save.equip.weapon, a = save.equip.armor, h = save.equip.helm;
  const WT = WTYPES[w?.wtype || 'sword'];
  return {
    rig: 'hero', h: 86,
    skin: '#efd6bd', hair: '#1b2233', eye: '#7ff3ff', ribbon: '#7ff3ff',
    coat: '#2b3f5c', pants: '#1a1f2b', boots: '#2a2220', glove: '#3a3030', belt: '#3b2c22', buckle: '#d8c48a',
    metal: a && a.rar >= 2 ? '#d8b25a' : '#9aa6b8',
    trim: a ? (a.rar > 0 ? RARITY[a.rar].color : '#c9c1b3') : '#c9c1b3',
    helm: h ? { color: h.rar >= 2 ? '#d8b25a' : '#8a95a6', gem: RARITY[h.rar].color } : null,
    weapon: {
      type: w?.wtype || 'sword', len: WT.len, color: '#e8fdff',
      glow: w && w.rar > 0 ? RARITY[w.rar].color : '#7ff3ff',
      glowA: 0.28 + (w?.rar || 0) * 0.08, enh: w?.enh || 0,
    },
  };
}
