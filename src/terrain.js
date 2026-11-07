// 关卡地形（第 12 项）：窄墓道、立柱、绞索钩、祭坛火墙、深渊裂口。每关用哪些见 stage_rules.js。
//
// 画面全部用现成的素材（场景包的碎石 / 骨堆 / 立柱 / 锁链钩、第 4 关首领包里的魂火序列帧、光照包、第 5 关的深渊远景），
// 不加代码画的形状。地形的布局按房间坐标生成一次、记在房间上，回到同一间房时不变。
import { world, DEPTH, GROUND_TOP, VIEW_W, clamp, toScreen } from './config.js';
import { envImg, ENV_PX } from './scenery.js';
import { flipbook, lightTex } from './fx_art.js';
import { tinted } from './fx_tex.js';
import { sfx } from './audio.js';
import { STAGE_RULES, TERRAIN } from './stage_rules.js';

// 可复现的随机数（同一间房每次布局一样）
function seeded(s) {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 这间房要哪些地形（没有返回 null）
export function terrainSpec(stage, room) {
  const R = STAGE_RULES[stage?.id]?.rooms;
  if (!R || !room || room.type === 'treasure' || room.type === 'rest' || room.type === 'training') return null;
  if (room.type === 'boss') return R.boss ?? null;
  return R[room.idx] ?? R.all ?? null;
}

// 门口附近不放东西：东西门两边 150、南北门中间 ±130
function freeX(room, x) {
  if (x < 160 || x > room.w - 160) return false;
  if ((room.doors?.n || room.doors?.s) && Math.abs(x - room.w / 2) < 130) return false;
  return true;
}

function layout(stage, room) {
  const spec = terrainSpec(stage, room);
  if (!spec) return null;
  const w = room.w, R = seeded((room.x * 7349 + room.y * 1931 + stage.lv * 97) | 0), L = { band: null, pillars: [], hooks: [], flames: [], gaps: [] };
  // 在 [a, b] 里均匀摆 n 个、避开门口和已经用掉的位置
  const used = [];
  const spots = (n, a, b, gapMin = 140) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 40; k++) {
        const x = a + ((i + 0.2 + R() * 0.6) * (b - a)) / n + (k ? (R() - 0.5) * 160 : 0);
        if (!freeX(room, x) || used.some((u) => Math.abs(u - x) < gapMin)) continue;
        used.push(x);
        out.push(x);
        break;
      }
    }
    return out;
  };
  if (spec.gaps) {
    const G = TERRAIN.gap;
    for (const x of spots(spec.gaps, w * 0.3, w * 0.78, 260)) L.gaps.push({ x0: x - G.w / 2, x1: x + G.w / 2, bridge: G.bridge });
  }
  if (spec.narrow) {
    const open = room.doors?.n || room.doors?.s ? [[w / 2 - TERRAIN.narrow.openHalf, w / 2 + TERRAIN.narrow.openHalf]] : [];
    L.band = { y0: spec.narrow[0], y1: spec.narrow[1], open };
  }
  if (spec.pillars) {
    const ys = [44, 126, 84];
    spots(spec.pillars, 220, w - 220).forEach((x, i) => L.pillars.push({ x, y: ys[i % ys.length] + (R() - 0.5) * 16, flip: R() < 0.5 }));
  }
  if (spec.hooks) {
    spots(spec.hooks, 240, w - 240).forEach((x, i) => L.hooks.push({ x, y: 40 + R() * 90, seed: i }));
  }
  if (spec.flames) {
    const xs = spots(spec.flames, 280, w - 280, 300);
    xs.forEach((x, i) => L.flames.push({ x, offset: Math.round(((TERRAIN.flame.dormant + TERRAIN.flame.warn + TERRAIN.flame.burn) * i) / Math.max(1, xs.length)) }));
  }
  return L;
}

// 立柱素材原本是前景的暗色剪影（几乎全黑），放进场地里当障碍物要看得清石头的层次：提亮一次缓存（之后照样吃光照）
const LIT = new WeakMap();
function litPillar(im) {
  if (!im) return null;
  let c = LIT.get(im);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = im.width; c.height = im.height;
  const x = c.getContext('2d');
  x.drawImage(im, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height), a = d.data;
  for (let i = 0; i < a.length; i += 4) for (let k = 0; k < 3; k++) a[i + k] = Math.min(255, a[i + k] * 3.2 + 10);
  x.putImageData(d, 0, 0);
  LIT.set(im, c);
  return c;
}

export class Terrain {
  constructor(game, stage, room) {
    room.terrain ??= layout(stage, room) ?? { none: true };
    const L = room.terrain;
    this.g = game;
    this.room = room;
    this.band = L.band ?? null;
    this.pillars = L.pillars ?? [];
    this.gaps = L.gaps ?? [];
    this.hooks = (L.hooks ?? []).map((h) => ({ ...h, st: 'idle', t: 0, len: TERRAIN.hook.idle[0] + ((h.seed * 61 + room.x * 17) % (TERRAIN.hook.idle[1] - TERRAIN.hook.idle[0])), caught: null }));
    this.flames = (L.flames ?? []).map((f) => ({ ...f, burnAt: new Map() }));
    this.t = 0;
    this.stats = { falls: 0, foeFalls: 0, hooked: 0, foeHooked: 0, burned: 0, shotsBlocked: 0 };
    world.band = this.band;
    // 先把要用的素材载起来（第一次用到时才开始载，会晚一两帧出现）
    const ids = [];
    if (this.band) ids.push('rubble', 'bones', 'skull_heap', 'rubble_heap');
    if (this.pillars.length) ids.push('pillar_left', 'pillar_right');
    if (this.hooks.length) ids.push('chain_hook', 'chain_01');
    if (this.gaps.length) ids.push('crack_01', 'crack_02');
    for (const id of ids) envImg(id);
  }
  get empty() { return !this.band && !this.pillars.length && !this.gaps.length && !this.hooks.length && !this.flames.length; }

  // ---------- 查询 ----------
  inGap(x, y) {
    for (const G of this.gaps) if (x > G.x0 && x < G.x1 && (y < G.bridge[0] || y > G.bridge[1])) return G;
    return null;
  }
  // 火墙的状态：'off' / 'warn' / 'burn'
  flameState(f) {
    const F = TERRAIN.flame, T = F.dormant + F.warn + F.burn, u = (this.t + f.offset) % T;
    return u < F.dormant ? 'off' : u < F.dormant + F.warn ? 'warn' : 'burn';
  }
  // 从 x0 走到 x1 会不会穿过一道正在预警 / 燃烧的火墙（敌人不往火里走）
  flameBetween(x0, x1) {
    for (const f of this.flames) if (this.flameState(f) !== 'off' && (f.x - x0) * (f.x - x1) < 0) return f;
    return null;
  }
  // 一条射线（弓手的箭路）有没有被立柱挡住
  lineBlocked(x0, y0, x1, y1) {
    const P = TERRAIN.pillar;
    for (const p of this.pillars) {
      if ((p.x - x0) * (p.x - x1) > 0) continue;
      const u = (p.x - x0) / ((x1 - x0) || 1), ly = y0 + (y1 - y0) * u;
      if (Math.abs(ly - p.y) < P.ry + 12) return true;
    }
    return false;
  }
  // 飞行物这一帧从 px 飞到 x：碰到立柱就挡住
  blocksShot(pr, px) {
    const P = TERRAIN.pillar;
    if (pr.z > P.shotZ) return null;
    for (const p of this.pillars) {
      if (Math.abs(pr.y - p.y) > P.ry + (pr.hit?.box?.d ?? 24) / 2) continue;
      if (Math.max(px, pr.x) < p.x - P.rx || Math.min(px, pr.x) > p.x + P.rx) continue;
      return p;
    }
    return null;
  }
  // 敌人选移动目标时用：不往裂口、火墙那边走
  steerX(e, tx) {
    const f = this.flameBetween(e.x, tx);
    if (f) tx = f.x + Math.sign(e.x - f.x) * (TERRAIN.flame.half + 30);
    for (const G of this.gaps) {
      if (e.y >= G.bridge[0] && e.y <= G.bridge[1]) continue; // 在桥的纵深上可以过
      if (e.x <= G.x0 && tx > G.x0 - 10) tx = G.x0 - 14;
      else if (e.x >= G.x1 && tx < G.x1 + 10) tx = G.x1 + 14;
    }
    return tx;
  }
  // 刷怪点：在纵深带里、不在裂口和立柱上
  spawnY(x, y) {
    const [lo, hi] = this.band ? [this.band.y0 + 8, this.band.y1 - 8] : [20, DEPTH - 20];
    y = clamp(y, lo, hi);
    if (this.inGap(x, y)) y = (TERRAIN.gap.bridge[0] + TERRAIN.gap.bridge[1]) / 2;
    return y;
  }
  spawnX(x) {
    for (const G of this.gaps) if (x > G.x0 - 20 && x < G.x1 + 20) x = x < (G.x0 + G.x1) / 2 ? G.x0 - 30 : G.x1 + 30;
    return x;
  }

  // ---------- 每帧：限制位置（立柱挡路、裂口掉落、火墙） ----------
  // a：主角或敌人；px / py：这一帧移动前的位置
  constrain(a, px, py) {
    const g = this.g, isP = a === g.player;
    if (!a.alive && !isP) return;
    // 立柱：脚下的椭圆走不进去（往外推）
    if (a.z < 60) {
      const P = TERRAIN.pillar;
      for (const p of this.pillars) {
        const dx = (a.x - p.x) / P.rx, dy = (a.y - p.y) / P.ry, d = Math.hypot(dx, dy);
        if (d < 1) {
          if (d < 0.01) { a.x = p.x + (Math.sign(px - p.x) || 1) * P.rx; continue; } // 正好在中心：往来的方向推出去
          a.x = p.x + (dx / d) * P.rx;
          a.y = p.y + (dy / d) * P.ry;
        }
      }
    }
    if (!this.gaps.length) return;
    if (a.isBoss) { // 首领不会掉下去：推回边上
      const G = this.inGap(a.x, a.y);
      if (G) a.x = px < (G.x0 + G.x1) / 2 ? G.x0 - 2 : G.x1 + 2;
      return;
    }
    const G = this.inGap(a.x, a.y);
    if (!G) return;
    // 自己走到边上会停住（像站在悬崖边），被打飞、闪避冲过去、跳起来落在裂口里才会掉下去
    if (isP ? ['idle', 'run'].includes(a.state) : a.state === 'idle' || a.state === 'windup') {
      if (!this.inGap(px, a.y)) a.x = px;
      else if (!this.inGap(a.x, py)) a.y = py;
      if (!this.inGap(a.x, a.y)) return;
    }
    if (a.z > 0) return; // 还在空中
    this.fall(a, G, px);
  }

  fall(a, G, px) {
    const g = this.g, isP = a === g.player, side = px < (G.x0 + G.x1) / 2 ? G.x0 - 26 : G.x1 + 26;
    g.fx.dust(a.x, a.y, 14, 2);
    g.fx.label(a.x, a.y, 40, '坠 入 深 渊', '#b49aff', 22);
    sfx('heavy');
    if (isP) {
      this.stats.falls++;
      const loss = Math.round(a.maxHp * TERRAIN.gap.fall);
      a.hp = Math.max(1, a.hp - loss);
      a.dmgTaken = (a.dmgTaken ?? 0) + loss;
      a.x = clamp(side, 40, world.w - 40);
      a.vx = a.vy = 0;
      a.setState('hurt');
      a.hurtT = 30;
      a.invuln = Math.max(a.invuln ?? 0, 70);
      g.fx.flash('#3a2a5a', 0.25);
      g.teachOnce?.('gapFall', '掉进深渊裂口：损失一截生命、回到边上。走窄桥，或者助跑跳过去 —— 也可以把敌人打下去', '#b49aff');
      return;
    }
    this.stats.foeFalls++;
    if (a.elite) {
      a.hp = Math.max(1, a.hp - Math.round(a.maxHp * TERRAIN.gap.eliteFall));
      a.x = clamp(side, 40, world.w - 40);
      a.vx = 0;
      return;
    }
    a.hp = 0;
    a.setState('dying');
    a.vz = 0;
    a.fell = true;
    g.onKill(a);
    g.addStyle?.(60, 'fall');
  }

  // ---------- 每帧：钩子、火墙 ----------
  update() {
    const g = this.g;
    this.t++;
    const H = TERRAIN.hook;
    for (const h of this.hooks) {
      h.t++;
      if (h.st === 'idle' && h.t >= h.len) {
        h.st = 'warn'; h.t = 0;
        g.fx.gwarn(h.x, h.y, '#ff4636', 70, 22, H.warn);
        sfx('dash');
      } else if (h.st === 'warn' && h.t >= H.warn) {
        h.st = 'drop'; h.t = 0;
      } else if (h.st === 'drop' && h.t >= H.drop) {
        h.st = 'hold'; h.t = 0;
        h.caught = this.catchUnder(h);
        if (!h.caught) { h.st = 'up'; }
      } else if (h.st === 'hold') {
        const c = h.caught;
        if (c && (c.alive || c === g.player)) { c.x = h.x; c.y = h.y; c.z = Math.max(c.z, 34); c.vz = 0; c.vx = 0; }
        if (h.t >= H.hold || (c && c !== g.player && !c.alive)) { h.st = 'up'; h.t = 0; h.caught = null; }
      } else if (h.st === 'up' && h.t >= H.up) {
        h.st = 'idle'; h.t = 0;
        h.len = H.idle[0] + Math.floor(Math.random() * (H.idle[1] - H.idle[0]));
      }
    }
    // 裂口里不断往上飘的光点（看得出那里是空的）
    if (this.t % 7 === 0) for (const G of this.gaps) {
      const y = Math.random() < 0.5 ? Math.random() * G.bridge[0] : G.bridge[1] + Math.random() * (DEPTH - G.bridge[1]);
      g.fx.emit('aura', G.x0 + Math.random() * (G.x1 - G.x0), y, 0, { color: '#8a6aff', n: 1 });
    }
    // 火墙：燃烧时烧到站在里面、跳得不够高的人
    const F = TERRAIN.flame;
    for (const f of this.flames) {
      const st = this.flameState(f);
      if (st === 'warn' && this.t % 6 === 0) for (let i = 0; i < 3; i++) g.fx.spark(f.x, 10 + Math.random() * (DEPTH - 20), 4, Math.random() < 0.5 ? -1 : 1, 1, '#ff8a3a');
      if (st !== 'burn') { f.burnAt.clear(); continue; }
      for (const a of [g.player, ...g.enemies]) {
        if (!a || (a !== g.player && (!a.alive || a.team === 'prop' || a.isBoss))) continue;
        if (Math.abs(a.x - f.x) > F.half || a.z > F.height) continue;
        if (g.frame - (f.burnAt.get(a) ?? -999) < F.every) continue;
        f.burnAt.set(a, g.frame);
        const dir = Math.sign(a.x - f.x) || 1;
        if (a === g.player) {
          this.stats.burned++;
          g.applyHit({ team: 'enemy', x: f.x, y: a.y, dmgMul: this.dmgMul(), terrain: true }, a, F.hit, dir);
          g.teachOnce?.('flames', '祭坛火墙正在燃烧：等它熄灭再过，或者在它烧起来之前冲过去；跳得够高也能越过', '#ff8a3a');
        } else g.applyHit({ team: 'player', x: f.x, y: a.y, styleTag: 'terrain' }, a, F.foeHit, dir);
      }
    }
  }
  // 地形伤害按关卡等级换算（和同等级敌人的倍率一样，难度的伤害倍率照常乘）
  dmgMul() {
    const g = this.g, lv = g.stage?.lv ?? 1;
    return (1 + (lv - 1) * 0.2) * (g.D?.dmg ?? 1);
  }
  catchUnder(h) {
    const g = this.g, H = TERRAIN.hook, p = g.player;
    const under = (a) => Math.abs(a.x - h.x) < H.catchX && Math.abs(a.y - h.y) < H.catchY && a.z < H.catchZ;
    if (p && p.state !== 'dead' && under(p) && !(p.invuln > 0)) {
      const ok = g.applyHit({ team: 'enemy', x: h.x, y: h.y, dmgMul: this.dmgMul(), terrain: true }, p, H.hit, 1);
      if (ok) {
        this.stats.hooked++;
        g.teachOnce?.('hooks', '被绞索钩住了！钩子落下前地上有红圈 —— 别站在下面，把敌人引过去', '#ff6a5a');
        return p;
      }
      return null;
    }
    for (const e of g.enemies) {
      if (!e.alive || e.team === 'prop' || e.isBoss || !under(e)) continue;
      this.stats.foeHooked++;
      e.setState('hurt');
      e.hitstun = H.foeStun;
      g.fx.label(e.x, e.y, e.h + 40, '钩 住 !', '#ffb347', 20);
      g.addStyle?.(30, 'hook');
      sfx('hitMetal');
      return e;
    }
    return null;
  }

  // ---------- 光 ----------
  lights(post, at) {
    for (const f of this.flames) {
      const st = this.flameState(f);
      if (st === 'off') continue;
      for (const y of [30, 85, 140]) post.addLight(...at(f.x, y, 50), st === 'burn' ? 190 : 90, st === 'burn' ? 0.85 : 0.45, 'flame');
    }
    if (this.gaps.length) for (const G of this.gaps) post.addLight(...at((G.x0 + G.x1) / 2, 150, 0), 150, 0.35, 'magic');
  }

  // ---------- 画 ----------
  // 地面一层（在人物下面）：裂口、窄墓道两边的碎石
  drawGround(ctx, camX, t) {
    for (const G of this.gaps) this.drawGap(ctx, camX, G, t);
    if (this.band) this.drawBandEdges(ctx, camX);
  }
  drawGap(ctx, camX, G, t) {
    const x0 = G.x0 - camX, x1 = G.x1 - camX;
    if (x1 < -40 || x0 > VIEW_W + 40) return;
    const top = GROUND_TOP - 6, bot = GROUND_TOP + DEPTH + 40, b0 = GROUND_TOP + G.bridge[0], b1 = GROUND_TOP + G.bridge[1];
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, top, x1 - x0, b0 - top);
    ctx.rect(x0, b1, x1 - x0, bot - b1);
    ctx.clip();
    // 裂口本身：没有地面，底下是黑的（这是「没有东西」，不是画出来的效果）
    ctx.fillStyle = '#040208';
    ctx.fillRect(x0, top, x1 - x0, bot - top);
    // 越往里越黑：光照包的暗雾叠很多层，中间几乎全黑，边上透一点远景
    const fog = lightTex('seal_fog');
    if (fog) {
      const img = tinted(fog, '#040208'), cw = x1 - x0;
      for (let i = 0; i < 3; i++) ctx.drawImage(img, x0 - cw * 0.15 + (i % 2) * 6, top + i * 70 - 40, cw * 1.3, 200); // 底下已经是黑的，暗雾只负责边缘柔和
    }
    ctx.restore();
    // 裂口的边沿：地裂贴花沿着两边竖着铺
    const crack = envImg('crack_02') ?? envImg('crack_01');
    if (crack) for (const [x, fl] of [[x0, 1], [x1, -1]]) {
      for (const [ya, yb] of [[0, G.bridge[0]], [G.bridge[1], DEPTH + 30]]) {
        if (yb - ya < 10) continue;
        ctx.save();
        ctx.translate(x, GROUND_TOP + (ya + yb) / 2);
        ctx.rotate(Math.PI / 2);
        ctx.scale((yb - ya + 30) / crack.width, (fl * 30) / crack.height);
        ctx.drawImage(crack, -crack.width / 2, -crack.height / 2);
        ctx.restore();
      }
    }
    // 桥的两边
    const crack1 = envImg('crack_01');
    if (crack1) for (const y of [G.bridge[0], G.bridge[1]]) ctx.drawImage(crack1, x0 - 10, GROUND_TOP + y - 12, x1 - x0 + 20, 26);
  }
  drawBandEdges(ctx, camX) {
    const b = this.band, rub = envImg('rubble'), bones = envImg('bones');
    const w = world.w;
    for (let x = 60; x < w; x += 170) {
      if (b.open.some(([a, c]) => x > a - 60 && x < c + 60)) continue;
      const sx = x - camX;
      if (sx < -200 || sx > VIEW_W + 200) continue;
      const im = (x / 170) % 2 ? rub : bones;
      if (!im) continue;
      const s = ENV_PX * 0.7;
      ctx.globalAlpha = 0.95;
      ctx.drawImage(im, sx - (im.width * s) / 2, GROUND_TOP + b.y1 + 18 - (im.height * s) / 2, im.width * s, im.height * s);
      ctx.globalAlpha = 1;
    }
  }

  // 和人物一起按纵深排序的东西：立柱、钩子、远侧的骨堆、燃烧的火墙
  sortables(camX, t) {
    const out = [], g = this.g, p = g.player;
    const pil = [litPillar(envImg('pillar_left')), litPillar(envImg('pillar_right'))];
    for (const P of this.pillars) {
      const im = pil[P.flip ? 1 : 0];
      if (!im) continue;
      out.push({ y: P.y, draw: (ctx) => {
        const s = ENV_PX * TERRAIN.pillar.scale, w = im.width * s, h = im.height * s, sx = P.x - camX, sy = GROUND_TOP + P.y;
        // 主角走到立柱后面：立柱变淡，看得到自己
        const behind = p && p.y < P.y && Math.abs(p.x - P.x) < w * 0.45;
        ctx.save();
        ctx.globalAlpha = behind ? 0.45 : 1;
        ctx.drawImage(im, sx - w / 2, sy - h + 10, w, h);
        ctx.restore();
      } });
    }
    for (const h of this.hooks) out.push({ y: h.y, draw: (ctx) => this.drawHook(ctx, camX, h, t) });
    if (this.band) {
      const heap = envImg('skull_heap'), rheap = envImg('rubble_heap'), b = this.band;
      for (let x = 120, i = 0; x < world.w; x += 260, i++) {
        if (b.open.some(([a, c]) => x > a - 120 && x < c + 120)) continue;
        const im = i % 2 ? heap : rheap;
        if (!im) continue;
        out.push({ y: b.y0 - 20, draw: (ctx) => {
          const s = ENV_PX * 0.62, sx = x - camX;
          if (sx < -300 || sx > VIEW_W + 300) return;
          ctx.drawImage(im, sx - (im.width * s) / 2, GROUND_TOP + b.y0 - 6 - im.height * s, im.width * s, im.height * s);
        } });
      }
    }
    const fb = flipbook('soul_fire');
    for (const f of this.flames) {
      const st = this.flameState(f);
      if (st === 'off' || !fb) continue;
      const n = fb.frames.length;
      for (let i = 0; i < 6; i++) {
        const y = 8 + i * ((DEPTH - 16) / 5);
        out.push({ y, draw: (ctx) => {
          const fr = fb.frames[(Math.floor(t / (60 / fb.fps)) + i * 3) % n];
          if (!fr) return;
          const k = (st === 'burn' ? 0.46 : 0.18 + 0.06 * Math.sin(t * 0.3 + i)) / (fr.sc ?? fb.sc), [sx, sy] = toScreen(f.x, y, 0, camX);
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = st === 'burn' ? 0.95 : 0.7;
          ctx.drawImage(tinted(fr, '#ff7a2e'), sx - fr.cx * k, sy - fr.cy * k, fr.width * k, fr.height * k);
          ctx.restore();
        } });
      }
    }
    return out;
  }

  drawHook(ctx, camX, h, t) {
    const im = envImg('chain_hook'), ch = envImg('chain_01');
    if (!im) return;
    const H = TERRAIN.hook, s = ENV_PX * 0.8, w = im.width * s, hh = im.height * s;
    // 钩尖离地面多高：平时 150，预警时慢慢降、抖动，落下时到腰，钩住时吊着，再收回去
    let lift = 150, jit = 0;
    if (h.st === 'warn') { lift = 150 - 40 * (h.t / H.warn); jit = Math.sin(t * 0.9) * 3 * (h.t / H.warn); }
    else if (h.st === 'drop') lift = 110 - 80 * (h.t / H.drop);
    else if (h.st === 'hold') lift = 60;
    else if (h.st === 'up') lift = 60 + 90 * (h.t / H.up);
    const sx = h.x - camX + jit, tipY = GROUND_TOP + h.y - lift;
    if (sx < -100 || sx > VIEW_W + 100) return;
    const y0 = tipY - hh;
    ctx.drawImage(im, sx - w / 2, y0, w, hh);
    if (ch) { // 钩子上面接一段段锁链，一直到画面顶上
      const cw = ch.width * s, chh = ch.height * s;
      for (let y = y0 - chh + 6; y > -chh; y -= chh - 6) ctx.drawImage(ch, sx - cw / 2, y, cw, chh);
    }
  }
}

export function makeTerrain(game, stage, room) {
  const T = new Terrain(game, stage, room);
  if (T.empty) { world.band = null; return null; }
  return T;
}
