// 逐帧精灵：「绯隼」素材包（由 tools/build_hero_sprites.py 处理成图集）
//
// 每帧都有锚点（脚底）和对齐偏移；朝左时绕锚点镜像。
// 闪白、残影、轮廓光都要「整帧换成一种颜色」：第一次用到时画一张染色版缓存起来，之后直接复用。

const BASE = 'assets/hero/';
export const HERO_SCALE = 0.54; // 图集里角色约 179px 高 → 游戏里约 96px

function loadImage(src) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

class SpriteSheet {
  constructor() {
    this.ready = false;
    this.tints = new Map();
  }

  async load() {
    try {
      const [meta, atlas, full, avatar] = await Promise.all([
        fetch(BASE + 'feisun.json').then((r) => (r.ok ? r.json() : null)),
        loadImage(BASE + 'feisun_atlas.webp'),
        loadImage(BASE + 'feisun_fullbody.webp'),
        loadImage(BASE + 'feisun_avatar.webp'),
      ]);
      if (!meta || !atlas) return;
      Object.assign(this, { meta, atlas, full, avatar, C: meta.cell, cols: meta.cols, pivot: meta.pivot });
      this.ready = true;
    } catch {
      this.ready = false; // 加载失败就继续用程序化模型
    }
  }

  frame(anim, idx) {
    const names = this.meta.anims[anim].frames;
    return names[Math.max(0, Math.min(names.length - 1, idx))];
  }

  cellOf(name) {
    const i = this.meta.frames[name].i;
    return [(i % this.cols) * this.C, Math.floor(i / this.cols) * this.C];
  }

  // 整帧染成一种颜色（保留透明度），结果缓存
  tinted(name, color) {
    const key = name + color;
    let c = this.tints.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = this.C;
      const x = c.getContext('2d');
      const [cx, cy] = this.cellOf(name);
      x.drawImage(this.atlas, cx, cy, this.C, this.C, 0, 0, this.C, this.C);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = color;
      x.fillRect(0, 0, this.C, this.C);
      this.tints.set(key, c);
    }
    return c;
  }

  // (sx, sy) 是脚底的屏幕坐标
  draw(ctx, name, sx, sy, facing, o = {}) {
    const f = this.meta.frames[name];
    const C = this.C, s = o.scale ?? HERO_SCALE;
    const dx = -this.pivot[0] + f.dx, dy = -this.pivot[1] + f.dy;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(facing * s, s);
    ctx.globalAlpha *= o.alpha ?? 1;
    if (o.ghost) {
      ctx.drawImage(this.tinted(name, o.ghost), dx, dy);
      ctx.restore();
      return;
    }
    // 轮廓光：把染色剪影往四个方向错开一点画在身后，深色衣服在暗场景里也能看清轮廓
    if (o.rim) {
      const rim = this.tinted(name, o.rim);
      const a = ctx.globalAlpha;
      ctx.globalAlpha = a * (o.rimAlpha ?? 0.32);
      for (const [ox, oy] of [[-3, 0], [3, 0], [0, -3], [0, 2]]) ctx.drawImage(rim, dx + ox, dy + oy);
      ctx.globalAlpha = a;
    }
    const [cx, cy] = this.cellOf(name);
    ctx.drawImage(this.atlas, cx, cy, C, C, dx, dy, C, C);
    if (o.overlay) {
      ctx.globalAlpha *= o.overlayAlpha ?? 0.5;
      ctx.drawImage(this.tinted(name, o.overlay), dx, dy);
    }
    if (o.flash) {
      ctx.globalAlpha = 1;
      ctx.drawImage(this.tinted(name, '#ffffff'), dx, dy);
    }
    ctx.restore();
  }
}

export const heroSprite = new SpriteSheet();
heroSprite.load();

// ---------- 游戏状态 → 动画帧 ----------
// 招式 → 用哪组动画。素材标出的接触帧（刀最快、打到人的那几帧）对齐到招式的出伤帧
const MOVE_ANIM = {
  slash1: 'attack_01', slash2: 'attack_02', slash3: 'attack_03', upper: 'launcher', sweep: 'low_sweep',
  dashAtk: 'thrust', rush: 'thrust', chargeSlash1: 'attack_03', chargeSlash2: 'attack_03',
  airSlash: 'air_slash_01', airSlash2: 'air_slash_02', airSlash3: 'air_slash_01',
  wave: 'cast', whirl: 'attack_02', quake: 'cast', flurry: 'thrust',
};
// 素材没标接触帧的动画（施法）在这里补上
const CONTACT = { cast: [3, 4] };

// 把招式的第 f 帧映射到动画的第几帧：
// 出伤前 → 起手帧（接触帧之前），出伤中 → 接触帧，出伤后 → 收招帧
function attackIndex(S, anim, m, f) {
  const n = S.meta.anims[anim].frames.length;
  const c = CONTACT[anim] || S.meta.anims[anim].contact;
  const c0 = c.length ? c[0] : Math.floor(n / 2), c1 = c.length ? c[c.length - 1] : c0;
  const at = m.swingAt ?? m.hits[0]?.at ?? 6;
  const dur = (m.swingDur ?? m.hits[0]?.dur ?? 4) + 2;
  const span = (k0, k1, u) => k0 + Math.min(k1 - k0, Math.floor(u * (k1 - k0 + 1)));
  if (f < at) return c0 > 0 ? span(0, c0 - 1, f / at) : 0;
  if (f < at + dur) return span(c0, c1, (f - at) / dur);
  if (c1 >= n - 1) return n - 1;
  return span(c1 + 1, n - 1, (f - at - dur) / Math.max(1, m.total - at - dur));
}

function loopIndex(S, anim, ms) {
  const names = S.meta.anims[anim].frames;
  const durs = names.map((n) => S.meta.frames[n].ms);
  let t = ms % durs.reduce((a, b) => a + b, 0);
  for (let i = 0; i < durs.length; i++) {
    if (t < durs[i]) return i;
    t -= durs[i];
  }
  return 0;
}

// 按素材时长播放一遍（不循环），停在最后一帧
function onceIndex(S, anim, ms) {
  const names = S.meta.anims[anim].frames;
  for (let i = 0; i < names.length; i++) {
    ms -= S.meta.frames[names[i]].ms;
    if (ms < 0) return i;
  }
  return names.length - 1;
}

// 主角当前应该显示哪一帧
export function heroFrame(p, t) {
  const S = heroSprite, ms = t * (1000 / 60), sms = p.st * (1000 / 60);
  const F = (a, i) => S.frame(a, i);
  switch (p.state) {
    case 'idle':
      // 刚落地：跳跃的落地缓冲两帧
      if (p.touchdown && p.st < 8) return F('jump', p.st < 4 ? 6 : 7);
      return F('idle', loopIndex(S, 'idle', ms));
    case 'run': return F('run', loopIndex(S, 'run', ms));
    case 'air':
      if (p.teched && p.st < 16) return F('tech', Math.floor(p.st / 5));
      if (p.st < 3 && p.vz > 0) return F('jump', 0);
      return F('jump', p.vz > 6 ? 1 : p.vz > 2.5 ? 2 : p.vz > 0 ? 3 : p.vz > -2.5 ? 4 : 5);
    case 'dash': return F('dodge', Math.floor((p.st / 20) * 8));
    case 'airdash': return F('dodge', 3);
    case 'hurt': return F('hurt', Math.floor((p.st / Math.max(1, p.hurtT)) * 6));
    case 'knock': return F('air_hurt', onceIndex(S, 'air_hurt', sms));
    case 'down':
      if (p.st > 30) return F('getup', Math.min(4, Math.floor((p.st - 30) / 2)));
      return F('death', 3 + Math.min(2, Math.floor(p.st / 5)));
    case 'dead': return F('death', Math.floor(p.st / 6));
    case 'charge': return F('charge', loopIndex(S, 'charge', sms * (p.chargeLv === 2 ? 2 : 1)));
    case 'ult': {
      // 必杀：开场施法 → 瞬身连斩（每次换位交替两种出刀姿势）→ 举刀蓄力 → 终结重斩
      const u = p.ultPose;
      if (u == null) return F('cast', Math.min(2, Math.floor(p.st / 8)));
      if (u === -2.9) return F('charge', loopIndex(S, 'charge', ms * 2));
      if (u === 1.4) return F('attack_03', 4);
      return u < 0 ? F('attack_02', 4) : F('attack_01', 4);
    }
    case 'attack': {
      const m = p.move, f = p.mf;
      // 五连刺：突刺的伸出帧来回切换
      if (m.id === 'rush' && f < 26) return F('thrust', f < 3 ? 1 : f % 4 < 2 ? 2 : 3);
      // 千刃：起手施法 → 突刺 / 三段斩的出刀帧轮换 → 重斩收尾
      if (m.flurry && f < 8) return F('cast', Math.min(3, Math.floor(f / 2)));
      if (m.flurry && f < 50) return F(['thrust', 'attack_01', 'attack_02', 'attack_03'][Math.floor(f / 3) % 4], f % 3 ? 3 : 4);
      if (m.flurry) return F('attack_03', attackIndex(S, 'attack_03', m, f));
      if (m.spin) return F(['attack_01', 'attack_02'][Math.floor(f / 4) % 2], 4);
      if (m.plunge) return F('starfall_air', Math.min(2, Math.floor(f / 3)));
      if (m.id === 'plungeLand') return F('starfall_land', Math.min(2, Math.floor(f / 5)));
      // 崩山击：前半段蓄力用蓄力循环
      if (m.id === 'quake' && f < 24) return F('charge', loopIndex(S, 'charge', f * 33));
      const anim = MOVE_ANIM[m.id] || 'attack_01';
      return F(anim, attackIndex(S, anim, m, f));
    }
  }
  return F('idle', 0);
}

// 刀身在屏幕上的位置：[刀柄x, 刀柄y, 刀尖x, 刀尖y]，相对脚底锚点、已乘缩放和朝向；没检测到刀返回 null
export function bladeOf(name, facing, scale = HERO_SCALE) {
  const b = heroSprite.meta?.frames[name]?.blade;
  return b ? [b[0] * scale * facing, b[1] * scale, b[2] * scale * facing, b[3] * scale] : null;
}

// 首领「残影」：同一套动画，暗紫色覆盖
export function shadowFrame(b, t) {
  const S = heroSprite, ms = t * (1000 / 60);
  const F = (a, i) => S.frame(a, i);
  switch (b.state) {
    case 'idle': return b.vx || b.vy ? F('run', loopIndex(S, 'run', ms)) : F('idle', loopIndex(S, 'idle', ms));
    case 'hurt': return F('hurt', Math.min(5, Math.floor(b.st / 4)));
    case 'air': return F('air_hurt', Math.min(2, Math.floor(b.st / 6)));
    case 'dying': return b.z > 0 ? F('air_hurt', 2) : F('death', 5);
    case 'down': return F('death', 4);
    case 'spawn': return F('cast', Math.min(5, Math.floor(b.st / 6)));
    case 'attack': {
      const a = b.act?.name;
      if (b.tele) return a === 'charge' ? F('thrust', 1) : a === 'teleport' || a === 'rain' || a === 'volley' ? F('cast', 1) : F('charge', loopIndex(S, 'charge', ms));
      if (a === 'charge') return F('thrust', 3);
      if (a === 'volley' || a === 'rain') return F('cast', 4);
      const k = b.act ? b.act.t : 0;
      const seq = ['attack_01', 'attack_02', 'attack_03'][Math.floor(k / 20) % 3];
      return F(seq, 2 + Math.min(4, Math.floor((k % 20) / 4)));
    }
  }
  return F('idle', 0);
}
