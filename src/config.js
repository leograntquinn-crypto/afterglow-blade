// 全局常量与小工具函数
// 游戏用固定的「逻辑分辨率」960x540 计算，再整体缩放到屏幕大小。

export const VIEW_W = 960;
export const VIEW_H = 540;

// 2.5D 坐标系：
//   x = 左右，y = 纵深（地面上的前后），z = 离地高度
//   屏幕坐标 = (x - 镜头, 地面顶部 + y - z)
export const GROUND_TOP = 318; // 纵深 y=0 在屏幕上的位置
export const DEPTH = 170; // 可走动的纵深范围 0..DEPTH
export const ARENA_W = 1800; // 场地总宽度
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
