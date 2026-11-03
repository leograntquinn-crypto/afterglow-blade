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
    desc: '影弓手藏在回廊深处，烬翼在头顶盘旋 —— 跳起来用空中连招打它们。第一次出现精英怪。',
    pool: [['grunt', 'grunt', 'archer', 'grunt'], ['archer', 'wing', 'grunt'], ['brute', 'archer', 'grunt'], ['grunt*', 'grunt', 'wing'], ['wing', 'grunt', 'grunt']],
    elite: [['grunt*', 'wing'], ['grunt*', 'archer*']],
    side: ['treasure', 'elite'],
  },
  {
    id: 's3', name: '屠夫刑场', lv: 7, theme: 'gallows', rooms: 5, wavesPerRoom: 2, boss: 'ironJaw',
    desc: '屠夫们看守刑场，灰烛司祭躲在后面给它们加盾 —— 趁它举灯读条时打断它。',
    pool: [['brute', 'grunt', 'priest'], ['grunt', 'grunt*', 'archer', 'priest'], ['brute', 'archer', 'wing'], ['grunt', 'grunt', 'archer', 'priest']],
    elite: [['brute*', 'priest']],
    side: ['treasure', 'elite', 'rest'],
  },
  {
    id: 's4', name: '深渊祭坛', lv: 10, theme: 'altar', rooms: 6, wavesPerRoom: 2, boss: 'warden',
    desc: '精英们守护着祭坛，传说装备的掉率更高。',
    pool: [['grunt*', 'priest', 'grunt', 'wing'], ['brute*', 'archer', 'priest'], ['brute', 'brute', 'wing'], ['priest', 'wing', 'grunt', 'archer']],
    elite: [['brute*', 'priest*'], ['brute*', 'archer*', 'grunt*']],
    side: ['treasure', 'elite', 'rest'],
  },
  {
    id: 's5', name: '残光深渊', lv: 14, theme: 'abyss', rooms: 7, wavesPerRoom: 2, boss: 'afterimage',
    desc: '墓穴最深处。有个和你一模一样的身影在等着。',
    pool: [['grunt*', 'archer', 'wing', 'priest'], ['brute', 'archer*', 'priest'], ['brute*', 'brute', 'wing'], ['grunt*', 'priest*', 'archer*'], ['wing', 'grunt*', 'priest']],
    elite: [['brute*', 'priest*', 'wing'], ['brute*', 'brute*', 'archer*']],
    side: ['treasure', 'elite', 'rest'],
  },
];

export const isUnlocked = (save, i) => i === 0 || !!save.cleared[STAGES[i - 1].id];

// 难度：通关一个关卡的「普通」解锁它的「噩梦」，通关「噩梦」解锁「地狱」。
// 高难度不只是数值变大：敌人出招更快、同时进攻的人更多、词缀更多，逼你用上闪避、弹刀、破盾这些技巧。
//   lvAdd    关卡等级加成（敌人等级、掉落装备等级都跟着涨）
//   hp/dmg   在等级之外再乘的血量 / 伤害倍率
//   windup   敌人预警时间倍率（越小反应时间越短）；bossSpd 首领出招速度
//   affix    精英多带几条词缀；normalAffix 普通怪带词缀的概率
//   attackers 同时进攻的敌人多几个；reward 经验金币倍率；luck 掉落品质加成
export const DIFFS = [
  { key: '', name: '普通', color: '#e8e0d0', lvAdd: 0, hp: 1, dmg: 1, windup: 1, bossSpd: 1, affix: 0, normalAffix: 0, attackers: 0, reward: 1, luck: 0 },
  { key: 'nm', name: '噩梦', color: '#c48bff', lvAdd: 5, hp: 1.3, dmg: 1.25, windup: 0.86, bossSpd: 1.12, affix: 1, normalAffix: 0.3, attackers: 1, reward: 1.3, luck: 0.8 },
  { key: 'hell', name: '地狱', color: '#ff5a3c', lvAdd: 10, hp: 1.6, dmg: 1.5, windup: 0.74, bossSpd: 1.25, affix: 2, normalAffix: 0.55, attackers: 1, reward: 1.6, luck: 1.6 },
];
// 存档里每个难度分开记通关和最佳评价：普通用关卡 id，其他是 id@难度
export const stageKey = (st, d) => (d ? `${st.id}@${DIFFS[d].key}` : st.id);
export const diffUnlocked = (save, i, d) => (d === 0 ? isUnlocked(save, i) : !!save.cleared[stageKey(STAGES[i], d - 1)]);

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
