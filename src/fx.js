// 特效系统：粒子（火花、余烬、烟尘、碎片、光团、冲击环、刀光、斩痕、汇聚光点、地裂）、伤害数字、震屏、闪屏
//
// 粒子池：所有粒子对象预先分配、用完回收，战斗中不产生垃圾（避免手机上垃圾回收造成的卡顿）。
// 数据驱动：每种喷发的参数写在 fx_data.js 的 EMIT 表里，这里只按表执行。
// 贴图：fx_tex.js 启动时用代码画好的柔光贴图；画的时候只做 drawImage，不再每帧建渐变和路径。
// 画质：lod（0.35～1）按比例减少粒子数量；上限 MAX 个，超出就不再喷新的。
import { ribbonTex, drawRibbon } from './ribbon.js';
import { GROUND_TOP, toScreen, FONT_NUM, FONT_TITLE, rand, REDUCED_MOTION } from './config.js';
import { settings } from './settings.js';
import { MOBILE } from './sprite.js';
import { EMIT, CURVES, curve } from './fx_data.js';
import { tex, tinted, ramp, tintRamp, RING_BANDS } from './fx_tex.js';
import { flipbook } from './fx_art.js';
import { FB_SCALE } from './fx_data.js';

const MAX = MOBILE ? 900 : 2400;
const T_ring = (color) => tex().ring.map((img) => tinted(img, color));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const easeOut = (t) => 1 - (1 - t) ** 3;

// 一个粒子：所有字段在构造时就建好（对象形状固定，JS 引擎才能优化）
class P {
  constructor() {
    this.kind = '';
    this.x = this.y = this.z = this.vx = this.vy = this.vz = 0;
    this.life = this.max = 1;
    this.size = 1; this.rot = 0; this.vr = 0;
    this.drag = 1; this.grav = 0; this.bounce = 0; this.stretch = 0; this.sway = 0; this.seed = 0; this.alpha = 1;
    this.sizeC = CURVES.one; this.alphaC = CURVES.one; this.ramp = null; this.add = true; this.img = null;
    this.tx = null; this.tx2 = null; // 出生时取好的染色贴图（按年龄取下标）
    this.color = '#fff'; this.bounced = false;
    // 冲击环 / 刀光 / 斩痕 / 汇聚 / 地裂 用到的额外参数
    this.follow = null; this.fb = null; this.ground = false; // 序列帧：跟随谁、哪组、是否贴地
    this.r0 = 0; this.r1 = 0; this.w = 0; this.facing = 1; this.a0 = 0; this.a1 = 0; this.angle = 0; this.len = 0; this.ox = 0; this.oz = 0;
  }
}

export class FX {
  constructor() {
    this.live = [];
    this.pool = [];
    this.lod = 1; // 画质：主循环每帧按当前画质设置
    this.texts = [];
    this.shakeT = 0;
    this.shakeDur = 1;
    this.shakeMag = 0;
    this.rot = 0;        // 旋转震屏（弧度）
    this.flashA = 0;
    this.flashColor = '#fff';
    this.shocks = [];  // 冲击波：给 WebGL 后处理做屏幕扭曲（Canvas 后处理时忽略）
    this.chromaA = 0;  // 色差强度（同上）
    this.chromaAt = null;
  }
  get parts() { return this.live; }
  get count() { return this.live.length; }

  // ---------- 屏幕级效果 ----------
  shake(mag, dur = 12) {
    if (REDUCED_MOTION) mag *= 0.35;
    mag *= settings.shake; // 设置：震屏强度
    if (mag <= 0) return;
    const cur = this.shakeT > 0 ? this.shakeMag * (this.shakeT / this.shakeDur) : 0;
    if (mag >= cur) {
      this.shakeMag = mag;
      this.shakeT = dur;
      this.shakeDur = dur;
    }
    // 重击带一点旋转，比单纯平移更有冲击力
    if (mag >= 7 && !REDUCED_MOTION && settings.shake >= 1) this.rot = (Math.random() < 0.5 ? -1 : 1) * Math.min(0.03, mag * 0.0022);
  }
  // 冲击波扭曲：(x, y, z) 世界坐标，r 最大半径（像素），s 强度，life 帧数
  shock(x, y, z, r, s = 0.02, life = 22) {
    if (REDUCED_MOTION || this.shocks.length >= 6) return;
    this.shocks.push({ x, y, z, r, s: s * settings.shake, life, max: life });
  }
  // 色差：重击、爆发的一瞬间红蓝通道错开，(x, y, z) 是中心
  aberrate(a, x, y, z) {
    if (REDUCED_MOTION || !settings.flash) return;
    if (a >= this.chromaA) this.chromaAt = x == null ? null : { x, y, z };
    this.chromaA = Math.max(this.chromaA, a);
  }
  flash(color, a) {
    this.flashColor = color;
    if (!settings.flash) a *= 0.2; // 设置：关闭闪屏后只留一点点提示
    this.flashA = Math.max(this.flashA, REDUCED_MOTION ? a * 0.4 : a);
  }
  shakeOffset() {
    if (this.shakeT <= 0) return [0, 0];
    const m = this.shakeMag * (this.shakeT / this.shakeDur);
    return [rand(-m, m), rand(-m, m) * 0.7];
  }

  // ---------- 粒子池 ----------
  spawn(kind, x, y, z, life) {
    if (this.live.length >= MAX) return null;
    const p = this.pool.pop() || new P();
    p.kind = kind;
    p.x = x; p.y = y; p.z = z;
    p.vx = p.vy = p.vz = 0;
    p.life = p.max = Math.max(1, life | 0);
    p.size = 1; p.rot = 0; p.vr = 0;
    p.drag = 1; p.grav = 0; p.bounce = 0; p.stretch = 0; p.sway = 0; p.seed = Math.random() * 100; p.alpha = 1;
    p.sizeC = CURVES.one; p.alphaC = CURVES.fade; p.ramp = null; p.add = true; p.img = null; p.bounced = false; p.tx = p.tx2 = null;
    p.follow = null; p.fb = null; p.ground = false;
    this.live.push(p);
    return p;
  }

  // 按 EMIT 表喷一组粒子。o：dir（朝向 ±1）、n（个数）、color、scale（大小倍数）、speed（速度倍数）
  emit(name, x, y, z, o = {}) {
    const d = EMIT[name], T = tex();
    let n = o.n ?? rand(d.n[0], d.n[1] + 0.999) | 0;
    n = n > 0 ? Math.max(1, Math.round(n * this.lod)) : 0;
    const dir = o.dir ?? 1, color = o.color ?? d.color ?? '#ffffff', sc = o.scale ?? 1, spd = o.speed ?? 1;
    const rp = ramp(color, d.ramp), add = d.blend !== 'normal';
    for (let i = 0; i < n; i++) {
      const p = this.spawn(d.type, x, y, z, rand(d.life[0], d.life[1]));
      if (!p) return;
      if (d.speed) {
        const a = (d.angle ?? 0) + rand(-(d.spread ?? 0), d.spread ?? 0), s = rand(d.speed[0], d.speed[1]) * spd;
        p.vx = Math.cos(a) * s * dir;
        p.vz = -Math.sin(a) * s;
        p.vy = rand(-0.25, 0.25) * s; // 纵深方向也散开一点，2.5D 里才有体积感
      }
      p.size = rand(d.size[0], d.size[1]) * sc;
      p.drag = d.drag ?? 1; p.grav = d.grav ?? 0; p.bounce = d.bounce ?? 0; p.stretch = d.stretch ?? 0; p.sway = d.sway ?? 0;
      p.alpha = d.alpha ?? 1;
      p.sizeC = CURVES[d.sizeC ?? 'one']; p.alphaC = CURVES[d.alphaC ?? 'fade'];
      p.ramp = rp; p.add = add; p.color = color;
      if (d.spin) { p.rot = rand(0, 6.28); p.vr = rand(-d.spin, d.spin); }
      if (d.type === 'smoke') p.img = tinted(pick(T.smoke), color, 'mul');
      else if (d.type === 'chip') p.img = tinted(pick(T.chip), color, 'mul');
      else if (d.type === 'spark') p.tx = tintRamp(T.streak, rp);
      else if (d.type === 'ember') p.tx = tintRamp(T.ember, rp);
      else if (d.type === 'glow') p.tx = tintRamp(T.glow, rp);
    }
  }

  // ---------- 对外接口（和旧版一样，调用方不用改）----------
  spark(x, y, z, dir, n = 8, color = '#fff3c4') {
    this.emit('spark', x, y, z, { dir, n, color });
    this.emit('ember', x, y, z, { dir, n: Math.max(1, Math.round(n * 0.4)), color });
    this.emit('hitGlow', x, y, z, { color, scale: 0.7 + Math.min(n, 20) * 0.03 });
  }
  // 冲击环：半径从 r 迅速撑开（先快后慢），越撑越淡
  ring(x, y, z, color = '#fff', r = 8, grow = 5, life = 10, w = 3) {
    const p = this.spawn('ring', x, y, z, life);
    if (!p) return;
    p.r0 = r; p.r1 = r + grow / (1 - 0.85); p.w = w; p.color = color; p.ramp = ramp(color, 'cool');
    const T = tex();
    p.tx = T.ring.map((img) => tintRamp(img, p.ramp)); p.tx2 = tintRamp(T.glow, p.ramp);
    p.alphaC = CURVES.fadeLate;
  }
  dust(x, y, n = 6, spread = 1) {
    this.emit('dust', x + rand(-6, 6), y, rand(0, 6), { n, speed: spread, scale: 0.8 + spread * 0.2 });
    // 大团的尘土（落地、撞墙、砸地）再叠一团手绘滚烟
    if (n >= 10) this.flip('smoke_roll', x, y, 4, { color: '#b8aa9a', scale: 0.7 + spread * 0.25, facing: Math.random() < 0.5 ? -1 : 1, alpha: 0.85 });
  }
  // 材质碎片：受重力影响、会在地上弹跳翻滚的小块（骨渣、布屑、金属屑）
  chips(x, y, z, dir, n, color) {
    this.emit('chip', x, y + rand(-6, 6), z, { dir, n, color });
  }
  // 刀光：一段新月形的弧，a0 -> a1（弧度，0 = 正前方，负数 = 向上）。刀头先扫过去，刀尾随后追上收窄
  arc(x, y, z, facing, r, a0, a1, color, w = 14, life = 9) {
    const p = this.spawn('arc', x, y, z, life + 3);
    if (!p) return;
    Object.assign(p, { facing, r0: r, a0, a1, color, w });
  }
  // 蓄力：光点从四周加速吸向中心，带拖尾
  converge(x, y, z, n, color) {
    n = Math.max(1, Math.round(n * this.lod));
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), d = rand(70, 120);
      const p = this.spawn('mote', x, y, z, rand(16, 22));
      if (!p) return;
      p.ox = Math.cos(a) * d; p.oz = Math.sin(a) * d; p.size = rand(2.2, 3.6); p.color = color; p.ramp = ramp(color, 'cool');
      p.tx = tintRamp(tex().streak, p.ramp); p.tx2 = tintRamp(tex().glow, p.ramp);
      p.alphaC = CURVES.pop; p.sizeC = CURVES.grow;
    }
  }
  // 地裂：暗色裂缝 + 炽热的缝（叠加发光，慢慢冷却），地面透视
  crack(x, y) {
    const p = this.spawn('crack', x, y, 0, 150);
    if (!p) return;
    p.img = pick(tex().crack); p.facing = Math.random() < 0.5 ? -1 : 1; p.color = '#ff9a4a';
  }
  // 星芒：命中瞬间的十字闪光，迅速撑开、略微转动后收缩
  // alt：用第二种星芒（六芒，暴击、破招用；没有手绘素材时和第一种一样）
  flare(x, y, z, scale, color, alt = false) {
    const p = this.spawn('flare', x, y, z, 9);
    if (!p) return;
    const T = tex();
    p.size = scale; p.rot = rand(-0.3, 0.3); p.vr = rand(-0.02, 0.02); p.color = color;
    p.tx = tintRamp(alt && T.flare2 ? T.flare2 : T.flare, ramp(color, 'cool')); p.ramp = ramp(color, 'cool');
  }
  // 冲击线：从命中点向外射出的细线（漫画里的集中线），一半集中在打击方向
  lines(x, y, z, n, color, dir = 1) {
    n = Math.max(2, Math.round(n * this.lod));
    for (let i = 0; i < n; i++) {
      const p = this.spawn('line', x, y, z, rand(6, 9));
      if (!p) return;
      const a = i % 2 ? rand(-0.5, 0.5) + (dir > 0 ? 0 : Math.PI) : rand(0, Math.PI * 2);
      p.angle = a; p.r0 = rand(10, 22); p.len = rand(40, 80); p.size = rand(1.4, 2.6); p.color = color;
    }
  }
  // 地面冲击波：贴着地面（压扁成透视）的环，从脚下迅速扩散
  gring(x, y, color, r0, r1, life = 22, w = 6) {
    const p = this.spawn('gring', x, y, 0, life);
    if (!p) return;
    p.r0 = r0; p.r1 = r1; p.w = w; p.color = color; p.ramp = ramp(color, 'cool');
    p.tx = tex().ring.map((img) => tintRamp(img, p.ramp)); p.tx2 = tintRamp(tex().glow, p.ramp);
  }
  // 地面预警 / 聚气：从大圈收缩到脚下（首领出招前、主角蓄力时）
  gwarn(x, y, color, r1, r0, life = 26) {
    const p = this.spawn('gwarn', x, y, 0, life);
    if (!p) return;
    p.r0 = r0; p.r1 = r1; p.color = color; p.tx = T_ring(color);
  }
  // 光柱：从地面冲天的一道光，先细后粗再淡出
  pillar(x, y, color, w = 60, h = 420, life = 24) {
    const p = this.spawn('pillar', x, y, 0, life);
    if (!p) return;
    p.w = w; p.len = h; p.color = color; p.ramp = ramp(color, 'cool'); p.tx = tintRamp(tex().glow, p.ramp);
    p.tx2 = tex().pillar ? tintRamp(tex().pillar, p.ramp) : null;
  }
  // 尘爆：贴地炸开的一片尘浪（手绘素材；没有素材时用普通尘土代替）
  dustburst(x, y, scale = 1, color = '#b8aa9a', life = 34) {
    const T = tex();
    if (!T.dustburst) { this.dust(x, y, Math.round(10 * scale), 2); return; }
    const p = this.spawn('dburst', x, y, 0, life);
    if (!p) return;
    p.img = tinted(pick(T.dustburst), color, 'mul'); p.size = scale; p.add = false; p.facing = Math.random() < 0.5 ? -1 : 1;
    p.alphaC = CURVES.pop; p.alpha = 0.85;
  }
  // 符文圈：压扁成地面透视、缓慢旋转的法阵（which 0 = 主角用的，1 = 首领用的）。r 半径，spin 每帧转多少
  rune(x, y, which, color, r, life, spin = 0.01) {
    const T = tex();
    if (!T.rune) { this.gwarn(x, y, color, r * 1.4, r * 0.4, Math.min(life, 40)); return; }
    const p = this.spawn('rune', x, y, 0, life);
    if (!p) return;
    p.img = tinted(T.rune[which], color); p.r0 = r; p.vr = spin; p.rot = rand(0, 6.28); p.color = color;
  }
  // 手绘序列帧特效（FX-2 / FX-3）。素材没载好时返回 false，调用方照常有程序特效兜底
  // o：facing 朝向、flipY 上下翻转、color 染色、scale 大小倍数、alpha、rot 旋转、ground 贴地（压扁成地面透视，画在角色下面）、
  //    hold 播完后停在最后一帧多少帧（法阵读条）、life 循环素材的总时长、follow 跟随的对象 + ox / oz 相对位置
  flip(id, x, y, z, o = {}) {
    const fb = flipbook(id);
    if (!fb) return false;
    const step = 60 / fb.fps, n = fb.frames.length;
    const life = fb.loop ? o.life ?? 120 : Math.ceil(n * step) + (o.hold ?? 0);
    const p = this.spawn('flip', x, y, z, life);
    if (!p) return false;
    const color = o.color ?? '#ffffff';
    p.fb = fb; p.add = fb.add; p.color = color; p.facing = o.facing ?? 1; p.w = o.flipY ?? 1; p.rot = o.rot ?? 0;
    p.size = o.size ?? (FB_SCALE[id] ?? 0.5) * (o.scale ?? 1); // size：直接给「逻辑像素 / 交付像素」（敌人特效按身高算） p.alpha = o.alpha ?? 1; p.ground = !!o.ground;
    p.tx = fb.frames.map((c) => c && tinted(c, color, fb.add ? 'fill' : 'mul'));
    if (o.follow) { p.follow = o.follow; p.ox = o.ox ?? 0; p.oz = o.oz ?? 0; }
    return p;
  }
  // 击杀：魂火往上散 + 一团冷光
  soul(x, y, z, color) {
    this.emit('soul', x, y, z, { color });
    this.emit('hitGlow', x, y, z, { color, scale: 2.2 });
  }
  // 斩痕：命中点闪过一道沿挥砍方向的锐利光，先迅速拉长再变细消失；w 粗细倍数
  cut(x, y, z, angle, len, color, w = 1) {
    const p = this.spawn('cut', x, y, z, 10);
    if (!p) return;
    p.angle = angle; p.len = len; p.color = color; p.ramp = ramp(color, 'hot'); p.w = w;
    p.img = tinted(tex().glow, color);
  }

  // ---------- 文字 ----------
  number(x, y, z, value, { crit = false, color = null } = {}) {
    // 设置：伤害数字。「只看暴击」时仍然显示自己受到的伤害（有颜色的那种）
    if (settings.numbers === 'off' || (settings.numbers === 'crit' && !crit && !color)) return;
    // 同一位置刚刚冒过数字 → 往上错开，避免叠成一团
    const near = this.texts.filter((t) => t.k === 'num' && t.max - t.life < 14 && Math.abs(t.x - x) < 60 && Math.abs(t.y - y) < 30).length;
    z += Math.min(near, 3) * 22;
    if (near > 3) x += (near % 2 ? 1 : -1) * (18 + (near - 3) * 6);
    this.texts.push({ k: 'num', x: x + rand(-14, 14), y, z, vz: 2.4, life: 48, max: 48, value, crit, color });
  }
  label(x, y, z, text, color, size = 22) {
    this.texts.push({ k: 'label', x, y, z, vz: 1.2, life: 60, max: 60, text, color, size });
  }

  update() {
    if (this.shakeT > 0) this.shakeT--;
    this.rot *= 0.82;
    if (this.flashA > 0) this.flashA = Math.max(0, this.flashA - 0.04);
    this.chromaA *= 0.8;
    if (this.chromaA < 0.0005) this.chromaA = 0;
    for (let i = this.shocks.length - 1; i >= 0; i--) if (--this.shocks[i].life <= 0) this.shocks.splice(i, 1);
    const L = this.live;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      if (--p.life <= 0) {
        // 和最后一个交换后弹出：删除是 O(1)，对象回到池里复用
        L[i] = L[L.length - 1];
        L.pop();
        this.pool.push(p);
        continue;
      }
      if (p.kind === 'flare' || p.kind === 'rune') { p.rot += p.vr; continue; }
      if (p.kind === 'dburst') continue;
      if (p.kind === 'flip') {
        const f = p.follow;
        if (f) {
          p.x = f.x + p.ox * f.facing; p.y = f.y; p.z = f.z + p.oz; p.facing = f.facing;
          if (!f.alive || f.remove) p.life = Math.min(p.life, 8);
        }
        continue;
      }
      if (p.kind === 'ring' || p.kind === 'arc' || p.kind === 'cut' || p.kind === 'mote' || p.kind === 'crack' || p.kind === 'line' || p.kind === 'gring' || p.kind === 'gwarn' || p.kind === 'pillar') continue;
      p.vx *= p.drag; p.vy *= p.drag; p.vz = p.vz * p.drag - p.grav;
      if (p.sway) p.vx += Math.sin(p.life * 0.21 + p.seed) * p.sway * 0.1;
      p.x += p.vx; p.y += p.vy; p.z += p.vz; p.rot += p.vr;
      if (p.bounce && p.z < 0) {
        p.z = 0; p.vz = -p.vz * p.bounce; p.vx *= 0.6; p.vy *= 0.6; p.vr *= 0.6;
        if (!p.bounced && this.lod > 0.6) this.emit('puff', p.x, p.y, 0, { n: 1, scale: 0.7 });
        p.bounced = true;
      }
    }
    for (const t of this.texts) { t.life--; t.z += t.vz; t.vz *= 0.92; }
    this.texts = this.texts.filter((t) => t.life > 0);
  }

  // ---------- 绘制 ----------
  // 每个粒子都要在「世界变换」（震屏、镜头推近）之上再旋转缩放：先记下世界变换，每个粒子直接算出合成矩阵，
  // 用 setTransform 一次设好，比 save / translate / rotate / restore 快得多
  base(ctx) {
    const m = ctx.getTransform();
    this.M = [m.a, m.b, m.c, m.d, m.e, m.f];
  }
  // 以 (x, y) 为中心画贴图 img，旋转 rot，横向缩放 kx、纵向 ky；(ax, ay) 是贴图里对准 (x, y) 的点（默认中心）
  // 手绘贴图带着换算系数 u（让它和原来的占位贴图一样大）和锚点 cx, cy（裁过透明边的图，锚点不在正中）
  put(ctx, img, x, y, rot, kx, ky, ax, ay) {
    if (ax === undefined) { ax = img.cx ?? img.width / 2; ay = img.cy ?? img.height / 2; }
    const cs = Math.cos(rot), sn = Math.sin(rot);
    kx *= img.ux ?? img.u ?? 1; ky *= img.uy ?? img.u ?? 1; // 换算系数：手绘图按原来的逻辑尺寸画（见 fx_tex.js）
    this.putM(ctx, img, x, y, cs * kx, sn * kx, -sn * ky, cs * ky, ax, ay);
  }
  // 任意 2×2 局部变换（la lb lc ld）+ 平移，叠在世界变换上
  putM(ctx, img, x, y, la, lb, lc, ld, ax, ay) {
    const [a, b, c, d, e, f] = this.M;
    ctx.setTransform(a * la + c * lb, b * la + d * lb, a * lc + c * ld, b * lc + d * ld, a * x + c * y + e, b * x + d * y + f);
    ctx.drawImage(img, -ax, -ay);
  }
  restore(ctx) {
    const [a, b, c, d, e, f] = this.M;
    ctx.setTransform(a, b, c, d, e, f);
  }

  // 地面上的效果（地裂），在角色之前画
  drawFloor(ctx, camX) {
    let any = false;
    for (const p of this.live) if (p.kind === 'crack' || p.kind === 'gring' || p.kind === 'gwarn' || p.kind === 'rune' || p.ground) { any = true; break; }
    if (!any) return;
    this.base(ctx);
    const op = ctx.globalCompositeOperation;
    for (const p of this.live) {
      if (p.kind === 'gring' || p.kind === 'gwarn' || p.kind === 'rune') { this.drawGround(ctx, p, p.x - camX, GROUND_TOP + p.y); continue; }
      if (p.ground) { ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over'; this.drawFlip(ctx, p, p.x - camX, GROUND_TOP + p.y, false); ctx.globalCompositeOperation = 'source-over'; continue; }
      if (p.kind !== 'crack') continue;
      const sx = p.x - camX, sy = GROUND_TOP + p.y;
      const age = p.max - p.life;
      ctx.globalAlpha = Math.min(1, p.life / 40) * 0.85;
      this.put(ctx, p.img.dark, sx, sy, 0, p.facing, 1);
      // 炽热的缝：一开始很亮，约 1 秒冷却
      const heat = Math.max(0, 1 - age / 70);
      if (heat > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = heat * heat;
        this.put(ctx, tinted(p.img.hot, p.color), sx, sy, 0, p.facing, 1);
        ctx.globalCompositeOperation = op;
      }
    }
    ctx.globalAlpha = 1;
    this.restore(ctx);
  }

  // 序列帧：按年龄取帧（30 帧 / 秒的素材在 60 帧的游戏里每帧停 2 个刻）；hold 期间停在最后一帧轻轻脉动
  drawFlip(ctx, p, sx, sy, glowPass) {
    const fb = p.fb, n = fb.frames.length, age = p.max - p.life, step = 60 / fb.fps;
    let i = Math.floor(age / step), a = p.alpha;
    if (fb.loop) i %= n;
    else if (i >= n) { i = n - 1; a *= 0.85 + 0.15 * Math.sin(age * 0.15); }
    if (fb.loop && p.life < 10) a *= p.life / 10;
    const img = p.tx[i];
    if (!img) return;
    ctx.globalAlpha = a * (glowPass ? 0.4 : 1);
    const k = p.size / img.sc;
    if (p.ground) {
      const cs = Math.cos(p.rot), sn = Math.sin(p.rot), q = 0.32;
      this.putM(ctx, img, sx, sy, k * cs * p.facing, q * k * sn, -k * sn, q * k * cs, img.cx, img.cy);
    } else this.put(ctx, img, sx, sy, p.rot, k * p.facing, k * p.w);
  }

  // 贴地的环：压扁成地面透视（纵向 0.32）
  drawGround(ctx, p, sx, sy) {
    const t = 1 - p.life / p.max;
    ctx.globalCompositeOperation = 'lighter';
    if (p.kind === 'gring') {
      const r = p.r0 + (p.r1 - p.r0) * easeOut(t), want = (p.w * (2.2 - 1.4 * t)) / r;
      if (r > (tex().art ? 260 : 130)) {
        // 大环：贴图放大后绝大部分是透明的中心，白白耗填充率 —— 改成三层描边（只画到环带本身）
        const ci = Math.min(p.ramp.length - 1, (t * p.ramp.length) | 0), wd = p.w * (2.2 - 1.4 * t), fade = (1 - t) ** 1.3;
        this.restore(ctx);
        for (const [mul, al, col] of [[3, 0.12, p.ramp[ci]], [1.5, 0.3, p.ramp[ci]], [0.45, 0.85, p.ramp[0]]]) {
          ctx.globalAlpha = fade * al;
          ctx.strokeStyle = col;
          ctx.lineWidth = Math.max(1, wd * mul);
          ctx.beginPath();
          ctx.ellipse(sx, sy, r - wd * 0.3, (r - wd * 0.3) * 0.32, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
        return;
      }
      let bi = 0;
      while (bi < RING_BANDS.length - 1 && RING_BANDS[bi + 1] <= want * 1.2) bi++;
      const ci = Math.min(p.ramp.length - 1, (t * p.ramp.length) | 0);
      ctx.globalAlpha = (1 - t) ** 1.3;
      this.put(ctx, p.tx[bi][ci], sx, sy, 0, (r * 2) / 256, (r * 0.64) / 256);
      // 刚炸开时地面上一片亮
      if (t < 0.35) {
        ctx.globalAlpha = 0.35 * (1 - t / 0.35);
        this.put(ctx, p.tx2[ci], sx, sy, 0, (r * 1.4) / 64, (r * 0.45) / 64);
      }
    } else if (p.kind === 'rune') {
      // 符文圈：先淡入（同时从 80% 撑到全尺寸），保持、缓慢旋转，最后 25% 淡出；压扁成地面透视
      const age = p.max - p.life, fin = Math.min(1, age / 14), k = (p.r0 * 2 * (0.8 + 0.2 * easeOut(fin))) / p.img.width;
      ctx.globalAlpha = fin * Math.min(1, p.life / (p.max * 0.25)) * (0.8 + 0.2 * Math.sin(age * 0.12));
      const cs = Math.cos(p.rot), sn = Math.sin(p.rot), q = 0.32;
      this.putM(ctx, p.img, sx, sy, k * cs, q * k * sn, -k * sn, q * k * cs, p.img.cx, p.img.cy);
    } else {
      // 预警：收缩的环，越接近出招越亮、闪得越快
      const r = p.r1 + (p.r0 - p.r1) * easeOut(t);
      ctx.globalAlpha = (0.35 + 0.65 * t) * (0.75 + 0.25 * Math.sin(p.life * (0.5 + t)));
      this.put(ctx, p.tx[1], sx, sy, 0, (r * 2) / 256, (r * 0.64) / 256);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // glowPass = true 时只画发光的部分（给泛光层用）
  draw(ctx, camX, glowPass = false) {
    if (!this.live.length) return;
    const T = tex();
    this.base(ctx);
    const op = ctx.globalCompositeOperation;
    // 1. 普通混合：烟尘、碎片
    if (!glowPass) {
      for (const p of this.live) {
        if (p.add) continue;
        const sx = p.x - camX, sy = GROUND_TOP + p.y - p.z;
        const t = 1 - p.life / p.max;
        ctx.globalAlpha = p.alpha * curve(p.alphaC, t);
        if (p.kind === 'flip') {
          if (!p.ground) this.drawFlip(ctx, p, sx, sy, false);
          continue;
        }
        if (p.kind === 'dburst') {
          // 尘爆：以地面线为锚（画布 85% 高处），从 75% 迅速撑到 110%
          const k = ((300 * p.size) / p.img.fw) * (0.75 + 0.35 * easeOut(Math.min(1, t * 2.2)));
          this.put(ctx, p.img, sx, sy, 0, k * p.facing, k, p.img.cx, p.img.cy + 0.35 * p.img.fh);
        } else if (p.kind === 'smoke') {
          // 烟不旋转（旋转的半透明大贴图很费），靠 4 种形状 + 左右翻转 + 大小变化避免重复感
          const k = (p.size * 2 * curve(p.sizeC, t)) / p.img.width;
          this.put(ctx, p.img, sx, sy, 0, p.vr < 0 ? -k : k, k);
        } else {
          const k = p.size / 10;
          this.put(ctx, p.img, sx, sy, p.rot, k, k * (0.6 + 0.4 * Math.abs(Math.cos(p.rot * 0.7)))); // 翻滚：厚度随转动变化
        }
      }
    }
    // 2. 叠加发光
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.live) {
      if (!p.add) continue;
      const sx = p.x - camX, sy = GROUND_TOP + p.y - p.z;
      const t = 1 - p.life / p.max;
      const a = p.alpha * curve(p.alphaC, t);
      const ci = p.ramp ? Math.min(p.ramp.length - 1, (t * p.ramp.length) | 0) : 0;
      switch (p.kind) {
        case 'spark': {
          // 沿速度方向拉长：越快越长；前端白热
          const sp = Math.hypot(p.vx, p.vz - p.vy);
          const len = Math.max(p.size * 2.5, sp * p.stretch * 1.6), wid = p.size * curve(p.sizeC, t);
          const rot = Math.atan2(-p.vz + p.vy * 0.5, p.vx);
          ctx.globalAlpha = a;
          const st = p.tx[ci];
          this.put(ctx, st, sx, sy, rot, len / 58, (wid * 2.6) / 16, st.width * 0.906, st.height / 2); // 锚点在前端：光条拖在身后
          if (t < 0.45 && !glowPass) {
            ctx.globalAlpha = a * (1 - t / 0.45);
            this.put(ctx, T.needle, sx, sy, rot, (len * 0.8) / 128, (wid * 0.5) / 6, T.needle.width * 0.92, T.needle.height / 2);
          }
          break;
        }
        case 'ember': {
          const s = p.size * curve(p.sizeC, t);
          ctx.globalAlpha = a * (0.75 + 0.25 * Math.sin(p.life * 0.9 + p.seed)); // 闪烁
          this.put(ctx, p.tx[ci], sx, sy, 0, (s * 2.6) / 32, (s * 2.6) / 32);
          break;
        }
        case 'glow': {
          const s = p.size * curve(p.sizeC, t);
          ctx.globalAlpha = glowPass ? a * 0.4 : a;
          this.put(ctx, p.tx[ci], sx, sy, 0, (s * 2) / 64, (s * 2) / 64);
          if (!glowPass && t < 0.4) this.put(ctx, T.core, sx, sy, 0, (s * 0.7) / 32, (s * 0.7) / 32);
          break;
        }
        case 'ring': {
          const r = p.r0 + (p.r1 - p.r0) * easeOut(t);
          if (r > (T.art ? 260 : 130)) {
            // 大环改成描边（同 drawGround 的说明）
            const wd = p.w * (2.5 - 1.5 * t);
            this.restore(ctx);
            for (const [mul, al, c] of [[3, 0.12, p.ramp[ci]], [1.4, 0.32, p.ramp[ci]], [0.45, 0.85, p.ramp[0]]]) {
              if (glowPass && mul < 1) continue;
              ctx.globalAlpha = a * al * (glowPass ? 0.5 : 1);
              ctx.strokeStyle = c;
              ctx.lineWidth = Math.max(1, wd * mul);
              ctx.beginPath();
              ctx.ellipse(sx, sy, r - wd * 0.3, (r - wd * 0.3) * 0.75, 0, 0, Math.PI * 2);
              ctx.stroke();
            }
            break;
          }
          // 环宽：从 w 的 2.5 倍收到 1 倍左右，按「环宽 / 半径」挑最接近的一档贴图
          const want = (p.w * (2.5 - 1.5 * t)) / r;
          let bi = 0;
          while (bi < RING_BANDS.length - 1 && RING_BANDS[bi + 1] <= want * 1.2) bi++;
          ctx.globalAlpha = glowPass ? a * 0.45 : a;
          this.put(ctx, p.tx[bi][ci], sx, sy, 0, (r * 2) / 256, (r * 1.5) / 256);
          // 刚炸开时环里有一层淡淡的气浪
          if (t < 0.4 && !glowPass) {
            ctx.globalAlpha = a * 0.1 * (1 - t / 0.4);
            this.put(ctx, p.tx2[ci], sx, sy, 0, (r * 1.6) / 64, (r * 1.2) / 64);
          }
          break;
        }
        case 'mote': {
          // 位置：从外圈加速吸向中心（ease-in）
          const k = 1 - t * t, x = sx + p.ox * k, y = sy - p.oz * k;
          const s = p.size * curve(p.sizeC, t);
          const rot = Math.atan2(p.oz, -p.ox); // 指向中心
          ctx.globalAlpha = a;
          const st = p.tx[ci];
          this.put(ctx, st, x, y, rot, (8 + 30 * t) / 58, (s * 2.4) / 16, st.width * 0.906, st.height / 2);
          this.put(ctx, p.tx2[ci], x, y, 0, (s * 4) / 64, (s * 4) / 64);
          break;
        }
        case 'cut': {
          const age = p.max - p.life, grow = Math.min(1, age / 2.5);
          const len = p.len * grow * 1.1, w = Math.max(0.8, 6 * (1 - t)) * p.w;
          ctx.globalAlpha = Math.min(1, (1 - t) * 1.6) * (glowPass ? 0.5 : 0.8);
          this.put(ctx, p.img, sx, sy, p.angle, len / 64, (w * 2.2) / 64);
          if (!glowPass) {
            ctx.globalAlpha = Math.min(1, (1 - t) * 1.8);
            this.put(ctx, T.cut, sx, sy, p.angle, len / 128, (w * 0.55) / 6); // 斩痕：光照包的 cut_mark
            if (age < 3) {
              ctx.globalAlpha = (1 - age / 3) * 0.8;
              this.put(ctx, T.flare, sx, sy, p.angle * 0.5, 0.4, 0.4);
            }
          }
          break;
        }
        case 'flip':
          if (!p.ground) this.drawFlip(ctx, p, sx, sy, glowPass);
          break;
        case 'flare': {
          // 先猛地撑开（2 帧）再收缩消失
          const k = p.size * (t < 0.2 ? 0.4 + t * 3.5 : 1.1 - (t - 0.2) * 1.1);
          ctx.globalAlpha = (1 - t) * (glowPass ? 0.35 : 0.75);
          this.put(ctx, p.tx[ci], sx, sy, p.rot, k, k * 0.85);
          if (!glowPass) {
            ctx.globalAlpha = (1 - t) * 0.7;
            this.put(ctx, T.flare, sx, sy, p.rot + 0.4, k * 0.35, k * 0.3);
          }
          break;
        }
        case 'line': {
          // 内端飞快往外推、外端减速：线先拉长再缩短消失
          const e = easeOut(t), r0 = p.r0 + p.len * 1.1 * e, r1 = p.r0 + p.len * (0.35 + 0.9 * Math.min(1, t * 3));
          const mid = (r0 + r1) / 2, L = Math.max(2, r1 - r0);
          const cx = sx + Math.cos(p.angle) * mid, cy = sy + Math.sin(p.angle) * mid * 0.8;
          ctx.globalAlpha = (1 - t) * (glowPass ? 0.4 : 0.95);
          this.put(ctx, glowPass ? tinted(T.streak, p.color) : T.needle, cx, cy, p.angle, L / 128, (p.size * (1 - t * 0.6)) / 6);
          if (!glowPass) {
            ctx.globalAlpha = (1 - t) * 0.5;
            this.put(ctx, tinted(T.needle, p.color), cx, cy, p.angle, L / 128, (p.size * 2.4) / 6);
          }
          break;
        }
        case 'pillar': {
          // 光柱：前 20% 从细变粗，之后变淡；底部最亮
          const w = p.w * (t < 0.2 ? 0.3 + t * 3.5 : 1), h = p.len * (0.6 + 0.4 * easeOut(Math.min(1, t * 3)));
          ctx.globalAlpha = (1 - t) ** 1.5 * (glowPass ? 0.6 : 0.85);
          if (p.tx2) {
            // 手绘光柱：锚点在底部，宽度按 w、高度按 h 拉伸；再叠一层柔光让底部更亮
            const img = p.tx2[ci];
            this.put(ctx, img, sx, sy, 0, (w * 1.5) / img.width, h / img.height);
            ctx.globalAlpha *= 0.35;
            this.put(ctx, p.tx[ci], sx, sy - h * 0.2, 0, (w * 1.2) / 64, (h * 0.5) / 64);
            break;
          }
          this.put(ctx, p.tx[ci], sx, sy - h * 0.45, 0, w / 64, h / 64);
          if (!glowPass) {
            ctx.globalAlpha = (1 - t) ** 2;
            this.put(ctx, T.core, sx, sy - h * 0.4, 0, (w * 0.25) / 32, (h * 0.8) / 32);
          }
          break;
        }
        case 'arc':
          this.restore(ctx);
          this.drawArc(ctx, p, sx, sy, glowPass);
          break;
      }
    }
    ctx.globalCompositeOperation = op;
    ctx.globalAlpha = 1;
    this.restore(ctx);
  }

  // 新月形刀光：刀头在前一段时间里扫过 a0→a1（先快后慢），刀尾随后追上。
  // 画法：刀光条带素材（fx_blade_v1，ribbon.js）沿弧铺开 —— 外沿（刀尖扫过的那条）最亮，往圆心方向渐暗；
  // 尾巴是条带的旧端（散成光片），刀头是新端。素材没载好时不画（不再用代码画的纯色新月）
  drawArc(ctx, p, sx, sy, glowPass) {
    const age = p.max - p.life, T0 = p.max - 3;
    const head = easeOut(Math.min(1, age / Math.max(1, T0 * 0.4)));
    const tail = Math.max(0, (age - T0 * 0.25) / (T0 * 0.75 + 3)) ** 1.6;
    if (head - tail < 0.02) return;
    const img = ribbonTex(p.w >= 14 ? 'heavy' : 'light');
    if (!img) return;
    const fade = Math.min(1, (p.life / p.max) * 1.8);
    const SEG = 16, da = p.a1 - p.a0, outer = p.r0 + p.w * 0.25, inner = Math.max(2, p.r0 - p.w * 1.7);
    const pts = [];
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG, a = p.a0 + da * (tail + (head - tail) * u), c = Math.cos(a) * p.facing, sn = Math.sin(a);
      pts.push({ ox: sx + c * outer, oy: sy + sn * outer, ix: sx + c * inner, iy: sy + sn * inner, u });
    }
    drawRibbon(ctx, img, pts, p.color, fade * (glowPass ? 0.6 : 1), glowPass ? 0 : 0.55);
  }

  drawTexts(ctx, camX) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const t of this.texts) {
      const [sx, sy] = toScreen(t.x, t.y, t.z, camX);
      const age = t.max - t.life;
      const pop = age < 6 ? 1 + ((6 - age) / 6) * 0.8 : 1; // 出现时先放大再回弹
      ctx.globalAlpha = Math.min(1, t.life / 15);
      ctx.strokeStyle = 'rgba(16,6,10,.9)';
      ctx.lineWidth = 5;
      if (t.k === 'num') {
        const size = (t.crit ? 46 : 30) * pop;
        const s = String(t.value);
        ctx.save();
        ctx.translate(sx, sy);
        ctx.transform(1, 0, -0.16, 1, 0, 0); // 斜体，更有冲击感
        ctx.font = `600 ${size}px ${FONT_NUM}`;
        ctx.lineWidth = t.crit ? 5 : 4;
        ctx.strokeStyle = 'rgba(14,4,10,.92)';
        ctx.strokeText(s, 0, 0);
        const g = ctx.createLinearGradient(0, -size * 0.4, 0, size * 0.35);
        if (t.color) { g.addColorStop(0, '#ffb0b8'); g.addColorStop(1, t.color); }
        else if (t.crit) { g.addColorStop(0, '#fffbe0'); g.addColorStop(0.5, '#ffd65a'); g.addColorStop(1, '#ff7a2e'); }
        else { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c9c0dc'); }
        ctx.fillStyle = g;
        ctx.fillText(s, 0, 0);
        ctx.restore();
        if (t.crit) {
          ctx.font = `${18 * pop}px ${FONT_TITLE}`;
          ctx.lineWidth = 4;
          ctx.strokeText('暴击', sx, sy - size * 0.66);
          ctx.fillStyle = '#ffd65a';
          ctx.fillText('暴击', sx, sy - size * 0.66);
        }
      } else {
        ctx.font = `${t.size * pop}px ${FONT_TITLE}`;
        ctx.strokeText(t.text, sx, sy);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, sx, sy);
      }
    }
    ctx.restore();
  }
}
