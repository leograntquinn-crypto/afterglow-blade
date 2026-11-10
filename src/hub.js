import { FX_ART } from './fx_art.js';
import { GEAR_ART, gearGlyph } from './gear/art.js';
import { particleImg, PARTICLE_FOR_SERIES } from './wingfx.js';
import { compareItem, COMPARISON } from './gear/compare.js';
import { CATALOG } from './gear/catalog.js';
import { SERIES } from './gear/series.js';

// 角色页翅膀层（正面翼对主图 + 骨骼式两段挥动）：七大系列主图齐备（2048 宽，根点统一按中心列 alpha 质心实测）
// h/rootY 为素材像素尺寸与根点高度；mote 为该系列光点颜色（r,g,b）
const WING_ART = {
  dawn:     { src: 'assets/fx/wings_dawn_front.webp',     h: 300, rootY: 166, mote: '255,216,138' },
  wayfarer: { src: 'assets/fx/wings_wayfarer_front.webp', h: 309, rootY: 182, mote: '216,201,163' },
  frost:    { src: 'assets/fx/wings_frost_front.webp',    h: 298, rootY: 173, mote: '191,227,255' },
  ember:    { src: 'assets/fx/wings_ember_front.webp',    h: 301, rootY: 170, mote: '255,154,92' },
  storm:    { src: 'assets/fx/wings_storm_front.webp',    h: 304, rootY: 185, mote: '201,184,255' },
  blight:   { src: 'assets/fx/wings_blight_front.webp',   h: 303, rootY: 166, mote: '182,227,136' },
  thorn:    { src: 'assets/fx/wings_thorn_front.webp',    h: 310, rootY: 164, mote: '255,143,163' },
};
const WING_IMGS = {};
function wingImg(series) {
  const meta = WING_ART[series];
  if (!meta) return null;
  if (!WING_IMGS[series]) {
    const img = new Image();
    img.src = meta.src;
    WING_IMGS[series] = img;
  }
  const img = WING_IMGS[series];
  return img.complete && img.naturalWidth ? img : null;
}
// —— 翅膀样式款（v2 高幅量产主图）：稀有 r2 起按系列映射样式款，传说独立款用招牌样式；
// rig: segments 两段骨骼挥动 / whole 切片波浪（中央装饰跨中线不断裂） / strip 薄条流水 / orbit 悬浮律动
// period 一周期毫秒数；amp 扇幅倍率；scale 显示高度 = 人物高 × scale；rootFrac 根点纵向位置（中心列 alpha 质心实测）
const STYLE_ART = {
  cyber:    { rootFrac: 0.640, rig: 'segments', period: 2100, amp: 0.90, scale: 1.04, mote: '140,240,255' },
  holy:     { rootFrac: 0.673, rig: 'whole',    period: 2600, amp: 0.70, scale: 1.05, mote: '255,226,160' },
  shadow:   { rootFrac: 0.637, rig: 'segments', period: 2800, amp: 0.85, scale: 1.04, mote: '196,150,255' },
  butterfly:{ rootFrac: 0.621, rig: 'segments', period: 1500, amp: 0.62, scale: 0.96, mote: '255,170,220' },
  crystal:  { rootFrac: 0.633, rig: 'segments', period: 3000, amp: 0.50, scale: 1.03, mote: '190,170,255' },
  demon:    { rootFrac: 0.589, rig: 'segments', period: 3200, amp: 1.10, scale: 1.05, mote: '255,110,90' },
  peacock:  { rootFrac: 0.620, rig: 'whole',    period: 2700, amp: 0.60, scale: 1.00, mote: '120,255,205' },
  aurora:   { rootFrac: 0.640, rig: 'strip',    period: 3400, amp: 0.80, scale: 1.02, mote: '150,255,225' },
  thunder:  { rootFrac: 0.645, rig: 'whole',    period: 1100, amp: 0.45, scale: 1.03, mote: '205,185,255' },
  ocean:    { rootFrac: 0.634, rig: 'strip',    period: 3200, amp: 0.80, scale: 1.02, mote: '140,220,255' },
  meteor:   { rootFrac: 0.499, rig: 'orbit',    period: 4200, amp: 0.50, scale: 0.95, dyOff: 0.05, mote: '255,170,110' },
  moonlight:{ rootFrac: 0.542, rig: 'strip',    period: 3300, amp: 0.70, scale: 1.02, mote: '220,228,255' },
  sakura:   { rootFrac: 0.644, rig: 'segments', period: 2500, amp: 0.70, scale: 1.00, mote: '255,183,205' },
  bloodmoon:{ rootFrac: 0.580, rig: 'segments', period: 2900, amp: 0.60, scale: 1.04, mote: '255,120,140' },
  starship: { rootFrac: 0.632, rig: 'segments', period: 2400, amp: 0.55, scale: 0.97, mote: '140,235,255' },
  flame:    { rootFrac: 0.639, rig: 'strip',    period: 2300, amp: 0.90, scale: 1.03, mote: '255,160,90' },
  ice:      { rootFrac: 0.638, rig: 'segments', period: 2700, amp: 0.55, scale: 1.03, mote: '190,230,255' },
  clockwork:{ rootFrac: 0.622, rig: 'segments', period: 2250, amp: 0.80, scale: 0.99, mote: '255,205,130' },
  seraph:   { rootFrac: 0.650, rig: 'whole',    period: 2800, amp: 0.75, scale: 1.06, mote: '255,232,170' },
  phoenix:  { rootFrac: 0.637, rig: 'whole',    period: 2600, amp: 0.85, scale: 1.05, mote: '255,175,105' },
};
// 系列普通翅膀只有 r0–r3：r2/r3 穿样式款；其余样式（蝶舞/恶魔/月光/时钟朋克/圣骑/剑阵/龙翼/祥云/纸鸢）留作职业专属翼储备
const WING_STYLE_MAP = {
  dawn:   { 2: 'peacock', 3: 'seraph' },
  frost:  { 2: 'ice', 3: 'crystal' },
  ember:  { 2: 'flame', 3: 'meteor' },
  storm:  { 2: 'cyber', 3: 'starship' },
  blight: { 2: 'ocean', 3: 'shadow' },
  thorn:  { 2: 'sakura', 3: 'bloodmoon' },
};
const WING_STYLE_LG = { lg_chenxiyu: 'holy', lg_binglingyu: 'aurora', lg_jinhuoyi: 'phoenix', lg_leitingyi: 'thunder' };
function styleKeyFor(defId, def) {
  if (!def) return null;
  if (WING_STYLE_LG[defId]) return WING_STYLE_LG[defId];
  if (def.rar >= 2) return WING_STYLE_MAP[def.series]?.[def.rar] ?? null;
  return null;
}
const STYLE_IMGS = {};
function styleImg(key) {
  if (!key || !STYLE_ART[key]) return null;
  if (!STYLE_IMGS[key]) {
    const img = new Image();
    img.src = `assets/fx/wings_style_${key}.webp`;
    STYLE_IMGS[key] = img;
  }
  const img = STYLE_IMGS[key];
  return img.complete && img.naturalWidth ? img : null;
}
const COMP_IMGS = {};
function compImg(name) {
  if (!COMP_IMGS[name]) {
    const img = new Image();
    img.src = `assets/fx/wings_comp_${name}.webp`;
    COMP_IMGS[name] = img;
  }
  const img = COMP_IMGS[name];
  return img.complete && img.naturalWidth ? img : null;
}
const SHOWCASE_BGS = ['assets/fx/showcase_bg_starvault.webp', 'assets/fx/showcase_bg_altar.webp', 'assets/fx/showcase_bg_courtyard.webp'];
const SHOWCASE_IMGS = {};
function showcaseImg(src) {
  if (!SHOWCASE_IMGS[src]) {
    const img = new Image();
    img.src = src;
    SHOWCASE_IMGS[src] = img;
  }
  const img = SHOWCASE_IMGS[src];
  return img.complete && img.naturalWidth ? img : null;
}
// 连续曲面挥翅（单侧，2026-11-10 移植战斗版做法）：把半翼切成 14 条，沿「转角随弧长连续变化」的
// 曲线逐条仿射贴合——相邻条共享边缘、转角无跳变，没有两段式的接缝；相位滞后沿翼长连续分布成行波。
// angleAt(u)：u∈[0,1] 根→尖的转角（弧度）；点位方向 (dir·cosθ, sinθ)，与原两段式在根/尖处一致。
// sxRoot 为根部源 x，sxStep 为每条源宽（带符号：左翼为负，源图自中线向外）。
function drawWingHalfMesh(ctx, img, srcH, sxRoot, sxStep, dir, cx, cy, halfW, dispH, rootAbove, angleAt) {
  const N = 14, ds = halfW / N;
  const px = [cx], py = [cy], ths = [];
  let x = cx, y = cy;
  for (let i = 0; i < N; i++) {
    const th = angleAt((i + 0.5) / N);
    ths.push(th);
    x += dir * Math.cos(th) * ds;
    y += Math.sin(th) * ds;
    px.push(x); py.push(y);
  }
  const baseT = ctx.getTransform();
  const flip = sxStep < 0, sw = Math.abs(sxStep);
  for (let i = 0; i < N; i++) {
    const th = ths[i];
    const ux = dir * Math.sin(th), uy = -Math.cos(th);
    const t0x = px[i] + ux * rootAbove, t0y = py[i] + uy * rootAbove;
    const t1x = px[i + 1] + ux * rootAbove, t1y = py[i + 1] + uy * rootAbove;
    const b0x = px[i] - ux * (dispH - rootAbove), b0y = py[i] - uy * (dispH - rootAbove);
    const b1x = px[i + 1] - ux * (dispH - rootAbove), b1y = py[i + 1] - uy * (dispH - rootAbove);
    const sx = flip ? sxRoot + (i + 1) * sxStep : sxRoot + i * sxStep;
    const m = !flip
      ? [(t1x - t0x) * 1.05, (t1y - t0y) * 1.05, b0x - t0x, b0y - t0y, t0x, t0y]
      : [(t0x - t1x) * 1.05, (t0y - t1y) * 1.05, b1x - t1x, b1y - t1y, t1x, t1y];
    ctx.setTransform(baseT.multiply(new DOMMatrix(m)));
    ctx.drawImage(img, sx, 0, sw, srcH, 0, 0, 1, 1);
  }
  ctx.setTransform(baseT);
}
// 画一层样式翼：cx/cy 为根点（人物肩背），H 为人物高，ph 为该款周期相位（0..1），ampMul 为呼吸调制
function drawStyleWing(ctx, img, meta, cx, cy, H, ph, ampMul, scaleMul = 1) {
  const dispH = H * meta.scale * scaleMul;
  const dispW = dispH * (img.naturalWidth / img.naturalHeight);
  const x0 = cx - dispW / 2, y0 = cy - meta.rootFrac * dispH + (meta.dyOff ?? 0) * dispH;
  if (meta.rig === 'segments') {
    // 连续曲面变形（原两段骨骼在 55% 关节处会撕开楔形缝，2026-11-10 改）
    const half = img.naturalWidth / 2, halfW = dispW / 2;
    const angleAt = (u) => flapAngle(ph - 0.04 * u) * meta.amp * ampMul * Math.PI / 180;
    for (const dir of [-1, 1]) {
      drawWingHalfMesh(ctx, img, img.naturalHeight, half, dir * (half / 14), dir, cx, cy, halfW, dispH, meta.rootFrac * dispH, angleAt);
    }
    return;
  }
  if (meta.rig === 'orbit') {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.sin(ph * Math.PI * 2) * 0.02);
    const pulse = 1 + 0.012 * Math.sin(ph * Math.PI * 2 - 0.5);
    ctx.scale(pulse, pulse);
    ctx.translate(-cx, -cy);
    ctx.drawImage(img, x0, y0 + Math.sin(ph * Math.PI * 2 - 0.8) * 4 * ampMul, dispW, dispH);
    ctx.restore();
    return;
  }
  // whole / strip：纵向切片波浪位移——中央装饰不被扯裂，边缘流动幅度更大
  const N = meta.rig === 'strip' ? 18 : 12;
  const bob = Math.sin(ph * Math.PI * 2 - 0.8) * 3 * meta.amp * ampMul;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.sin(ph * Math.PI * 2) * 0.012 * meta.amp);
  ctx.translate(-cx, -cy);
  for (let i = 0; i < N; i++) {
    const f = i / N, fc = (i + 0.5) / N;
    const edge = Math.abs(fc - 0.5) * 2;
    const waveAmp = meta.rig === 'strip' ? 9 * Math.pow(edge, 1.4) : 2.6 * (0.35 + 0.65 * edge);
    const dy = Math.sin(ph * Math.PI * 2 + edge * 2.6) * waveAmp * ampMul + bob * (0.4 + 0.6 * edge);
    ctx.drawImage(img, f * img.naturalWidth, 0, img.naturalWidth / N + 1, img.naturalHeight,
      x0 + f * dispW, y0 + dy, dispW / N + 1, dispH);
  }
  ctx.restore();
}
// 画一层翼对（连续曲面挥动，2026-11-10 由两段骨骼改：原 55% 关节挥动时会撕开接缝）
function drawWingLayer(ctx, img, meta, cx, cy, W, scaleMul, ph, ampMul = 1) {
  const halfW = 0.643 * W * scaleMul, halfH = halfW * (meta.h / 1024);
  const rootOff = 0.044 * W * scaleMul, rootAbove = (meta.rootY / meta.h) * halfH;
  const angleAt = (u) => flapAngle(ph - 0.04 * u) * ampMul * Math.PI / 180;
  for (const dir of [-1, 1]) {
    drawWingHalfMesh(ctx, img, meta.h, 1024, dir * (1024 / 14), dir, cx + dir * rootOff, cy, halfW, halfH, rootAbove, angleAt);
  }
}
const FLAP_KEYS = [[0, -15], [0.16, -13], [0.40, 17], [0.50, 19], [0.72, 2], [1, -15]];
function flapAngle(ph) {
  ph = ((ph % 1) + 1) % 1;
  for (let i = 0; i < FLAP_KEYS.length - 1; i++) {
    const [p0, a0] = FLAP_KEYS[i], [p1, a1] = FLAP_KEYS[i + 1];
    if (ph >= p0 && ph <= p1) {
      let x = (ph - p0) / (p1 - p0);
      x = x * x * (3 - 2 * x);
      return a0 + (a1 - a0) * x;
    }
  }
  return -15;
}
const MOTE_SEEDS = Array.from({ length: 28 }, (_, i) => {
  const f = (n) => { const x = Math.sin(i * 127.1 + n * 74.7 + 311.7) * 43758.5453; return x - Math.floor(x); };
  return { off: f(1), dx: 0.5 + f(2) * 0.5, fall: 26 + f(3) * 54, drift: 8 + f(4) * 28, size: 1.6 + f(5) * 2.2, tw: f(6) * 6.28 };
});
// 营地菜单（HTML）：角色与装备 / 技能 / 委托，在大地图上随时打开（Esc、B 或右上角按钮）；
// 关卡、训练场、试炼的卡片在地图上走到对应地点时单独弹出（stageCard / trainingCard / trialCard）
// 菜单类界面用 HTML 比在 Canvas 里画方便得多：自带滚动、点击、文字排版、适配手机。
// 所有按钮用 data-act 属性标记，统一在 onClick 里处理（事件委托）。

import {
  RARITY, SLOT_KEYS, SLOT_NAME, STAT_INFO, MAX_ENH, fmtStat, itemStats, hydrateItem, canImprove, itemTitle, itemKind,
  enhCost, enhRate, sellPrice, WTYPES, MARKS, reforgeCost, reforgeAffix, inheritCost,
  duplicatesOf, reforgeAllWithDuplicate, graftAffix,
} from './items.js';
import { ATTRS, SKILL_TREE, BAG_MAX, xpToNext, skillCap, power, resetStats, resetSkills, MAX_LV } from './progression.js';
import { STAGES, DIFFS, isUnlocked, stageKey, diffUnlocked } from './stages.js';
import { CHALLENGES } from './training.js';
import { ensureContracts, isDone, contractText, contractReward, claimContract, rerollContract } from './contracts.js';
import { TYPES } from './enemy.js';
import { SKILLS } from './moves.js';
import { BOSSES } from './boss.js';
import { drawFighter } from './rig.js';
import { heroSprite } from './sprite.js';
import { sfx } from './audio.js';
import { music } from './music.js';

const canEngrave = it => !!it && it.rar >= 2 && !CATALOG[it.def]?.fixed &&
  !['wings', 'veil'].includes(CATALOG[it.def]?.kind);

export class Hub {
  constructor(game, root) {
    this.g = game;
    this.root = root;
    this.tab = 'hero';
    this.sel = null; // 选中的装备 id
    this.body = root.querySelector('#hub-body');
    this.modal = root.querySelector('#hub-modal');
    this.tooltip = document.createElement('div');
    this.tooltip.id = 'hub-gear-tooltip';
    this.tooltip.setAttribute('role', 'tooltip');
    this.tooltip.hidden = true;
    root.append(this.tooltip);
    this.statsLocked = false;
    this.statsHovered = false;
    this.finePointer = matchMedia('(pointer: fine)');
    root.addEventListener('mouseenter', e => {
      if (e.target.id === 'preview' && this.finePointer.matches) {
        this.statsHovered = true;
        this.updateStatsPop();
      }
    }, true);
    root.addEventListener('mouseleave', e => {
      if (e.target.id === 'preview') {
        this.statsHovered = false;
        this.updateStatsPop();
      }
    }, true);
    document.addEventListener('click', e => {
      if (e.target === this.preview) {
        this.statsLocked = !this.statsLocked;
        this.statsHovered = false;
      } else if (e.target.closest('.stats-pop') && !e.target.closest('button, a, input, select, textarea')) {
        // 锁定浮层盖住了立绘中部：点浮层的非交互区域等同于再点立绘，解除锁定
        this.statsLocked = false;
        this.statsHovered = false;
      } else if (!e.target.closest('.stats-pop')) {
        this.statsLocked = false;
        this.statsHovered = false;
      }
      this.updateStatsPop();
    }, true);
    root.addEventListener('mouseenter', e => {
      if (e.target.matches?.('.slots .slot, .bag .cell[data-act="sel"][data-id]')) this.showGearTooltip(e);
    }, true);
    root.addEventListener('mousemove', e => this.moveGearTooltip(e));
    root.addEventListener('mouseleave', e => {
      if (e.target === this.hoverTile || e.target === root) this.hideGearTooltip();
    }, true);
    for (const event of ['pointerdown', 'dragstart', 'wheel']) root.addEventListener(event, () => this.hideGearTooltip(), {capture: true, passive: true});
    document.addEventListener('scroll', () => this.hideGearTooltip(), {capture: true, passive: true});
    this.finePointer.addEventListener('change', () => this.hideGearTooltip());
    this.finePointer.addEventListener('change', () => {
      this.statsHovered = false;
      this.updateStatsPop();
    });
    window.addEventListener('resize', () => this.hideGearTooltip());
    this.toastEl = document.getElementById('hub-toast'); // 在 #hub 外面：地图上也要能弹提示
    root.addEventListener('click', (e) => this.onClick(e));
  }

  get save() { return this.g.save; }

  show() {
    this.statsLocked = this.statsHovered = false;
    this.root.hidden = false;
    this.render();
  }
  hide() {
    this.statsLocked = this.statsHovered = false;
    this.updateStatsPop();
    this.root.hidden = true;
    this.closeModal();
  }

  toast(text, color = '#e9e2d6') {
    const el = this.toastEl;
    el.textContent = text;
    el.style.color = color;
    el.classList.remove('show');
    void el.offsetWidth; // 重新触发动画
    el.classList.add('show');
  }

  // ---------------- 渲染 ----------------
  render() {
    this.hideGearTooltip();
    const s = this.save, S = this.g.stats;
    const need = xpToNext(s.lv);
    this.root.querySelector('#h-lv').textContent = s.lv;
    this.root.querySelector('.hname').textContent = heroSprite.ready ? '绯隼' : '残光剑士';
    this.root.querySelector('#h-xp').style.width = `${s.lv >= MAX_LV ? 100 : (s.xp / need) * 100}%`;
    this.root.querySelector('#h-xptext').textContent = s.lv >= MAX_LV ? '满级' : `${s.xp} / ${need}`;
    this.root.querySelector('#h-power').textContent = power(S).toLocaleString();
    this.root.querySelector('#h-gold').textContent = s.gold.toLocaleString();
    ensureContracts(s);
    this.root.querySelector('#h-stones').textContent = s.stones;
    this.root.querySelector('#h-sync').textContent = this.g.store.status === 'cloud' ? '云存档已同步' : '本地存档';
    this.root.querySelector('#h-music .sr-only').textContent = music.muted ? '音乐：关' : '音乐：开';
    this.root.querySelector('#h-music').classList.toggle('off', music.muted);
    this.root.querySelectorAll('[data-tab]').forEach((b) => {
      b.classList.toggle('on', b.dataset.tab === this.tab);
      const dot = (b.dataset.tab === 'hero' && s.statPts > 0) || (b.dataset.tab === 'skills' && this.canLearnAny());
      b.classList.toggle('dot', dot);
    });
    this.body.innerHTML = this[`render_${this.tab}`]();
    this.preview = this.body.querySelector('#preview');
    if (this.tab !== 'hero') this.statsLocked = false;
    this.statsHovered = !!this.preview && this.finePointer.matches && this.preview.matches(':hover');
    this.updateStatsPop();
    if (this.sel) this.renderModal();
  }

  updateStatsPop() {
    const pop = this.body.querySelector('.stats-pop');
    if (pop) {
      pop.hidden = !(this.statsLocked || this.statsHovered);
      pop.classList.toggle('is-locked', this.statsLocked);
    }
    this.preview?.setAttribute('aria-expanded', String(!!pop && !pop.hidden));
  }

  canLearnAny() {
    const s = this.save;
    return s.sp > 0 && SKILL_TREE.some((n) => s.skills[n.key] < skillCap(s, n));
  }

  // 训练场卡片（地图上走到练剑场时弹出）
  trainingCard() {
    const s = this.save, tDone = (s.training || []).length;
    return `<article class="stage training">
        <div class="stage-head"><h3>练剑场</h3><span class="rec">${tDone} / ${CHALLENGES.length}</span></div>
        <p>两个打不死的木人和 ${CHALLENGES.length} 条挑战：延迟连段、极限闪避、弹刀、受身、撞墙……每个机制做到一次就打勾。</p>
        <p class="meta">第一次完成每条挑战 +40 金币，全部完成再 +400</p>
        <div class="stage-foot"><span class="first">${tDone >= CHALLENGES.length ? '已出师' : '推荐新手先来'}</span><button class="btn primary" data-act="train" data-primary>进入训练</button></div>
      </article>`;
  }

  // 残光试炼卡片（地图上走到试炼碑时弹出）
  trialCard() {
    const s = this.save, open = !!s.cleared.s1;
    return `<article class="stage training trial ${open ? '' : 'locked'}">
        <div class="stage-head"><h3>残光试炼</h3><span class="rec">${s.trialBest ? `纪录 第 ${s.trialBest} 层 · 从第 ${s.trialBest} 层开始` : '未挑战'}</span></div>
        <p>一层一个房间，越往上越强、词缀越多，每 5 层一个首领。每过一层选择：继续往上，还是带着奖励离开？</p>
        <p class="meta">每层金币，每个首领层 1 颗刻印石 · 离开拿全部奖励，阵亡只拿一半 · 一层约一分钟</p>
        <div class="stage-foot"><span class="first">${open ? '适合碎片时间' : ''}</span>${open ? '<button class="btn primary" data-act="trial" data-primary>进入试炼</button>' : '<span class="lock">通关「墓穴入口」解锁</span>'}</div>
      </article>`;
  }

  // 关卡卡片（地图上走到关卡入口时弹出）：说明、首领、评价、难度
  stageCard(i) {
    const s = this.save, st = STAGES[i];
    const open = isUnlocked(s, i);
    const best = s.best[st.id];
    const kinds = [...new Set(st.pool.flat().map((t) => t.replace('*', '')))].map((t) => TYPES[t].name).join(' · ');
    const boss = BOSSES[st.boss];
    const under = s.lv < st.lv;
    return `<article class="stage ${open ? '' : 'locked'}">
        <div class="stage-head">
          <h3>${st.name}</h3>
          <span class="rec ${under ? 'warn' : ''}">推荐 Lv.${st.lv}</span>
        </div>
        <p>${st.desc}</p>
        <p class="meta">${st.rooms} 个房间 · ${kinds} · 精英</p>
        <p class="boss-line">首领 <b style="color:${boss.glow}">${boss.name}</b> <span>${boss.title}</span></p>
        <div class="stage-foot">
          ${best ? `<span class="grade g${best.letter}">${best.letter}</span>` : `<span class="first">首通奖励 ×3</span>`}
          ${open ? `<button class="btn primary" data-act="go" data-i="${i}" data-d="0" data-primary>出征</button>` : `<span class="lock">通关「${STAGES[i - 1].name}」解锁</span>`}
        </div>
        ${s.cleared[st.id] ? `<div class="diffs">${DIFFS.slice(1).map((D, k) => {
          const d = k + 1, ok = diffUnlocked(s, i, d), b = s.best[stageKey(st, d)];
          return `<button class="btn diff" style="--dc:${D.color}" data-act="go" data-i="${i}" data-d="${d}" ${ok ? '' : 'disabled'} title="${ok ? `推荐 Lv.${st.lv + D.lvAdd}` : `通关「${DIFFS[d - 1].name}」解锁`}">
            ${D.name}${b ? ` <b class="g${b.letter}">${b.letter}</b>` : ok ? ` <small>Lv.${st.lv + D.lvAdd}</small>` : ' <small>未解锁</small>'}</button>`;
        }).join('')}</div>` : ''}
      </article>`;
  }

  // 委托：三张目标卡。进度在出征中累计，完成后在这里领取
  render_contracts() {
    const s = this.save, B = ensureContracts(s);
    const cards = B.list.map((c) => {
      const done = isDone(c), r = contractReward(c, s.lv);
      const btn = c.claimed ? '<span>已领取 · 明天补上新委托</span>'
        : done ? `<button class="btn primary" data-act="claim" data-id="${c.id}">领取</button>`
        : `<button class="btn ghost" data-act="reroll" data-id="${c.id}" ${B.rerolls > 0 ? '' : 'disabled'} title="每天可以免费换一次">换一个</button>`;
      return `<article class="contract ${c.claimed ? 'claimed' : done ? 'done' : ''}">
        <p>${contractText(c)}</p>
        <div class="bar"><i style="width:${(c.prog / c.n) * 100}%"></i></div>
        <div class="cfoot"><span>${c.prog} / ${c.n} · 刻印石 <b>×${r.stones}</b> · 金币 ${r.gold}</span>${btn}</div>
      </article>`;
    }).join('');
    return `<section class="contracts">
      <div class="contracts-head"><h3>委托</h3><small>在出征中完成（训练场不算）· 领过的格子明天补上，没完成的不会过期 · 今天还能免费换 ${B.rerolls} 次</small></div>
      <div class="clist">${cards}</div>
    </section>`;
  }

  render_hero() {
    if (!GEAR_ART.ready && !GEAR_ART.loading) GEAR_ART.load().then((ready) => {
      if (ready && !this.root.hidden && this.tab === 'hero' && this.g.scene !== 'play') this.render();
    });
    const s = this.save, S = this.g.stats;
    const slots = ['weapon','helm','chest','legs','boots','bracers','wings','veil','trinket1','trinket2'].map((k, i) => {
      const it = s.equip[k];
      return `<button class="slot ${it ? `r${it.rar}` : 'empty'}" data-act="sel" data-id="${it ? it.id : ''}" data-slot="${k}" style="--slot-row:${i % 5 + 1};--slot-col:${i < 5 ? 1 : 3}" aria-label="${SLOT_NAME[k]}${it ? `：${itemTitle(it)}` : `（空）`}" ${it ? '' : 'disabled'}>
        <span class="glyph">${it ? gearGlyph(it) : ''}</span>
      </button>`;
    }).join('');
    const marks = [...S.marks].map((k) => `<div class="mk"><b>${MARKS[k].name}</b><span>${MARKS[k].desc}</span></div>`).join('');
    const rows = [
      ['攻击力', Math.round(S.atk)], ['生命', S.maxHp], ['魔力', S.maxMp], ['防御', Math.round(S.def)],
      ['暴击率', `${(S.crit * 100).toFixed(1)}%`], ['暴击伤害', `${Math.round(S.critDmg * 100)}%`], ['冷却缩减', `${(S.cdr * 100).toFixed(1)}%`],
    ].map(([a, b]) => `<div class="kv"><span>${a}</span><b>${b}</b></div>`).join('');
    const attrs = ATTRS.map((a) => `<div class="attr">
        <div><span class="aname">${a.name}</span> <b>${S[a.key]}</b><small>${a.hint}</small></div>
        <button class="btn mini" data-act="stat" data-k="${a.key}" ${s.statPts > 0 ? '' : 'disabled'} aria-label="${a.name}加一点">+</button>
      </div>`).join('');
    const bag = s.bag.map((it) => {
      const cmp = compareItem(s,it), label = COMPARISON[cmp.verdict];
      return `<button class="cell r${it.rar}" data-act="sel" data-id="${it.id}" aria-label="${itemTitle(it)}">
        <span class="glyph">${gearGlyph(it)}</span>${it.enh ? `<i class="enh">+${it.enh}</i>` : ''}<i class="up" style="color:${label.color}">${label.symbol}</i>${it.mark ? '<i class="mk-dot"></i>' : ''}${it.locked ? '<i class="lk">🔒</i>' : ''}
      </button>`;
    }).join('') + '<span class="cell blank"></span>'.repeat(Math.max(0, 12 - s.bag.length));

    return `<div class="hero">
      <section class="panel figure artframe">
        <canvas id="preview" width="440" height="460" aria-label="角色外观预览" aria-controls="hero-stats" aria-expanded="false"></canvas>
        <div class="slots">${slots}</div>
        <div class="showctl" role="group" aria-label="展示设置">
          ${[['-1', '原景'], ['0', '星穹'], ['1', '祭坛'], ['2', '晨光']].map(([v, n]) => `<button class="btn ghost mini-text" data-act="showbg" data-v="${v}" ${String(s.showcaseBg ?? 0) === v ? 'style="border-color:#ffd65a;color:#ffd65a"' : ''}>${n}</button>`).join('')}
          <button class="btn ghost mini-text" data-act="halomode" title="圣光审判的光环位置：头顶悬浮 / 背后竖立">${(s.showcaseHalo ?? 'head') === 'head' ? '光环·头顶' : '光环·背立'}</button>
        </div>
      <div class="stats-pop" id="hero-stats" hidden>
      <section class="panel">
        <h4>属性</h4>
        <div class="kvs">${rows}</div>
        <div class="marks"><h4>刻印 · 装备效果 <small>${S.marks.size ? '' : '稀有、传说装备可能带有刻印，在你做到某件事时生效'}</small></h4>${marks}</div>
        <div class="attr-head"><h4>属性点</h4><span class="pts">${s.statPts > 0 ? `可分配 <b>${s.statPts}</b>` : '升级获得 3 点'}</span></div>
        ${attrs}
        <button class="btn ghost" data-act="resetStats">重置属性点（免费）</button>
      </section>
      </div>
      </section>
      <section class="panel artframe">
        <div class="attr-head"><h4>背包 <small>${s.bag.length} / ${BAG_MAX}</small></h4>
          <span class="bag-tools"><button class="btn ghost mini-text" data-act="sort">整理</button><button class="btn ghost mini-text" data-act="sellJunk" data-r="0">出售普通</button><button class="btn ghost mini-text" data-act="sellJunk" data-r="1" title="不包括锁定、强化过、带刻印的装备">出售精良及以下</button></span>
        </div>
        <div class="bag">${bag}</div>
        ${s.bag.length ? '' : '<p class="hint">打倒敌人会掉落装备，出现光柱的就是。品质：<span style="color:#d8d3c8">普通</span> <span style="color:#4fa3ff">精良</span> <span style="color:#b46bff">稀有</span> <span style="color:#ff9a2e">传说</span></p>'}
      </section>
    </div>`;
  }

  render_skills() {
    const s = this.save;
    const cards = SKILL_TREE.map((n) => {
      const lvl = s.skills[n.key], cap = skillCap(s, n);
      const locked = s.lv < n.unlock;
      const can = !locked && s.sp > 0 && lvl < cap;
      const sk = n.active ? SKILLS[n.key] : null;
      const tag = n.active ? `<span class="key">${n.keyLabel}</span>主动 · 魔力 ${sk.mp} · 冷却 ${(sk.cd / 60).toFixed(1)}s` : '被动';
      const capNote = locked ? `Lv.${n.unlock} 解锁` : lvl >= n.max ? '已满级' : lvl >= cap ? `Lv.${n.unlock + lvl} 可继续升级` : '';
      return `<article class="skill ${locked ? 'locked' : ''}">
        <span class="sk-glyph">${n.glyph}</span>
        <div class="sk-body">
          <div class="sk-head"><h3>${n.name}</h3><span class="sk-lv">${lvl} / ${n.max}</span></div>
          <p class="sk-tag">${tag}</p>
          <p>${n.desc}</p>
          <p class="sk-per">每级：${n.per}</p>
        </div>
        <div class="sk-act">
          <button class="btn mini" data-act="skill" data-k="${n.key}" ${can ? '' : 'disabled'} aria-label="升级${n.name}">+</button>
          ${capNote ? `<small>${capNote}</small>` : ''}
        </div>
      </article>`;
    }).join('');
    return `<div class="skills-top"><span>剩余技能点 <b>${s.sp}</b>（每升 1 级获得 1 点）</span><button class="btn ghost" data-act="resetSkills">重置技能（免费）</button></div><div class="skills">${cards}</div>`;
  }

  // 悬停内容仅在进入瓷砖时生成；逐帧预览不参与浮层生命周期。
  hideGearTooltip() {
    this.tooltip.hidden = true;
    this.hoverTile = null;
  }

  showGearTooltip(e) {
    if (!this.finePointer.matches || !this.modal.hidden || this.root.hidden || this.tab !== 'hero') return;
    const tile = e.target, found = this.findItem(tile.dataset.id);
    if (!found && !tile.dataset.slot) return;
    this.hoverTile = tile;
    if (!found) {
      this.tooltip.textContent = `${SLOT_NAME[tile.dataset.slot]} · 空`;
    } else {
      const {it, equipped} = found, def = CATALOG[it.def];
      // 与详情一致：基础属性先去除词条再经 itemStats / fmtStat 格式化。
      const base = itemStats(hydrateItem({...it, affix: []}));
      const comparison = equipped ? null : compareItem(this.save, it);
      const label = comparison && COMPARISON[comparison.verdict];
      this.tooltip.innerHTML = `<b style="color:${RARITY[it.rar].color}">${itemTitle(it)}</b>
        <div>${itemKind(it)} · ${SERIES[def?.series]?.name || def?.series || '无'} · 物品等级 ${it.ilvl} · 强化 +${it.enh}</div>
        <ul>${Object.keys(it.base).map(k => `<li class="tooltip-stat">${STAT_INFO[k][0]} ${fmtStat(k, base[k])}</li>`).join('')}
        ${it.affix.map(a => `<li>${STAT_INFO[a.k][0]} +${fmtStat(a.k, a.v)}</li>`).join('')}</ul>
        <div>刻印：${MARKS[it.mark]?.name || '无'}${it.mark ? '（条件型）' : ''}</div>
        ${def ? `<div>状态：${def.imbue || '无'} ${it.imbueLv || 0} 档（条件型）</div><div>套装：${SERIES[def.set]?.name || def.set || '无'}</div>` : ''}
        ${comparison ? `<div style="color:${label.color}">${label.symbol} ${label.text}（${comparison.total.toFixed(1)}%） · 对比${SLOT_NAME[comparison.slot]} · 折算 +${comparison.enhAs}</div>` : ''}`;
    }
    this.tooltip.hidden = false;
    const rect = this.tooltip.getBoundingClientRect();
    this.tooltipSize = {width: rect.width, height: rect.height};
    this.moveGearTooltip(e);
  }

  moveGearTooltip(e) {
    if (this.tooltip.hidden) return;
    const {width, height} = this.tooltipSize, gap = 14, margin = 8;
    let x = e.clientX + gap, y = e.clientY + gap;
    if (x + width > innerWidth - margin) x = e.clientX - width - gap;
    if (y + height > innerHeight - margin) y = e.clientY - height - gap;
    x = Math.max(margin, Math.min(x, innerWidth - width - margin));
    y = Math.max(margin, Math.min(y, innerHeight - height - margin));
    this.tooltip.style.transform = `translate(${x}px, ${y}px)`;
  }

  // compareSlot 是饰品详情留下的界面提示，可能与当前物品槽位不符；
  // 传给 compareItem 前先校验，不符则回退默认选槽（compareItem 对不匹配槽位会抛错）。
  cmpSlotFor(it) {
    const slot = CATALOG[it.def]?.slot || it.slot;
    const slots = slot === 'trinket' ? ['trinket1', 'trinket2'] : [slot];
    return slots.includes(this.compareSlot) ? this.compareSlot : undefined;
  }

  // ---------------- 装备详情弹窗 ----------------
  findItem(id) {
    const s = this.save;
    for (const k of SLOT_KEYS) if (s.equip[k]?.id === id) return { it: s.equip[k], equipped: true, slot: k };
    const it = s.bag.find((x) => x.id === id);
    return it ? { it, equipped: false } : null;
  }

  renderModal() {
    for (const tile of this.root.querySelectorAll('.slot[data-id], .cell[data-id]')) {
      tile.classList.toggle('is-selected', tile.dataset.id === this.sel);
    }
    this.hideGearTooltip();
    const f = this.findItem(this.sel);
    if (!f) return this.closeModal();
    const { it, equipped } = f;
    const s = this.save, R = RARITY[it.rar];
    // 词条嫁接：三步——选重复件 → 选词条 → （词条满时）选替换目标
    if (this.graft && !canImprove(it)) this.graft = null;
    if (this.graft) {
      const allDups = duplicatesOf(s, it);
      const gdups = allDups.filter(d=>d.affix.length);
      let dup = this.graft.dupId ? allDups.find(x=>x.id===this.graft.dupId) : null;
      if (this.graft.dupId && !dup) { this.graft = {}; dup = null; }
      let body = '';
      if (!dup) {
        body = gdups.length ? `<p class="isub">选择要消耗的重复件（背包里有 ${gdups.length} 件带词条的同名装备）</p><div class="engrave-list">${gdups.map(d=>`<button class="btn" data-act="graftDup" data-id="${d.id}"><b>${itemTitle(d)}</b><span>物品等级 ${d.ilvl} · ${d.affix.map(a=>`${STAT_INFO[a.k][0]} +${fmtStat(a.k,a.v)}`).join(' / ')}</span></button>`).join('')}</div>`
          : '<p class="isub">背包里没有带词条的同名重复件。</p>';
      } else if (this.graft.srcIdx == null) {
        body = `<p class="isub">从重复件「${itemTitle(dup)}」上选一条要搬过来的词条（同类词条不能重复）</p><div class="engrave-list">${dup.affix.map((a,i)=>{ const has = it.affix.some(x=>x.k===a.k); return `<button class="btn" data-act="graftSrc" data-i="${i}" ${has ? 'disabled' : ''}><b>${STAT_INFO[a.k][0]} +${fmtStat(a.k,a.v)}</b><span>${has ? '这件已有同类词条' : '来自重复件 · 物品等级 ' + dup.ilvl}</span></button>`; }).join('')}</div>`;
      } else {
        const src = dup.affix[this.graft.srcIdx];
        const maxA = RARITY[it.rar].affixes || 0;
        body = it.affix.length < maxA
          ? `<p class="isub">这件还有词条空位（${it.affix.length}/${maxA}），可以直接追加「${STAT_INFO[src.k][0]} +${fmtStat(src.k, src.v)}」，消耗重复件 1 件</p><div class="actions"><button class="btn primary" data-act="graftGo">确认嫁接</button></div>`
          : `<p class="isub">这件词条已满，选择一条要被「${STAT_INFO[src.k][0]} +${fmtStat(src.k, src.v)}」替换掉的词条</p><div class="engrave-list">${it.affix.map((a,i)=>`<button class="btn" data-act="graftGo" data-dst="${i}"><b>${STAT_INFO[a.k][0]} +${fmtStat(a.k,a.v)}</b><span>将被替换</span></button>`).join('')}</div>`;
      }
      this.modal.innerHTML = `<div class="sheet wide" role="dialog" aria-label="词条嫁接">
        <div class="card-head"><span class="glyph big r${it.rar}">${gearGlyph(it)}</span>
          <div><h3 style="color:${R.color}">词条嫁接 · ${itemTitle(it)}</h3><p class="isub">消耗 1 件同名重复装备，把它的词条搬到这件上</p></div>
          <button class="close" data-act="close" aria-label="关闭">×</button></div>
        ${body}
        <div class="actions"><button class="btn ghost" data-act="graftCancel">返回</button></div>
      </div>`;
      this.modal.hidden = false;
      return;
    }
    // 铭刻：八选一，覆盖原来的刻印
    if (this.engrave && !canEngrave(it)) this.engrave = false;
    if (this.engrave) {
      const list = Object.entries(MARKS).map(([k, M]) => `<button class="btn" data-act="engraveMark" data-k="${k}" ${it.mark === k ? 'disabled' : ''}>
          <b>${M.name}${it.mark === k ? '（当前）' : ''}</b><span>${M.desc}</span><small>适合：${M.style}</small></button>`).join('');
      this.modal.innerHTML = `<div class="sheet wide" role="dialog" aria-label="铭刻">
        <div class="card-head"><span class="glyph big r${it.rar}">${gearGlyph(it)}</span>
          <div><h3 style="color:${R.color}">铭刻 · ${itemTitle(it)}</h3><p class="isub">消耗 1 颗刻印石，指定一条刻印${it.mark ? `（覆盖原来的「${MARKS[it.mark].name}」）` : ''} · 剩余 ${s.stones} 颗</p></div>
          <button class="close" data-act="close" aria-label="关闭">×</button></div>
        <div class="engrave-list">${list}</div>
        <div class="actions"><button class="btn ghost" data-act="engraveCancel">返回</button></div>
      </div>`;
      this.modal.hidden = false;
      return;
    }
    const comparison = equipped ? null : compareItem(s,it,{slot:this.cmpSlotFor(it)});
    const cur = comparison?.against;
    const allowed = canImprove(it);
    const mine = itemStats(hydrateItem({...it,enh:comparison?.enhAs ?? it.enh,affix:[]})), other = cur ? itemStats(hydrateItem({...cur,enh:comparison.enhAs,affix:[]})) : {};
    const keys = Object.keys(it.base);
    const statRows = keys.map((k) => {
      const d = mine[k] - (other[k] || 0);
      const diff = cur && Math.abs(d) > 1e-6 ? `<em class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${fmtStat(k, d)}</em>` : '';
      return `<li><span>${STAT_INFO[k][0]}</span><b>${fmtStat(k, mine[k])}</b>${diff}</li>`;
    }).join('');
    // 词条：每条后面有「重铸」，花金币把它换成另一种属性
    const rc = reforgeCost(it);
    const affix = it.affix.map((a, i) => `<li class="affix">${STAT_INFO[a.k][0]} +${fmtStat(a.k, a.v)}<button class="btn ghost mini-text reforge" data-act="reforge" data-i="${i}" ${s.gold >= rc ? '' : 'disabled'} title="把这条换成另一种属性 · ${rc} 金币">重铸</button></li>`).join('');
    // 传承：同部位正在穿的装备强化得更高 → 可以把强化等级转到这件上
    const inh = allowed && !equipped && cur && cur.enh > it.enh ? inheritCost(it, cur) : 0;
    const label = comparison && COMPARISON[comparison.verdict];
    const effectText = x => x ? `${x.affix.map(a=>`${STAT_INFO[a.k][0]} +${fmtStat(a.k,a.v)}`).join(' / ') || '无词条'}；刻印：${MARKS[x.mark]?.name || '无'}${x.mark ? '（条件型）' : ''}` : '—';
    const buffText = x => { const d=CATALOG[x?.def]; return d ? `状态：${d.imbue || '无'} ${x.imbueLv || 0} 档（条件型）；套装：${SERIES[d.set]?.name || d.set || '无'}` : '—'; };
    const explanation = comparison?.reasons.map(r=>r.id==='ilvl' ? `物品等级 ${r.delta>0?'+':''}${r.delta}` : r.id==='setCount' ? `${SERIES[r.set]?.name || r.set} ${r.from}→${r.to} 件` : r.id==='conditionalMark' ? `刻印「${MARKS[r.mark]?.name || r.mark}」（条件型）` : `${r.change==='before'?'换下':'换上'}状态「${r.status}」${r.lv} 档（条件型）`).join('；');
    const compare = equipped ? '<p class="cmp same">已穿戴</p>' : `
      ${it.slot==='trinket' ? ['trinket1','trinket2'].map(slot=>`<button class="btn ghost" data-act="compareSlot" data-slot="${slot}">对比${SLOT_NAME[slot]}</button>`).join('') : ''}
      <p>折算：都按 +${comparison.enhAs} · 对比${SLOT_NAME[comparison.slot]}</p>
      <table><tr><th></th><th>新：${it.name}</th><th>身上：${cur ? itemTitle(cur) : '空'}</th></tr>
      <tr><td>基础</td><td>${Object.keys(mine).map(k=>`${STAT_INFO[k][0]} ${fmtStat(k,mine[k])}`).join(' / ')}；物品等级 ${it.ilvl}</td><td>${Object.keys(other).map(k=>`${STAT_INFO[k][0]} ${fmtStat(k,other[k])}`).join(' / ')}；物品等级 ${cur?.ilvl || 0}</td></tr>
      <tr><td>效果</td><td>${effectText(it)}</td><td>${effectText(cur)}</td></tr>
      <tr><td>buff</td><td>${buffText(it)}</td><td>${buffText(cur)}</td></tr></table>
      <p class="cmp" style="color:${label.color}">${label.symbol} ${label.text}（${comparison.total.toFixed(1)}%） · 基础 ${comparison.parts.base.toFixed(1)}% · 效果 ${comparison.parts.effect.toFixed(1)}% · buff ${comparison.parts.buff.toFixed(1)}%</p><p class="hint">${explanation}</p>`;
    const dups = allowed ? duplicatesOf(s, it) : [];
    const cost = enhCost(it);
    const enhBtn = !allowed ? '<button class="btn" disabled title="翅膀 / 光幕固定攻击 +10，不能强化">不能强化：固定攻击 +10</button>' : it.enh >= MAX_ENH ? '<button class="btn" disabled>已强化到 +10</button>'
      : `<button class="btn" data-act="enhance" ${s.gold >= cost ? '' : 'disabled'}>强化 +${it.enh + 1} · 成功率 ${Math.round(enhRate(it) * 100)}% · ${cost} 金币</button>`;
    this.modal.innerHTML = `<div class="sheet artframe" role="dialog" aria-label="${itemTitle(it)}">
      <div class="card-head">
        <span class="glyph big r${it.rar}">${gearGlyph(it)}</span>
        <div><h3 style="color:${R.color}">${itemTitle(it)}</h3><p class="isub">${R.name} · ${itemKind(it)} · 物品等级 ${it.ilvl}</p></div>
        <button class="close" data-act="close" aria-label="关闭">×</button>
      </div>
      <ul class="istats">${statRows}${affix}</ul>
      ${it.affix.length ? `<p class="hint reforge-hint">重铸一条词条：${rc} 金币${it.reforged ? `（已重铸 ${it.reforged} 次，每次贵 50%）` : '（每重铸一次贵 50%）'}</p>` : ''}
      ${it.slot === 'weapon' ? `<p class="school">流派「${WTYPES[it.wtype].school}」${WTYPES[it.wtype].schoolDesc}</p>` : ''}
      ${it.mark && MARKS[it.mark] ? `<p class="mark">刻印「${MARKS[it.mark].name}」${MARKS[it.mark].desc}<small>适合：${MARKS[it.mark].style}${!equipped && this.g.stats.marks.has(it.mark) ? ' · 身上已有同名刻印，不叠加' : ''}</small></p>` : ''}
      ${compare}
      ${!allowed ? '<p class="hint">翅膀 / 光幕固定攻击 +10，不能强化、重铸、传承。</p><button class="btn" disabled>不能重铸：固定属性</button><button class="btn" disabled>不能传承：固定属性</button>' : ''}
      <div class="actions">
        ${equipped ? `<button class="btn" data-act="unequip">卸下</button>` : it.slot === 'trinket' ? ['trinket1','trinket2'].map((slot) => `<button class="btn primary" data-act="equip" data-slot="${slot}">穿戴至${SLOT_NAME[slot]}</button>`).join('') : `<button class="btn primary" data-act="equip">穿戴</button>`}
        ${enhBtn}
        ${inh ? `<button class="btn" data-act="inherit" ${s.gold >= inh ? '' : 'disabled'} title="把「${itemTitle(cur)}」的强化等级转到这件上，旧装备变回 +0">传承 +${cur.enh} 强化 · ${inh} 金币</button>` : ''}
        ${canEngrave(it) ? `<button class="btn" data-act="engrave" ${s.stones > 0 ? '' : 'disabled'} title="完成委托获得刻印石">铭刻刻印 · 刻印石 ×1（剩 ${s.stones}）</button>` : ''}
        ${allowed && it.affix.length && dups.length ? `<button class="btn" data-act="dupReforge" title="消耗背包里等级最低的 1 件同名重复装备，免费把这件的全部词条重随一次">同名重铸 · 消耗重复件 ×1（有 ${dups.length} 件）</button>` : ''}
        ${allowed && dups.some(d=>d.affix.length) ? `<button class="btn" data-act="graft" title="消耗 1 件同名重复装备，把它的一条词条搬到这件上">词条嫁接 · 消耗重复件 ×1</button>` : ''}
        <button class="btn ghost" data-act="lock">${it.locked ? '🔒 已锁定（点击解锁）' : '锁定（批量出售时跳过）'}</button>
        ${equipped ? '' : `<button class="btn ghost" data-act="sell" ${it.locked ? 'disabled' : ''}>出售 · ${sellPrice(it)} 金币</button>`}
      </div>
      <p class="hint">强化失败只扣金币，装备不会损坏。每级强化让基础属性 +8%，+7 起武器会发出脉动的光。</p>
    </div>`;
    this.modal.hidden = false;
  }

  closeModal() {
    for (const tile of this.root.querySelectorAll('.is-selected')) tile.classList.remove('is-selected');
    this.sel = null;
    this.engrave = false;
    this.graft = null;
    this.modal.hidden = true;
    this.modal.innerHTML = '';
  }

  // ---------------- 交互 ----------------
  onClick(e) {
    if (e.target === this.modal) return this.closeModal(); // 点弹窗外部关闭
    const el = e.target.closest('[data-act], [data-tab]');
    if (!el || el.disabled) return;
    const s = this.save;
    if (el.dataset.tab) {
      this.tab = el.dataset.tab;
      sfx('click');
      return this.render();
    }
    const act = el.dataset.act;
    const commit = () => { this.g.refreshStats(); this.g.store.save(); this.render(); };

    switch (act) {
      case 'showbg':
        s.showcaseBg = parseInt(el.dataset.v, 10);
        sfx('click');
        commit();
        return;
      case 'halomode':
        s.showcaseHalo = (s.showcaseHalo ?? 'head') === 'head' ? 'back' : 'head';
        sfx('click');
        commit();
        return;
      case 'settings':
        sfx('click');
        this.g.openSettings();
        return;
      case 'story':
        sfx('click');
        this.g.openStoryLog();
        return;
      case 'claim': {
        const r = claimContract(s, el.dataset.id);
        if (!r) return;
        sfx('chest');
        commit();
        this.toast(`获得 刻印石 ×${r.stones}、金币 ${r.gold}`, '#c99bff');
        return;
      }
      case 'reroll':
        if (rerollContract(s, el.dataset.id)) { sfx('click'); commit(); }
        return;
      case 'engrave':
        if (!canEngrave(this.findItem(this.sel)?.it)) return false;
        this.engrave = true;
        sfx('click');
        return this.renderModal();
      case 'engraveCancel':
        this.engrave = false;
        return this.renderModal();
      case 'graft':
        if (!canImprove(this.findItem(this.sel)?.it)) return false;
        this.graft = {};
        sfx('click');
        return this.renderModal();
      case 'graftCancel':
        this.graft = null;
        return this.renderModal();
      case 'go': {
        sfx('click');
        const i = +el.dataset.i, d = +(el.dataset.d || 0);
        this.g.launch(() => this.g.startStage(i, d, true)); // 从地图出征：播剧情
        return;
      }
      case 'trial':
        sfx('click');
        this.g.launch(() => this.g.startTrial());
        return;
      case 'train':
        sfx('click');
        this.g.launch(() => this.g.startTraining());
        return;
      case 'close-hub':
        sfx('click');
        this.g.closeMenu();
        return;
      case 'compareSlot':
        this.compareSlot = el.dataset.slot;
        this.renderModal();
        return;
      case 'sel':
        this.compareSlot = undefined;
        this.sel = el.dataset.id;
        this.engrave = false;
        sfx('click');
        return this.renderModal();
      case 'close':
        return this.closeModal();
      case 'music':
        music.start();
        music.toggleMute();
        return this.render();
      case 'stat':
        if (s.statPts > 0) { s.statPts--; s.stats[el.dataset.k]++; sfx('click'); commit(); }
        return;
      case 'resetStats':
        resetStats(s); commit(); this.toast('属性点已全部返还');
        return;
      case 'skill': {
        const n = SKILL_TREE.find((x) => x.key === el.dataset.k);
        if (s.sp > 0 && s.skills[n.key] < skillCap(s, n)) { s.sp--; s.skills[n.key]++; sfx('click'); commit(); }
        return;
      }
      case 'resetSkills':
        resetSkills(s); commit(); this.toast('技能点已全部返还');
        return;
      case 'sort':
        s.bag.sort((a, b) => SLOT_KEYS.indexOf(a.slot==='trinket'?'trinket1':a.slot) - SLOT_KEYS.indexOf(b.slot==='trinket'?'trinket1':b.slot) || compareItem(s,b).total - compareItem(s,a).total);
        commit();
        return;
      case 'sellJunk': {
        // 批量出售：只卖这个品质及以下、没锁定、没强化、没刻印的
        const maxR = +(el.dataset.r || 0);
        const junk = s.bag.filter((it) => it.rar <= maxR && it.enh === 0 && !it.locked && !it.mark);
        if (!junk.length) return this.toast(maxR ? '没有可以出售的精良及以下装备' : '没有可以出售的普通装备');
        const gold = junk.reduce((a, it) => a + sellPrice(it), 0);
        s.bag = s.bag.filter((it) => !junk.includes(it));
        s.gold += gold;
        sfx('coin');
        commit();
        this.toast(`出售 ${junk.length} 件，获得 ${gold} 金币`, '#ffd65a');
        return;
      }
    }

    // 以下操作针对弹窗里的装备
    const f = this.findItem(this.sel);
    if (!f) return;
    const { it, equipped } = f;
    if (act === 'graftDup') {
      if (this.graft) { this.graft.dupId = el.dataset.id; this.graft.srcIdx = null; sfx('click'); }
      return this.renderModal();
    }
    if (act === 'graftSrc') {
      if (this.graft) { this.graft.srcIdx = +el.dataset.i; sfx('click'); }
      return this.renderModal();
    }
    if (act === 'graftGo') {
      const dup = this.graft?.dupId ? s.bag.find(x=>x.id===this.graft.dupId) : null;
      const srcA = dup?.affix?.[this.graft?.srcIdx];
      const dst = el.dataset.dst != null ? +el.dataset.dst : null;
      if (dup && srcA && graftAffix(s, it, dup, this.graft.srcIdx, dst)) {
        this.graft = null;
        sfx('enhance');
        commit();
        this.toast(`嫁接完成：${STAT_INFO[srcA.k][0]} +${fmtStat(srcA.k, srcA.v)}`, '#7ff3ff');
      }
      return;
    }
    if (act === 'dupReforge') {
      const dup = duplicatesOf(s, it).slice().sort((a, b)=>a.ilvl - b.ilvl)[0];
      if (dup && reforgeAllWithDuplicate(s, it, dup)) {
        sfx('enhance');
        commit();
        this.toast('同名重铸完成：全部词条已重随', '#7ff3ff');
      }
      return;
    }
    if (act === 'equip') {
      const target = it.slot === 'trinket' ? el.dataset.slot : it.slot;
      if (!SLOT_KEYS.includes(target) || (it.slot === 'trinket' && !['trinket1','trinket2'].includes(target))) return;
      const old = s.equip[target];
      s.bag = s.bag.filter((x) => x !== it);
      if (old) s.bag.push(old);
      s.equip[target] = it;
      sfx('pickup');
      this.closeModal();
      commit();
      this.toast(`已穿戴 ${itemTitle(it)}`, RARITY[it.rar].color);
    } else if (act === 'unequip') {
      if (s.bag.length >= BAG_MAX) return this.toast('背包已满');
      s.equip[f.slot] = null;
      s.bag.push(it);
      this.closeModal();
      commit();
    } else if (act === 'engraveMark') {
      if (!canEngrave(it)) return false;
      const k = el.dataset.k;
      if (!MARKS[k] || s.stones < 1 || it.mark === k) return;
      s.stones--;
      it.mark = k;
      this.engrave = false;
      sfx('enhance');
      commit();
      this.toast(`${itemTitle(it)} 铭刻了「${MARKS[k].name}」`, '#c99bff');
    } else if (act === 'reforge') {
      const cost = reforgeCost(it);
      if (s.gold < cost) return;
      const i = +el.dataset.i, before = it.affix[i];
      if (!reforgeAffix(it, i)) return;
      s.gold -= cost;
      sfx('enhance');
      commit();
      const a = it.affix[i];
      this.toast(`${STAT_INFO[before.k][0]} → ${STAT_INFO[a.k][0]} +${fmtStat(a.k, a.v)}`, '#7ff3ff');
    } else if (act === 'inherit' && !equipped) {
      const cur = compareItem(s,it,{slot:this.cmpSlotFor(it)}).against;
      if (!canImprove(it) || !canImprove(cur) || !cur || cur.enh <= it.enh) return;
      const cost = inheritCost(it, cur);
      if (s.gold < cost) return;
      s.gold -= cost;
      it.enh = cur.enh;
      cur.enh = 0;
      sfx('enhance');
      commit();
      this.toast(`${itemTitle(it)} 传承了强化等级`, '#ffd65a');
    } else if (act === 'lock') {
      it.locked = !it.locked;
      sfx('click');
      commit();
    } else if (act === 'sell' && !equipped && !it.locked) {
      const gold = sellPrice(it);
      s.bag = s.bag.filter((x) => x !== it);
      s.gold += gold;
      sfx('coin');
      this.closeModal();
      commit();
      this.toast(`获得 ${gold} 金币`, '#ffd65a');
    } else if (act === 'enhance') {
      if (!canImprove(it)) return;
      const dups = allowed ? duplicatesOf(s, it) : [];
    const cost = enhCost(it);
      if (s.gold < cost || it.enh >= MAX_ENH) return;
      s.gold -= cost;
      if (Math.random() < enhRate(it)) {
        it.enh++;
        sfx('enhance');
        this.toast(`强化成功！+${it.enh}`, '#ffd65a');
      } else {
        sfx('enhFail');
        this.toast('强化失败，装备完好无损', '#9fb3c8');
      }
      commit();
    }
  }

  // ---------------- 角色预览（每帧调用）----------------
  drawPreview(t) {
    const c = this.preview;
    if (!c || !c.isConnected) return;
    const ctx = c.getContext('2d');
    // 画布按显示尺寸定标（Quinn 2026-11-10：角色框固定高度，背景与翅膀铺满整框）：
    // 设计宽固定 440，设计高 HD 随框体宽高比延伸，人物锚点全部相对 HD 计算
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.clientWidth > 40 && c.clientHeight > 40) {
      const bw = Math.round(c.clientWidth * dpr), bh = Math.round(c.clientHeight * dpr);
      if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; }
    }
    const HD = Math.max(460, Math.round(440 * (c.height / Math.max(1, c.width))));
    const feetY = HD - 58; // 脚底（站台面）距设计底边的距离与旧 460 版一致
    const kH = compact0 => compact0 ? Math.max(372, Math.min(HD - 130, 372 + (HD - 460) * 0.55)) / 372 : 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    // 展示背景（可切换，存档 showcaseBg：0 星穹神殿 / 1 暗夜祭坛 / 2 晨光庭院 / -1 无）
    const showBg = this.save.showcaseBg ?? 0;
    const compact = showBg >= 0;
    if (compact) {
      const bg = showcaseImg(SHOWCASE_BGS[showBg]);
      if (bg) {
        const s = Math.max(c.width / bg.naturalWidth, c.height / bg.naturalHeight);
        const dw = bg.naturalWidth * s, dh = bg.naturalHeight * s;
        ctx.drawImage(bg, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
      }
    }
    ctx.setTransform(c.width / 440, 0, 0, c.width / 440, 0, 0);
    const equip = this.save.equip;
    const defs = Object.values(equip).filter(Boolean).map(it => ({it, def: CATALOG[it.def]}));
    const palette = {chill:'#75dfff', burn:'#ff8148', shock:'#b795ff', poison:'#a3e66e', bleed:'#f45b83', shield:'#ffe7a0'};
    const weapon = CATALOG[equip.weapon?.def];
    const imbues = defs.filter(({it, def}) => it.imbueLv > 0 && def?.imbue).map(({def}) => def.imbue);
    const primary = SERIES[weapon?.series]?.element || imbues[0];
    const colors = [...new Set([primary, SERIES[CATALOG[equip.wings?.def]?.series]?.element, ...imbues].filter(Boolean))]
      .map(key => palette[key]).filter(Boolean);
    if (!colors.length) colors.push('#7ff3ff');
    const rgba = (hex, alpha) => `rgba(${[1,3,5].map(i => parseInt(hex.slice(i,i+2),16)).join(',')},${alpha})`;
    // Cache only tinted copies of existing textures; never generate substitute FX shapes.
    const texture = (id, color) => {
      const source = FX_ART.light.ready && FX_ART.light.items[id];
      if (!source?.width) return null;
      this.previewFx ||= new Map();
      const key = `${id}/${color}`, cached = this.previewFx.get(key);
      if (cached?.source === source) return cached.canvas;
      const canvas = document.createElement('canvas');
      canvas.width = source.width; canvas.height = source.height;
      const paint = canvas.getContext('2d');
      paint.drawImage(source, 0, 0);
      paint.globalCompositeOperation = 'source-in';
      paint.fillStyle = color; paint.fillRect(0, 0, canvas.width, canvas.height);
      this.previewFx.set(key, {source, canvas});
      return canvas;
    };
    const fx = (id, color, x, y, w, h, alpha) => {
      const image = texture(id, color);
      if (!image) return;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha;
      ctx.drawImage(image, x-w/2, y-h/2, w, h); ctx.restore();
    };
    const breath = 0.875 + Math.sin(t * 0.018) * 0.125;
    const g = ctx.createRadialGradient(220, HD - 130, 10, 220, HD - 130, 220);
    g.addColorStop(0, rgba(colors[0], 0.16));
    g.addColorStop(1, rgba(colors[0], 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 440, HD);
    const gk = kH(compact);
    colors.forEach(color => fx('glow_soft', color, 220, HD - 225, equip.wings ? 420 * gk : 290,
      equip.wings ? 430 * gk : 350, breath * (equip.wings ? 0.65 : 0.42) / Math.sqrt(colors.length)));
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath();
    ctx.ellipse(220, HD - 50, 80, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    if (heroSprite.ready && heroSprite.full) {
      const H = compact ? 372 * kH(true) : Math.min(440, HD - 20), W = H * (heroSprite.full.width / heroSprite.full.height);
      const bobY = Math.sin(t * 0.03) * 3;
      const top = (compact ? feetY - H : HD - 14 - H) + bobY;
      // 呼吸（3.8s 一周期）：相位是全局时钟，同时调制翅膀扇幅（吸气翼张、呼气翼收）
      const breathPh = t * Math.PI * 2 / 3800;
      const breathB = Math.sin(breathPh);
      const ampMul = 0.86 + 0.28 * (0.5 + 0.5 * breathB);
      // 展示站台：裁用站台图上部盘面垫在脚下
      if (compact) {
        const dais = showcaseImg('assets/fx/showcase_dais.webp');
        if (dais) {
          const dw = 330 * (H / 372), dh = dw * (dais.naturalHeight * 0.55) / dais.naturalWidth;
          ctx.drawImage(dais, 0, 0, dais.naturalWidth, dais.naturalHeight * 0.55, 220 - dw / 2, top + H - 62, dw, dh);
        }
      }
      // —— 翅膀层：根点相对人物框 0.491/0.235；稀有以上优先用样式款主图（按 rig 动法），否则系列标准款 ——
      const wdef = CATALOG[equip.wings?.def];
      const skey = styleKeyFor(equip.wings?.def, wdef);
      const simg = skey ? styleImg(skey) : null;
      const smeta = skey ? STYLE_ART[skey] : null;
      const wimg = simg ? null : wingImg(wdef?.series);
      const wmeta = WING_ART[wdef?.series];
      let wingCx = 0, wingCy = 0, wingPh = 0, moteColor = wmeta?.mote;
      const rootShadow = () => {
        ctx.save();
        ctx.translate(wingCx, wingCy + 4);
        ctx.scale(1, 0.45);
        const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.11 * W);
        sg.addColorStop(0, 'rgba(0,0,0,0.32)');
        sg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(0, 0, 0.11 * W, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      };
      if (simg) {
        wingCx = 220 + (0.491 - 0.5) * W;
        wingCy = top + 0.235 * H;
        wingPh = (t % smeta.period) / smeta.period;
        moteColor = smeta.mote;
        // 传说样式款：主翼下方多一层同款副翼（缩小、根点更低、相位更滞后）
        if (wdef.rar === 4) drawStyleWing(ctx, simg, smeta, wingCx, wingCy + 0.16 * H, H, wingPh - 0.06, ampMul, 0.68);
        drawStyleWing(ctx, simg, smeta, wingCx, wingCy, H, wingPh, ampMul);
        // 光环背立模式（圣光审判）：竖环悬浮在背后，慢摆
        if (skey === 'holy' && (this.save.showcaseHalo ?? 'head') === 'back') {
          const halo = compImg('halo');
          if (halo) {
            ctx.save();
            ctx.translate(220, wingCy + 30 + Math.sin(t * 0.0013) * 3);
            ctx.rotate(Math.PI / 2 + Math.sin(t * 0.0009) * 0.03);
            const hw = 300, hh = hw * halo.naturalHeight / halo.naturalWidth;
            ctx.drawImage(halo, -hw / 2, -hh / 2, hw, hh);
            ctx.restore();
          }
        }
        // 虚空晶眼（暗影君王）：悬浮在翼根上方，缓缓窥视
        if (skey === 'shadow') {
          const eye = compImg('eye');
          if (eye) {
            const ew = 104, eh = ew * eye.naturalHeight / eye.naturalWidth;
            ctx.drawImage(eye, 220 - ew / 2 + Math.sin(t * 0.0007) * 4, wingCy - eh - 4 + Math.sin(t * 0.0013) * 4, ew, eh);
          }
        }
        rootShadow();
      } else if (wimg) {
        wingCx = 220 + (0.491 - 0.5) * W;
        wingCy = top + 0.235 * H;
        wingPh = (t % 2200) / 2200;
        const halfH = 0.643 * W * (wmeta.h / 1024);
        // 传说翅膀：主翼下方多一层副翼（同系列主图缩小、根点更低、相位更滞后）
        if (wdef.rar === 4) drawWingLayer(ctx, wimg, wmeta, wingCx, wingCy + 0.38 * halfH, W, 0.68, wingPh - 0.05, ampMul);
        drawWingLayer(ctx, wimg, wmeta, wingCx, wingCy, W, 1, wingPh, ampMul);
        rootShadow();
      }
      // —— 立绘呼吸：三带分层——腿带静止锚定 / 躯干带以腰线为锚呼吸缩放 / 头肩带相位滞后浮沉 ——
      {
        const full = heroSprite.full, sw = full.width, sh = full.height;
        const band = (f0, f1, dy = 0, sY = 1) => {
          ctx.save();
          if (sY !== 1) {
            const anchorY = top + f1 * H;
            ctx.translate(0, anchorY);
            ctx.scale(1, sY);
            ctx.translate(0, -anchorY);
          }
          ctx.drawImage(full, 0, f0 * sh, sw, (f1 - f0) * sh, 220 - W / 2, top + f0 * H + dy, W, (f1 - f0) * H);
          ctx.restore();
        };
        band(0.585, 1);
        band(0.155, 0.60, 0, 1 + 0.013 * breathB);
        band(0, 0.17, 1.6 * Math.sin(breathPh - 0.7));
      }
      // 光环头顶模式（圣光审判）：悬浮在头顶，轻浮慢摆
      if (simg && skey === 'holy' && (this.save.showcaseHalo ?? 'head') === 'head') {
        const halo = compImg('halo');
        if (halo) {
          const hw = 118, hh = hw * halo.naturalHeight / halo.naturalWidth;
          ctx.save();
          ctx.translate(220, top + 10 + Math.sin(t * 0.0011) * 3);
          ctx.rotate(Math.sin(t * 0.0008) * 0.05);
          ctx.drawImage(halo, -hw / 2, -hh / 2, hw, hh);
          ctx.restore();
        }
      }
      // —— 翼尖光点（颜色随系列/样式、亮度随品质）：下压相位更亮，位置由 t 与种子纯函数决定 ——
      if (wimg || simg) {
        const press = wingPh > 0.3 && wingPh < 0.65 ? Math.sin((wingPh - 0.3) / 0.35 * Math.PI) : 0;
        ctx.save();
        for (let i = 0; i < MOTE_SEEDS.length; i++) {
          const m = MOTE_SEEDS[i], side = i % 2 ? 1 : -1;
          const life = ((t / 2600) + m.off) % 1;
          const mx = wingCx + side * (0.10 + 0.50 * m.dx) * W + side * m.drift * life;
          const my = wingCy + (0.02 + 0.14 * (m.tw / 6.28)) * H + m.fall * life * life;
          const a = Math.min(1, 0.75 * Math.sin(life * Math.PI) * (0.35 + 0.65 * press) * (0.6 + 0.4 * Math.sin(t * 0.02 + m.tw)) * (0.5 + 0.16 * (wdef?.rar ?? 0)));
          if (a <= 0.03) continue;
          const pimg = particleImg(PARTICLE_FOR_SERIES[wdef?.series] || 'mote', 'abcd'[i % 4]);
          if (pimg) { // 造型粒子贴图（Quinn 2026-11-10：每类多形态，不用圆点盖章）
            const ps = (12 + m.size * 4.4) * (1 - life * 0.25);
            ctx.save();
            ctx.globalAlpha = Math.min(1, a * 1.15);
            ctx.translate(mx, my);
            ctx.rotate(m.tw + (i % 2 ? 1 : -1) * t * 0.008);
            ctx.drawImage(pimg, -ps / 2, -ps / 2, ps, ps * (pimg.height / pimg.width));
            ctx.restore();
          } else {
            ctx.fillStyle = `rgba(${moteColor},${a.toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(mx, my, m.size * (1 - life * 0.4), 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }
    } else {
      const look = this.g.playerLook();
      const pose = { crouch: 0.08 + Math.sin(t * 0.06) * 0.05, angle: 0.65 + Math.sin(t * 0.04) * 0.05, walk: 0, lean: 1, backAngle: 1.5 };
      ctx.save();
      ctx.translate(220, HD - 55);
      ctx.scale(3.1, 3.1);
      drawFighter(ctx, 0, 0, look, pose, { facing: 1, t });
      ctx.restore();
    }
    if (equip.veil) fx('light_magic', colors[0], 220 + Math.sin(t * 0.012) * 5,
      HD - 215 + Math.cos(t * 0.015) * 4, 340 * kH(compact), 400 * kH(compact), 0.15 * breath);
  }
}
