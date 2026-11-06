// 刀光条带（素材包 fx_blade_v1，规格 docs/ART_FX_BLADE_V1.md）：把一条水平的条带贴图沿刀尖的轨迹铺开。
//
// 条带的坐标约定：横向 u = 沿着拖尾（0 = 最旧的尾巴，1 = 最新的刀头）；纵向：上沿 = 刀尖扫过的外沿（最亮），下沿 = 靠刀柄的内沿（透明）。
// 铺法：相邻两个采样点之间是一个四边形（外沿两点 + 内沿两点），把条带对应的那一段（u0..u1）仿射贴上去：
//   条带 (u0·W, 0) → 外沿点 a，(u1·W, 0) → 外沿点 b，(u0·W, H) → 内沿点 a。再裁到真实的四边形里（相邻段不重叠、不留缝）。
// 代码只负责铺开、淡出和染色；画面上的光全是素材（第 14 项永久规则：不再用代码画刀光形状）。
// 每段画两遍：染成刀光颜色的一遍 + 原图灰度的一遍（叠加），外沿的亮线保持接近白色，往内渐变成刀光颜色再到透明。
import { FX_ART } from './fx_art.js';
import { tinted } from './fx_tex.js';

// kind：light（普攻）/ heavy（重击、第三段、下劈）/ skill（技能）。素材没载好返回 null（这时不画刀光，不用代码画的替身）
export function ribbonTex(kind) {
  const P = FX_ART.bladeTex;
  return (P.ready && P.items[`blade_ribbon_${kind}`]) || null;
}
export function tipFlare() {
  const P = FX_ART.bladeTex;
  return (P.ready && P.items.blade_tip_flare) || null;
}

// pts：从旧到新的采样点 [{ ox, oy, ix, iy, u }]（屏幕坐标；o = 外沿 / 刀尖，i = 内沿 / 刀柄一侧）
// color：刀光颜色；alpha：整体透明度；white：原图灰度那一遍的强度（0 = 只画染色那一遍，比如泛光通道）
export function drawRibbon(ctx, img, pts, color, alpha = 1, white = 0.55) {
  if (!img || pts.length < 2) return;
  const W = img.width, H = img.height;
  const layers = [[tinted(img, color), alpha]];
  if (white > 0) layers.push([img, alpha * white]);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const x0 = a.u * W, x1 = b.u * W, dx = x1 - x0;
    if (Math.abs(dx) < 0.25) continue;
    // 仿射：条带坐标 → 屏幕。横向每单位 = (b.o - a.o) / dx，纵向每单位 = (a.i - a.o) / H
    const m11 = (b.ox - a.ox) / dx, m21 = (b.oy - a.oy) / dx, m12 = (a.ix - a.ox) / H, m22 = (a.iy - a.oy) / H;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(a.ox, a.oy); ctx.lineTo(b.ox, b.oy); ctx.lineTo(b.ix, b.iy); ctx.lineTo(a.ix, a.iy);
    ctx.closePath();
    ctx.clip();
    ctx.transform(m11, m21, m12, m22, a.ox - m11 * x0, a.oy - m21 * x0);
    const sx = Math.min(x0, x1), sw = Math.abs(dx);
    for (const [im, al] of layers) {
      ctx.globalAlpha = al;
      ctx.drawImage(im, sx, 0, sw, H, sx, 0, sw, H);
    }
    ctx.restore();
  }
  ctx.restore();
}

// 刀尖当前位置的一点亮光（叠在条带最新端的外沿上）
export function drawTip(ctx, x, y, size, color, alpha = 1) {
  const img = tipFlare();
  if (!img) return;
  const k = size / img.width;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  ctx.drawImage(tinted(img, color), x - img.width * k / 2, y - img.height * k / 2, img.width * k, img.height * k);
  ctx.globalAlpha = alpha * 0.7;
  ctx.drawImage(img, x - img.width * k / 2, y - img.height * k / 2, img.width * k, img.height * k);
  ctx.restore();
}
