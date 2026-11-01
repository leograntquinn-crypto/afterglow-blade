// 战斗界面：血条、技能栏、连击数、目标血条、拾取提示，以及标题 / 结算画面
import { VIEW_W, VIEW_H, COLORS, FONT_NUM, FONT_TITLE, FONT_UI, clamp } from './config.js';
import { SKILLS, SKILL_KEYS } from './moves.js';
import { SKILL_TREE, xpToNext, MAX_LV, power } from './progression.js';
import { RARITY, itemTitle } from './items.js';
import { ROOM_INFO } from './dungeon.js';

function bar(ctx, x, y, w, h, val, max, trail, color) {
  ctx.fillStyle = 'rgba(8,6,12,.75)';
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  if (trail != null) {
    ctx.fillStyle = '#efe6d6';
    ctx.fillRect(x, y, w * clamp(trail / max, 0, 1), h);
  }
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * clamp(val / max, 0, 1), h);
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.fillRect(x, y, w * clamp(val / max, 0, 1), Math.max(1, h * 0.3));
}

export function drawHUD(ctx, game) {
  const p = game.player, s = game.save;
  ctx.save();
  ctx.textBaseline = 'middle';

  // 左上：角色
  ctx.font = `24px ${FONT_TITLE}`;
  ctx.fillStyle = COLORS.ink;
  ctx.fillText('残光剑士', 22, 28);
  ctx.font = `500 20px ${FONT_NUM}`;
  ctx.fillStyle = COLORS.blade;
  ctx.fillText(`LV.${s.lv}`, 122, 30);
  bar(ctx, 22, 48, 260, 14, p.hp, p.maxHp, p.hpTrail, COLORS.blood);
  bar(ctx, 22, 68, 200, 8, p.mp, p.maxMp, null, COLORS.mp);
  bar(ctx, 22, 82, 200, 3, s.lv >= MAX_LV ? 1 : s.xp, s.lv >= MAX_LV ? 1 : xpToNext(s.lv), null, '#c8b6ff');
  ctx.font = `500 17px ${FONT_NUM}`;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.ceil(p.hp)} / ${p.maxHp}`, 278, 56);
  ctx.textAlign = 'left';

  // 拾取提示
  game.toasts.forEach((t, i) => {
    ctx.globalAlpha = Math.min(1, t.life / 30);
    ctx.font = `15px ${FONT_UI}`;
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, 22, 104 + i * 22);
  });
  ctx.globalAlpha = 1;

  // 顶部中央：首领血条，或者最近攻击的敌人
  const f = game.focus;
  if (drawBossBar(ctx, game)) {
    // 首领在场时只显示首领血条
  } else if (f && !f.remove) {
    const w = 360, x = VIEW_W / 2 - w / 2, y = game.touch ? 62 : 26; // 触屏时让出顶部暂停按钮
    ctx.font = `20px ${FONT_TITLE}`;
    ctx.fillStyle = f.elite ? COLORS.gold : COLORS.ink;
    ctx.fillText(f.name, x, y);
    const nw = ctx.measureText(f.name).width;
    ctx.font = `500 18px ${FONT_NUM}`;
    ctx.fillStyle = '#b9aec4';
    ctx.fillText(`LV.${f.lv}`, x + nw + 10, y + 2);
    bar(ctx, x, y + 16, w, 12, f.hp, f.maxHp, f.hpTrail, COLORS.blood);
    if (f.maxArmor > 0) {
      const broken = f.brokenT > 0;
      bar(ctx, x, y + 34, w, 5, broken ? 0 : f.armor, f.maxArmor, null, COLORS.ember);
      ctx.font = `13px ${FONT_UI}`;
      ctx.fillStyle = broken ? COLORS.ember : '#b9aec4';
      ctx.textAlign = 'right';
      ctx.fillText(broken ? '破防中 · 伤害 +30%' : '霸体', x + w, y);
      ctx.textAlign = 'left';
    }
  }
  drawMinimap(ctx, game);

  // 右侧：连击
  const comboY = 160;
  if (game.combo >= 2) {
    const pop = 1 + (game.comboPop / 8) * 0.35;
    const c = game.combo >= 30 ? COLORS.blade : game.combo >= 12 ? COLORS.gold : '#ffffff';
    ctx.textAlign = 'right';
    ctx.font = `600 ${64 * pop}px ${FONT_NUM}`;
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(10,4,8,.85)';
    ctx.strokeText(game.combo, VIEW_W - 78, comboY);
    ctx.fillStyle = c;
    ctx.fillText(game.combo, VIEW_W - 78, comboY);
    ctx.font = `26px ${FONT_TITLE}`;
    ctx.fillStyle = COLORS.ink;
    ctx.fillText('连击', VIEW_W - 24, comboY + 6);
    ctx.fillStyle = c;
    ctx.fillRect(VIEW_W - 24 - 140 * (game.comboT / 110), comboY + 32, 140 * (game.comboT / 110), 3);
  }

  // 技能栏（触屏时冷却直接显示在按钮上，这里不画）
  const size = 52, gap = 8;
  const sx0 = VIEW_W - (size + gap) * SKILL_KEYS.length - 14;
  const sy0 = VIEW_H - size - 22;
  if (!game.touch) SKILL_KEYS.forEach((key, i) => {
    const sk = SKILLS[key], x = sx0 + i * (size + gap), y = sy0;
    const learned = s.skills[key] > 0;
    const cd = p.cd[key], ready = learned && cd <= 0 && p.mp >= sk.mp;
    ctx.fillStyle = 'rgba(12,9,16,.8)';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = ready ? 'rgba(127,243,255,.7)' : 'rgba(255,255,255,.15)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    ctx.textAlign = 'center';
    ctx.font = `32px ${FONT_TITLE}`;
    ctx.fillStyle = !learned ? '#3a3440' : ready ? p.glow : p.mp < sk.mp && cd <= 0 ? '#4a6c9a' : '#6c6474';
    ctx.fillText(sk.glyph, x + size / 2, y + size / 2 + 2);
    if (!learned) {
      ctx.font = `500 15px ${FONT_NUM}`;
      ctx.fillStyle = '#8f859a';
      ctx.fillText(`LV.${SKILL_TREE.find((n) => n.key === key).unlock}`, x + size / 2, y + size / 2 + 3);
    } else if (cd > 0) {
      // 冷却遮罩：按剩余比例画扇形，裁剪在方框内
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, size, size);
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(x + size / 2, y + size / 2);
      ctx.arc(x + size / 2, y + size / 2, size * 0.75, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (cd / p.cdMax[key]));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.font = `600 22px ${FONT_NUM}`;
      ctx.fillStyle = '#fff';
      ctx.fillText(Math.ceil(cd / 60), x + size / 2, y + size / 2 + 3);
    }
    ctx.font = `500 14px ${FONT_NUM}`;
    if (!game.touch) {
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.ink;
      ctx.fillText(sk.key, x + 5, y + 10);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.mp;
    ctx.fillText(sk.mp, x + size - 4, y + size - 8);
  });

  if (!game.touch) {
    ctx.textAlign = 'left';
    ctx.font = `13px ${FONT_UI}`;
    ctx.fillStyle = 'rgba(233,226,214,.5)';
    ctx.fillText('WASD 移动  J 攻击  K 跳跃  L 闪避  W+J 上挑  U I O P 技能  Esc 暂停', 22, VIEW_H - 22);
  }

  // 横幅：进入地下城、首领登场、阶段切换、精英房间……
  const b = game.banner;
  if (b) {
    const a = b.t < 15 ? b.t / 15 : b.t > 100 ? Math.max(0, 1 - (b.t - 100) / 30) : 1;
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    const big = !b.small, y = big ? 225 : 210;
    ctx.fillStyle = 'rgba(8,6,12,.55)';
    ctx.fillRect(0, y - (big ? 55 : 36), VIEW_W, big ? 110 : 70);
    if (b.boss) {
      const g = ctx.createLinearGradient(VIEW_W / 2 - 300, 0, VIEW_W / 2 + 300, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, b.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(VIEW_W / 2 - 300, y - 55, 600, 2);
      ctx.fillRect(VIEW_W / 2 - 300, y + 53, 600, 2);
    }
    ctx.font = `${big ? 64 : 42}px ${FONT_TITLE}`;
    ctx.fillStyle = b.color || COLORS.ink;
    ctx.fillText(b.title, VIEW_W / 2, y - (b.sub ? 11 : 0));
    if (b.sub) {
      ctx.font = `17px ${FONT_UI}`;
      ctx.fillStyle = b.boss ? COLORS.ink : COLORS.ember;
      ctx.fillText(b.sub, VIEW_W / 2, y + (big ? 33 : 22));
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

export function drawTitle(ctx, game) {
  ctx.save();
  dim(ctx, 0.62);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = COLORS.blade;
  ctx.shadowBlur = 26;
  ctx.font = `104px ${FONT_TITLE}`;
  ctx.fillStyle = COLORS.ink;
  ctx.fillText('残光之刃', VIEW_W / 2, 150);
  ctx.shadowBlur = 0;
  const w = 260 + 30 * Math.sin(game.ticks * 0.05);
  const g = ctx.createLinearGradient(VIEW_W / 2 - w, 0, VIEW_W / 2 + w, 0);
  g.addColorStop(0, 'rgba(127,243,255,0)');
  g.addColorStop(0.5, COLORS.blade);
  g.addColorStop(1, 'rgba(127,243,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(VIEW_W / 2 - w, 214, w * 2, 2);
  ctx.font = `500 22px ${FONT_NUM}`;
  ctx.fillStyle = '#9d93a8';
  ctx.fillText('A F T E R G L O W   B L A D E', VIEW_W / 2, 240);

  const rows = game.touch
    ? [['左摇杆', '移动'], ['攻', '攻击（连按三连斩）'], ['跳 / 闪', '跳跃 / 无敌闪避'], ['摇杆上推 + 攻', '上挑浮空'], ['裂 风 崩 千', '技能']]
    : [['WASD', '移动'], ['J', '攻击（连按三连斩）'], ['K / L', '跳跃 / 无敌闪避'], ['W + J', '上挑浮空，再按 K 追击'], ['U I O P', '技能，可取消普攻']];
  ctx.font = `16px ${FONT_UI}`;
  rows.forEach(([k, v], i) => {
    const y = 296 + i * 28;
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.blade;
    ctx.fillText(k, VIEW_W / 2 - 14, y);
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(v, VIEW_W / 2 + 14, y);
  });
  prompt(ctx, game, game.touch ? '点击画面进入营地' : '按 J 或点击画面进入营地', 456);
  const s = game.save;
  if (s.runs > 0) {
    ctx.font = `14px ${FONT_UI}`;
    ctx.fillStyle = '#8f859a';
    ctx.textAlign = 'center';
    ctx.fillText(`Lv.${s.lv} · 战力 ${power(game.stats).toLocaleString()} · 已出征 ${s.runs} 次`, VIEW_W / 2, 494);
  }
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
    const y = 160 + i * 44;
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
  drawRewards(ctx, game, 120, 310, t - 60);

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
  if (t > 110) prompt(ctx, game, game.touch ? '点击画面返回营地' : '按 J 返回营地', 490);
  ctx.restore();
}

// ---------------- 首领血条（多管血，DNF 风格）----------------
// 总血量切成 N 管，每管一种颜色，右边显示「×剩余管数」。比一条长血条更有「在推进」的感觉
const BAR_COLORS = ['#ff4d5e', '#ff9a2e', '#ffd65a', '#6fe38a', '#4fa3ff', '#b46bff'];
function drawBossBar(ctx, game) {
  const b = game.boss;
  if (!b || b.remove || b.state === 'spawn') return false;
  const w = 520, x = (VIEW_W - w) / 2, y = game.touch ? 60 : 24;
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.font = `24px ${FONT_TITLE}`;
  ctx.fillStyle = b.B.glow;
  ctx.textAlign = 'left';
  ctx.fillText(b.name, x, y);
  const nw = ctx.measureText(b.name).width;
  ctx.font = `500 18px ${FONT_NUM}`;
  ctx.fillStyle = '#b9aec4';
  ctx.fillText(`LV.${b.lv}`, x + nw + 10, y + 2);
  // 阶段标记
  b.B.phases.forEach((ph, i) => {
    ctx.fillStyle = i <= b.phase ? b.B.glow : 'rgba(255,255,255,.2)';
    ctx.save();
    ctx.translate(x + w - 8 - (b.B.phases.length - 1 - i) * 16, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();
  });

  const per = b.maxHp / b.bars;
  const idx = Math.max(0, Math.ceil(b.hp / per) - 1);
  const frac = b.hp <= 0 ? 0 : (b.hp - idx * per) / per;
  const trailFrac = Math.min(1, Math.max(0, (b.hpTrail - idx * per) / per));
  const by = y + 16, bh = 16;
  ctx.fillStyle = 'rgba(8,6,12,.85)';
  ctx.fillRect(x - 2, by - 2, w + 4, bh + 4);
  if (idx > 0 && b.hp > 0) {
    ctx.fillStyle = BAR_COLORS[(idx - 1) % BAR_COLORS.length];
    ctx.fillRect(x, by, w, bh);
  }
  ctx.fillStyle = '#efe6d6';
  ctx.fillRect(x, by, w * trailFrac, bh);
  ctx.fillStyle = BAR_COLORS[idx % BAR_COLORS.length];
  ctx.fillRect(x, by, w * frac, bh);
  ctx.fillStyle = 'rgba(255,255,255,.2)';
  ctx.fillRect(x, by, w * frac, 4);
  ctx.font = `600 26px ${FONT_NUM}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.ink;
  ctx.fillText(`×${b.hp > 0 ? idx + 1 : 0}`, x + w + 10, by + bh / 2 + 2);
  // 霸体条
  const broken = b.brokenT > 0;
  ctx.fillStyle = 'rgba(8,6,12,.85)';
  ctx.fillRect(x - 2, by + bh + 3, w + 4, 7);
  ctx.fillStyle = broken ? 'rgba(255,179,71,.35)' : COLORS.ember;
  ctx.fillRect(x, by + bh + 4, w * (broken ? 1 - b.brokenT / 240 : b.armor / b.maxArmor), 5);
  ctx.font = `13px ${FONT_UI}`;
  ctx.textAlign = 'right';
  ctx.fillStyle = broken ? COLORS.ember : '#b9aec4';
  ctx.fillText(broken ? '破防中！伤害 +30%，可以浮空连击' : '霸体', x + w - 60, y);
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
  const cw = 22, ch = 15, gap = 5;
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
  ctx.font = `12px ${FONT_TITLE}`;
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
