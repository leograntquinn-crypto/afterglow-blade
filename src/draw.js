// 绘制：门、阴影、暗角（场景本身在 scenery.js）
import { VIEW_W, VIEW_H, GROUND_TOP, DEPTH, world } from './config.js';
import { propsL, drawProp, PROP_SCALE } from './props_sprites.js';
import { lightTex } from './fx_art.js';
import { tinted } from './fx_tex.js';

// 光照包 fx_light_v1 的一张发光贴图，按「原画布」的锚点画：(x, y) 是锚点的位置，w × h 是原画布铺开的大小
// （贴图裁过透明边，cx / cy / fw / fh 记着它在原画布里的位置）。没载好就不画
export function drawLightTex(ctx, id, color, x, y, w, h, alpha = 1) {
  const img = lightTex(id);
  if (!img || alpha <= 0) return;
  const kx = w / img.fw, ky = h / img.fh;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= alpha;
  ctx.drawImage(color ? tinted(img, color) : img, x - img.cx * kx, y - img.cy * ky, img.width * kx, img.height * ky);
  ctx.restore();
}
const rgb = (c) => `rgb(${c})`;

// 铁栅门（ENV-3 素材）：没清完是关着的（红光），清完升起（0.5 秒）后变青光。没载入素材时退回程序画的拱门
function drawGate(ctx, x, room, open, t) {
  if (!propsL.ready) return false;
  const i = !open ? 0 : room.openedAt == null ? 7 : Math.min(7, 1 + Math.floor((t - room.openedAt) / 5));
  const c = open ? '127,243,255' : '255,77,94';
  // 门光：光照包的 door_light（竖直的光幕，底部最亮往上渐隐），锚点在底部中心
  drawLightTex(ctx, 'door_light', rgb(c), x, GROUND_TOP, 110, 200, open ? 0.75 : 0.4);
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
  drawLightTex(ctx, 'door_light', rgb(c), x, GROUND_TOP, w * 1.4, (GROUND_TOP - top) * 1.3, open ? 0.8 : 0.35);
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
    // 地面光带：door_light 横过来铺在地上（底部 = 门口最亮，往房间里渐隐）
    const band = lightTex('door_light');
    if (band) {
      const L = 110, H = DEPTH + 10, kx = L / band.fh, ky = H / band.fw;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55 * pulse;
      ctx.translate(edge, GROUND_TOP - 4 + H / 2);
      ctx.rotate(inward > 0 ? Math.PI / 2 : -Math.PI / 2); // 光幕的「往上」转成「往房间里」
      ctx.scale(ky, kx);
      ctx.drawImage(tinted(band, rgb(c)), -band.cx, -band.cy, band.width, band.height);
      ctx.restore();
    }
    // 出口箭头：光照包的 exit_chevron（朝右，往西的门镜像），三个依次往外流
    const chev = lightTex('exit_chevron');
    if (open && chev) {
      const ay = GROUND_TOP + DEPTH / 2, sz = 26;
      for (let i = 0; i < 3; i++) {
        const ax = edge + inward * (70 - i * 16 + ((t * 0.6) % 16));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55 + 0.4 * pulse;
        ctx.translate(ax, ay);
        ctx.scale((-inward * sz) / chev.fw, sz / chev.fh);
        ctx.drawImage(tinted(chev, rgb(c)), -chev.cx, -chev.cy);
        ctx.restore();
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

// 暗角：光照包的 vignette（中间透明、四周渐暗、带笔刷质感），铺满画面。没载好就不画
export function drawVignette(ctx) {
  const img = lightTex('vignette');
  if (!img) return;
  ctx.drawImage(img, 0, 0, VIEW_W, VIEW_H);
}

export function drawShadow(ctx, ent, camX) {
  const s = 1 - Math.min(ent.z, 220) / 300;
  ctx.fillStyle = `rgba(0,0,0,${0.4 * s})`;
  ctx.beginPath();
  ctx.ellipse(ent.x - camX, GROUND_TOP + ent.y, ent.w * 0.8 * s, 7 * s, 0, 0, Math.PI * 2);
  ctx.fill();
}
