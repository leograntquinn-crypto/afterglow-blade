// 战斗内翅膀（侧面主图）+ 翼尖元素粒子
// 侧面主图：翼根在画布右缘，根部锚点 rootY 为实测值（wing_side/side_meta.json）。
// 挥舞沿用分段关节铁律：内段/外段两枢轴、相位滞后，禁止整板僵硬扇动。
// 粒子：每系列一种元素形态（Quinn 2026-11-10），每种 4 个形态随机轮换 + 随机旋转/缩放，密度随稀有度。
import { toScreen, GROUND_TOP } from './config.js';

export const SIDE_ART = {
  dawn: { rootY: 0.550 }, wayfarer: { rootY: 0.592 }, frost: { rootY: 0.568 },
  ember: { rootY: 0.678 }, storm: { rootY: 0.552 }, blight: { rootY: 0.565 }, thorn: { rootY: 0.600 },
};
export const PARTICLE_FOR_SERIES = {
  dawn: 'mote', wayfarer: 'dust', frost: 'snow', ember: 'ember',
  storm: 'arc', blight: 'spore', thorn: 'petal',
};
const FORMS = ['a', 'b', 'c', 'd'];
const LIT = new Set(['ember', 'arc', 'mote']); // 这三类用叠加发光画法

const sideImgs = new Map();
export function sideImg(series) {
  if (!SIDE_ART[series]) series = 'wayfarer';
  let e = sideImgs.get(series);
  if (!e) {
    const img = new Image();
    e = { img, ok: false };
    img.onload = () => { e.ok = true; };
    img.src = `assets/fx/wings_side_${series}.webp`;
    sideImgs.set(series, e);
  }
  return e.ok ? e.img : null;
}

const pImgs = new Map();
export function particleImg(type, form) {
  const key = `${type}_${form}`;
  let e = pImgs.get(key);
  if (!e) {
    const img = new Image();
    e = { img, ok: false };
    img.onload = () => { e.ok = true; };
    img.src = `assets/fx/particles/particle_${type}_${form}.webp`;
    pImgs.set(key, e);
  }
  return e.ok ? e.img : null;
}

// 纯翅膀绘制（战斗与大地图共用）：锚点 (ax, ay) 是翼根位置，H 为显示高度
// ph 挥舞相位，amp 幅度（弧度），base 基础张角。返回翼尖屏幕坐标（供粒子生成）
// 连续曲面变形（2026-11-10 Quinn 反馈两段式拼接挥动有割裂感后重做）：
// 把翼面切成 18 条竖条，沿一条「角度随弧长连续变化」的曲线逐条仿射贴合——
// 相邻条共享边缘、角度无跳变，所以没有接缝；相位滞后沿翼长逐渐累积，就是行波挥翅。
export function drawSideWing(ctx, wing, ax, ay, facing, H, ph, amp, base = -0.10) {
  const img = sideImg(wing?.series);
  if (!img) return null;
  const meta = SIDE_ART[wing.series] || SIDE_ART.wayfarer;
  const dispW = H * (img.width / img.height);
  const rootY = meta.rootY * H;
  const N = 18, ds = dispW / N;
  const ang = (u) => base * u + amp * Math.sin(ph - 1.15 * u) * (0.2 + 1.9 * u) + 0.03 * Math.sin(ph * 1.7 - u * 4) * u;
  // 沿曲线走出每个条带节点的根部点与法线
  const px = [0], py = [0], nx = [], ny = [];
  {
    let x = 0, y = 0;
    for (let i = 0; i < N; i++) {
      const a = ang((i + 0.5) / N);
      const dx = -Math.cos(a), dy = -Math.sin(a);
      nx.push(-dy); ny.push(dx);
      x += dx * ds; y += dy * ds;
      px.push(x); py.push(y);
    }
  }
  ctx.save();
  ctx.translate(ax, ay);
  if (facing < 0) ctx.scale(-1, 1);
  const baseT = ctx.getTransform();
  for (let i = 0; i < N; i++) {
    const u0 = i / N;
    const tx0 = px[i] + nx[i] * rootY, ty0 = py[i] + ny[i] * rootY;
    const tx1 = px[i + 1] + nx[i] * rootY, ty1 = py[i + 1] + ny[i] * rootY;
    const bx0 = px[i] - nx[i] * (H - rootY), by0 = py[i] - ny[i] * (H - rootY);
    ctx.setTransform(baseT.multiply(new DOMMatrix([
      (tx1 - tx0) * 1.06, (ty1 - ty0) * 1.06, bx0 - tx0, by0 - ty0, tx0, ty0,
    ])));
    ctx.drawImage(img, img.width * (1 - (i + 1) / N), 0, img.width / N, img.height, 0, 0, 1, 1);
  }
  ctx.restore();
  const j = Math.round(0.55 * N);
  return {
    tipX: ax + facing * px[N], tipY: ay + py[N],
    jointX: ax + facing * px[j], jointY: ay + py[j],
    rootX: ax, rootY: ay,
  };
}

// —— 翼尖粒子（世界坐标，独立小系统，不干扰主 FX 池） ——
const parts = [];
let phAcc = 0; // 挥舞相位累加器：切换周期时不跳变

function spawn(wing, tip, p) {
  const type = PARTICLE_FOR_SERIES[wing.series] || 'mote';
  const form = FORMS[(Math.random() * 4) | 0];
  const life = type === 'arc' ? 16 + Math.random() * 8 : 52 + Math.random() * 44;
  const q = {
    x: tip.x, y: tip.y, z: tip.z, life, max: life, type, form,
    rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.06,
    size: 11 + Math.random() * 11 + (wing.rar || 0) * 1.8,
    vx: (p.vx || 0) * 0.5 + (Math.random() - 0.5) * 0.5 - p.facing * 0.25, vy: (p.vy || 0) * 0.5 + (Math.random() - 0.5) * 0.2, vz: 0,
    sway: Math.random() * 6.28,
  };
  if (type === 'ember' || type === 'snow' || type === 'petal' || type === 'mote') q.life = q.max = Math.round(q.life * 1.25);
  if (type === 'ember') { q.vz = 0.35 + Math.random() * 0.5; q.vx += (Math.random() - 0.5) * 0.4; }
  else if (type === 'snow') { q.vz = -(0.22 + Math.random() * 0.25); q.vr = (Math.random() - 0.5) * 0.03; }
  else if (type === 'petal') { q.vz = -(0.3 + Math.random() * 0.25); q.vr = (Math.random() - 0.5) * 0.12; }
  else if (type === 'mote') { q.vz = 0.12 + Math.random() * 0.2; }
  else if (type === 'spore') { q.vz = 0.04 + Math.random() * 0.1; q.vx += (Math.random() - 0.5) * 0.3; }
  else if (type === 'dust') { q.vz = -(0.05 + Math.random() * 0.12); q.size *= 1.3; }
  parts.push(q);
  if (parts.length > 170) parts.splice(0, parts.length - 170);
}

function drawParts(ctx, camX) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i];
    q.life--;
    if (q.life <= 0) { parts.splice(i, 1); continue; }
    if (q.type === 'snow' || q.type === 'petal') q.vx += Math.sin(q.life * 0.22 + q.sway) * 0.012;
    q.vx *= 0.985; q.vy *= 0.985; // 拖滞：流出一段后缓下来，在路径末端停留
    q.x += q.vx; q.y += q.vy; q.z += q.vz;
    q.rot += q.vr;
    const img = particleImg(q.type, q.form);
    if (!img) continue;
    const [sx, sy] = toScreen(q.x, q.y, q.z, camX);
    const pr = 1 - q.life / q.max;
    const a = Math.sin(Math.min(1, Math.pow(pr, 0.55)) * Math.PI) * 0.95;
    if (a <= 0.02) continue;
    const s = q.size * (q.type === 'dust' ? 0.8 + pr * 0.9 : 0.75 + pr * 0.35);
    ctx.save();
    if (LIT.has(q.type)) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * 0.2;
      const gs = s * 1.55; // 光晕收紧（Quinn 2026-11-10：旧版太糊）
      ctx.drawImage(img, sx - gs / 2, sy - gs / 2, gs, gs * (img.height / img.width));
    }
    ctx.globalAlpha = a;
    ctx.translate(sx, sy);
    ctx.rotate(q.rot);
    ctx.drawImage(img, -s / 2, -s / 2, s, s * (img.height / img.width));
    ctx.restore();
  }
}

// 战斗内完整路径：状态决定挥舞节奏，粒子从翼尖飘散
export function drawCombatWing(ctx, p, camX, t) {
  const wing = p.look?.wings;
  if (!wing) { drawParts(ctx, camX); return; }
  let period = 190, amp = 0.10, base = -0.10;
  const st = p.state;
  if (st === 'run') { period = 58; amp = 0.24; }
  else if (st === 'dash') { period = 42; amp = 0.08; base = 0.38; }
  else if (st === 'attack') { period = 82; amp = 0.17; }
  else if (st === 'hurt') { period = 62; amp = 0.20; }
  if (p.z > 2) {
    if (p.vz < -2) { period = 300; amp = 0.05; base = -0.34; } // 下落滑翔：展开缓沉
    else { period = 55; amp = 0.30; } // 上升：快扇
  }
  const breath = Math.sin(t * 0.0276); // 3.8 秒呼吸（与角色页同一时钟）
  if (st === 'idle') amp *= 0.85 + 0.3 * (0.5 + 0.5 * breath);
  const prevSin = Math.sin(phAcc);
  phAcc += (Math.PI * 2) / period;
  const strokeBurst = prevSin > -0.8 && Math.sin(phAcc) <= -0.8;
  const [sx, sy] = toScreen(p.x, p.y, p.z, camX);
  const H = 102 + (wing.rar || 0) * 4;
  const ax = sx - p.facing * 5;
  const ay = sy - 56 + (st === 'idle' ? breath * 0.8 : 0);
  const res = drawSideWing(ctx, wing, ax, ay, p.facing, H, phAcc, amp, base);
  drawParts(ctx, camX);
  if (res) {
    const busy = st === 'run' || st === 'dash' || p.z > 2;
    const chance = (0.11 + 0.055 * (wing.rar || 0)) * (busy ? 2.2 : 1);
    const shed = () => { // 沿翼面随机取点：外段偏多（羽尖一带最密）
      let px, py;
      if (Math.random() < 0.6) { const u = 0.25 + Math.random() * 0.75; px = res.jointX + (res.tipX - res.jointX) * u; py = res.jointY + (res.tipY - res.jointY) * u; }
      else { const u = Math.random() * 0.85; px = res.rootX + (res.jointX - res.rootX) * u; py = res.rootY + (res.jointY - res.rootY) * u; }
      px -= p.facing * (4 + Math.random() * 9); py += 7 + Math.random() * 9;
      spawn(wing, { x: px + camX, y: py - GROUND_TOP + p.z, z: p.z }, p);
    };
    if (Math.random() < chance) shed();
    if (busy && Math.random() < chance * 0.55) shed();
    if (strokeBurst) for (let i = 0; i < 3; i++) { // 下压甩出：位置在外段、初速朝后下散开
      const u = 0.5 + Math.random() * 0.5;
      const bx = res.jointX + (res.tipX - res.jointX) * u - p.facing * 6, by = res.jointY + (res.tipY - res.jointY) * u + 8;
      spawn(wing, { x: bx + camX, y: by - GROUND_TOP + p.z, z: p.z }, p);
    }
  }
}
