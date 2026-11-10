// 装备 FIX-3 验收（docs/CODEX_TICKETS_GEAR_FIX3.md）：等值词条、稀有度不膨胀、相邻档单调、传说构成、掉落份额。
// 先行写好，Codex 实现时不改这个文件。
const { chromium } = require('playwright');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const PORT = process.env.PORT || 8765;
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };

async function exercise() {
  const items = await import('./src/items.js');
  const rules = await import('./src/gear/rules.js');
  const { CATALOG, LEGENDS, defsBy } = await import('./src/gear/catalog.js');
  const { compareItem } = await import('./src/gear/compare.js');
  const { computeStats, power, newSave } = await import('./src/progression.js');
  const out = {};
  const random = Math.random;
  let seed = 20261110;
  Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const check = (key, fn) => { try { out[key] = fn(); } catch (e) { out[key] = { ok: false, error: e.message }; } };
  const STAT_SLOTS = ['weapon', 'helm', 'chest', 'legs', 'boots', 'bracers', 'trinket1', 'trinket2'];
  const slotOf = (k) => (k.startsWith('trinket') ? 'trinket' : k);
  const pickDef = (slot, rar) => defsBy({ slot, rar }).filter((d) => !d.variantOf && (slot !== 'weapon' || d.kind === 'sword'))[0];
  const emptySave = (lv) => { const s = newSave(); s.lv = lv; s.equip = Object.fromEntries(items.SLOT_KEYS.map((k) => [k, null])); return s; };
  try {
    check('rarity', () => {
      const R = rules.RARITY;
      const affixes = R.map((r) => r.affixes), quality = R.map((r) => r.quality);
      const okCounts = JSON.stringify(affixes) === JSON.stringify([0, 1, 2, 3, 4]);
      const rising = quality.slice(1).every((q, i, a) => i === 0 || q > a[i - 1]);
      return { ok: okCounts && rising && Math.max(...quality) <= 1.2, affixes, quality };
    });
    check('equalValue', () => {
      // 每种属性的一条词条，加在同一件武器上，战力增量应当接近（±15%）
      const rows = [];
      for (const L of [5, 15, 25]) {
        const s = emptySave(L);
        for (const k of STAT_SLOTS) { const d = pickDef(slotOf(k), 1); s.equip[k] = items.makeItem(d.id, L); s.equip[k].affix = []; s.equip[k].mark = null; }
        const start = power(computeStats(s)), deltas = {};
        for (const k of Object.keys(items.AFFIX)) {
          const w = { ...s.equip.weapon, affix: [{ k, v: items.affixRoll(k, L, 'weapon', 3, 0.9) }] };
          deltas[k] = power(computeStats({ ...s, equip: { ...s.equip, weapon: items.hydrateItem(w) } })) - start;
        }
        const vals = Object.values(deltas).sort((a, b) => a - b), med = vals[Math.floor(vals.length / 2)];
        const spread = Object.fromEntries(Object.entries(deltas).map(([k, v]) => [k, +(v / med).toFixed(2)]));
        rows.push({ L, ok: med > 0 && Object.values(spread).every((x) => x >= 0.85 && x <= 1.15), spread });
      }
      return { ok: rows.every((r) => r.ok), rows };
    });
    check('minValue', () => {
      const lows = Object.keys(items.AFFIX).map((k) => [k, items.affixRoll(k, 1, 'boots', 1, 0.8)]);
      const okMin = lows.every(([k, v]) => (items.STAT_INFO[k][1] ? v >= 0.001 : v >= 1 && Number.isInteger(v)));
      return { ok: okMin, lows };
    });
    check('monotone', () => {
      // 同物品等级、同强化（+0）：低档赢高档的比例。相邻档 ≤ 2%，隔一档 0%
      const pairs = [[1, 2], [2, 3], [3, 4], [1, 3], [2, 4]], N = 2000, res = {};
      const slots = ['weapon', 'helm', 'chest', 'legs', 'boots', 'bracers', 'trinket'];
      for (const [lo, hi] of pairs) {
        let wins = 0, n = 0;
        for (let i = 0; i < N; i++) {
          const slot = slots[i % slots.length], L = [1, 10, 20, 30][i % 4];
          const dl = pickDef(slot, lo), dh = pickDef(slot, hi);
          if (!dl || !dh) continue;
          const s = emptySave(L), key = slot === 'trinket' ? 'trinket1' : slot;
          s.equip[key] = items.makeItem(dh.id, L);
          const v = compareItem(s, items.makeItem(dl.id, L), { slot: key }).verdict;
          if (v === 'better' || v === 'much') wins++;
          n++;
        }
        res[`${lo}>${hi}`] = +(wins / n * 100).toFixed(2);
      }
      const adjacent = ['1>2', '2>3', '3>4'].every((k) => res[k] <= 2), skip = ['1>3', '2>4'].every((k) => res[k] === 0);
      return { ok: adjacent && skip, res };
    });
    check('inflation', () => {
      // 满身传说（没有传说定义的部位用史诗）对满身精良，同物品等级 +0：1.15 倍 ～ 1.45 倍
      const rows = [];
      for (const L of [10, 20, 30]) {
        let sum = [0, 0];
        for (let i = 0; i < 40; i++) {
          for (const [j, rar] of [[0, 1], [1, 4]]) {
            const s = emptySave(L);
            for (const k of STAT_SLOTS) { const d = pickDef(slotOf(k), rar) || pickDef(slotOf(k), 3); s.equip[k] = items.makeItem(d.id, L); }
            sum[j] += power(computeStats(s));
          }
        }
        rows.push({ L, ratio: +(sum[1] / sum[0]).toFixed(3) });
      }
      return { ok: rows.every((r) => r.ratio >= 1.15 && r.ratio <= 1.45), rows };
    });
    check('legends', () => {
      const indep = LEGENDS.filter((d) => !d.drop?.boss), boss = LEGENDS.filter((d) => d.drop?.boss);
      const wings = indep.filter((d) => d.slot === 'wings').length, veil = indep.filter((d) => d.slot === 'veil').length;
      const OLD = { 断月: 'weapon', 霜烬: 'weapon', 无归: 'weapon', 烛龙之牙: 'weapon', 不眠者之冠: 'helm', 烬灭头冠: 'helm', 残光战衣: 'chest', 渊海鳞甲: 'chest', 时之环: 'trinket', 永夜之誓: 'trinket' };
      const kept = Object.entries(OLD).every(([name, slot]) => indep.some((d) => d.name === name && d.slot === slot));
      const fixedAtk = LEGENDS.filter((d) => d.slot === 'wings' || d.slot === 'veil').every((d) => d.fixed?.atk === 10);
      const total = Object.values(CATALOG).filter((d) => !d.variantOf).length;
      return { ok: LEGENDS.length === 40 && indep.length === 20 && boss.length === 20 && wings === 6 && veil === 4 && kept && fixedAtk && total === 348,
        legends: LEGENDS.length, indep: indep.length, boss: boss.length, wings, veil, kept, fixedAtk, total };
    });
    check('dropShare', () => {
      const W = rules.DROP_RULES.slotWeights;
      const want = { weapon: 18, chest: 12, helm: 10, legs: 10, boots: 10, bracers: 10, trinket: 16, wings: 7, veil: 7 };
      const table = Object.entries(want).every(([k, v]) => Math.abs((W?.[k] ?? -1) * 100 - v) < 1e-6);
      const sample = (save, stage) => {
        const n = {}, N = 20000;
        for (let i = 0; i < N; i++) { const it = items.randomDrop(10, { save, source: 'normal', stage }); const sl = CATALOG[it.def].slot; n[sl] = (n[sl] || 0) + 1; }
        return Object.fromEntries(Object.entries(n).map(([k, v]) => [k, +(v / N * 100).toFixed(2)]));
      };
      const open = newSave(); open.gearCosmeticsUnlocked = true; open.cleared = { s1: true, s2: true };
      const after = sample(open, 3);
      const before = sample(newSave(), 1);
      const nearAfter = Object.entries(want).every(([k, v]) => Math.abs((after[k] || 0) - v) <= 1.5);
      const rest = 100 - want.wings - want.veil;
      const nearBefore = !before.wings && !before.veil && Object.entries(want).filter(([k]) => k !== 'wings' && k !== 'veil')
        .every(([k, v]) => Math.abs((before[k] || 0) - v / rest * 100) <= 1.5);
      return { ok: table && nearAfter && nearBefore, table, after, before };
    });
  } finally { Math.random = random; }
  return out;
}

(async () => {
  // AFFIX_VALUE 必须是工具生成的：工具 --check 模式比对表，不一致退出码非 0
  const tool = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'affixvalue.js'), '--check'], { encoding: 'utf8' });
  ok(tool.status === 0, 'tools/affixvalue.js --check：AFFIX_VALUE 与工具输出逐项一致' + (tool.status === 0 ? '' : '（' + (tool.stderr || tool.stdout || '').trim().split('\n').pop() + '）'));
  const errs = []; let browser, r = {}, setupError;
  try {
    browser = await chromium.launch();
    const p = await browser.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    const res = await p.goto('http://localhost:' + PORT + '/index.html');
    if (!res?.ok()) throw new Error('index.html HTTP ' + (res?.status() ?? 'unknown'));
    await p.waitForFunction(() => !!globalThis.__game);
    r = await p.evaluate(exercise);
  } catch (e) { setupError = e.message.split('\n')[0]; } finally { await browser?.close(); }
  console.log(JSON.stringify(r));
  const checks = [
    ['rarity', '稀有度表：词条 0/1/2/3/4，质量系数递增且不超过 1.2'],
    ['equalValue', '等值词条：同一条词条抽到任何属性，战力增量都在中位数 ±15% 内（5 / 15 / 25 级）'],
    ['minValue', '低等级取整：整数属性至少 1，百分比属性至少 0.001'],
    ['monotone', '同等级同强化：低一档赢高一档 ≤ 2%，低两档 0%'],
    ['inflation', '满身传说 / 满身精良的战力比在 1.15～1.45（不膨胀）'],
    ['legends', '传说 40 件：首领套装 20 + 独立 20（旧 10 件原槽位 + 6 翅膀 + 4 光幕），目录 348 件'],
    ['dropShare', '部位份额按裁定表；翅膀 / 光幕解锁前不掉，其余按比例放大'],
  ];
  for (const [key, label] of checks) ok(r[key]?.ok, label + (r[key]?.error ? ' ' + r[key].error : setupError ? ' 未执行（' + setupError + '）' : ''));
  ok(!setupError && !errs.length, 'PAGE ERRORS ' + (errs.join(' | ') || (setupError ? '未执行' : 'none')));
  console.log(bad ? 'GEARFIX3TEST FAIL ' + bad : 'GEARFIX3TEST ok');
  if (bad) process.exitCode = 1;
})();
