// 关卡波次与评价
export const WAVES = [
  { title: '第 一 波', sub: '腐骨兵从墓穴中苏醒', enemies: ['grunt', 'grunt', 'grunt'] },
  { title: '第 二 波', sub: '小心远处的影弓手', enemies: ['grunt', 'archer', 'grunt', 'archer'] },
  { title: '第 三 波', sub: '铁甲屠夫：先破防，再连击', enemies: ['brute', 'grunt', 'archer', 'grunt'] },
];

export function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// 评价 = 速度 + 无伤 + 连击，每项 0~3 分
export function grade({ time, hpLostPct, maxCombo }) {
  const tS = time < 75 ? 3 : time < 120 ? 2 : time < 180 ? 1 : 0;
  const hS = hpLostPct < 0.15 ? 3 : hpLostPct < 0.4 ? 2 : hpLostPct < 0.7 ? 1 : 0;
  const cS = maxCombo >= 35 ? 3 : maxCombo >= 20 ? 2 : maxCombo >= 10 ? 1 : 0;
  const total = tS + hS + cS;
  const letter = total >= 8 ? 'S' : total >= 6 ? 'A' : total >= 4 ? 'B' : 'C';
  return {
    letter, total,
    rows: [
      ['通关用时', fmtTime(time), tS],
      ['受到伤害', `${Math.round(hpLostPct * 100)}%`, hS],
      ['最高连击', `${maxCombo}`, cS],
    ],
  };
}
