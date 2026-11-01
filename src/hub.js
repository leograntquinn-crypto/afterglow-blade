// 营地界面（HTML）：出征 / 角色与装备 / 技能
// 菜单类界面用 HTML 比在 Canvas 里画方便得多：自带滚动、点击、文字排版、适配手机。
// 所有按钮用 data-act 属性标记，统一在 onClick 里处理（事件委托）。

import {
  RARITY, SLOT_KEYS, SLOT_NAME, STAT_INFO, MAX_ENH, fmtStat, itemStats, itemScore, itemGlyph, itemTitle, itemKind,
  enhCost, enhRate, sellPrice,
} from './items.js';
import { ATTRS, SKILL_TREE, BAG_MAX, xpToNext, skillCap, power, resetStats, resetSkills, MAX_LV } from './progression.js';
import { STAGES, isUnlocked } from './stages.js';
import { TYPES } from './enemy.js';
import { SKILLS } from './moves.js';
import { BOSSES } from './boss.js';
import { drawFighter } from './rig.js';
import { sfx } from './audio.js';
import { music } from './music.js';

export class Hub {
  constructor(game, root) {
    this.g = game;
    this.root = root;
    this.tab = 'stages';
    this.sel = null; // 选中的装备 id
    this.body = root.querySelector('#hub-body');
    this.modal = root.querySelector('#hub-modal');
    this.toastEl = root.querySelector('#hub-toast');
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
    const s = this.save, S = this.g.stats;
    const need = xpToNext(s.lv);
    this.root.querySelector('#h-lv').textContent = s.lv;
    this.root.querySelector('#h-xp').style.width = `${s.lv >= MAX_LV ? 100 : (s.xp / need) * 100}%`;
    this.root.querySelector('#h-xptext').textContent = s.lv >= MAX_LV ? '满级' : `${s.xp} / ${need}`;
    this.root.querySelector('#h-power').textContent = power(S).toLocaleString();
    this.root.querySelector('#h-gold').textContent = s.gold.toLocaleString();
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

  render_stages() {
    const s = this.save;
    return `<div class="stages">${STAGES.map((st, i) => {
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
          ${open ? `<button class="btn primary" data-act="go" data-i="${i}">出征</button>` : `<span class="lock">通关「${STAGES[i - 1].name}」解锁</span>`}
        </div>
      </article>`;
    }).join('')}</div>`;
  }

  render_hero() {
    const s = this.save, S = this.g.stats;
    const slots = SLOT_KEYS.map((k) => {
      const it = s.equip[k];
      return `<button class="slot ${it ? `r${it.rar}` : 'empty'}" data-act="sel" data-id="${it ? it.id : ''}" data-slot="${k}" ${it ? '' : 'disabled'}>
        <span class="glyph">${it ? itemGlyph(it) : ''}</span>
        <span class="slot-label">${it ? itemTitle(it) : `${SLOT_NAME[k]}（空）`}</span>
      </button>`;
    }).join('');
    const rows = [
      ['攻击力', Math.round(S.atk)], ['生命', S.maxHp], ['魔力', S.maxMp], ['防御', Math.round(S.def)],
      ['暴击率', `${(S.crit * 100).toFixed(1)}%`], ['暴击伤害', `${Math.round(S.critDmg * 100)}%`], ['冷却缩减', `${(S.cdr * 100).toFixed(1)}%`],
    ].map(([a, b]) => `<div class="kv"><span>${a}</span><b>${b}</b></div>`).join('');
    const attrs = ATTRS.map((a) => `<div class="attr">
        <div><span class="aname">${a.name}</span> <b>${S[a.key]}</b><small>${a.hint}</small></div>
        <button class="btn mini" data-act="stat" data-k="${a.key}" ${s.statPts > 0 ? '' : 'disabled'} aria-label="${a.name}加一点">+</button>
      </div>`).join('');
    const bag = s.bag.map((it) => {
      const better = itemScore(it) > itemScore(s.equip[it.slot]);
      return `<button class="cell r${it.rar}" data-act="sel" data-id="${it.id}" title="${itemTitle(it)}">
        <span class="glyph">${itemGlyph(it)}</span>${it.enh ? `<i class="enh">+${it.enh}</i>` : ''}${better ? '<i class="up">▲</i>' : ''}
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
        <div class="attr-head"><h4>属性点</h4><span class="pts">${s.statPts > 0 ? `可分配 <b>${s.statPts}</b>` : '升级获得 3 点'}</span></div>
        ${attrs}
        <button class="btn ghost" data-act="resetStats">重置属性点（免费）</button>
      </section>
      <section class="panel">
        <div class="attr-head"><h4>背包 <small>${s.bag.length} / ${BAG_MAX}</small></h4>
          <span class="bag-tools"><button class="btn ghost mini-text" data-act="sort">整理</button><button class="btn ghost mini-text" data-act="sellJunk">出售全部普通</button></span>
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

  // ---------------- 装备详情弹窗 ----------------
  findItem(id) {
    const s = this.save;
    for (const k of SLOT_KEYS) if (s.equip[k]?.id === id) return { it: s.equip[k], equipped: true };
    const it = s.bag.find((x) => x.id === id);
    return it ? { it, equipped: false } : null;
  }

  renderModal() {
    const f = this.findItem(this.sel);
    if (!f) return this.closeModal();
    const { it, equipped } = f;
    const s = this.save, R = RARITY[it.rar];
    const cur = equipped ? null : s.equip[it.slot];
    const mine = itemStats(it), other = cur ? itemStats(cur) : {};
    const keys = Object.keys(it.base);
    const statRows = keys.map((k) => {
      const d = mine[k] - (other[k] || 0);
      const diff = cur && Math.abs(d) > 1e-6 ? `<em class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${fmtStat(k, d)}</em>` : '';
      return `<li><span>${STAT_INFO[k][0]}</span><b>${fmtStat(k, mine[k])}</b>${diff}</li>`;
    }).join('');
    const affix = it.affix.map((a) => `<li class="affix">${STAT_INFO[a.k][0]} +${fmtStat(a.k, a.v)}</li>`).join('');
    const dScore = itemScore(it) - itemScore(cur);
    const compare = equipped ? '<p class="cmp same">已穿戴</p>'
      : cur ? `<p class="cmp ${dScore >= 0 ? 'up' : 'down'}">对比当前「${itemTitle(cur)}」：评分 ${dScore >= 0 ? '▲' : '▼'} ${Math.abs(dScore)}</p>`
      : '<p class="cmp up">该部位还没有装备</p>';
    const cost = enhCost(it);
    const enhBtn = it.enh >= MAX_ENH ? '<button class="btn" disabled>已强化到 +10</button>'
      : `<button class="btn" data-act="enhance" ${s.gold >= cost ? '' : 'disabled'}>强化 +${it.enh + 1} · 成功率 ${Math.round(enhRate(it) * 100)}% · ${cost} 金币</button>`;
    this.modal.innerHTML = `<div class="sheet" role="dialog" aria-label="${itemTitle(it)}">
      <div class="card-head">
        <span class="glyph big r${it.rar}">${itemGlyph(it)}</span>
        <div><h3 style="color:${R.color}">${itemTitle(it)}</h3><p class="isub">${R.name} · ${itemKind(it)} · 物品等级 ${it.ilvl}</p></div>
        <button class="close" data-act="close" aria-label="关闭">×</button>
      </div>
      <ul class="istats">${statRows}${affix}</ul>
      ${compare}
      <div class="actions">
        ${equipped ? `<button class="btn" data-act="unequip">卸下</button>` : `<button class="btn primary" data-act="equip">穿戴</button>`}
        ${enhBtn}
        ${equipped ? '' : `<button class="btn ghost" data-act="sell">出售 · ${sellPrice(it)} 金币</button>`}
      </div>
      <p class="hint">强化失败只扣金币，装备不会损坏。每级强化让基础属性 +8%，+7 起武器会发出脉动的光。</p>
    </div>`;
    this.modal.hidden = false;
  }

  closeModal() {
    this.sel = null;
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
      case 'go':
        sfx('click');
        this.g.startStage(+el.dataset.i);
        return;
      case 'sel':
        this.sel = el.dataset.id;
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
        s.bag.sort((a, b) => SLOT_KEYS.indexOf(a.slot) - SLOT_KEYS.indexOf(b.slot) || b.rar - a.rar || itemScore(b) - itemScore(a));
        commit();
        return;
      case 'sellJunk': {
        const junk = s.bag.filter((it) => it.rar === 0 && it.enh === 0);
        if (!junk.length) return this.toast('没有可以出售的普通装备');
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
      const old = s.equip[it.slot];
      s.bag = s.bag.filter((x) => x !== it);
      if (old) s.bag.push(old);
      s.equip[it.slot] = it;
      sfx('pickup');
      this.closeModal();
      commit();
      this.toast(`已穿戴 ${itemTitle(it)}`, RARITY[it.rar].color);
    } else if (act === 'unequip') {
      if (s.bag.length >= BAG_MAX) return this.toast('背包已满');
      s.equip[it.slot] = null;
      s.bag.push(it);
      this.closeModal();
      commit();
    } else if (act === 'sell' && !equipped) {
      const gold = sellPrice(it);
      s.bag = s.bag.filter((x) => x !== it);
      s.gold += gold;
      sfx('coin');
      this.closeModal();
      commit();
      this.toast(`获得 ${gold} 金币`, '#ffd65a');
    } else if (act === 'enhance') {
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
    const g = ctx.createRadialGradient(220, 330, 10, 220, 330, 220);
    g.addColorStop(0, 'rgba(127,243,255,0.16)');
    g.addColorStop(1, 'rgba(127,243,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath();
    ctx.ellipse(220, 410, 80, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    const look = this.g.playerLook();
    const pose = { crouch: 0.08 + Math.sin(t * 0.06) * 0.05, angle: 0.65 + Math.sin(t * 0.04) * 0.05, walk: 0, lean: 1, backAngle: 1.5 };
    ctx.translate(168, 405);
    ctx.scale(3.1, 3.1);
    drawFighter(ctx, 0, 0, look, pose, { facing: 1, t });
  }
}
