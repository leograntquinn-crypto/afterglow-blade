// 场景美术：程序生成的贴图 + 多层视差
//
// 「贴图」不是图片文件，而是启动时用代码在离屏画布上画一次、之后反复使用的纹理：
//   砖墙、石柱、旗帜、地砖、雾 —— 每套主题生成一份并缓存。每帧只做 drawImage，非常快。
//
// 视差层（镜头移动 1 像素时各层移动多少）：
//   墙 + 石柱 0.5 → 地砖每一行 0.88~1.18（越靠近镜头越快，形成透视）→ 前景剪影 1.35

import { VIEW_W, VIEW_H, GROUND_TOP, rand } from './config.js';
import { shade } from './rig.js';

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
export function drawScenery(ctx, camX, t, name = 'crypt') {
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
    const glow = ctx.createRadialGradient(tx, ty, 0, tx, ty, 90 * fl);
    glow.addColorStop(0, `rgba(${th.torch},0.35)`);
    glow.addColorStop(1, `rgba(${th.torch},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(tx - 100, ty - 100, 200, 200);
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
    const g = ctx.createRadialGradient(tx, GROUND_TOP + 30, 0, tx, GROUND_TOP + 30, 110 * fl);
    g.addColorStop(0, `rgba(${th.torch},0.12)`);
    g.addColorStop(1, `rgba(${th.torch},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(tx - 120, GROUND_TOP, 240, 150);
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
export function drawForeground(ctx, camX, t, name = 'crypt') {
  const th = THEMES[name];
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
