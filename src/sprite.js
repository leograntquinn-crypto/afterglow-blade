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
// 招式 → 用哪组攻击动画。命中帧（素材建议第 2~3 帧）对齐到招式的出伤帧
const MOVE_ANIM = {
  slash1: 'attack_01', slash2: 'attack_02', slash3: 'attack_03', upper: 'attack_02', sweep: 'attack_01',
  dashAtk: 'attack_01', rush: 'attack_01', chargeSlash1: 'attack_03', chargeSlash2: 'attack_03',
  airSlash: 'attack_01', airSlash2: 'attack_02', airSlash3: 'attack_03', plunge: 'attack_03', plungeLand: 'attack_03',
  wave: 'attack_03', whirl: 'attack_02', quake: 'attack_03', flurry: 'attack_01',
};

function attackIndex(m, f) {
  const at = m.swingAt ?? m.hits[0]?.at ?? 6;
  const dur = (m.swingDur ?? m.hits[0]?.dur ?? 4) + 2;
  if (f < at) return Math.min(1, Math.floor((f / Math.max(1, at)) * 2));
  if (f < at + dur) return 2 + Math.min(1, Math.floor(((f - at) / dur) * 2));
  const rest = Math.max(1, m.total - at - dur);
  return 4 + Math.min(1, Math.floor(((f - at - dur) / rest) * 2));
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

// 主角当前应该显示哪一帧
export function heroFrame(p, t) {
  const S = heroSprite, ms = t * (1000 / 60);
  const F = (a, i) => S.frame(a, i);
  switch (p.state) {
    case 'idle': return F('idle', loopIndex(S, 'idle', ms));
    case 'run': return F('run', loopIndex(S, 'run', ms));
    case 'air': return F('jump', p.vz > 5 ? 1 : p.vz > 1.5 ? 2 : p.vz > -3 ? 3 : 4);
    case 'dash': return F('dodge', Math.floor((p.st / 20) * 6));
    case 'airdash': return F('dodge', 2);
    case 'hurt': return F('hurt', Math.floor((p.st / Math.max(1, p.hurtT)) * 6));
    case 'knock': return F('death', Math.min(2, Math.floor(p.st / 6)));
    case 'down': return F('death', p.st > 30 ? 5 - Math.min(5, Math.floor((p.st - 30) / 2)) : 3 + Math.min(2, Math.floor(p.st / 6)));
    case 'dead': return F('death', Math.floor(p.st / 6));
    case 'charge': return F('attack_03', 1);
    case 'ult': return p.ultPose != null && p.ultPose < 0 ? F('attack_03', 1) : F(p.st % 12 < 6 ? 'attack_01' : 'attack_02', 3);
    case 'attack': {
      const m = p.move, f = p.mf;
      if (m.id === 'rush' && f < 26) return F('attack_01', f % 4 < 2 ? 2 : 3);
      if (m.flurry && f < 50) return F(['attack_01', 'attack_02', 'attack_03', 'attack_01'][Math.floor(f / 3) % 4], 3);
      if (m.spin) return F(Math.floor(f / 4) % 2 ? 'attack_01' : 'attack_02', 3);
      if (m.plunge) return F('attack_03', f < 4 ? 1 : 3);
      if (m.id === 'plungeLand') return F('attack_03', f < 8 ? 4 : 5);
      return F(MOVE_ANIM[m.id] || 'attack_01', attackIndex(m, f));
    }
  }
  return F('idle', 0);
}

// 首领「残影」：同一套动画，暗紫色覆盖
export function shadowFrame(b, t) {
  const S = heroSprite, ms = t * (1000 / 60);
  const F = (a, i) => S.frame(a, i);
  switch (b.state) {
    case 'idle': return b.vx || b.vy ? F('run', loopIndex(S, 'run', ms)) : F('idle', loopIndex(S, 'idle', ms));
    case 'hurt': return F('hurt', Math.min(5, Math.floor(b.st / 4)));
    case 'air': case 'dying': return F('death', b.z > 0 ? 1 : 5);
    case 'down': return F('death', 4);
    case 'spawn': return F('idle', 0);
    case 'attack': {
      const a = b.act?.name;
      if (b.tele) return a === 'charge' ? F('dodge', 1) : F('attack_03', 1);
      if (a === 'charge') return F('dodge', 3);
      const k = b.act ? b.act.t : 0;
      return F(['attack_01', 'attack_02', 'attack_03'][Math.floor(k / 20) % 3], 2 + (Math.floor(k / 4) % 2));
    }
  }
  return F('idle', 0);
}
