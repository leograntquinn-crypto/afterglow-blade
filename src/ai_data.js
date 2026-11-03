// ★ 敌人「性格」表：调敌人智能就改这里（和 moves.js、fx_data.js 一样，代码只负责按表执行）。设计见 docs/DESIGN_AI.md
//
// 数组 [普通, 噩梦, 地狱]：按难度取值（试炼按层数：第 10 层起算噩梦，第 20 层起算地狱）。
// 所有时间都是帧（60 帧 = 1 秒）。

export const AI_PROFILES = {
  // 腐骨兵：基础步兵。踩线、抓你挥空、两个以上时包抄夹击
  grunt: {
    reaction: [18, 14, 10], // 反应时间：看到的是多少帧以前的主角
    think: 8, // 每几帧重新给意图打分
    commit: 20, // 选中的意图至少坚持几帧（不来回抽搐）
    noise: 0.25, // 打分里的随机成分（同一个局面不会每次都一样）
    // 各意图的基础权重：press 压上出招、space 踩线、retreat 后撤、strafe 侧移换纵深、flank 包抄
    weights: { press: 1, space: 0.9, retreat: 0.6, strafe: 0.8, flank: 1.4 },
    // 踩线：守在攻击距离外 band 之间，period 帧进退一个来回（刚好在你刀够不到的地方晃，诱你挥空）
    space: { band: [26, 58], period: 72, ring: 80 },
    // 主角逼近（面向我、在这个距离内、正在朝我走或者在出招）→ 后撤一步
    backoff: 150,
    // 惩罚打空：你的地面普攻挥空了，它在头上冒「破绽」，短预警后突刺过来
    //   range 多远以内会抓；windup 预警帧（再乘难度的预警倍率）；chance 每次挥空出手的概率；cd 两次惩罚之间至少隔多久
    punish: { range: 210, windup: 22, chance: [0.5, 0.7, 0.9], cd: [210, 170, 130] },
    // 包抄：绕到主角另一侧。minRoom 另一侧至少要留这么宽（靠墙太近就不包抄）；depth 绕的时候先往纵深让开多少；
    // onScreen：离屏幕边缘这么远以内才出手（所有用这个大脑的敌人都一样，不从画面外打你）
    flank: { minRoom: 130, depth: 62, onScreen: 40 },
    roles: true, // 参与导演的前锋 / 包抄 / 外圈分工
  },

  // 铁甲屠夫：霸体重击。逼墙角、甩开贪刀、正面格挡蓄力重击、看你闪避晚半拍砸下
  brute: {
    reaction: [18, 14, 10],
    think: 10,
    commit: 24,
    noise: 0.2,
    onScreen: 40,
    // 逼墙角：主角离墙 wallDist 以内时，屠夫从开阔的那一侧逼过去（你后面就是墙）；绕边时先往纵深让开 depth
    corner: { wallDist: 300, depth: 70 },
    // 甩开贪刀：window 帧内被你打中 hits 下、你还贴着它 → 头上「甩开」、身边一圈红圈，短预警后把你震开（霸体照常）
    //   贴着它连打的上限就是 hits；打几下就退开，或者先破防，就不会被甩
    shove: { hits: [6, 5, 4], window: 110, near: 120, windup: 24, r: [124, 50], recover: 34, cd: [300, 240, 180],
      hit: { dmg: 8, kb: 12, stun: 22, stop: 5, shake: 6 } },
    // 正面格挡：看到你面向它蓄力、或者重击 / 技能正朝它打过来 → 举斧格挡 time 帧：正面来的攻击全挡（必杀除外），背后照样打得到
    guard: { range: 230, time: 50, cd: [260, 220, 180] },
    // 延迟重砸：重砸预警过半时看到你在闪避 → 斧头多举 extra 帧再砸（红圈位置不变，看圈不看节奏就不会被骗）
    delay: { extra: [14, 16, 18], chance: [0.6, 0.8, 1] },
  },

  // 影弓手：保持射线、预判射击、躲到屠夫身后、被逼到墙边时侧闪加踢
  archer: {
    reaction: [18, 14, 10],
    think: 10,
    commit: 24,
    noise: 0.2,
    onScreen: 40,
    weights: { kite: 1, cover: 1.3, lane: 1.6 },
    kite: [250, 360], // 平时和你保持的距离
    // 掩体：附近有屠夫时，冷却中躲到屠夫身后（离屠夫 behind 远）；冷却好了先走出到射线干净的纵深再射
    cover: { behind: 72, search: 520 },
    // 射线：箭的路线上 clear 纵深以内有同伴就算挡住，换到旁边 step 远的纵深去射
    lane: { clear: 22, step: 46, maxDy: 40 },
    // 预判：按看到的你的纵深移动方向，把箭往你要去的位置偏（偏多少乘 k、最多 max）。预警时红线就是箭的真实路线
    lead: { k: [0.55, 0.75, 0.95], max: 60 },
    // 被逼到墙边：后面 wall 以内是墙、你在 near 以内 → 先往纵深侧闪 side，再接一记飞踢把你踢开
    corner: { wall: 90, near: 130, side: 5, kick: { kind: 'kick', range: 90, windup: 16, hitAt: 3, dur: 6, recover: 30, speed: 5, cd: [140, 120, 100],
      hit: { box: { x: 34, w: 64, d: 24, z0: 0, z1: 80 }, dmg: 6, kb: 11, stun: 18, stop: 4, shake: 4 } } },
  },
};

// 战场导演：给用新大脑的敌人分角色（前锋 / 包抄 / 外圈），保证总有人在压、保护连段
export const DIRECTOR = {
  period: 30, // 每几帧重新分一次角色
  pressAfter: [150, 130, 110], // 多久没人进攻，前锋的「压上」分数加倍
  // 连段保护：连段 combo 下以上、最近 recent 帧内还打中过人 → 别的敌人不开始新的进攻；最长 max 帧
  comboGuard: { combo: 3, recent: 42, max: 180 },
};
