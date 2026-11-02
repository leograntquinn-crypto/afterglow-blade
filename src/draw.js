// 绘制：门、阴影、暗角（场景本身在 scenery.js）
import { VIEW_W, VIEW_H, GROUND_TOP, DEPTH, world } from './config.js';
import { propsL, drawProp, PROP_SCALE } from './props_sprites.js';

// 铁栅门（ENV-3 素材）：没清完是关着的（红光），清完升起（0.5 秒）后变青光。没载入素材时退回程序画的拱门
function drawGate(ctx, x, room, open, t) {
  if (!propsL.ready) return false;
  const i = !open ? 0 : room.openedAt == null ? 7 : Math.min(7, 1 + Math.floor((t - room.openedAt) / 5));
  const c = open ? '127,243,255' : '255,77,94';
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const top = GROUND_TOP - 120;
  const g = ctx.createLinearGradient(0, top, 0, GROUND_TOP);
  g.addColorStop(0, `rgba(${c},0)`);
  g.addColorStop(1, `rgba(${c},${open ? 0.4 : 0.2})`);
  ctx.fillStyle = g;
  ctx.fillRect(x - 40, top, 80, GROUND_TOP - top);
  ctx.restore();
  drawProp(ctx, propsL, 'gate', i, x, GROUND_TOP + 4, { scale: PROP_SCALE.gate });
  return true;
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
    if (!drawGate(ctx, edge + inward * 64, room, open, t)) drawArch(ctx, edge + inward * 52, 70, 170, open, t);
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
  if (room.doors.n && !drawGate(ctx, world.w / 2 - camX, room, open, t)) drawArch(ctx, world.w / 2 - camX, 110, 120, open, t);
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
