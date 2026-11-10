// 首领专属特效：素材和尺寸在 fx_data.js，招式只在对应时刻调用这里。
import { toScreen } from './config.js';
import { bossTex, enemyTex, flipbook } from './fx_art.js';
import { tinted } from './fx_tex.js';
import { fbIndex, tileAlong, drawWarn, drawLaneBand } from './enemy_fx.js';
import { trampled, shardReturned } from './boss_identity.js';
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

// 残影只替换表现，缺素材时由调用处保留旧效果。
const after = BOSS_FX.afterimage;
export function afterimageRibbon(boss) {
  return boss.key === 'afterimage' ? bossTex('afterimage', 'rev_ribbon') : null;
}
export function hasAfterimageGather(boss) {
  return boss.key === 'afterimage' && !!flipbook(after.gather.fb);
}
export function playAfterimageFx(game, boss, kind, rot = 0) {
  if (boss.key !== 'afterimage') return false;
  const e = after[kind];
  const fx = game.fx.flip(e.fb, boss.x, boss.y, boss.z + boss.h * (e.z ?? 0), {
    size: boss.h / FIG * e.size, color: boss.B.glow, facing: boss.facing, rot,
  });
  if (kind === 'burst' && fx) {
    boss.afterimageBurst = { cancelled: false };
    fx.cancelToken = boss.afterimageBurst;
  }
  return !!fx;
}
export function drawAfterimageBodyFx(ctx, boss, sx, sy, alpha) {
  if (boss.key !== 'afterimage' || boss.state !== 'attack') return;
  const act = boss.act;
  if (act?.name === 'mirror') {
    const e = after.sigil;
    put(ctx, bossTex('afterimage', e.tex), sx, sy - boss.h * e.z,
      boss.h / FIG * e.size, boss.B.glow, alpha);
  }
  if (act?.name === 'channel' && boss.channel === act.d) {
    const e = after.gather;
    put(ctx, frame(e, act.t - 1), sx, sy, boss.h / FIG * e.size, boss.B.glow, alpha, boss.facing);
  }
}
export function drawAfterimageWave(ctx, shot) {
  if (shot.owner?.key !== 'afterimage') return false;
  const e = after.wave, sc = shot.scale || 1;
  return put(ctx, frame(e, shot.age), e.x * sc, -e.z * sc, e.k * sc,
    shot.color || shot.owner.B.glow, Math.min(1, shot.life / 10));
}
export function afterimageDash(game, boss, a, b) {
  if (boss.key !== 'afterimage') return false;
  const e = after.dash, dx = b.x - a.x, dy = b.y - a.y;
  return !!game.fx.flip(e.fb, (a.x + b.x) / 2, (a.y + b.y) / 2, e.z, {
    size: e.k, color: boss.B.glow, rot: Math.atan2(dy, dx),
    scaleX: Math.hypot(dx, dy) / (e.width * e.k),
  });
}
export function drawAfterimageStreak(ctx, streak, camX) {
  const e = after.route, img = bossTex('afterimage', e.tex);
  const [x0, y0] = toScreen(streak.a.x, streak.a.y, 0, camX);
  const [x1, y1] = toScreen(streak.b.x, streak.b.y, 0, camX);
  ctx.save();
  ctx.globalAlpha *= e.alpha;
  const ang = Math.atan2(y1 - y0, x1 - x0), len = Math.hypot(x1 - x0, y1 - y0);
  if (img) tileAlong(ctx, img, x0, y0, ang, len, e.height, streak.t * e.scroll, streak.color);
  else {
    // 处决有判定，路线不能消失：残影包没载好时借一直载入的敌人路线光带（成品贴图）
    const f = e.fallback, band = enemyTex(ENEMY_FX.lane.tex);
    if (band) {
      ctx.globalAlpha *= f.alpha / e.alpha;
      tileAlong(ctx, band, x0, y0, ang, len, e.height / 33 * 64, streak.t * e.scroll, f.color);
    }
  }
  const mark = after.vertex;
  put(ctx, frame(mark, streak.t), x0, y0, mark.k, streak.color);
  if (streak.last) put(ctx, frame(mark, streak.t), x1, y1, mark.k, streak.color);
  ctx.restore();
}

// 骸骨统领补充包只负责表现，骨刺仍沿用第一版的判定和素材。
const bone = BOSS_FX.boneLord;
export function playBoneFx(game, boss, kind, x = boss.x, y = boss.y) {
  if (boss.key !== 'boneLord') return false;
  const e = bone[kind];
  return !!game.fx.flip(e.fb, x, y, boss.z, {
    size: boss.h / FIG * e.size, color: e.color, facing: boss.facing,
  });
}
export function boneSigil(game, boss, radius, life) {
  if (boss.key !== 'boneLord' || !bossTex('bonev2', bone.sigil.tex)) return false;
  game.hazards.push(new BossGroundMark(boss, life, radius, 'bonev2', bone.sigil));
  return true;
}
export function hasBoneGlow(boss) {
  return boss.key === 'boneLord' && !!flipbook(bone.glow.fb);
}
export function drawBoneBodyFx(ctx, boss, sx, sy, alpha) {
  if (boss.key !== 'boneLord') return;
  const a = boss.act;
  if (a?.name === 'channel' && boss.channel === a.d) {
    const e = bone.glow;
    put(ctx, frame(e, a.t - 1), sx, sy, boss.h / FIG * e.size, e.color, alpha, boss.facing);
  }
  const dragging = a?.name === 'rendChase' && a.t <= a.d.boneDragEnd
    || a?.name === 'charge' && !boss.tele && !a.d.stop && boss.vx;
  if (dragging) {
    const e = bone.drag;
    put(ctx, frame(e, a.t - 1), sx + boss.facing * boss.h * e.x, sy + boss.z,
      boss.h / FIG * e.size, e.color, alpha, boss.facing);
  }
}
function boneTether(ctx, a, b, t) {
  const e = bone.tether, img = bossTex('bonev2', e.tex);
  if (img) tileAlong(ctx, img, a[0], a[1], Math.atan2(b[1] - a[1], b[0] - a[0]),
    Math.hypot(b[0] - a[0], b[1] - a[1]), e.height, t * e.scroll, e.color);
}
export function boneCageFx(game, boss, data, life, radius) {
  if (boss.key !== 'boneLord') return;
  const act = boss.act;
  // 借地面队列绘制；光照系统按 rx 给队列里每一项补光，取骨牢半径（不另加默认的大光）
  game.hazards.push({ x: data.cx, y: data.cy, rx: radius, t: 0, dead: false,
    update() { if (++this.t >= life || boss.act !== act) this.dead = true; },
    drawFloor(ctx, camX) {
      if (this.dead || boss.act !== act) return;
      const e = bone.cage, [x, y] = toScreen(this.x, this.y, 0, camX);
      put(ctx, frame(e, this.t), x, y, radius * 2 / e.width * (1 - (1 - e.shrink) * this.t / life), e.color);
      // 按原七个槽位取邻居，空槽两侧都不接，不能把存活骨刺压成闭环。
      data.boneSlots.forEach((a, i, slots) => {
        const b = slots[(i + 1) % slots.length];
        if (a && b) boneTether(ctx, toScreen(a.x, a.y, 0, camX), toScreen(b.x, b.y, 0, camX), this.t);
      });
    },
  });
}
// 骨片独立留在表现队列；回程目标每帧取胸口，首领移动也能接回。
export function boneShards(game, boss) {
  if (boss.key !== 'boneLord' || !flipbook(bone.shard.fb) || boss.boneShardTick === game.ticks) return;
  boss.boneShardTick = game.ticks;
  const e = bone.shard, count = e.count[0] + game.ticks % (e.count[1] - e.count[0] + 1);
  for (let i = 0; i < count; i++) {
    const angle = (i + 0.5) / count * Math.PI * 2;
    const origin = { x: boss.x, y: boss.y, z: boss.z + boss.h * e.chest };
    const end = { x: origin.x + Math.cos(angle) * e.speed * e.scatter, y: origin.y,
      z: Math.max(0, origin.z + (e.lift + Math.sin(angle) * e.speed) * e.scatter - e.gravity * e.scatter * e.scatter / 2) };
    const pos = (t) => {
      if (t <= e.scatter) return { x: origin.x + Math.cos(angle) * e.speed * t, y: origin.y,
        z: Math.max(0, origin.z + (e.lift + Math.sin(angle) * e.speed) * t - e.gravity * t * t / 2) };
      const u = Math.max(0, Math.min(1, (t - e.scatter - e.pause) / e.back));
      return { x: end.x + (boss.x - end.x) * u, y: end.y + (boss.y - end.y) * u,
        z: end.z + (boss.z + boss.h * e.chest - end.z) * u + Math.sin(u * Math.PI) * e.arc };
    };
    // rx：每枚骨片只带一小团髓光；不写的话光照系统按默认 140 补一盏大光，重击一次地面亮 3～5 团
    game.hazards.push({ ...origin, rx: e.light, t: 0, dead: false,
      update(g) {
        this.t++;
        Object.assign(this, pos(this.t));
        // 落地停留期间被你踩到就碎，回不去（身份机制「拼合的骨」，boss_identity.js）
        if (this.t > e.scatter && this.t <= e.scatter + e.pause && trampled(g, this)) {
          this.dead = true;
          g.fx.chips(this.x, this.y, 6, 1, 5, '#d8cbb4');
          return;
        }
        if (this.t >= e.scatter + e.pause + e.back) { this.dead = true; shardReturned(boss); }
      },
      drawFloor(ctx, camX) {
        if (this.dead) return;
        const at = toScreen(this.x, this.y, this.z, camX);
        if (this.t > e.scatter + e.pause) {
          const tail = pos(Math.max(e.scatter + e.pause, this.t - e.back * e.trail));
          boneTether(ctx, toScreen(tail.x, tail.y, tail.z, camX), at, this.t);
        }
        put(ctx, frame(e, this.t), ...at, boss.h / FIG * e.size, null);
      },
    });
  }
}

// 守护者的火按拉取目标镜像；素材朝左，目标在右时才翻转。
const warden = BOSS_FX.warden;
export const wardenColor = (b) => warden.colors[b.phase];
export function hasWardenGather(b) {
  return b.key === 'warden' && !!flipbook(warden.gather.fb);
}
export function playWardenFx(game, b, kind, x = b.x, y = b.y, length = null) {
  if (b.key !== 'warden') return false;
  const e = warden[kind], k = b.h / FIG * e.size;
  // 横扫原图锚点在宽度的 15%，把画布起点对齐判定起点。
  if (length != null) x += b.facing * length * e.anchorX;
  return !!game.fx.flip(e.fb, x, y, b.z, {
    size: k, color: wardenColor(b), facing: b.facing,
    scaleX: length == null ? 1 : length / (e.width * k),
  });
}
export function updateWardenFlame(b, game) {
  if (b.key !== 'warden' || !b.alive) return;
  b.wardenFlameTime = (b.wardenFlameTime ?? 0) + (b.phase === 2 ? warden.flame.speed : 1);
  b.wardenJump = false;
  if (b.phase !== 2) { b.wardenJumpAt = null; return; }
  if (b.wardenJumpAt == null || game.ticks >= b.wardenJumpAt) {
    b.wardenJump = b.wardenJumpAt != null;
    const [lo, hi] = warden.flame.jumpInterval;
    b.wardenJumpAt = game.ticks + lo + Math.floor(Math.random() * (hi - lo + 1));
  }
}
export function drawWardenBodyFx(ctx, b, sx, sy, alpha) {
  if (b.key !== 'warden' || !b.alive) return false;
  const nearest = b.game.enemies.filter(e => e.owner === b && e.hp > 0 && !e.remove)
    .reduce((best, e) => !best || Math.hypot(e.x - b.x, e.y - b.y) < Math.hypot(best.x - b.x, best.y - b.y) ? e : best, null);
  const dir = nearest ? Math.sign(nearest.x - b.x) || -b.facing : -b.facing;
  const e = warden.flame;
  const drawn = put(ctx, frame(e, b.wardenFlameTime ?? 0), sx, sy, b.h / FIG * e.size,
    wardenColor(b), alpha * e.alpha * (b.wardenJump ? e.jumpAlpha : 1), -dir);
  if (b.state === 'attack' && b.act?.name === 'channel' && b.channel === b.act.d) {
    const g = warden.gather;
    put(ctx, frame(g, b.act.t - 1), sx, sy, b.h / FIG * g.size, wardenColor(b), alpha, b.facing);
  }
  return drawn;
}
export function drawWardenBrazier(ctx, b, sx, sy) {
  const e = warden.brazier;
  put(ctx, frame(e, b.t), sx, sy, e.k, null);
  const f = warden.brazierFlame, dir = Math.sign(b.owner.x - b.x) || b.owner.facing;
  return put(ctx, frame(f, b.t), sx, sy - e.mouth, f.k, wardenColor(b.owner), 1, -dir);
}
export function breakWardenBrazier(game, b) {
  const e = warden.break;
  return !!game.fx.flip(e.fb, b.x, b.y, 0, { size: e.k, facing: b.owner.x > b.x ? -1 : 1 });
}
export function drawWardenLane(ctx, lane, sx, sy, len, alpha) {
  if (lane.warden?.key !== 'warden') return false;
  const e = warden.lane, img = bossTex('wardenv2', e.tex);
  if (!img) return false;
  ctx.save();
  ctx.globalAlpha *= alpha * e.alpha;
  // 只翻水平轴，地面火舌不会因向左铺而上下倒置。
  ctx.translate(sx, sy);
  ctx.scale(lane.facing, 1);
  tileAlong(ctx, img, 0, 0, 0, len, lane.half * e.height, lane.t * e.scroll, wardenColor(lane.warden));
  ctx.restore();
  return true;
}

// ---------------- 首领身份机制的画法（规则在 boss_identity.js）----------------
// 铁颚的刑台：借铁颚包的处刑印记，常驻、偏暗；包没载好时用一直载入的敌人预警圈
export function drawIronJawPlatform(ctx, plat, camX) {
  const [sx, sy] = toScreen(plat.x, plat.y, 0, camX);
  const e = iron.platform, img = bossTex('ironjaw', iron.mark.tex);
  if (img) {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1, plat.ry / plat.rx);
    put(ctx, img, 0, 0, 2 * plat.rx * img.sc / img.fw, e.color, e.alpha * (1 + e.pulse * Math.sin(plat.t * e.speed)));
    ctx.restore();
    return true;
  }
  return drawWarn(ctx, sx, sy, plat.rx, plat.ry, 0, plat.t, false, e.alpha);
}

// 守护者第三阶段的余火：守护者包的火带，包没载好时用敌人通用路线光带
export function drawWardenEmbers(ctx, ember, camX, alpha) {
  const [sx, sy] = toScreen(ember.x0, ember.y, 0, camX);
  const len = Math.abs(ember.x1 - ember.x0);
  const lane = { warden: ember.warden, facing: ember.facing, half: ember.half, t: ember.t };
  if (drawWardenLane(ctx, lane, sx, sy, len, alpha)) return true;
  return drawLaneBand(ctx, sx, sy, ember.facing, len, ember.half, ember.t, '#ff9a3c', alpha);
}
