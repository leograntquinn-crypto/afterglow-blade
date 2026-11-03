// 残光试炼：一层一个房间，越往上越强、词缀越多，每 5 层是首领层。
// 每过一层可以选择「继续」还是「带着奖励离开」：离开拿全部奖励池，阵亡只拿一半。
// 完全复用现有的房间、敌人、词缀和首领；层数就是关卡等级，不另起一套数值。
import { STAGES, DIFFS } from './stages.js';
import { BOSSES } from './boss.js';

const THEMES = ['crypt', 'hall', 'gallows', 'altar', 'abyss'];
const BOSS_KEYS = Object.keys(BOSSES);

// 第 f 层用的「关卡」：等级 = 1 + f；每 5 层换一个场景
export function trialStage(f) {
  const si = Math.min(4, Math.floor((f - 1) / 5));
  return {
    ...STAGES[si], id: 'trial', name: `残光试炼·第 ${f} 层`, lv: Math.min(30, 1 + f), theme: THEMES[si],
    boss: BOSS_KEYS[(Math.floor(f / 5) - 1 + BOSS_KEYS.length) % BOSS_KEYS.length],
  };
}

// 第 f 层的难度参数：普通怪带词缀的概率、精英多带的词缀、同时进攻的人数随层数上升
export function trialDiff(f) {
  return { ...DIFFS[0], normalAffix: Math.min(0.6, f * 0.03), affix: f >= 10 ? 1 : 0, attackers: f >= 8 ? 1 : 0 };
}

export const isBossFloor = (f) => f % 5 === 0;

// 第 f 层会出现的敌人：第 4 层起加入烬翼，第 7 层起加入灰烛司祭（素材也按这个载入）
export const trialTypes = (f) => ['grunt', 'grunt', 'archer', 'brute', ...(f >= 4 ? ['wing'] : []), ...(f >= 7 ? ['priest'] : [])];

// 普通层的波次：人数和精英数随层数增加，第 6 层起两波
export function trialWaves(f) {
  const pool = trialTypes(f);
  const wave = () => {
    const n = Math.min(6, 3 + Math.floor(f / 3)), elites = Math.min(2, Math.floor(f / 4));
    return Array.from({ length: n }, (_, i) => pool[Math.floor(Math.random() * pool.length)] + (i < elites ? '*' : ''));
  };
  return f >= 6 ? [wave(), wave()] : [wave()];
}

// 每过一层加进奖励池的东西：金币每层都有，刻印石每 5 层一颗
export function floorReward(f) {
  return { gold: 30 + f * 20, stones: isBossFloor(f) ? 1 : 0 };
}

// 离开 / 阵亡时结算：阵亡减半
export function settle(pool, died) {
  const m = died ? 0.5 : 1;
  return { gold: Math.floor(pool.gold * m), stones: Math.floor(pool.stones * m) };
}
