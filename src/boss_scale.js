// ★ 首领动态难度（第 12 项）：按你的战力相对「这一关该有的战力」强化首领 +10% ～ +50%。
//
// 优先加「行为强度」：出招更频繁（休息时间缩短）、连段更长（三连斩多一两刀）、读习惯更狠（残影，boss.js）。
// 数值只在这个范围里跟一点：首领血量最多 +25%（强化幅度的一半），伤害不加 —— 你的成长不会被抵消
// （战力是参考值的 2 倍时，你的伤害约翻倍，首领血量只多 25%）。战力不到参考值时不强化。
//
// REF_POWER[L]：等级 L 的「参考战力」—— 属性点力量 / 体质各一半、八个成长槽同等级精良装备（4 级起加翅膀 / 光幕），200 套随机装备的平均
//   （progression.js 的 power()；生成脚本 tools/refpower.js，方法见 docs/AUDIT_PRE_GODOT.md 第 12 项）
export const REF_POWER = [0, 2388, 2716, 3009, 3510, 3747, 3965, 4179, 4377, 4568, 4750, 4931, 5103, 5272, 5432, 5595, 5746, 5899, 6036, 6184, 6328, 6460, 6601, 6740, 6859, 6988, 7123, 7239, 7366, 7485, 7605];

export const BOSS_SCALE = {
  min: 0.1, max: 0.5, // 强化幅度的范围
  full: 2, // 战力达到参考值的这么多倍时强化到顶
  hp: 0.5, // 血量跟随强化幅度的比例（+50% 强化 → 血量 +25%）
  comboAt: [0.25, 0.45], // 强化到这些幅度时，三连斩各多一刀
  habit: 2, // 读习惯的力度：首领的习惯权重 × (1 + 强化幅度 × habit)
};

// 返回强化幅度 0（不强化）或 0.1～0.5
export function bossBonus(playerPower, lv) {
  const ref = REF_POWER[Math.max(1, Math.min(REF_POWER.length - 1, Math.round(lv)))];
  const r = playerPower / ref;
  if (!(r > 1)) return 0;
  const B = BOSS_SCALE;
  return Math.min(B.max, B.min + ((B.max - B.min) * (r - 1)) / (B.full - 1));
}
