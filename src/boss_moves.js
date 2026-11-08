// 首领专属招式：每个首领 2 个（设计见 docs/DESIGN_CONTENT.md 第三节）
// 和 boss.js 的通用招式同一个格式：ok(boss, player, game) 现在适不适合用；tick(boss, game, t, d) 每帧执行，返回 true 结束。
// 原则：难在读，不难在数值 —— 每招都有清楚的预警、明确的解法，收招有破绽。
import { DEPTH, world, clamp, rand, toScreen, COLORS } from './config.js';
import { Projectile, Hazard, Lane, hitBox, overlaps } from './combat.js';
import { sfx } from './audio.js';
import { tex, tinted } from './fx_tex.js';
import { ravenBodyFx, disperseRavenCopies, playIronJawFx, startIronJawDrag, ironJawCleave, ironJawStompArt } from './boss_fx.js';

const sign = (v) => Math.sign(v) || 1;
const dist = (b, p) => Math.abs(p.x - b.x);
function melee(b, game, hit, set) {
  const p = game.player;
  if (!set.has(p) && overlaps(hitBox(b, hit), p) && game.applyHit(b, p, hit, b.facing)) set.add(p);
}
// 骸骨统领的地面招式带骨刺特效
const spikeArt = (b) => (b.key === 'boneLord' ? 'bone_spikes' : null);

export const SIGNATURE = {
  // ---------------- 骸骨统领 ----------------
  // 骨牢：你脚下一圈骨刺红圈，留一个缺口；中间再补一根
  boneCage: {
    ok: (b, p) => dist(b, p) < 420,
    tick(b, g, t, d) {
      const D = Math.round(44 / b.spd), p = g.player;
      if (t === 0) {
        b.facing = sign(p.x - b.x);
        const n = 7, gap = (Math.random() * n) | 0, R = 118;
        for (let k = 0; k < n; k++) {
          if (k === gap) continue;
          const a = (k / n) * Math.PI * 2;
          g.hazards.push(new Hazard({ x: clamp(p.x + Math.cos(a) * R, 40, world.w - 40), y: clamp(p.y + Math.sin(a) * R * 0.42, 6, DEPTH - 6), rx: 50, ry: 24, delay: D,
            owner: b, ownerState: 'attack', color: b.B.glow, art: spikeArt(b), hit: { dmg: 16, kb: 4, launch: 8, stop: 6, shake: 6 } }));
        }
        d.cx = p.x; d.cy = p.y;
        g.fx.label(b.x, b.y, b.h + 40, '骨 牢', b.B.glow, 26);
        sfx('warn');
      }
      if (t === D) g.hazards.push(new Hazard({ x: d.cx, y: d.cy, rx: 56, ry: 26, delay: 18, color: b.B.glow, art: spikeArt(b), hit: { dmg: 18, kb: 5, launch: 9, stop: 6, shake: 7 } }));
      b.tele = t < D;
      b.pa = t < D ? -2.6 : 1.2;
      b.pc = t < D ? 0.35 : 0.1;
      return t >= D + 44;
    },
  },
  // 裂地追斩：巨剑拖地，三根骨刺一根接一根冒出来，追着你的纵深
  rendChase: {
    ok: (b, p) => dist(b, p) > 120 && dist(b, p) < 560,
    tick(b, g, t, d) {
      const D = Math.round(30 / b.spd), p = g.player;
      if (t === 0) {
        b.facing = sign(p.x - b.x);
        g.hazards.push(new Lane({ x: b.x, y: p.y, facing: b.facing, life: D, half: 26 }));
        sfx('warn');
      }
      for (let i = 0; i < 3; i++) {
        if (t === D + i * 14) {
          const x = clamp(b.x + b.facing * (150 + i * 130), 40, world.w - 40);
          g.hazards.push(new Hazard({ x, y: p.y, rx: 64, ry: 30, delay: 12, color: b.B.glow, art: spikeArt(b), hit: { dmg: 15, kb: 5, launch: 8, stop: 6, shake: 6 } }));
          g.fx.dust(x, p.y, 6, 1.2);
        }
      }
      b.tele = t < D;
      b.pa = t < D ? -2.3 : 1.2;
      b.pc = 0.25;
      return t >= D + 28 + 40;
    },
  },

  // ---------------- 夜鸦 ----------------
  // 羽刃回旋：扇形扔出三片羽刃，飞出去再拐回来（去程、回程都有判定）
  featherRang: {
    ok: (b, p) => dist(b, p) > 100,
    tick(b, g, t, d) {
      const D = Math.round(30 / b.spd), p = g.player;
      if (t === 0) {
        b.facing = sign(p.x - b.x);
        d.ys = [-46, 0, 46].map((o) => clamp(p.y + o, 6, DEPTH - 6));
        for (const y of d.ys) g.hazards.push(new Lane({ x: b.x, y, facing: b.facing, life: D, half: 10, color: b.B.glow }));
        sfx('warn');
      }
      if (t === D) {
        for (const y of d.ys) {
          g.projectiles.push(new Projectile({ x: b.x + b.facing * 30, y, z: 50, vx: b.facing * 12, boomerang: 0.3, life: 120, team: 'enemy', kind: 'feather', color: b.B.glow, owner: b,
            hit: { box: { w: 36, d: 16, z0: -24, z1: 24 }, dmg: 10, kb: 3, stun: 16, stop: 3, shake: 3 } }));
        }
        sfx('swing');
      }
      b.tele = t < D;
      b.pa = 0;
      b.pd = t < D ? t / D : 0;
      return t >= D + 70;
    },
  },
  // 鸦影分身：化作黑羽分成三个身影，同时拉弓；只有一个是真身（脚下有影子），其他的箭是假的。打中真身 = 识破，分身全散
  ravenSplit: {
    ok: (b, p) => dist(b, p) > 140 && !b.split,
    tick(b, g, t, d) {
      const p = g.player, D = Math.round(44 / b.spd);
      if (t === 0) {
        d.hp0 = b.hp;
        if (!ravenBodyFx(g, b, 'burst')) g.fx.emit('soul', b.x, b.y, b.h * 0.5, { color: '#2a1a30', n: 14 });
        g.fx.label(b.x, b.y, b.h + 40, '鸦 影', b.B.glow, 26);
        sfx('dash');
      }
      if (t === 8) {
        // 三个位置：和你同一侧、拉开距离，纵深错开；真身随机站其中一个
        const side = sign(b.x - p.x) || 1;
        const spots = [-56, 0, 56].map((o, i) => ({ x: clamp(p.x + side * (300 + i * 24), 60, world.w - 60), y: clamp(p.y + o, 8, DEPTH - 8) }));
        const real = (Math.random() * 3) | 0;
        b.x = spots[real].x; b.y = spots[real].y;
        b.split = { spots: spots.filter((_, i) => i !== real), t: 0 };
        b.facing = sign(p.x - b.x);
        for (const s of spots) {
          ravenBodyFx(g, b, 'appear', s);
          g.hazards.push(new Lane({ x: s.x, y: s.y, facing: b.facing, life: D, half: 12, color: b.B.glow }));
        }
      }
      if (b.split) b.split.t++;
      b.fade = t < 8 ? 1 - t / 8 : Math.min(1, (t - 8) / 10); // 化作黑羽 → 在新位置浮现
      // 识破：打中真身
      if (b.split && b.hp < d.hp0) {
        disperseRavenCopies(g, b, 10);
        g.fx.label(b.x, b.y, b.h + 40, '识 破', '#ffffff', 26);
        b.split = null;
        b.tele = false;
        sfx('break');
        return true;
      }
      const fire = t === 8 + D || t === 8 + D + 26;
      if (fire && b.split) {
        const shoot = (x, y, fake) => g.projectiles.push(new Projectile({ x: x + b.facing * 30, y, z: 52, vx: b.facing * 9, life: 120, team: 'enemy', kind: 'arrow', fake, color: b.B.glow, owner: b,
          hit: { box: { w: 30, d: 16, z0: -20, z1: 20 }, dmg: 12, kb: 4, stun: 16, stop: 4, shake: 4 } }));
        shoot(b.x, b.y, false);
        for (const s of b.split.spots) shoot(s.x, s.y, true);
        sfx('shoot');
      }
      b.tele = t >= 8 && t < 8 + D;
      b.pa = 0;
      if (t >= 8 + D + 50) {
        disperseRavenCopies(g, b, 8);
        b.split = null;
        return true;
      }
      return false;
    },
  },

  // ---------------- 铁颚 ----------------
  // 锁链钩：甩出钩子，被钩中会被拉到面前，紧接一记重锤（拉到身前时可以弹刀）
  chainHook: {
    ok: (b, p) => dist(b, p) > 140 && dist(b, p) < 460 && Math.abs(p.y - b.y) < 70,
    tick(b, g, t, d) {
      const D = Math.round(36 / b.spd), p = g.player;
      if (t === 0) {
        b.facing = sign(p.x - b.x);
        d.y = p.y;
        g.hazards.push(new Lane({ follow: b, x: b.x, y: b.y, facing: b.facing, life: D, half: 18 }));
        sfx('warn');
      }
      if (t < D) b.vy = clamp(p.y - b.y, -2, 2);
      if (t === D) {
        b.vy = 0;
        d.hook = new Projectile({ x: b.x + b.facing * 40, y: b.y, z: 60, vx: b.facing * 13, life: 30, team: 'enemy', kind: 'hook', color: b.B.glow, owner: b,
          hit: { box: { w: 34, d: 22, z0: -40, z1: 40 }, dmg: 6, kb: 0, stun: 26, stop: 5, shake: 4 },
          onHit: () => {
            d.pulled = true; // 命中时记下来，下一帧从这里开始计时
            playIronJawFx(g, b, 'hook', d.hook.x, d.hook.y, d.hook.z);
          } });
        g.projectiles.push(d.hook);
        sfx('swing');
      }
      // 被钩中：把你拉到它面前，停一下给你反应（弹刀 / 闪避），然后重锤
      if (d.pulled && d.pulledAt == null) {
        d.pulledAt = t; d.set = new Set();
        startIronJawDrag(g, b);
      }
      if (d.pulledAt != null) {
        const k = t - d.pulledAt;
        if (k < 12) { p.x += (b.x + b.facing * 70 - p.x) * 0.28; p.y += (b.y - p.y) * 0.3; }
        if (k === 12) { d.set = new Set(); g.fx.label(b.x, b.y, b.h + 30, '!', '#ff3b3b', 30); }
        b.tele = k < 24;
        b.pa = k < 24 ? -2.6 : 1.2;
        if (k >= 24 && k < 30) melee(b, g, { box: { x: 60, w: 130, d: 40, z0: 0, z1: 140 }, dmg: 20, kb: 8, launch: 7, stop: 8, shake: 10, heavy: true }, d.set);
        if (k === 24) {
          ironJawCleave(g, b);
          const x = b.x + b.facing * 70;
          if (!playIronJawFx(g, b, 'quake', x, b.y, 0)) g.fx.dustburst(x, b.y, 0.8);
          sfx('heavy');
        }
        return k >= 60;
      }
      b.tele = t < D;
      b.pa = t < D ? -1.4 : 0.6;
      return t >= D + 50;
    },
  },
  // 刑台三震：向前连砸三下，一下比一下远、一下比一下大，第三下向两边炸出震地波
  tripleStomp: {
    ok: (b, p) => dist(b, p) < 400,
    tick(b, g, t, d) {
      const D = Math.round(40 / b.spd), p = g.player;
      if (t === 0) {
        b.facing = sign(p.x - b.x);
        d.xs = [110, 220, 340].map((o) => clamp(b.x + b.facing * o, 50, world.w - 50));
        [0, 1, 2].forEach((i) => g.hazards.push(new Hazard({ x: d.xs[i], y: b.y, rx: 70 + i * 26, ry: 40 + i * 8, delay: D + i * 16, owner: b, ownerState: 'attack', color: b.B.glow, ...ironJawStompArt(b, i),
          hit: { dmg: 16 + i * 4, kb: 6, launch: 7 + i, stop: 6, shake: 7 + i * 2, heavy: i === 2 } })));
        g.fx.label(b.x, b.y, b.h + 40, '刑台三震', b.B.glow, 24);
        sfx('warn');
      }
      for (let i = 0; i < 3; i++) if (t === D + i * 16) { b.vx = b.facing * 4; b.pa = 1.2; }
      if (t === D + 32) {
        for (const s of [-1, 1]) {
          const x = d.xs[2] + s * 150;
          if (x > 40 && x < world.w - 40) g.hazards.push(new Hazard({ x, y: b.y, rx: 60, ry: 50, delay: 18, color: b.B.glow, hit: { dmg: 14, kb: 6, launch: 6, stop: 5, shake: 6 } }));
        }
      }
      if (t < D) { b.pa = -2.6; b.pc = 0.35; }
      else if ((t - D) % 16 === 8) b.pa = -2.4;
      b.vx *= 0.8;
      b.tele = t < D;
      return t >= D + 32 + 44;
    },
  },

  // ---------------- 祭坛守护者 ----------------
  // 魂火炉：地面浮现召唤法阵，召出 3 座能打碎的魂火炉，每座隔几秒朝你吐一颗魂火
  soulBraziers: {
    ok: (b, p, g) => !g.enemies.some((e) => e instanceof Brazier),
    tick(b, g, t) {
      b.pa = -1.4; b.pc = 0.2;
      if (t === 0) {
        if (!g.fx.flip('summon_circle', b.x, b.y, 0, { ground: true, hold: 30, color: b.B.glow, scale: 0.65 })) g.fx.rune(b.x, b.y, 1, b.B.glow, 120, 54, 0.02);
        g.fx.label(b.x, b.y, b.h + 40, '魂 火 炉', b.B.glow, 26);
        sfx('roar');
      }
      if (t === 26) {
        const p = g.player;
        for (const o of [-1, 0, 1]) {
          const x = clamp(p.x + o * 220 + rand(-30, 30), 60, world.w - 60), y = clamp(o === 0 ? (p.y < DEPTH / 2 ? DEPTH - 30 : 30) : rand(30, DEPTH - 30), 10, DEPTH - 10);
          g.enemies.push(new Brazier(x, y, b));
          g.fx.ring(x, y, 4, b.B.glow, 10, 8, 18, 4);
        }
      }
      b.tele = t < 26;
      return t >= 56;
    },
  },
  // 审判长戟：两条纵深不同的光带，一记横扫打第一条，紧接着回扫打第二条。站在两条之间的空隙最安全
  judgment: {
    ok: (b, p) => dist(b, p) < 460,
    tick(b, g, t, d) {
      const D = Math.round(40 / b.spd), p = g.player;
      if (t === 0) {
        b.facing = sign(p.x - b.x);
        const off = p.y > DEPTH / 2 ? -58 : 58;
        d.y1 = clamp(p.y, 8, DEPTH - 8); d.y2 = clamp(p.y + off, 8, DEPTH - 8);
        g.hazards.push(new Lane({ x: b.x, y: d.y1, facing: b.facing, life: D, half: 30 }));
        g.hazards.push(new Lane({ x: b.x, y: d.y2, facing: b.facing, life: D + 18, half: 30, color: '#ffb347' }));
        sfx('warn');
      }
      const sweep = (y) => {
        const x0 = b.x, x1 = clamp(b.x + b.facing * 460, 0, world.w);
        g.fx.arc(b.x + b.facing * 20, y, 50, b.facing, 220, -0.9, 0.5, b.B.glow, 18, 12);
        if (p.z < 70 && Math.abs(p.y - y) < 26 && (p.x - x0) * b.facing > -20 && (p.x - x1) * b.facing < 20) {
          g.applyHit(b, p, { dmg: 18, kb: 7, launch: 5, stop: 7, shake: 8, heavy: true }, b.facing);
        }
        sfx('swing');
      };
      if (t === D) { b.y = d.y1; sweep(d.y1); }
      if (t === D + 18) sweep(d.y2);
      b.tele = t < D;
      b.pa = t < D ? -2.6 : t < D + 18 ? 1.2 : -1.6;
      return t >= D + 18 + 40;
    },
  },

  // ---------------- 残影 ----------------
  // 镜像：复制你最后用过的技能还给你（没用过技能时扔剑气）
  mirror: {
    ok: (b, p) => dist(b, p) < 520,
    tick(b, g, t, d) {
      const D = Math.round(30 / b.spd), p = g.player;
      if (t === 0) {
        d.skill = g.lastSkill || 'wave';
        b.facing = sign(p.x - b.x);
        const glyph = { wave: '裂', whirl: '风', quake: '崩', flurry: '千' }[d.skill] || '裂';
        g.fx.label(b.x, b.y, b.h + 46, `镜 · ${glyph}`, b.B.glow, 26);
        sfx('witch');
      }
      b.tele = t < D;
      const k = t - D;
      if (k < 0) { b.pa = -2.3; return false; }
      if (d.skill === 'wave') {
        if (k === 0) g.projectiles.push(new Projectile({ x: b.x + b.facing * 40, y: b.y, z: 0, vx: b.facing * 9.5, life: 60, team: 'enemy', kind: 'wave', pierce: true, color: b.B.glow, owner: b,
          hit: { box: { w: 56, d: 30, z0: 0, z1: 100 }, dmg: 16, kb: 6, launch: 7, stop: 6, shake: 6, heavy: true } }));
        b.pa = 1.2;
        return k >= 30;
      }
      if (d.skill === 'whirl') {
        b.vx = sign(p.x - b.x) * 2.4;
        if (k % 10 === 0) { d.set = new Set(); g.fx.flip('slash_spin', b.x, b.y, 46, { color: b.B.glow, facing: b.facing }); sfx('swing'); }
        melee(b, g, { box: { x: 0, w: 170, d: 44, z0: 0, z1: 120 }, dmg: 7, kb: 3, stun: 14, stop: 3, shake: 3 }, d.set ?? (d.set = new Set()));
        b.pa = (k % 10) / 5 - 1;
        return k >= 40;
      }
      if (d.skill === 'quake') {
        if (k === 0) g.hazards.push(new Hazard({ x: clamp(b.x + b.facing * 40, 60, world.w - 60), y: b.y, rx: 180, ry: 70, delay: 24, color: b.B.glow, hit: { dmg: 22, kb: 6, launch: 10, stop: 8, shake: 12, heavy: true } }));
        b.pa = k < 24 ? -2.9 : 1.3;
        return k >= 50;
      }
      // 千刃：冲到你面前连斩
      if (k === 0) { d.set = new Set(); b.vx = b.facing * 12; }
      b.vx *= 0.9;
      if (k % 6 === 0) { d.set = new Set(); g.fx.arc(b.x + b.facing * 20, b.y, 55, b.facing, 70, -2, 1, b.B.glow, 12); }
      melee(b, g, { box: { x: 34, w: 130, d: 36, z0: 0, z1: 120 }, dmg: 6, kb: 1, stun: 18, stop: 2, shake: 2 }, d.set);
      b.pa = (k % 6) < 3 ? -2 : 1;
      return k >= 36;
    },
  },
  // 残光处决：屏幕暗下来，地上多条红线连成折线，沿折线瞬身连斩 5 次，最后一斩落在你身上。全部躲过它会力竭倒地
  execution: {
    ok: (b, p, g) => (g.frame - (b.execAt ?? -9999)) > 1500,
    tick(b, g, t, d) {
      const p = g.player, STEP = 14;
      if (t === 0) {
        b.execAt = g.frame;
        g.cine?.hold(0.45, 120, b);
        g.cine?.speed('in', 20, b.B.glow);
        // 折线：从它自己开始，在你左右来回穿插，最后一段落到你身上
        d.pts = [{ x: b.x, y: b.y }];
        for (let i = 0; i < 5; i++) {
          const last = i === 4, side = i % 2 ? 1 : -1;
          d.pts.push(last ? { x: p.x, y: p.y } : { x: clamp(p.x + side * rand(140, 220), 50, world.w - 50), y: clamp(p.y + rand(-60, 60), 8, DEPTH - 8) });
        }
        for (let i = 0; i < 5; i++) g.hazards.push(new Streak(d.pts[i], d.pts[i + 1], 40 + i * STEP, b.B.glow));
        d.hits = 0;
        g.fx.label(b.x, b.y, b.h + 46, '残 光 处 决', b.B.glow, 28);
        sfx('ultStart');
      }
      b.tele = t < 40;
      const i = Math.floor((t - 40) / STEP);
      if (t >= 40 && (t - 40) % STEP === 0 && i < 5) {
        const a = d.pts[i], c = d.pts[i + 1];
        b.facing = sign(c.x - a.x);
        b.x = c.x; b.y = c.y;
        b.invuln = 2;
        g.fx.flip('slash_sweep', (a.x + c.x) / 2, (a.y + c.y) / 2, 50, { color: b.B.glow, facing: b.facing, scale: 1.2 });
        // 沿这一段有判定：你离这条线足够近就挨刀（极限闪避照常生效）
        const vx = c.x - a.x, vy = c.y - a.y, L2 = vx * vx + vy * vy || 1;
        const u = clamp(((p.x - a.x) * vx + (p.y - a.y) * vy) / L2, 0, 1);
        const nx = a.x + vx * u, ny = a.y + vy * u;
        if (p.z < 70 && Math.abs(p.x - nx) < 34 && Math.abs(p.y - ny) < 24 && g.applyHit(b, p, { dmg: 12, kb: 4, stun: 22, stop: 5, shake: 6 }, b.facing)) d.hits++;
        sfx('swing');
      }
      b.pa = (t % 14) < 7 ? -2.2 : 1.2;
      if (t >= 40 + STEP * 5 + 10) {
        if (d.hits === 0) {
          // 全部躲过：力竭倒地
          b.setState('hurt');
          b.hitstun = 180;
          b.armor = 0;
          b.brokenT = Math.max(b.brokenT, 180);
          g.fx.label(b.x, b.y, b.h + 40, '力 竭', COLORS.ember, 30);
          sfx('break');
          return false; // 已经切到受击状态：不要再让招式收尾把它改回待机
        }
        return true;
      }
      return false;
    },
  },
};

// 每个首领的专属招式放进哪个阶段（在 boss.js 的阶段招式表上追加）
export const SIGNATURE_PHASES = {
  boneLord: [{ boneCage: 1 }, { boneCage: 1, rendChase: 2 }],
  nightRaven: [{ featherRang: 2 }, { featherRang: 1, ravenSplit: 2 }],
  ironJaw: [{ chainHook: 2 }, { chainHook: 1, tripleStomp: 2 }],
  warden: [{ judgment: 2 }, { judgment: 1, soulBraziers: 1 }, { judgment: 2, soulBraziers: 1 }],
  afterimage: [{}, { mirror: 2 }, { mirror: 1, execution: 1 }],
};

// ---------------- 魂火炉（祭坛守护者召唤的可破坏物件）----------------
// 和宝箱一样放在 game.enemies 里（team = 'prop'），玩家能打碎它；不影响清场
export class Brazier {
  constructor(x, y, owner) {
    Object.assign(this, { x, y, z: 0, vx: 0, w: 34, h: 52, team: 'prop', facing: 1, owner, hp: 3, t: 0, life: 900 });
  }
  get alive() { return false; }
  canBeHit() { return this.hp > 0; }
  takeHit(h, dir, dmg, game) {
    this.hp -= h.heavy || h.skill ? 2 : 1;
    this.shakeT = 8;
    if (this.hp <= 0) this.shatter(game);
    return {};
  }
  shatter(game) {
    this.remove = true;
    game.fx.flip('impact_ground', this.x, this.y, 0, { color: this.owner.B.glow, scale: 0.5 });
    game.fx.emit('soul', this.x, this.y, 30, { color: this.owner.B.glow });
    game.fx.chips(this.x, this.y, 30, 1, 8, '#6a7a6e');
    sfx('break');
  }
  update(game) {
    this.t++;
    if (this.shakeT > 0) this.shakeT--;
    if (!this.owner.alive || this.t >= this.life) {
      // 首领倒下或者时间到：熄灭
      this.remove = true;
      game.fx.emit('dissolve', this.x, this.y, 30, { color: this.owner.B.glow, n: 6 });
      return;
    }
    // 每 2.5 秒朝你吐一颗魂火（第一颗前有一秒预热）
    if (this.t > 60 && this.t % 150 === 60) {
      const p = game.player, dir = sign(p.x - this.x);
      game.projectiles.push(new Projectile({ x: this.x + dir * 16, y: this.y, z: 50, vx: dir * 4.2, life: 200, team: 'enemy', kind: 'soul', color: this.owner.B.glow, owner: this.owner,
        hit: { box: { w: 26, d: 18, z0: -20, z1: 20 }, dmg: 9, kb: 3, stun: 14, stop: 3, shake: 3 } }));
      sfx('shoot');
    }
  }
  draw(ctx, camX, t) {
    let [sx, sy] = toScreen(this.x, this.y, 0, camX);
    if (this.shakeT > 0) sx += (Math.random() - 0.5) * 4;
    const T = tex(), col = this.owner.B.glow;
    // 石炉：底座 + 炉口
    ctx.save();
    ctx.fillStyle = '#2e3a32';
    ctx.beginPath();
    ctx.moveTo(sx - 18, sy);
    ctx.lineTo(sx + 18, sy);
    ctx.lineTo(sx + 12, sy - 34);
    ctx.lineTo(sx - 12, sy - 34);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,220,180,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#4a5a4e';
    ctx.fillRect(sx - 16, sy - 38, 32, 6);
    // 炉火：魂火序列帧（素材没到时画一团光）
    ctx.globalCompositeOperation = 'lighter';
    const warm = this.t % 150 > 30 && this.t % 150 < 60 ? 1.6 : 1; // 吐火前变亮
    ctx.globalAlpha = 0.5 * warm;
    ctx.drawImage(tinted(T.glow, col), sx - 26, sy - 70, 52, 52);
    ctx.globalAlpha = 0.9;
    ctx.drawImage(tinted(T.core, col), sx - 8, sy - 58, 16, 22);
    ctx.restore();
  }
}

// ---------------- 地面折线预警（残光处决）----------------
export class Streak {
  constructor(a, b, life, color) {
    Object.assign(this, { a, b, life, t: 0, color, dead: false });
    // 光照系统按 x / y / rx 给地面预警加光：取线段中点和半长
    this.x = (a.x + b.x) / 2; this.y = (a.y + b.y) / 2; this.rx = Math.hypot(b.x - a.x, b.y - a.y) / 2;
  }
  update() {
    if (++this.t >= this.life) this.dead = true;
  }
  drawFloor(ctx, camX) {
    const [x0, y0] = toScreen(this.a.x, this.a.y, 0, camX), [x1, y1] = toScreen(this.b.x, this.b.y, 0, camX);
    const u = this.t / this.life;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const [w, a, c] of [[14, 0.18 + 0.2 * u, this.color], [3, 0.5 + 0.4 * u, '#ff4d5e']]) {
      ctx.globalAlpha = a * (0.8 + 0.2 * Math.sin(this.t * 0.6));
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    ctx.restore();
  }
}
