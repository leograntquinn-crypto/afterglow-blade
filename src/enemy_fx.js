// 敌人特效的画法（fx_enemy_v1，docs/ART_FX_ENEMY_V1.md）：按 fx_data.js 的 ENEMY_FX / ENEMY_TYPE_FX 表画。
// 每个函数画成了返回 true；素材没载好返回 false，调用的地方退回原来代码画的样子（预警是玩法信息，不能不画）。
// 素材是灰度的发光图（add），引擎按状态染色；箭是带颜色的实物（normal）。
import { enemyTex, enemyFb, enemyTypeFb, flipbook } from './fx_art.js';
import { tinted } from './fx_tex.js';
import { ENEMY_FX, ENEMY_TYPE_FX, BOSS_FX } from './fx_data.js';

const FIG = 260; // 素材里的人按身高 260 交付像素画

// 序列帧在第 ticks 帧（60 帧 = 1 秒）该显示哪一张。循环的取余，一次性的停在最后一张
export function fbIndex(fb, ticks) {
  const n = fb.frames.length, i = Math.max(0, Math.floor((ticks * fb.fps) / 60));
  return fb.loop ? i % n : Math.min(n - 1, i);
}

// 画一张（贴图或序列帧的一帧）：锚点放在 (x, y)；kx / ky = 逻辑像素 / 交付像素（负数 = 镜像）；add 叠加发光并染 color
function put(ctx, img, x, y, kx, ky, color, add, rot = 0) {
  if (!img) return;
  const sx = kx / img.sc, sy = ky / img.sc;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.scale(sx, sy);
  if (add) ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(add && color ? tinted(img, color) : img, -img.cx, -img.cy);
  ctx.restore();
}

// ---------- 敌人身上 ----------
// 状态光（敌人身后，锚点对脚底）。key 见 ENEMY_FX.aura；alpha 额外乘的不透明度；color 覆盖表里的颜色（首领用自己的颜色）
export function drawEnemyAura(ctx, e, sx, sy, key, t, alpha = 1, color = null) {
  const A = ENEMY_FX.aura[key], fb = A && enemyFb(A.fb);
  if (!fb) return false;
  const k = (e.h / FIG) * (A.size ?? 1), fr = fb.frames[fbIndex(fb, t + (e.id ?? 0) * 7)];
  ctx.save();
  ctx.globalAlpha *= Math.min(1, A.alpha * alpha);
  for (let i = 0; i < (A.passes ?? 1); i++) put(ctx, fr, sx, sy, k * (e.facing || 1), k, color || A.color, true);
  ctx.restore();
  return true;
}

// 精英的冠光（画在身体前面）
export function drawCrown(ctx, e, sx, sy, t) {
  const C = ENEMY_FX.crown, fb = enemyFb(C.fb);
  if (!fb) return false;
  const k = e.h / FIG;
  ctx.save();
  ctx.globalAlpha *= C.alpha;
  put(ctx, fb.frames[fbIndex(fb, t + (e.id ?? 0) * 5)], sx, sy, k, k, C.color, true);
  ctx.restore();
  return true;
}

// 爆裂：胸口一颗不稳定的炽热核
export function drawVolatile(ctx, e, sx, sy, t) {
  const V = ENEMY_FX.volatile, fb = enemyFb(V.fb);
  if (!fb) return false;
  const k = (e.h * V.size) / 82; // 核在素材里约 82 交付像素宽
  ctx.save();
  ctx.globalAlpha *= V.alpha;
  put(ctx, fb.frames[fbIndex(fb, t)], sx, sy - e.h * V.z, k, k, V.color, true);
  ctx.restore();
  return true;
}

// 坚盾：面朝方向的一面弧形光盾，按已经挡掉的次数选帧（0 = 完整，越往后裂纹越多）
export function drawShieldArc(ctx, e, sx, sy, broken) {
  const S = ENEMY_FX.shield, fb = enemyFb(S.fb);
  if (!fb) return false;
  const k = (e.h * S.size) / 214; // 盾在素材里约 214 交付像素高
  const i = Math.max(0, Math.min(fb.frames.length - 1, broken));
  e.shieldFrame = i; // 测试用
  ctx.save();
  ctx.globalAlpha *= S.alpha;
  put(ctx, fb.frames[i], sx + e.facing * e.w * S.x, sy - e.h * 0.5, k * e.facing, k, S.color, true);
  ctx.restore();
  return true;
}

// 司祭的咒盾：包住整个人的蛋形外壳。fade 0～1（刚加上 / 快散的时候淡）
export function drawWardShell(ctx, e, sx, sy, t, fade) {
  const W = ENEMY_FX.ward, fb = enemyFb(W.fb);
  if (!fb) return false;
  const k = (e.h * W.size) / 266; // 壳在素材里约 266 交付像素高
  ctx.save();
  ctx.globalAlpha *= W.alpha * fade;
  put(ctx, fb.frames[fbIndex(fb, t + (e.id ?? 0) * 3)], sx, sy, k, k, W.color, true);
  ctx.restore();
  return true;
}
// 咒盾破碎（一次性，交给粒子系统播）
export function wardBreakFx(game, e) {
  const W = ENEMY_FX.ward;
  return !!game.fx.flip(W.brk, e.x, e.y, e.z, { color: W.color, size: (e.h * W.size) / 266 });
}
// 迅影瞬移：在 (x, y) 播一次撕裂光缝
export function blinkFx(game, e, x, y) {
  return !!game.fx.flip(ENEMY_FX.blink.fb, x, y, 0, { color: ENEMY_FX.blink.color, size: e.h / FIG });
}

// ---------- 地面 ----------
// 地面预警圈。u = 进度 0～1；ph = 环的播放相位（越临近爆发走得越快，Hazard.update 里累加）；fake = 佯攻露出破绽
export function drawWarn(ctx, sx, sy, rx, ry, u, ph, fake, alpha) {
  const W = ENEMY_FX.warn, ring = enemyFb(fake ? W.fake : W.ring), fill = enemyTex(W.fill);
  if (!ring || !fill) return false;
  ctx.save();
  // 内部填充光：从中心往外放大
  if (u > 0.02) {
    ctx.globalAlpha = (0.25 + 0.5 * u) * (fake ? W.fakeFill : 1);
    put(ctx, fill, sx, sy, (rx * u * 1.05) / W.fillR[0], (ry * u * 1.05) / W.fillR[1], fake ? W.fakeColor : W.fillColor, true);
  }
  ctx.globalAlpha = alpha;
  // 假圈是断开的几段、本身很淡：叠画加亮（还是看得出「不完整」）
  for (let i = 0; i < (fake ? W.fakePasses : 1); i++) put(ctx, ring.frames[fbIndex(ring, ph)], sx, sy, (rx * 1.04) / W.ringR[0], (ry * 1.04) / W.ringR[1], fake ? W.fakeColor : W.color, true);
  ctx.restore();
  return true;
}
// 爆发瞬间的地面闪光（爆发后第 dt 帧）
export function drawWarnFlash(ctx, sx, sy, rx, ry, dt, color) {
  const W = ENEMY_FX.warn, fb = enemyFb(W.flash);
  if (!fb) return false;
  const n = Math.floor((dt * fb.fps) / 60);
  if (n >= fb.frames.length) return true;
  put(ctx, fb.frames[n], sx, sy, (rx * 1.15) / W.ringR[0], (ry * 1.15) / W.ringR[1], color, true);
  return true;
}
// 从天而降的火球（h = 离地高度，屏幕像素）
export function drawMeteor(ctx, sx, sy, h, t, color) {
  const M = ENEMY_FX.meteor, fb = enemyFb(M.fb);
  if (!fb) return false;
  put(ctx, fb.frames[fbIndex(fb, t)], sx, sy - h, M.k, M.k, color, true);
  return true;
}

// 沿一条线平铺一张可平铺的贴图并往前滚动：从 (x0, y0) 往 ang 方向铺 len 长；th = 贴图画多高（逻辑像素）；off = 滚动量
export function tileAlong(ctx, img, x0, y0, ang, len, th, off, color) {
  const tw = (img.fw / img.fh) * th; // 平铺的贴图不裁边：整张的宽高比
  const src = tinted(img, color);
  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.rect(0, -th, len, th * 2);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  for (let x = (off % tw) - tw; x < len; x += tw) ctx.drawImage(src, x, -th / 2, tw + 0.5, th);
  ctx.restore();
}

// 冲锋 / 齐射路线的地面光带：从 sx 往 facing 方向铺 len
export function drawLaneBand(ctx, sx, sy, facing, len, half, t, color, alpha) {
  const L = ENEMY_FX.lane, img = enemyTex(L.tex);
  if (!img) return false;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha * L.alpha);
  // 光带在素材里占 64 高里的约 33：画的高度按可见部分换算
  tileAlong(ctx, img, sx, sy, facing > 0 ? 0 : Math.PI, len, ((half * L.h) / 33) * 64, t * L.scroll, color);
  ctx.restore();
  return true;
}

// ---------- 弓手 ----------
// 瞄准线：从 (x0, y0) 到 (x1, y1)，u = 预警进度
export function drawAimLine(ctx, x0, y0, x1, y1, u, t) {
  const A = ENEMY_FX.aim, img = enemyTex(A.tex), mark = enemyTex(A.mark);
  if (!img || !mark) return false;
  const len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0);
  ctx.save();
  ctx.globalAlpha = 0.35 + 0.65 * u;
  tileAlong(ctx, img, x0, y0, ang, len, 32 * A.k * (0.8 + 0.4 * u), t * A.scroll, A.color);
  const mk = A.markK * (0.8 + 0.3 * u);
  put(ctx, mark, x1, y1, mk, mk, A.color, true, t * 0.03);
  ctx.restore();
  return true;
}
// 背后来袭：主角背后一个闪动的尖角箭头，dir = 敌人在哪边
export function drawThreatBack(ctx, x, y, dir, alpha) {
  const T = ENEMY_FX.threatBack, img = enemyTex(T.tex);
  if (!img) return false;
  ctx.save();
  ctx.globalAlpha = alpha;
  put(ctx, img, x, y, T.k * dir, T.k, T.color, true);
  ctx.restore();
  return true;
}
// 箭：已经平移到箭头尖、按朝向镜像、按飞行角度转好（combat.js Projectile.draw）
export function drawArrow(ctx) {
  const A = ENEMY_FX.arrow, img = enemyTex(A.tex), trail = enemyTex(A.trail);
  if (!img || !trail) return false;
  put(ctx, trail, A.trailAt, 0, A.k, A.k, A.trailColor, true);
  put(ctx, img, 0, 0, A.k, A.k, null, false);
  return true;
}
// 箭命中 / 被挡掉：箭杆断成两截
export function arrowBreakFx(game, x, y, z, facing) {
  const A = ENEMY_FX.arrow;
  return !!game.fx.flip(A.brk, x, y, z, { color: A.brkColor, size: A.brkK, facing });
}

// ---------- 第 2 批：各敌人自己的预警 / 出招 / 命中 / 死亡（fx_enemy_v1_types，按关卡里有的敌人载入）----------
// 一次性的交给粒子系统播（跟着敌人走的用 follow）；跟着状态走的（屠夫烧红的斧刃、烬翼发亮的裂纹）在 Enemy.draw 里每帧画（drawTypeTele），
// 这样佯攻露出破绽的那一刻能换成琥珀色、被打断马上消失。返回画没画（素材没到 / 这种敌人没有这一项 → false，调用的地方再决定用不用通用的）
export const typeFxEntry = (e, kind) => (e.isBoss
  ? kind === 'death' && BOSS_FX[e.key]?.groundDeath
  : ENEMY_TYPE_FX[e.look?.rig]?.[kind]) || null;
const typeFlipbook = (e, id) => e.isBoss ? flipbook(id) : enemyTypeFb(e.look.rig, id);
export const hasTypeFx = (e, kind) => { const E = typeFxEntry(e, kind); return !!(E?.fb && typeFlipbook(e, E.fb)); };
// o.at = [x, z]：放在别的位置（命中放在打中的那一点）；o.dir：朝向（命中按打过来的方向）
export function typeFx(game, e, kind, o = {}) {
  const E = typeFxEntry(e, kind);
  if (!E?.fb || E.attached || !typeFlipbook(e, E.fb)) return false;
  const color = (o.feint && E.feintColor) || (e.key === 'warden' ? BOSS_FX.warden.colors[e.phase] : E.color) || '#ffffff';
  const ox = e.h * (E.x ?? 0), oz = e.h * (E.z ?? 0), facing = E.towardHero ? (game.player.x > e.x ? -1 : 1) : o.dir ?? e.facing;
  const [x, z] = o.at ?? [e.x + facing * ox, e.z + oz];
  return !!game.fx.flip(E.fb, x, e.y, z, {
    color, size: (e.h / FIG) * (E.size ?? 1), facing, hold: E.hold, holdFade: !!E.hold,
    follow: E.follow ? e : null, ox, oz, life: o.life,
  });
}
// 跟着状态走的预警（屠夫 brute_heat、烬翼 ember_crack）：出招预警期间每帧画，佯攻露出破绽后换 feintColor
export function drawTypeTele(ctx, e, sx, sy, t, feint) {
  const E = typeFxEntry(e, 'tele');
  if (!E?.attached || e.state !== 'windup') return false;
  const fb = enemyTypeFb(e.look.rig, E.fb);
  if (!fb) return false;
  const k = (e.h / FIG) * (E.size ?? 1);
  ctx.save();
  ctx.globalAlpha *= Math.min(1, e.st / 6); // 预警开始的头几帧淡入
  put(ctx, fb.frames[fbIndex(fb, e.st)], sx + e.facing * e.h * (E.x ?? 0), sy - e.h * (E.z ?? 0), k * e.facing, k, feint && E.feintColor ? E.feintColor : E.color, true);
  ctx.restore();
  e.teleColor = feint && E.feintColor ? E.feintColor : E.color; // 测试用
  return true;
}
// 烬翼俯冲的火星拖尾（ember_trail，右端最亮、往后拉长）：沿屏幕上的俯冲方向转过去，假冲用琥珀色
export function drawEmberTrail(ctx, e, sx, sy, fake) {
  const W = ENEMY_FX.emberTrail, img = enemyTex(W.tex), d = e.dive;
  if (!img || !d) return false;
  const ang = Math.atan2(d.vy - d.vz, d.vx); // 屏幕上 y = 纵深 - 高度
  const k = (e.h * W.len) / 256;
  ctx.save();
  ctx.globalAlpha *= W.alpha;
  put(ctx, img, sx, sy - e.h * 0.5, k, k * W.thick, fake ? W.fakeColor : W.color, true, ang);
  ctx.restore();
  return true;
}

// ---------- 司祭的陷阱符（加在「地面」一节的意思，放在这里是因为它用第 1 批的 trap_draw / trap_rune）----------
// t = 陷阱放下后第几帧；armed = 布好了没有；fade = 快消失时淡出
export function drawTrapRune(ctx, sx, sy, rx, t, armed, fade, color) {
  const R = ENEMY_FX.trap, draw = enemyFb(R.draw), rune = enemyFb(R.rune);
  if (!draw || !rune) return false;
  const k = (rx * R.size) / 215; // 符阵在素材里约 215 交付像素宽
  const drawLen = Math.ceil((draw.frames.length * 60) / draw.fps); // trap_draw 播完要多少帧
  const drawing = t < drawLen, fr = drawing ? draw.frames[fbIndex(draw, t)] : rune.frames[fbIndex(rune, t - drawLen)];
  drawTrapRune.last = drawing ? 'trap_draw' : 'trap_rune'; // 测试用
  ctx.save();
  ctx.globalAlpha = fade * R.alpha * (armed ? 0.8 + 0.2 * Math.sin(t * 0.25) : 0.6);
  for (let i = 0; i < (R.passes ?? 1); i++) put(ctx, fr, sx, sy, k, k, color, true);
  ctx.restore();
  return true;
}
