// 大地图「守灯原」：可以走的地图，走到关卡入口按攻击键进关。设计见 docs/DESIGN_WORLD.md。
//
// 俯视 3/4 视角，地图逻辑尺寸 MAP_W × MAP_H，镜头跟着人走。人物用现有的侧面逐帧精灵（缩小）。
// 素材（docs/ART_V7.md，见 world_art.js）载入后按锚点画；素材没载好时用程序画的占位：
//   地面和道路画进一张缓存画布（进度变化时重画），地标和散件各自缓存成小画布。两种都按锚点的 y 排序遮挡。
// 光：长明灯塔、点亮的烽灯、深渊、试炼碑、人物身上的光，交给现有的光照 / 后处理管线。
import { VIEW_W, VIEW_H, FONT_TITLE, FONT_UI, FONT_NUM, COLORS, clamp } from './config.js';
import { heroSprite, MOBILE, runFrame, HERO_SCALE } from './sprite.js';
import { STAGES, isUnlocked } from './stages.js';
import { BOSSES } from './boss.js';
import { CHALLENGES } from './training.js';
import { tex, tinted } from './fx_tex.js';
import { drawFighter } from './rig.js';
import { settings } from './settings.js';
import { sfx } from './audio.js';
import { WORLD_ART, maskCover } from './world_art.js';
import { lightTex } from './fx_art.js';
import { drawSceneRunes } from './scene_fx.js';
import { releaseBoot } from './boot.js';
import { NPCS, INSCRIPTIONS, SPEAKERS, worldSave, hasNew, pendingEvents, progress, TALKS, BEACON_LINES, TRIAL_LINES, ENDING_LINES } from './world_story.js';

export const MAP_W = 2400, MAP_H = 1500;
const EDGE = 80; // 地图四周的枯林带，走不进去
const HERO_H = 58; // 地图上人物的站立高度（战斗里约 96）
const SPEED = 2.4; // 每帧走多少（逻辑像素）
const NEAR = 64; // 离入口多近算「站在入口前」
const MAP_SCALE = (0.54 * HERO_H) / 96; // 地图上人物精灵的缩放（绯隼和守灯驿的人都用这个）
// 遮挡和碰撞分开（地图精修第 5 轮）：被画在前面的东西盖住只补画半透明剪影（超过 HIDE_GHOST），不因此禁行；
// 真正挡路的只有物件实际的底座（按素材的底座像素量出来，见 footprints），灯柱这类细高物件底座很小
const HIDE_GHOST = 0.12;
// 量底座用哪一段（离地多少逻辑像素）：树、灯柱量树干 / 灯杆（根和草铺得很宽，不能算底座）；其余量贴地的那一段
const FOOT_BAND = { tree: [30, 50], lamp: [30, 50] };
const NO_BLOCK = new Set(['bush', 'reeds']); // 灌木、芦苇：人能穿过去
const HERO_BOX = [9, HERO_H - 6, 3]; // 判断遮挡用的身体框：左右各 9、脚底往上 3～52
const WALK_IN = [22, 16]; // 走进入口（素材标的门口 / 台阶口）多近、往里走就打开地点卡片

// ---------------- 地点 ----------------
// x, y：锚点（底部中心）；foot：底座椭圆的半径 [rx, ry]，挡路；door：站在哪里算入口前（默认锚点正前方）
// fdy：底座椭圆中心在锚点上方多少（按素材里建筑的位置量的）；地标的地面圆台可以走，建筑本身挡路
// feet：另外几块底座 [dx, dy, rx, ry]（相对锚点的椭圆）：营地前面的木栅栏、墓穴的建筑和两侧围栏、练剑场的围场（按素材量的）
export const SITES = [
  { id: 'camp', kind: 'camp', name: '守灯驿', x: 1200, y: 1150, foot: [150, 60], fdy: -72, door: [1200, 1200], feet: [[-105, -22, 60, 9], [100, -22, 62, 9]] },
  { id: 's1', kind: 'stage', stage: 0, x: 640, y: 850, foot: [92, 46], fdy: -76, beacon: [500, 880], feet: [[0, -84, 95, 40], [-128, -52, 28, 36], [128, -52, 28, 36]] },
  { id: 's2', kind: 'stage', stage: 1, x: 1000, y: 600, foot: [124, 98], fdy: -146, beacon: [1150, 620] },
  { id: 's3', kind: 'stage', stage: 2, x: 1760, y: 850, foot: [118, 88], fdy: -134, beacon: [1910, 880] },
  { id: 's4', kind: 'stage', stage: 3, x: 1910, y: 470, foot: [108, 92], fdy: -142, beacon: [1760, 500] },
  // 深渊：底座是整个深渊，入口在断桥伸出去的地方
  { id: 's5', kind: 'stage', stage: 4, x: 1200, y: 360, foot: [224, 130], fdy: -184, beacon: [1460, 400] },
  { id: 'trial', kind: 'trial', name: '残光试炼', x: 780, y: 1180, foot: [70, 40], fdy: -75 },
  { id: 'training', kind: 'training', name: '练剑场', x: 1590, y: 1210, foot: [0, 0], door: [1590, 1250], feet: [[0, -130, 148, 90]] },
].map((s) => ({ ...s, name: s.name ?? STAGES[s.stage].name, door: s.door ?? [s.x, s.y + 24] }));
export const site = (id) => SITES.find((s) => s.id === id);

// 道路：守灯驿 → ① → ② → ③ → ④ → ⑤，另外两条小路通练剑场和试炼碑。open：这一段什么时候算「通了」
const ROADS = [
  { pts: [[1200, 1205], [1040, 1150], [860, 1030], [650, 880]], open: () => true },
  { pts: [[1200, 1205], [1390, 1230], [1590, 1255]], open: () => true },
  { pts: [[1200, 1205], [1000, 1235], [780, 1220]], open: () => true },
  { pts: [[650, 880], [700, 760], [850, 660], [1000, 630]], open: (s) => isUnlocked(s, 1) },
  { pts: [[1000, 630], [1250, 710], [1500, 810], [1760, 880]], open: (s) => isUnlocked(s, 2) },
  { pts: [[1760, 880], [1880, 720], [1910, 500]], open: (s) => isUnlocked(s, 3) },
  { pts: [[1910, 515], [1700, 440], [1450, 410], [1200, 392]], open: (s) => isUnlocked(s, 4) },
];

// 固定随机数：每次打开地图，树和石头都在同一个地方
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function segDist(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const u = l ? clamp(((px - ax) * dx + (py - ay) * dy) / l, 0, 1) : 0;
  return Math.hypot(px - ax - u * dx, py - ay - u * dy);
}
const roadDist = (x, y) => Math.min(...ROADS.flatMap((r) => r.pts.slice(1).map((p, i) => segDist(x, y, r.pts[i], p))));

// ---------------- 散件（固定随机摆放）----------------
// 挡路的范围：r 圆（横向略宽），或者 rx / ry 椭圆（墙、拱这种宽的）；没写 = 不挡路
const PROP_BLOCK = {
  tree: { r: 12 }, rock: { r: 14 }, grave: { r: 8 }, stump: { r: 8 }, menhir: { r: 10 }, shrine: { r: 12 },
  wall: { rx: 58, ry: 12 }, arch: { rx: 66, ry: 12 }, crates: { rx: 40, ry: 14 }, cart: { rx: 50, ry: 16 },
};
// 素材里的 id：kind + 变体
// lamp_fallen：原来画成倒在地上的灯（素材本身是躺着的），玩家看着像「地图元素躺着」—— 改成立着的旧路灯（摆放位置不变）
const PROP_ART = { lamp_fallen: ['lamp'], tree: ['tree_a', 'tree_b', 'tree_c'], rock: ['boulder', 'rocks', 'slab'], grave: ['grave_a', 'grave_b', 'grave_cross'], lamp: ['lamp'], sign: ['signpost'], stone: ['milestone'] };
const propArtId = (o) => PROP_ART[o.kind]?.[o.v % PROP_ART[o.kind].length] ?? o.kind;
// kind：tree 枯树 / rock 石头 / grave 墓碑 / lamp 路灯 / sign 路牌；r：挡路的半径（0 = 不挡）
function scatter() {
  const R = rng(7), out = [];
  const free = (x, y, d) => roadDist(x, y) > d && SITES.every((s) => Math.hypot((x - s.x) / 1.4, y - s.y - (s.fdy ?? 0) * 0.6) > (s.id === 's5' ? 330 : 180))
    && out.every((o) => Math.hypot(o.x - x, o.y - y) > 46) && INSCRIPTIONS.every((o) => Math.hypot((o.lx ?? o.x) - x, (o.ly ?? o.y) - y) > 60) // lx/ly：刻字挪过位置，按原来的空位算（免得整张地图的散件重新洗牌）
    && NPCS.every((o) => Math.hypot(o.x - x, o.y - y) > 120) && SITES.every((s) => Math.hypot(x - s.door[0], y - s.door[1]) > 150); // 入口前、守灯驿门口留空
  const put = (kind, n, d, area = () => [EDGE + 40 + R() * (MAP_W - EDGE * 2 - 80), EDGE + 60 + R() * (MAP_H - EDGE * 2 - 100)]) => {
    for (let k = 0, tries = 0; k < n && tries < n * 40; tries++) {
      const [x, y] = area();
      if (!free(x, y, d)) continue;
      out.push({ kind, x, y, v: (R() * 3) | 0, ...PROP_BLOCK[kind] });
      k++;
    }
  };
  put('tree', 26, 90);
  put('rock', 30, 46);
  // 素材里的散件更多样：灌木、芦苇（不挡路）、树桩、立石、倒下的路灯、残墙、石拱、路祠
  put('bush', 34, 34);
  put('reeds', 22, 34);
  put('stump', 10, 46);
  put('menhir', 6, 60);
  put('lamp_fallen', 5, 46);
  put('wall', 5, 80);
  put('arch', 3, 90);
  put('shrine', 3, 50);
  // 墓园：①附近的墓碑
  put('grave', 16, 40, () => { const a = R() * Math.PI * 2, d = 120 + R() * 140; return [640 + Math.cos(a) * d * 1.4, 860 + Math.sin(a) * d * 0.7]; });
  // 路灯：沿主路每隔一段，立在路边
  for (const r of ROADS) {
    for (let i = 1; i < r.pts.length; i++) {
      const [ax, ay] = r.pts[i - 1], [bx, by] = r.pts[i], L = Math.hypot(bx - ax, by - ay);
      for (let d = 150; d < L - 60; d += 300) {
        const u = d / L, nx = -(by - ay) / L, ny = (bx - ax) / L, side = (i + Math.round(d)) % 2 ? 1 : -1;
        const x = ax + (bx - ax) * u + nx * 34 * side, y = ay + (by - ay) * u + ny * 34 * side;
        if (SITES.every((s) => Math.hypot(x - s.x, y - s.y) > 150)) out.push({ kind: 'lamp', x, y, v: 0, r: 5 });
      }
    }
  }
  // 守灯驿门外的箱子和旧车（箱子原来摆在营地栅栏后面，被营地的图盖住了，挪到栅栏外）
  out.push({ kind: 'crates', x: 986, y: 1177, v: 0, ...PROP_BLOCK.crates }, { kind: 'cart', x: 1400, y: 1300, v: 0, ...PROP_BLOCK.cart });
  // 路边可以读的刻字（路牌 / 刻字石 / 墓碑），也是散件
  for (const c of INSCRIPTIONS) out.push({ kind: c.kind === 'stone' ? 'stone' : c.kind, x: c.x, y: c.y, v: c.kind === 'grave' ? 0 : 0, r: 7, read: c });
  return out;
}

// ---------------- 程序画的占位（素材回来后替换）----------------
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
const K = 2; // 小画布按 2 倍画，2 倍渲染时也清楚

// 在一张 w × h（逻辑像素）的小画布上画，锚点在 (ax, ay)；返回 { c, ax, ay, w, h }
function sprite(w, h, ax, ay, paint) {
  const c = mk(w * K, h * K), g = c.getContext('2d');
  g.scale(K, K);
  g.translate(ax, ay);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  paint(g);
  return { c, ax, ay, w, h };
}
const ellipse = (g, x, y, rx, ry, fill) => { g.fillStyle = fill; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
const poly = (g, pts, fill, stroke, lw = 1.5) => {
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
};
const RIM = 'rgba(170,180,220,0.28)'; // 冷色轮廓光（和角色素材一致）

// 枯树：一根歪的树干 + 几根分叉
function paintTree(g, v) {
  const R = rng(31 + v * 7), h = 70 + v * 16;
  ellipse(g, 0, 0, 16, 5, 'rgba(0,0,0,.35)');
  g.strokeStyle = '#2a2228';
  const branch = (x, y, a, len, w, depth) => {
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
    if (depth > 0) for (const s of [-1, 1]) branch(x2, y2, a + s * (0.35 + R() * 0.45), len * (0.55 + R() * 0.2), w * 0.6, depth - 1);
  };
  branch(0, 0, -Math.PI / 2 + (R() - 0.5) * 0.3, h * 0.45, 6, 3);
  g.strokeStyle = RIM; g.lineWidth = 1; g.beginPath(); g.moveTo(2, 0); g.lineTo(3, -h * 0.4); g.stroke();
}
function paintRock(g, v) {
  ellipse(g, 0, 0, 22, 7, 'rgba(0,0,0,.35)');
  const w = 16 + v * 5;
  poly(g, [[-w, 0], [-w * 0.8, -w * 0.6], [-w * 0.1, -w * 0.95], [w * 0.7, -w * 0.7], [w, -w * 0.1], [w * 0.6, 2]], '#35303a', RIM);
  poly(g, [[-w * 0.1, -w * 0.95], [w * 0.7, -w * 0.7], [w * 0.2, -w * 0.4], [-w * 0.5, -w * 0.55]], '#433d48');
}
function paintGrave(g, v) {
  ellipse(g, 0, 0, 13, 4, 'rgba(0,0,0,.35)');
  g.save(); g.rotate((v - 1) * 0.12);
  if (v === 2) { poly(g, [[-3, 0], [-3, -16], [-10, -16], [-10, -21], [-3, -21], [-3, -28], [3, -28], [3, -21], [10, -21], [10, -16], [3, -16], [3, 0]], '#3c3640', RIM); }
  else { g.beginPath(); g.moveTo(-9, 0); g.lineTo(-9, -18); g.arc(0, -18, 9, Math.PI, 0); g.lineTo(9, 0); g.closePath(); g.fillStyle = '#3e3842'; g.fill(); g.strokeStyle = RIM; g.lineWidth = 1.2; g.stroke(); }
  g.restore();
}
function paintLamp(g) {
  ellipse(g, 0, 0, 8, 3, 'rgba(0,0,0,.35)');
  g.strokeStyle = '#2a262e'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -46); g.lineTo(7, -50); g.stroke();
  poly(g, [[4, -50], [11, -50], [12, -40], [3, -40]], '#1c1a22', RIM, 1);
}
function paintStone(g) {
  ellipse(g, 0, 0, 14, 4, 'rgba(0,0,0,.35)');
  poly(g, [[-11, 0], [-12, -22], [-6, -30], [6, -31], [12, -22], [11, 0]], '#4a444e', RIM);
  g.strokeStyle = '#2a2630'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(-6, -20); g.lineTo(6, -20); g.moveTo(-5, -14); g.lineTo(5, -14); g.moveTo(-6, -8); g.lineTo(4, -8); g.stroke();
}
function paintSign(g, v) {
  ellipse(g, 0, 0, 9, 3, 'rgba(0,0,0,.35)');
  g.strokeStyle = '#3a2e26'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -36); g.stroke();
  poly(g, [[-2, -34], [16, -34], [21, -30], [16, -26], [-2, -26]], '#4a3a2e', RIM, 1);
  poly(g, [[2, -22], [-16, -22], [-21, -18], [-16, -14], [2, -14]], v ? '#40322a' : '#4a3a2e', RIM, 1);
}

// 地标（占位）：每个都画在自己的小画布上，锚点 = 底部中心
const LANDMARK = {
  camp: () => sprite(340, 260, 170, 200, (g) => {
    ellipse(g, 0, -40, 160, 56, '#2a2420');
    // 栅栏：一圈削尖的木桩，正面留出口
    for (let a = 0; a < Math.PI * 2; a += 0.16) {
      if (Math.abs(a - Math.PI / 2) < 0.32) continue;
      const x = Math.cos(a) * 150, y = -40 + Math.sin(a) * 50;
      g.strokeStyle = '#3a2c22'; g.lineWidth = 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 16); g.stroke();
    }
    const tent = (x, y, w, h, c) => {
      poly(g, [[x - w, y], [x, y - h], [x + w, y]], c, RIM);
      poly(g, [[x - w * 0.18, y], [x, y - h * 0.45], [x + w * 0.18, y]], '#0e0b10');
    };
    tent(-92, -56, 42, 50, '#4a4238'); tent(84, -60, 46, 54, '#44403a');
    // 长明灯塔：中间高高的铁塔，顶上一个灯笼（火由引擎画）
    g.strokeStyle = '#262230'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(-10, -30); g.lineTo(-3, -170); g.moveTo(10, -30); g.lineTo(3, -170); g.stroke();
    g.lineWidth = 1.5; for (let y = -40; y > -165; y -= 18) { g.beginPath(); g.moveTo(-9 + (y + 40) * -0.05, y); g.lineTo(9 - (y + 40) * -0.05, y - 9); g.stroke(); }
    poly(g, [[-12, -170], [12, -170], [10, -194], [-10, -194]], '#1a1820', RIM);
    poly(g, [[-14, -194], [14, -194], [0, -206]], '#262230');
    tent(-6, -12, 50, 46, '#504840');
    ellipse(g, 60, -14, 16, 6, '#1a1412'); // 冷掉的火坑
    for (const [x, y] of [[-140, -26], [130, -22]]) poly(g, [[x - 10, y], [x - 10, y - 16], [x + 10, y - 16], [x + 10, y]], '#3e3228', RIM, 1);
  }),
  crypt: () => sprite(300, 220, 150, 190, (g) => {
    ellipse(g, 0, -20, 130, 40, '#211c22');
    poly(g, [[-70, -10], [-70, -86], [70, -86], [70, -10]], '#3a3440', RIM);
    poly(g, [[-80, -86], [0, -126], [80, -86]], '#2c2832', RIM);
    poly(g, [[-26, -10], [-26, -62], [26, -62], [26, -10]], '#060508');
    for (let i = 0; i < 4; i++) poly(g, [[-26 + i * 3, -10 - i * 6], [26 - i * 3, -10 - i * 6], [26 - i * 3, -13 - i * 6], [-26 + i * 3, -13 - i * 6]], '#1a161c');
    for (const x of [-56, 56]) poly(g, [[x - 8, -10], [x - 8, -80], [x + 8, -80], [x + 8, -10]], '#433c48', RIM, 1);
    g.strokeStyle = '#2a2430'; g.lineWidth = 2;
    for (let x = -120; x <= 120; x += 12) if (Math.abs(x) > 80) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, -20); g.stroke(); }
  }),
  ossuary: () => sprite(300, 200, 150, 170, (g) => {
    ellipse(g, 0, -40, 130, 52, '#2a2428');
    ellipse(g, 0, -42, 104, 40, '#08060a');
    // 一圈骨头和头骨
    const R = rng(5);
    for (let a = 0; a < Math.PI * 2; a += 0.22) ellipse(g, Math.cos(a) * 112, -40 + Math.sin(a) * 45, 5 + R() * 3, 3, '#8a8070');
    // 螺旋往下的台阶
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 0.55 + i * 0.42, r = 92 - i * 7;
      g.strokeStyle = `rgba(110,100,96,${0.7 - i * 0.06})`; g.lineWidth = 5 - i * 0.35;
      g.beginPath(); g.ellipse(0, -42, r, r * 0.38, 0, a, a + 0.3); g.stroke();
    }
    for (const x of [-60, 60]) { poly(g, [[x - 7, -36], [x - 7, -96], [x + 7, -96], [x + 7, -36]], '#4a4440', RIM, 1); ellipse(g, x, -98, 9, 6, '#8a8070'); }
  }),
  gallows: () => sprite(320, 240, 160, 200, (g) => {
    poly(g, [[-140, 0], [-90, -50], [90, -56], [140, 0]], '#2a2220', RIM);
    poly(g, [[-70, -60], [70, -60], [70, -70], [-70, -70]], '#3e2e24', RIM);
    g.strokeStyle = '#3a2a20'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(-50, -70); g.lineTo(-50, -160); g.lineTo(50, -160); g.lineTo(50, -70); g.stroke();
    g.strokeStyle = '#5a5050'; g.lineWidth = 1.5;
    for (const x of [-22, 0, 22]) { g.beginPath(); g.moveTo(x, -160); g.lineTo(x, -122); g.stroke(); }
    for (const x of [-104, 104]) { g.strokeStyle = '#3a3438'; g.lineWidth = 2; g.strokeRect(x - 10, -86, 20, 30); g.beginPath(); g.moveTo(x, -86); g.lineTo(x, -100); g.stroke(); }
    poly(g, [[-30, -4], [30, -4], [24, -26], [-24, -26]], '#060507');
    poly(g, [[-30, -26], [30, -26], [36, -40], [-36, -40]], '#4a3a30', RIM, 1); // 掀开的铁门
  }),
  altar: () => sprite(340, 260, 170, 220, (g) => {
    for (let i = 0; i < 4; i++) poly(g, [[-140 + i * 18, -i * 18], [140 - i * 18, -i * 18], [140 - i * 18, -i * 18 - 16], [-140 + i * 18, -i * 18 - 16]], i % 2 ? '#3a3638' : '#423e40', RIM, 1);
    poly(g, [[-30, -64], [30, -64], [30, -110], [-30, -110]], '#070608');
    for (const x of [-100, -66, 66, 100]) {
      const h = x === -100 ? 70 : x === 100 ? 120 : 140;
      poly(g, [[x - 9, -60], [x - 9, -60 - h], [x + 9, -60 - h], [x + 9, -60]], '#3e3a42', RIM, 1);
      g.strokeStyle = '#2a262e'; g.lineWidth = 2; g.beginPath();
      for (let y = -70; y > -60 - h; y -= 14) { g.moveTo(x - 9, y); g.quadraticCurveTo(x, y - 7, x + 9, y); }
      g.stroke();
    }
  }),
  abyss: () => sprite(800, 320, 400, 140, (g) => {
    // 锚点在断桥的根部（深渊前沿）；深渊本身在锚点上方
    const R = rng(9), pts = [];
    for (let a = 0; a < Math.PI * 2; a += 0.12) { const r = 1 + (R() - 0.5) * 0.12; pts.push([Math.cos(a) * 360 * r, -130 + Math.sin(a) * 120 * r]); }
    poly(g, pts.map(([x, y]) => [x * 1.08, -130 + (y + 130) * 1.12]), '#26222a', RIM);
    poly(g, pts, '#020104');
    const glow = g.createRadialGradient(0, -130, 10, 0, -130, 340);
    glow.addColorStop(0, 'rgba(90,60,140,.35)'); glow.addColorStop(1, 'rgba(90,60,140,0)');
    g.fillStyle = glow; g.beginPath(); g.ellipse(0, -130, 350, 118, 0, 0, Math.PI * 2); g.fill();
    // 断桥：伸进深渊，在半空断掉
    poly(g, [[-26, 0], [26, 0], [20, -150], [-20, -150]], '#3a3640', RIM);
    for (let y = -10; y > -150; y -= 16) poly(g, [[-24 + (y * -0.04), y], [24 - (y * -0.04), y], [24 - (y * -0.04), y - 3], [-24 + (y * -0.04), y - 3]], '#2a2630');
    for (let i = 0; i < 7; i++) { const x = (R() - 0.5) * 520, y = -130 + (R() - 0.5) * 150; poly(g, [[x - 8, y], [x - 4, y - 9], [x + 7, y - 6], [x + 9, y + 2]], '#2e2a34', RIM, 1); }
  }),
  training: () => sprite(240, 150, 120, 120, (g) => {
    ellipse(g, 0, -40, 110, 42, '#4a4034');
    ellipse(g, 0, -40, 96, 34, '#55493a');
    for (let a = 0; a < Math.PI * 2; a += 0.35) { const x = Math.cos(a) * 106, y = -40 + Math.sin(a) * 40; g.strokeStyle = '#3a2c22'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 10); g.stroke(); }
    for (const [x, y] of [[-50, -56], [0, -62], [50, -54]]) {
      g.strokeStyle = '#3a2c22'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 34); g.moveTo(x - 12, y - 26); g.lineTo(x + 12, y - 26); g.stroke();
      ellipse(g, x, y - 30, 8, 12, '#7a6a48'); ellipse(g, x, y - 46, 6, 6, '#7a6a48');
    }
  }),
  trial: () => sprite(140, 240, 70, 220, (g) => {
    ellipse(g, 0, -6, 60, 20, '#2a2630');
    ellipse(g, 0, -12, 46, 15, '#34303a');
    poly(g, [[-20, -14], [-14, -170], [-2, -196], [8, -176], [20, -14]], '#141218', RIM);
    g.strokeStyle = '#2c2834'; g.lineWidth = 2;
    for (let y = -40; y > -170; y -= 28) { g.beginPath(); g.ellipse(0, y, 14 - (y + 40) * -0.03, 4, 0, 0, Math.PI); g.stroke(); }
  }),
  beacon: () => sprite(60, 140, 30, 130, (g) => {
    ellipse(g, 0, 0, 16, 5, 'rgba(0,0,0,.35)');
    poly(g, [[-10, 0], [-8, -10], [8, -10], [10, 0]], '#3a3640', RIM, 1);
    g.strokeStyle = '#24202a'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -10); g.lineTo(0, -100); g.stroke();
    poly(g, [[-14, -100], [14, -100], [10, -116], [-10, -116]], '#1a1820', RIM, 1);
    g.strokeStyle = '#6a4a5a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(1, -70); g.quadraticCurveTo(10, -64, 8, -52); g.stroke();
  }),
  seal: () => sprite(80, 80, 40, 60, (g) => {
    g.strokeStyle = '#5a4a40'; g.lineWidth = 5;
    for (const s of [-1, 1]) { g.setLineDash([6, 3]); g.beginPath(); g.moveTo(-34 * s, -54); g.lineTo(34 * s, -6); g.stroke(); }
    g.setLineDash([]);
    ellipse(g, 0, -30, 12, 12, '#3a3036');
    g.strokeStyle = '#8a7060'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, -30, 7, 0, Math.PI * 2); g.stroke();
  }),
};
const SITE_ART = { camp: 'camp', s1: 'crypt', s2: 'ossuary', s3: 'gallows', s4: 'altar', s5: 'abyss', training: 'training', trial: 'trial' };
// 烽灯素材画得很高（原尺寸 7 个人高），按一半画；封印按 0.4 倍盖在入口上
const BEACON_S = 0.44, SEAL_S = 0.4;
// 引擎画的光在素材里的位置（锚点上方多少逻辑像素）：长明灯塔的灯笼、烽灯的火盆、试炼碑、深渊中心
const GEO = {
  placeholder: { lantern: 190, flame: 112, trialZ: 110, trialDx: 0, rune: [20, 26, 12], abyss: [1200, 210] },
  art: { lantern: 316, flame: 156, trialZ: 160, trialDx: -2, rune: [-30, 24, 20], abyss: [1195, 176] },
};
// 地图边缘：上下两排、左右两列（锚点在地图外面一点，只露出里侧）
const EDGES = (() => {
  const out = [], top = ['dead_forest_a', 'rocky_ridge', 'dead_forest_b'], bot = ['reeds_thorns', 'dead_forest_a', 'reeds_thorns', 'dead_forest_b'], side = ['cliff', 'ruined_wall', 'dead_forest_b', 'rocky_ridge'];
  for (let x = 120, i = 0; x < MAP_W; x += 400, i++) out.push({ id: top[i % 3], x, y: 92, flip: i % 2 ? -1 : 1 });
  for (let x = 0, i = 0; x < MAP_W + 200; x += 420, i++) out.push({ id: bot[i % 4], x, y: MAP_H + 175, flip: i % 2 ? 1 : -1 });
  for (let y = 300, i = 0; y < MAP_H + 100; y += 260, i++) {
    out.push({ id: side[i % 4], x: -175, y, flip: 1 });
    out.push({ id: side[(i + 2) % 4], x: MAP_W + 175, y, flip: -1 });
  }
  return out;
})();
// 地面贴花（只在有素材时画进地面区块）：按区域挑种类，固定随机
const DECALS = (() => {
  const R = rng(17), out = [];
  const near = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) < r;
  for (let i = 0; i < 300; i++) {
    const x = EDGE + R() * (MAP_W - EDGE * 2), y = EDGE + 40 + R() * (MAP_H - EDGE * 2 - 40);
    if (SITES.some((s) => Math.hypot((x - s.x) / 1.3, y - s.y - (s.fdy ?? 0)) < (s.id === 's5' ? 260 : 120))) continue;
    const onRoad = roadDist(x, y) < 22;
    let pool = ['dead_grass', 'dead_grass', 'stones_three', 'puddle', 'thorn_ring', 'dry_leaves', 'tracks', 'dark_moss', 'trampled_dirt', 'crack'];
    if (near(x, y, 640, 830, 330)) pool = ['bones', 'dark_moss', 'dry_leaves', 'dead_grass', 'clay_pot'];
    else if (near(x, y, 1910, 450, 380) || near(x, y, 1200, 220, 560)) pool = ['ash_patch', 'crack', 'rubble', 'stones_three'];
    if (onRoad) pool = ['broken_cobbles', 'tracks', 'puddle'];
    if (R() < 0.04) pool = ['broken_sword', 'buried_lantern', 'clay_pot'];
    out.push({ id: pool[(R() * pool.length) | 0], x, y, flip: R() < 0.5 ? -1 : 1 });
  }
  return out;
})();
// 贴花里画的是「立着的东西」的几种（插在地上的断剑、半埋的提灯、陶罐、草丛）：不画进地面，和其他散件一样按纵深排序立着画
const STAND_DECALS = new Set(['broken_sword', 'buried_lantern', 'clay_pot', 'dead_grass']);
// 地面混合的区域：墓园土（①）、灰烬地（④⑤）、守灯驿和练剑场门口踩出来的泥地
const ZONES = [['grave', 640, 830, 330, 1], ['ash', 1910, 450, 380, 1], ['ash', 1200, 210, 600, 1], ['road', 1200, 1180, 190, 0.55], ['road', 1590, 1240, 150, 0.4]];

// ---------------- 地图场景 ----------------
export class World {
  constructor(game) {
    this.g = game;
    this.props = scatter();
    this.art = {};
    this.hero = { x: 1200, y: 1210, facing: 1, phase: 0, moving: 0 };
    this.cam = { x: 1200 - VIEW_W / 2, y: 1150 - VIEW_H / 2 };
    this.near = null; // 现在站在哪个地点的入口前
    this.lastSite = 'camp';
    this.motes = [];
    this.groundKey = '';
    this.leave = null; // 进关前的收拢黑屏 { t, go }
    this.fadeIn = 0;
    this.titleCam = null; // 封面：镜头从深渊慢慢移到守灯驿
    this.events = []; // 回到地图时要播的事件（烽灯点亮、试炼碑苏醒、结局尾声……）
    this.ev = null; // 正在播的事件
    this.flare = {}; // 刚点亮的东西：id → 点亮后过了几帧（点亮的动画）
    this.caption = null; // 事件的标题字幕 { text, t }
    this.guide = null; // 阿砾指路 { id, t }
    this.talking = null; // 正在和谁说话（那个人转向绯隼、做手势）
    // 封面就在地图上，开机就载入；载好（或者失败）以后才开始载关卡素材（见 boot.js）
    WORLD_ART.load().finally(releaseBoot);
  }

  get save() { return this.g.save; }
  // 地图能画了没有：素材和主角都到了，或者确定载不了（那时才用程序画的占位）
  mapReady() {
    return (WORLD_ART.ready || (WORLD_ART.failed && !WORLD_ART.loading)) && (heroSprite.ready || !heroSprite.loading);
  }
  art_(k) { return (this.art[k] ??= LANDMARK[k]()); }
  propArt(o) {
    const kind = ['tree', 'rock', 'grave', 'lamp', 'sign', 'stone'].includes(o.kind) ? o.kind : 'rock'; // 占位只有这几种画法
    o = { ...o, kind };
    const key = o.kind + o.v;
    return (this.art[key] ??= ({
      tree: () => sprite(120, 150, 60, 140, (g) => paintTree(g, o.v)),
      rock: () => sprite(80, 50, 40, 40, (g) => paintRock(g, o.v)),
      grave: () => sprite(40, 40, 20, 34, (g) => paintGrave(g, o.v)),
      lamp: () => sprite(30, 60, 10, 56, (g) => paintLamp(g)),
      sign: () => sprite(50, 46, 25, 42, (g) => paintSign(g, o.v)),
      stone: () => sprite(40, 40, 20, 34, (g) => paintStone(g)),
    })[o.kind]());
  }

  // 解锁状态
  unlocked(s) {
    if (s.kind === 'stage') return isUnlocked(this.save, s.stage);
    if (s.kind === 'trial') return !!this.save.cleared.s1;
    return true;
  }
  // 烽灯亮不亮看「点亮演出播过没有」（通关以后回到地图才播），这样玩家能看到它亮起来的那一下
  lit(s) { return s.kind === 'stage' && !!worldSave(this.save).lit[STAGES[s.stage].id]; }
  litCount() { return STAGES.filter((st) => worldSave(this.save).lit[st.id]).length; }
  trialAwake() { return !!this.save.cleared.s1 && !!worldSave(this.save).trial; }
  ended() { return !!worldSave(this.save).ending; }

  // 回到地图：站在刚才那个入口前，镜头直接对准
  enter(siteId = this.lastSite) {
    const s = site(siteId) ?? site('camp');
    this.lastSite = s.id;
    this.hero.x = s.door[0];
    this.hero.y = s.door[1] + 8;
    this.hero.facing = 1;
    this.hero.moving = 0;
    this.leave = null;
    this.fadeIn = 24;
    WORLD_ART.load();
    this.prewarm();
    this.snapCam();
    this.near = null;
    this.ev = null;
    this.events = pendingEvents(this.save, settings.story !== 'off');
  }
  // 进地图时一次画好所有地标、散件和地面缓存（不然走到新区域时才画，手机上会卡一下）
  prewarm() {
    if (WORLD_ART.ready) this.artItems();
    for (const k of Object.keys(LANDMARK)) this.art_(k);
    for (const o of this.props) this.propArt(o);
    this.ground();
  }
  snapCam() {
    this.cam.x = clamp(this.hero.x - VIEW_W / 2, 0, MAP_W - VIEW_W);
    this.cam.y = clamp(this.hero.y - VIEW_H * 0.58, 0, MAP_H - VIEW_H);
  }

  // 有素材时地图上的静物：地点、烽灯、散件、地图边缘。和 draw 用同一份（排序线也一样）。
  // sy：排序线 —— 人的 y 比它大就画在它前面。地点用素材标的入口线（门口 / 台阶口）：入口前的台阶、空地是平的，
  //   人走上去要画在上面；比入口线更靠里的部分（建筑、坑、围栏里面）人走进去会被盖住，由 blocked 挡住。
  // 遮罩（mask）进地图时一次算好：之后判断「站在这里会不会被盖住」只是查表
  artItems() {
    const A = WORLD_ART;
    if (this.items && this.itemsOf === A.land.img) return this.items;
    const P = A.props, L = A.land, out = [];
    const add = (Atl, id, x, y, sy, s = 1, flip = 1, o = null) => {
      if (!Atl.has(id)) return;
      const m = Atl.mask(id, s, flip);
      out.push({ A: Atl, id, x, y, sy, s, flip, m, o, l: x + m.x0, r: x + m.x0 + m.w * m.C, t: y + m.y0, b: y + m.y0 + m.h * m.C, vm: Math.max(m.w, m.h) * m.C });
    };
    for (const o of this.props) add(P, propArtId(o), o.x, o.y, o.y, 1, o.x % 2 ? -1 : 1, o);
    for (const st of SITES) {
      const id = SITE_ART[st.id], en = L.has(id) ? L.entrance(id) : [0, 0];
      add(L, id, st.x, st.y, st.y + Math.min(0, en[1]));
      if (st.beacon) add(L, 'beacon', st.beacon[0], st.beacon[1], st.beacon[1], BEACON_S);
    }
    for (const e of EDGES) add(P, e.id, e.x, e.y, e.y, 1, e.flip);
    for (const d of DECALS) if (STAND_DECALS.has(d.id)) add(P, d.id, d.x, d.y, d.y, 1, d.flip); // 立着的贴花：不挡路
    // 随机摆的散件有的正好落在地标的图里（比如墓园围栏里、营地栅栏后面），整个被盖住看不见、却还挡路：
    // 自己的不透明部分被排在它后面画的东西盖住一半以上的，不画、也不挡路（不重排，其余散件位置不变）
    for (const it of out) {
      const o = it.o;
      if (!o) continue;
      o.feet = this.footprints(it, o.kind === 'lamp_fallen' ? 'lamp' : o.kind); // 按素材量底座（碰撞只看这个）
      if (!o.read && this.buriedFrac(it, out) > 0.5) o.buried = true;
    }
    this.itemsOf = A.land.img;
    return (this.items = out.filter((it) => !it.o?.buried));
  }

  // 一件静物自己的不透明部分有多少被排在它后面画的东西盖住（隔一格抽样）
  buriedFrac(it, items) {
    const m = it.m, W1 = m.w + 1;
    let tot = 0, cov = 0;
    for (let cy = 0; cy < m.h; cy += 2) for (let cx = 0; cx < m.w; cx += 2) {
      if (!(m.S[(cy + 1) * W1 + cx + 1] - m.S[cy * W1 + cx + 1] - m.S[(cy + 1) * W1 + cx] + m.S[cy * W1 + cx])) continue;
      tot++;
      const px = it.x + m.x0 + cx * m.C + 1, py = it.y + m.y0 + cy * m.C + 1;
      for (const o of items) {
        if (o === it || o.sy <= it.sy || o.l > px || o.r < px || o.t > py || o.b < py) continue;
        if (maskCover(o.m, o.x, o.y, px - 1, py - 1, px + 1, py + 1) > 0.5) { cov++; break; }
      }
    }
    return tot ? cov / tot : 0;
  }

  // 人站在 (x, y) 时被画在他前面的静物盖住多少（0～1）；by：盖住最多的那一个
  hiddenAt(x, y) {
    if (!WORLD_ART.ready) return { f: 0, by: null };
    const x0 = x - HERO_BOX[0], x1 = x + HERO_BOX[0], y0 = y - HERO_BOX[1], y1 = y - HERO_BOX[2];
    let seen = 1, by = null, bm = 0;
    for (const it of this.artItems()) {
      if (it.sy <= y || it.l > x1 || it.r < x0 || it.t > y1 || it.b < y0) continue;
      const c = maskCover(it.m, it.x, it.y, x0, y0, x1, y1);
      if (c > 0) { seen *= 1 - c; if (c > bm) { bm = c; by = it; } }
    }
    return { f: 1 - seen, by };
  }

  // 碰撞：地图边缘、地点的底座、散件的底座、守灯驿的人、未解锁的封印。会不会被盖住不影响能不能走（盖住时画剪影）
  blocked(x, y) {
    return this.solid(x, y);
  }

  // 散件的底座：素材里贴地那一段（FOOT_BAND）里「实心」的列（八成以上不透明 —— 稀疏的草叶不算）连成几段，每段一个扁椭圆。
  // 石拱、断墙这类会量出两段（中间的门洞能走），灯柱只量出很窄的一段
  footprints(it, kind) {
    if (NO_BLOCK.has(kind)) return [];
    const m = it.m, C = m.C, W1 = m.w + 1, S = m.S;
    const cell = (r, c) => S[(r + 1) * W1 + c + 1] - S[r * W1 + c + 1] - S[(r + 1) * W1 + c] + S[r * W1 + c];
    let bottom = -1;
    for (let r = m.h - 1; r >= 0 && bottom < 0; r--) for (let c = 0; c < m.w; c++) if (cell(r, c)) { bottom = r; break; }
    if (bottom < 0) return [];
    const [lo, hi] = FOOT_BAND[kind] ?? [4, 16], r0 = Math.max(0, bottom - Math.round(hi / C)), r1 = Math.max(r0, bottom - Math.round(lo / C));
    const dense = [];
    for (let c = 0; c < m.w; c++) { let n = 0; for (let r = r0; r <= r1; r++) n += cell(r, c); dense.push(n >= 0.8 * (r1 - r0 + 1)); }
    const runs = [];
    for (let c = 0, start = -1, last = -9; c <= m.w; c++) {
      if (c < m.w && dense[c]) { if (start < 0 || c - last > 2) { if (start >= 0) runs.push([start, last]); start = c; } last = c; }
      else if (c === m.w && start >= 0) runs.push([start, last]);
    }
    const gy = it.y + m.y0 + (bottom + 1) * C; // 素材的地面线（最下面一行不透明像素）
    return runs.filter(([a, b]) => (b - a + 1) * C >= 6).map(([a, b]) => {
      const rx = Math.max(4, ((b - a + 1) * C) / 2 * 0.85);
      return { x: it.x + m.x0 + ((a + b + 1) / 2) * C, y: gy - 3, rx, ry: Math.min(9, Math.max(4, rx * 0.3)) };
    });
  }
  solid(x, y) {
    if (x < EDGE || x > MAP_W - EDGE || y < EDGE + 40 || y > MAP_H - EDGE + 20) return true;
    for (const s of SITES) {
      const [rx, ry] = s.foot;
      if (!rx) continue;
      const cy = s.y + s.fdy;
      if (((x - s.x) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1) return true;
    }
    for (const s of SITES) for (const [dx, dy, rx, ry] of s.feet ?? []) if (((x - s.x - dx) / rx) ** 2 + ((y - s.y - dy) / ry) ** 2 < 1) return true;
    for (const o of this.props) {
      if (o.buried) continue;
      if (o.feet) { for (const f of o.feet) if (((x - f.x) / f.rx) ** 2 + ((y - f.y) / f.ry) ** 2 < 1) return true; continue; } // 有素材：按素材量出来的底座
      if (o.r && Math.hypot((x - o.x) / 1.3, y - o.y) < o.r) return true;
      if (o.rx && ((x - o.x) / o.rx) ** 2 + ((y - o.y) / o.ry) ** 2 < 1) return true;
    }
    // 没解锁的入口：封印和暗雾画在最上层，人走进去会被盖住 —— 门口挡住（贴上去往里走仍会弹出「未解锁」的卡片）
    for (const st of SITES) {
      if (st.kind !== 'stage' || this.unlocked(st)) continue;
      const [ex, ey] = this.entrance(st);
      if (Math.abs(x - ex) < 42 && y < ey + 4 && y > ey - 90) return true;
    }
    // 守灯驿的人：脚下一小圈挡路
    for (const n of NPCS) if (Math.hypot((x - n.x) / 1.3, y - n.y) < 9) return true;
    return false;
  }

  // 每帧：title = 封面（镜头自己移动，人不能走）；menu = 菜单 / 面板打开时人不动
  update(input, { title = false, frozen = false } = {}) {
    const h = this.hero;
    this.updateMotes();
    // 素材还在载入：一直等（封面显示真实素材的定格图，地图上显示「载入中」），封面镜头也不动；
    // 只有确定载不了（离线、文件缺失）才用程序画的占位
    if (!this.mapReady()) { this.fadeIn = 24; return; }
    if (WORLD_ART.ready && this.itemsOf !== WORLD_ART.land.img) this.artItems(); // 素材刚到：一次算好遮罩
    if (this.fadeIn > 0) this.fadeIn--;
    for (const k in this.flare) this.flare[k]++;
    if (this.caption && ++this.caption.t > 170) this.caption = null;
    if (this.guide && (--this.guide.t <= 0 || Math.hypot(h.x - site(this.guide.id).door[0], h.y - site(this.guide.id).door[1]) < 110)) this.guide = null;
    if (this.leave) {
      if (++this.leave.t === 22) this.leave.go();
      return;
    }
    if (title) {
      const c = (this.titleCam ??= { t: 0 });
      c.t++;
      const u = Math.min(1, c.t / 420), e = u * u * (3 - 2 * u);
      const fx = 1200, fy = 300 + (1150 - 300) * e;
      this.cam.x = clamp(fx - VIEW_W / 2, 0, MAP_W - VIEW_W);
      this.cam.y = clamp(fy - VIEW_H * 0.58, 0, MAP_H - VIEW_H);
      return;
    }
    // 地图事件：镜头移过去、点亮、字幕和对话、镜头回来；期间人不能走
    if (!this.ev && this.events.length && !frozen && !this.fadeIn) this.startEvent(this.events.shift());
    if (this.ev) { this.updateEvent(); this.near = null; return; }
    let dx = frozen ? 0 : input.dx, dy = frozen ? 0 : input.dy;
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    const vx = dx * SPEED, vy = dy * SPEED * 0.8; // 纵向略慢：俯视角下看起来速度一致
    let mx = 0, my = 0;
    const can = (x, y) => !this.solid(x, y);
    if (Math.abs(vx) > 0.05 && can(h.x + vx, h.y)) { h.x += vx; mx = vx; }
    if (Math.abs(vy) > 0.05 && can(h.x, h.y + vy)) { h.y += vy; my = vy; }
    const moved = Math.hypot(mx, my / 0.8); // 纵向按画面上的速度算（纵向本来就慢 0.8）：横、竖、斜走一圈的时间都一样
    if (Math.abs(dx) > 0.15) h.facing = Math.sign(dx);
    h.moving = moved > 0.3 ? Math.min(1, h.moving + 0.25) : Math.max(0, h.moving - 0.2);
    h.phase += moved / (MAP_SCALE / HERO_SCALE); // 换算成战斗尺度的距离（地图上人缩小到 0.6），和战斗用同一张逐帧距离表（sprite.js runFrame），脚踩住地面不滑
    // 镜头：平滑跟随，略微看向前方
    const tx = clamp(h.x - VIEW_W / 2 + h.facing * 30, 0, MAP_W - VIEW_W), ty = clamp(h.y - VIEW_H * 0.58, 0, MAP_H - VIEW_H);
    this.cam.x += (tx - this.cam.x) * 0.1;
    this.cam.y += (ty - this.cam.y) * 0.1;
    // 站在哪个入口 / 哪个人 / 哪块刻字前（取最近的）
    let best = null, bd = 1e9;
    const consider = (o, x, y, r) => { const d = Math.hypot(h.x - x, (h.y - y) * 1.3); if (d < r && d - r < bd) { bd = d - r; best = o; } };
    for (const s of SITES) {
      if (s.kind === 'camp') continue;
      consider(s, s.door[0], s.door[1], NEAR);
      const [ex, ey] = this.entrance(s);
      consider(s, ex, ey + 6, 44); // 站到门口 / 台阶口上也算
    }
    // 走进入口：贴着门口还往里走 → 打开这个地点的卡片（和按攻击键一样）；离开门口以后才会再次触发
    const inDoor = SITES.find((s) => s.kind !== 'camp' && Math.abs(h.x - this.entrance(s)[0]) < WALK_IN[0] && Math.abs(h.y - this.entrance(s)[1]) < WALK_IN[1]);
    if (!inDoor) this.walkIn = null;
    else if (dy < -0.3 && !frozen && this.walkIn !== inDoor.id) { this.walkIn = inDoor.id; this.onWalkIn?.(inDoor.id); }
    for (const n of NPCS) consider({ kind: 'npc', id: n.id, npc: n, door: [n.x, n.y] }, n.x, n.y + 10, 46);
    for (const c of INSCRIPTIONS) consider({ kind: 'read', id: c.id, read: c, door: [c.x, c.y] }, c.x, c.y + 8, 42);
    this.near = best;
  }

  // ---------- 地图事件 ----------
  startEvent(e) {
    const camp = site('camp');
    const focus = { greet: [this.hero.x, this.hero.y], beacon: e.site && site(e.site).beacon, trial: [site('trial').x, site('trial').y - 60], ending: [camp.x, camp.y - 120] }[e.kind];
    this.ev = { e, t: 0, phase: 'pan', focus };
  }
  updateEvent() {
    const ev = this.ev, e = ev.e, w = worldSave(this.save), g = this.g, storyOn = settings.story !== 'off';
    ev.t++;
    const look = (x, y, k) => {
      this.cam.x += (clamp(x - VIEW_W / 2, 0, MAP_W - VIEW_W) - this.cam.x) * k;
      this.cam.y += (clamp(y - VIEW_H * 0.5, 0, MAP_H - VIEW_H) - this.cam.y) * k;
    };
    if (ev.phase === 'pan') {
      look(...ev.focus, 0.07);
      if (ev.t < (e.kind === 'greet' ? 10 : 55)) return;
      ev.phase = 'act'; ev.t = 0;
      if (e.kind === 'greet') {
        w.greeted = true;
        w.heard['zhupo:0'] = true;
        this.talking = 'zhupo';
        ev.phase = 'talk';
        g.story.showTalk(TALKS.zhupo[0], { onEnd: () => { this.talking = null; ev.phase = 'back'; ev.t = 0; } });
        return;
      }
      if (e.kind === 'beacon') { w.lit[STAGES[e.stage].id] = true; this.flare[e.site] = 0; this.caption = { text: `${STAGES[e.stage].name}的烽灯，亮了`, t: 0 }; }
      if (e.kind === 'trial') { w.trial = true; this.flare.trial = 0; this.caption = { text: '试炼碑醒了', t: 0 }; }
      if (e.kind === 'ending') { w.ending = true; this.flare.camp = 0; this.caption = { text: '长明灯塔，重新亮了', t: 0 }; }
      sfx(e.kind === 'ending' ? 'roar' : 'chest');
      g.store.save();
      return;
    }
    if (ev.phase === 'act') {
      look(...ev.focus, 0.07);
      if (ev.t < 70) return;
      const lines = { beacon: BEACON_LINES[e.stage], trial: TRIAL_LINES, ending: ENDING_LINES }[e.kind];
      if (storyOn && lines) {
        ev.phase = 'talk';
        if (e.kind === 'ending') for (const n of NPCS) w.heard[`${n.id}:end`] = true; // 尾声里已经说过了
        g.story.showTalk(lines, { onEnd: () => { ev.phase = 'back'; ev.t = 0; } });
      } else { ev.phase = 'back'; ev.t = 0; }
      return;
    }
    if (ev.phase === 'talk') { look(...ev.focus, 0.07); return; }
    // 镜头回到人身上
    look(this.hero.x, this.hero.y - VIEW_H * 0.08, 0.1);
    if (ev.t > 36) { this.ev = null; g.store.save(); }
  }

  // 和守灯驿的人说话、读刻字：由 main.js 调用（对话框和选项在 story.js）
  talkTo(id) { this.talking = id; worldSave(this.save).heard[`${id}:${progress(this.save)}`] = true; }

  // 进关：画面收拢变黑，然后执行 go
  launch(go) {
    if (this.leave) return;
    this.leave = { t: 0, go };
  }

  updateMotes() {
    const t = this.g.ticks;
    // 深渊往上冒的光点，点亮的烽灯的火星
    if (t % 3 === 0) this.motes.push({ x: 1200 + (Math.random() - 0.5) * 600, y: 220 + (Math.random() - 0.5) * 160, z: 0, vz: 0.3 + Math.random() * 0.5, life: 160, max: 160, c: '#b49aff' });
    // 刚点亮的那一下：往上喷一阵火星
    for (const [k, f] of Object.entries(this.flare)) {
      if (f > 30) continue;
      const G = WORLD_ART.ready ? GEO.art : GEO.placeholder; // 火星从光的位置喷出（素材和占位的高度不同）
      const s = site(k), [x, y, z, c] = k === 'camp' ? [s.x, s.y, G.lantern, '#ffd27a'] : k === 'trial' ? [s.x, s.y, G.trialZ, '#7ff3ff'] : [s.beacon[0], s.beacon[1], G.flame, '#ffb45a'];
      for (let i = 0; i < 3; i++) this.motes.push({ x: x + (Math.random() - 0.5) * 30, y, z: z + (Math.random() - 0.5) * 20, vz: 0.8 + Math.random() * 2, life: 70, max: 70, c, fire: k !== 'trial' });
    }
    const fz = (WORLD_ART.ready ? GEO.art : GEO.placeholder).flame;
    for (const s of SITES) if (this.lit(s) && t % 9 === 0) this.motes.push({ x: s.beacon[0] + (Math.random() - 0.5) * 8, y: s.beacon[1], z: fz, vz: 0.6 + Math.random() * 0.5, life: 60, max: 60, c: '#ffb45a', fire: true });
    for (const m of this.motes) { m.z += m.vz; m.x += Math.sin((t + m.y) * 0.03) * 0.3; m.life--; }
    this.motes = this.motes.filter((m) => m.life > 0);
  }

  // ---------- 地面缓存：底色、区域色、道路（进度变化时重画）----------
  ground() {
    const s = this.save, key = STAGES.map((st, i) => +isUnlocked(s, i)).join('');
    if (this.groundC && this.groundKey === key) return this.groundC;
    const k = MOBILE ? 0.5 : 1;
    const c = (this.groundC ??= mk(MAP_W * k, MAP_H * k)), g = c.getContext('2d');
    this.groundKey = key;
    this.groundK = k;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.fillStyle = '#25222a';
    g.fillRect(0, 0, MAP_W, MAP_H);
    const R = rng(3);
    // 斑驳的荒原：大大小小的深浅色块
    for (let i = 0; i < 520; i++) {
      const x = R() * MAP_W, y = R() * MAP_H, r = 20 + R() * 90;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const c0 = R() < 0.5 ? 'rgba(52,46,50,.35)' : R() < 0.5 ? 'rgba(10,9,14,.4)' : 'rgba(58,52,40,.22)';
      gr.addColorStop(0, c0); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // 区域：①墓园土偏褐，④⑤灰烬地偏灰
    const zone = (x, y, r, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
    zone(640, 860, 300, 'rgba(40,30,26,.55)');
    zone(1900, 470, 340, 'rgba(70,68,74,.28)');
    zone(1200, 260, 520, 'rgba(60,56,70,.3)');
    zone(1200, 1170, 260, 'rgba(60,48,36,.3)');
    // 草丛小点
    for (let i = 0; i < 2600; i++) {
      const x = R() * MAP_W, y = R() * MAP_H;
      g.fillStyle = R() < 0.6 ? 'rgba(80,72,64,.35)' : 'rgba(20,18,24,.5)';
      g.fillRect(x, y, 2, 1 + R() * 3);
    }
    // 道路：通了的段是石路，没通的段长满荒草（只剩一点痕迹）
    for (const r of ROADS) {
      const open = r.open(s);
      const path = () => { g.beginPath(); r.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); };
      g.lineJoin = g.lineCap = 'round';
      path(); g.strokeStyle = open ? 'rgba(14,12,16,.6)' : 'rgba(14,12,16,.25)'; g.lineWidth = open ? 46 : 30; g.stroke();
      path(); g.strokeStyle = open ? '#3a3438' : 'rgba(46,40,44,.45)'; g.lineWidth = open ? 38 : 22; g.stroke();
      if (!open) continue;
      // 石块
      for (let i = 1; i < r.pts.length; i++) {
        const [ax, ay] = r.pts[i - 1], [bx, by] = r.pts[i], L = Math.hypot(bx - ax, by - ay);
        for (let d = 0; d < L; d += 7) {
          const u = d / L, ox = (R() - 0.5) * 30, oy = (R() - 0.5) * 22;
          g.fillStyle = R() < 0.5 ? '#4a4248' : '#2c272e';
          g.beginPath(); g.ellipse(ax + (bx - ax) * u + ox, ay + (by - ay) * u + oy, 4 + R() * 3, 2.5 + R() * 2, 0, 0, Math.PI * 2); g.fill();
        }
      }
    }
    return c;
  }

  groundKeyNow() { return STAGES.map((st, i) => +isUnlocked(this.save, i)).join(''); }

  // 入口的位置：有素材时用素材标的入口点（门口 / 台阶口），没有就用站位点
  entrance(st) {
    if (WORLD_ART.ready && WORLD_ART.land.has(SITE_ART[st.id])) { const [dx, dy] = WORLD_ART.land.entrance(SITE_ART[st.id]); return [st.x + dx, st.y + dy]; }
    return [st.door[0], st.door[1] - 18];
  }

  // 一块地面（逻辑坐标 x0, y0 起、size 见方）：荒原打底 → 区域混合 → 道路 → 贴花
  paintGround(g, x0, y0, size, k) {
    const A = WORLD_ART, T = (this.tmp ??= document.createElement('canvas'));
    if (T.width !== Math.ceil(size * k)) { T.width = T.height = Math.ceil(size * k); }
    const tg = T.getContext('2d');
    const m = g.getTransform();
    // 在临时画布上画一层（同样的坐标），再按透明度叠到地面上
    const layer = (paint, alpha = 1) => {
      tg.setTransform(1, 0, 0, 1, 0, 0);
      tg.globalCompositeOperation = 'source-over';
      tg.clearRect(0, 0, T.width, T.height);
      tg.setTransform(m);
      paint(tg);
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = alpha;
      g.drawImage(T, 0, 0);
      g.restore();
    };
    g.fillStyle = A.pattern(g, 'moor');
    g.fillRect(x0, y0, size, size);
    const inChunk = (x, y, r) => x + r > x0 && x - r < x0 + size && y + r > y0 && y - r < y0 + size;
    for (const [t, x, y, r, alpha] of ZONES) {
      if (!inChunk(x, y, r)) continue;
      layer((c) => {
        c.fillStyle = A.pattern(c, t);
        c.fillRect(x0, y0, size, size);
        c.globalCompositeOperation = 'destination-in';
        const gr = c.createRadialGradient(x, y, r * 0.35, x, y, r);
        gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = gr;
        c.fillRect(x0, y0, size, size);
      }, alpha);
    }
    // 道路：通了的段是石路（边上压一道暗边），没通的段只剩一点痕迹
    for (const r of ROADS) {
      if (!r.pts.some(([x, y]) => inChunk(x, y, 400))) continue;
      const open = r.open(this.save);
      const path = (c) => { c.beginPath(); r.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); };
      g.lineJoin = g.lineCap = 'round';
      if (open) { path(g); g.strokeStyle = 'rgba(8,6,10,.35)'; g.lineWidth = 52; g.stroke(); }
      layer((c) => {
        c.lineJoin = c.lineCap = 'round';
        path(c); c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = open ? 48 : 30; c.stroke();
        path(c); c.strokeStyle = '#000'; c.lineWidth = open ? 38 : 20; c.stroke();
        c.globalCompositeOperation = 'source-in';
        c.fillStyle = A.pattern(c, 'road');
        c.fillRect(x0, y0, size, size);
      }, open ? 1 : 0.3);
    }
    for (const d of DECALS) if (!STAND_DECALS.has(d.id) && inChunk(d.x, d.y, 80)) A.props.draw(g, d.id, d.x, d.y, 1, d.flip);
  }

  // ---------- 绘制 ----------
  // 返回这一帧的光源（屏幕坐标）和发光物，交给 main.js 的光照 / 泛光
  draw(ctx, t) {
    const cx = Math.round(this.cam.x), cy = Math.round(this.cam.y), s = this.save;
    const art = WORLD_ART.ready, A = WORLD_ART;
    const lights = [], glows = [];
    const scr = (x, y, z = 0) => [x - cx, y - cy - z];
    const vis = (x, y, m) => x > cx - m && x < cx + VIEW_W + m && y > cy - m && y < cy + VIEW_H + m * 1.6;
    if (art) {
      // 地面：按区块缓存（桌面最多 2 倍清晰度，手机 1 倍）
      const k = MOBILE ? 1 : Math.min(2, Math.max(1, Math.round(this.g.scale * 2) / 2));
      this.groundKey = this.groundKeyNow(); // 道路随进度打通：版本变了，地面区块全部重画
      // 镜头接下来要去的地方：事件里是事件的焦点，平时按镜头移动的方向往前看约半秒
      const lc = (this.lastCam ??= { x: cx, y: cy });
      const ahead = this.ev ? [clamp(this.ev.focus[0] - VIEW_W / 2, 0, MAP_W - VIEW_W), clamp(this.ev.focus[1] - VIEW_H / 2, 0, MAP_H - VIEW_H)]
        : [clamp(cx + (cx - lc.x) * 30, 0, MAP_W - VIEW_W), clamp(cy + (cy - lc.y) * 30, 0, MAP_H - VIEW_H)];
      lc.x = cx; lc.y = cy;
      A.ground(ctx, cx, cy, VIEW_W, VIEW_H, k, this.groundKey, (g, x0, y0, size) => this.paintGround(g, x0, y0, size, k), ahead);
    } else {
      const G = this.ground(), k = this.groundK;
      ctx.drawImage(G, cx * k, cy * k, VIEW_W * k, VIEW_H * k, 0, 0, VIEW_W, VIEW_H);
    }

    // 要按 y 排序的东西（排序线的 y 越大越靠前；有素材时地点按入口线排，见 artItems）
    const list = [];
    const P = A.props, L = A.land;
    if (art) {
      for (const it of this.artItems()) if (vis(it.x, it.y, it.vm)) list.push({ y: it.sy, d: () => it.A.draw(ctx, it.id, ...scr(it.x, it.y), it.s, it.flip) });
    } else {
      for (const o of this.props) if (vis(o.x, o.y, 120)) list.push({ y: o.y, d: () => this.blit(ctx, this.propArt(o), ...scr(o.x, o.y)) });
      for (const st of SITES) {
        if (vis(st.x, st.y, 460)) list.push({ y: st.y, d: () => this.blit(ctx, this.art_(SITE_ART[st.id]), ...scr(st.x, st.y)) });
        if (st.beacon && vis(st.beacon[0], st.beacon[1], 220)) list.push({ y: st.beacon[1], d: () => this.blit(ctx, this.art_('beacon'), ...scr(st.beacon[0], st.beacon[1])) });
      }
    }
    // 地图四周的枯林、断崖（只在有素材时画；走不到那里，只是挡住地图外面）
    // 没解锁的入口：锁链封印（盖在入口上）+ 一团暗雾。和地点一起按入口线排序（排在地点后面）：
    // 人站在封印前面时画在封印上面，不会被锁链和暗雾盖住；封印后面走不进去（见 solid）
    for (const st of SITES) {
      if (this.unlocked(st) || !vis(st.x, st.y, 300)) continue;
      const [ex, ey] = this.entrance(st);
      list.push({ y: (art ? ey : st.y) + 0.01, d: () => {
        const [x, y] = scr(ex, ey - 22);
        // 暗雾：光照包 seal_fog（普通混合），染成深紫黑，慢慢起伏
        const fog = lightTex('seal_fog');
        if (fog) {
          const img = tinted(fog, '#120a1c'), k = (220 / fog.fw) * (1 + 0.04 * Math.sin(t * 0.03 + ex));
          ctx.save();
          ctx.globalAlpha = 0.85;
          ctx.drawImage(img, x - fog.cx * k, y - 10 - fog.cy * k, fog.width * k, fog.height * k);
          ctx.restore();
        }
        if (art) L.draw(ctx, 'seal', x, y, SEAL_S);
        else this.blit(ctx, this.art_('seal'), x, y + 30);
      } });
    }
    const h = this.hero;
    for (const n of NPCS) if (vis(n.x, n.y, 80)) list.push({ y: n.y, d: () => this.drawNpc(ctx, n, ...scr(n.x, n.y), t) });
    list.push({ y: h.y, d: () => this.drawHero(ctx, ...scr(h.x, h.y), t) });
    list.sort((a, b) => a.y - b.y);
    for (const o of list) o.d();
    // 走到树冠、灯柱、碑后面被挡住一部分：最上层补一个半透明剪影，任何时候都看得到自己在哪
    if (art && !this.__noGhost && heroSprite.ready && this.hiddenAt(h.x, h.y).f > HIDE_GHOST) heroSprite.draw(ctx, this.heroFrame(t), ...scr(h.x, h.y), h.facing, { scale: MAP_SCALE, ghost: '#bfe4ff', alpha: 0.42 });

    // 光源
    const lit = this.litCount();
    const camp = site('camp');
    // 长明灯塔：烽灯越多越亮；结局以后全亮（点亮那一下有一阵闪光）
    const full = this.ended(), cf = this.flare.camp;
    const burst = (f) => (f == null ? 0 : Math.max(0, 1 - f / 50));
    const G = art ? GEO.art : GEO.placeholder;
    lights.push([...scr(camp.x, camp.y - 120), full ? 560 : 300 + lit * 40, full ? 1 : 0.7 + lit * 0.06, 'lantern']);
    glows.push({ x: camp.x, y: camp.y, z: G.lantern, r: (full ? 22 : 10 + lit * 2) * (1 + burst(cf) * 2.5), c: '#ffd27a', a: full ? 1 : 0.6 + lit * 0.08, warm: true });
    lights.push([...scr(...G.abyss), 380, 0.42, 'magic']); // 深渊往上透的光
    for (const st of SITES) {
      if (this.lit(st)) {
        // 刚点亮：火苗从小到大、先闪一下，光慢慢铺开
        const f = this.flare[st.id], grow = f == null ? 1 : Math.min(1, f / 40);
        lights.push([...scr(st.beacon[0], st.beacon[1], G.flame * 0.8), 300 * (0.3 + 0.7 * grow), 1, 'flame']);
        glows.push({ x: st.beacon[0], y: st.beacon[1], z: G.flame, r: 16 * (0.4 + 0.6 * grow) * (1 + burst(f) * 2), c: '#ffb45a', a: 1, flicker: true });
      }
      if (st.kind === 'stage' && this.unlocked(st)) { const [ex, ey] = this.entrance(st); lights.push([...scr(ex, ey - 30), 150, 0.5]); }
      if (st.kind === 'trial' && this.trialAwake()) {
        const f = this.flare.trial, grow = f == null ? 1 : Math.min(1, f / 60);
        lights.push([...scr(st.x, st.y, G.trialZ), 150 * (0.3 + 0.7 * grow), 0.5 + burst(f) * 0.5, 'magic']);
        glows.push({ x: st.x + G.trialDx, y: st.y, z: G.trialZ, r: 9 * (1 + burst(f) * 2), c: '#7ff3ff', a: (0.55 + 0.2 * Math.sin(t * 0.05)) * grow, rune: G.rune });
      }
      if (st.kind === 'training') lights.push([...scr(st.x, st.y - 40), 120, 0.35]);
    }
    lights.push([...scr(h.x, h.y, 30), 210, 1]);
    // 阿砾罐子里的一点残光
    const ali = NPCS.find((n) => n.id === 'ali');
    if (!this.ended()) glows.push({ x: ali.x + 7, y: ali.y, z: 18, r: 3, c: '#d8f0ff', a: 0.7 + 0.3 * Math.sin(t * 0.09) });
    this.frameLights = lights;
    this.frameGlows = glows;
    this.frameScr = scr;
    return { lights, glows };
  }

  // 自发光的东西（光照之后、画在黑暗上面）：火焰、光点、试炼碑的刻纹
  drawGlow(ctx, t) {
    const scr = this.frameScr, T = tex();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const g of this.frameGlows) {
      const [x, y] = scr(g.x, g.y, g.z), f = g.flicker ? 0.85 + 0.15 * Math.sin(t * 0.37 + g.x) : 1;
      if (T.light) {
        ctx.globalAlpha = g.a * f;
        const warm = g.flicker || g.warm, r = g.r * (warm ? 2.5 : 3.2) * f; // 火光（烽灯、灯塔）用 glow_warm：它中心更集中、外圈更亮，画小一点
        ctx.drawImage(tinted(warm ? T.warm : T.glow, g.c), x - r, y - r, r * 2, r * 2);
        ctx.globalAlpha = Math.min(1, g.a * 1.2);
        ctx.drawImage(tinted(T.core, '#fff2d0'), x - g.r * 0.5, y - g.r * 0.8, g.r, g.r * 1.2);
      }
      if (g.rune) {
        ctx.globalAlpha = 1;
        drawSceneRunes(ctx, x, y, t, g.rune, g.a);
      }
    }
    // 光点：深渊冒的光用 mote，烽灯 / 灯塔的火星用 ember（光照包，按颜色染色）
    if (T.light) for (const m of this.motes) {
      const [x, y] = scr(m.x, m.y, m.z);
      if (x < -10 || x > VIEW_W + 10 || y < -10 || y > VIEW_H + 10) continue;
      ctx.globalAlpha = Math.min(1, m.life / 30, (m.max - m.life) / 20) * 0.9;
      const img = tinted(m.fire ? T.ember : T.mote, m.c), s = m.fire ? 9 : 8;
      ctx.drawImage(img, x - s / 2, y - s / 2, s, s);
    }
    ctx.restore();
  }

  blit(ctx, a, x, y) {
    ctx.drawImage(a.c, x - a.ax, y - a.ay, a.w, a.h);
  }

  heroFrame(t) {
    const S = heroSprite, h = this.hero;
    if (h.moving > 0.3) return S.frame('run', runFrame(h.phase)); // 和战斗里同一套 8 帧循环，按走过的距离换帧
    const n = S.meta.anims.idle.frames.length;
    return S.frame('idle', Math.floor(t / 9) % n);
  }

  // 守灯驿的人（占位：程序画的小人，素材回来后换成逐帧精灵）。说话时转向绯隼、手上有动作；有没听过的话，头上一个「!」
  drawNpc(ctx, n, x, y, t) {
    const L = n.look, H = n.h, talk = this.talking === n.id, near = Math.hypot(this.hero.x - n.x, this.hero.y - n.y) < 140;
    const face = near || talk ? Math.sign(this.hero.x - n.x) || 1 : n.id === 'moheng' ? -1 : 1;
    const S = WORLD_ART.npcs[n.id];
    if (S?.ready) {
      // 逐帧素材：说话时播 talk，平时 idle；和绯隼同一个缩放（地图上的人都按同一把尺子）
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.beginPath(); ctx.ellipse(x, y, H * 0.24, 4, 0, 0, Math.PI * 2); ctx.fill();
      S.draw(ctx, S.frame(talk ? 'talk' : 'idle', Math.floor((t * 16.7 + n.x * 3) / 167) % 4), x, y, face, { scale: MAP_SCALE, rim: '#9fd8ff', rimAlpha: 0.22 });
      this.drawBang(ctx, n, x, y, t, talk);
      return;
    }
    const bob = Math.sin(t * 0.05 + n.x) * 0.8, gest = talk ? Math.sin(t * 0.25) * 0.5 + 0.5 : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath(); ctx.ellipse(0, 0, H * 0.22, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.scale(face, 1);
    const top = -H + bob, w = H * 0.2;
    // 腿 / 袍子下摆
    poly(ctx, [[-w * 1.1, 0], [w * 1.1, 0], [w * 0.8, top + H * 0.45], [-w * 0.8, top + H * 0.45]], L.robe, RIM, 1);
    // 斗篷
    poly(ctx, [[-w * 1.35, -H * 0.12], [w * 0.5, -H * 0.1], [w * 0.9, top + H * 0.3], [0, top + H * 0.18], [-w * 0.9, top + H * 0.3]], L.cloak, RIM, 1);
    // 头、头发
    const hy = top + H * 0.12;
    ctx.fillStyle = L.skin; ctx.beginPath(); ctx.arc(w * 0.25, hy, H * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = L.hair; ctx.beginPath(); ctx.arc(w * 0.1, hy - H * 0.03, H * 0.1, Math.PI * 0.95, Math.PI * 2.1); ctx.fill();
    // 手和道具
    const hx = w * 1.1, hand = top + H * 0.42 - gest * H * 0.12;
    ctx.strokeStyle = L.prop === 'arm' ? '#3a3a44' : L.skin; ctx.lineWidth = L.prop === 'arm' ? 4 : 2.5;
    ctx.beginPath(); ctx.moveTo(w * 0.4, top + H * 0.3); ctx.lineTo(hx, hand); ctx.stroke();
    if (L.prop === 'pole') {
      ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(hx + 2, 0); ctx.lineTo(hx + 2, top - H * 0.1); ctx.lineTo(hx + 7, top - H * 0.06); ctx.stroke();
      poly(ctx, [[hx + 5, top - H * 0.06], [hx + 10, top - H * 0.06], [hx + 10, top + H * 0.02], [hx + 5, top + H * 0.02]], '#1c1a22', RIM, 1);
    } else if (L.prop === 'arm') {
      ctx.fillStyle = '#4a4a54'; ctx.beginPath(); ctx.arc(hx, hand, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a4030'; ctx.fillRect(-w * 0.7, top + H * 0.36, w * 1.4, H * 0.4); // 围裙
    } else if (L.prop === 'jar') {
      ctx.fillStyle = 'rgba(160,190,210,.5)'; ctx.fillRect(hx - 2, hand - 4, 6, 7);
      ctx.fillStyle = '#6a5a3a'; ctx.fillRect(-w * 1.3, top + H * 0.3, w * 0.8, H * 0.3); // 背着的地图包
    }
    ctx.restore();
    this.drawBang(ctx, n, x, y, t, talk);
  }

  // 「!」：有新的话
  drawBang(ctx, n, x, y, t, talk) {
    const H = n.h;
    if (!talk && hasNew(n.id, this.save) && !this.ev) {
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `600 ${18 + Math.sin(t * 0.15) * 1.5}px ${FONT_NUM}`;
      ctx.lineWidth = 3; ctx.strokeStyle = '#1a1206'; ctx.fillStyle = '#ffd65a';
      ctx.strokeText('!', x, y - H - 14); ctx.fillText('!', x, y - H - 14);
      ctx.restore();
    }
  }

  drawHero(ctx, x, y, t) {
    const h = this.hero;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath(); ctx.ellipse(x, y, 13, 4, 0, 0, Math.PI * 2); ctx.fill();
    if (heroSprite.ready) {
      heroSprite.draw(ctx, this.heroFrame(t), x, y, h.facing, { scale: MAP_SCALE, rim: '#9fd8ff', rimAlpha: 0.3 });
    } else {
      ctx.save(); ctx.translate(x, y); ctx.scale(0.6, 0.6);
      drawFighter(ctx, 0, 0, this.g.playerLook(), { crouch: 0.05, angle: 1.1, walk: h.moving ? h.phase * 0.7 : 0, lean: 2 }, { facing: h.facing, t });
      ctx.restore();
    }
  }

  // 地点提示（画在最上层）：名字、推荐等级 / 解锁条件、按键
  drawPrompt(ctx, t, touch) {
    const s = this.near;
    if (!s || this.leave || (this.caption && this.caption.t < 140)) return; // 事件字幕还在时先不出提示
    // 地点的提示跟着人往上挪：走进门口（比站位点更靠里）时，提示框仍然在头顶上方，不压在人身上
    const py = s.kind === 'npc' || s.kind === 'read' ? s.door[1] : Math.min(s.door[1], this.hero.y);
    const [x, y] = this.frameScr(s.door[0], py, 0);
    const info = this.siteInfo(s);
    const top = y - (s.kind === 'npc' ? s.npc.h + 58 : s.kind === 'read' ? 84 : 116);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = Math.max(150, ctx.measureText(info.sub).width + 60);
    const bg = ctx.createLinearGradient(x - w, 0, x + w, 0);
    bg.addColorStop(0, 'rgba(10,8,14,0)'); bg.addColorStop(0.5, 'rgba(10,8,14,.82)'); bg.addColorStop(1, 'rgba(10,8,14,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(x - w, top - 26, w * 2, 74);
    ctx.font = `24px ${FONT_TITLE}`;
    ctx.fillStyle = info.locked ? '#8f859a' : '#e9cf8e';
    ctx.fillText(info.name, x, top - 6);
    ctx.font = `13px ${FONT_UI}`;
    ctx.fillStyle = info.warn ? '#ff8a6a' : '#c9c0dc';
    ctx.fillText(info.sub, x, top + 18);
    if (!info.locked) {
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 0.12);
      ctx.font = `600 13px ${FONT_UI}`;
      ctx.fillStyle = COLORS.blade;
      const verb = info.verb ?? '进入';
      ctx.fillText(touch ? `点「攻」${verb}` : `按 J ${verb}`, x, top + 38);
    }
    ctx.restore();
  }

  siteInfo(s) {
    const sv = this.save;
    if (s.kind === 'npc') return { name: SPEAKERS[s.id].name, sub: { zhupo: '守灯驿最老的守灯人', moheng: '铁匠 · 从前的守灯人', ali: '捡废墟的孩子' }[s.id], verb: '交谈' };
    if (s.kind === 'read') return { name: s.read.title, sub: worldSave(sv).read[s.id] ? '读过了' : '上面刻着字', verb: '阅读' };
    if (s.kind === 'stage') {
      const st = STAGES[s.stage], open = this.unlocked(s);
      if (!open) return { name: st.name, sub: `通关「${STAGES[s.stage - 1].name}」解锁`, locked: true };
      const best = sv.best[st.id];
      return { name: st.name, sub: `推荐 Lv.${st.lv} · 首领「${BOSSES[st.boss].name}」${best ? ` · 最佳 ${best.letter}` : ''}`, warn: sv.lv < st.lv };
    }
    if (s.kind === 'trial') {
      if (!this.unlocked(s)) return { name: s.name, sub: `通关「${STAGES[0].name}」解锁`, locked: true };
      return { name: s.name, sub: sv.trialBest ? `纪录 第 ${sv.trialBest} 层` : '一层一个房间，每 5 层一个首领' };
    }
    if (s.kind === 'training') return { name: s.name, sub: `挑战 ${(sv.training || []).length} / ${CHALLENGES.length}` };
    return { name: s.name, sub: '' };
  }

  // 左上角：地名和等级；进关的收拢黑屏、回地图的淡入
  drawOverlay(ctx, t, { title } = {}) {
    if (!title) {
      ctx.save();
      ctx.font = `22px ${FONT_TITLE}`;
      ctx.fillStyle = '#e9cf8e';
      ctx.textBaseline = 'top';
      ctx.fillText('守灯原', 18, 14);
      ctx.font = `500 16px ${FONT_NUM}`;
      ctx.fillStyle = '#c9c0dc';
      ctx.fillText(`LV.${this.save.lv}   烽灯 ${this.litCount()} / ${STAGES.length}`, 20, 44);
      ctx.restore();
    }
    // 阿砾指路：人身边一个箭头指向下一个地方
    if (this.guide && !title) {
      const g = site(this.guide.id), [hx, hy] = this.frameScr(this.hero.x, this.hero.y, 30);
      const ang = Math.atan2(g.door[1] - this.hero.y, g.door[0] - this.hero.x), r = 46;
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.guide.t / 30) * (0.7 + 0.3 * Math.sin(t * 0.12));
      ctx.translate(hx + Math.cos(ang) * r, hy + Math.sin(ang) * r * 0.8);
      ctx.rotate(ang);
      ctx.fillStyle = '#a6dc86';
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -8); ctx.lineTo(-2, 0); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // 事件字幕
    if (this.caption) {
      const c = this.caption, a = Math.min(1, c.t / 20, (170 - c.t) / 30);
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      const band = ctx.createLinearGradient(0, 0, VIEW_W, 0);
      band.addColorStop(0, 'rgba(8,6,12,0)'); band.addColorStop(0.5, 'rgba(8,6,12,.75)'); band.addColorStop(1, 'rgba(8,6,12,0)');
      ctx.fillStyle = band; ctx.fillRect(0, 96, VIEW_W, 64);
      ctx.font = `32px ${FONT_TITLE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(255,190,110,.6)'; ctx.shadowBlur = 18;
      ctx.fillStyle = '#f3dfa6'; ctx.fillText(c.text, VIEW_W / 2, 128);
      ctx.restore();
    }
    let a = this.fadeIn / 24;
    if (this.leave) {
      // 往入口收拢：一圈越来越小的光
      const u = Math.min(1, this.leave.t / 20), [x, y] = this.frameScr(this.hero.x, this.hero.y, 30);
      const r = Math.max(1, (1 - u) * 700);
      ctx.save();
      const gr = ctx.createRadialGradient(x, y, r * 0.6, x, y, r);
      gr.addColorStop(0, 'rgba(5,4,8,0)'); gr.addColorStop(1, 'rgba(5,4,8,1)');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.restore();
      a = Math.max(a, u > 0.95 ? 1 : 0);
    }
    if (a > 0) { ctx.fillStyle = `rgba(5,4,8,${a})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
  }
}

// 封面：标题浮在地图上（镜头从深渊慢慢移到守灯驿）
export function drawWorldTitle(ctx, game) {
  const t = game.ticks, a = Math.min(1, t / 60);
  ctx.save();
  const band = ctx.createLinearGradient(0, 80, 0, 330);
  band.addColorStop(0, 'rgba(6,4,10,0)'); band.addColorStop(0.5, `rgba(6,4,10,${0.62 * a})`); band.addColorStop(1, 'rgba(6,4,10,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, 80, VIEW_W, 250);
  ctx.globalAlpha = a;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lx = VIEW_W / 2;
  ctx.font = `100px ${FONT_TITLE}`;
  ctx.shadowColor = 'rgba(127,243,255,.55)';
  ctx.shadowBlur = 30;
  const tg = ctx.createLinearGradient(0, 120, 0, 220);
  tg.addColorStop(0, '#ffffff'); tg.addColorStop(0.6, '#e9e2d6'); tg.addColorStop(1, '#9d93a8');
  ctx.fillStyle = tg;
  ctx.fillText('残光之刃', lx, 170);
  ctx.shadowBlur = 0;
  ctx.font = `500 19px ${FONT_NUM}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '9px';
  ctx.fillStyle = '#e9cf8e';
  ctx.fillText('AFTERGLOW BLADE', lx + 4, 250);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.font = `15px ${FONT_UI}`;
  ctx.fillStyle = 'rgba(233,226,214,.75)';
  ctx.fillText('长夜第一百零七年 · 守灯原', lx, 286);
  if (t > 60) {
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 0.07);
    ctx.font = `20px ${FONT_TITLE}`;
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(game.touch ? '点 击 开 始' : '按 J 或点击开始', lx, VIEW_H - 70);
    if (!game.touch) {
      ctx.globalAlpha = 0.7;
      ctx.font = `13px ${FONT_UI}`;
      ctx.fillStyle = '#8f859a';
      ctx.fillText('地图上：WASD 走路 · J 进入 · Esc 菜单 · B 角色 · M 音乐', lx, VIEW_H - 38);
    }
  }
  ctx.restore();
}
