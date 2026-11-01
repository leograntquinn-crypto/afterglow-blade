// 绘制：背景场景、门、阴影、暗角（全部用代码画，不需要图片素材）
import { VIEW_W, VIEW_H, GROUND_TOP, DEPTH, world } from './config.js';

// 每个地下城一套配色：墙、柱子、地面、火光
export const THEMES = {
  crypt: { wall: ['#0d0a12', '#2a1d2a'], arch: '#120d16', pillar: '#231a26', hi: '#30253a', floor: ['#3a2d36', '#16111a'], torch: '255,170,80', flame: '#ffcf7a' },
  hall: { wall: ['#0a0d14', '#1d2433'], arch: '#0b0f18', pillar: '#1a2130', hi: '#283246', floor: ['#2c3240', '#12151c'], torch: '150,190,255', flame: '#cfe4ff' },
  gallows: { wall: ['#120a0a', '#2e1a18'], arch: '#150b0a', pillar: '#2a1816', hi: '#3a2420', floor: ['#3a2a26', '#181010'], torch: '255,110,60', flame: '#ffb07a' },
  altar: { wall: ['#08100c', '#16281e'], arch: '#0a130e', pillar: '#15241c', hi: '#1f3428', floor: ['#24342c', '#0e1612'], torch: '110,227,138', flame: '#c8ffd6' },
  abyss: { wall: ['#06060f', '#151634'], arch: '#08081a', pillar: '#141634', hi: '#20244a', floor: ['#1e2038', '#0a0a16'], torch: '180,107,255', flame: '#e6d0ff' },
};

// ---------------- 背景 ----------------
export function drawBackground(ctx, camX, t, th = THEMES.crypt) {
  const wall = ctx.createLinearGradient(0, 0, 0, GROUND_TOP);
  wall.addColorStop(0, th.wall[0]);
  wall.addColorStop(1, th.wall[1]);
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, VIEW_W, GROUND_TOP);

  // 远景柱廊（视差：镜头移动 1 像素，远景只移动 0.5 像素，产生纵深感）
  const par = camX * 0.5, spacing = 300;
  const first = Math.floor(par / spacing) - 1;
  for (let i = first; i < first + VIEW_W / spacing + 3; i++) {
    const x = i * spacing - par;
    ctx.fillStyle = th.arch;
    ctx.beginPath();
    ctx.moveTo(x + 60, GROUND_TOP);
    ctx.lineTo(x + 60, 150);
    ctx.arc(x + 150, 150, 90, Math.PI, 0);
    ctx.lineTo(x + 240, GROUND_TOP);
    ctx.fill();
    ctx.fillStyle = th.pillar;
    ctx.fillRect(x - 22, 40, 44, GROUND_TOP - 40);
    ctx.fillStyle = th.hi;
    ctx.fillRect(x - 22, 40, 7, GROUND_TOP - 40);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(x - 30, 36, 60, 14);
    ctx.fillRect(x - 28, GROUND_TOP - 22, 56, 22);
    // 火把与光晕
    const fl = 0.8 + Math.sin(t * 0.31 + i * 1.7) * 0.1 + Math.sin(t * 0.73 + i) * 0.07;
    const tx = x, ty = 170;
    const glow = ctx.createRadialGradient(tx, ty, 0, tx, ty, 130 * fl);
    glow.addColorStop(0, `rgba(${th.torch},0.32)`);
    glow.addColorStop(1, `rgba(${th.torch},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(tx - 140, ty - 140, 280, 280);
    ctx.fillStyle = '#3a2a22';
    ctx.fillRect(tx - 3, ty + 4, 6, 16);
    ctx.fillStyle = th.flame;
    ctx.beginPath();
    ctx.ellipse(tx, ty - 2, 5 * fl, 10 * fl, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 地面
  const floor = ctx.createLinearGradient(0, GROUND_TOP, 0, VIEW_H);
  floor.addColorStop(0, th.floor[0]);
  floor.addColorStop(1, th.floor[1]);
  ctx.fillStyle = floor;
  ctx.fillRect(0, GROUND_TOP - 6, VIEW_W, VIEW_H - GROUND_TOP + 6);
  ctx.fillStyle = `rgba(${th.torch},0.07)`;
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

// ---------------- 门 ----------------
// 东西两侧：墙上的拱门 + 地面光带；北：后墙中间的大拱门；南：前方地面的下行台阶
// 房间没清完是红色封印，清完变成青色光并出现箭头
function archPath(ctx, x, w, top) {
  ctx.beginPath();
  ctx.moveTo(x - w / 2, GROUND_TOP);
  ctx.lineTo(x - w / 2, top + w / 2);
  ctx.arc(x, top + w / 2, w / 2, Math.PI, 0);
  ctx.lineTo(x + w / 2, GROUND_TOP);
  ctx.closePath();
}

function drawArch(ctx, x, w, top, open, t) {
  const c = open ? '127,243,255' : '255,77,94';
  ctx.fillStyle = '#050407';
  archPath(ctx, x, w, top);
  ctx.fill();
  ctx.save();
  archPath(ctx, x, w, top);
  ctx.clip();
  const g = ctx.createLinearGradient(0, top, 0, GROUND_TOP);
  g.addColorStop(0, `rgba(${c},0)`);
  g.addColorStop(1, `rgba(${c},${open ? 0.45 : 0.18})`);
  ctx.fillStyle = g;
  ctx.fillRect(x - w / 2, top, w, GROUND_TOP - top);
  if (!open) {
    ctx.strokeStyle = '#3a3440';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = 1; i < 5; i++) {
      ctx.moveTo(x - w / 2 + (w * i) / 5, top);
      ctx.lineTo(x - w / 2 + (w * i) / 5, GROUND_TOP);
    }
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = `rgba(${c},${0.5 + 0.3 * Math.sin(t * 0.08)})`;
  ctx.lineWidth = 2;
  archPath(ctx, x, w, top);
  ctx.stroke();
}

export function drawDoors(ctx, camX, room, t) {
  if (!room) return;
  const open = room.cleared;
  const c = open ? '127,243,255' : '255,77,94';
  const pulse = 0.6 + 0.4 * Math.sin(t * 0.08);
  for (const d of ['w', 'e']) {
    if (!room.doors[d]) continue;
    const edge = (d === 'w' ? 0 : world.w) - camX;
    const inward = d === 'w' ? 1 : -1;
    drawArch(ctx, edge + inward * 52, 70, 170, open, t);
    // 地面光带
    const g = ctx.createLinearGradient(edge, 0, edge + inward * 90, 0);
    g.addColorStop(0, `rgba(${c},${0.32 * pulse})`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(Math.min(edge, edge + inward * 90), GROUND_TOP - 4, 90, DEPTH + 10);
    if (open) {
      ctx.fillStyle = `rgba(${c},${0.5 + 0.4 * pulse})`;
      for (let i = 0; i < 3; i++) {
        const ax = edge + inward * (70 - i * 16 + ((t * 0.6) % 16));
        const ay = GROUND_TOP + DEPTH / 2;
        ctx.beginPath();
        ctx.moveTo(ax, ay - 10);
        ctx.lineTo(ax - inward * 10, ay);
        ctx.lineTo(ax, ay + 10);
        ctx.lineTo(ax - inward * 4, ay);
        ctx.fill();
      }
    }
  }
  if (room.doors.n) drawArch(ctx, world.w / 2 - camX, 110, 120, open, t);
  if (room.doors.s) {
    const sx = world.w / 2 - camX, y = GROUND_TOP + DEPTH + 6;
    ctx.fillStyle = '#050407';
    ctx.beginPath();
    ctx.moveTo(sx - 70, y);
    ctx.lineTo(sx + 70, y);
    ctx.lineTo(sx + 90, VIEW_H);
    ctx.lineTo(sx - 90, VIEW_H);
    ctx.fill();
    ctx.strokeStyle = `rgba(${c},${0.35 * pulse + 0.2})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const yy = y + 4 + i * 9;
      ctx.moveTo(sx - 72 - i * 4, yy);
      ctx.lineTo(sx + 72 + i * 4, yy);
    }
    ctx.stroke();
  }
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
