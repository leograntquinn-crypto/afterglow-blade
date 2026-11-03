// 大地图「守灯原」：可以走的地图，走到关卡入口按攻击键进关。设计见 docs/DESIGN_WORLD.md。
//
// 俯视 3/4 视角，地图逻辑尺寸 MAP_W × MAP_H，镜头跟着人走。人物用现有的侧面逐帧精灵（缩小）。
// 素材（docs/ART_V7.md）回来之前，地面、道路、地标、散件都是程序画的占位：
//   地面和道路画进一张缓存画布（进度变化时重画），地标和散件各自缓存成小画布，按锚点的 y 排序遮挡。
// 光：长明灯塔、点亮的烽灯、深渊、试炼碑、人物身上的光，交给现有的光照 / 后处理管线。
import { VIEW_W, VIEW_H, FONT_TITLE, FONT_UI, FONT_NUM, COLORS, clamp } from './config.js';
import { heroSprite, MOBILE } from './sprite.js';
import { STAGES, isUnlocked } from './stages.js';
import { BOSSES } from './boss.js';
import { CHALLENGES } from './training.js';
import { tex, tinted } from './fx_tex.js';
import { drawFighter } from './rig.js';

export const MAP_W = 2400, MAP_H = 1500;
const EDGE = 80; // 地图四周的枯林带，走不进去
const HERO_H = 58; // 地图上人物的站立高度（战斗里约 96）
const SPEED = 2.4; // 每帧走多少（逻辑像素）
const NEAR = 64; // 离入口多近算「站在入口前」

// ---------------- 地点 ----------------
// x, y：锚点（底部中心）；foot：底座椭圆的半径 [rx, ry]，挡路；door：站在哪里算入口前（默认锚点正前方）
export const SITES = [
  { id: 'camp', kind: 'camp', name: '守灯驿', x: 1200, y: 1150, foot: [150, 52], door: [1200, 1200] },
  { id: 's1', kind: 'stage', stage: 0, x: 640, y: 850, foot: [118, 44], beacon: [500, 880] },
  { id: 's2', kind: 'stage', stage: 1, x: 1000, y: 600, foot: [120, 48], beacon: [1130, 620] },
  { id: 's3', kind: 'stage', stage: 2, x: 1760, y: 850, foot: [126, 48], beacon: [1900, 880] },
  { id: 's4', kind: 'stage', stage: 3, x: 1910, y: 470, foot: [136, 52], beacon: [1760, 500] },
  // 深渊：底座是整个深渊，入口在断桥伸出去的地方
  { id: 's5', kind: 'stage', stage: 4, x: 1200, y: 330, foot: [360, 130], footY: 200, beacon: [1440, 380] },
  { id: 'trial', kind: 'trial', name: '残光试炼', x: 780, y: 1180, foot: [46, 22] },
  { id: 'training', kind: 'training', name: '练剑场', x: 1590, y: 1210, foot: [0, 0], door: [1590, 1250] },
].map((s) => ({ ...s, name: s.name ?? STAGES[s.stage].name, door: s.door ?? [s.x, s.y + 38] }));
export const site = (id) => SITES.find((s) => s.id === id);

// 道路：守灯驿 → ① → ② → ③ → ④ → ⑤，另外两条小路通练剑场和试炼碑。open：这一段什么时候算「通了」
const ROADS = [
  { pts: [[1200, 1205], [1040, 1150], [860, 1030], [660, 895]], open: () => true },
  { pts: [[1200, 1205], [1390, 1230], [1590, 1255]], open: () => true },
  { pts: [[1200, 1205], [1000, 1235], [780, 1220]], open: () => true },
  { pts: [[660, 895], [700, 760], [850, 660], [1000, 645]], open: (s) => isUnlocked(s, 1) },
  { pts: [[1000, 645], [1250, 710], [1500, 810], [1760, 895]], open: (s) => isUnlocked(s, 2) },
  { pts: [[1760, 895], [1880, 720], [1910, 515]], open: (s) => isUnlocked(s, 3) },
  { pts: [[1910, 515], [1700, 430], [1450, 385], [1200, 375]], open: (s) => isUnlocked(s, 4) },
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
// kind：tree 枯树 / rock 石头 / grave 墓碑 / lamp 路灯 / sign 路牌；r：挡路的半径（0 = 不挡）
function scatter() {
  const R = rng(7), out = [];
  const free = (x, y, d) => roadDist(x, y) > d && SITES.every((s) => Math.hypot((x - s.x) / 1.4, y - s.y + (s.footY ? s.y - s.footY : 0)) > (s.id === 's5' ? 380 : 170))
    && out.every((o) => Math.hypot(o.x - x, o.y - y) > 46);
  const put = (kind, n, d, area = () => [EDGE + 40 + R() * (MAP_W - EDGE * 2 - 80), EDGE + 60 + R() * (MAP_H - EDGE * 2 - 100)]) => {
    for (let k = 0, tries = 0; k < n && tries < n * 40; tries++) {
      const [x, y] = area();
      if (!free(x, y, d)) continue;
      out.push({ kind, x, y, v: (R() * 3) | 0, r: kind === 'tree' ? 12 : kind === 'rock' ? 14 : kind === 'grave' ? 8 : 0 });
      k++;
    }
  };
  put('tree', 46, 60);
  put('rock', 30, 46);
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
  out.push({ kind: 'sign', x: 1092, y: 1176, v: 0, r: 5 }, { kind: 'sign', x: 700, y: 935, v: 1, r: 5 });
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
  }

  get save() { return this.g.save; }
  art_(k) { return (this.art[k] ??= LANDMARK[k]()); }
  propArt(o) {
    const key = o.kind + o.v;
    return (this.art[key] ??= ({
      tree: () => sprite(120, 150, 60, 140, (g) => paintTree(g, o.v)),
      rock: () => sprite(80, 50, 40, 40, (g) => paintRock(g, o.v)),
      grave: () => sprite(40, 40, 20, 34, (g) => paintGrave(g, o.v)),
      lamp: () => sprite(30, 60, 10, 56, (g) => paintLamp(g)),
      sign: () => sprite(50, 46, 25, 42, (g) => paintSign(g, o.v)),
    })[o.kind]());
  }

  // 解锁状态
  unlocked(s) {
    if (s.kind === 'stage') return isUnlocked(this.save, s.stage);
    if (s.kind === 'trial') return !!this.save.cleared.s1;
    return true;
  }
  lit(s) { return s.kind === 'stage' && !!this.save.cleared[STAGES[s.stage].id]; }
  litCount() { return STAGES.filter((st) => this.save.cleared[st.id]).length; }

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
    this.prewarm();
    this.snapCam();
    this.near = null;
  }
  // 进地图时一次画好所有地标、散件和地面缓存（不然走到新区域时才画，手机上会卡一下）
  prewarm() {
    for (const k of Object.keys(LANDMARK)) this.art_(k);
    for (const o of this.props) this.propArt(o);
    this.ground();
  }
  snapCam() {
    this.cam.x = clamp(this.hero.x - VIEW_W / 2, 0, MAP_W - VIEW_W);
    this.cam.y = clamp(this.hero.y - VIEW_H * 0.58, 0, MAP_H - VIEW_H);
  }

  // 碰撞：地图边缘、地点的底座、挡路的散件
  blocked(x, y) {
    if (x < EDGE || x > MAP_W - EDGE || y < EDGE + 40 || y > MAP_H - EDGE + 20) return true;
    for (const s of SITES) {
      const [rx, ry] = s.foot;
      if (!rx) continue;
      const cy = s.footY ?? s.y - ry;
      if (((x - s.x) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1) return true;
    }
    for (const o of this.props) if (o.r && Math.hypot((x - o.x) / 1.3, y - o.y) < o.r) return true;
    return false;
  }

  // 每帧：title = 封面（镜头自己移动，人不能走）；menu = 菜单 / 面板打开时人不动
  update(input, { title = false, frozen = false } = {}) {
    const h = this.hero;
    this.updateMotes();
    if (this.fadeIn > 0) this.fadeIn--;
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
    let dx = frozen ? 0 : input.dx, dy = frozen ? 0 : input.dy;
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    const vx = dx * SPEED, vy = dy * SPEED * 0.8; // 纵向略慢：俯视角下看起来速度一致
    let moved = 0;
    if (Math.abs(vx) > 0.05 && !this.blocked(h.x + vx, h.y)) { h.x += vx; moved += Math.abs(vx); }
    if (Math.abs(vy) > 0.05 && !this.blocked(h.x, h.y + vy)) { h.y += vy; moved += Math.abs(vy); }
    if (Math.abs(dx) > 0.15) h.facing = Math.sign(dx);
    h.moving = moved > 0.3 ? Math.min(1, h.moving + 0.25) : Math.max(0, h.moving - 0.2);
    h.phase += moved / 9; // 走 9 像素换一帧（8 帧一个循环 ≈ 72 像素，和地图上的人物大小相配）
    // 镜头：平滑跟随，略微看向前方
    const tx = clamp(h.x - VIEW_W / 2 + h.facing * 30, 0, MAP_W - VIEW_W), ty = clamp(h.y - VIEW_H * 0.58, 0, MAP_H - VIEW_H);
    this.cam.x += (tx - this.cam.x) * 0.1;
    this.cam.y += (ty - this.cam.y) * 0.1;
    // 站在哪个入口前
    let best = null, bd = NEAR;
    for (const s of SITES) {
      if (s.kind === 'camp') continue;
      const d = Math.hypot(h.x - s.door[0], (h.y - s.door[1]) * 1.3);
      if (d < bd) { bd = d; best = s; }
    }
    this.near = best;
  }

  // 进关：画面收拢变黑，然后执行 go
  launch(go) {
    if (this.leave) return;
    this.leave = { t: 0, go };
  }

  updateMotes() {
    const t = this.g.ticks;
    // 深渊往上冒的光点，点亮的烽灯的火星
    if (t % 3 === 0) this.motes.push({ x: 1200 + (Math.random() - 0.5) * 600, y: 220 + (Math.random() - 0.5) * 160, z: 0, vz: 0.3 + Math.random() * 0.5, life: 160, max: 160, c: '#b49aff' });
    for (const s of SITES) if (this.lit(s) && t % 9 === 0) this.motes.push({ x: s.beacon[0] + (Math.random() - 0.5) * 8, y: s.beacon[1], z: 112, vz: 0.6 + Math.random() * 0.5, life: 60, max: 60, c: '#ffb45a' });
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

  // ---------- 绘制 ----------
  // 返回这一帧的光源（屏幕坐标）和发光物，交给 main.js 的光照 / 泛光
  draw(ctx, t) {
    const cx = Math.round(this.cam.x), cy = Math.round(this.cam.y), s = this.save;
    const G = this.ground(), k = this.groundK;
    ctx.drawImage(G, cx * k, cy * k, VIEW_W * k, VIEW_H * k, 0, 0, VIEW_W, VIEW_H);
    const lights = [], glows = [];
    const scr = (x, y, z = 0) => [x - cx, y - cy - z];
    const vis = (x, y, m) => x > cx - m && x < cx + VIEW_W + m && y > cy - m && y < cy + VIEW_H + m * 1.6;

    // 要按 y 排序的东西
    const list = [];
    for (const o of this.props) if (vis(o.x, o.y, 120)) list.push({ y: o.y, d: () => this.blit(ctx, this.propArt(o), ...scr(o.x, o.y)) });
    for (const st of SITES) {
      const a = this.art_(SITE_ART[st.id]);
      if (vis(st.x, st.y, 420)) list.push({ y: st.y, d: () => this.blit(ctx, a, ...scr(st.x, st.y)) });
      if (st.beacon && vis(st.beacon[0], st.beacon[1], 160)) list.push({ y: st.beacon[1], d: () => this.blit(ctx, this.art_('beacon'), ...scr(st.beacon[0], st.beacon[1])) });
    }
    const h = this.hero;
    list.push({ y: h.y, d: () => this.drawHero(ctx, ...scr(h.x, h.y), t) });
    list.sort((a, b) => a.y - b.y);
    for (const o of list) o.d();

    // 没解锁的入口：锁链封印 + 一团暗雾
    for (const st of SITES) {
      if (this.unlocked(st) || !vis(st.x, st.y, 300)) continue;
      const [x, y] = scr(st.door[0], st.door[1] - 18);
      const fog = ctx.createRadialGradient(x, y - 10, 4, x, y - 10, 90);
      fog.addColorStop(0, 'rgba(8,6,12,.75)'); fog.addColorStop(1, 'rgba(8,6,12,0)');
      ctx.fillStyle = fog; ctx.fillRect(x - 90, y - 100, 180, 180);
      this.blit(ctx, this.art_('seal'), x, y + 8);
    }

    // 光源
    const lit = this.litCount();
    const camp = site('camp');
    lights.push([...scr(camp.x, camp.y - 120), 300 + lit * 40, 0.7 + lit * 0.06]);
    glows.push({ x: camp.x, y: camp.y, z: 190, r: 10 + lit * 2, c: '#ffd27a', a: 0.6 + lit * 0.08 });
    lights.push([...scr(1200, 210), 380, 0.42]); // 深渊往上透的光
    for (const st of SITES) {
      if (this.lit(st)) {
        lights.push([...scr(st.beacon[0], st.beacon[1], 90), 300, 1]);
        glows.push({ x: st.beacon[0], y: st.beacon[1], z: 112, r: 16, c: '#ffb45a', a: 1, flicker: true });
      }
      if (st.kind === 'stage' && this.unlocked(st)) lights.push([...scr(st.door[0], st.door[1] - 30), 150, 0.5]);
      if (st.kind === 'trial' && this.unlocked(st)) {
        lights.push([...scr(st.x, st.y, 110), 150, 0.5]);
        glows.push({ x: st.x, y: st.y, z: 110, r: 9, c: '#7ff3ff', a: 0.55 + 0.2 * Math.sin(t * 0.05), rune: true });
      }
      if (st.kind === 'training') lights.push([...scr(st.x, st.y - 40), 120, 0.35]);
    }
    lights.push([...scr(h.x, h.y, 30), 210, 1]);
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
      ctx.globalAlpha = g.a * f;
      const r = g.r * 3.2 * f;
      ctx.drawImage(tinted(T.glow, g.c), x - r, y - r, r * 2, r * 2);
      ctx.globalAlpha = Math.min(1, g.a * 1.2);
      ctx.drawImage(tinted(T.core ?? T.glow, '#fff2d0'), x - g.r * 0.5, y - g.r * 0.8, g.r, g.r * 1.2);
      if (g.rune) {
        ctx.globalAlpha = g.a * 0.8;
        ctx.strokeStyle = '#7ff3ff';
        ctx.lineWidth = 1.2;
        for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(x, y + 20 + k * 26, 12 - k, 3.5, 0, 0, Math.PI); ctx.stroke(); }
      }
    }
    for (const m of this.motes) {
      const [x, y] = scr(m.x, m.y, m.z);
      if (x < -10 || x > VIEW_W + 10 || y < -10 || y > VIEW_H + 10) continue;
      ctx.globalAlpha = Math.min(1, m.life / 30, (m.max - m.life) / 20) * 0.8;
      ctx.fillStyle = m.c;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.restore();
  }

  blit(ctx, a, x, y) {
    ctx.drawImage(a.c, x - a.ax, y - a.ay, a.w, a.h);
  }

  heroFrame(t) {
    const S = heroSprite, h = this.hero;
    if (h.moving > 0.3) return S.frame('run', Math.floor(h.phase) % 8);
    const n = S.meta.anims.idle.frames.length;
    return S.frame('idle', Math.floor(t / 9) % n);
  }

  drawHero(ctx, x, y, t) {
    const h = this.hero;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath(); ctx.ellipse(x, y, 13, 4, 0, 0, Math.PI * 2); ctx.fill();
    if (heroSprite.ready) {
      heroSprite.draw(ctx, this.heroFrame(t), x, y, h.facing, { scale: (0.54 * HERO_H) / 96, rim: '#9fd8ff', rimAlpha: 0.3 });
    } else {
      ctx.save(); ctx.translate(x, y); ctx.scale(0.6, 0.6);
      drawFighter(ctx, 0, 0, this.g.playerLook(), { crouch: 0.05, angle: 1.1, walk: h.moving ? h.phase * 0.7 : 0, lean: 2 }, { facing: h.facing, t });
      ctx.restore();
    }
  }

  // 地点提示（画在最上层）：名字、推荐等级 / 解锁条件、按键
  drawPrompt(ctx, t, touch) {
    const s = this.near;
    if (!s || this.leave) return;
    const [x, y] = this.frameScr(s.door[0], s.door[1], 0);
    const info = this.siteInfo(s);
    const top = y - 116;
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
      ctx.fillText(touch ? '点「攻」进入' : '按 J 进入', x, top + 38);
    }
    ctx.restore();
  }

  siteInfo(s) {
    const sv = this.save;
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
