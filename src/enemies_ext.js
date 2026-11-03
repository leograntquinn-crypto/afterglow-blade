// 新敌人：灰烛司祭（后排支援施法者）和烬翼（小型飞行群）。设计见 docs/DESIGN_CONTENT.md 第二节。
//
// 它们复用 Enemy 的状态机（idle → windup → attack → idle、受击、浮空、倒地），
// 只把「怎么想、怎么出招、怎么画」交给这里：Enemy 在对应位置调用 AI[类型].think / doAttack / updateAttack / draw。
// 专属素材（docs/ART_V6.md）回来之前，用程序画的占位美术。
import { DEPTH, world, clamp, rand, toScreen, COLORS } from './config.js';
import { hitBox, overlaps } from './combat.js';
import { sfx } from './audio.js';
import { tex, tinted } from './fx_tex.js';

const sign = (v) => Math.sign(v) || 1;
const WARD_COLOR = '#b48cff';

// ---------------- 类型表（并入 enemy.js 的 TYPES）----------------
export const EXT_TYPES = {
  priest: {
    name: '灰烛司祭', lvOff: 2, hp: 110, w: 34, h: 86, speed: 1.5, weight: 0.9, armor: 0, xp: 22, drop: 0.3, ai: 'priest',
    look: { rig: 'priest', h: 86, robe: '#6c6676', trim: '#a888d8', mask: '#efe9df', staff: '#4a4448', flame: '#e4dcff', rim: 'rgba(214,204,236,0.75)' },
    // 护咒：长读条，读完给附近同伴套咒盾。读条时被打中 = 破招（现有机制）
    ward: { kind: 'ward', windup: 70, recover: 30, cd: [300, 420], range: 380 },
    // 灰烬陷阱：在你脚下画符，40 帧后点亮
    trap: { kind: 'trap', windup: 36, recover: 30, cd: [200, 280] },
    // 推开：被贴身时的杖击
    atk: { kind: 'shove', range: 90, windup: 20, hitAt: 2, recover: 30, cd: [90, 140],
      hit: { box: { x: 40, w: 70, d: 26, z0: 0, z1: 90 }, dmg: 6, kb: 9, stun: 14, stop: 3, shake: 3 } },
  },
  wing: {
    name: '烬翼', lvOff: 0, hp: 34, w: 30, h: 34, speed: 3.2, weight: 0.5, armor: 0, xp: 8, drop: 0.08, ai: 'wing', flyer: true,
    look: { rig: 'wing', h: 34, body: '#3a2a30', crack: '#ff7a40', wing: '#4a3038', eye: '#ffe2b0', rim: 'rgba(255,170,120,0.7)' },
    // 俯冲：悬停预警 28 帧，然后斜着冲向你 16 帧，再爬升回去
    atk: { kind: 'dive', windup: 28, dur: 16, recover: 46, cd: [90, 170],
      hit: { box: { x: 6, w: 44, d: 28, z0: -24, z1: 40 }, dmg: 7, kb: 3, stun: 14, stop: 3, shake: 2 } },
  },
};

// 盘旋高度：地面普攻（判定顶到 100～110）打不到；上挑（130）和回风斩（120）在它浮到最低点时能打到
const HOVER = 127, BOB = 12;

// ---------------- 灰烛司祭 ----------------
const priest = {
  think(e, game) {
    const p = game.player, T = e.T;
    const dx = p.x - e.x, adx = Math.abs(dx), dy = p.y - e.y;
    if (p.state === 'dead') { e.vx *= 0.8; e.vy = 0; return; }
    e.facing = sign(dx);
    // 站位：离你 220～340，太近就往后退，躲在同伴后面
    let tx = e.x;
    if (adx < 220) tx = e.x - e.facing * 90;
    else if (adx > 340) tx = p.x - e.facing * 290;
    const ty = clamp(p.y + e.yOff * 0.6, 8, DEPTH - 8);
    const mx = tx - e.x, my = ty - e.y, spd = T.speed * e.spdMul;
    e.vx = Math.abs(mx) > 6 ? sign(mx) * Math.min(spd, Math.abs(mx)) : 0;
    e.vy = Math.abs(my) > 4 ? sign(my) * Math.min(spd * 0.7, Math.abs(my)) : 0;
    if (e.vx || e.vy) e.walk += 0.2 * spd;

    if (e.attackCd > 0 || game.attackers.size >= (game.maxAttackers ?? 2)) return;
    if (adx < T.atk.range && Math.abs(dy) < 30) return e.startWindup(game, T.atk);
    // 同一时间场上最多一个司祭在读护咒
    const busy = game.enemies.some((o) => o !== e && o.T?.ai === 'priest' && o.state === 'windup' && o.atk.kind === 'ward');
    if (!busy && wardTargets(e, game).length && Math.random() < 0.65) return e.startWindup(game, T.ward);
    if ((e.traps ?? 0) < 2 && adx < 560) return e.startWindup(game, T.trap);
  },

  // 读条期间：被护的同伴身上冒紫色光点，让你知道它在给谁加盾
  windup(e, game) {
    if (e.atk.kind === 'ward' && e.st % 18 === 1) {
      for (const o of wardTargets(e, game)) game.fx.converge(o.x, o.y, o.h * 0.6, 4, WARD_COLOR);
      game.fx.converge(e.x, e.y, e.h + 10, 3, WARD_COLOR);
    }
  },

  doAttack(e, game) {
    const A = e.atk;
    if (A.kind === 'ward') {
      const list = wardTargets(e, game);
      for (const o of list) {
        o.ward = { hp: o.maxHp * 0.3, max: o.maxHp * 0.3, t: 600 };
        game.fx.ring(o.x, o.y, o.h * 0.5, WARD_COLOR, 16, 6, 18, 4);
        game.fx.label(o.x, o.y, o.h + 26, '咒 盾', WARD_COLOR, 18);
      }
      game.fx.flare(e.x + e.facing * 10, e.y, e.h + 14, 0.9, WARD_COLOR);
      sfx('witch');
    } else if (A.kind === 'trap') {
      const p = game.player;
      game.hazards.push(new Trap({ x: clamp(p.x, 40, world.w - 40), y: p.y, owner: e }));
      e.traps = (e.traps ?? 0) + 1;
      game.fx.dust(e.x + e.facing * 30, e.y, 4, 0.6);
      sfx('warn');
    } else {
      e.vx = e.facing * 3;
    }
  },

  updateAttack(e, game) {
    const A = e.atk;
    e.vx *= 0.8;
    if (A.kind === 'shove') {
      if (e.st === A.hitAt) { game.fx.arc(e.x + e.facing * 6, e.y, 50, e.facing, 46, -0.2, 0.2, WARD_COLOR, 8); sfx('swing'); }
      if (e.st >= A.hitAt && e.st < A.hitAt + 5) {
        const p = game.player;
        if (!e.hitSet.has(p) && overlaps(hitBox(e, A.hit), p) && game.applyHit(e, p, A.hit, e.facing)) e.hitSet.add(p);
      }
    }
    if (e.st >= A.recover) {
      e.setState('idle');
      e.attackCd = (rand(A.cd[0], A.cd[1]) * (e.elite ? 0.8 : 1) * (e.enraged ? 0.6 : 1)) | 0;
    }
  },

  draw: drawPriest,
};

// 护咒能套给谁：附近还没有咒盾的活着的同伴（不含首领和别的司祭）
function wardTargets(e, game) {
  const R = e.T.ward.range;
  return game.enemies
    .filter((o) => o !== e && o.alive && o.team !== 'prop' && !o.isBoss && o.T?.ai !== 'priest' && !o.ward && o.state !== 'spawn' && Math.abs(o.x - e.x) < R && Math.abs(o.y - e.y) < 120)
    .sort((a, b) => Math.abs(a.x - e.x) - Math.abs(b.x - e.x))
    .slice(0, 2);
}

// ---------------- 烬翼 ----------------
const wing = {
  // 每帧在状态机之前调用：盘旋时自己管高度（不受重力），被打下来以后靠重力落地
  update(e, game) {
    const hovering = e.alive && (e.state === 'idle' || e.state === 'windup' || e.state === 'spawn');
    e.hover = hovering || (e.alive && e.state === 'attack');
    if (e.state === 'spawn' && e.st <= 1) e.z = HOVER;
    if (hovering) {
      const want = HOVER + Math.sin(game.ticks * 0.07 + e.id * 1.3) * BOB;
      e.z += clamp(want - e.z, -2, 4.5); // 从地上起飞时爬升得快一些
      e.vz = 0;
    }
  },

  think(e, game) {
    const p = game.player, T = e.T;
    if (p.state === 'dead') { e.vx *= 0.9; e.vy *= 0.9; return; }
    // 绕着你飘：每只有自己的角度和半径
    const a = game.ticks * 0.012 + e.id * 2.1;
    const R = 150 + (e.id % 3) * 30;
    const tx = clamp(p.x + Math.cos(a) * R, 40, world.w - 40), ty = clamp(p.y + Math.sin(a * 1.7) * 40, 8, DEPTH - 8);
    const spd = T.speed * e.spdMul;
    const mx = tx - e.x, my = ty - e.y, d = Math.hypot(mx, my) || 1;
    e.vx = (mx / d) * Math.min(spd, d);
    e.vy = (my / d) * Math.min(spd * 0.6, d);
    e.facing = sign(p.x - e.x);
    e.walk += 0.3;
    // 飞到够高、离你不远、有攻击令牌时才俯冲
    if (e.attackCd <= 0 && e.z > HOVER - BOB - 6 && Math.abs(p.x - e.x) < 280 && game.attackers.size < (game.maxAttackers ?? 2)) {
      e.startWindup(game, T.atk);
    }
  },

  windup(e) {
    e.vx *= 0.85; e.vy *= 0.85;
  },

  doAttack(e, game) {
    const p = game.player, D = e.atk.dur;
    // 朝你现在的位置斜着冲下来，冲到离地约 22
    e.dive = { vx: clamp((p.x - e.x) / D, -12, 12), vy: clamp((p.y - e.y) / D, -5, 5), vz: (22 - e.z) / D };
    e.facing = sign(p.x - e.x);
    sfx('dash');
  },

  updateAttack(e, game) {
    const A = e.atk;
    if (e.st < A.dur) {
      e.vx = e.dive.vx; e.vy = e.dive.vy; e.z += e.dive.vz;
      const p = game.player;
      if (!e.hitSet.has(p) && overlaps(hitBox(e, A.hit), p) && game.applyHit(e, p, A.hit, e.facing)) e.hitSet.add(p);
    } else {
      // 爬升回盘旋高度（爬升途中离地低，地面攻击打得到 —— 这是反打的窗口）
      e.vx *= 0.88; e.vy *= 0.88;
      if (e.z < HOVER) e.z = Math.min(HOVER, e.z + 3.2);
    }
    if (e.st >= A.recover) {
      e.setState('idle');
      e.attackCd = (rand(A.cd[0], A.cd[1]) * (e.elite ? 0.8 : 1) * (e.enraged ? 0.6 : 1)) | 0;
    }
  },

  draw: drawWing,
};

export const AI = { priest, wing };

// ---------------- 灰烬陷阱 ----------------
// 放在 game.hazards 里（和地面范围攻击同一套接口：update / drawFloor / dead）
export class Trap {
  constructor({ x, y, owner }) {
    Object.assign(this, { x, y, owner, t: 0, arm: 40, life: 400, rx: 46, ry: 18, dead: false, team: 'enemy' });
    this.hit = { dmg: 12, kb: 3, launch: 6, stun: 20, stop: 5, shake: 5 };
  }
  update(game) {
    if (++this.t >= this.life) return this.end();
    if (this.t < this.arm) return;
    const p = game.player;
    const dx = (p.x - this.x) / this.rx, dy = (p.y - this.y) / this.ry;
    if (dx * dx + dy * dy <= 1 && p.z < 20) this.explode(game, true);
  }
  // hurt = false：被坠星斩 / 崩山击震掉，不伤人
  explode(game, hurt) {
    if (this.dead) return;
    if (hurt) game.applyHit(this, game.player, this.hit, sign(game.player.x - this.x));
    game.fx.gring(this.x, this.y, WARD_COLOR, 10, 90, 18, 5);
    game.fx.dustburst(this.x, this.y, 0.5, '#9a90b0');
    game.fx.spark(this.x, this.y, 8, 1, 6, WARD_COLOR);
    if (!hurt) game.fx.label(this.x, this.y, 50, '破 咒', WARD_COLOR, 18);
    sfx(hurt ? 'heavy' : 'break');
    this.end();
  }
  end() {
    if (this.dead) return;
    this.dead = true;
    if (this.owner) this.owner.traps = Math.max(0, (this.owner.traps ?? 1) - 1);
  }
  drawFloor(ctx, camX) {
    const [sx, sy] = toScreen(this.x, this.y, 0, camX);
    const T = tex(), armed = this.t >= this.arm;
    const img = tinted(T.rune ? T.rune[1] : T.ring[1], WARD_COLOR);
    const grow = Math.min(1, this.t / 12), fade = Math.min(1, (this.life - this.t) / 30);
    const w = this.rx * 2.3 * grow, h = this.ry * 2.3 * grow;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = fade * (armed ? 0.75 + 0.25 * Math.sin(this.t * 0.25) : 0.25 + 0.1 * Math.sin(this.t * 0.4));
    ctx.drawImage(img, sx - w / 2, sy - h / 2, w, h);
    if (armed) {
      ctx.globalAlpha = fade * 0.3;
      ctx.drawImage(tinted(T.glow, WARD_COLOR), sx - w * 0.6, sy - h * 0.6, w * 1.2, h * 1.2);
    }
    ctx.restore();
  }
}

// 坠星斩、崩山击落地时震掉附近的陷阱
export function disarmTraps(game, x, y, r) {
  for (const h of game.hazards) if (h instanceof Trap && !h.dead && Math.abs(h.x - x) < r && Math.abs(h.y - y) < 60) h.explode(game, false);
}

// ---------------- 咒盾的绘制（任何敌人身上都可能有）----------------
export function drawWard(ctx, e, sx, sy, t) {
  if (!e.ward) return;
  const T = tex(), k = Math.min(1, e.ward.t / 30);
  const w = e.w * 2.2 + 20, h = e.h * 1.3 + 10;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = (0.22 + 0.08 * Math.sin(t * 0.15)) * k;
  ctx.drawImage(tinted(T.ring[0], WARD_COLOR), sx - w / 2, sy - e.h * 0.55 - h / 2, w, h);
  ctx.globalAlpha = 0.12 * k;
  ctx.drawImage(tinted(T.glow, WARD_COLOR), sx - w * 0.55, sy - e.h * 0.55 - h * 0.55, w * 1.1, h * 1.1);
  ctx.restore();
}

// ---------------- 占位美术（程序绘制）----------------
function shadeCol(c, flash) { return flash ? '#ffffff' : c; }

// 灰烛司祭：长袍、兜帽、半张白面具、顶端挂提灯的长杖。原点在脚底，已经按朝向镜像
function drawPriest(ctx, e, t, o) {
  const L = e.look, h = e.h, F = o.flash, s = e.state, A = e.atk;
  ctx.save();
  ctx.globalAlpha *= o.alpha;
  ctx.scale(e.facing, 1);
  let lean = 0, crouch = 0, staffA = -0.15, staffUp = 0, lie = 0;
  const bob = Math.sin(t * 0.08 + e.id) * 1.5;
  if (s === 'windup' && A?.kind === 'ward') { staffUp = Math.min(1, e.st / 12); staffA = -0.05; lean = -4; }
  else if (s === 'windup' && A?.kind === 'trap') { crouch = Math.min(1, e.st / 20) * 0.25; staffA = 0.9; lean = 6; }
  else if (s === 'windup') { staffA = -1.2; lean = -4; }
  else if (s === 'attack' && A?.kind === 'shove') { staffA = 1.45; lean = 10; }
  else if (s === 'attack' && A?.kind === 'trap') { staffA = 1.2; crouch = 0.2; lean = 8; }
  else if (s === 'hurt') { lean = -10; staffA = -0.6; }
  else if (s === 'air' || s === 'down' || s === 'dying') lie = s === 'down' && e.st > 34 ? Math.max(0, 1 - (e.st - 34) / 12) : 1;
  if (lie) { ctx.translate(0, -6); ctx.rotate(-Math.PI / 2 * lie); }
  const top = -h * (1 - crouch) + bob;
  ctx.translate(lean * 0.4, 0);
  // 长袍（梯形，下摆随走路摆动）
  const sway = Math.sin(e.walk) * 4;
  ctx.fillStyle = shadeCol(L.robe, F);
  ctx.beginPath();
  ctx.moveTo(-17 + sway * 0.4, 0);
  ctx.lineTo(17 + sway, 0);
  ctx.lineTo(9 + lean * 0.3, top + h * 0.28);
  ctx.lineTo(-9 + lean * 0.3, top + h * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = L.rim; // 轮廓光：暗背景里也看得清剪影
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = shadeCol(L.trim, F);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-17 + sway * 0.4, -2);
  ctx.lineTo(17 + sway, -2);
  ctx.stroke();
  // 兜帽和面具
  const hx = lean * 0.5 + 3, hy = top + h * 0.17;
  ctx.fillStyle = shadeCol('#4a4454', F);
  ctx.beginPath();
  ctx.ellipse(hx, hy, 11, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = L.rim;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = shadeCol(L.mask, F);
  ctx.beginPath();
  ctx.ellipse(hx + 4, hy + 2, 5.5, 8, 0, -Math.PI / 2, Math.PI / 2);
  ctx.fill();
  ctx.fillStyle = '#1a1420';
  ctx.fillRect(hx + 4, hy - 1, 3, 1.6);
  // 长杖 + 提灯
  const handX = 10 + lean * 0.4, handY = top + h * 0.45 - staffUp * h * 0.35;
  const len = h * 1.05, ang = -Math.PI / 2 + staffA;
  const tipX = handX + Math.cos(ang) * len * 0.55, tipY = handY + Math.sin(ang) * len * 0.55;
  const butX = handX - Math.cos(ang) * len * 0.45, butY = handY - Math.sin(ang) * len * 0.45;
  ctx.strokeStyle = shadeCol(L.staff, F);
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(butX, butY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  ctx.fillStyle = shadeCol('#2a262c', F);
  ctx.fillRect(tipX - 5, tipY - 4, 10, 11);
  ctx.fillStyle = shadeCol(L.flame, F);
  ctx.beginPath();
  ctx.ellipse(tipX, tipY + 2, 2.6, 3.8 + Math.sin(t * 0.4) * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // 提灯的光（叠加）
  if (e.alive && !lie) {
    const gx = e.facing * (tipX + lean * 0.4), gy = tipY;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 * o.alpha * (s === 'windup' && A?.kind === 'ward' ? 2 : 1);
    ctx.drawImage(tinted(tex().glow, WARD_COLOR), gx - 18, gy - 18, 36, 36);
    ctx.restore();
  }
}

// 烬翼：焦黑的小飞兽，龟裂的皮肤里透出暗红余烬，膜翼扇动
function drawWing(ctx, e, t, o) {
  const L = e.look, F = o.flash, s = e.state;
  ctx.save();
  ctx.globalAlpha *= o.alpha;
  ctx.scale(e.facing, 1);
  const grounded = (s === 'down' || (s === 'dying' && e.z <= 0));
  const cy = grounded ? -6 : -18;
  let flap = Math.sin(t * 0.55 + e.id) , fold = 0, tilt = 0;
  if (s === 'windup') { flap = -0.8; tilt = 0.25; }
  else if (s === 'attack' && e.st < e.atk.dur) { fold = 1; tilt = 0.7; }
  else if (s === 'air' || s === 'hurt') { flap = Math.sin(t * 1.4) * 0.6; tilt = -0.8 + Math.sin(t * 0.5); }
  else if (grounded) { flap = Math.sin(t * 0.3) * 0.5; tilt = 0; }
  ctx.translate(0, cy);
  ctx.rotate(tilt);
  ctx.scale(1.7, 1.7); // 占位图放大到约 70 像素翼展（和素材规格里的大小一致）
  // 翅膀（后翼在身体后面）
  const wing = (dir, k) => {
    const span = 34 * (1 - fold * 0.7);
    const up = flap * 18 * dir;
    ctx.fillStyle = shadeCol(L.wing, F);
    ctx.beginPath();
    ctx.moveTo(-4, -2);
    ctx.quadraticCurveTo(-span * 0.4, -12 - up * 0.6, -span * 0.9 * k, -up - 6);
    ctx.lineTo(-span * 0.7 * k, -up * 0.4 + 4);
    ctx.lineTo(-span * 0.45 * k, -up * 0.2 + 2);
    ctx.lineTo(-span * 0.2, 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = L.rim;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  };
  wing(1, 1.05);
  // 尾巴
  ctx.strokeStyle = shadeCol(L.body, F);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-10, 2);
  ctx.quadraticCurveTo(-22, 8 + Math.sin(t * 0.3) * 4, -30, 2 + Math.sin(t * 0.3 + 1) * 5);
  ctx.stroke();
  // 身体 + 头
  ctx.fillStyle = shadeCol(L.body, F);
  ctx.beginPath();
  ctx.ellipse(0, 0, 13, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(12, -4, 6, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // 龟裂里的余烬
  ctx.strokeStyle = shadeCol(L.crack, F);
  ctx.lineWidth = 1.2;
  ctx.globalAlpha *= 0.85;
  ctx.beginPath();
  ctx.moveTo(-6, -3); ctx.lineTo(-1, 1); ctx.lineTo(4, -2);
  ctx.moveTo(-3, 4); ctx.lineTo(2, 2);
  ctx.stroke();
  ctx.fillStyle = L.eye;
  ctx.fillRect(14, -6, 2, 2);
  wing(-1, 0.85);
  ctx.restore();
  // 余烬的微光（叠加）：它是会发光的小东西，暗处也看得见
  if (e.alive) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = o.alpha * (s === 'windup' ? 0.9 : 0.5);
    ctx.drawImage(tinted(tex().glow, L.crack), -22, cy - 22, 44, 44);
    ctx.restore();
  }
}
