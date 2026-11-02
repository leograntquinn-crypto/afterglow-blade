// 委托：营地出征页顶上的 3 张目标卡。进度在出征中累计（训练场不算），完成后回营地领取刻印石和金币。
//   - 领过的那一格第二天补上新委托；没完成的不会过期
//   - 每天可以免费换掉一张
// 委托挂在已有的战斗事件上（game.quest），用奖励把玩家带去尝试平时不用的机制、难度和流派。
import { STAGES, DIFFS, stageKey } from './stages.js';
import { WTYPES } from './items.js';

// n：目标次数的候选；stones：奖励的刻印石
export const CONTRACTS = {
  counter: { n: [8, 12, 16], stones: 1, text: (c) => `破招 ${c.n} 次` },
  perfect: { n: [5, 8, 12], stones: 1, text: (c) => `极限闪避 ${c.n} 次` },
  parry: { n: [3, 5, 8], stones: 1, text: (c) => `弹刀 ${c.n} 次` },
  airHit: { n: [40, 70, 100], stones: 1, text: (c) => `空中命中敌人 ${c.n} 次` },
  wall: { n: [4, 7, 10], stones: 1, text: (c) => `把敌人打到墙上反弹 ${c.n} 次` },
  affixKill: { n: [6, 10, 15], stones: 1, text: (c) => `击杀 ${c.n} 个带词缀的敌人` },
  flawless: { n: [2, 3, 4], stones: 2, text: (c) => `无伤清空 ${c.n} 个房间` },
  interrupt: { n: [1, 2], stones: 2, text: (c) => `打断首领读条 ${c.n} 次` },
  styleSS: { n: [1], stones: 2, text: () => '一次出征中风格达到 SS' },
  gradeA: { n: [1], stones: 1, text: () => '以 A 或更高的评价通关任意关卡' },
  clearStage: { n: [1], stones: 2, text: (c) => `通关「${STAGES[c.stage].name}·${DIFFS[c.diff].name}」` },
  school: { n: [1], stones: 1, text: (c) => `装备${WTYPES[c.school].name}（${WTYPES[c.school].school}）通关任意关卡` },
};

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// 新委托：避开已经在板上的类型；通关类只出玩家已经解锁的关卡和难度
function rollContract(save, exclude) {
  const unlocked = [];
  STAGES.forEach((st, i) => {
    for (let d = 0; d < DIFFS.length; d++) {
      const ok = d === 0 ? i === 0 || save.cleared[STAGES[i - 1].id] : save.cleared[stageKey(st, d - 1)];
      if (ok) unlocked.push([i, d]);
    }
  });
  // 打断读条要先见过第二阶段的首领：没通关过第一关就不出
  const types = Object.keys(CONTRACTS).filter((k) => !exclude.has(k) && !(k === 'interrupt' && !save.cleared.s1));
  const type = types[Math.floor(Math.random() * types.length)];
  const T = CONTRACTS[type];
  const c = { id: Math.random().toString(36).slice(2, 9), type, n: T.n[Math.floor(Math.random() * T.n.length)], prog: 0, claimed: false };
  if (type === 'clearStage') {
    // 优先出还没通关过的关卡 / 难度，让玩家往前推
    const fresh = unlocked.filter(([i, d]) => !save.cleared[stageKey(STAGES[i], d)]);
    const [i, d] = (fresh.length ? fresh : unlocked)[Math.floor(Math.random() * (fresh.length || unlocked.length))];
    Object.assign(c, { stage: i, diff: d });
  }
  if (type === 'school') {
    const cur = save.equip.weapon?.wtype || 'sword';
    const others = Object.keys(WTYPES).filter((k) => k !== cur);
    c.school = others[Math.floor(Math.random() * others.length)];
  }
  return c;
}

// 保证存档里有委托板；新的一天补上已领取的格子，并恢复每日一次的免费更换
export function ensureContracts(save) {
  save.stones ??= 0;
  const day = today();
  const B = (save.contracts ??= { day: '', list: [], rerolls: 1 });
  if (B.day !== day) {
    B.day = day;
    B.rerolls = 1;
    B.list = B.list.filter((c) => !c.claimed);
  }
  while (B.list.length < 3) B.list.push(rollContract(save, new Set(B.list.map((c) => c.type))));
  return B;
}

export const isDone = (c) => c.prog >= c.n;
export const contractText = (c) => CONTRACTS[c.type].text(c);
export const contractReward = (c, lv) => ({ stones: CONTRACTS[c.type].stones, gold: Math.round((60 + lv * 25) * CONTRACTS[c.type].stones) });

// 换掉一张没完成的委托（每天一次）
export function rerollContract(save, id) {
  const B = ensureContracts(save);
  const i = B.list.findIndex((c) => c.id === id);
  if (i < 0 || B.rerolls <= 0 || B.list[i].claimed || isDone(B.list[i])) return false;
  B.rerolls--;
  B.list[i] = rollContract(save, new Set(B.list.map((c) => c.type)));
  return true;
}

// 领取：刻印石 + 金币；格子留着显示「已领取」，第二天补新委托
export function claimContract(save, id) {
  const c = save.contracts?.list.find((x) => x.id === id);
  if (!c || c.claimed || !isDone(c)) return null;
  c.claimed = true;
  const r = contractReward(c, save.lv);
  save.stones += r.stones;
  save.gold += r.gold;
  return r;
}

// 战斗事件 → 进度。ctx 给通关类委托用：{ stage, diff, letter, school }
// 返回这次刚完成的委托列表（游戏里提示一下）
export function progressContracts(save, type, amount = 1, ctx = null) {
  const B = save.contracts;
  if (!B) return [];
  const done = [];
  for (const c of B.list) {
    if (c.claimed || isDone(c)) continue;
    let hit = c.type === type;
    if (type === 'clear' && ctx) {
      if (c.type === 'gradeA') hit = ctx.letter === 'A' || ctx.letter === 'S';
      else if (c.type === 'clearStage') hit = ctx.stage === c.stage && ctx.diff === c.diff;
      else if (c.type === 'school') hit = ctx.school === c.school;
    }
    if (!hit) continue;
    c.prog = Math.min(c.n, c.prog + amount);
    if (isDone(c)) done.push(c);
  }
  return done;
}
