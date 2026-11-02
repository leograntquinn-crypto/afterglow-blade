// 设置与无障碍：保存在这台设备上（localStorage），不随云存档同步 —— 手机和电脑想要的设置往往不同。
//   shake   震屏强度：0 关 / 0.5 弱 / 1 标准
//   flash   闪屏与冲击帧（整屏反色、强烈闪白）：关掉后保留顿帧、火花和声音
//   zoom    重击时镜头推近
//   numbers 伤害数字：all 全部 / crit 只显示暴击和自己受到的伤害 / off 关
//   sfx / music  音效、音乐音量 0~1
//   touch   触屏按钮大小：0.85 小 / 1 中 / 1.2 大
const KEY = 'afterglow-settings';
export const DEFAULTS = { shake: 1, flash: true, zoom: true, numbers: 'all', sfx: 1, music: 1, touch: 1 };

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    return { ...DEFAULTS, ...(s && typeof s === 'object' ? s : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = load();
const listeners = [];

export function onSettings(fn) {
  listeners.push(fn);
  fn(settings);
}

export function setSetting(k, v) {
  if (!(k in DEFAULTS)) return;
  settings[k] = v;
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* 隐私模式等存不了就算了 */ }
  for (const fn of listeners) fn(settings);
}

// 设置面板的选项（营地和暂停菜单共用）
export const OPTIONS = [
  { k: 'shake', name: '震屏', opts: [[0, '关'], [0.5, '弱'], [1, '标准']] },
  { k: 'flash', name: '闪屏与冲击帧', hint: '关掉后不再整屏反色、强烈闪白（对光敏感时建议关闭）', opts: [[false, '关'], [true, '开']] },
  { k: 'zoom', name: '重击镜头推近', opts: [[false, '关'], [true, '开']] },
  { k: 'numbers', name: '伤害数字', opts: [['off', '关'], ['crit', '只看暴击'], ['all', '全部']] },
  { k: 'sfx', name: '音效音量', opts: [[0, '静音'], [0.4, '低'], [0.7, '中'], [1, '高']] },
  { k: 'music', name: '音乐音量', opts: [[0, '静音'], [0.4, '低'], [0.7, '中'], [1, '高']] },
  { k: 'touch', name: '触屏按钮大小', hint: '只影响手机 / 平板', opts: [[0.85, '小'], [1, '中'], [1.2, '大']] },
];

export function renderSettings() {
  return OPTIONS.map((o) => `<div class="set-row">
      <div><b>${o.name}</b>${o.hint ? `<small>${o.hint}</small>` : ''}</div>
      <div class="seg">${o.opts.map(([v, label]) => `<button class="btn ${settings[o.k] === v ? 'on' : ''}" data-set="${o.k}" data-v='${JSON.stringify(v)}'>${label}</button>`).join('')}</div>
    </div>`).join('');
}
