// 全局常量与小工具函数
// 游戏用固定的「逻辑分辨率」960x540 计算，再整体缩放到屏幕大小。

export const VIEW_W = 960;
export const VIEW_H = 540;

// 2.5D 坐标系：
//   x = 左右，y = 纵深（地面上的前后），z = 离地高度
//   屏幕坐标 = (x - 镜头, 地面顶部 + y - z)
export const GROUND_TOP = 318; // 纵深 y=0 在屏幕上的位置
export const DEPTH = 170; // 可走动的纵深范围 0..DEPTH
// 当前房间的宽度。每个房间大小不同，进入房间时修改 world.w
export const world = { w: 1800, band: null };
// 房间的可走纵深：默认 0..DEPTH；窄墓道（地形，见 terrain.js）收成一条带，南北门附近敞开
//   world.band = { y0, y1, open: [[x0, x1], ...] }
export function yLimits(x) {
  const b = world.band;
  if (!b) return [0, DEPTH];
  for (const [a, c] of b.open) if (x > a && x < c) return [0, DEPTH];
  return [b.y0, b.y1];
}
// AI 选目标点用：按纵深带收一收（m = 离边缘留多少）
export const clampY = (y, m = 8) => (world.band ? Math.max(world.band.y0 + m, Math.min(world.band.y1 - m, y)) : Math.max(m, Math.min(DEPTH - m, y)));
export const GRAVITY = 0.6;

export const FONT_NUM = '"Teko", "Arial Narrow", Impact, sans-serif';
export const FONT_TITLE = '"Ma Shan Zheng", "STKaiti", "KaiTi", serif';
export const FONT_UI = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif';

export const COLORS = {
  blade: '#7ff3ff', // 主角剑光
  ember: '#ffb347', // 霸体 / 火光
  blood: '#ff4d5e', // 受伤
  ink: '#e9e2d6', // 文字
  gold: '#ffd65a', // 暴击
  mp: '#4fa3ff',
};

export const REDUCED_MOTION =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function toScreen(x, y, z, camX) {
  return [x - camX, GROUND_TOP + y - z];
}

// '#rrggbb' → 'rgba(r,g,b,a)'
export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
