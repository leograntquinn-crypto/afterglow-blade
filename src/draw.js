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
