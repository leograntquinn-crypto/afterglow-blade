// 场景美术：程序生成的贴图 + 多层视差
//
// 「贴图」不是图片文件，而是启动时用代码在离屏画布上画一次、之后反复使用的纹理：
//   砖墙、石柱、旗帜、地砖、雾 —— 每套主题生成一份并缓存。每帧只做 drawImage，非常快。
//
// 视差层（镜头移动 1 像素时各层移动多少）：
//   墙 + 石柱 0.5 → 地砖每一行 0.88~1.18（越靠近镜头越快，形成透视）→ 前景剪影 1.35

import { afterBoot } from './boot.js';
import { VIEW_W, VIEW_H, GROUND_TOP, rand } from './config.js';
import { shade } from './rig.js';
import { MOBILE } from './sprite.js';
import { propsS } from './props_sprites.js';
import { drawLightTex } from './draw.js';

export const THEMES = {
  crypt: {
    brick: '#2c2232', mortar: '#0e0a12', pillar: '#30263a', floor: '#3a2e3a', banner: '#6a1e2a', emblem: '#c9a45c',
    torch: '255,170,80', flame: '#ffcf7a', ambient: 'rgba(5,3,10,0.6)', fog: '150,110,170', mote: '255,214,160', grade: '#6a3a8a', embers: false,
  },
  hall: {
    brick: '#232a38', mortar: '#0a0d14', pillar: '#2a3346', floor: '#2e3442', banner: '#1f3a6a', emblem: '#9fb3c8',
    torch: '150,190,255', flame: '#d6e8ff', ambient: 'rgba(3,5,12,0.62)', fog: '120,150,200', mote: '200,220,255', grade: '#2a4a8a', embers: false,
  },
  gallows: {
    brick: '#34221e', mortar: '#120a08', pillar: '#3a2622', floor: '#3e2c28', banner: '#7a1a10', emblem: '#d8b25a',
    torch: '255,110,60', flame: '#ffb07a', ambient: 'rgba(10,3,2,0.6)', fog: '170,90,70', mote: '255,150,90', grade: '#8a2a1a', embers: true,
  },
  altar: {
    brick: '#1e2e26', mortar: '#08100c', pillar: '#24382e', floor: '#283830', banner: '#1a4a2a', emblem: '#8fe3a8',
    torch: '110,227,138', flame: '#d6ffe0', ambient: 'rgba(2,8,5,0.62)', fog: '90,170,120', mote: '160,255,190', grade: '#1a6a3a', embers: true,
  },
  abyss: {
    brick: '#1c1c3a', mortar: '#06060f', pillar: '#22244a', floor: '#22243e', banner: '#3a1a6a', emblem: '#c49bff',
    torch: '180,107,255', flame: '#efe0ff', ambient: 'rgba(3,2,12,0.66)', fog: '130,100,220', mote: '210,180,255', grade: '#4a2a9a', embers: true,
  },
};

const mk = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

// 可复现的随机数（同一主题每次生成的纹理都一样）
function seeded(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TILE = 600; // 墙和柱子的重复周期
const FLOOR_ROWS = [[0, 14, 70], [14, 32, 86], [32, 56, 104], [56, 88, 126], [88, 132, 152], [132, 228, 190]]; // [起, 止, 石板宽]

function speckle(x, R, w, h, n, color) {
  x.fillStyle = color;
  for (let i = 0; i < n; i++) x.fillRect(R() * w, R() * h, 1 + (R() < 0.2), 1);
}

function crack(x, R, x0, y0, len) {
  x.beginPath();
  x.moveTo(x0, y0);
  let px = x0, py = y0;
  for (let i = 0; i < 4; i++) {
    px += (R() - 0.5) * len;
    py += R() * len * 0.6;
    x.lineTo(px, py);
  }
  x.stroke();
}

// ---------- 砖墙（含拱形壁龛和锁链）----------
function makeWall(th, R) {
  const c = mk(TILE, GROUND_TOP), x = c.getContext('2d');
  x.fillStyle = th.mortar;
  x.fillRect(0, 0, TILE, GROUND_TOP);
  for (let row = 0, y = 0; y < GROUND_TOP; row++, y += 22) {
    let bx = row % 2 ? -26 : 0;
    while (bx < TILE) {
      const bw = 44 + Math.floor(R() * 18);
      const f = 0.8 + R() * 0.35;
      x.fillStyle = shade(th.brick, f);
      x.fillRect(bx + 1, y + 1, bw - 2, 20);
      x.fillStyle = shade(th.brick, f * 1.25);
      x.fillRect(bx + 1, y + 1, bw - 2, 2);
      x.fillStyle = shade(th.brick, f * 0.7);
      x.fillRect(bx + 1, y + 18, bw - 2, 3);
      bx += bw;
    }
  }
  speckle(x, R, TILE, GROUND_TOP, 2600, 'rgba(0,0,0,0.25)');
  speckle(x, R, TILE, GROUND_TOP, 900, 'rgba(255,255,255,0.05)');
  x.strokeStyle = 'rgba(0,0,0,0.5)';
  x.lineWidth = 1.2;
  for (let i = 0; i < 6; i++) crack(x, R, R() * TILE, R() * GROUND_TOP * 0.8, 16);

  // 拱形壁龛（两根柱子之间）
  for (const ax of [150, 450]) {
    const w = 170, top = 112;
    const g = x.createLinearGradient(0, top, 0, GROUND_TOP);
    g.addColorStop(0, 'rgba(0,0,0,0.92)');
    g.addColorStop(1, 'rgba(0,0,0,0.6)');
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(ax - w / 2, GROUND_TOP);
    x.lineTo(ax - w / 2, top + w / 2);
    x.arc(ax, top + w / 2, w / 2, Math.PI, 0);
    x.lineTo(ax + w / 2, GROUND_TOP);
    x.fill();
    // 拱券石
    x.strokeStyle = shade(th.brick, 1.2);
    x.lineWidth = 7;
    x.beginPath();
    x.arc(ax, top + w / 2, w / 2 + 4, Math.PI, 0);
    x.stroke();
    x.strokeStyle = th.mortar;
    x.lineWidth = 1.5;
    for (let k = 1; k < 10; k++) {
      const a = Math.PI + (k / 10) * Math.PI;
      x.beginPath();
      x.moveTo(ax + Math.cos(a) * (w / 2), top + w / 2 + Math.sin(a) * (w / 2));
      x.lineTo(ax + Math.cos(a) * (w / 2 + 8), top + w / 2 + Math.sin(a) * (w / 2 + 8));
      x.stroke();
    }
  }
  // 顶部和底部的阴影（天花板压暗，墙角接触阴影）
  let g = x.createLinearGradient(0, 0, 0, 120);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, TILE, 120);
  g = x.createLinearGradient(0, GROUND_TOP - 40, 0, GROUND_TOP);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  x.fillStyle = g;
  x.fillRect(0, GROUND_TOP - 40, TILE, 40);
  // 垂下的锁链
  x.strokeStyle = 'rgba(0,0,0,0.75)';
  x.lineWidth = 2;
  for (const cx0 of [95, 210, 520]) {
    const len = 60 + R() * 80;
    for (let y = 0; y < len; y += 7) {
      x.beginPath();
      x.ellipse(cx0 + Math.sin(y * 0.05) * 3, y, 2.5, 4, 0, 0, Math.PI * 2);
      x.stroke();
    }
  }
  return c;
}

// ---------- 石柱 + 旗帜 ----------
function makePillars(th, R) {
  const c = mk(TILE, GROUND_TOP), x = c.getContext('2d');
  for (const [px, banner] of [[0, false], [300, true], [600, false]]) {
    const w = 52;
    // 柱身：左亮右暗
    const g = x.createLinearGradient(px - w / 2, 0, px + w / 2, 0);
    g.addColorStop(0, shade(th.pillar, 1.35));
    g.addColorStop(0.35, shade(th.pillar, 1.05));
    g.addColorStop(1, shade(th.pillar, 0.55));
    x.fillStyle = g;
    x.fillRect(px - w / 2, 30, w, GROUND_TOP - 30);
    x.fillStyle = 'rgba(0,0,0,0.35)';
    for (let y = 60; y < GROUND_TOP - 30; y += 46) x.fillRect(px - w / 2, y, w, 2);
    x.fillStyle = 'rgba(255,255,255,0.06)';
    x.fillRect(px - w / 2 + 6, 30, 3, GROUND_TOP - 60);
    // 柱头、柱础
    for (const [y, h, ww] of [[24, 16, w + 18], [40, 6, w + 8], [GROUND_TOP - 28, 10, w + 10], [GROUND_TOP - 18, 18, w + 20]]) {
      const gg = x.createLinearGradient(0, y, 0, y + h);
      gg.addColorStop(0, shade(th.pillar, 1.3));
      gg.addColorStop(1, shade(th.pillar, 0.6));
      x.fillStyle = gg;
      x.fillRect(px - ww / 2, y, ww, h);
    }
    // 符文刻痕
    x.strokeStyle = 'rgba(0,0,0,0.45)';
    x.lineWidth = 1.5;
    x.beginPath();
    x.moveTo(px, 90);
    x.lineTo(px, 140);
    x.moveTo(px - 8, 104);
    x.lineTo(px + 8, 116);
    x.stroke();
    if (banner) {
      // 破旧的旗帜
      const bx = px + w / 2 + 8, by = 52, bw = 46, bh = 120;
      x.fillStyle = '#1a1414';
      x.fillRect(bx - 4, by - 4, bw + 8, 5);
      const bg = x.createLinearGradient(bx, 0, bx + bw, 0);
      bg.addColorStop(0, shade(th.banner, 1.2));
      bg.addColorStop(1, shade(th.banner, 0.65));
      x.fillStyle = bg;
      x.beginPath();
      x.moveTo(bx, by);
      x.lineTo(bx + bw, by);
      let yy = by + bh;
      x.lineTo(bx + bw, yy - 10);
      for (let i = 6; i >= 0; i--) x.lineTo(bx + (bw * i) / 6, yy - (i % 2 ? 0 : 14) - R() * 8);
      x.closePath();
      x.fill();
      x.strokeStyle = th.emblem;
      x.globalAlpha = 0.7;
      x.lineWidth = 2;
      x.beginPath();
      x.arc(bx + bw / 2, by + 44, 12, 0, Math.PI * 2);
      x.moveTo(bx + bw / 2, by + 28);
      x.lineTo(bx + bw / 2, by + 60);
      x.stroke();
      x.globalAlpha = 1;
      x.fillStyle = 'rgba(0,0,0,0.25)';
      for (let i = 0; i < 4; i++) x.fillRect(bx + R() * bw, by + R() * bh * 0.8, 1, 10 + R() * 20);
    }
    // 火把托架
    x.fillStyle = '#1a1210';
    x.fillRect(px - 4, 172, 8, 20);
    x.fillRect(px - 9, 168, 18, 6);
  }
  return c;
}

// ---------- 地砖：每一行一张贴图，行越靠前石板越宽 ----------
function makeFloorRow(th, R, [y0, y1, sw]) {
  const h = y1 - y0, w = sw * 7; // 画 7 块，最后一块复制第一块，按 6 块的周期平铺就无缝
  const c = mk(w, h), x = c.getContext('2d');
  const depth = y0 / 228;
  x.fillStyle = shade(th.floor, 0.35);
  x.fillRect(0, 0, w, h);
  let bx = R() * -sw * 0.5;
  for (let i = 0; i < 8; i++) {
    const f = (0.72 + R() * 0.32) * (0.75 + depth * 0.35);
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, shade(th.floor, f * 1.15));
    g.addColorStop(1, shade(th.floor, f * 0.85));
    x.fillStyle = g;
    x.fillRect(bx + 2, 2, sw - 4, h - 3);
    x.fillStyle = 'rgba(255,255,255,0.07)';
    x.fillRect(bx + 2, 2, sw - 4, 1.5);
    bx += sw;
  }
  x.drawImage(c, 0, 0, sw, h, sw * 6, 0, sw, h);
  speckle(x, R, w, h, (w * h) / 40, 'rgba(0,0,0,0.22)');
  speckle(x, R, w, h, (w * h) / 160, 'rgba(255,255,255,0.05)');
  x.strokeStyle = 'rgba(0,0,0,0.45)';
  x.lineWidth = 1;
  for (let i = 0; i < 3; i++) crack(x, R, R() * w, R() * h * 0.3, h * 0.4);
  // 污渍
  for (let i = 0; i < 2; i++) {
    const cx = R() * w, cy = R() * h, r = 10 + R() * h * 0.6;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(0,0,0,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  return c;
}

// ---------- 雾 ----------
function makeFog(th, R) {
  const c = mk(1024, 220), x = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const cx = R() * 1024, cy = 60 + R() * 100, r = 60 + R() * 120;
    for (const off of [0, 1024, -1024]) {
      const g = x.createRadialGradient(cx + off, cy, 0, cx + off, cy, r);
      g.addColorStop(0, `rgba(${th.fog},0.16)`);
      g.addColorStop(1, `rgba(${th.fog},0)`);
      x.fillStyle = g;
      x.fillRect(cx + off - r, cy - r, r * 2, r * 2);
    }
  }
  return c;
}

const cache = new Map();
function assets(name) {
  if (!cache.has(name)) {
    const th = THEMES[name];
    const R = seeded(name.length * 9973 + name.charCodeAt(0));
    cache.set(name, {
      wall: makeWall(th, R),
      pillars: makePillars(th, R),
      rows: FLOOR_ROWS.map((row) => ({ row, img: makeFloorRow(th, R, row) })),
      fog: makeFog(th, R),
    });
  }
  return cache.get(name);
}

// 横向无缝平铺一张贴图
function tile(ctx, img, offset, y, period = img.width) {
  let x = -(((offset % period) + period) % period);
  for (; x < VIEW_W; x += period) ctx.drawImage(img, x, y);
}

// ---------- 浮尘 / 火星（屏幕空间粒子）----------
const motes = Array.from({ length: 70 }, () => ({ x: rand(0, VIEW_W), y: rand(0, VIEW_H), s: rand(0.6, 2.2), v: rand(0.1, 0.5), ph: rand(0, 6.28) }));
const embers = Array.from({ length: 26 }, () => ({ x: rand(0, VIEW_W), y: rand(0, VIEW_H), v: rand(0.6, 1.6), ph: rand(0, 6.28) }));

// ---------------- 对外接口 ----------------
// 返回火把的屏幕位置，给光照系统用
export function drawScenery(ctx, camX, t, name = 'crypt', room = null) {
  if (envReady()) return drawEnv(ctx, camX, t, name, room);
  const th = THEMES[name], A = assets(name);
  const par = camX * 0.5;
  ctx.fillStyle = th.mortar;
  ctx.fillRect(0, 0, VIEW_W, GROUND_TOP);
  tile(ctx, A.wall, par, 0);

  // 从高处窗口射下的光柱
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = Math.floor(par / TILE) - 1; i <= Math.floor((par + VIEW_W) / TILE) + 1; i++) {
    const cx = i * TILE + 150 - par;
    const a = 0.05 + 0.02 * Math.sin(t * 0.02 + i);
    const g = ctx.createLinearGradient(0, 0, 0, GROUND_TOP + 120);
    g.addColorStop(0, `rgba(${th.fog},${a * 2})`);
    g.addColorStop(1, `rgba(${th.fog},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - 30, 0);
    ctx.lineTo(cx + 10, 0);
    ctx.lineTo(cx + 120, GROUND_TOP + 120);
    ctx.lineTo(cx - 40, GROUND_TOP + 120);
    ctx.fill();
  }
  ctx.restore();

  tile(ctx, A.pillars, par, 0, TILE);

  // 火把火焰（动态）
  const torches = [];
  for (let i = Math.floor(par / 300) - 1; i <= Math.floor((par + VIEW_W) / 300) + 1; i++) {
    const tx = i * 300 - par, ty = 160;
    const fl = 0.85 + Math.sin(t * 0.31 + i * 1.7) * 0.1 + Math.sin(t * 0.73 + i) * 0.06;
    torches.push([tx, ty, fl]);
    drawLightTex(ctx, 'glow_warm', `rgb(${th.torch})`, tx, ty, 300 * fl, 300 * fl, 0.35); // 火光：光照包 glow_warm（可见半径约 90）
    ctx.fillStyle = `rgba(${th.torch},0.9)`;
    ctx.beginPath();
    ctx.ellipse(tx, ty + 2, 7 * fl, 13 * fl, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = th.flame;
    ctx.beginPath();
    ctx.ellipse(tx, ty + 4, 4 * fl, 8 * fl, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 地面：踢脚线 + 每行不同速度的地砖
  ctx.fillStyle = shade(th.pillar, 0.5);
  ctx.fillRect(0, GROUND_TOP - 8, VIEW_W, 8);
  for (const { row, img } of A.rows) {
    const mid = (row[0] + row[1]) / 2;
    tile(ctx, img, camX * (0.88 + (mid / 228) * 0.3), GROUND_TOP + row[0], img.width - row[2]);
  }
  // 墙脚的接触阴影
  const sh = ctx.createLinearGradient(0, GROUND_TOP, 0, GROUND_TOP + 40);
  sh.addColorStop(0, 'rgba(0,0,0,0.55)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, GROUND_TOP, VIEW_W, 40);
  // 火光在地面上的倒影
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [tx, , fl] of torches) {
    drawLightTex(ctx, 'glow_warm', `rgb(${th.torch})`, tx, GROUND_TOP + 30, 366 * fl, 150, 0.12); // 地面倒影：压扁的 glow_warm
  }
  ctx.restore();
  return torches;
}

// 角色之后、光照之前：地面附近的雾气
export function drawFog(ctx, camX, t, name = 'crypt') {
  const A = assets(name);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.55;
  tile(ctx, A.fog, camX * 0.7 + t * 0.25, GROUND_TOP - 110);
  ctx.globalAlpha = 0.35;
  tile(ctx, A.fog, camX * 1.1 - t * 0.15, GROUND_TOP + 70);
  ctx.restore();
}

// 光照之后：前景剪影（垂下的锁链、地上的碎石）和发光的浮尘
export function drawForeground(ctx, camX, t, name = 'crypt', room = null) {
  const th = THEMES[name];
  if (envReady()) drawEnvForeground(ctx, camX, room);
  else drawProcForeground(ctx, camX, t);
  drawParticles(ctx, camX, t, th);
}

function drawProcForeground(ctx, camX, t) {
  const off = camX * 1.35;
  ctx.fillStyle = '#030205';
  ctx.strokeStyle = '#030205';
  for (let i = Math.floor(off / 700) - 1; i <= Math.floor((off + VIEW_W) / 700) + 1; i++) {
    const x = i * 700 + 230 - off;
    // 锁链
    ctx.lineWidth = 4;
    const len = 70 + ((i * 37) % 60);
    for (let y = -4; y < len; y += 11) {
      ctx.beginPath();
      ctx.ellipse(x + Math.sin(t * 0.02 + i) * 2, y, 4, 6.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 碎石和骨头
    ctx.beginPath();
    ctx.moveTo(x + 120, VIEW_H);
    ctx.lineTo(x + 140, VIEW_H - 14);
    ctx.lineTo(x + 170, VIEW_H - 20);
    ctx.lineTo(x + 196, VIEW_H - 8);
    ctx.lineTo(x + 230, VIEW_H - 12);
    ctx.lineTo(x + 250, VIEW_H);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x + 260, VIEW_H - 6);
    ctx.lineTo(x + 300, VIEW_H - 16);
    ctx.stroke();
  }
}

function drawParticles(ctx, camX, t, th) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const m of motes) {
    m.y -= m.v * 0.3;
    m.x += Math.sin(t * 0.01 + m.ph) * 0.2;
    if (m.y < -4) { m.y = VIEW_H + 4; m.x = rand(0, VIEW_W); }
    const sx = ((m.x - camX * 0.15 * m.s) % VIEW_W + VIEW_W) % VIEW_W;
    ctx.globalAlpha = 0.25 + 0.25 * Math.sin(t * 0.05 + m.ph);
    ctx.fillStyle = `rgb(${th.mote})`;
    ctx.fillRect(sx, m.y, m.s, m.s);
  }
  if (th.embers) {
    for (const e of embers) {
      e.y -= e.v;
      e.x += Math.sin(t * 0.03 + e.ph) * 0.6;
      if (e.y < -4) { e.y = VIEW_H + 4; e.x = rand(0, VIEW_W); }
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * 0.1 + e.ph);
      ctx.fillStyle = `rgb(${th.torch})`;
      ctx.fillRect(e.x, e.y, 2, 2);
    }
  }
  ctx.restore();
}

// ================= 手绘环境（ART_V4 ENV-1 地宫套件 + ENV-2 五关远景）=================
// 从后往前：L0 远景（每关一张，视差 0.3）→ L1 后墙（wall_a / wall_b 按房间二选一，0.9）+ 墙上的火把台、旗帜
//          → L2 地面（切成细条，越靠近镜头移动越快，做出透视）→ L3 贴花（按房间撒）→ 按关卡主题整体调色
//          L4 前景剪影（1.35）在光照之后画。素材是中性灰，五关的色调由引擎乘色得到。
// 桌面读 2 倍图、按一半画；手机读 1 倍图（_1x，内存是 2 倍图的 1/4）。
// 远景和每关的专属贴花只在当前关载入，换关时释放上一关的。
const ENV_DIR = 'assets/env/';
const PX = MOBILE ? 1 : 0.5; // 图片像素 → 游戏逻辑像素
const SUF = MOBILE ? '_1x' : '';
const STAGE_OF = { crypt: 'stage_01', hall: 'stage_02', gallows: 'stage_03', altar: 'stage_04', abyss: 'stage_05' };
// 墙上的布置（逻辑像素，以一张墙 1024 宽为周期）：火焰位置对齐素材里画好的空火把台
const WALL_DECOR = {
  wall_a: { torches: [[36, 145], [365, 145], [996, 145]], banners: [[657, 104]], beams: [530] },
  wall_b: { torches: [[122, 119], [614, 119]], sconces: [[1000, 119]], beams: [232, 366, 498] },
};
const SCONCE_SCALE = 0.5, BANNER_SCALE = 0.8;

let env = null;
let curStage = null;
const imgs = new Map(); // id → { im, ok }

function loadImg(id) {
  let e = imgs.get(id);
  if (!e) {
    const im = new Image();
    e = { im, ok: false };
    im.onload = () => (e.ok = true);
    im.src = `${ENV_DIR}${id}${SUF}.webp`;
    imgs.set(id, e);
  }
  return e;
}
function dropImg(id) {
  const e = imgs.get(id);
  if (!e) return;
  e.im.onload = null;
  e.im.src = '';
  imgs.delete(id);
}
const got = (id) => {
  const e = imgs.get(id);
  return e && e.ok ? e.im : null;
};

if (typeof fetch === 'function' && typeof Image !== 'undefined') afterBoot(() => { // 大地图和主角先载（见 boot.js）
  fetch(ENV_DIR + 'env.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((m) => {
      if (!m) return;
      env = m;
      for (const w of m.walls) loadImg(w.id);
      loadImg(m.floor.id);
      for (const d of m.decals) if (!d.stage) loadImg(d.id);
      for (const f of m.fg) loadImg(f.id);
      if (curStage) { const s = curStage; curStage = null; useStage(s); }
    })
    .catch(() => {});
});

// 后墙和地面载好之前一直用程序生成的场景
function envReady() {
  return !!(env && got(env.floor.id) && env.walls.every((w) => got(w.id)));
}

// 换关：载入这一关的远景和专属贴花，释放上一关的
function useStage(st) {
  if (st === curStage) return;
  if (env && curStage) {
    dropImg(curStage);
    for (const d of env.decals) if (d.stage === curStage) dropImg(d.id);
  }
  curStage = st;
  if (!env) return;
  loadImg(st);
  for (const d of env.decals) if (d.stage === st) loadImg(d.id);
}

// 地形（terrain.js）用的场景素材：按 id 取一张（第一次取时开始载入；没载好返回 null），ENV_PX = 图片像素 → 逻辑像素
export const ENV_PX = PX;
export function envImg(id) {
  if (!env) return null;
  loadImg(id);
  return got(id);
}
export const envMeta = () => env;
// 某一关的远景（深渊裂口里能看到的那一层）
export const envBackdrop = (st) => (env ? envImg(st) : null);

// 给调试和测试用：envDebug.wall 强制用某一面后墙
export const envDebug = { wall: null };
export function envStatus() {
  return { ready: envReady(), stage: curStage, loaded: [...imgs.entries()].filter(([, e]) => e.ok).map(([id]) => id) };
}

function hash(i) {
  let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}
const roomSeed = (room) => (room ? hash(room.x * 73 + room.y * 977 + 11) : 7);

function mixHex(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(255 - (255 - v) * k));
  return `rgb(${c})`;
}
const tints = {};
const tintOf = (name) => (tints[name] ??= mixHex(THEMES[name].grade, 0.42));
const bannerTints = {};
const bannerTintOf = (name) => (bannerTints[name] ??= mixHex(shade(THEMES[name].banner, 1.6), 0.85));

// 地面每一条的视差：最远（墙脚）0.88，最近 1.18
const floorRate = (y) => 0.88 + (y / 228) * 0.3;

const decalCache = new WeakMap();
function roomDecals(room, stage) {
  const hit = room && decalCache.get(room);
  if (hit && hit.stage === stage) return hit.list;
  const w = room?.w ?? 1400;
  const R = seeded(roomSeed(room) ^ (stage.charCodeAt(7) * 7919));
  const shared = env.decals.filter((d) => !d.stage), own = env.decals.filter((d) => d.stage === stage);
  const n = Math.max(3, Math.round(w / 230)), list = [];
  for (let i = 0; i < n; i++) {
    const pool = own.length && R() < 0.35 ? own : shared;
    const d = pool[Math.floor(R() * pool.length)];
    const y = 16 + R() * 196; // 地面带里的纵深（逻辑像素，0 = 墙脚）
    list.push({ d, x: 50 + ((i + R() * 0.8) * (w - 100)) / n, y, s: (0.62 + R() * 0.28) * (0.85 + (y / 222) * 0.3), flip: R() < 0.5, a: 0.75 + R() * 0.25 });
  }
  if (room) decalCache.set(room, { stage, list });
  return list;
}

function drawEnv(ctx, camX, t, name, room) {
  const th = THEMES[name] ?? THEMES.crypt;
  useStage(STAGE_OF[name] ?? 'stage_01');
  ctx.fillStyle = th.mortar;
  ctx.fillRect(-60, -60, VIEW_W + 120, GROUND_TOP + 60);

  // L0 远景
  const bd = got(curStage), bdm = env.backdrops[curStage];
  if (bd) {
    const w = bdm.w * 0.5, h = bdm.h * 0.5;
    for (let x = -((((camX * bdm.parallax) % w) + w) % w) - w; x < VIEW_W + 60; x += w) ctx.drawImage(bd, x, 0, w, h);
  }

  // L1 后墙
  const wm = env.walls.find((w) => w.id === envDebug.wall) ?? env.walls[roomSeed(room) % env.walls.length], wall = got(wm.id), deco = WALL_DECOR[wm.id] ?? {};
  const W = wm.w * 0.5, WH = wm.h * 0.5, par = camX * wm.parallax;
  const i0 = Math.floor(par / W) - 1, i1 = Math.floor((par + VIEW_W) / W) + 1;
  for (let i = i0; i <= i1; i++) ctx.drawImage(wall, i * W - par, 0, W, WH);

  // 从墙上的破洞、窗口照进来的光柱
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = i0; i <= i1; i++) {
    for (const bx of deco.beams ?? []) {
      const cx = i * W - par + bx;
      if (cx < -200 || cx > VIEW_W + 100) continue;
      const a = 0.05 + 0.02 * Math.sin(t * 0.02 + i + bx);
      const g = ctx.createLinearGradient(0, 40, 0, GROUND_TOP + 120);
      g.addColorStop(0, `rgba(${th.fog},${a * 2})`);
      g.addColorStop(1, `rgba(${th.fog},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx - 26, 40);
      ctx.lineTo(cx + 18, 40);
      ctx.lineTo(cx + 110, GROUND_TOP + 120);
      ctx.lineTo(cx - 30, GROUND_TOP + 120);
      ctx.fill();
    }
  }
  ctx.restore();

  // 墙上的火把台和旗帜（ENV-3 道具；旗帜是灰白布料，按关卡染色）
  const torches = [];
  for (let i = i0; i <= i1; i++) {
    const ox = i * W - par;
    if (propsS.ready) {
      for (const [bx, by] of deco.sconces ?? []) {
        propsS.draw(ctx, propsS.frame('sconce', 1 + (hash(i) % 3)), ox + bx, by + 4 + 86 * SCONCE_SCALE, 1, { scale: SCONCE_SCALE });
      }
      for (const [bx, by] of deco.banners ?? []) {
        const f = propsS.frame('banner', Math.floor(t / 14 + i) % 4);
        const sx = ox + bx, sy = by + 97 * BANNER_SCALE;
        propsS.draw(ctx, f, sx, sy, 1, { scale: BANNER_SCALE });
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        propsS.draw(ctx, f, sx, sy, 1, { scale: BANNER_SCALE, ghost: bannerTintOf(name) });
        ctx.restore();
      }
    }
    for (const [bx, by] of [...(deco.torches ?? []), ...(propsS.ready ? deco.sconces ?? [] : [])]) {
      const tx = ox + bx;
      if (tx < -120 || tx > VIEW_W + 120) continue;
      const k = i * 7 + bx;
      torches.push([tx, by, 0.85 + Math.sin(t * 0.31 + k * 1.7) * 0.1 + Math.sin(t * 0.73 + k) * 0.06]);
    }
  }

  // L2 地面：切成细条，每条按自己的纵深移动
  const fm = env.floor, fl = got(fm.id), FW = fm.w * 0.5, FH = fm.h * 0.5, step = MOBILE ? 12 : 6;
  for (let y = 0; y < FH; y += step) {
    const h = Math.min(step, FH - y), off = camX * floorRate(y + h / 2);
    const sh = Math.min(h + 1, FH - y);
    for (let x = -(((off % FW) + FW) % FW) - FW; x < VIEW_W + 60; x += FW) ctx.drawImage(fl, 0, y / PX, FW / PX, sh / PX, x, GROUND_TOP + y, FW, sh);
  }

  // L3 贴花
  for (const c of roomDecals(room, curStage)) {
    const im = got(c.d.id);
    if (!im) continue;
    const s = c.s * 0.5, w = c.d.w * s, h = c.d.h * s;
    const sx = c.x - camX * floorRate(c.y);
    if (sx + w < -20 || sx - w > VIEW_W + 20) continue;
    ctx.save();
    ctx.globalAlpha = c.a;
    ctx.translate(sx, GROUND_TOP + c.y);
    if (c.flip) ctx.scale(-1, 1);
    ctx.drawImage(im, -c.d.ax * s, -c.d.ay * s, w, h);
    ctx.restore();
  }

  // 按关卡主题整体调色（素材是中性灰）
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = tintOf(name);
  ctx.fillRect(-60, -60, VIEW_W + 120, VIEW_H + 120);
  ctx.restore();

  // 火焰（引擎画，会动，也是光照系统的光源）
  for (const [tx, ty, fl2] of torches) {
    drawLightTex(ctx, 'glow_warm', `rgb(${th.torch})`, tx, ty, 300 * fl2, 300 * fl2, 0.35); // 火光：光照包 glow_warm（可见半径约 90）
    ctx.fillStyle = `rgba(${th.torch},0.9)`;
    ctx.beginPath();
    ctx.ellipse(tx, ty - 6, 6 * fl2, 12 * fl2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = th.flame;
    ctx.beginPath();
    ctx.ellipse(tx, ty - 4, 3.5 * fl2, 7 * fl2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 墙脚的接触阴影 + 火光在地面上的倒影
  const shg = ctx.createLinearGradient(0, GROUND_TOP, 0, GROUND_TOP + 30);
  shg.addColorStop(0, 'rgba(0,0,0,0.45)');
  shg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shg;
  ctx.fillRect(-60, GROUND_TOP, VIEW_W + 120, 30);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [tx, , fl2] of torches) {
    drawLightTex(ctx, 'glow_warm', `rgb(${th.torch})`, tx, GROUND_TOP + 30, 366 * fl2, 150, 0.12); // 地面倒影：压扁的 glow_warm
  }
  ctx.restore();
  return torches;
}

// 断柱的底边在素材里是一刀切的硬边，悬在半空像一块黑板：载入后把底部三分之一淡出，缓存一份
const faded = new Map();
function fgImage(f) {
  const im = got(f.id);
  if (!im || !f.id.startsWith('pillar')) return im;
  let c = faded.get(f.id);
  if (!c) {
    c = document.createElement('canvas');
    c.width = im.width;
    c.height = im.height;
    const x = c.getContext('2d');
    x.drawImage(im, 0, 0);
    x.globalCompositeOperation = 'destination-out';
    const g = x.createLinearGradient(0, im.height * 0.62, 0, im.height);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    x.fillStyle = g;
    x.fillRect(0, 0, im.width, im.height);
    faded.set(f.id, c);
  }
  return c;
}

// L4 前景剪影：每 760 像素一个位置，按房间随机挑一件或空着
function drawEnvForeground(ctx, camX, room) {
  const P = 760, off = camX * 1.35, seed = roomSeed(room);
  for (let i = Math.floor(off / P) - 1; i <= Math.floor((off + VIEW_W) / P) + 1; i++) {
    const h = hash(i ^ seed);
    if (h % 5 < 2) continue;
    const f = env.fg[(h >>> 4) % env.fg.length], im = fgImage(f);
    if (!im) continue;
    const w = f.w * 0.5, hh = f.h * 0.5;
    const x = i * P + ((h >>> 12) % 280) - off - f.ax * 0.5;
    if (x > VIEW_W + 20 || x + w < -20) continue;
    const y = f.attach === 'top' ? 0 : Math.max(VIEW_H - hh, VIEW_H - f.ay * 0.5);
    ctx.drawImage(im, x, y, w, hh);
  }
}
