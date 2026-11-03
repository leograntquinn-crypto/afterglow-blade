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
  },
};

// 战场导演：给用新大脑的敌人分角色（前锋 / 包抄 / 外圈），保证总有人在压、保护连段
export const DIRECTOR = {
  period: 30, // 每几帧重新分一次角色
  pressAfter: [150, 130, 110], // 多久没人进攻，前锋的「压上」分数加倍
  // 连段保护：连段 combo 下以上、最近 recent 帧内还打中过人 → 别的敌人不开始新的进攻；最长 max 帧
  comboGuard: { combo: 3, recent: 42, max: 180 },
};
