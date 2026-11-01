// 界面：血条、技能栏、连击数、目标血条、标题 / 结算画面
import { VIEW_W, VIEW_H, COLORS, FONT_NUM, FONT_TITLE, FONT_UI, clamp } from './config.js';
import { SKILLS, SKILL_KEYS } from './moves.js';
import { fmtTime } from './waves.js';

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
  const p = game.player;
  ctx.save();
  ctx.textBaseline = 'middle';

  // 左上：角色
  ctx.font = `24px ${FONT_TITLE}`;
  ctx.fillStyle = COLORS.ink;
  ctx.fillText('残光剑士', 22, 28);
  ctx.font = `500 20px ${FONT_NUM}`;
  ctx.fillStyle = COLORS.blade;
  ctx.fillText('LV.1', 122, 30);
  bar(ctx, 22, 48, 260, 14, p.hp, p.maxHp, p.hpTrail, COLORS.blood);
  bar(ctx, 22, 68, 200, 8, p.mp, p.maxMp, null, COLORS.mp);
  ctx.font = `500 17px ${FONT_NUM}`;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.ceil(p.hp)} / ${p.maxHp}`, 278, 56);
  ctx.textAlign = 'left';

  // 顶部中央：最近攻击的敌人
  const f = game.focus;
  if (f && !f.remove) {
    const w = 360, x = VIEW_W / 2 - w / 2, y = 26;
    ctx.font = `20px ${FONT_TITLE}`;
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(f.T.name, x, y);
    ctx.font = `500 18px ${FONT_NUM}`;
    ctx.fillStyle = '#b9aec4';
    ctx.fillText(`LV.${f.T.lv}`, x + 92, y + 2);
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

  // 右侧：连击
  const comboY = game.touch ? 150 : 120;
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

  // 技能栏
  const size = 56, gap = 10;
  const sx0 = VIEW_W - (size + gap) * 3 - 14;
  const sy0 = game.touch ? 20 : VIEW_H - size - 22;
  SKILL_KEYS.forEach((key, i) => {
    const s = SKILLS[key], x = sx0 + i * (size + gap), y = sy0;
    const cd = p.cd[key], ready = cd <= 0 && p.mp >= s.mp;
    ctx.fillStyle = 'rgba(12,9,16,.8)';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = ready ? 'rgba(127,243,255,.7)' : 'rgba(255,255,255,.15)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    ctx.textAlign = 'center';
    ctx.font = `34px ${FONT_TITLE}`;
    ctx.fillStyle = ready ? COLORS.blade : p.mp < s.mp && cd <= 0 ? '#4a6c9a' : '#6c6474';
    ctx.fillText(s.glyph, x + size / 2, y + size / 2 + 2);
    if (cd > 0) {
      // 冷却遮罩：按剩余比例画一个扇形，裁剪在方框内
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, size, size);
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(x + size / 2, y + size / 2);
      ctx.arc(x + size / 2, y + size / 2, size * 0.7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (cd / s.cd));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.font = `600 24px ${FONT_NUM}`;
      ctx.fillStyle = '#fff';
      ctx.fillText(Math.ceil(cd / 60), x + size / 2, y + size / 2 + 3);
    }
    ctx.font = `500 14px ${FONT_NUM}`;
    if (!game.touch) {
      ctx.textAlign = 'left';
      ctx.fillStyle = COLORS.ink;
      ctx.fillText(s.key, x + 5, y + 10);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.mp;
    ctx.fillText(s.mp, x + size - 4, y + size - 8);
  });

  // 左下：按键提示
  if (!game.touch) {
    ctx.textAlign = 'left';
    ctx.font = `13px ${FONT_UI}`;
    ctx.fillStyle = 'rgba(233,226,214,.5)';
    ctx.fillText('WASD 移动   J 攻击   K 跳跃   L 闪避   W+J 上挑   U I O 技能', 22, VIEW_H - 22);
  }

  // 波次横幅
  const b = game.banner;
  if (b) {
    const a = b.t < 15 ? b.t / 15 : b.t > 100 ? Math.max(0, 1 - (b.t - 100) / 30) : 1;
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(8,6,12,.55)';
    ctx.fillRect(0, 170, VIEW_W, 110);
    ctx.font = `64px ${FONT_TITLE}`;
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(b.title, VIEW_W / 2, 214);
    ctx.font = `17px ${FONT_UI}`;
    ctx.fillStyle = COLORS.ember;
    ctx.fillText(b.sub, VIEW_W / 2, 258);
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
    ? [['左摇杆', '移动'], ['攻', '攻击（连按三连斩）'], ['跳 / 闪', '跳跃 / 无敌闪避'], ['摇杆上推 + 攻', '上挑浮空'], ['裂 风 崩', '技能']]
    : [['WASD', '移动'], ['J', '攻击（连按三连斩）'], ['K / L', '跳跃 / 无敌闪避'], ['W + J', '上挑浮空，再按 K 追击'], ['U I O', '技能，可取消普攻']];
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
  ctx.textAlign = 'center';
  prompt(ctx, game, game.touch ? '点击画面开始' : '按 J 或点击画面开始', 456);
  if (game.best) {
    ctx.font = `14px ${FONT_UI}`;
    ctx.fillStyle = '#8f859a';
    ctx.fillText(`最佳评价 ${game.best.letter} · ${fmtTime(game.best.time)} · 最高 ${game.best.maxCombo} 连击`, VIEW_W / 2, 494);
  }
  ctx.restore();
}

export function drawDead(ctx, game) {
  ctx.save();
  dim(ctx, Math.min(0.7, game.sceneT / 40));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `110px ${FONT_TITLE}`;
  ctx.fillStyle = COLORS.blood;
  ctx.fillText('力 竭', VIEW_W / 2, 220);
  ctx.font = `17px ${FONT_UI}`;
  ctx.fillStyle = '#b9aec4';
  ctx.fillText(`倒在第 ${game.wave + 1} 波 · 击败 ${game.kills} 个敌人 · 最高 ${game.maxCombo} 连击`, VIEW_W / 2, 300);
  if (game.sceneT > 40) prompt(ctx, game, game.touch ? '点击画面重新挑战' : '按 J 重新挑战', 380);
  ctx.restore();
}

export function drawClear(ctx, game) {
  const r = game.result, t = game.sceneT;
  ctx.save();
  dim(ctx, Math.min(0.72, t / 30));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `56px ${FONT_TITLE}`;
  ctx.fillStyle = COLORS.ink;
  ctx.fillText('墓 穴 肃 清', VIEW_W / 2, 92);

  r.rows.forEach(([name, val, pts], i) => {
    if (t < 20 + i * 14) return;
    const y = 170 + i * 44;
    ctx.font = `18px ${FONT_UI}`;
    ctx.fillStyle = '#b9aec4';
    ctx.textAlign = 'left';
    ctx.fillText(name, VIEW_W / 2 - 260, y);
    ctx.font = `500 30px ${FONT_NUM}`;
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(val, VIEW_W / 2 - 140, y + 2);
    ctx.fillStyle = COLORS.gold;
    ctx.fillText('◆'.repeat(pts) + '◇'.repeat(3 - pts), VIEW_W / 2 - 40, y + 2);
  });

  // 评价印章：从大到小砸下来
  const st = t - 70;
  if (st > 0) {
    const s = st < 12 ? 3 - (st / 12) * 2 : 1;
    ctx.save();
    ctx.translate(VIEW_W / 2 + 190, 220);
    ctx.scale(s, s);
    ctx.rotate(-0.12);
    ctx.globalAlpha = Math.min(1, st / 6);
    ctx.shadowColor = r.letter === 'S' ? COLORS.gold : COLORS.blade;
    ctx.shadowBlur = 30;
    ctx.font = `600 170px ${FONT_NUM}`;
    ctx.fillStyle = r.letter === 'S' ? COLORS.gold : r.letter === 'A' ? COLORS.blade : COLORS.ink;
    ctx.fillText(r.letter, 0, 10);
    ctx.restore();
  }
  ctx.textAlign = 'center';
  if (game.newBest && t > 90) {
    ctx.font = `20px ${FONT_TITLE}`;
    ctx.fillStyle = COLORS.gold;
    ctx.fillText('新纪录', VIEW_W / 2 + 190, 330);
  }
  if (t > 100) prompt(ctx, game, game.touch ? '点击画面再来一局' : '按 J 再来一局', 440);
  ctx.restore();
}
