// 剧情框架（原创，见 docs/DESIGN_CONTENT.md 第四节）：前提、每关开场卡、首领战前台词、结局。
//
// 原则：短、可跳过、不打断战斗逻辑。
//   开场卡 / 结局：盖在画面上的文字卡；开场卡期间房间的第一波敌人等卡片结束才出来
//   战前台词：首领和绯隼头顶的气泡；台词期间首领站着不出手
// 只在「从营地出征」时出现（startStage 的 story 参数）；设置里可以选「每次 / 只看第一次 / 关」。
import { VIEW_W, VIEW_H, FONT_TITLE, FONT_UI, toScreen } from './config.js';
import { settings } from './settings.js';
import { MOBILE } from './sprite.js';
import { STAGES } from './stages.js';

export const PREMISE = [
  '百年前，地表的太阳熄灭了，人们管这叫「长夜」。',
  '从那以后，世上唯一的光来自残光：每个死去的人，都会留下最后一点光。',
  '没被收起的残光会沉进大地深处的残光深渊，再慢慢浮回地面。',
  '可是这几年，深渊不再归还光了。地上的灯，一盏接一盏地暗下去。',
  '绯隼是守灯人一脉最后的剑士。她的刀，能把斩开的黑暗化成光。',
];

export const STAGE_CARDS = {
  s1: ['长夜第一百零七年，地表最后一座灯塔熄灭的那天，绯隼走进了墓穴。', '腐骨兵还记得自己是守墓人，却忘了要守的是什么。'],
  s2: ['回廊两侧的骨头摆成了路标，全都指向更深的地方。', '有什么东西在这里猎杀带着光的人。'],
  s3: ['这里曾处决偷光的人。刑台上的锁链还是热的。', '可被吊起来的，不全是贼。'],
  s4: ['祭坛上的火是绿色的 —— 那是被锁住、回不了家的残光。', '守着它们的东西，已经守了一百年。'],
  s5: ['光沉到这里，就再也浮不上去。', '黑暗中站着一个人，握着和你一样的刀。'],
};

// 首领战前台词：[说话的人, 台词]（boss = 首领，hero = 绯隼）
export const BOSS_LINES = {
  boneLord: [['boss', '活人……不许再往下走。'], ['hero', '那就让开。']],
  nightRaven: [['boss', '你身上的光，比我收集过的都亮。'], ['hero', '它不是给你的。']],
  ironJaw: [['boss', '偷光的人，都要上刑台。'], ['hero', '偷光的不是我。']],
  warden: [['boss', '这些火，是我守了一百年的东西。'], ['hero', '被锁住的火，只是另一种牢笼。']],
  afterimage: [['boss', '我等了你很久 —— 等你把光带下来。'], ['hero', '……你是谁？'], ['boss', '我是走不出去的你。']],
};

export const ENDING = [
  ['残影倒下的时候没有消散。', '它化成一道光，落进了绯隼的刀里。'],
  ['刀身里响起很多人的声音 —— 那些没能走出深渊的人。', '他们不是敌人，只是迷了路。'],
  ['绯隼带着他们往上走。', '那天，地表的第一盏灯，重新亮了起来。'],
];

const CREDITS = ['残光之刃', '', '设计与开发', '残光之刃制作组', '', '角色、首领、环境与特效美术', '残光之刃制作组', '', '感谢游玩'];

// 存档里记着看过什么：premise、各关 id、首领 key、ending
export const storyLog = (save) => (save.story ??= {});

// ---------------- 画面上的剧情层 ----------------
export class StoryUI {
  constructor(game) {
    this.g = game;
    this.card = null;    // { pages: [[行, 行]], i, t, title, onEnd }
    this.dialog = null;  // { lines, i, t, boss, onEnd }
    this.credits = null; // { t }
  }
  // 卡片期间：房间的第一波敌人等着、玩家的按键交给剧情层
  get blocking() { return !!(this.card || this.credits); }
  get active() { return !!(this.card || this.dialog || this.credits); }
  clear() { this.card = this.dialog = this.credits = null; }

  // 显示一组卡片（每页几行字）。至少显示 1 秒才能跳过，每页最多 6 秒自动翻
  showCards(pages, { title = '', onEnd = null, credits = false } = {}) {
    this.card = { pages, i: 0, t: 0, title, onEnd, credits };
  }
  showDialog(lines, boss, onEnd) {
    this.dialog = { lines, i: 0, t: 0, boss, onEnd };
  }

  // 按键：翻页 / 下一句。返回 true 表示按键被剧情用掉了
  // 剧情期间所有按键都归剧情（玩家不会在台词中途出招）；攻击 / 跳 / 闪避 / 暂停 / 回车 用来翻页
  press(a) {
    const go = a === 'attack' || a === 'jump' || a === 'start' || a === 'dash' || a === 'pause';
    if (this.credits) { if (go && this.credits.t > 60) this.endCredits(); return true; }
    if (this.card) { if (go && this.card.t > 60) this.nextPage(); return true; }
    if (this.dialog) { if (go && this.dialog.t > 20) this.nextLine(); return true; }
    return false;
  }
  nextPage() {
    const c = this.card;
    if (++c.i < c.pages.length) { c.t = 0; return; }
    this.card = null;
    if (c.credits) this.credits = { t: 0, onEnd: c.onEnd };
    else c.onEnd?.();
  }
  nextLine() {
    const d = this.dialog;
    if (++d.i < d.lines.length) { d.t = 0; return; }
    this.dialog = null;
    d.onEnd?.();
  }
  endCredits() {
    const c = this.credits;
    this.credits = null;
    c.onEnd?.();
  }

  update() {
    if (this.card && ++this.card.t > 360) this.nextPage();
    if (this.dialog && ++this.dialog.t > 150) this.nextLine();
    if (this.credits && ++this.credits.t > 60 * 12) this.endCredits();
  }

  // 画在所有东西（包括 HUD）上面
  draw(ctx) {
    if (this.dialog) this.drawDialog(ctx);
    if (this.card) this.drawCard(ctx);
    if (this.credits) this.drawCredits(ctx);
  }

  drawCard(ctx) {
    const c = this.card, lines = c.pages[c.i], t = c.t;
    const fadeIn = Math.min(1, t / 20);
    ctx.save();
    // 结局盖在结算画面上：几乎不透明；开场卡透出一点房间
    ctx.fillStyle = `rgba(4,3,8,${(c.credits ? 0.97 : 0.86) * Math.min(1, (t + (c.i ? 20 : 0)) / 20)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (c.title) {
      ctx.globalAlpha = fadeIn;
      ctx.font = `40px ${FONT_TITLE}`;
      ctx.fillStyle = '#e9cf8e';
      ctx.fillText(c.title, VIEW_W / 2, VIEW_H / 2 - 40 - lines.length * 18);
    }
    ctx.font = `21px ${FONT_UI}`;
    lines.forEach((l, k) => {
      // 一行一行地浮现
      ctx.globalAlpha = Math.max(0, Math.min(1, (t - k * 18) / 24));
      ctx.fillStyle = '#e8e0d0';
      ctx.fillText(l, VIEW_W / 2, VIEW_H / 2 + (k - (lines.length - 1) / 2) * 38 + (c.title ? 18 : 0));
    });
    if (t > 60) {
      ctx.globalAlpha = 0.45 + 0.25 * Math.sin(t * 0.08);
      ctx.font = `14px ${FONT_UI}`;
      ctx.fillStyle = '#c9c0dc';
      const verb = MOBILE ? '轻点屏幕' : '按攻击键';
      ctx.fillText(verb + (c.i < c.pages.length - 1 ? '继续' : '开始'), VIEW_W / 2, VIEW_H - 46);
    }
    ctx.restore();
  }

  drawDialog(ctx) {
    const d = this.dialog, [who, text] = d.lines[d.i], g = this.g;
    const ent = who === 'boss' ? d.boss : g.player;
    if (!ent) return;
    const [sx, sy] = toScreen(ent.x, ent.y, ent.z, g.camX);
    const x = Math.max(150, Math.min(VIEW_W - 150, sx)), y = Math.max(70, sy - ent.h - 58);
    const a = Math.min(1, d.t / 8);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `18px ${FONT_UI}`;
    const w = Math.min(380, ctx.measureText(text).width + 36), h = 46;
    // 气泡 + 指向说话人的小尖角
    ctx.fillStyle = who === 'boss' ? 'rgba(28,10,12,0.9)' : 'rgba(12,16,28,0.9)';
    ctx.strokeStyle = who === 'boss' ? (d.boss.B?.glow ?? '#ff5a3c') : '#7ff3ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx - 8, y + h / 2 - 1);
    ctx.lineTo(sx, y + h / 2 + 12);
    ctx.lineTo(sx + 8, y + h / 2 - 1);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#efe6d6';
    ctx.fillText(text, x, y + 1);
    ctx.font = `12px ${FONT_UI}`;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillText(who === 'boss' ? d.boss.B?.name ?? '' : '绯隼', x - w / 2 + 30, y - h / 2 - 9);
    ctx.restore();
  }

  drawCredits(ctx) {
    const c = this.credits, t = c.t;
    ctx.save();
    ctx.fillStyle = '#040308';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const y0 = VIEW_H + 20 - t * 0.9;
    CREDITS.forEach((l, k) => {
      const y = y0 + k * 40;
      if (y < -30 || y > VIEW_H + 30) return;
      ctx.globalAlpha = Math.min(1, Math.min(y, VIEW_H - y) / 80);
      ctx.font = k === 0 ? `46px ${FONT_TITLE}` : l && CREDITS[k - 1] === '' ? `16px ${FONT_UI}` : `20px ${FONT_UI}`;
      ctx.fillStyle = k === 0 ? '#e9cf8e' : l && CREDITS[k - 1] === '' ? '#9a92b0' : '#e8e0d0';
      ctx.fillText(l, VIEW_W / 2, y);
    });
    ctx.restore();
  }
}

// ---------------- 什么时候播 ----------------
// 设置：always 每次、first 只看第一次（默认）、off 关
const want = (log, key) => settings.story === 'always' || (settings.story !== 'off' && !log[key]);

// 出征时：第 1 关先播前提，再播关卡开场卡
export function stageIntro(game, stageIdx) {
  const log = storyLog(game.save), st = STAGES[stageIdx], pages = [];
  if (stageIdx === 0 && want(log, 'premise')) { pages.push(PREMISE.slice(0, 3), PREMISE.slice(3)); log.premise = true; }
  if (want(log, st.id)) { pages.push(STAGE_CARDS[st.id]); log[st.id] = true; }
  return pages.length ? { pages, title: st.name } : null;
}

export function bossIntro(game, key) {
  const log = storyLog(game.save);
  if (!want(log, 'boss:' + key)) return null;
  log['boss:' + key] = true;
  return BOSS_LINES[key];
}

export function endingDue(game) {
  return settings.story !== 'off' && !storyLog(game.save).ending;
}

// 营地「回看剧情」：按解锁进度列出已经看过的内容
export function storyLogHtml(save) {
  const log = storyLog(save);
  const block = (title, lines) => `<section class="story-sec"><h4>${title}</h4>${lines.map((l) => `<p>${l}</p>`).join('')}</section>`;
  const out = [];
  if (log.premise) out.push(block('长夜', PREMISE));
  const BOSS_OF = Object.fromEntries(STAGES.map((s) => [s.id, s.boss]));
  for (const st of STAGES) {
    if (!log[st.id]) continue;
    const lines = [...STAGE_CARDS[st.id]];
    const bk = BOSS_OF[st.id];
    if (log['boss:' + bk]) lines.push(...BOSS_LINES[bk].map(([w, l]) => `<b>${w === 'hero' ? '绯隼' : '首领'}</b>：${l}`));
    out.push(block(st.name, lines));
  }
  if (log.ending) out.push(block('终章', ENDING.flat()));
  return out.length ? out.join('') : '<p class="story-empty">还没有看过剧情。从营地出征，就会在每一关的开头看到。</p>';
}
