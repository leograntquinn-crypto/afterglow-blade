// ★ 五关各自的规则和地形（第 12 项，docs/AUDIT_PRE_GODOT.md）：难度来自机制和局面，不靠血量 / 伤害。
// 调关卡手感就改这里（和 ai_data.js、moves.js 一样，代码只负责按表执行）。所有时间都是帧（60 帧 = 1 秒）。
//
// rooms：按主线房间的序号（0 = 第一间）给地形；all = 没单独写的战斗 / 精英房；boss = 首领房
//   narrow [y0, y1]  窄墓道：可走的纵深收成这一条带（南北门附近敞开），两边是碎石和骨堆
//   pillars n        立柱 n 根：挡箭、挡剑气（双方都挡）、挡路；弓手会换纵深找干净的射线
//   hooks n          绞索钩 n 个：周期性落下，钩住下面的人（主角或敌人）——把敌人引到钩子下面
//   flames n         祭坛火墙 n 道：休眠 → 预警 → 燃烧，燃烧时封路（等它熄灭，或者跳过去）
//   gaps n           深渊裂口 n 道：横跨整个纵深，中间一座窄桥；掉下去受伤并回到边上，敌人被打下去直接摔死
export const STAGE_RULES = {
  // ① 墓穴入口：教学关。窄墓道里被夹击只能闪避穿过去换位；耐力条在这一关教；第一次见到佯攻
  s1: {
    rooms: { 1: { narrow: [56, 118] }, 2: { narrow: [50, 124] } },
    feintRoom: 1, // 这间房里第一个出手的腐骨兵必定佯攻（只一次），并提示怎么看
    teach: { stamina: true, narrow: true, feint: true },
  },
  // ② 骸骨回廊：立柱挡箭（站位）；烬翼「假冲 + 真冲」成对出现，逼你留一次闪避
  s2: {
    rooms: { all: { pillars: 3 } },
    wingPair: { gap: 160 }, // 烬翼成对俯冲（不受佯攻概率限制），两次成对俯冲之间至少隔多久
    teach: { pillars: true, wingPair: true },
  },
  // ③ 屠夫刑场：目标优先级（司祭的护咒让同伴不吃硬直——先切司祭）；屠夫正面格挡后反击（别对正面放技能）；绞索钩
  s3: {
    rooms: { all: { hooks: 3 } },
    teach: { hooks: true, priority: true },
  },
  // ④ 深渊祭坛：祭坛火墙周期性封路（时机）；精英的词缀按组合出，每种组合有自己的解法
  s4: {
    rooms: { all: { flames: 2 } },
    affixSets: [
      { set: ['shield', 'blink'], tip: '坚盾 + 迅影：正面打不动、连打会闪到你背后 —— 先用重击 / 上挑破盾，连段别超过 6 下' },
      { set: ['volatile', 'frenzy'], tip: '爆裂 + 狂暴：半血后变快、死后爆炸 —— 把它打进敌群里再收尾，杀完马上闪开' },
      { set: ['shield', 'volatile'], tip: '坚盾 + 爆裂：破盾以后别贴脸收尾，退半步再打' },
      { set: ['blink', 'frenzy'], tip: '迅影 + 狂暴：瞬移到背后的反击更快 —— 打几下就转身，预判它闪到哪边' },
    ],
    teach: { flames: true },
  },
  // ⑤ 残光深渊：每间房一种前面学过的局面 + 深渊裂口；首领残影读你的习惯（boss.js）
  s5: {
    rooms: {
      0: { gaps: 1 },
      1: { narrow: [54, 120], gaps: 1 },
      2: { pillars: 2, gaps: 1 },
      3: { hooks: 2, gaps: 1 },
      4: { flames: 1, gaps: 1 },
      5: { pillars: 2, flames: 1, gaps: 1 },
      all: { pillars: 2, gaps: 1 },
      boss: { gaps: 2 },
    },
    teach: { gaps: true },
  },
};

// 地形的参数
export const TERRAIN = {
  narrow: { openHalf: 110 }, // 南北门两边各敞开多宽
  pillar: { rx: 30, ry: 12, scale: 0.82, shotZ: 230 }, // 脚下占地（椭圆半径）、画多大、多高以下的飞行物会被挡住
  hook: {
    idle: [200, 320], warn: 54, drop: 8, hold: 60, up: 30, // 休眠（随机）、预警、落下、钩住、收回
    catchX: 30, catchY: 18, catchZ: 60, // 钩子正下方多大范围算钩住
    hit: { dmg: 10, kb: 0, stun: 58, stop: 6, shake: 6 }, // 钩住主角：伤害按关卡等级换算
    foeStun: 120, // 钩住敌人：吊着动不了这么久（不扣血）
  },
  flame: {
    dormant: 230, warn: 60, burn: 150, // 一个周期 440 帧；同一间房的几道火墙错开半个周期
    half: 24, height: 104, // 火墙的厚度（左右各多宽）、多高以下会被烧到（跳得够高能越过去）
    hit: { dmg: 12, kb: 9, launch: 5, stun: 20, stop: 4, shake: 5 },
    foeHit: { dmg: 40, kb: 9, launch: 5, stun: 30, stop: 4, shake: 4 },
    every: 30, // 同一个人在火里每隔多久再被烧一次
  },
  gap: {
    w: 112, // 裂口宽（助跑起跳跳得过去）
    bridge: [62, 108], // 窄桥的纵深
    fall: 0.12, // 主角掉下去损失多少比例的最大生命（不会因此死）
    eliteFall: 0.35, // 精英掉下去损失的生命比例（普通敌人直接摔死）
  },
};
