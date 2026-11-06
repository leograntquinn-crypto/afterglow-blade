// 特效贴图：柔光点 / 光核 / 火花针 / 光条 / 斩痕 / 余烬来自光照包 fx_light_v1（docs/ART_FX_LIGHT_V1.md）；
// 烟团、冲击环、星芒、碎片、地裂来自 fx_textures_v1（载好之前用启动时代码画的占位）。
//
// 为什么不用 arc / lineTo 现画：
//   现画的形状是纯色硬边，怎么调都显得「死」。成熟的特效都是贴图：中心近白、边缘柔和、
//   带一点噪点和不规则，叠加混合（lighter）时自然发光。贴图画一次缓存，之后每个粒子只是一次 drawImage。
//
// 染色：贴图本身是白色 / 灰度，用到某个颜色时再画一份染色版缓存（同一贴图 + 同一颜色只画一次）。
// 以后换成美术画的特效贴图（docs 里的特效素材需求），只要同名替换这里的贴图即可。

import { FX_ART } from './fx_art.js';

const mk = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

// 可复现的随机数：同一张贴图每次生成都一样
function seeded(s) {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 近似高斯的径向衰减（比线性渐变柔和得多，叠加时不会出现一圈硬边）
function soft(x, cx, cy, r, stops) {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  for (const [t, a] of stops) g.addColorStop(t, `rgba(255,255,255,${a})`);
  x.fillStyle = g;
  x.fillRect(cx - r, cy - r, r * 2, r * 2);
}
const GAUSS = [[0, 1], [0.12, 0.82], [0.28, 0.5], [0.45, 0.24], [0.65, 0.08], [0.85, 0.02], [1, 0]];

// 烟团：若干个随机柔光团叠成不规则的形状，再用细噪点打散边缘；灰度带明暗（上亮下暗）
function makeSmoke(seed) {
  const S = 96, c = mk(S, S), x = c.getContext('2d'), R = seeded(seed);
  for (let i = 0; i < 9; i++) {
    const a = R() * Math.PI * 2, d = R() * 18, r = 16 + R() * 18;
    const cx = S / 2 + Math.cos(a) * d, cy = S / 2 + Math.sin(a) * d;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    const v = 170 + Math.round(R() * 70) - Math.round((cy - S / 2) * 1.5);
    g.addColorStop(0, `rgba(${v},${v},${v},0.55)`);
    g.addColorStop(0.6, `rgba(${v},${v},${v},0.25)`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    x.fillStyle = g;
    x.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  const img = x.getImageData(0, 0, S, S), d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] *= 0.72 + R() * 0.28;
  x.putImageData(img, 0, 0);
  return c;
}
// 冲击环：外沿锐利明亮、向内拖一条柔和的尾巴（像气浪的前锋）。
// 环的粗细要跟着半径变（大环也不能变成一圈粗雾），所以做 4 档「环宽 / 半径」的比例，画的时候挑最接近的
export const RING_BANDS = [0.025, 0.05, 0.09, 0.14];
function makeRing(band) {
  const c = mk(256, 256), b = band;
  soft(c.getContext('2d'), 128, 128, 128, [[0, 0], [Math.max(0, 1 - b * 2.4), 0], [1 - b * 1.4, 0.15], [1 - b * 0.65, 0.7], [1 - b * 0.22, 1], [1, 0]]);
  return c;
}
// 星芒：命中瞬间的十字闪光
function makeFlare() {
  const c = mk(96, 96), x = c.getContext('2d');
  soft(x, 48, 48, 22, GAUSS);
  for (const [w, h] of [[96, 5], [5, 96], [60, 3], [3, 60]]) {
    const g = x.createRadialGradient(48, 48, 0, 48, 48, Math.max(w, h) / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.save();
    x.translate(48, 48);
    if (w === 60 || h === 60) x.rotate(Math.PI / 4);
    x.scale(w / 96, h / 96);
    x.fillStyle = g;
    x.fillRect(-48, -48, 96, 96);
    x.restore();
  }
  return c;
}
// 碎片：不规则的小多边形，带暗描边和一条亮边（像受光的断面）
function makeChip(seed) {
  const c = mk(16, 16), x = c.getContext('2d'), R = seeded(seed);
  const n = 4 + Math.floor(R() * 3), pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + R() * 0.6, r = 3 + R() * 4;
    pts.push([8 + Math.cos(a) * r, 8 + Math.sin(a) * r * 0.7]);
  }
  x.beginPath();
  pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
  x.closePath();
  x.fillStyle = '#c8c8c8';
  x.fill();
  x.lineWidth = 1.2;
  x.strokeStyle = 'rgba(10,6,12,0.9)';
  x.stroke();
  x.beginPath();
  x.moveTo(...pts[0]);
  x.lineTo(...pts[1]);
  x.strokeStyle = 'rgba(255,255,255,0.9)';
  x.lineWidth = 1;
  x.stroke();
  return c;
}
// 地裂：从中心放射出的折线，压扁成地面透视；暗色裂缝本体 + 单独一张「炽热的缝」（叠加发光，慢慢冷却）
function makeCrack(seed) {
  const W = 220, H = 80, R = seeded(seed);
  const dark = mk(W, H), hot = mk(W, H);
  const rays = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + (R() - 0.5) * 0.4;
    const pts = [[W / 2, H / 2]];
    let px = W / 2, py = H / 2;
    for (let j = 0; j < 4; j++) {
      px += Math.cos(a + (R() - 0.5) * 0.8) * (16 + R() * 18);
      py += Math.sin(a + (R() - 0.5) * 0.8) * (5 + R() * 6);
      pts.push([px, py]);
    }
    rays.push(pts);
  }
  const stroke = (x, w, col) => {
    x.strokeStyle = col;
    x.lineCap = x.lineJoin = 'round';
    for (const pts of rays) {
      for (let j = 1; j < pts.length; j++) {
        x.lineWidth = w * (1 - j / (pts.length + 0.5)); // 越往外越细
        x.beginPath();
        x.moveTo(...pts[j - 1]);
        x.lineTo(...pts[j]);
        x.stroke();
      }
    }
  };
  const d = dark.getContext('2d');
  stroke(d, 7, 'rgba(0,0,0,0.35)');
  stroke(d, 3.5, 'rgba(8,4,8,0.95)');
  const h = hot.getContext('2d');
  h.filter = 'blur(2px)';
  stroke(h, 6, 'rgba(255,255,255,0.55)');
  h.filter = 'none';
  stroke(h, 1.6, 'rgba(255,255,255,1)');
  soft(h, W / 2, H / 2, 30, GAUSS.map(([t, a]) => [t, a * 0.6]));
  return { dark, hot };
}

let T = null;
// 第一次用到时才生成（模块加载时页面可能还没准备好画布）
export function tex() {
  if (!T) {
    T = {
      // 光照包没载好之前：透明的空贴图（画了也看不见），载好后换成手绘的
      glow: EMPTY, core: EMPTY, streak: EMPTY, needle: EMPTY, cut: EMPTY, ember: EMPTY, light: false,
      ring: RING_BANDS.map(makeRing), flare: makeFlare(),
      smoke: [11, 23, 37, 51].map(makeSmoke),
      chip: [3, 7, 13, 19, 29, 31].map(makeChip),
      crack: [5, 17, 41].map(makeCrack),
      art: false,
    };
  }
  if (!T.art && FX_ART.tex.ready) applyArt(T, FX_ART.tex.items);
  if (!T.light && FX_ART.light.ready) applyLight(T, FX_ART.light.items);
  return T;
}

// 空贴图：光照包没载好时代替 glow / core / needle / streak（不画任何东西，不用代码画的替身）
const EMPTY = mk(1, 1);

// 光照包到了：换上手绘的光晕、火花、斩痕。
// 各处画的代码按原来的「逻辑尺寸」写缩放（柔光 64、光核 32、光条 64×16、火花针 128×12），
// 所以每张记横竖两个换算系数 ux / uy，让手绘图的可见部分画出来和原来的可见大小一样（贴图已裁到可见部分）
function applyLight(T, A) {
  const unit = (img, w, h) => Object.assign(img, { ux: w / img.width, uy: h / img.height });
  T.glow = unit(A.glow_soft, 64 * 0.9, 64 * 0.9);
  T.warm = unit(A.glow_warm, 64 * 0.9, 64 * 0.9);
  T.core = unit(A.glow_core, 32 * 0.85, 32 * 0.85);
  T.ember = unit(A.ember, 32 * 0.85, 32 * 0.85);
  T.mote = unit(A.mote, 32 * 0.85, 32 * 0.85);
  T.streak = unit(A.light_streak, 64, 16);
  T.needle = unit(A.spark_needle, 128, 12);
  T.cut = unit(A.cut_mark, 128, 12);
  T.light = true;
}

// 不透明部分的包围盒宽高（只在换贴图时算一次）
function visible(c) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, x1 = -1, y0 = c.height, y1 = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? [1, 1] : [x1 - x0 + 1, y1 - y0 + 1];
}

// 手绘贴图到了：替换程序生成的占位。
// 画的代码是按占位贴图的像素尺寸写的（比如冲击环按 256 像素算缩放），所以每张手绘图记一个换算系数 u，
// 让它画出来的「可见大小」和原来的占位一样，各处调用都不用改。
function applyArt(T, A) {
  const unit = (img, procPx, artPx) => Object.assign(img, { u: procPx / artPx });
  // 烟：画的时候按图宽缩放，所以 u = 占位贴图里烟团占的比例（手绘图已经裁到烟团本身）
  const smokeFrac = visible(T.smoke[0])[0] / T.smoke[0].width;
  T.smoke = [1, 2, 3, 4, 5, 6].map((i) => unit(A[`smoke_0${i}`], smokeFrac, 1));
  // 碎片：按 16 像素的占位画（可见约 11 像素）
  const chipPx = visible(T.chip[0])[0];
  T.chip = Object.keys(A).filter((k) => k.startsWith('chip_')).map((k) => unit(A[k], chipPx, Math.max(A[k].width, A[k].height)));
  // 地裂：暗缝和炽热缝来自同一张原画布，用同一个系数才能对齐
  const crackPx = visible(T.crack[0].dark)[0];
  T.crack = [1, 2].map((i) => {
    const dark = A[`crack_0${i}`], hot = A[`crackglow_0${i}`], u = crackPx / dark.width;
    return { dark: Object.assign(dark, { u }), hot: Object.assign(hot, { u }) };
  });
  // 冲击环：细环替换前两档、粗环替换后两档；占位按 256 像素直径画
  const thin = A.ring_energy_thin, thick = A.ring_energy_thick;
  unit(thin, 256, thin.width * 0.96);
  unit(thick, 256, thick.width * 0.96);
  T.ring = [thin, thin, thick, thick];
  // 星芒：占位 96 像素，光芒顶到边
  T.flare = unit(A.flare_01, 96, A.flare_01.width);
  T.flare2 = unit(A.flare_02, 96, A.flare_02.width);
  // 新增：光柱、尘爆、能量丝、符文圈（画的代码按各自的实际尺寸处理）
  T.pillar = A.pillar_01;
  T.dustburst = [A.dustburst_01, A.dustburst_02, A.dustburst_03];
  T.wisp = [A.wisp_01, A.wisp_02];
  T.rune = [A.rune_circle_01, A.rune_circle_02];
  T.art = true;
}

// ---------- 染色缓存 ----------
// 发光类（mode 'fill'）：整张贴图换成这个颜色，亮度保留在透明度里，叠加时中心自然最亮
// 烟和碎片（mode 'mul'）：乘色，保留贴图自带的明暗
const tints = new Map();
export function tinted(img, color, mode = 'fill') {
  let m = tints.get(img);
  if (!m) tints.set(img, (m = new Map()));
  const key = color + mode;
  let c = m.get(key);
  if (!c) {
    c = mk(img.width, img.height);
    c.u = img.u; c.ux = img.ux; c.uy = img.uy; c.cx = img.cx; c.cy = img.cy; c.sc = img.sc; c.fw = img.fw; c.fh = img.fh; // 换算系数和锚点跟着走
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = mode === 'fill' ? 'source-in' : 'multiply';
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    if (mode !== 'fill') {
      x.globalCompositeOperation = 'destination-in';
      x.drawImage(img, 0, 0);
    }
    m.set(key, c);
    if (m.size > 48) m.delete(m.keys().next().value); // 每张贴图最多缓存 48 种颜色
  }
  return c;
}

// ---------- 颜色工具 ----------
export function parseColor(s) {
  if (s[0] === '#') {
    const h = s.length === 4 ? s.slice(1).split('').map((ch) => ch + ch).join('') : s.slice(1, 7);
    const n = parseInt(h, 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  const m = s.match(/[\d.]+/g);
  return m ? [+m[0], +m[1], +m[2]] : [255, 255, 255];
}
const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, t) => hex(parseColor(a).map((v, i) => v + (parseColor(b)[i] - v) * t));
export const scaleColor = (a, k) => hex(parseColor(a).map((v) => v * k));

// 颜色渐变表：一个粒子从生到死依次用这些颜色（发光类：白热 → 本色 → 冷却变暗）
const ramps = new Map();
export function ramp(color, kind) {
  const key = color + kind;
  let r = ramps.get(key);
  if (!r) {
    if (kind === 'hot') r = ['#ffffff', mix('#ffffff', color, 0.45), color, color, scaleColor(color, 0.75), scaleColor(color, 0.5)];
    else if (kind === 'cool') r = [mix('#ffffff', color, 0.6), color, scaleColor(color, 0.8)];
    else r = [color];
    ramps.set(key, r);
  }
  return r;
}

// 一个粒子一生要用的整套染色贴图（按渐变表的每个颜色各一张），出生时取好，画的时候按年龄取下标，不再查表
const rampTex = new WeakMap();
export function tintRamp(img, rp) {
  let m = rampTex.get(rp);
  if (!m) rampTex.set(rp, (m = new Map()));
  let arr = m.get(img);
  if (!arr) m.set(img, (arr = rp.map((c) => tinted(img, c))));
  return arr;
}
