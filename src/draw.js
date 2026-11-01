// 绘制：背景场景 + 程序化人形角色（全部用代码画，不需要图片素材）
import { VIEW_W, VIEW_H, GROUND_TOP } from './config.js';

// ---------------- 背景：地下墓穴大厅 ----------------
export function drawBackground(ctx, camX, t) {
  const wall = ctx.createLinearGradient(0, 0, 0, GROUND_TOP);
  wall.addColorStop(0, '#0d0a12');
  wall.addColorStop(1, '#2a1d2a');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, VIEW_W, GROUND_TOP);

  // 远景柱廊（视差：镜头移动 1 像素，远景只移动 0.5 像素，产生纵深感）
  const par = camX * 0.5, spacing = 300;
  const first = Math.floor(par / spacing) - 1;
  for (let i = first; i < first + VIEW_W / spacing + 3; i++) {
    const x = i * spacing - par;
    // 拱窗
    ctx.fillStyle = '#120d16';
    ctx.beginPath();
    ctx.moveTo(x + 60, GROUND_TOP);
    ctx.lineTo(x + 60, 150);
    ctx.arc(x + 150, 150, 90, Math.PI, 0);
    ctx.lineTo(x + 240, GROUND_TOP);
    ctx.fill();
    // 柱子
    ctx.fillStyle = '#231a26';
    ctx.fillRect(x - 22, 40, 44, GROUND_TOP - 40);
    ctx.fillStyle = '#30253a';
    ctx.fillRect(x - 22, 40, 7, GROUND_TOP - 40);
    ctx.fillStyle = '#1a131d';
    ctx.fillRect(x - 30, 36, 60, 14);
    ctx.fillRect(x - 28, GROUND_TOP - 22, 56, 22);
    // 火把与光晕
    const fl = 0.8 + Math.sin(t * 0.31 + i * 1.7) * 0.1 + Math.sin(t * 0.73 + i) * 0.07;
    const tx = x, ty = 170;
    const glow = ctx.createRadialGradient(tx, ty, 0, tx, ty, 130 * fl);
    glow.addColorStop(0, 'rgba(255,170,80,0.32)');
    glow.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(tx - 140, ty - 140, 280, 280);
    ctx.fillStyle = '#3a2a22';
    ctx.fillRect(tx - 3, ty + 4, 6, 16);
    ctx.fillStyle = '#ffcf7a';
    ctx.beginPath();
    ctx.ellipse(tx, ty - 2, 5 * fl, 10 * fl, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 地面
  const floor = ctx.createLinearGradient(0, GROUND_TOP, 0, VIEW_H);
  floor.addColorStop(0, '#3a2d36');
  floor.addColorStop(1, '#16111a');
  ctx.fillStyle = floor;
  ctx.fillRect(0, GROUND_TOP - 6, VIEW_W, VIEW_H - GROUND_TOP + 6);
  ctx.fillStyle = 'rgba(255,190,120,0.07)';
  ctx.fillRect(0, GROUND_TOP - 6, VIEW_W, 3);

  // 地砖缝（横线 + 带透视的竖线）
  ctx.strokeStyle = 'rgba(0,0,0,0.32)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const d of [18, 44, 78, 122, 176]) {
    ctx.moveTo(0, GROUND_TOP + d);
    ctx.lineTo(VIEW_W, GROUND_TOP + d);
  }
  const tile = 140, start = Math.floor(camX / tile) - 3;
  for (let i = start; i < start + VIEW_W / tile + 6; i++) {
    const sx = i * tile - camX;
    ctx.moveTo(sx, GROUND_TOP - 4);
    ctx.lineTo(VIEW_W / 2 + (sx - VIEW_W / 2) * 1.4, VIEW_H);
  }
  ctx.stroke();
}

export function drawVignette(ctx) {
  const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.95);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

export function drawShadow(ctx, ent, camX) {
  const s = 1 - Math.min(ent.z, 220) / 300;
  ctx.fillStyle = `rgba(0,0,0,${0.4 * s})`;
  ctx.beginPath();
  ctx.ellipse(ent.x - camX, GROUND_TOP + ent.y, ent.w * 0.8 * s, 7 * s, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------- 人形角色 ----------------
// (sx, sy) 是脚底的屏幕坐标。o 里是外观（颜色、武器）和姿势（前倾、挥刀角度…）
// 姿势参数让同一个函数能画出待机、奔跑、挥砍、倒地等所有动作。
export function drawHumanoid(ctx, sx, sy, o) {
  const k = (o.h ?? 86) / 86; // 身高缩放
  const bulk = o.bulk ?? 1; // 体型宽度
  const lean = (o.lean ?? 0) * k;
  const crouch = o.crouch ?? 0;
  const col = (c) => o.ghost || (o.flash ? '#ffffff' : c);

  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(o.facing ?? 1, 1); // 朝左时整体镜像
  if (o.lie) {
    ctx.translate(0, -8 * k * o.lie);
    ctx.rotate((-Math.PI / 2) * o.lie); // 向后倒地
  }
  ctx.globalAlpha *= o.alpha ?? 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const hipY = -40 * k + crouch * 12 * k;
  const shY = -68 * k + crouch * 18 * k;
  const headY = shY - 12 * k;
  const hipX = lean * 0.3, shX = lean;

  // 腿
  const stride = Math.sin(o.walk ?? 0) * 11 * k;
  const knee = crouch * 9 * k;
  ctx.strokeStyle = col(o.limb);
  ctx.lineWidth = 8 * k * bulk;
  ctx.beginPath();
  ctx.moveTo(hipX - 4 * k, hipY);
  ctx.lineTo(hipX - 4 * k - stride * 0.5 + knee, hipY * 0.5);
  ctx.lineTo(-7 * k - stride, 0);
  ctx.moveTo(hipX + 4 * k, hipY);
  ctx.lineTo(hipX + 6 * k + stride * 0.5 + knee, hipY * 0.5);
  ctx.lineTo(8 * k + stride, 0);
  ctx.stroke();

  // 围巾（在身体后面）
  if (o.scarf) {
    const w = (o.t ?? 0) * 0.2;
    ctx.strokeStyle = col(o.scarf);
    ctx.lineWidth = 5 * k;
    ctx.beginPath();
    ctx.moveTo(shX - 2 * k, shY + 2 * k);
    ctx.quadraticCurveTo(shX - 22 * k, shY + 4 * k + Math.sin(w) * 4, shX - 40 * k, shY + 12 * k + Math.sin(w + 1.5) * 7);
    ctx.stroke();
  }

  // 躯干
  const tw = 11 * k * bulk;
  ctx.fillStyle = col(o.body);
  ctx.beginPath();
  ctx.moveTo(hipX - tw * 0.85, hipY + 3 * k);
  ctx.lineTo(hipX + tw * 0.85, hipY + 3 * k);
  ctx.lineTo(shX + tw, shY);
  ctx.lineTo(shX - tw, shY);
  ctx.closePath();
  ctx.fill();

  // 头
  const hr = 9 * k * Math.sqrt(bulk);
  ctx.fillStyle = col(o.head);
  ctx.beginPath();
  ctx.arc(shX + 2 * k, headY, hr, 0, Math.PI * 2);
  ctx.fill();
  if (o.hood) {
    ctx.fillStyle = col(o.hood);
    ctx.beginPath();
    ctx.arc(shX + 1 * k, headY - 1 * k, hr + 2.5 * k, Math.PI * 0.6, Math.PI * 2.15);
    ctx.fill();
  }
  if (o.eye && !o.ghost) {
    ctx.fillStyle = o.flash ? '#ffffff' : o.eye;
    ctx.fillRect(shX + 5 * k, headY - 2 * k, 4.5 * k, 2.5 * k);
  }

  // 手臂 + 武器（角度 a：0 = 正前方，负 = 向上）
  const a = o.angle ?? 0.6;
  const shoulderX = shX + 3 * k, shoulderY = shY + 4 * k;
  const armLen = 20 * k * Math.sqrt(bulk);
  const hx = shoulderX + Math.cos(a) * armLen, hy = shoulderY + Math.sin(a) * armLen;
  ctx.strokeStyle = col(o.limb);
  ctx.lineWidth = 7 * k * bulk;
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY);
  ctx.lineTo(hx, hy);
  ctx.stroke();

  if (o.weapon) drawWeapon(ctx, o, hx, hy, a, k, col);
  ctx.restore();
}

function drawWeapon(ctx, o, hx, hy, a, k, col) {
  const w = o.weapon, ca = Math.cos(a), sa = Math.sin(a);
  if (w.type === 'sword' || w.type === 'axe') {
    const L = w.len * k, ex = hx + ca * L, ey = hy + sa * L;
    if (w.glow && !o.ghost) {
      ctx.save();
      ctx.globalAlpha *= 0.35;
      ctx.strokeStyle = w.glow;
      ctx.lineWidth = 10 * k;
      ctx.beginPath();
      ctx.moveTo(hx + ca * 8 * k, hy + sa * 8 * k);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = col(w.type === 'axe' ? '#4a3a30' : w.color);
    ctx.lineWidth = (w.type === 'axe' ? 5 : 3.5) * k;
    ctx.beginPath();
    ctx.moveTo(hx - ca * 6 * k, hy - sa * 6 * k);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    // 护手
    ctx.strokeStyle = col('#c9a45c');
    ctx.lineWidth = 3 * k;
    ctx.beginPath();
    ctx.moveTo(hx + ca * 5 * k - sa * 6 * k, hy + sa * 5 * k + ca * 6 * k);
    ctx.lineTo(hx + ca * 5 * k + sa * 6 * k, hy + sa * 5 * k - ca * 6 * k);
    ctx.stroke();
    if (w.type === 'axe') {
      // 斧刃：垂直于斧柄的梯形
      const bx = hx + ca * L * 0.75, by = hy + sa * L * 0.75, nx = -sa, ny = ca;
      ctx.fillStyle = col(w.color);
      ctx.beginPath();
      ctx.moveTo(bx - ca * 10 * k, by - sa * 10 * k);
      ctx.lineTo(bx - ca * 14 * k + nx * 26 * k, by - sa * 14 * k + ny * 26 * k);
      ctx.lineTo(bx + ca * 16 * k + nx * 26 * k, by + sa * 16 * k + ny * 26 * k);
      ctx.lineTo(bx + ca * 12 * k, by + sa * 12 * k);
      ctx.closePath();
      ctx.fill();
    }
  } else if (w.type === 'bow') {
    const R = 24 * k, cx = hx - 4 * k, cy = hy;
    ctx.strokeStyle = col(w.color);
    ctx.lineWidth = 3.5 * k;
    ctx.beginPath();
    ctx.arc(cx, cy, R, -1.2, 1.2);
    ctx.stroke();
    const tx = cx + R * Math.cos(-1.2), ty = cy + R * Math.sin(-1.2), by = cy + R * Math.sin(1.2);
    const pull = (o.draw ?? 0) * 26 * k;
    ctx.strokeStyle = col('#d8cfc0');
    ctx.lineWidth = 1.2 * k;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - pull, cy);
    ctx.lineTo(tx, by);
    ctx.stroke();
    if (pull > 0) {
      ctx.strokeStyle = col('#ff8a6a');
      ctx.lineWidth = 2 * k;
      ctx.beginPath();
      ctx.moveTo(tx - pull, cy);
      ctx.lineTo(cx + R + 10 * k, cy);
      ctx.stroke();
    }
  }
}
