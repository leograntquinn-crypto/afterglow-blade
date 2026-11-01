// 关卡（地下城）配置
//   rooms   主线房间数（含最后的 Boss 房）
//   pool    普通战斗房间随机抽取的敌人波次，名字后加 * 表示精英怪
//   elite   精英房间的波次
//   side    支线房间类型：treasure 宝箱 / elite 精英 / rest 泉水
export const STAGES = [
  {
    id: 's1', name: '墓穴入口', lv: 1, theme: 'crypt', rooms: 4, wavesPerRoom: 1, boss: 'boneLord',
    desc: '腐骨兵在入口游荡，是熟悉连招的好地方。',
    pool: [['grunt', 'grunt', 'grunt'], ['grunt', 'archer', 'grunt'], ['grunt', 'grunt', 'archer'], ['brute', 'grunt']],
    elite: [['grunt*', 'grunt']],
    side: ['treasure'],
  },
  {
    id: 's2', name: '骸骨回廊', lv: 4, theme: 'hall', rooms: 5, wavesPerRoom: 2, boss: 'nightRaven',
    desc: '影弓手藏在回廊深处。第一次出现精英怪。',
    pool: [['grunt', 'grunt', 'archer', 'grunt'], ['archer', 'archer', 'grunt'], ['brute', 'archer', 'grunt'], ['grunt*', 'grunt', 'archer']],
    elite: [['grunt*', 'archer*']],
    side: ['treasure', 'elite'],
  },
  {
    id: 's3', name: '屠夫刑场', lv: 7, theme: 'gallows', rooms: 5, wavesPerRoom: 2, boss: 'ironJaw',
    desc: '屠夫们看守刑场。看准红圈，用闪避穿过去。',
    pool: [['brute', 'grunt', 'archer'], ['grunt', 'grunt*', 'archer', 'grunt'], ['brute', 'archer', 'archer']],
    elite: [['brute*', 'grunt']],
    side: ['treasure', 'elite', 'rest'],
  },
  {
    id: 's4', name: '深渊祭坛', lv: 10, theme: 'altar', rooms: 6, wavesPerRoom: 2, boss: 'warden',
    desc: '精英们守护着祭坛，传说装备的掉率更高。',
    pool: [['grunt*', 'archer', 'grunt', 'archer'], ['brute*', 'archer', 'grunt'], ['brute', 'brute', 'archer']],
    elite: [['brute*', 'archer*', 'grunt*']],
    side: ['treasure', 'elite', 'rest'],
  },
  {
    id: 's5', name: '残光深渊', lv: 14, theme: 'abyss', rooms: 7, wavesPerRoom: 2, boss: 'afterimage',
    desc: '墓穴最深处。有个和你一模一样的身影在等着。',
    pool: [['grunt*', 'archer', 'archer', 'grunt'], ['brute', 'archer*', 'grunt'], ['brute*', 'brute', 'archer'], ['grunt*', 'grunt*', 'archer*']],
    elite: [['brute*', 'brute*', 'archer*']],
    side: ['treasure', 'elite', 'rest'],
  },
];

export const isUnlocked = (save, i) => i === 0 || !!save.cleared[STAGES[i - 1].id];

export function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// 评价 = 速度 + 无伤 + 连击，每项 0~3 分
export function grade({ time, hpLostPct, maxCombo, rooms, style = 0 }) {
  const par = rooms * 28; // 每个房间大约 28 秒算快
  const tS = time < par ? 3 : time < par * 1.5 ? 2 : time < par * 2.2 ? 1 : 0;
  const hS = hpLostPct < 0.3 ? 3 : hpLostPct < 0.8 ? 2 : hpLostPct < 1.5 ? 1 : 0;
  const cS = maxCombo >= 45 ? 3 : maxCombo >= 25 ? 2 : maxCombo >= 12 ? 1 : 0;
  const sS = style >= 5 ? 3 : style >= 4 ? 2 : style >= 2 ? 1 : 0; // 最高风格评级 SS / S / B
  const total = tS + hS + cS + sS;
  const letter = total >= 10 ? 'S' : total >= 8 ? 'A' : total >= 5 ? 'B' : 'C';
  return {
    letter, total,
    rows: [
      ['通关用时', fmtTime(time), tS],
      ['受到伤害', `${Math.round(hpLostPct * 100)}%`, hS],
      ['最高连击', `${maxCombo}`, cS],
      ['最高风格', ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'][style], sS],
    ],
  };
}
