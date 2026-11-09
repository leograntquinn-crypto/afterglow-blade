// 装备系统：品质、随机词条、强化、出售
//
// 设计思路：每件装备 = 基础属性（由部位和物品等级决定）+ 随机词条（数量由品质决定）
// 品质越高，基础属性倍率越高、词条越多。这就是 DNF/暗黑类游戏「刷装备」的核心循环。

import { rand } from './config.js';

import { CATALOG, defsBy } from './gear/catalog.js';
import { BUDGET, AFFIX_SHARE, AFFIX_MAX, ITEM_RULES, RARITY, COST_TIER, SELL_MULT, DROP_RULES } from './gear/rules.js';
export { RARITY };
import { SERIES } from './gear/series.js';
export const SLOT_KEYS = ['weapon','helm','chest','legs','boots','bracers','wings','veil','trinket1','trinket2'];
export const RESERVED_SLOTS = ['class'];
export const SLOT_NAME = {weapon:'武器',helm:'头盔',chest:'胸甲',legs:'护腿',boots:'战靴',bracers:'护腕',wings:'翅膀',veil:'光幕',trinket:'饰品',trinket1:'饰品一',trinket2:'饰品二'};
const SLOT_GLYPH = {helm:'盔',chest:'甲',legs:'腿',boots:'靴',bracers:'腕',wings:'翼',veil:'幕',trinket:'饰'};

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
export function rollRarity(L, { minRar = 0, luck = 0, maxRar = 4 } = {}) {
  const w = RARITY.map((r, i) => i>maxRar ? 0 : (i === 0 ? r.w : r.w * (1 + L * 0.05 + luck) * (i === 4 ? 1 + L * 0.06 : 1)));
  let x = Math.random() * w.reduce((a, b) => a + b, 0);
  let rar = 0;
  for (let i = 0; i < w.length; i++) {
    x -= w[i];
    if (x <= 0) { rar = i; break; }
  }
  return Math.min(maxRar, Math.max(minRar, rar));
}

// 定义属性通过访问器读取，JSON 存档只保存实例字段；旧界面继续使用原字段名。
export function hydrateItem(it) {
  if (!it?.def || !CATALOG[it.def]) return it;
  const d = CATALOG[it.def];
  for (const [k,get] of Object.entries({id:()=>it.uid,slot:()=>d.slot,rar:()=>d.rar,name:()=>d.name,
    wtype:()=>d.slot === 'weapon' ? d.kind : undefined,base:()=>itemBase(it)})) {
    Object.defineProperty(it,k,{get,configurable:true,enumerable:false});
  }
  return it;
}
export const isLegend = (it) => !!it && (CATALOG[it.def]?.rar ?? it.rar) === 4;
export function itemBase(it) {
  const d = CATALOG[it.def];
  if (!d) return it.base || {};
  if (d.fixed) return {...d.fixed};
  const base = {};
  for (const [k,[a,b]] of Object.entries(BUDGET[d.slot])) {
    const v = (a+b*it.ilvl) * (k === 'crit' ? 1 : RARITY[d.rar].mul);
    base[k] = v;
  }
  if (d.slot === 'weapon') {
    base.atk *= WTYPES[d.kind].atkMul;
    if (WTYPES[d.kind].crit) base.crit = WTYPES[d.kind].crit;
  }
  for (const [k,v] of Object.entries(it.legacyBase || {})) base[k] = Math.max(base[k] || 0,v);
  return base;
}
export function makeItem(defId, ilvl, opts = {}, wtype) {
  // 保留旧调用兼容；新掉落统一按定义 id 生成。
  if (!CATALOG[defId]) {
    const slot = {armor:'chest',ring:'trinket'}[defId] || defId;
    const rar = typeof opts === 'number' ? opts : 0;
    const pool = defsBy({slot,rar,...(slot === 'weapon' ? {kind:wtype || pick(Object.keys(WTYPES))} : {})});
    if (!pool.length) throw new Error(`没有对应装备定义：${defId}`);
    defId = pick(pool).id;
    opts = {};
  }
  const d = CATALOG[defId], R = RARITY[d.rar];
  const it = {uid:newId(),def:defId,ilvl,enh:0,affix:[],mark:null,imbueLv:0,reforged:0,locked:false,skin:null};
  if (!d.fixed) {
    it.affix = shuffle(Object.keys(AFFIX)).slice(0,R.affixes).map((k) => {
      const [a,b] = AFFIX_MAX[k];
      const v = (a+b*ilvl)*rand(ITEM_RULES.affixMin,1)*AFFIX_SHARE[d.slot]*R.quality;
      return {k,v:STAT_INFO[k][1] ? +v.toFixed(3) : Math.round(v)};
    });
    if (Math.random() < R.mark) it.mark = pick(Object.keys(MARKS));
    if (d.imbue && R.imbue.length) it.imbueLv = pick(R.imbue);
  }
  Object.assign(it,opts);
  if (d.fixed) Object.assign(it,{affix:[],mark:null,imbueLv:0});
  return hydrateItem(it);
}

// 来源由调用方显式传入；没有合法来源时绝不掉传说。保底按一次抽取计数。
const weighted = (rows, weight) => {
  let n = Math.random()*rows.reduce((sum,row)=>sum+weight(row),0);
  return rows.find((row)=>(n-=weight(row))<0) || rows.at(-1);
};
export function randomDrop(L, opts = {}) {
  const {save,source='normal',stage=1,boss,diff=0} = opts;
  const cosmetic = !!save?.gearCosmeticsUnlocked || !!save?.cleared?.s2 || stage>DROP_RULES.cosmeticStage || (source==='boss' && stage>=DROP_RULES.cosmeticStage);
  if (cosmetic && save) save.gearCosmeticsUnlocked=true;
  const available = Object.values(CATALOG).filter(d=>cosmetic || !d.fixed);
  const legends = available.filter(d=>d.rar===4 && (source==='boss' ? d.drop.boss===boss :
    (source==='trial' || (source==='clear' && diff>=1)) && !d.drop.boss));
  const key = source==='boss' ? `boss:${boss}` : source==='clear' ? `clear:${stage}:${diff}` : source;
  const pity = save ? (save.legendPity ||= {}) : {};
  let rar = rollRarity(L,{...opts,maxRar:legends.length ? 4 : 3});
  if (legends.length && (pity[key] || 0)>=DROP_RULES.pityMisses) rar=4;
  let pool = rar===4 ? legends : available.filter(d=>d.rar===rar);
  const series = weighted([...new Set(pool.map(d=>d.series))],id=>SERIES[id].stages.includes(source==='trial' ? 'trial' : stage) ? DROP_RULES.majorWeight : 1);
  pool=pool.filter(d=>d.series===series);
  const kind = weighted([...new Set(pool.map(d=>d.kind))],k=>{
    const slot=pool.find(d=>d.kind===k).slot;
    const count=new Set(pool.filter(d=>d.slot===slot).map(d=>d.kind)).size;
    const weight=DROP_RULES.oldSlotWeights[slot];
    return (weight===undefined ? DROP_RULES.newSlotShare/DROP_RULES.newSlots.length : weight*(1-DROP_RULES.newSlotShare))/count;
  });
  const it=makeItem(pick(pool.filter(d=>d.kind===kind)).id,Math.max(1,L+Math.floor(rand(-1,2))));
  if (legends.length && save) pity[key]=rar===4 ? 0 : (pity[key] || 0)+1;
  return it;
}

export function starterGear() {
  return {...Object.fromEntries(SLOT_KEYS.map((k)=>[k,null])),
    weapon:makeItem('sword_wayfarer_r0',1),chest:makeItem('chest_wayfarer_r0',1)};
}

export const itemGlyph = (it) => (it.slot === 'weapon' ? WTYPES[it.wtype].glyph : SLOT_GLYPH[it.slot]);
export const itemTitle = (it) => `${it.enh ? `+${it.enh} ` : ''}${it.name}`;
export const itemKind = (it) => (it.slot === 'weapon' ? WTYPES[it.wtype].name : SLOT_NAME[it.slot]);

// 装备提供的全部属性（强化只加成基础属性，每级 +8%）
export function itemStats(it) {
  if (!it) return {};
  const d = CATALOG[it.def];
  if (d?.fixed) return {...d.fixed};
  const s = {};
  const m = 1 + it.enh * ITEM_RULES.enhPer;
  for (const [k, v] of Object.entries(itemBase(it))) s[k] = (s[k] || 0) + (k === 'crit' ? v : v * m);
  for (const a of it.affix) s[a.k] = (s[a.k] || 0) + a.v;
  return s;
}

// ---------- 强化 ----------
export const MAX_ENH = 10;
const ENH_RATE = [1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2];
export const canImprove = (it) => !!it && !CATALOG[it.def]?.fixed;
export const enhRate = (it) => canImprove(it) ? ENH_RATE[it.enh] ?? 0 : 0;
export const enhCost = (it) => Math.round((40 + it.ilvl * 20) * (1 + it.enh * 0.7) * (1 + COST_TIER[it.rar] * 0.3));
// 重铸：把第 i 条词条换成另一种属性（不和这件装备的其他词条重复），数值按物品等级重新随机。
// 每重铸一次下次贵 50%：金币换来「更接近理想」的确定进展，但不能无限便宜地刷
export const reforgeCost = (it) => Math.round((60 + it.ilvl * 25) * (1 + COST_TIER[it.rar] * 0.5) * (1 + (it.reforged || 0) * 0.5));
export function reforgeAffix(it, i) {
  if (!canImprove(it) || !it.affix[i]) return false;
  const used = new Set(it.affix.map((a) => a.k));
  const pool = Object.keys(AFFIX).filter((k) => !used.has(k));
  if (!pool.length) return false;
  const k = pick(pool);
  const [a,b] = AFFIX_MAX[k];
  const v = (a+b*it.ilvl)*rand(ITEM_RULES.affixMin,1)*AFFIX_SHARE[it.slot]*RARITY[it.rar].quality;
  it.affix[i] = { k, v: STAT_INFO[k][1] ? +v.toFixed(3) : Math.round(v) };
  it.reforged = (it.reforged || 0) + 1;
  return true;
}

// 传承：新装备继承同部位旧装备的强化等级（旧装备变回 +0）。
// 价格约为「在新装备上重新强化到同等级」的 35%（还不用承担失败），让强化成为长期投入，换装备只看底子
export function inheritCost(it, from) {
  if (!canImprove(it) || !canImprove(from) || it.slot !== from.slot) return 0;
  let c = 0;
  for (let e = it.enh; e < from.enh; e++) c += (40 + it.ilvl * 20) * (1 + e * 0.7) * (1 + COST_TIER[it.rar] * 0.3);
  return Math.round(c * 0.35);
}

export const sellPrice = (it) => Math.round((5 + it.ilvl * 3) * SELL_MULT[COST_TIER[it.rar]] * (1 + it.enh * 0.25));
