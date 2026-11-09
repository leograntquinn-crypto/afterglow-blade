import { FX_ART } from './fx_art.js';
import { GEAR_ART, gearGlyph } from './gear/art.js';
import { compareItem, COMPARISON } from './gear/compare.js';
import { CATALOG } from './gear/catalog.js';
import { SERIES } from './gear/series.js';
// 营地菜单（HTML）：角色与装备 / 技能 / 委托，在大地图上随时打开（Esc、B 或右上角按钮）；
// 关卡、训练场、试炼的卡片在地图上走到对应地点时单独弹出（stageCard / trainingCard / trialCard）
// 菜单类界面用 HTML 比在 Canvas 里画方便得多：自带滚动、点击、文字排版、适配手机。
// 所有按钮用 data-act 属性标记，统一在 onClick 里处理（事件委托）。

import {
  RARITY, SLOT_KEYS, SLOT_NAME, STAT_INFO, MAX_ENH, fmtStat, itemStats, hydrateItem, canImprove, itemTitle, itemKind,
  enhCost, enhRate, sellPrice, WTYPES, MARKS, reforgeCost, reforgeAffix, inheritCost,
} from './items.js';
import { ATTRS, SKILL_TREE, BAG_MAX, xpToNext, skillCap, power, resetStats, resetSkills, MAX_LV } from './progression.js';
import { STAGES, DIFFS, isUnlocked, stageKey, diffUnlocked } from './stages.js';
import { CHALLENGES } from './training.js';
import { ensureContracts, isDone, contractText, contractReward, claimContract, rerollContract } from './contracts.js';
import { TYPES } from './enemy.js';
import { SKILLS } from './moves.js';
import { BOSSES } from './boss.js';
import { drawFighter } from './rig.js';
import { heroSprite } from './sprite.js';
import { sfx } from './audio.js';
import { music } from './music.js';

const canEngrave = it => !!it && it.rar >= 2 && !CATALOG[it.def]?.fixed &&
  !['wings', 'veil'].includes(CATALOG[it.def]?.kind);

export class Hub {
  constructor(game, root) {
    this.g = game;
    this.root = root;
    this.tab = 'hero';
    this.sel = null; // 选中的装备 id
    this.body = root.querySelector('#hub-body');
    this.modal = root.querySelector('#hub-modal');
    this.tooltip = document.createElement('div');
    this.tooltip.id = 'hub-gear-tooltip';
    this.tooltip.setAttribute('role', 'tooltip');
    this.tooltip.hidden = true;
    root.append(this.tooltip);
    this.finePointer = matchMedia('(pointer: fine)');
    root.addEventListener('mouseenter', e => {
      if (e.target.matches?.('.slots .slot, .bag .cell[data-act="sel"][data-id]')) this.showGearTooltip(e);
    }, true);
    root.addEventListener('mousemove', e => this.moveGearTooltip(e));
    root.addEventListener('mouseleave', e => {
      if (e.target === this.hoverTile || e.target === root) this.hideGearTooltip();
    }, true);
    for (const event of ['pointerdown', 'dragstart', 'wheel']) root.addEventListener(event, () => this.hideGearTooltip(), {capture: true, passive: true});
    document.addEventListener('scroll', () => this.hideGearTooltip(), {capture: true, passive: true});
    this.finePointer.addEventListener('change', () => this.hideGearTooltip());
    window.addEventListener('resize', () => this.hideGearTooltip());
    this.toastEl = document.getElementById('hub-toast'); // 在 #hub 外面：地图上也要能弹提示
    root.addEventListener('click', (e) => this.onClick(e));
  }

  get save() { return this.g.save; }

  show() {
    this.root.hidden = false;
    this.render();
  }
  hide() {
    this.root.hidden = true;
    this.closeModal();
  }

  toast(text, color = '#e9e2d6') {
    const el = this.toastEl;
    el.textContent = text;
    el.style.color = color;
    el.classList.remove('show');
    void el.offsetWidth; // 重新触发动画
    el.classList.add('show');
  }

  // ---------------- 渲染 ----------------
  render() {
    this.hideGearTooltip();
    const s = this.save, S = this.g.stats;
    const need = xpToNext(s.lv);
    this.root.querySelector('#h-lv').textContent = s.lv;
    this.root.querySelector('.hname').textContent = heroSprite.ready ? '绯隼' : '残光剑士';
    this.root.querySelector('#h-xp').style.width = `${s.lv >= MAX_LV ? 100 : (s.xp / need) * 100}%`;
    this.root.querySelector('#h-xptext').textContent = s.lv >= MAX_LV ? '满级' : `${s.xp} / ${need}`;
    this.root.querySelector('#h-power').textContent = power(S).toLocaleString();
    this.root.querySelector('#h-gold').textContent = s.gold.toLocaleString();
    ensureContracts(s);
    this.root.querySelector('#h-stones').textContent = s.stones;
    this.root.querySelector('#h-sync').textContent = this.g.store.status === 'cloud' ? '云存档已同步' : '本地存档';
    this.root.querySelector('#h-music').textContent = music.muted ? '音乐：关' : '音乐：开';
    this.root.querySelectorAll('[data-tab]').forEach((b) => {
      b.classList.toggle('on', b.dataset.tab === this.tab);
      const dot = (b.dataset.tab === 'hero' && s.statPts > 0) || (b.dataset.tab === 'skills' && this.canLearnAny());
      b.classList.toggle('dot', dot);
    });
    this.body.innerHTML = this[`render_${this.tab}`]();
    this.preview = this.body.querySelector('#preview');
    if (this.sel) this.renderModal();
  }

  canLearnAny() {
    const s = this.save;
    return s.sp > 0 && SKILL_TREE.some((n) => s.skills[n.key] < skillCap(s, n));
  }

  // 训练场卡片（地图上走到练剑场时弹出）
  trainingCard() {
    const s = this.save, tDone = (s.training || []).length;
    return `<article class="stage training">
        <div class="stage-head"><h3>练剑场</h3><span class="rec">${tDone} / ${CHALLENGES.length}</span></div>
        <p>两个打不死的木人和 ${CHALLENGES.length} 条挑战：延迟连段、极限闪避、弹刀、受身、撞墙……每个机制做到一次就打勾。</p>
        <p class="meta">第一次完成每条挑战 +40 金币，全部完成再 +400</p>
        <div class="stage-foot"><span class="first">${tDone >= CHALLENGES.length ? '已出师' : '推荐新手先来'}</span><button class="btn primary" data-act="train" data-primary>进入训练</button></div>
      </article>`;
  }

  // 残光试炼卡片（地图上走到试炼碑时弹出）
  trialCard() {
    const s = this.save, open = !!s.cleared.s1;
    return `<article class="stage training trial ${open ? '' : 'locked'}">
        <div class="stage-head"><h3>残光试炼</h3><span class="rec">${s.trialBest ? `纪录 第 ${s.trialBest} 层` : '未挑战'}</span></div>
        <p>一层一个房间，越往上越强、词缀越多，每 5 层一个首领。每过一层选择：继续往上，还是带着奖励离开？</p>
        <p class="meta">每层金币，每个首领层 1 颗刻印石 · 离开拿全部奖励，阵亡只拿一半 · 一层约一分钟</p>
        <div class="stage-foot"><span class="first">${open ? '适合碎片时间' : ''}</span>${open ? '<button class="btn primary" data-act="trial" data-primary>进入试炼</button>' : '<span class="lock">通关「墓穴入口」解锁</span>'}</div>
      </article>`;
  }

  // 关卡卡片（地图上走到关卡入口时弹出）：说明、首领、评价、难度
  stageCard(i) {
    const s = this.save, st = STAGES[i];
    const open = isUnlocked(s, i);
    const best = s.best[st.id];
    const kinds = [...new Set(st.pool.flat().map((t) => t.replace('*', '')))].map((t) => TYPES[t].name).join(' · ');
    const boss = BOSSES[st.boss];
    const under = s.lv < st.lv;
    return `<article class="stage ${open ? '' : 'locked'}">
        <div class="stage-head">
          <h3>${st.name}</h3>
          <span class="rec ${under ? 'warn' : ''}">推荐 Lv.${st.lv}</span>
        </div>
        <p>${st.desc}</p>
        <p class="meta">${st.rooms} 个房间 · ${kinds} · 精英</p>
        <p class="boss-line">首领 <b style="color:${boss.glow}">${boss.name}</b> <span>${boss.title}</span></p>
        <div class="stage-foot">
          ${best ? `<span class="grade g${best.letter}">${best.letter}</span>` : `<span class="first">首通奖励 ×3</span>`}
          ${open ? `<button class="btn primary" data-act="go" data-i="${i}" data-d="0" data-primary>出征</button>` : `<span class="lock">通关「${STAGES[i - 1].name}」解锁</span>`}
        </div>
        ${s.cleared[st.id] ? `<div class="diffs">${DIFFS.slice(1).map((D, k) => {
          const d = k + 1, ok = diffUnlocked(s, i, d), b = s.best[stageKey(st, d)];
          return `<button class="btn diff" style="--dc:${D.color}" data-act="go" data-i="${i}" data-d="${d}" ${ok ? '' : 'disabled'} title="${ok ? `推荐 Lv.${st.lv + D.lvAdd}` : `通关「${DIFFS[d - 1].name}」解锁`}">
            ${D.name}${b ? ` <b class="g${b.letter}">${b.letter}</b>` : ok ? ` <small>Lv.${st.lv + D.lvAdd}</small>` : ' <small>未解锁</small>'}</button>`;
        }).join('')}</div>` : ''}
      </article>`;
  }

  // 委托：三张目标卡。进度在出征中累计，完成后在这里领取
  render_contracts() {
    const s = this.save, B = ensureContracts(s);
    const cards = B.list.map((c) => {
      const done = isDone(c), r = contractReward(c, s.lv);
      const btn = c.claimed ? '<span>已领取 · 明天补上新委托</span>'
        : done ? `<button class="btn primary" data-act="claim" data-id="${c.id}">领取</button>`
        : `<button class="btn ghost" data-act="reroll" data-id="${c.id}" ${B.rerolls > 0 ? '' : 'disabled'} title="每天可以免费换一次">换一个</button>`;
      return `<article class="contract ${c.claimed ? 'claimed' : done ? 'done' : ''}">
        <p>${contractText(c)}</p>
        <div class="bar"><i style="width:${(c.prog / c.n) * 100}%"></i></div>
        <div class="cfoot"><span>${c.prog} / ${c.n} · 刻印石 <b>×${r.stones}</b> · 金币 ${r.gold}</span>${btn}</div>
      </article>`;
    }).join('');
    return `<section class="contracts">
      <div class="contracts-head"><h3>委托</h3><small>在出征中完成（训练场不算）· 领过的格子明天补上，没完成的不会过期 · 今天还能免费换 ${B.rerolls} 次</small></div>
      <div class="clist">${cards}</div>
    </section>`;
  }

  render_hero() {
    if (!GEAR_ART.ready && !GEAR_ART.loading) GEAR_ART.load().then((ready) => {
      if (ready && !this.root.hidden && this.tab === 'hero' && this.g.scene !== 'play') this.render();
    });
    const s = this.save, S = this.g.stats;
    const slots = ['weapon','helm','chest','legs','boots','bracers','wings','veil','trinket1','trinket2'].map((k, i) => {
      const it = s.equip[k];
      return `<button class="slot ${it ? `r${it.rar}` : 'empty'}" data-act="sel" data-id="${it ? it.id : ''}" data-slot="${k}" style="--slot-row:${i % 5 + 1};--slot-col:${i < 5 ? 1 : 3}" aria-label="${SLOT_NAME[k]}${it ? `：${itemTitle(it)}` : `（空）`}" ${it ? '' : 'disabled'}>
        <span class="glyph">${it ? gearGlyph(it) : ''}</span>
      </button>`;
    }).join('');
    const marks = [...S.marks].map((k) => `<div class="mk"><b>${MARKS[k].name}</b><span>${MARKS[k].desc}</span></div>`).join('');
    const rows = [
      ['攻击力', Math.round(S.atk)], ['生命', S.maxHp], ['魔力', S.maxMp], ['防御', Math.round(S.def)],
      ['暴击率', `${(S.crit * 100).toFixed(1)}%`], ['暴击伤害', `${Math.round(S.critDmg * 100)}%`], ['冷却缩减', `${(S.cdr * 100).toFixed(1)}%`],
    ].map(([a, b]) => `<div class="kv"><span>${a}</span><b>${b}</b></div>`).join('');
    const attrs = ATTRS.map((a) => `<div class="attr">
        <div><span class="aname">${a.name}</span> <b>${S[a.key]}</b><small>${a.hint}</small></div>
        <button class="btn mini" data-act="stat" data-k="${a.key}" ${s.statPts > 0 ? '' : 'disabled'} aria-label="${a.name}加一点">+</button>
      </div>`).join('');
    const bag = s.bag.map((it) => {
      const cmp = compareItem(s,it), label = COMPARISON[cmp.verdict];
      return `<button class="cell r${it.rar}" data-act="sel" data-id="${it.id}" aria-label="${itemTitle(it)}">
        <span class="glyph">${gearGlyph(it)}</span>${it.enh ? `<i class="enh">+${it.enh}</i>` : ''}<i class="up" style="color:${label.color}">${label.symbol}</i>${it.mark ? '<i class="mk-dot"></i>' : ''}${it.locked ? '<i class="lk">🔒</i>' : ''}
      </button>`;
    }).join('') + '<span class="cell blank"></span>'.repeat(Math.max(0, 12 - s.bag.length));

    return `<div class="hero">
      <section class="panel figure">
        <canvas id="preview" width="440" height="460" aria-label="角色外观预览"></canvas>
        <div class="slots">${slots}</div>
      </section>
      <section class="panel">
        <h4>属性</h4>
        <div class="kvs">${rows}</div>
        <div class="marks"><h4>刻印 <small>${S.marks.size ? '' : '稀有、传说装备可能带有刻印，在你做到某件事时生效'}</small></h4>${marks}</div>
        <div class="attr-head"><h4>属性点</h4><span class="pts">${s.statPts > 0 ? `可分配 <b>${s.statPts}</b>` : '升级获得 3 点'}</span></div>
        ${attrs}
        <button class="btn ghost" data-act="resetStats">重置属性点（免费）</button>
      </section>
      <section class="panel">
        <div class="attr-head"><h4>背包 <small>${s.bag.length} / ${BAG_MAX}</small></h4>
          <span class="bag-tools"><button class="btn ghost mini-text" data-act="sort">整理</button><button class="btn ghost mini-text" data-act="sellJunk" data-r="0">出售普通</button><button class="btn ghost mini-text" data-act="sellJunk" data-r="1" title="不包括锁定、强化过、带刻印的装备">出售精良及以下</button></span>
        </div>
        <div class="bag">${bag}</div>
        ${s.bag.length ? '' : '<p class="hint">打倒敌人会掉落装备，出现光柱的就是。品质：<span style="color:#d8d3c8">普通</span> <span style="color:#4fa3ff">精良</span> <span style="color:#b46bff">稀有</span> <span style="color:#ff9a2e">传说</span></p>'}
      </section>
    </div>`;
  }

  render_skills() {
    const s = this.save;
    const cards = SKILL_TREE.map((n) => {
      const lvl = s.skills[n.key], cap = skillCap(s, n);
      const locked = s.lv < n.unlock;
      const can = !locked && s.sp > 0 && lvl < cap;
      const sk = n.active ? SKILLS[n.key] : null;
      const tag = n.active ? `<span class="key">${n.keyLabel}</span>主动 · 魔力 ${sk.mp} · 冷却 ${(sk.cd / 60).toFixed(1)}s` : '被动';
      const capNote = locked ? `Lv.${n.unlock} 解锁` : lvl >= n.max ? '已满级' : lvl >= cap ? `Lv.${n.unlock + lvl} 可继续升级` : '';
      return `<article class="skill ${locked ? 'locked' : ''}">
        <span class="sk-glyph">${n.glyph}</span>
        <div class="sk-body">
          <div class="sk-head"><h3>${n.name}</h3><span class="sk-lv">${lvl} / ${n.max}</span></div>
          <p class="sk-tag">${tag}</p>
          <p>${n.desc}</p>
          <p class="sk-per">每级：${n.per}</p>
        </div>
        <div class="sk-act">
          <button class="btn mini" data-act="skill" data-k="${n.key}" ${can ? '' : 'disabled'} aria-label="升级${n.name}">+</button>
          ${capNote ? `<small>${capNote}</small>` : ''}
        </div>
      </article>`;
    }).join('');
    return `<div class="skills-top"><span>剩余技能点 <b>${s.sp}</b>（每升 1 级获得 1 点）</span><button class="btn ghost" data-act="resetSkills">重置技能（免费）</button></div><div class="skills">${cards}</div>`;
  }

  // 悬停内容仅在进入瓷砖时生成；逐帧预览不参与浮层生命周期。
  hideGearTooltip() {
    this.tooltip.hidden = true;
    this.hoverTile = null;
  }

  showGearTooltip(e) {
    if (!this.finePointer.matches || !this.modal.hidden || this.root.hidden || this.tab !== 'hero') return;
    const tile = e.target, found = this.findItem(tile.dataset.id);
    if (!found && !tile.dataset.slot) return;
    this.hoverTile = tile;
    if (!found) {
      this.tooltip.textContent = `${SLOT_NAME[tile.dataset.slot]} · 空`;
    } else {
      const {it, equipped} = found, def = CATALOG[it.def];
      // 与详情一致：基础属性先去除词条再经 itemStats / fmtStat 格式化。
      const base = itemStats(hydrateItem({...it, affix: []}));
      const comparison = equipped ? null : compareItem(this.save, it);
      const label = comparison && COMPARISON[comparison.verdict];
      this.tooltip.innerHTML = `<b style="color:${RARITY[it.rar].color}">${itemTitle(it)}</b>
        <div>${itemKind(it)} · ${SERIES[def?.series]?.name || def?.series || '无'} · 物品等级 ${it.ilvl} · 强化 +${it.enh}</div>
        <ul>${Object.keys(it.base).map(k => `<li class="tooltip-stat">${STAT_INFO[k][0]} ${fmtStat(k, base[k])}</li>`).join('')}
        ${it.affix.map(a => `<li>${STAT_INFO[a.k][0]} +${fmtStat(a.k, a.v)}</li>`).join('')}</ul>
        <div>刻印：${MARKS[it.mark]?.name || '无'}${it.mark ? '（条件型）' : ''}</div>
        ${def ? `<div>状态：${def.imbue || '无'} ${it.imbueLv || 0} 档（条件型）</div><div>套装：${SERIES[def.set]?.name || def.set || '无'}</div>` : ''}
        ${comparison ? `<div style="color:${label.color}">${label.symbol} ${label.text}（${comparison.total.toFixed(1)}%） · 对比${SLOT_NAME[comparison.slot]} · 折算 +${comparison.enhAs}</div>` : ''}`;
    }
    this.tooltip.hidden = false;
    const rect = this.tooltip.getBoundingClientRect();
    this.tooltipSize = {width: rect.width, height: rect.height};
    this.moveGearTooltip(e);
  }

  moveGearTooltip(e) {
    if (this.tooltip.hidden) return;
    const {width, height} = this.tooltipSize, gap = 14, margin = 8;
    let x = e.clientX + gap, y = e.clientY + gap;
    if (x + width > innerWidth - margin) x = e.clientX - width - gap;
    if (y + height > innerHeight - margin) y = e.clientY - height - gap;
    x = Math.max(margin, Math.min(x, innerWidth - width - margin));
    y = Math.max(margin, Math.min(y, innerHeight - height - margin));
    this.tooltip.style.transform = `translate(${x}px, ${y}px)`;
  }

  // ---------------- 装备详情弹窗 ----------------
  findItem(id) {
    const s = this.save;
    for (const k of SLOT_KEYS) if (s.equip[k]?.id === id) return { it: s.equip[k], equipped: true, slot: k };
    const it = s.bag.find((x) => x.id === id);
    return it ? { it, equipped: false } : null;
  }

  renderModal() {
    for (const tile of this.root.querySelectorAll('.slot[data-id], .cell[data-id]')) {
      tile.classList.toggle('is-selected', tile.dataset.id === this.sel);
    }
    this.hideGearTooltip();
    const f = this.findItem(this.sel);
    if (!f) return this.closeModal();
    const { it, equipped } = f;
    const s = this.save, R = RARITY[it.rar];
    // 铭刻：八选一，覆盖原来的刻印
    if (this.engrave && !canEngrave(it)) this.engrave = false;
    if (this.engrave) {
      const list = Object.entries(MARKS).map(([k, M]) => `<button class="btn" data-act="engraveMark" data-k="${k}" ${it.mark === k ? 'disabled' : ''}>
          <b>${M.name}${it.mark === k ? '（当前）' : ''}</b><span>${M.desc}</span><small>适合：${M.style}</small></button>`).join('');
      this.modal.innerHTML = `<div class="sheet wide" role="dialog" aria-label="铭刻">
        <div class="card-head"><span class="glyph big r${it.rar}">${gearGlyph(it)}</span>
          <div><h3 style="color:${R.color}">铭刻 · ${itemTitle(it)}</h3><p class="isub">消耗 1 颗刻印石，指定一条刻印${it.mark ? `（覆盖原来的「${MARKS[it.mark].name}」）` : ''} · 剩余 ${s.stones} 颗</p></div>
          <button class="close" data-act="close" aria-label="关闭">×</button></div>
        <div class="engrave-list">${list}</div>
        <div class="actions"><button class="btn ghost" data-act="engraveCancel">返回</button></div>
      </div>`;
      this.modal.hidden = false;
      return;
    }
    const comparison = equipped ? null : compareItem(s,it,{slot:this.compareSlot});
    const cur = comparison?.against;
    const allowed = canImprove(it);
    const mine = itemStats(hydrateItem({...it,enh:comparison?.enhAs ?? it.enh,affix:[]})), other = cur ? itemStats(hydrateItem({...cur,enh:comparison.enhAs,affix:[]})) : {};
    const keys = Object.keys(it.base);
    const statRows = keys.map((k) => {
      const d = mine[k] - (other[k] || 0);
      const diff = cur && Math.abs(d) > 1e-6 ? `<em class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${fmtStat(k, d)}</em>` : '';
      return `<li><span>${STAT_INFO[k][0]}</span><b>${fmtStat(k, mine[k])}</b>${diff}</li>`;
    }).join('');
    // 词条：每条后面有「重铸」，花金币把它换成另一种属性
    const rc = reforgeCost(it);
    const affix = it.affix.map((a, i) => `<li class="affix">${STAT_INFO[a.k][0]} +${fmtStat(a.k, a.v)}<button class="btn ghost mini-text reforge" data-act="reforge" data-i="${i}" ${s.gold >= rc ? '' : 'disabled'} title="把这条换成另一种属性 · ${rc} 金币">重铸</button></li>`).join('');
    // 传承：同部位正在穿的装备强化得更高 → 可以把强化等级转到这件上
    const inh = allowed && !equipped && cur && cur.enh > it.enh ? inheritCost(it, cur) : 0;
    const label = comparison && COMPARISON[comparison.verdict];
    const effectText = x => x ? `${x.affix.map(a=>`${STAT_INFO[a.k][0]} +${fmtStat(a.k,a.v)}`).join(' / ') || '无词条'}；刻印：${MARKS[x.mark]?.name || '无'}${x.mark ? '（条件型）' : ''}` : '—';
    const buffText = x => { const d=CATALOG[x?.def]; return d ? `状态：${d.imbue || '无'} ${x.imbueLv || 0} 档（条件型）；套装：${SERIES[d.set]?.name || d.set || '无'}` : '—'; };
    const explanation = comparison?.reasons.map(r=>r.id==='ilvl' ? `物品等级 ${r.delta>0?'+':''}${r.delta}` : r.id==='setCount' ? `${SERIES[r.set]?.name || r.set} ${r.from}→${r.to} 件` : r.id==='conditionalMark' ? `刻印「${MARKS[r.mark]?.name || r.mark}」（条件型）` : `${r.change==='before'?'换下':'换上'}状态「${r.status}」${r.lv} 档（条件型）`).join('；');
    const compare = equipped ? '<p class="cmp same">已穿戴</p>' : `
      ${it.slot==='trinket' ? ['trinket1','trinket2'].map(slot=>`<button class="btn ghost" data-act="compareSlot" data-slot="${slot}">对比${SLOT_NAME[slot]}</button>`).join('') : ''}
      <p>折算：都按 +${comparison.enhAs} · 对比${SLOT_NAME[comparison.slot]}</p>
      <table><tr><th></th><th>新：${it.name}</th><th>身上：${cur ? itemTitle(cur) : '空'}</th></tr>
      <tr><td>基础</td><td>${Object.keys(mine).map(k=>`${STAT_INFO[k][0]} ${fmtStat(k,mine[k])}`).join(' / ')}；物品等级 ${it.ilvl}</td><td>${Object.keys(other).map(k=>`${STAT_INFO[k][0]} ${fmtStat(k,other[k])}`).join(' / ')}；物品等级 ${cur?.ilvl || 0}</td></tr>
      <tr><td>效果</td><td>${effectText(it)}</td><td>${effectText(cur)}</td></tr>
      <tr><td>buff</td><td>${buffText(it)}</td><td>${buffText(cur)}</td></tr></table>
      <p class="cmp" style="color:${label.color}">${label.symbol} ${label.text}（${comparison.total.toFixed(1)}%） · 基础 ${comparison.parts.base.toFixed(1)}% · 效果 ${comparison.parts.effect.toFixed(1)}% · buff ${comparison.parts.buff.toFixed(1)}%</p><p class="hint">${explanation}</p>`;
    const cost = enhCost(it);
    const enhBtn = !allowed ? '<button class="btn" disabled title="翅膀 / 光幕固定攻击 +10，不能强化">不能强化：固定攻击 +10</button>' : it.enh >= MAX_ENH ? '<button class="btn" disabled>已强化到 +10</button>'
      : `<button class="btn" data-act="enhance" ${s.gold >= cost ? '' : 'disabled'}>强化 +${it.enh + 1} · 成功率 ${Math.round(enhRate(it) * 100)}% · ${cost} 金币</button>`;
    this.modal.innerHTML = `<div class="sheet" role="dialog" aria-label="${itemTitle(it)}">
      <div class="card-head">
        <span class="glyph big r${it.rar}">${gearGlyph(it)}</span>
        <div><h3 style="color:${R.color}">${itemTitle(it)}</h3><p class="isub">${R.name} · ${itemKind(it)} · 物品等级 ${it.ilvl}</p></div>
        <button class="close" data-act="close" aria-label="关闭">×</button>
      </div>
      <ul class="istats">${statRows}${affix}</ul>
      ${it.affix.length ? `<p class="hint reforge-hint">重铸一条词条：${rc} 金币${it.reforged ? `（已重铸 ${it.reforged} 次，每次贵 50%）` : '（每重铸一次贵 50%）'}</p>` : ''}
      ${it.slot === 'weapon' ? `<p class="school">流派「${WTYPES[it.wtype].school}」${WTYPES[it.wtype].schoolDesc}</p>` : ''}
      ${it.mark && MARKS[it.mark] ? `<p class="mark">刻印「${MARKS[it.mark].name}」${MARKS[it.mark].desc}<small>适合：${MARKS[it.mark].style}${!equipped && this.g.stats.marks.has(it.mark) ? ' · 身上已有同名刻印，不叠加' : ''}</small></p>` : ''}
      ${compare}
      ${!allowed ? '<p class="hint">翅膀 / 光幕固定攻击 +10，不能强化、重铸、传承。</p><button class="btn" disabled>不能重铸：固定属性</button><button class="btn" disabled>不能传承：固定属性</button>' : ''}
      <div class="actions">
        ${equipped ? `<button class="btn" data-act="unequip">卸下</button>` : it.slot === 'trinket' ? ['trinket1','trinket2'].map((slot) => `<button class="btn primary" data-act="equip" data-slot="${slot}">穿戴至${SLOT_NAME[slot]}</button>`).join('') : `<button class="btn primary" data-act="equip">穿戴</button>`}
        ${enhBtn}
        ${inh ? `<button class="btn" data-act="inherit" ${s.gold >= inh ? '' : 'disabled'} title="把「${itemTitle(cur)}」的强化等级转到这件上，旧装备变回 +0">传承 +${cur.enh} 强化 · ${inh} 金币</button>` : ''}
        ${canEngrave(it) ? `<button class="btn" data-act="engrave" ${s.stones > 0 ? '' : 'disabled'} title="完成委托获得刻印石">铭刻刻印 · 刻印石 ×1（剩 ${s.stones}）</button>` : ''}
        <button class="btn ghost" data-act="lock">${it.locked ? '🔒 已锁定（点击解锁）' : '锁定（批量出售时跳过）'}</button>
        ${equipped ? '' : `<button class="btn ghost" data-act="sell" ${it.locked ? 'disabled' : ''}>出售 · ${sellPrice(it)} 金币</button>`}
      </div>
      <p class="hint">强化失败只扣金币，装备不会损坏。每级强化让基础属性 +8%，+7 起武器会发出脉动的光。</p>
    </div>`;
    this.modal.hidden = false;
  }

  closeModal() {
    for (const tile of this.root.querySelectorAll('.is-selected')) tile.classList.remove('is-selected');
    this.sel = null;
    this.engrave = false;
    this.modal.hidden = true;
    this.modal.innerHTML = '';
  }

  // ---------------- 交互 ----------------
  onClick(e) {
    if (e.target === this.modal) return this.closeModal(); // 点弹窗外部关闭
    const el = e.target.closest('[data-act], [data-tab]');
    if (!el || el.disabled) return;
    const s = this.save;
    if (el.dataset.tab) {
      this.tab = el.dataset.tab;
      sfx('click');
      return this.render();
    }
    const act = el.dataset.act;
    const commit = () => { this.g.refreshStats(); this.g.store.save(); this.render(); };

    switch (act) {
      case 'settings':
        sfx('click');
        this.g.openSettings();
        return;
      case 'story':
        sfx('click');
        this.g.openStoryLog();
        return;
      case 'claim': {
        const r = claimContract(s, el.dataset.id);
        if (!r) return;
        sfx('chest');
        commit();
        this.toast(`获得 刻印石 ×${r.stones}、金币 ${r.gold}`, '#c99bff');
        return;
      }
      case 'reroll':
        if (rerollContract(s, el.dataset.id)) { sfx('click'); commit(); }
        return;
      case 'engrave':
        if (!canEngrave(this.findItem(this.sel)?.it)) return false;
        this.engrave = true;
        sfx('click');
        return this.renderModal();
      case 'engraveCancel':
        this.engrave = false;
        return this.renderModal();
      case 'go': {
        sfx('click');
        const i = +el.dataset.i, d = +(el.dataset.d || 0);
        this.g.launch(() => this.g.startStage(i, d, true)); // 从地图出征：播剧情
        return;
      }
      case 'trial':
        sfx('click');
        this.g.launch(() => this.g.startTrial());
        return;
      case 'train':
        sfx('click');
        this.g.launch(() => this.g.startTraining());
        return;
      case 'close-hub':
        sfx('click');
        this.g.closeMenu();
        return;
      case 'compareSlot':
        this.compareSlot = el.dataset.slot;
        this.renderModal();
        return;
      case 'sel':
        this.compareSlot = undefined;
        this.sel = el.dataset.id;
        this.engrave = false;
        sfx('click');
        return this.renderModal();
      case 'close':
        return this.closeModal();
      case 'music':
        music.start();
        music.toggleMute();
        return this.render();
      case 'stat':
        if (s.statPts > 0) { s.statPts--; s.stats[el.dataset.k]++; sfx('click'); commit(); }
        return;
      case 'resetStats':
        resetStats(s); commit(); this.toast('属性点已全部返还');
        return;
      case 'skill': {
        const n = SKILL_TREE.find((x) => x.key === el.dataset.k);
        if (s.sp > 0 && s.skills[n.key] < skillCap(s, n)) { s.sp--; s.skills[n.key]++; sfx('click'); commit(); }
        return;
      }
      case 'resetSkills':
        resetSkills(s); commit(); this.toast('技能点已全部返还');
        return;
      case 'sort':
        s.bag.sort((a, b) => SLOT_KEYS.indexOf(a.slot==='trinket'?'trinket1':a.slot) - SLOT_KEYS.indexOf(b.slot==='trinket'?'trinket1':b.slot) || compareItem(s,b).total - compareItem(s,a).total);
        commit();
        return;
      case 'sellJunk': {
        // 批量出售：只卖这个品质及以下、没锁定、没强化、没刻印的
        const maxR = +(el.dataset.r || 0);
        const junk = s.bag.filter((it) => it.rar <= maxR && it.enh === 0 && !it.locked && !it.mark);
        if (!junk.length) return this.toast(maxR ? '没有可以出售的精良及以下装备' : '没有可以出售的普通装备');
        const gold = junk.reduce((a, it) => a + sellPrice(it), 0);
        s.bag = s.bag.filter((it) => !junk.includes(it));
        s.gold += gold;
        sfx('coin');
        commit();
        this.toast(`出售 ${junk.length} 件，获得 ${gold} 金币`, '#ffd65a');
        return;
      }
    }

    // 以下操作针对弹窗里的装备
    const f = this.findItem(this.sel);
    if (!f) return;
    const { it, equipped } = f;
    if (act === 'equip') {
      const target = it.slot === 'trinket' ? el.dataset.slot : it.slot;
      if (!SLOT_KEYS.includes(target) || (it.slot === 'trinket' && !['trinket1','trinket2'].includes(target))) return;
      const old = s.equip[target];
      s.bag = s.bag.filter((x) => x !== it);
      if (old) s.bag.push(old);
      s.equip[target] = it;
      sfx('pickup');
      this.closeModal();
      commit();
      this.toast(`已穿戴 ${itemTitle(it)}`, RARITY[it.rar].color);
    } else if (act === 'unequip') {
      if (s.bag.length >= BAG_MAX) return this.toast('背包已满');
      s.equip[f.slot] = null;
      s.bag.push(it);
      this.closeModal();
      commit();
    } else if (act === 'engraveMark') {
      if (!canEngrave(it)) return false;
      const k = el.dataset.k;
      if (!MARKS[k] || s.stones < 1 || it.mark === k) return;
      s.stones--;
      it.mark = k;
      this.engrave = false;
      sfx('enhance');
      commit();
      this.toast(`${itemTitle(it)} 铭刻了「${MARKS[k].name}」`, '#c99bff');
    } else if (act === 'reforge') {
      const cost = reforgeCost(it);
      if (s.gold < cost) return;
      const i = +el.dataset.i, before = it.affix[i];
      if (!reforgeAffix(it, i)) return;
      s.gold -= cost;
      sfx('enhance');
      commit();
      const a = it.affix[i];
      this.toast(`${STAT_INFO[before.k][0]} → ${STAT_INFO[a.k][0]} +${fmtStat(a.k, a.v)}`, '#7ff3ff');
    } else if (act === 'inherit' && !equipped) {
      const cur = compareItem(s,it,{slot:this.compareSlot}).against;
      if (!canImprove(it) || !canImprove(cur) || !cur || cur.enh <= it.enh) return;
      const cost = inheritCost(it, cur);
      if (s.gold < cost) return;
      s.gold -= cost;
      it.enh = cur.enh;
      cur.enh = 0;
      sfx('enhance');
      commit();
      this.toast(`${itemTitle(it)} 传承了强化等级`, '#ffd65a');
    } else if (act === 'lock') {
      it.locked = !it.locked;
      sfx('click');
      commit();
    } else if (act === 'sell' && !equipped && !it.locked) {
      const gold = sellPrice(it);
      s.bag = s.bag.filter((x) => x !== it);
      s.gold += gold;
      sfx('coin');
      this.closeModal();
      commit();
      this.toast(`获得 ${gold} 金币`, '#ffd65a');
    } else if (act === 'enhance') {
      if (!canImprove(it)) return;
      const cost = enhCost(it);
      if (s.gold < cost || it.enh >= MAX_ENH) return;
      s.gold -= cost;
      if (Math.random() < enhRate(it)) {
        it.enh++;
        sfx('enhance');
        this.toast(`强化成功！+${it.enh}`, '#ffd65a');
      } else {
        sfx('enhFail');
        this.toast('强化失败，装备完好无损', '#9fb3c8');
      }
      commit();
    }
  }

  // ---------------- 角色预览（每帧调用）----------------
  drawPreview(t) {
    const c = this.preview;
    if (!c || !c.isConnected) return;
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    const equip = this.save.equip;
    const defs = Object.values(equip).filter(Boolean).map(it => ({it, def: CATALOG[it.def]}));
    const palette = {chill:'#75dfff', burn:'#ff8148', shock:'#b795ff', poison:'#a3e66e', bleed:'#f45b83', shield:'#ffe7a0'};
    const weapon = CATALOG[equip.weapon?.def];
    const imbues = defs.filter(({it, def}) => it.imbueLv > 0 && def?.imbue).map(({def}) => def.imbue);
    const primary = SERIES[weapon?.series]?.element || imbues[0];
    const colors = [...new Set([primary, SERIES[CATALOG[equip.wings?.def]?.series]?.element, ...imbues].filter(Boolean))]
      .map(key => palette[key]).filter(Boolean);
    if (!colors.length) colors.push('#7ff3ff');
    const rgba = (hex, alpha) => `rgba(${[1,3,5].map(i => parseInt(hex.slice(i,i+2),16)).join(',')},${alpha})`;
    // Cache only tinted copies of existing textures; never generate substitute FX shapes.
    const texture = (id, color) => {
      const source = FX_ART.light.ready && FX_ART.light.items[id];
      if (!source?.width) return null;
      this.previewFx ||= new Map();
      const key = `${id}/${color}`, cached = this.previewFx.get(key);
      if (cached?.source === source) return cached.canvas;
      const canvas = document.createElement('canvas');
      canvas.width = source.width; canvas.height = source.height;
      const paint = canvas.getContext('2d');
      paint.drawImage(source, 0, 0);
      paint.globalCompositeOperation = 'source-in';
      paint.fillStyle = color; paint.fillRect(0, 0, canvas.width, canvas.height);
      this.previewFx.set(key, {source, canvas});
      return canvas;
    };
    const fx = (id, color, x, y, w, h, alpha) => {
      const image = texture(id, color);
      if (!image) return;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha;
      ctx.drawImage(image, x-w/2, y-h/2, w, h); ctx.restore();
    };
    const breath = 0.875 + Math.sin(t * 0.018) * 0.125;
    const g = ctx.createRadialGradient(220, 330, 10, 220, 330, 220);
    g.addColorStop(0, rgba(colors[0], 0.16));
    g.addColorStop(1, rgba(colors[0], 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    colors.forEach(color => fx('glow_soft', color, 220, 235, equip.wings ? 420 : 290,
      equip.wings ? 430 : 350, breath * (equip.wings ? 0.65 : 0.42) / Math.sqrt(colors.length)));
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath();
    ctx.ellipse(220, 410, 80, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    if (heroSprite.ready && heroSprite.full) {
      const H = 440, W = H * (heroSprite.full.width / heroSprite.full.height);
      ctx.drawImage(heroSprite.full, 220 - W / 2, 6 + Math.sin(t * 0.03) * 3, W, H);
    } else {
      const look = this.g.playerLook();
      const pose = { crouch: 0.08 + Math.sin(t * 0.06) * 0.05, angle: 0.65 + Math.sin(t * 0.04) * 0.05, walk: 0, lean: 1, backAngle: 1.5 };
      ctx.save();
      ctx.translate(168, 405);
      ctx.scale(3.1, 3.1);
      drawFighter(ctx, 0, 0, look, pose, { facing: 1, t });
      ctx.restore();
    }
    if (equip.veil) fx('light_magic', colors[0], 220 + Math.sin(t * 0.012) * 5,
      245 + Math.cos(t * 0.015) * 4, 340, 400, 0.15 * breath);
  }
}
