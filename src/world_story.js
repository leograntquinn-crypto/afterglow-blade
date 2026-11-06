// 大地图上的剧情（原创，见 docs/DESIGN_WORLD.md 第三节）：守灯驿的三个人、路边的刻字、地图事件。
//
// 进度 p = 普通难度通关了几关（0～5）；看完结局以后是 'end'。每个人每个进度一段话，说完可以选择接下来做什么。
// 地图事件（回到地图时按顺序播）：第一次进地图的问候、烽灯点亮、试炼碑苏醒、结局尾声。
// 存档 save.world：greeted 问候过、lit[关卡 id] 烽灯点亮演出播过、trial 试炼碑苏醒播过、ending 尾声播过、
//   heard['npc:进度'] 听过的话（「!」提示和回看剧情用）、read[刻字 id] 读过的刻字
import { STAGES } from './stages.js';
import { storyLog } from './story.js';

// ---------------- 说话的人 ----------------
// glyph / color：对话框里的徽记（刻字用；守灯驿的人和绯隼有立绘，立绘没载好时也用徽记）
export const SPEAKERS = {
  zhupo: { name: '烛婆', glyph: '烛', color: '#8fa6e0' },
  moheng: { name: '墨衡', glyph: '墨', color: '#e0a070' },
  ali: { name: '阿砾', glyph: '砾', color: '#a6dc86' },
  hero: { name: '绯隼', glyph: '隼', color: '#7ff3ff' },
  stone: { name: '刻字', glyph: '刻', color: '#b8b0c4' },
};

// ---------------- 守灯驿的三个人 ----------------
// x, y：站的位置（守灯驿门口两侧）；h：站立高度（逻辑像素，和素材一致）；look：素材没载好时占位人形的颜色
export const NPCS = [
  { id: 'zhupo', x: 1128, y: 1198, h: 56, look: { cloak: '#2e3a5c', robe: '#4a4a52', skin: '#d8c4b0', hair: '#d8d4dc', prop: 'pole' } },
  { id: 'moheng', x: 1296, y: 1190, h: 56, look: { cloak: '#4a3626', robe: '#3a3430', skin: '#c49a7a', hair: '#1e1a1a', prop: 'arm' } },
  { id: 'ali', x: 1262, y: 1246, h: 42, look: { cloak: '#5a4a32', robe: '#3e3a2e', skin: '#e0c0a0', hair: '#6a4a2a', prop: 'jar' } },
];

const Z = 'zhupo', M = 'moheng', A = 'ali', H = 'hero';
// 每人每个进度的话：[说话的人, 一句]
export const TALKS = {
  zhupo: {
    0: [[Z, '长明灯还亮着，就说明守灯驿还在。'], [Z, '西边墓园底下就是墓穴的入口。五座烽灯一座都没亮 —— 每一座都守着一条往下走的路。'], [H, '我会把它们一盏一盏点回来。'], [Z, '去吧。记住，守灯人最要紧的事，是回来。']],
    1: [[Z, '墓园的烽灯亮了。我在这儿守了四十年，头一回看见它重新亮起来。'], [Z, '下面那些守墓的……还认得你是守灯人吗？'], [H, '他们忘了。可他们还守在那里。']],
    2: [[Z, '回廊里那个收集光的猎手，被你赶走了？'], [H, '他收着的光，都回到地面上了。'], [Z, '好。光不该被谁收着。']],
    3: [[Z, '墨衡和你说过刑场的事了吗？他不爱提。'], [Z, '那些年被吊上刑台的「偷光的人」，有一半是我们守灯人。']],
    4: [[Z, '有件事，我一直没告诉你。'], [Z, '下到深渊的守灯人，要是走不出来，深渊会留下他的影子 —— 和他一模一样，连握刀的手势都一样。'], [Z, '那些影子不坏，只是……走不出去。'], [H, '如果我在下面看见的是我自己呢？'], [Z, '那就带她一起回来。']],
    5: [[Z, '你从深渊回来了。我听见了 —— 很多人的声音，从你的刀里。'], [Z, '把他们带到长明灯下面来吧。']],
    end: [[Z, '长明灯塔……我以为这辈子再也看不到它全亮的样子了。'], [Z, '光回来了。守灯人的活儿，从明天起又是点灯了。']],
  },
  moheng: {
    0: [[M, '新来的守灯人？刀给我看看……嗯，还能用。'], [M, '墓穴里的腐骨兵慢，但爱扎堆。别站在它们中间，边打边退。'], [M, '装备要换要修，随时来找我。']],
    1: [[M, '回廊里有会飞的东西 —— 烬翼。跳起来打，别站在地上等它扑。'], [M, '那个弓手会瞬移到你背后。听见羽毛声，就转身。']],
    2: [[M, '下一个是刑场。'], [M, '铁颚甩钩子之前，会在头顶转圈。看见转圈，就往旁边走。'], [M, '真被钩住了也别慌：它把你拉过去那一下，正好能弹刀。'], [H, '你很熟悉它。'], [M, '我这只手，就是在那儿留下的。']],
    3: [[M, '那年刑场审「偷光的人」。我站在台下，看着他们把一个守灯人吊上去 —— 就因为她给难民分了一盏灯。'], [M, '我冲上去，手没了，人也没救下来。'], [M, '你把铁颚打倒了。……谢谢。'], [M, '祭坛的守护者到最后会召出魂火炉。先砸炉子，再打它。']],
    4: [[M, '深渊里的东西，我也没见过。'], [M, '我只知道一件事：刀要握稳，回来的路要记住。']],
    5: [[M, '你的刀……在响。像很多人在里面说话。'], [M, '别怕它。那是回家的人在认路。']],
    end: [[M, '炉子里的火，比长明灯还早亮了一刻。'], [M, '等你有空，我给你打一把新刀 —— 不是为了下深渊，是为了挂在灯塔下面。']],
  },
  ali: {
    0: [[A, '你就是守灯人？这附近所有的地道我都画过！'], [A, '墓园在西边，沿着石路走就到。不认路的话，我给你指！']],
    1: [[A, '你看见没有？试炼碑在发光！'], [A, '大人们说，碑每亮一层，就有一个守灯人在上面试过刀。你要不要也去试试？']],
    2: [[A, '回廊底下那条路我只画了一半，后面全是骨头，我不敢下去。'], [A, '东边的刑场……我连地图都不敢画。']],
    3: [[A, '我罐子里这点光，是在墓园捡的。烛婆说，它是一个人最后的光，让我好好收着。'], [A, '等烽灯全亮了，我就把它放回长明灯里。']],
    4: [[A, '最北边那个大坑，晚上会往上冒光点，像雪倒着下。'], [A, '……你会回来的吧？']],
    5: [[A, '烽灯全亮了！全亮了！'], [A, '可是长明灯塔还没变亮……是不是还差一点什么？']],
    end: [[A, '灯塔全亮了！我把罐子里的光放进去了 —— 你看，它飞上去了！'], [H, '那个人，也回家了。']],
  },
};

// 说完之后的选择：act 由 main.js 执行
export const CHOICES = {
  zhupo: [['看看委托', 'contracts'], ['回看往事', 'storylog'], ['告辞', null]],
  moheng: [['看看装备', 'hero'], ['告辞', null]],
  ali: [['给我指路', 'guide'], ['告辞', null]],
};

// ---------------- 路边的刻字 ----------------
// kind：画成什么（sign 路牌 / stone 刻字石 / grave 墓碑）
export const INSCRIPTIONS = [
  { id: 'camp_sign', kind: 'sign', x: 1092, y: 1176, title: '路牌', text: ['西：墓园。北：骨阶。', '往东的那条路，十年没人走了。'] },
  { id: 'grave_rule', kind: 'sign', x: 700, y: 935, title: '墓园门口的木牌', text: ['守墓人须知：', '听见有人叫你的名字，不要回头。'] },
  { id: 'grave_keeper', kind: 'grave', x: 566, y: 822, lx: 548, ly: 800, title: '墓碑', text: ['这里埋着一个守灯人。', '她的光，留给了守灯驿。'] },
  { id: 'milestone', kind: 'stone', x: 742, y: 822, lx: 742, ly: 772, title: '里程石', text: ['距守灯驿 · 三里。', '灯在，人在。'] },
  { id: 'decree', kind: 'stone', x: 1386, y: 740, title: '旧告示石', text: ['刑场重地。私藏灯火者，同罪。', '—— 长夜第二十年 立'] },
  { id: 'altar_stone', kind: 'stone', x: 1654, y: 609, lx: 1700, ly: 600, title: '祭坛前的石刻', text: ['祭坛的火是借来的。', '借了，就要还。'] },
  { id: 'abyss_stone', kind: 'stone', x: 1340, y: 420, title: '断桥边的石刻', text: ['从这里往下，没有回头路。', '（下面有人用刀刻了一行小字：「有的。」）'] },
  { id: 'yard_sign', kind: 'sign', x: 1690, y: 1196, title: '练剑场的木牌', text: ['木人不会喊疼。', '但你会，所以先在这里练。'] },
];

// ---------------- 进度 ----------------
export const worldSave = (save) => {
  const w = (save.world ??= {});
  w.lit ??= {};
  w.heard ??= {};
  w.read ??= {};
  // 老存档第一次进地图：已经通关的烽灯直接亮着，不补播演出
  if (!w.init) {
    w.init = true;
    for (const st of STAGES) if (save.cleared[st.id]) w.lit[st.id] = true;
    if (save.cleared.s1) w.trial = true;
    if (storyLog(save).ending) w.ending = true;
    if (Object.keys(save.cleared).length) w.greeted = true;
  }
  return w;
};
export const progress = (save) => (storyLog(save).ending ? 'end' : STAGES.filter((st) => save.cleared[st.id]).length);
export const talkFor = (id, save) => TALKS[id][progress(save)] ?? TALKS[id][0];
// 这个人有没有没听过的话（头上画「!」）
export const hasNew = (id, save) => !worldSave(save).heard[`${id}:${progress(save)}`];

// 阿砾指路：下一个该去的地方（第一个解锁了还没通关的关卡；都通关了就是试炼碑）
export function nextGoal(save) {
  const i = STAGES.findIndex((st, k) => !save.cleared[st.id] && (k === 0 || save.cleared[STAGES[k - 1].id]));
  return i >= 0 ? `s${i + 1}` : 'trial';
}

// 回到地图时要播的事件（按顺序）
export function pendingEvents(save, storyOn) {
  const w = worldSave(save), ev = [];
  if (!w.greeted && storyOn) ev.push({ kind: 'greet' });
  STAGES.forEach((st, i) => { if (save.cleared[st.id] && !w.lit[st.id]) ev.push({ kind: 'beacon', site: `s${i + 1}`, stage: i }); });
  if (save.cleared.s1 && !w.trial) ev.push({ kind: 'trial' });
  if (storyLog(save).ending && !w.ending) ev.push({ kind: 'ending' });
  return ev;
}

// 事件里说的话
export const BEACON_LINES = [
  [[H, '墓园的烽灯，亮了。']],
  [[H, '回廊的烽灯也亮了。下面的骨头路标，终于指向了上来的方向。']],
  [[H, '刑场的烽灯。……墨衡，你看见了吗。']],
  [[H, '祭坛的绿火没有了。被锁住的光，都回到了烽灯里。']],
  [[H, '最后一座烽灯。']],
];
export const TRIAL_LINES = [[A, '你看那边 —— 试炼碑在发光！'], [A, '碑上刻着一圈一圈的纹路，每一圈都亮了一点点。']];
export const ENDING_LINES = [
  [Z, '长明灯塔……全亮了。'],
  [M, '我还以为要等到我这只铁手都锈掉。'],
  [A, '我把罐子里的光放进去了！你看，它飞上去了！'],
  [H, '长夜还没有过去。可是灯，已经回来了。'],
];

// 回看剧情：在守灯驿听过的话
export function heardLogHtml(save) {
  const w = worldSave(save), out = [];
  for (const n of NPCS) {
    const keys = [0, 1, 2, 3, 4, 5, 'end'].filter((k) => w.heard[`${n.id}:${k}`]);
    if (!keys.length) continue;
    const lines = keys.flatMap((k) => TALKS[n.id][k].map(([s, l]) => `<b>${SPEAKERS[s].name}</b>：${l}`));
    out.push(`<section class="story-sec"><h4>守灯驿 · ${SPEAKERS[n.id].name}</h4>${lines.map((l) => `<p>${l}</p>`).join('')}</section>`);
  }
  const read = INSCRIPTIONS.filter((c) => w.read[c.id]);
  if (read.length) out.push(`<section class="story-sec"><h4>守灯原的刻字</h4>${read.map((c) => `<p><b>${c.title}</b>：${c.text.join(' ')}</p>`).join('')}</section>`);
  return out.join('');
}
