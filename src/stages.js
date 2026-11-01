// 关卡：每关 3~4 波，敌人名字后加 * 表示精英怪
export const STAGES = [
  {
    id: 's1', name: '墓穴入口', lv: 1,
    desc: '腐骨兵在入口游荡，是熟悉连招的好地方。',
    subs: ['腐骨兵从墓穴中苏醒', '小心远处的影弓手', '铁甲屠夫：先破防，再连击'],
    waves: [['grunt', 'grunt', 'grunt'], ['grunt', 'archer', 'grunt', 'archer'], ['brute', 'grunt', 'grunt']],
  },
  {
    id: 's2', name: '骸骨回廊', lv: 4,
    desc: '影弓手藏在回廊深处。第一次出现精英怪。',
    subs: ['回廊里的脚步声', '金色光环的是精英，掉落必定是精良以上', '屠夫带着弓手守住了出口'],
    waves: [['grunt', 'grunt', 'archer', 'grunt'], ['archer', 'archer', 'grunt*', 'grunt'], ['brute', 'archer', 'grunt', 'archer']],
  },
  {
    id: 's3', name: '屠夫刑场', lv: 7,
    desc: '两名铁甲屠夫看守刑场。看准红圈，用闪避穿过去。',
    subs: ['刑场外围', '屠夫的砸地可以被破防打断', '两名屠夫同时出现'],
    waves: [['grunt', 'grunt*', 'grunt', 'archer'], ['brute', 'archer', 'archer', 'grunt'], ['brute', 'brute', 'grunt*', 'archer']],
  },
  {
    id: 's4', name: '深渊祭坛', lv: 10,
    desc: '精英们守护着祭坛，传说装备的掉率更高。',
    subs: ['祭坛的守卫', '精英屠夫：护甲更厚', '祭坛之主'],
    waves: [['grunt*', 'archer', 'grunt', 'archer', 'grunt'], ['brute*', 'archer', 'archer', 'grunt'], ['brute', 'brute*', 'archer*', 'grunt', 'grunt']],
  },
  {
    id: 's5', name: '残光深渊', lv: 14,
    desc: '墓穴最深处，只有真正的剑士能活着回来。',
    subs: ['深渊在注视你', '无尽的骸骨', '屠夫军团', '深渊的尽头'],
    waves: [
      ['grunt*', 'archer', 'archer', 'grunt', 'grunt'],
      ['brute', 'archer*', 'grunt', 'grunt*'],
      ['brute*', 'brute', 'archer', 'archer'],
      ['brute*', 'brute*', 'grunt*', 'archer*'],
    ],
  },
];

export const WAVE_NAMES = ['第 一 波', '第 二 波', '第 三 波', '第 四 波', '第 五 波'];

export const isUnlocked = (save, i) => i === 0 || !!save.cleared[STAGES[i - 1].id];

export function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// 评价 = 速度 + 无伤 + 连击，每项 0~3 分
export function grade({ time, hpLostPct, maxCombo, waves }) {
  const par = waves * 25; // 每波大约 25 秒算快
  const tS = time < par ? 3 : time < par * 1.6 ? 2 : time < par * 2.4 ? 1 : 0;
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
