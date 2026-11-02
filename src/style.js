// 风格评价等级：分数越高评级越高（类似《鬼泣》的 D → SSS）
export const STYLE_RANKS = [
  { at: 0, letter: 'D', word: '凡', color: '#9d93a8' },
  { at: 120, letter: 'C', word: '锐', color: '#c9c1b3' },
  { at: 300, letter: 'B', word: '烈', color: '#7ff3ff' },
  { at: 540, letter: 'A', word: '狂', color: '#6fe38a' },
  { at: 840, letter: 'S', word: '绝', color: '#ffd65a' },
  { at: 1200, letter: 'SS', word: '极', color: '#ff9a2e' },
  { at: 1620, letter: 'SSS', word: '无双', color: '#ff4d5e' },
];
export const STYLE_MAX = 2000;

// 战意：击杀时的风格评级决定战利品加成（经验、金币、掉装备概率和品质）。
// 打得好 = 拿得多；挨一下打评级掉两级，加成跟着掉。只有奖励没有惩罚
export const SPOILS = [0, 0.1, 0.2, 0.35, 0.5, 0.7, 1.0];
