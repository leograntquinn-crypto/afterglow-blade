// 角色「建模」：2D 骨骼 + 反向动力学（IK）+ 描边分层着色
//
// 思路：
//   1. rig() 根据姿势参数（前倾、下蹲、步伐相位、武器角度）算出所有关节位置
//   2. 手脚只给「目标点」，膝盖 / 手肘的位置由 IK（两段骨骼求解）自动算出
//   3. 按「后肢 → 身体 → 前肢 → 武器」的顺序画，后侧的肢体颜色更暗，产生立体感
//   4. 每个部件先画深色描边再填色，得到清晰的剪影（类似赛璐璐动画风格）
//
// 同一套骨骼，换一个 BODY 画法，就是不同的角色。

import { clamp } from './config.js';

const OUT = '#0b0910';
const cache = new Map();
export function shade(hex, f) {
  const key = hex + f;
  let v = cache.get(key);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    const c = (x) => Math.min(255, Math.round(x * f));
    v = `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
    cache.set(key, v);
  }
  return v;
}

// ---------- 小工具 ----------
const add = (p, x, y) => [p[0] + x, p[1] + y];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function path(ctx, pts, close) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (close) ctx.closePath();
}
// 粗线段（四肢）：先画粗一点的描边，再画颜色
function seg(ctx, pts, w, color, ol) {
  if (ol) {
    ctx.strokeStyle = ol;
    ctx.lineWidth = w + 3;
    path(ctx, pts);
    ctx.stroke();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  path(ctx, pts);
  ctx.stroke();
}
function poly(ctx, pts, color, ol) {
  path(ctx, pts, true);
  if (ol) {
    ctx.strokeStyle = ol;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.fill();
}
function circle(ctx, x, y, r, color, ol) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (ol) {
    ctx.strokeStyle = ol;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.fill();
}
function glowDot(ctx, x, y, r, color, pal) {
  if (pal.ghost || pal.flash) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = color;
  ctx.globalAlpha *= 0.35;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha /= 0.35;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// 两段骨骼 IK：已知根部 a、目标点、两段长度，求中间关节
// bend = +1 关节向前弯（膝盖），-1 向下/后弯（手肘）
function ik(a, target, l1, l2, bend) {
  const dx = target[0] - a[0], dy = target[1] - a[1];
  const d = Math.min(Math.hypot(dx, dy) || 0.001, l1 + l2 - 0.01);
  const c = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const ang = Math.atan2(dy, dx) - bend * Math.acos(c);
  const mid = [a[0] + Math.cos(ang) * l1, a[1] + Math.sin(ang) * l1];
  const ex = target[0] - mid[0], ey = target[1] - mid[1], el = Math.hypot(ex, ey) || 0.001;
  return [mid, [mid[0] + (ex / el) * l2, mid[1] + (ey / el) * l2]];
}

// ---------- 骨骼 ----------
function rig(L, P, k) {
  const bulk = L.bulk || 1, sb = Math.sqrt(bulk);
  const c = P.crouch || 0, lean = (P.lean || 0) * k, walk = P.walk || 0, lift = P.lift || 0;
  const hip = [lean * 0.3, -40 * k + c * 12 * k];
  const chest = [lean, -68 * k + c * 18 * k];
  const stride = Math.sin(walk) * 11 * k;
  const footF = [8 * k * sb + stride, -Math.max(0, Math.cos(walk)) * 6 * k * lift];
  const footB = [-7 * k * sb - stride, -Math.max(0, -Math.cos(walk)) * 6 * k * lift];
  const hipF = add(hip, 3 * k, 0), hipB = add(hip, -3 * k, 0);
  const [kneeF, ankleF] = ik(hipF, footF, 21 * k, 21 * k, 1);
  const [kneeB, ankleB] = ik(hipB, footB, 21 * k, 21 * k, 1);

  const shF = add(chest, 3 * k, 4 * k), shB = add(chest, -4 * k, 4 * k);
  const arm = 14 * k * sb;
  const a = P.angle ?? 0.6;
  const dir = [Math.cos(a), Math.sin(a)];
  const [elbowF, handF] = ik(shF, add(shF, dir[0] * 24 * k * sb, dir[1] * 24 * k * sb), arm, arm, -1);

  let backT;
  const wt = L.weapon?.type;
  if (wt === 'bow') {
    // 弓手：后手拉弦
    const R = 24 * k;
    backT = [handF[0] - 4 * k + R * 0.362 - (P.draw || 0) * 26 * k, handF[1]];
  } else if (L.twoHand) {
    backT = add(handF, -dir[0] * 10 * k, -dir[1] * 10 * k);
  } else {
    const ba = P.backAngle ?? 1.35 - Math.sin(walk) * 0.5 * lift;
    backT = add(shB, Math.cos(ba) * 22 * k * sb, Math.sin(ba) * 22 * k * sb);
  }
  const [elbowB, handB] = ik(shB, backT, arm, arm, -1);

  const head = add(chest, 2 * k, -13 * k);
  return { k, bulk, sb, hip, chest, hipF, hipB, kneeF, kneeB, ankleF, ankleB, shF, shB, elbowF, elbowB, handF, handB, dir, tw: 11 * k * bulk, head, hr: 9 * k * sb };
}

function leg(ctx, J, side, col, pal, ws = 1) {
  const f = side === 'B' ? 0.7 : 1;
  const k = J.k, hip = J['hip' + side], knee = J['knee' + side], ankle = J['ankle' + side];
  const w = 8 * k * J.bulk * ws;
  seg(ctx, [hip, knee], w, pal.c(col.thigh, f), pal.ol);
  seg(ctx, [knee, ankle], w * 0.82, pal.c(col.shin, f), pal.ol);
  if (col.boot) seg(ctx, [mix(knee, ankle, 0.45), ankle], w * 0.95, pal.c(col.boot, f), pal.ol);
  else circle(ctx, knee[0], knee[1], w * 0.55, pal.c(col.shin, f * 0.95), null);
  const [fx, fy] = ankle, fl = 8 * k * J.sb;
  poly(ctx, [[fx - 3 * k, fy + 1 * k], [fx + fl, fy + 1 * k], [fx + fl - 1 * k, fy - 3 * k], [fx - 3 * k, fy - 5 * k]], pal.c(col.boot || col.shin, f), pal.ol);
}

function arm(ctx, J, side, col, pal, { ws = 1, hand = true } = {}) {
  const f = side === 'B' ? 0.7 : 1;
  const k = J.k, sh = J['sh' + side], el = J['elbow' + side], hd = J['hand' + side];
  const w = 7 * k * J.bulk * ws;
  seg(ctx, [sh, el], w, pal.c(col.up, f), pal.ol);
  seg(ctx, [el, hd], w * 0.88, pal.c(col.fore, f), pal.ol);
  if (col.bracer) seg(ctx, [mix(el, hd, 0.3), mix(el, hd, 0.85)], w * 1.05, pal.c(col.bracer, f), pal.ol);
  if (hand) circle(ctx, hd[0], hd[1], 3.6 * k * J.sb * ws, pal.c(col.hand || col.fore, f), pal.ol);
}

function torso(ctx, J, color, pal, belly = 0) {
  const { k, hip, chest, tw } = J;
  const pts = [add(hip, -tw * 0.85, 3 * k), add(hip, tw * 0.85, 3 * k)];
  if (belly) pts.push(add(mix(hip, chest, 0.4), tw * (0.9 + belly), 0));
  pts.push(add(chest, tw, 0), add(chest, -tw, -1 * k));
  poly(ctx, pts, color, pal.ol);
}

// ---------- 武器 ----------
function weapon(ctx, J, W, pal) {
  const k = J.k, [hx, hy] = J.handF, [ca, sa] = J.dir, nx = -sa, ny = ca;
  const at = (d, n = 0) => [hx + ca * d + nx * n, hy + sa * d + ny * n];
  // 武器光晕：两层叠加（外层宽而淡，内层窄而亮），沿刀身中线画
  const glowPts = (pts, w) => {
    if (!W.glow || pal.ghost || pal.flash) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = W.enh >= 7 ? 1 + 0.35 * Math.sin(pal.t * 0.2) : 1;
    const a = W.glowA ?? 0.3;
    for (const [mul, alpha] of [[3.2, a * 0.45], [1.6, a]]) {
      ctx.globalAlpha = alpha;
      seg(ctx, pts, w * mul * pulse + (W.enh || 0) * 0.4 * k, W.glow, null);
    }
    ctx.restore();
  };
  const glow = (from, to, w) => glowPts([at(from), at(to)], w);

  if (W.type === 'sword' || W.type === 'great') {
    const great = W.type === 'great';
    const L = W.len * k, bw = (great ? 9 : 4.6) * k, gw = (great ? 11 : 7) * k;
    glow(6, L * 0.97, bw);
    seg(ctx, [at(-8), at(2)], 3.2 * k, pal.c('#2a1d18'), pal.ol);
    circle(ctx, ...at(-9), 2.6 * k, pal.c('#c9a45c'), pal.ol);
    poly(ctx, [at(4, -bw / 2), at(L * 0.8, -bw / 2 * (great ? 1 : 0.9)), at(L, great ? -bw * 0.15 : 0), at(L * (great ? 0.98 : 1), great ? bw * 0.3 : 0), at(L * 0.8, bw / 2 * (great ? 1 : 0.9)), at(4, bw / 2)], pal.c(W.color), pal.ol);
    seg(ctx, [at(7), at(L * 0.72)], (great ? 2.2 : 1.2) * k, pal.c(W.color, 0.72), null);
    seg(ctx, [at(3, -gw), at(3, gw)], 3 * k, pal.c('#c9a45c'), pal.ol);
  } else if (W.type === 'katana') {
    const L = W.len * k, bw = 3.6 * k;
    const curve = (d) => -((d / L) ** 2) * 7 * k; // 刀身向刀背方向弯
    glowPts([0.1, 0.4, 0.7, 0.95].map((u) => at(L * u, curve(L * u))), bw);
    seg(ctx, [at(-13), at(2)], 3.2 * k, pal.c('#3a2a3a'), pal.ol);
    const back = [], edge = [];
    for (let i = 0; i <= 6; i++) {
      const d = 5 + ((L - 5) * i) / 6;
      const taper = i === 6 ? 0 : 1;
      back.push(at(d, curve(d) - (bw / 2) * taper));
      edge.unshift(at(d, curve(d) + (bw / 2) * taper));
    }
    poly(ctx, [...back, ...edge], pal.c(W.color), pal.ol);
    circle(ctx, ...at(3), 4 * k, pal.c('#8a6a3a'), pal.ol);
  } else if (W.type === 'axe') {
    const L = W.len * k;
    seg(ctx, [at(-12), at(L)], 4.5 * k, pal.c('#4a3a30'), pal.ol);
    poly(ctx, [at(L * 0.68, -3 * k), at(L * 0.6, 22 * k), at(L * 0.84, 27 * k), at(L * 1.02, 20 * k), at(L * 0.93, -3 * k)], pal.c(W.color), pal.ol);
    seg(ctx, [at(L * 0.62, 21 * k), at(L * 0.84, 26 * k), at(L, 19 * k)], 1.5 * k, pal.c(W.color, 1.25), null);
    poly(ctx, [at(L * 0.76, -3 * k), at(L * 0.82, -12 * k), at(L * 0.9, -3 * k)], pal.c(W.color, 0.8), pal.ol);
  } else if (W.type === 'bow') {
    const R = 24 * k, cx = hx - 4 * k, cy = hy;
    ctx.beginPath();
    ctx.arc(cx, cy, R, -1.2, 1.2);
    if (pal.ol) { ctx.strokeStyle = pal.ol; ctx.lineWidth = 6.5 * k; ctx.stroke(); }
    ctx.strokeStyle = pal.c(W.color);
    ctx.lineWidth = 3.5 * k;
    ctx.stroke();
    const tx = cx + R * 0.362, ty = cy - R * 0.932, by = cy + R * 0.932;
    const pull = (J.draw || 0) * 26 * k;
    seg(ctx, [[tx, ty], [tx - pull, cy], [tx, by]], 1.2 * k, pal.c('#d8cfc0'), null);
    if (pull > 0) seg(ctx, [[tx - pull, cy], [cx + R + 10 * k, cy]], 2 * k, pal.c('#ff8a6a'), null);
  }
}

// ---------- 各角色画法 ----------
const BODY = {
  // 残光剑士
  hero(ctx, J, L, P, pal) {
    const { k, hip, chest, tw, head, hr } = J;
    const sway = Math.sin(pal.t * 0.17) * 3 * k, drift = (P.lean || 0) * 0.7 * k;

    // 头带飘带、长衣后摆（在身体后面）
    seg(ctx, [add(head, -hr * 0.7, -hr * 0.35), add(head, -15 * k - drift, 1 * k + sway), add(head, -27 * k - drift * 1.5, 6 * k - sway)], 3 * k, pal.c(L.ribbon), pal.ol);
    poly(ctx, [add(hip, -tw * 0.9, -5 * k), add(hip, tw * 0.2, -3 * k), add(hip, -3 * k - drift * 0.6, 26 * k + sway * 0.4), add(hip, -16 * k - drift, 21 * k - sway)], pal.c(L.coat, 0.62), pal.ol);

    arm(ctx, J, 'B', { up: L.coat, fore: L.glove }, pal);
    leg(ctx, J, 'B', { thigh: L.pants, shin: L.pants, boot: L.boots }, pal);
    leg(ctx, J, 'F', { thigh: L.pants, shin: L.pants, boot: L.boots }, pal);

    torso(ctx, J, pal.c(L.coat), pal);
    poly(ctx, [add(hip, 1 * k, 1 * k), add(hip, tw * 0.75, 1 * k), add(chest, tw * 0.85, 1.5 * k), add(chest, 2 * k, 1.5 * k)], pal.c(L.coat, 1.22), null);
    poly(ctx, [add(hip, -2 * k, 1 * k), add(hip, tw * 0.9, 1 * k), add(hip, tw + drift * 0.2, 15 * k), add(hip, 1 * k - drift * 0.3, 17 * k)], pal.c(L.coat, 0.85), pal.ol);
    seg(ctx, [add(chest, tw * 0.55, 1 * k), add(hip, tw * 0.5, 2 * k), add(hip, tw * 0.62, 15 * k)], 1.6 * k, pal.c(L.trim), null);
    seg(ctx, [add(hip, -tw * 0.9, 0), add(hip, tw * 0.9, 0)], 4 * k, pal.c(L.belt), pal.ol);
    poly(ctx, [add(hip, tw * 0.2, -2.2 * k), add(hip, tw * 0.55, -2.2 * k), add(hip, tw * 0.55, 2.2 * k), add(hip, tw * 0.2, 2.2 * k)], pal.c(L.buckle), null);

    // 头
    seg(ctx, [add(chest, 1 * k, 0), add(head, 0, hr * 0.6)], 4.5 * k, pal.c(L.skin, 0.85), pal.ol);
    circle(ctx, head[0], head[1], hr, pal.c(L.skin), pal.ol);
    const h = (x, y) => add(head, x * hr, y * hr);
    poly(ctx, [h(-0.6, 0.55), h(-1.15, 0.25), h(-1.7 - drift * 0.02, -0.05), h(-1.05, -0.45), h(-1.45, -0.95), h(-0.45, -1.05), h(-0.3, -1.55), h(0.35, -1.08), h(1.05, -0.62), h(0.95, -0.12), h(0.55, -0.42), h(0.15, -0.25), h(-0.25, -0.35), h(-0.35, 0.2)], pal.c(L.hair), pal.ol);
    if (L.helm) {
      // 额冠：金属护额 + 宝石
      poly(ctx, [h(-0.9, -0.55), h(0.2, -0.95), h(1.0, -0.8), h(1.02, -0.58), h(0.2, -0.7), h(-0.85, -0.35)], pal.c(L.helm.color), pal.ol);
      circle(ctx, ...h(0.62, -0.74), 1.8 * k, pal.c(L.helm.gem), null);
      glowDot(ctx, ...h(0.62, -0.74), 1.4 * k, L.helm.gem, pal);
    } else {
      seg(ctx, [h(-0.9, -0.6), h(0.95, -0.72)], 1.8 * k, pal.c(L.ribbon), null);
    }
    // 眉 + 眼（剑光色的眼睛）
    seg(ctx, [h(0.38, -0.36), h(0.86, -0.4)], 1.2 * k, pal.c(L.hair), null);
    poly(ctx, [h(0.44, -0.18), h(0.8, -0.22), h(0.78, -0.06), h(0.46, -0.04)], pal.c(L.eye), null);
    glowDot(ctx, ...h(0.62, -0.13), 0.9 * k, L.eye, pal);
    seg(ctx, [h(0.7, 0.42), h(0.86, 0.4)], 0.9 * k, pal.c(L.skin, 0.7), null);

    // 肩甲
    ctx.save();
    ctx.translate(J.shF[0], J.shF[1] - 1 * k);
    ctx.rotate(0.25);
    poly(ctx, [[-7 * k, 2 * k], [-5 * k, -4 * k], [3 * k, -5 * k], [8 * k, 0], [6 * k, 4 * k]], pal.c(L.metal), pal.ol);
    seg(ctx, [[-4 * k, -2.5 * k], [4 * k, -3 * k]], 1.2 * k, pal.c(L.metal, 1.3), null);
    ctx.restore();

    arm(ctx, J, 'F', { up: L.coat, fore: L.glove }, pal, { hand: false });
    weapon(ctx, J, L.weapon, pal);
    circle(ctx, J.handF[0], J.handF[1], 3.8 * k, pal.c(L.glove), pal.ol);
  },

  // 腐骨兵：骷髅
  grunt(ctx, J, L, P, pal) {
    const { k, hip, chest, tw, head, hr } = J;
    const bone = { thigh: L.bone, shin: L.bone, up: L.bone, fore: L.bone };
    arm(ctx, J, 'B', bone, pal, { ws: 0.6 });
    leg(ctx, J, 'B', bone, pal, 0.55);
    leg(ctx, J, 'F', bone, pal, 0.55);
    poly(ctx, [add(hip, -6 * k, -1 * k), add(hip, 6 * k, -1 * k), add(hip, 4 * k, 5 * k), add(hip, -4 * k, 5 * k)], pal.c(L.bone, 0.85), pal.ol);
    poly(ctx, [add(hip, -7 * k, 0), add(hip, 7 * k, 0), add(hip, 6 * k, 14 * k), add(hip, 3 * k, 10 * k), add(hip, 0, 17 * k), add(hip, -3 * k, 11 * k), add(hip, -6 * k, 15 * k)], pal.c(L.cloth), pal.ol);
    seg(ctx, [hip, chest], 3.2 * k, pal.c(L.bone, 0.9), pal.ol);
    for (let i = 0; i < 3; i++) {
      const s = mix(chest, hip, 0.25 + i * 0.18);
      seg(ctx, [add(s, -1 * k, 0), add(s, 7 * k - i * k, 2 * k), add(s, 6 * k - i * k, 5 * k)], 2.2 * k, pal.c(L.bone), pal.ol);
    }
    poly(ctx, [add(chest, -tw * 0.85, -1 * k), add(chest, tw * 0.95, -1 * k), add(chest, tw * 0.7, 8 * k), add(chest, -tw * 0.6, 6 * k)], pal.c(L.armor), pal.ol);
    seg(ctx, [add(chest, -tw * 0.5, 2 * k), add(chest, tw * 0.6, 2 * k)], 1.2 * k, pal.c(L.armor, 1.35), null);
    // 骷髅头
    seg(ctx, [add(chest, 1 * k, 0), add(head, 0, hr * 0.6)], 3 * k, pal.c(L.bone, 0.85), pal.ol);
    circle(ctx, head[0], head[1], hr, pal.c(L.bone), pal.ol);
    const h = (x, y) => add(head, x * hr, y * hr);
    poly(ctx, [h(-0.2, 0.45), h(0.95, 0.3), h(0.88, 0.95), h(0.05, 0.95)], pal.c(L.bone, 0.9), pal.ol);
    seg(ctx, [h(0.25, 0.62), h(0.85, 0.58)], 0.9 * k, pal.c('#3a2a24'), null);
    circle(ctx, ...h(0.42, -0.12), hr * 0.32, pal.c('#1a0d0d'), null);
    circle(ctx, ...h(0.42, -0.12), hr * 0.13, pal.c(L.eye), null);
    glowDot(ctx, ...h(0.42, -0.12), hr * 0.12, L.eye, pal);
    arm(ctx, J, 'F', bone, pal, { ws: 0.6, hand: false });
    weapon(ctx, J, L.weapon, pal);
    circle(ctx, J.handF[0], J.handF[1], 2.8 * k, pal.c(L.bone), pal.ol);
  },

  // 影弓手：兜帽斗篷
  archer(ctx, J, L, P, pal) {
    const { k, hip, chest, tw, head, hr } = J;
    const sway = Math.sin(pal.t * 0.15 + 1) * 3 * k, drift = (P.lean || 0) * 0.6 * k;
    poly(ctx, [add(chest, -tw * 0.9, -2 * k), add(chest, 2 * k, -1 * k), add(hip, -2 * k - drift * 0.4, 30 * k + sway * 0.4), add(hip, -18 * k - drift, 26 * k - sway)], pal.c(L.cloak, 0.7), pal.ol);
    poly(ctx, [add(chest, -9 * k, -9 * k), add(chest, -4 * k, -11 * k), add(chest, -1 * k, 10 * k), add(chest, -6 * k, 12 * k)], pal.c(L.leather), pal.ol);
    for (let i = 0; i < 3; i++) seg(ctx, [add(chest, -8 * k + i * 1.8 * k, -9 * k - i * 0.6 * k), add(chest, -9 * k + i * 1.8 * k, -15 * k - i * 0.6 * k)], 1.6 * k, pal.c('#d9c9a8'), null);
    const wrap = { thigh: L.wrap, shin: L.wrap, boot: L.boots, up: L.cloth, fore: L.wrap };
    arm(ctx, J, 'B', wrap, pal);
    leg(ctx, J, 'B', wrap, pal, 0.85);
    leg(ctx, J, 'F', wrap, pal, 0.85);
    torso(ctx, J, pal.c(L.cloth), pal);
    seg(ctx, [add(chest, -tw * 0.8, 1 * k), add(hip, tw * 0.8, -2 * k)], 2.5 * k, pal.c(L.leather), null);
    seg(ctx, [add(hip, -tw * 0.9, 0), add(hip, tw * 0.9, 0)], 3.4 * k, pal.c(L.leather), pal.ol);
    // 兜帽
    const h = (x, y) => add(head, x * hr, y * hr);
    poly(ctx, [h(-1.05, -0.65), h(-2.1 - drift * 0.03, -0.1 + sway * 0.02), h(-0.95, 0.75)], pal.c(L.cloak), pal.ol);
    circle(ctx, head[0], head[1], hr * 1.22, pal.c(L.cloak), pal.ol);
    circle(ctx, ...h(0.3, 0.12), hr * 0.78, pal.c('#120e16'), null);
    for (const x of [0.38, 0.78]) {
      circle(ctx, ...h(x, 0.02), hr * 0.1, pal.c(L.eye), null);
      glowDot(ctx, ...h(x, 0.02), hr * 0.09, L.eye, pal);
    }
    arm(ctx, J, 'F', wrap, pal, { hand: false });
    weapon(ctx, J, L.weapon, pal);
    circle(ctx, J.handF[0], J.handF[1], 3.4 * k, pal.c(L.wrap), pal.ol);
  },

  // 铁甲屠夫：巨汉、角盔、双手斧
  brute(ctx, J, L, P, pal) {
    const { k, hip, chest, tw, head, hr } = J;
    arm(ctx, J, 'B', { up: L.skin, fore: L.skin, bracer: L.metal }, pal, { hand: false });
    leg(ctx, J, 'B', { thigh: L.pants, shin: L.pants, boot: L.metal }, pal);
    leg(ctx, J, 'F', { thigh: L.pants, shin: L.pants, boot: L.metal }, pal);
    torso(ctx, J, pal.c(L.skin), pal, 0.28);
    poly(ctx, [add(hip, 0, 1 * k), add(mix(hip, chest, 0.4), tw * 0.9, 0), add(chest, tw * 0.9, 2 * k), add(chest, tw * 0.1, 3 * k)], pal.c(L.skin, 1.12), null);
    seg(ctx, [add(chest, -tw * 0.75, 0), add(hip, tw * 0.85, -5 * k)], 3.8 * k, pal.c(L.leather), pal.ol);
    poly(ctx, [add(hip, -tw * 0.2, 0), add(hip, tw * 1.0, 0), add(hip, tw * 1.05, 25 * k), add(hip, tw * 0.1, 27 * k)], pal.c(L.leather), pal.ol);
    seg(ctx, [add(hip, tw * 0.3, 10 * k), add(hip, tw * 0.7, 16 * k)], 2.6 * k, pal.c(L.leather, 0.6), null);
    seg(ctx, [add(hip, -tw * 0.9, 0), add(hip, tw * 1.0, 0)], 5 * k, pal.c(L.leather, 0.8), pal.ol);
    // 角盔
    const h = (x, y) => add(head, x * hr, y * hr);
    seg(ctx, [h(-0.3, -0.9), h(-1.0, -1.7), h(-0.4, -2.25)], 3.2 * k, pal.c('#d9cfb8', 0.75), pal.ol);
    poly(ctx, [h(-1.05, 0.6), h(-1.1, -0.7), h(-0.4, -1.15), h(0.6, -1.1), h(1.15, -0.5), h(1.1, 0.65)], pal.c(L.metal), pal.ol);
    seg(ctx, [h(-0.2, -1.1), h(-0.2, 0.6)], 1.4 * k, pal.c(L.metal, 1.3), null);
    seg(ctx, [h(0.25, -0.08), h(1.05, -0.14)], 2 * k, pal.c('#1a0d0d'), null);
    glowDot(ctx, ...h(0.7, -0.11), 1.4 * k, L.eye, pal);
    seg(ctx, [h(0.5, -0.9), h(1.3, -1.6), h(0.9, -2.2)], 3.4 * k, pal.c('#d9cfb8'), pal.ol);
    // 肩甲（双肩，带尖刺）
    for (const [sh, f] of [[J.shB, 0.72], [J.shF, 1]]) {
      poly(ctx, [add(sh, -10 * k, 4 * k), add(sh, -7 * k, -7 * k), add(sh, 4 * k, -8 * k), add(sh, 11 * k, 1 * k), add(sh, 6 * k, 6 * k)], pal.c(L.metal, f), pal.ol);
      poly(ctx, [add(sh, -4 * k, -7 * k), add(sh, -2 * k, -15 * k), add(sh, 1 * k, -7.5 * k)], pal.c('#d9cfb8', f), pal.ol);
    }
    arm(ctx, J, 'F', { up: L.skin, fore: L.skin, bracer: L.metal }, pal, { hand: false });
    weapon(ctx, J, L.weapon, pal);
    circle(ctx, J.handB[0], J.handB[1], 4.4 * k, pal.c(L.skin, 0.8), pal.ol);
    circle(ctx, J.handF[0], J.handF[1], 4.6 * k, pal.c(L.skin), pal.ol);
  },
};

// look = 外观（颜色、武器、体型），pose = 姿势，o = { facing, flash, ghost, alpha, t }
export function drawFighter(ctx, sx, sy, look, pose, o = {}) {
  const k = (look.h ?? 86) / 86;
  const J = rig(look, pose, k);
  J.draw = pose.draw;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(o.facing ?? 1, 1);
  if (pose.lie) {
    ctx.translate(0, -8 * k * pose.lie);
    ctx.rotate((-Math.PI / 2) * pose.lie);
  }
  ctx.globalAlpha *= o.alpha ?? 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const pal = {
    c: (hex, f = 1) => o.ghost || (o.flash ? '#ffffff' : f === 1 ? hex : shade(hex, f)),
    ol: o.ghost ? null : o.flash ? '#ffffff' : OUT,
    t: o.t || 0,
    ghost: !!o.ghost,
    flash: !!o.flash,
  };
  BODY[look.rig](ctx, J, look, pose, pal);
  ctx.restore();
}
