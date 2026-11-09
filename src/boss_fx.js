// 首领专属特效：素材和尺寸在 fx_data.js，招式只在对应时刻调用这里。
import { toScreen } from './config.js';
import { bossTex, enemyTex, flipbook } from './fx_art.js';
import { tinted } from './fx_tex.js';
import { fbIndex, tileAlong } from './enemy_fx.js';
import { BOSS_FX, ENEMY_FX } from './fx_data.js';

const raven = BOSS_FX.nightRaven;
const iron = BOSS_FX.ironJaw;
const tex = (id) => bossTex('raven', id);
const FIG = 260; // 人形特效以 260 交付像素的身高绘制
const VEIL_TICKS = 12; // 只在读条成功结束时一闪

// k 是逻辑像素 / 交付像素。用裁边后的锚点和图集比例兼容桌面和手机。
function put(ctx, img, x, y, k, color, alpha = 1, facing = 1, rot = 0, tintMode = 'fill') {
  if (!img) return false;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.scale(facing * k / img.sc, k / img.sc);
  ctx.globalAlpha *= alpha;
  if (color) ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(color ? tinted(img, color, tintMode) : img, -img.cx, -img.cy);
  ctx.restore();
  return true;
}

function frame(entry, t) {
  const fb = flipbook(entry.fb);
  return fb?.frames[fbIndex(fb, t)];
}

// 在 Projectile.draw 的局部坐标下画，调用方已对准箭头、转向。
export function drawRavenArrow(ctx, shot) {
  if (shot.owner?.key !== 'nightRaven') return false;
  const a = raven.arrow, img = tex(a.tex);
  if (!img) return false;
  put(ctx, enemyTex(ENEMY_FX.arrow.trail), ENEMY_FX.arrow.trailAt, 0, a.k, a.trailColor);
  return put(ctx, img, 0, 0, a.k, null);
}

export function drawRavenFeather(ctx, shot) {
  if (shot.owner?.key !== 'nightRaven') return false;
  const e = raven.feather, img = frame(e, shot.age);
  if (!img) return false;
  const angle = Math.atan2(shot.vy || 0, Math.abs(shot.vx));
  put(ctx, tex(e.trail), 0, 0, e.k, e.trailColor, 1, 1, angle);
  return put(ctx, img, 0, 0, e.k, null);
}

export function ravenFeatherTurn(game, shot) {
  if (shot.owner?.key !== 'nightRaven') return;
  const e = raven.burst;
  game.fx.flip(e.fb, shot.x, shot.y, shot.z, {
    size: raven.feather.k * 0.5, color: e.color, facing: shot.facing,
  });
}

// 一次性的浮现和消散用粒子播放。分身与真身共享锚点、尺寸和朝向。
export function ravenBodyFx(game, boss, kind, spot = boss) {
  const e = BOSS_FX[boss.key]?.[kind];
  if (!e) return false;
  const z = boss.z + (kind === 'burst' ? boss.h * 0.5 : 0);
  return !!game.fx.flip(e.fb, spot.x, spot.y, z, {
    size: boss.h / FIG * e.size, color: e.color, facing: boss.facing,
  });
}

export function disperseRavenCopies(game, boss, n) {
  for (const spot of boss.split?.spots ?? []) {
    if (!ravenBodyFx(game, boss, 'burst', spot)) {
      game.fx.emit('soul', spot.x, spot.y, boss.h * 0.5, { color: '#2a1a30', n });
    }
  }
}

// 三个身影使用同一个 split.t，不能按 id 或坐标改变相位。
export function drawRavenBodyFx(ctx, boss, sx, sy, alpha) {
  if (boss.key !== 'nightRaven') return;
  if (boss.split) {
    const e = raven.wisps;
    put(ctx, frame(e, boss.split.t), sx, sy, boss.h / FIG * e.size, e.color, e.alpha * alpha, boss.facing);
  }
  if (boss.act?.name === 'channel' && boss.channel === boss.act.d) {
    const e = raven.gather;
    put(ctx, frame(e, boss.act.t - 1), sx, sy, boss.h / FIG * e.size, e.color, alpha, boss.facing);
  }
  if (boss.act?.name === 'volley') {
    const e = raven.glint, fb = flipbook(e.fb);
    if (!fb || boss.act.d.ravenGlintAt == null) return;
    const duration = Math.ceil(fb.frames.length * 60 / fb.fps);
    const t = boss.act.t - 1 - boss.act.d.ravenGlintAt + Math.floor(duration / 2);
    if (t < 0 || t >= duration) return;
    put(ctx, fb.frames[fbIndex(fb, t)], sx + boss.facing * boss.h * e.x, sy - boss.h * e.z,
      boss.h / FIG * e.size, e.color, alpha, boss.facing);
  }
}

export function drawRavenRain(ctx, art, sx, sy, h, t) {
  if (art !== 'raven') return false;
  const e = raven.rain;
  return put(ctx, frame(e, t), sx, sy - h, e.k, e.color);
}

export function ravenRainImpact(game, hazard) {
  if (hazard.rainArt !== 'raven') return false;
  const e = raven.rain;
  return !!game.fx.flip(e.impact, hazard.x, hazard.y, 0, { size: e.k, color: e.color });
}

// 法阵只借地面队列绘制，没有命中判定。招式被打断时随之移除。
class BossGroundMark {
  constructor(boss, life, radius, pack, entry) {
    this.x = boss.x;
    this.y = boss.y;
    this.boss = boss;
    this.act = boss.act;
    this.life = life;
    this.radius = radius;
    this.pack = pack;
    this.entry = entry;
    this.t = 0;
    this.dead = false;
  }

  update() {
    if (++this.t >= this.life || this.boss.act !== this.act) this.dead = true;
  }

  drawFloor(ctx, camX) {
    if (this.dead || this.boss.act !== this.act) return;
    const [sx, sy] = toScreen(this.x, this.y, 0, camX);
    const e = this.entry, img = bossTex(this.pack, e.tex);
    if (!img) return;
    const fade = Math.max(1, this.life * 0.1);
    const rise = e.rise ? Math.max(1, this.life * e.rise) : fade;
    const alpha = Math.min(1, (this.t + 1) / rise, (this.life - this.t) / fade);
    const k = 2 * this.radius * img.sc / img.fw;
    if (!e.spin) {
      put(ctx, img, sx, sy, k, e.color, alpha * (e.alpha ?? 1)); // 发光印记：染亮色叠加（乘色叠加会暗到看不见，模块测试发现）
      return;
    }
    // 在地面的 2:1 透视里转动，法阵不会竖起来。
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1, 0.5);
    ctx.rotate(this.t * e.spin);
    ctx.scale(1, 2);
    put(ctx, img, 0, 0, k, e.color, alpha);
    ctx.restore();
  }
}

export function ravenSigil(game, boss, radius, life) {
  if (boss.key !== 'nightRaven') return false;
  if (!tex(raven.sigil.tex)) return false;
  game.hazards.push(new BossGroundMark(boss, life, radius, 'raven', raven.sigil));
  return true;
}

export function flashRavenVeil(boss, game) {
  if (boss.key !== 'nightRaven' || !tex(raven.veil.tex)) return false;
  boss.ravenVeilAt = game.ticks;
  return true;
}

export function drawRavenVeil(ctx, boss, camX) {
  if (boss.ravenVeilAt == null) return;
  const e = raven.veil;
  const elapsed = boss.game.ticks - boss.ravenVeilAt;
  if (elapsed < 0 || elapsed >= VEIL_TICKS) return;
  const img = tex(e.tex);
  if (!img) return;
  const p = boss.game.player;
  const [px, py] = toScreen(p.x, p.y, p.z + p.h * 0.5, camX);
  const m = ctx.getTransform();
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const x = Math.max(0, Math.min(w, m.a * px + m.c * py + m.e));
  const y = Math.max(0, Math.min(h, m.b * px + m.d * py + m.f));
  // 以主角为洞中心，扩到覆盖整个画布；留给屏幕层和 UI 正常绘制。
  const dw = 2 * Math.max(x, w - x), dh = 2 * Math.max(y, h - y);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha *= 0.45 * (1 - elapsed / VEIL_TICKS);
  ctx.drawImage(img, x - dw / 2, y - dh / 2, dw, dh);
  ctx.restore();
}

export function hasRavenChannelFx(boss) {
  return boss.key === 'nightRaven' && !!flipbook(raven.gather.fb);
}

export function cueRavenVolley(boss, data, releaseTick) {
  if (boss.key === 'nightRaven') data.ravenGlintAt = releaseTick;
}

// 尸体落地只触发一次；素材缺失时保留 Enemy 的原有死亡表现。
export function updateRavenDeathFx(game, boss) {
  if (boss.key !== 'nightRaven' || boss.state !== 'dying' || boss.z > 0 || boss.ravenDeathStarted) return;
  boss.ravenDeathStarted = true;
  ravenBodyFx(game, boss, 'death');
}

// 铁颚的表现和伤害判定分开。Hazard 只接收素材和渲染参数。
export function ironJawGroundArt(boss, kind, scale = 1, extra = null) {
  if (boss.key !== 'ironJaw') return {};
  const e = iron[kind];
  const options = { color: e.color, size: e.k * scale, ground: e.ground, alpha: e.alpha };
  const layer = extra && iron[extra];
  return {
    art: e.fb, artOptions: options,
    artExtra: layer && { id: layer.fb, options: { color: layer.color, size: layer.k, ground: layer.ground } },
  };
}

export function ironJawStompArt(boss, index) {
  return ironJawGroundArt(boss, 'quake', iron.stompScales[index], index === 2 ? 'wave' : null);
}

export function drawIronJawChain(ctx, owner, x, angle, length) {
  if (owner?.key !== 'ironJaw' || length <= 0) return false;
  const e = iron.chain, img = bossTex('ironjaw', e.tex);
  if (!img) return false;
  ctx.save();
  ctx.globalAlpha *= e.alpha;
  tileAlong(ctx, img, x, 0, angle, length, e.height, 0, e.color);
  ctx.restore();
  return true;
}

export function playIronJawFx(game, boss, kind, x = boss.x, y = boss.y, z = boss.z) {
  if (boss.key !== 'ironJaw') return false;
  const e = iron[kind];
  return !!game.fx.flip(e.fb, x, y, z, { size: e.k, color: e.color, ground: e.ground, facing: boss.facing });
}

export function ironJawCleave(game, boss, up = false) {
  if (boss.key !== 'ironJaw') return false;
  const e = iron.cleave;
  return !!game.fx.flip(e.fb, boss.x + boss.facing * boss.h * e.x, boss.y, boss.z + boss.h * e.z, {
    size: e.k, color: e.color, facing: boss.facing, flipY: up ? -1 : 1,
  });
}

// 拖拽火星和拉人的位移同长，跟着玩家脚底走。
export function startIronJawDrag(game, boss) {
  if (boss.key !== 'ironJaw') return;
  const p = game.player, e = iron.drag;
  game.fx.flip(e.fb, p.x, p.y, 0, { follow: p, size: e.k, color: e.color, life: 12 }); // 素材本身已按地面透视压扁画，不再走 ground（会再压一次）
}

export function hasIronJawCharge(boss) {
  return boss.key === 'ironJaw' && !!flipbook(iron.charge.fb);
}

export function drawIronJawBodyFx(ctx, boss, sx, sy, alpha) {
  if (boss.key !== 'ironJaw') return;
  const act = boss.act;
  if (act?.name === 'charge' && !boss.tele && !act.d.stop && boss.vx) {
    const e = iron.charge;
    put(ctx, frame(e, act.t - 1), sx, sy, e.k, e.color, alpha, boss.facing);
  }
  if (act?.name === 'channel' && boss.channel === act.d) {
    const e = iron.glint, t = act.t - 1, fb = flipbook(e.fb);
    if (!fb || t < 0 || t * fb.fps >= fb.frames.length * 60) return;
    put(ctx, fb.frames[fbIndex(fb, t)], sx + boss.facing * boss.h * e.x, sy - boss.h * e.z,
      e.k, e.color, alpha, boss.facing);
  }
}

export function hasIronJawMark(boss) {
  return boss.key === 'ironJaw' && !!bossTex('ironjaw', iron.mark.tex);
}

export function ironJawMark(game, boss, radius, life) {
  if (!hasIronJawMark(boss)) return false;
  game.hazards.push(new BossGroundMark(boss, life, radius, 'ironjaw', iron.mark));
  return true;
}

export function ironJawChannelArt(boss) {
  if (boss.key !== 'ironJaw') return {};
  return { ...ironJawGroundArt(boss, 'drop'), artOwnerAct: boss.act };
}

export function hasIronJawDrop(boss) {
  return boss.key === 'ironJaw' && !!flipbook(iron.drop.fb);
}
