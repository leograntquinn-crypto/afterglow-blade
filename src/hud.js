// 战斗界面：头像框、血条、技能栏、连击、首领血条、小地图，以及标题 / 结算画面
import { VIEW_W, VIEW_H, COLORS, FONT_NUM, FONT_TITLE, FONT_UI, clamp } from './config.js';
import { SKILLS, SKILL_KEYS } from './moves.js';
import { SKILL_TREE, xpToNext, MAX_LV, power } from './progression.js';
import { RARITY, itemTitle } from './items.js';
import { ROOM_INFO } from './dungeon.js';
import { STYLE_RANKS, STYLE_MAX } from './style.js';
import { drawFighter } from './rig.js';
import { heroSprite } from './sprite.js';
import { drawTraining } from './training.js';

const GOLD_HI = '#e9cf8e', GOLD_LO = '#7a5c30';

// 金属描边：上亮下暗的渐变，像打磨过的黄铜
function goldStroke(ctx, y0, y1) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, GOLD_HI);
  g.addColorStop(1, GOLD_LO);
  return g;
}

// 斜切的平行四边形路径（血条、面板都用它，比圆角矩形更有锋利感）
function slant(ctx, x, y, w, h, s) {
  ctx.beginPath();
  ctx.moveTo(x + s, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w - s, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

// 精致的条：深色槽 + 残影 + 渐变填充 + 高光 + 刻度 + 金边
function fancyBar(ctx, x, y, w, h, val, max, trail, top, bot, { ticks = 0, slantW = h * 0.6, border = true } = {}) {
  const r = clamp(val / max, 0, 1), tr = trail == null ? 0 : clamp(trail / max, 0, 1);
  ctx.save();
  slant(ctx, x, y, w, h, slantW);
  ctx.fillStyle = 'rgba(6,4,10,.88)';
  ctx.fill();
  ctx.clip();
  if (tr > r) {
    ctx.fillStyle = 'rgba(255,236,214,.75)';
    ctx.fillRect(x, y, w * tr, h);
  }
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, top);
  g.addColorStop(1, bot);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w * r, h);
  ctx.fillStyle = 'rgba(255,255,255,.22)';
  ctx.fillRect(x, y, w * r, Math.max(1, h * 0.32));
  if (r > 0 && r < 1) {
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.fillRect(x + w * r - 1.5, y, 1.5, h);
  }
  if (ticks) {
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    for (let i = 1; i < ticks; i++) ctx.fillRect(x + (w * i) / ticks, y + h * 0.45, 1, h * 0.55);
  }
  ctx.restore();
  if (border) {
    slant(ctx, x - 0.5, y - 0.5, w + 1, h + 1, slantW);
    ctx.strokeStyle = 'rgba(233,207,142,.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// ---------------- 左上：头像框 + 状态条 ----------------
function drawPlayerFrame(ctx, game) {
  const p = game.player, s = game.save, t = game.ticks;
  const cx = 56, cy = 58, R = 36;
  ctx.save();
  // 头像底
  const bg = ctx.createRadialGradient(cx, cy - 10, 4, cx, cy, R);
  bg.addColorStop(0, '#22324a');
  bg.addColorStop(1, '#07060c');
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();
  // 半身像（就是游戏里的角色模型，装备变了头像也会变）
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R - 2, 0, Math.PI * 2);
  ctx.clip();
  if (heroSprite.ready && heroSprite.avatar) {
    ctx.drawImage(heroSprite.avatar, cx - R, cy - R, R * 2, R * 2);
  } else {
    ctx.translate(cx - 4, cy + 112);
    ctx.scale(1.55, 1.55);
    drawFighter(ctx, 0, 0, p.look, { crouch: 0.05 + Math.sin(t * 0.06) * 0.03, angle: 1.1, walk: 0, lean: 2 }, { facing: 1, t });
  }
  ctx.restore();
  // 低血量时头像泛红
  if (p.hp / p.maxHp < 0.3) {
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,40,60,${0.18 + 0.12 * Math.sin(t * 0.2)})`;
    ctx.fill();
  }
  // 双层金属环
  ctx.lineWidth = 3;
  ctx.strokeStyle = goldStroke(ctx, cy - R, cy + R);
  ctx.beginPath();
  ctx.arc(cx, cy, R + 1.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(127,243,255,.45)';
  ctx.beginPath();
  ctx.arc(cx, cy, R - 2.5, 0, Math.PI * 2);
  ctx.stroke();
  // 等级徽章
  const bx = cx - 26, by = cy + 26;
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#0b0910';
  ctx.fillRect(-12, -12, 24, 24);
  ctx.strokeStyle = goldStroke(ctx, -12, 12);
  ctx.lineWidth = 2;
  ctx.strokeRect(-12, -12, 24, 24);
  ctx.restore();
  ctx.font = `600 19px ${FONT_NUM}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = GOLD_HI;
  ctx.fillText(s.lv, bx, by + 2);

  // 名字与状态条
  ctx.textAlign = 'left';
  ctx.font = `22px ${FONT_TITLE}`;
  ctx.fillStyle = COLORS.ink;
  ctx.shadowColor = 'rgba(0,0,0,.8)';
  ctx.shadowBlur = 4;
  ctx.fillText(heroSprite.ready ? '绯隼' : '残光剑士', 104, 30);
  ctx.shadowBlur = 0;
  fancyBar(ctx, 102, 42, 240, 16, p.hp, p.maxHp, p.hpTrail, '#ff6a78', '#9a1028', { ticks: 10 });
  fancyBar(ctx, 102, 62, 200, 9, p.mp, p.maxMp, null, '#7ac0ff', '#1d4fa8');
  fancyBar(ctx, 102, 75, 200, 4, s.lv >= MAX_LV ? 1 : s.xp, s.lv >= MAX_LV ? 1 : xpToNext(s.lv), null, '#d8c8ff', '#7a5ad8', { border: false });
  // 残光槽：满了可以放必杀
  const full = game.ult >= 100;
  fancyBar(ctx, 102, 84, 170, 7, game.ult, 100, null, full ? '#fff6c8' : '#ffd65a', full ? '#ffb347' : '#a8741a');
  ctx.font = `13px ${FONT_TITLE}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = full ? `rgba(255,214,90,${0.6 + 0.4 * Math.sin(t * 0.2)})` : 'rgba(233,207,142,.6)';
  ctx.fillText(full ? (game.touch ? '残光 · 点觉' : '残光 · H') : '残光', 278, 88);
  ctx.font = `500 16px ${FONT_NUM}`;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,.9)';
  ctx.shadowBlur = 3;
  ctx.fillText(`${Math.ceil(p.hp)} / ${p.maxHp}`, 330, 51);
  ctx.font = `500 13px ${FONT_NUM}`;
  ctx.fillStyle = '#cfe4ff';
  ctx.fillText(`${Math.floor(p.mp)}`, 296, 67);
  ctx.restore();
}

// ---------------- 右下：技能栏 ----------------
function drawSkillBar(ctx, game) {
  const p = game.player, s = game.save, t = game.ticks;
  const size = 54, gap = 10, n = SKILL_KEYS.length;
  const W = n * size + (n - 1) * gap;
  const x0 = VIEW_W - W - 26, y0 = VIEW_H - size - 24;
  // 底板
  ctx.save();
  slant(ctx, x0 - 22, y0 - 10, W + 40, size + 20, 14);
  const pg = ctx.createLinearGradient(0, y0 - 10, 0, y0 + size + 10);
  pg.addColorStop(0, 'rgba(14,10,20,.55)');
  pg.addColorStop(1, 'rgba(6,4,10,.85)');
  ctx.fillStyle = pg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(233,207,142,.25)';
  ctx.lineWidth = 1;
  ctx.stroke();

  SKILL_KEYS.forEach((key, i) => {
    const sk = SKILLS[key], x = x0 + i * (size + gap), y = y0;
    const learned = s.skills[key] > 0;
    const cd = p.cd[key], ready = learned && cd <= 0 && p.mp >= sk.mp;
    const flash = p.readyFlash?.[key] || 0;
    // 槽
    const bg = ctx.createRadialGradient(x + size / 2, y + size * 0.4, 4, x + size / 2, y + size / 2, size * 0.75);
    bg.addColorStop(0, ready ? 'rgba(40,70,90,.95)' : 'rgba(26,22,32,.95)');
    bg.addColorStop(1, 'rgba(6,4,10,.95)');
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, size, size);
    // 字形图标
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `34px ${FONT_TITLE}`;
    if (ready) {
      const gl = ctx.createRadialGradient(x + size / 2, y + size / 2, 2, x + size / 2, y + size / 2, size * 0.55);
      gl.addColorStop(0, p.glow);
      gl.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = gl;
      ctx.fillRect(x, y, size, size);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = !learned ? '#2e2834' : ready ? p.glow : p.mp < sk.mp && cd <= 0 ? '#4a6c9a' : '#5c5466';
    ctx.fillText(sk.glyph, x + size / 2, y + size / 2 + 2);
    ctx.shadowBlur = 0;
    if (!learned) {
      ctx.font = `500 15px ${FONT_NUM}`;
      ctx.fillStyle = '#8f859a';
      ctx.fillText(`LV.${SKILL_TREE.find((nd) => nd.key === key).unlock}`, x + size / 2, y + size / 2 + 3);
    } else if (cd > 0) {
      // 冷却：时钟式扇形遮罩 + 亮色的边线
      const frac = cd / p.cdMax[key];
      const a0 = -Math.PI / 2, a1 = a0 + Math.PI * 2 * frac;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, size, size);
      ctx.clip();
      ctx.fillStyle = 'rgba(0,0,0,.66)';
      ctx.beginPath();
      ctx.moveTo(x + size / 2, y + size / 2);
      ctx.arc(x + size / 2, y + size / 2, size, a0, a1);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + size / 2, y + size / 2);
      ctx.lineTo(x + size / 2 + Math.cos(a1) * size, y + size / 2 + Math.sin(a1) * size);
      ctx.stroke();
      ctx.restore();
      ctx.font = `600 24px ${FONT_NUM}`;
      ctx.fillStyle = '#fff';
      ctx.fillText(cd > 60 ? Math.ceil(cd / 60) : (cd / 60).toFixed(1), x + size / 2, y + size / 2 + 3);
    }
    // 边框：可用时金色，冷却好的一瞬间闪一下
    ctx.lineWidth = ready ? 1.5 : 1;
    ctx.strokeStyle = ready ? goldStroke(ctx, y, y + size) : 'rgba(255,255,255,.14)';
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    if (flash > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${flash / 20})`;
      ctx.lineWidth = 2 + (20 - flash) * 0.3;
      ctx.strokeRect(x - (20 - flash) * 0.4, y - (20 - flash) * 0.4, size + (20 - flash) * 0.8, size + (20 - flash) * 0.8);
    }
    // 按键标签
    ctx.fillStyle = 'rgba(6,4,10,.9)';
    ctx.fillRect(x - 3, y - 3, 15, 15);
    ctx.strokeStyle = 'rgba(233,207,142,.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 2.5, y - 2.5, 14, 14);
    ctx.font = `500 14px ${FONT_NUM}`;
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(sk.key, x + 4.5, y + 5.5);
    // 魔力消耗
    ctx.textAlign = 'right';
    ctx.font = `500 13px ${FONT_NUM}`;
    ctx.fillStyle = p.mp >= sk.mp ? '#8fc4ff' : '#ff6a78';
    ctx.fillText(sk.mp, x + size - 4, y + size - 7);
  });
  ctx.restore();
}

// ---------------- 右侧：连击 ----------------
function drawCombo(ctx, game) {
  if (game.combo < 2) return;
  const x = VIEW_W - 34, y = 168;
  const pop = 1 + (game.comboPop / 8) * 0.3;
  const hi = game.combo >= 50 ? '#ffffff' : game.combo >= 30 ? '#b6f9ff' : game.combo >= 12 ? '#fff0b0' : '#ffffff';
  const lo = game.combo >= 50 ? '#ff9a2e' : game.combo >= 30 ? COLORS.blade : game.combo >= 12 ? '#ffb347' : '#b9aec4';
  ctx.save();
  ctx.translate(x, y);
  ctx.transform(1, 0, -0.18, 1, 0, 0); // 斜体
  ctx.scale(pop, pop);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 70px ${FONT_NUM}`;
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(8,3,8,.9)';
  ctx.strokeText(game.combo, -62, 0);
  const g = ctx.createLinearGradient(0, -52, 0, 0);
  g.addColorStop(0, hi);
  g.addColorStop(1, lo);
  ctx.fillStyle = g;
  ctx.fillText(game.combo, -62, 0);
  ctx.restore();
  ctx.save();
  ctx.textAlign = 'right';
  ctx.font = `26px ${FONT_TITLE}`;
  ctx.fillStyle = COLORS.ink;
  ctx.shadowColor = 'rgba(0,0,0,.8)';
  ctx.shadowBlur = 4;
  ctx.fillText('连击', x, y - 4);
  ctx.font = `500 13px ${FONT_NUM}`;
  ctx.fillStyle = 'rgba(233,226,214,.55)';
  ctx.fillText('C O M B O', x, y - 32);
  ctx.font = `500 18px ${FONT_NUM}`;
  ctx.fillStyle = '#ffd65a';
  ctx.fillText(`${game.comboDmg.toLocaleString()}`, x, y + 22);
  ctx.font = `12px ${FONT_UI}`;
  ctx.fillStyle = 'rgba(233,226,214,.6)';
  ctx.fillText('总伤害', x - ctx.measureText(`${game.comboDmg.toLocaleString()}`).width * 1.05 - 26, y + 21);
  const bw = 160 * (game.comboT / 110);
  const bg = ctx.createLinearGradient(x - 160, 0, x, 0);
  bg.addColorStop(0, 'rgba(0,0,0,0)');
  bg.addColorStop(1, lo);
  ctx.fillStyle = bg;
  ctx.fillRect(x - bw, y + 32, bw, 2);
  ctx.restore();
}

// ---------------- 右侧：风格评价 ----------------
function drawStyle(ctx, game) {
  const S = game.style;
  if (S.pts <= 0 && S.rank === 0) return;
  const R = STYLE_RANKS[S.rank], next = STYLE_RANKS[S.rank + 1];
  const x = VIEW_W - 30, y = 262;
  const pop = 1 + (S.pop / 22) * 0.5;
  const frac = next ? (S.pts - R.at) / (next.at - R.at) : S.pts / STYLE_MAX;
  ctx.save();
  // 评级字母
  ctx.translate(x - 64, y);
  ctx.transform(1, 0, -0.2, 1, 0, 0);
  ctx.scale(pop, pop);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 ${R.letter.length > 1 ? 50 : 60}px ${FONT_NUM}`;
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(8,3,8,.92)';
  ctx.strokeText(R.letter, 0, 0);
  const g = ctx.createLinearGradient(0, -48, 0, 0);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, R.color);
  ctx.fillStyle = g;
  ctx.fillText(R.letter, 0, 0);
  ctx.restore();
  ctx.save();
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `28px ${FONT_TITLE}`;
  ctx.fillStyle = R.color;
  ctx.fillText(R.word, x, y - 4);
  // 进度条（往下一级）
  fancyBar(ctx, x - 150, y + 8, 150, 4, frac, 1, null, '#ffffff', R.color, { border: false });
  ctx.restore();
}

// ---------------- 必杀演出：电影黑边 + 斜切立绘 + 书法大字 ----------------
function drawUltCutin(ctx, game) {
  const U = game.ultSeq;
  if (!U) return;
  const t = U.t, p = game.player;
  const bars = Math.min(1, t / 10) * (t > 165 ? Math.max(0, (175 - t) / 10) : 1);
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, VIEW_W, 46 * bars);
  ctx.fillRect(0, VIEW_H - 46 * bars, VIEW_W, 46 * bars);
  if (t < 56) {
    const slide = t < 12 ? 1 - Math.pow(1 - t / 12, 3) : 1;
    const out = t > 46 ? (t - 46) / 10 : 0;
    ctx.globalAlpha = 1 - out;
    // 斜切的光带
    ctx.save();
    ctx.translate(VIEW_W / 2, VIEW_H / 2);
    ctx.rotate(-0.18);
    const bw = VIEW_W * 1.4 * slide;
    const bg = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
    bg.addColorStop(0, 'rgba(6,4,10,0)');
    bg.addColorStop(0.2, 'rgba(6,4,10,.92)');
    bg.addColorStop(0.8, 'rgba(6,4,10,.92)');
    bg.addColorStop(1, 'rgba(6,4,10,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(-bw / 2, -110, bw, 220);
    ctx.fillStyle = p.glow;
    ctx.fillRect(-bw / 2, -112, bw, 3);
    ctx.fillRect(-bw / 2, 109, bw, 3);
    ctx.restore();
    // 立绘：放大的主角模型从左侧滑入
    ctx.save();
    ctx.beginPath();
    ctx.translate(VIEW_W / 2, VIEW_H / 2);
    ctx.rotate(-0.18);
    ctx.rect(-VIEW_W, -108, VIEW_W * 2, 216);
    ctx.rotate(0.18);
    ctx.translate(-VIEW_W / 2, -VIEW_H / 2);
    ctx.clip();
    if (heroSprite.ready && heroSprite.full) {
      const H = 760, W = H * (heroSprite.full.width / heroSprite.full.height);
      ctx.drawImage(heroSprite.full, lerpX(-420, 120, slide) + t * 0.8, 40, W, H);
    } else {
      ctx.translate(lerpX(-200, 300, slide) + t * 0.8, 560);
      ctx.scale(4.4, 4.4);
      drawFighter(ctx, 0, 0, p.look, { crouch: 0.3, angle: -2.6, lean: 8, walk: 0.8, backAngle: 3 }, { facing: 1, t: t * 3 });
    }
    ctx.restore();
    // 大字
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `86px ${FONT_TITLE}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${6 + t * 0.3}px`;
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha *= Math.min(1, t / 8);
    ctx.fillText('残光·终焉', VIEW_W * 0.62 + (1 - slide) * 300, VIEW_H / 2 - 4);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }
  ctx.restore();
}
const lerpX = (a, b, u) => a + (b - a) * u;

// ---------------- 左侧：拾取 / 系统提示 ----------------
function drawToasts(ctx, game) {
  game.toasts.forEach((t, i) => {
    const age = 200 - t.life;
    const slide = Math.min(1, age / 10);
    const a = Math.min(1, t.life / 30) * slide;
    const x = 18 - (1 - slide) * 30, y = 110 + i * 26;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `14px ${FONT_UI}`;
    const w = ctx.measureText(t.text).width + 26;
    const g = ctx.createLinearGradient(x, 0, x + w + 40, 0);
    g.addColorStop(0, 'rgba(6,4,10,.85)');
    g.addColorStop(1, 'rgba(6,4,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y - 10, w + 40, 21);
    ctx.fillStyle = t.color;
    ctx.fillRect(x, y - 10, 2, 21);
    ctx.textBaseline = 'middle';
    ctx.fillText(t.text, x + 12, y + 1);
    ctx.restore();
  });
}

export function drawHUD(ctx, game) {
  ctx.save();
  ctx.textBaseline = 'middle';
  drawPlayerFrame(ctx, game);
  drawToasts(ctx, game);

  // 顶部中央：首领血条，或者最近攻击的敌人
  const f = game.focus;
  if (!drawBossBar(ctx, game) && f && !f.remove) {
    const w = 320, x = VIEW_W / 2 - w / 2 + 20, y = game.touch ? 64 : 28;
    ctx.textAlign = 'left';
    ctx.font = `20px ${FONT_TITLE}`;
    ctx.fillStyle = f.elite ? COLORS.gold : COLORS.ink;
    ctx.shadowColor = 'rgba(0,0,0,.8)';
    ctx.shadowBlur = 4;
    ctx.fillText(f.name, x, y);
    ctx.shadowBlur = 0;
    const nw = ctx.measureText(f.name).width;
    ctx.font = `500 17px ${FONT_NUM}`;
    ctx.fillStyle = '#b9aec4';
    ctx.fillText(`LV.${f.lv}`, x + nw + 10, y + 2);
    fancyBar(ctx, x, y + 14, w, 11, f.hp, f.maxHp, f.hpTrail, '#ff6a78', '#9a1028');
    if (f.maxArmor > 0) {
      const broken = f.brokenT > 0;
      fancyBar(ctx, x, y + 29, w, 4, broken ? 0 : f.armor, f.maxArmor, null, '#ffd08a', '#c7782a', { border: false });
      ctx.font = `13px ${FONT_UI}`;
      ctx.fillStyle = broken ? COLORS.ember : '#b9aec4';
      ctx.textAlign = 'right';
      ctx.fillText(broken ? '破防中 · 伤害 +30%' : '霸体', x + w, y);
    }
  }
  if (game.training) drawTraining(ctx, game);
  else drawMinimap(ctx, game);
  drawCombo(ctx, game);
  drawStyle(ctx, game);
  drawUltCutin(ctx, game);
  if (!game.touch) drawSkillBar(ctx, game);

  // 操作提示：只在前几次出征的开头出现，然后淡出
  if (!game.touch && game.save.runs < 3 && game.frame < 900) {
    ctx.globalAlpha = Math.min(1, (900 - game.frame) / 120) * 0.6;
    ctx.textAlign = 'left';
    ctx.font = `13px ${FONT_UI}`;
    ctx.fillStyle = COLORS.ink;
    ctx.fillText('WASD 移动   J 攻击   K 跳跃   L 闪避   W+J 上挑   U I O P 技能   Esc 暂停', 24, VIEW_H - 24);
    ctx.globalAlpha = 1;
  }

  // 横幅：进入地下城、首领登场、阶段切换、精英房间……
  const b = game.banner;
  if (b) {
    const a = b.t < 15 ? b.t / 15 : b.t > 100 ? Math.max(0, 1 - (b.t - 100) / 30) : 1;
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    const big = !b.small, y = big ? 228 : 214;
    const hh = big ? 112 : 72;
    const band = ctx.createLinearGradient(0, 0, VIEW_W, 0);
    band.addColorStop(0, 'rgba(6,4,10,0)');
    band.addColorStop(0.3, 'rgba(6,4,10,.78)');
    band.addColorStop(0.7, 'rgba(6,4,10,.78)');
    band.addColorStop(1, 'rgba(6,4,10,0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, y - hh / 2, VIEW_W, hh);
    const line = ctx.createLinearGradient(VIEW_W / 2 - 320, 0, VIEW_W / 2 + 320, 0);
    line.addColorStop(0, 'rgba(0,0,0,0)');
    line.addColorStop(0.5, b.color || GOLD_HI);
    line.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = line;
    ctx.fillRect(VIEW_W / 2 - 320, y - hh / 2, 640, 1);
    ctx.fillRect(VIEW_W / 2 - 320, y + hh / 2 - 1, 640, 1);
    // 标题逐渐拉开字距
    const spread = Math.min(1, b.t / 40);
    ctx.font = `${big ? 62 : 40}px ${FONT_TITLE}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${4 + spread * 8}px`;
    ctx.shadowColor = b.color || 'rgba(233,207,142,.6)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = b.color || COLORS.ink;
    ctx.fillText(b.title, VIEW_W / 2, y - (b.sub ? 12 : 0));
    ctx.shadowBlur = 0;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    if (b.sub) {
      ctx.font = `16px ${FONT_UI}`;
      ctx.fillStyle = b.boss ? COLORS.ink : '#e3c98e';
      ctx.fillText(b.sub, VIEW_W / 2, y + (big ? 32 : 21));
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function dim(ctx, a) {
  ctx.fillStyle = `rgba(8,6,12,${a})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function prompt(ctx, game, text, y) {
  ctx.globalAlpha = 0.55 + 0.45 * Math.sin(game.ticks * 0.08);
  ctx.font = `18px ${FONT_UI}`;
  ctx.fillStyle = COLORS.ink;
  ctx.textAlign = 'center';
  ctx.fillText(text, VIEW_W / 2, y);
  ctx.globalAlpha = 1;
}

// ---------------- 标题画面 ----------------
const titleEmbers = Array.from({ length: 50 }, (_, i) => ({ x: Math.random() * VIEW_W, y: Math.random() * VIEW_H, v: 0.4 + Math.random() * 1.2, ph: i }));

export function drawTitle(ctx, game) {
  const t = game.ticks;
  ctx.save();
  // 右侧压暗，让标题更清楚
  const side = ctx.createLinearGradient(VIEW_W * 0.35, 0, VIEW_W, 0);
  side.addColorStop(0, 'rgba(6,4,10,0)');
  side.addColorStop(1, 'rgba(6,4,10,.82)');
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // 主角立绘：放大的游戏模型，背后一圈剑光
  const hx = 290, hy = 470;
  const halo = ctx.createRadialGradient(hx, hy - 150, 10, hx, hy - 150, 260);
  halo.addColorStop(0, 'rgba(127,243,255,.22)');
  halo.addColorStop(1, 'rgba(127,243,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(hx - 280, hy - 420, 560, 560);
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.beginPath();
  ctx.ellipse(hx, hy, 120, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  if (heroSprite.ready && heroSprite.full) {
    // 立绘：缓慢上下浮动
    const H = 500, W = H * (heroSprite.full.width / heroSprite.full.height);
    ctx.drawImage(heroSprite.full, hx - W * 0.5, hy - H + 18 + Math.sin(t * 0.03) * 4, W, H);
  } else {
    ctx.translate(hx, hy);
    ctx.scale(3.3, 3.3);
    drawFighter(ctx, 0, 0, game.playerLook(), { crouch: 0.22 + Math.sin(t * 0.04) * 0.02, angle: 2.55, lean: 6, walk: 0.7, backAngle: 1.1 }, { facing: 1, t: t * 1.6 });
  }
  ctx.restore();

  // 火星
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const e of titleEmbers) {
    e.y -= e.v;
    e.x += Math.sin(t * 0.02 + e.ph) * 0.5;
    if (e.y < -5) { e.y = VIEW_H + 5; e.x = Math.random() * VIEW_W; }
    ctx.globalAlpha = 0.4 + 0.4 * Math.sin(t * 0.08 + e.ph);
    ctx.fillStyle = e.ph % 3 ? '#ffb347' : '#7ff3ff';
    ctx.fillRect(e.x, e.y, 2, 2);
  }
  ctx.restore();

  // 标题
  const lx = 690;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // 墨迹笔触衬底
  ctx.fillStyle = 'rgba(120,20,30,.55)';
  ctx.beginPath();
  ctx.moveTo(lx - 230, 196);
  ctx.quadraticCurveTo(lx - 40, 178, lx + 240, 186);
  ctx.lineTo(lx + 210, 204);
  ctx.quadraticCurveTo(lx - 30, 200, lx - 220, 214);
  ctx.closePath();
  ctx.fill();
  ctx.font = `110px ${FONT_TITLE}`;
  ctx.shadowColor = 'rgba(127,243,255,.55)';
  ctx.shadowBlur = 30;
  const tg = ctx.createLinearGradient(0, 100, 0, 210);
  tg.addColorStop(0, '#ffffff');
  tg.addColorStop(0.6, '#e9e2d6');
  tg.addColorStop(1, '#9d93a8');
  ctx.fillStyle = tg;
  ctx.fillText('残光之刃', lx, 150);
  ctx.shadowBlur = 0;
  ctx.font = `500 21px ${FONT_NUM}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '9px';
  ctx.fillStyle = GOLD_HI;
  ctx.fillText('AFTERGLOW BLADE', lx + 4, 240);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.font = `15px ${FONT_UI}`;
  ctx.fillStyle = 'rgba(233,226,214,.7)';
  ctx.fillText('坠入墓穴深处，用剑光斩开一条归路', lx, 280);

  // 开始提示
  const a = 0.55 + 0.45 * Math.sin(t * 0.07);
  const line = ctx.createLinearGradient(lx - 150, 0, lx + 150, 0);
  line.addColorStop(0, 'rgba(233,207,142,0)');
  line.addColorStop(0.5, `rgba(233,207,142,${a})`);
  line.addColorStop(1, 'rgba(233,207,142,0)');
  ctx.fillStyle = line;
  ctx.fillRect(lx - 150, 362, 300, 1);
  ctx.fillRect(lx - 150, 398, 300, 1);
  ctx.globalAlpha = a;
  ctx.font = `20px ${FONT_TITLE}`;
  ctx.fillStyle = COLORS.ink;
  ctx.fillText(game.touch ? '点 击 进 入' : '按 J 或点击进入', lx, 381);
  ctx.globalAlpha = 1;

  const s = game.save;
  ctx.font = `13px ${FONT_UI}`;
  ctx.fillStyle = '#8f859a';
  if (s.runs > 0) ctx.fillText(`Lv.${s.lv} · 战力 ${power(game.stats).toLocaleString()} · 已出征 ${s.runs} 次`, lx, 430);
  if (!game.touch) ctx.fillText('WASD 移动 · J 攻击 · K 跳跃 · L 闪避 · U I O P 技能 · M 音乐', lx, 500);
  ctx.textAlign = 'right';
  ctx.font = `500 14px ${FONT_NUM}`;
  ctx.fillStyle = 'rgba(157,147,168,.6)';
  ctx.fillText('v0.6', VIEW_W - 16, VIEW_H - 14);
  ctx.restore();
}

// 结算里的奖励列表
function drawRewards(ctx, game, x, y, t) {
  const r = game.run;
  const lines = [
    [`经验 +${r.xp}`, '#c8b6ff'],
    [`金币 +${r.gold}`, COLORS.gold],
  ];
  if (r.ups.length) lines.push([`升级！Lv.${game.save.lv}`, COLORS.blade]);
  if (r.firstClear) lines.push(['首次通关奖励 ×3', COLORS.ember]);
  const best = [...r.items].sort((a, b) => b.rar - a.rar)[0];
  lines.push([r.items.length ? `获得装备 ${r.items.length} 件` : '没有获得装备', COLORS.ink]);
  ctx.textAlign = 'left';
  lines.forEach(([text, color], i) => {
    if (t < i * 8) return;
    ctx.font = `18px ${FONT_UI}`;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y + i * 28);
  });
  if (best && t > lines.length * 8) {
    ctx.font = `17px ${FONT_UI}`;
    ctx.fillStyle = RARITY[best.rar].color;
    ctx.fillText(`最佳：[${RARITY[best.rar].name}] ${itemTitle(best)}`, x, y + lines.length * 28);
  }
}

export function drawDead(ctx, game) {
  const t = game.sceneT;
  ctx.save();
  dim(ctx, Math.min(0.72, t / 40));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `100px ${FONT_TITLE}`;
  ctx.fillStyle = COLORS.blood;
  ctx.fillText('力 竭', VIEW_W / 2, 150);
  ctx.font = `17px ${FONT_UI}`;
  ctx.fillStyle = '#b9aec4';
  ctx.fillText(`倒在「${game.stage.name}」· 清理了 ${game.roomsCleared} 个房间 · 已获得的经验、金币和装备都会保留`, VIEW_W / 2, 230);
  drawRewards(ctx, game, VIEW_W / 2 - 110, 290, t - 20);
  if (t > 60) prompt(ctx, game, game.touch ? '点击画面返回营地' : '按 J 返回营地', 480);
  ctx.restore();
}

export function drawClear(ctx, game) {
  const r = game.result, t = game.sceneT;
  ctx.save();
  dim(ctx, Math.min(0.75, t / 30));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `52px ${FONT_TITLE}`;
  ctx.fillStyle = COLORS.ink;
  ctx.fillText(`${game.stage.name} · 肃清`, VIEW_W / 2, 80);

  r.rows.forEach(([name, val, pts], i) => {
    if (t < 20 + i * 14) return;
    const y = 150 + i * 38;
    ctx.textAlign = 'left';
    ctx.font = `18px ${FONT_UI}`;
    ctx.fillStyle = '#b9aec4';
    ctx.fillText(name, 120, y);
    ctx.font = `500 30px ${FONT_NUM}`;
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(val, 230, y + 2);
    ctx.fillStyle = COLORS.gold;
    ctx.fillText('◆'.repeat(pts) + '◇'.repeat(3 - pts), 320, y + 2);
  });
  drawRewards(ctx, game, 120, 320, t - 60);

  // 评价印章：从大到小砸下来
  const st = t - 50;
  if (st > 0) {
    const sc = st < 12 ? 3 - (st / 12) * 2 : 1;
    ctx.save();
    ctx.translate(VIEW_W - 260, 250);
    ctx.scale(sc, sc);
    ctx.rotate(-0.12);
    ctx.globalAlpha = Math.min(1, st / 6);
    ctx.shadowColor = r.letter === 'S' ? COLORS.gold : COLORS.blade;
    ctx.shadowBlur = 30;
    ctx.textAlign = 'center';
    ctx.font = `600 180px ${FONT_NUM}`;
    ctx.fillStyle = r.letter === 'S' ? COLORS.gold : r.letter === 'A' ? COLORS.blade : COLORS.ink;
    ctx.fillText(r.letter, 0, 10);
    ctx.restore();
  }
  if (game.newBest && t > 70) {
    ctx.textAlign = 'center';
    ctx.font = `20px ${FONT_TITLE}`;
    ctx.fillStyle = COLORS.gold;
    ctx.fillText('新纪录', VIEW_W - 260, 370);
  }
  if (game.unlockedDiff && t > 90) {
    ctx.textAlign = 'center';
    ctx.font = `22px ${FONT_TITLE}`;
    ctx.fillStyle = game.unlockedDiff.color;
    ctx.globalAlpha = Math.min(1, (t - 90) / 20);
    ctx.fillText(`解锁「${game.unlockedDiff.name}」难度`, VIEW_W - 260, 410);
    ctx.globalAlpha = 1;
  }
  if (t > 110) prompt(ctx, game, game.touch ? '点击画面返回营地' : '按 J 返回营地', 490);
  ctx.restore();
}

// ---------------- 首领血条（多管血，DNF 风格）----------------
// 总血量切成 N 管，每管一种颜色，右边显示「×剩余管数」。比一条长血条更有「在推进」的感觉
const BAR_COLORS = [['#ff7a86', '#a8142e'], ['#ffb15a', '#b0521a'], ['#ffe08a', '#b0841a'], ['#8ff0a8', '#1f8a48'], ['#7ac0ff', '#1d4fa8'], ['#d0a0ff', '#6a2ab0']];
function drawBossBar(ctx, game) {
  const b = game.boss;
  if (!b || b.remove || b.state === 'spawn') return false;
  const w = 420, x = 372, y = game.touch ? 62 : 26;
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `24px ${FONT_TITLE}`;
  ctx.fillStyle = b.B.glow;
  ctx.shadowColor = b.B.glow;
  ctx.shadowBlur = 12;
  ctx.fillText(b.name, x, y);
  ctx.shadowBlur = 0;
  const nw = ctx.measureText(b.name).width;
  ctx.font = `500 17px ${FONT_NUM}`;
  ctx.fillStyle = '#b9aec4';
  ctx.fillText(`LV.${b.lv}`, x + nw + 10, y + 2);
  b.B.phases.forEach((ph, i) => {
    ctx.save();
    ctx.translate(x + w - 8 - (b.B.phases.length - 1 - i) * 16, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = i <= b.phase ? b.B.glow : 'rgba(255,255,255,.15)';
    ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();
  });

  const per = b.maxHp / b.bars;
  const idx = Math.max(0, Math.ceil(b.hp / per) - 1);
  const frac = b.hp <= 0 ? 0 : (b.hp - idx * per) / per;
  const trailFrac = Math.min(1, Math.max(0, (b.hpTrail - idx * per) / per));
  const by = y + 15, bh = 17;
  // 下一管的颜色铺在底下
  if (idx > 0 && b.hp > 0) {
    const [t2, b2] = BAR_COLORS[(idx - 1) % BAR_COLORS.length];
    fancyBar(ctx, x, by, w, bh, 1, 1, null, t2, b2, { border: false });
  } else fancyBar(ctx, x, by, w, bh, 0, 1, null, '#000', '#000', { border: false });
  const [t1, b1] = BAR_COLORS[idx % BAR_COLORS.length];
  ctx.save();
  slant(ctx, x, by, w, bh, bh * 0.6);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,236,214,.75)';
  ctx.fillRect(x, by, w * trailFrac, bh);
  ctx.restore();
  fancyBar(ctx, x, by, w * Math.max(frac, 0.0001), bh, 1, 1, null, t1, b1, { border: false });
  slant(ctx, x - 0.5, by - 0.5, w + 1, bh + 1, bh * 0.6);
  ctx.strokeStyle = goldStroke(ctx, by, by + bh);
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.font = `600 26px ${FONT_NUM}`;
  ctx.fillStyle = COLORS.ink;
  ctx.fillText(`×${b.hp > 0 ? idx + 1 : 0}`, x + w + 8, by + bh / 2 + 2);
  // 霸体条
  const broken = b.brokenT > 0;
  fancyBar(ctx, x + 6, by + bh + 4, w - 12, 5, broken ? 240 - b.brokenT : b.armor, broken ? 240 : b.maxArmor, null,
    broken ? 'rgba(255,208,138,.4)' : '#ffd08a', broken ? 'rgba(199,120,42,.4)' : '#c7782a', { border: false });
  if (broken) {
    ctx.font = `14px ${FONT_UI}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.ember;
    ctx.fillText('破防！伤害 +30%，可以浮空连击', x + w / 2, by + bh + 20);
  }
  ctx.restore();
  return true;
}

// ---------------- 小地图 ----------------
// 只显示走过的房间和与它们相连的房间；首领房间一开始就能看到
function drawMinimap(ctx, game) {
  const D = game.dungeon;
  if (!D) return;
  const rooms = [...D.rooms.values()];
  const linked = (r) => Object.keys(r.doors).some((d) => {
    const n = D.get(r.x + { e: 1, w: -1, n: 0, s: 0 }[d], r.y + { e: 0, w: 0, n: -1, s: 1 }[d]);
    return n?.visited;
  });
  const known = (r) => r.visited || r.type === 'boss' || linked(r);
  const xs = rooms.map((r) => r.x), ys = rooms.map((r) => r.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const cw = 18, ch = 12, gap = 5;
  const W = (maxX - minX + 1) * (cw + gap) - gap, H = (maxY - minY + 1) * (ch + gap) - gap;
  const x0 = VIEW_W - 18 - W, y0 = 18;
  const pos = (r) => [x0 + (r.x - minX) * (cw + gap), y0 + (r.y - minY) * (ch + gap)];
  ctx.save();
  ctx.fillStyle = 'rgba(8,6,12,.6)';
  ctx.fillRect(x0 - 7, y0 - 7, W + 14, H + 14);
  // 通道
  ctx.strokeStyle = 'rgba(233,226,214,.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const r of rooms) {
    if (!known(r)) continue;
    const [x, y] = pos(r);
    if (r.doors.e && known(D.get(r.x + 1, r.y))) { ctx.moveTo(x + cw, y + ch / 2); ctx.lineTo(x + cw + gap, y + ch / 2); }
    if (r.doors.s && known(D.get(r.x, r.y + 1))) { ctx.moveTo(x + cw / 2, y + ch); ctx.lineTo(x + cw / 2, y + ch + gap); }
  }
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `11px ${FONT_TITLE}`;
  for (const r of rooms) {
    if (!known(r)) continue;
    const [x, y] = pos(r);
    const cur = r === game.room;
    ctx.fillStyle = cur ? COLORS.blade : r.cleared ? '#4a4458' : r.visited ? '#2a2433' : 'rgba(0,0,0,.4)';
    ctx.fillRect(x, y, cw, ch);
    ctx.strokeStyle = r.type === 'boss' ? COLORS.blood : 'rgba(233,226,214,.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
    const g = ROOM_INFO[r.type].glyph;
    if (g) {
      ctx.fillStyle = cur ? '#0b0910' : r.type === 'boss' ? COLORS.blood : r.type === 'treasure' ? COLORS.gold : r.type === 'rest' ? '#6fe38a' : COLORS.ember;
      ctx.fillText(g, x + cw / 2, y + ch / 2 + 1);
    }
  }
  ctx.font = `14px ${FONT_TITLE}`;
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(233,226,214,.6)';
  ctx.fillText(game.stage.name, x0 + W, y0 + H + 22);
  ctx.restore();
}
