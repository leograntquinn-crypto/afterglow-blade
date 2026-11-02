// ★ 特效数据表：调特效就改这里（和 moves.js 一样，代码只负责「按表执行」）
//
// 曲线：粒子一生（0 = 出生，1 = 消失）里某个量的变化，用关键帧描述，启动时预先采样成查找表。
// 发射器：一次喷出多少个、什么类型、寿命、速度、方向、阻力、重力、大小、颜色渐变、混合方式……

// ---------- 曲线 ----------
const N = 32;
function bake(keys) {
  const lut = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    let k = 1;
    while (k < keys.length - 1 && keys[k][0] < t) k++;
    const [t0, v0] = keys[k - 1], [t1, v1] = keys[k];
    const u = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 1;
    lut[i] = v0 + (v1 - v0) * (u * u * (3 - 2 * u)); // 平滑插值，没有折角
  }
  return lut;
}
export const CURVES = {
  one: bake([[0, 1], [1, 1]]),
  fade: bake([[0, 1], [1, 0]]),
  fadeLate: bake([[0, 1], [0.55, 0.9], [1, 0]]), // 前半段保持亮度，后半段才淡出
  pop: bake([[0, 0], [0.08, 1], [0.35, 0.85], [1, 0]]), // 一下子出现，慢慢淡出（烟、光晕）
  flash: bake([[0, 1], [0.15, 0.7], [1, 0]]),
  flicker: bake([[0, 0], [0.1, 1], [0.7, 0.8], [1, 0]]),
  grow: bake([[0, 0.55], [0.4, 0.9], [1, 1.25]]),
  shrink: bake([[0, 1], [0.6, 0.7], [1, 0.15]]),
  burst: bake([[0, 0.3], [0.25, 1.1], [1, 1.35]]), // 迅速撑开再缓慢变大
  swell: bake([[0, 0.4], [0.3, 1], [1, 1.9]]), // 烟：越散越大
};
export const curve = (lut, t) => lut[Math.max(0, Math.min(N, (t * N + 0.5) | 0))];

// ---------- 发射器 ----------
// type：粒子类型（决定怎么动、怎么画）
//   spark 拉长火花（沿速度方向）、ember 余烬（飘、闪烁）、smoke 烟、chip 碎片（重力 + 弹跳）、glow 光团、flare 星芒
// n：个数范围；调用时传入的 n 会覆盖；手机和低画质按比例减少
// speed / spread / angle：速度大小、扩散角（弧度）、基准角（0 = 朝 dir 方向水平，负数 = 向上）
// drag：每帧速度乘数；grav：每帧向下的加速度（负数 = 上飘）
// size：大小（像素）；sizeC / alphaC：大小和透明度随一生的曲线
// ramp：颜色渐变（hot = 白热 → 本色 → 变暗，cool = 偏白 → 本色，flat = 不变）
// blend：add = 叠加发光，normal = 普通遮挡
export const EMIT = {
  // 命中火花：快、短、白热，沿速度拉长
  spark: { type: 'spark', n: [8, 8], life: [8, 16], speed: [6, 14], angle: -0.15, spread: 1.15, drag: 0.8, grav: 0.32, size: [1.6, 3.2], stretch: 2.2, sizeC: 'shrink', alphaC: 'fadeLate', ramp: 'hot', blend: 'add' },
  // 余烬：火花里有一部分不马上熄灭，慢慢飘起、闪烁（这是「质感」的关键：命中后画面里留着一点余韵）
  ember: { type: 'ember', n: [3, 3], life: [22, 42], speed: [1.5, 4.5], angle: -0.6, spread: 1.4, drag: 0.92, grav: -0.04, size: [1.4, 2.6], sizeC: 'shrink', alphaC: 'flicker', ramp: 'hot', blend: 'add', sway: 0.25 },
  // 命中点的一团闪光
  hitGlow: { type: 'glow', n: [1, 1], life: [6, 6], speed: [0, 0], size: [15, 15], sizeC: 'burst', alphaC: 'flash', ramp: 'cool', blend: 'add', alpha: 0.5 },
  // 尘土：烟团贴图，普通混合，上飘、扩散、慢慢转
  dust: { type: 'smoke', n: [6, 6], life: [18, 30], speed: [0.8, 2.8], angle: -0.5, spread: 1.6, drag: 0.9, grav: -0.03, size: [8, 13], sizeC: 'swell', alphaC: 'pop', ramp: 'flat', color: '#b8aa9a', blend: 'normal', alpha: 0.42, spin: 0.03 },
  // 碎片：受重力、落地弹跳翻滚
  chip: { type: 'chip', n: [4, 4], life: [40, 70], speed: [2, 7], angle: -0.9, spread: 0.9, drag: 0.985, grav: 0.45, size: [5, 9], sizeC: 'one', alphaC: 'fadeLate', ramp: 'flat', blend: 'normal', spin: 0.5, bounce: 0.35 },
  // 碎片落地时溅起的一点灰
  puff: { type: 'smoke', n: [1, 1], life: [14, 20], speed: [0.3, 0.8], angle: -1.57, spread: 1, drag: 0.9, grav: -0.02, size: [5, 8], sizeC: 'swell', alphaC: 'pop', ramp: 'flat', color: '#a89a8c', blend: 'normal', alpha: 0.35, spin: 0.02 },
  // 蓄力汇聚的光点（往中心加速吸入，带拖尾）
  mote: { type: 'mote', n: [10, 10], life: [18, 18], size: [2.4, 3.6], sizeC: 'grow', alphaC: 'pop', ramp: 'cool', blend: 'add' },
};
