// ★ 夜鸦第二阶段「夜色笼罩了整条回廊」（第 9 项，子轮 H）：看不清的猎手。调手感就改 NIGHT 这张表。
//
// 机制（docs/AUDIT_PRE_GODOT.md 第 9 项「夜鸦」）：
//   - 半血进入第二阶段后，回廊在 ramp 帧里沉进夜色：环境暗度从关卡原来的值升到 ambient，主角身边的光圈收小到 playerLight；
//   - 夜鸦自己不再发光（平时首领身上有一圈光），只在这几种时候「现身」：
//       出招预警（弓上一点洋红闪光 glint，照亮它自己）、被你打中（reveal.hit 帧）、它的羽刃 / 箭飞过的地方（飞行物本来就发光）；
//   - 鸦影分身期间，真身和两个分身的光完全一样（不能用光泄露真身——分辨的线索仍然只有脚下的影子）；
//   - 地面预警照样看得清：红圈本来就自带光；齐射 / 回旋羽的地面光带很长，夜里沿着光带每隔 laneStep 补一盏光；
//   - 有夜鸦素材包（fx_boss_raven_v1）时，再叠一层 night_veil（洞对着主角）和空中飘落的黑羽 feather_drift；素材没载好时只有暗度变化。
// 全部用现有的光照（post.js 的环境暗度 + 光源挖洞）和成品素材，不画代码形状（第 14 项）。
import { FX_ART } from './fx_art.js';
import { VIEW_W, VIEW_H, world } from './config.js';
import { Lane } from './combat.js';

export const NIGHT = {
  ramp: 90, // 进入夜色用多少帧（第二阶段的咆哮约 1.5 秒）
  ambient: 0.88, // 夜里的环境暗度（关卡原来是 0.6～0.66；1 = 全黑）
  playerLight: 210, // 主角身边光圈的半径（平时 270）
  glint: { r: 200, a: 0.95, z: 0.62, x: 0.35 }, // 出招预警时弓上的光：半径、亮度、位置（× 身高）
  hitReveal: 28, // 被打中后现身多少帧
  revealLight: { r: 230, a: 0.75 }, // 现身时身上的光（和平时首领的光一样）
  laneStep: 170, laneLight: { r: 110, a: 0.6 }, // 夜里沿地面光带补的光：间隔、半径、亮度
  veilAlpha: 0.55, // night_veil 叠多深（光照本身已经压暗，这一层只加羽毛形状的边）
  drift: { every: 7, max: 28, fall: [0.5, 1.1], sway: 0.6, life: 260, k: 0.32 }, // 飘落的黑羽：每几帧一片、最多几片、下落速度、左右飘、寿命、大小
};

// 夜鸦（活着的、在夜色里的）。没有就返回 null
export const nightRaven = (g) => g.enemies?.find((e) => e.isBoss && e.key === 'nightRaven' && (e.night ?? 0) > 0) ?? null;

// 每帧（Boss.update 里调）：夜色的进度、现身计时、飘落的黑羽
export function updateNight(b, g) {
  if (b.key !== 'nightRaven') return;
  const want = b.phase >= 1 && b.alive ? 1 : 0;
  // 死了退得快一点（尸体约 45 帧后移除，要在那之前退完，不然夜色会一下子消失）
  b.night = Math.max(0, Math.min(1, (b.night ?? 0) + (want ? 1 : b.alive ? -1 : -2.5) / NIGHT.ramp));
  if (b.hp < (b.lastHp ?? b.hp)) b.revealT = NIGHT.hitReveal; // 被打中：现身一会儿
  b.lastHp = b.hp;
  if (b.revealT > 0) b.revealT--;
  updateDrift(b, g);
}

// 夜鸦现在照不照亮自己：出招预警（「!」那段）或刚被打中
export const revealed = (b) => !!b.tele || (b.revealT ?? 0) > 0;

// 夜里的环境暗度：把关卡的 'rgba(r,g,b,a)' 的 a 往 NIGHT.ambient 推
export function nightAmbient(base, night) {
  if (!night) return base;
  const m = /rgba\(([^,]+),([^,]+),([^,]+),([^)]+)\)/.exec(base);
  if (!m) return base;
  const a = +m[4] + (NIGHT.ambient - +m[4]) * night;
  return `rgba(${m[1]},${m[2]},${m[3]},${a.toFixed(3)})`;
}

// 夜里的光源（main.js 的光照那一段调，代替首领平时那盏常亮的光）。at(x, y, z) → 屏幕坐标
export function nightLights(g, b, post, at) {
  const lit = revealed(b);
  const spots = [{ x: b.x, y: b.y }, ...(b.split?.spots ?? [])]; // 分身期间三处一模一样
  for (const s of spots) {
    if (lit) post.addLight(...at(s.x, s.y, b.z + b.h * 0.5), NIGHT.revealLight.r, NIGHT.revealLight.a * b.fade);
    if (b.tele) post.addLight(...at(s.x + b.facing * b.h * NIGHT.glint.x, s.y, b.z + b.h * NIGHT.glint.z), NIGHT.glint.r, NIGHT.glint.a * b.fade, 'magic');
  }
  // 地面光带（Lane）很长，只有起点那盏光照不全：夜里沿着光带补光
  for (const h of g.hazards) {
    if (!(h instanceof Lane)) continue;
    const len = h.facing > 0 ? world.w - h.x : h.x;
    for (let d = NIGHT.laneStep; d < Math.min(len, 1400); d += NIGHT.laneStep) post.addLight(...at(h.x + h.facing * d, h.y, 0), NIGHT.laneLight.r, NIGHT.laneLight.a * b.night, 'magic');
  }
}

// ---------- 素材层（fx_boss_raven_v1 载好了才画）----------
const ravenItem = (id) => (FX_ART.raven?.ready && FX_ART.raven.items[id]) || null;

// night_veil：铺满屏幕的压暗层，透明洞对准主角（px, py：主角在屏幕上的位置）
export function drawVeil(ctx, b, px, py) {
  const img = ravenItem('night_veil');
  if (!img || !b?.night) return false;
  // 素材画布 1024×512，洞在正中；按画面高度铺（宽度跟着比例，左右不够的部分用同样的黑补满）
  const h = VIEW_H * 1.6, w = (img.fw / img.fh) * h, x = px - w / 2, y = py - h / 2;
  ctx.save();
  ctx.globalAlpha = NIGHT.veilAlpha * b.night;
  ctx.drawImage(img, x, y, w, h);
  ctx.fillStyle = '#000';
  if (x > 0) ctx.fillRect(0, 0, x, VIEW_H);
  if (x + w < VIEW_W) ctx.fillRect(x + w, 0, VIEW_W - x - w, VIEW_H);
  if (y > 0) ctx.fillRect(Math.max(0, x), 0, Math.min(VIEW_W, x + w) - Math.max(0, x), y);
  if (y + h < VIEW_H) ctx.fillRect(Math.max(0, x), y + h, Math.min(VIEW_W, x + w) - Math.max(0, x), VIEW_H - y - h);
  ctx.restore();
  return true;
}

// 飘落的黑羽：在镜头范围上方生成，慢慢往下飘、左右摆，寿命到了淡出
function updateDrift(b, g) {
  const D = NIGHT.drift, list = (b.drift ??= []);
  for (let i = list.length - 1; i >= 0; i--) {
    const f = list[i];
    f.t++; f.y += f.vy; f.x += Math.sin(f.t * 0.03 + f.seed) * D.sway;
    if (f.t > D.life) list.splice(i, 1);
  }
  if (!ravenItem('feather_drift') || b.night < 0.5 || list.length >= D.max || g.ticks % D.every) return;
  const r = (a, c) => a + Math.random() * (c - a);
  list.push({ x: (g.camX ?? 0) + r(0, VIEW_W), y: r(-40, VIEW_H * 0.4), vy: r(...D.fall), t: 0, seed: r(0, 6.3), phase: (Math.random() * 8) | 0, flip: Math.random() < 0.5 ? -1 : 1 });
}
// 画在光照之后（夜里还能看见飘落的羽毛反着一点光），屏幕坐标
export function drawDrift(ctx, b, camX) {
  const fb = ravenItem('feather_drift');
  if (!fb || !b?.drift?.length) return false;
  const D = NIGHT.drift;
  for (const f of b.drift) {
    const fr = fb.frames[(Math.floor((f.t * fb.fps) / 60) + f.phase) % fb.frames.length];
    if (!fr) continue;
    const k = D.k / fr.sc, a = Math.min(1, f.t / 30, (D.life - f.t) / 40) * b.night;
    ctx.save();
    ctx.globalAlpha = a * 0.85;
    ctx.translate(f.x - camX, f.y);
    ctx.scale(k * f.flip, k);
    ctx.drawImage(fr, -fr.cx, -fr.cy);
    ctx.restore();
  }
  return true;
}
