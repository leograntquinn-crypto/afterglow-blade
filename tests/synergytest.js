// 搭配效果验收（docs/CODEX_TICKETS_STATUS.md 第 S-3 单；规则见 docs/DESIGN_EQUIPMENT.md 第十节）。先行写好，Codex 实现时不改这个文件。
// 约定的接口（src/gear/synergy.js）：
//   SYNERGY                         手写表（C 系列搭配、D 流派搭配）
//   buildSynergies(REACTIONS)       由反应表自动生成 A 反应协同、B 元素共鸣（返回数组，结果并进 SYNERGY_ALL）
//   SYNERGY_ALL                     A + B + C + D 全表
//   evaluateLoadout(save)           → { active: [{ id, level }], warnings: [id], nearly: [id] }
// computeStats(save).synergies 是 active 的 id 数组。
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765;
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };

async function exercise() {
  const items = await import('./src/items.js');
  const { CATALOG, defsBy } = await import('./src/gear/catalog.js');
  const SY = await import('./src/gear/synergy.js');
  const { REACTIONS } = await import('./src/status.js');
  const { computeStats, newSave } = await import('./src/progression.js');
  const out = {};
  const check = (key, fn) => { try { out[key] = fn(); } catch (e) { out[key] = { ok: false, error: e.message }; } };
  // 某系列某部位的一件稀有（带状态词条）
  const piece = (slot, series, kind) => {
    const d = defsBy({ slot, series, rar: 2 }).find((x) => !x.variantOf && (!kind || x.kind === kind));
    if (!d) throw new Error(`没有 ${series} ${slot}`);
    const it = items.makeItem(d.id, 10); it.imbueLv = 2; return it;
  };
  const save = (equip) => { const s = newSave(); s.lv = 10; s.equip = Object.fromEntries(items.SLOT_KEYS.map((k) => [k, null])); Object.assign(s.equip, equip); return s; };
  const ids = (r) => r.active.map((a) => a.id);
  // 自动生成的条目带 reaction / status 字段，按它找 id（id 的具体拼写由实现定）
  const ALL = SY.SYNERGY_ALL;
  const byReaction = (rid) => ALL.find((x) => x.kind === 'reaction' && x.reaction === rid)?.id;
  const byResonance = (sid) => ALL.find((x) => x.kind === 'resonance' && x.status === sid)?.id;
  check('generated', () => {
    // A 类：每个「两边都是可施加状态」的反应各一条；B 类：每种可积累 / 叠层的元素状态一条共鸣
    const gen = SY.buildSynergies(REACTIONS);
    const reactA = Object.values(REACTIONS).filter((r) => r && r.a && r.b).length;
    const A = gen.filter((x) => x.kind === 'reaction').length, B = gen.filter((x) => x.kind === 'resonance').length;
    const allData = SY.SYNERGY_ALL.every((x) => x.id && x.name && Array.isArray(x.when) && x.effect && x.text);
    return { ok: A === reactA && B >= 3 && allData, A, reactA, B };
  });
  check('frostfire', () => {
    // 冰系武器 + 火系饰品：反应协同 2 级（武器 + 非武器）
    const r = SY.evaluateLoadout(save({ weapon: piece('weapon', 'frost', 'sword'), trinket1: piece('trinket', 'ember') }));
    const melt = byReaction('melt'), a = r.active.find((x) => x.id === melt);
    // 两件都不在武器上：只有 1 级
    const r1 = SY.evaluateLoadout(save({ helm: piece('helm', 'frost'), trinket1: piece('trinket', 'ember') }));
    const b = r1.active.find((x) => x.id === melt);
    return { ok: a?.level === 2 && b?.level === 1, a, b };
  });
  check('resonance', () => {
    const two = SY.evaluateLoadout(save({ helm: piece('helm', 'frost'), legs: piece('legs', 'frost') }));
    const three = SY.evaluateLoadout(save({ helm: piece('helm', 'frost'), legs: piece('legs', 'frost'), boots: piece('boots', 'frost') }));
    const id = byResonance('chill');
    return { ok: !!id && !ids(two).includes(id) && ids(three).includes(id), id, two: ids(two), three: ids(three) };
  });
  check('wingsNotSource', () => {
    // 翅膀 / 光幕不带状态，不算搭配来源（第一节第 3 条）
    const wings = Object.values(CATALOG).find((d) => d.slot === 'wings' && d.series === 'frost');
    const w = items.makeItem(wings.id, 10);
    const r = SY.evaluateLoadout(save({ helm: piece('helm', 'frost'), legs: piece('legs', 'frost'), wings: w }));
    return { ok: !ids(r).includes(byResonance('chill')), active: ids(r) };
  });
  check('cap', () => {
    const r = SY.evaluateLoadout(save({
      weapon: piece('weapon', 'frost', 'katana'), helm: piece('helm', 'ember'), chest: piece('chest', 'storm'), legs: piece('legs', 'blight'),
      boots: piece('boots', 'thorn'), bracers: piece('bracers', 'dawn'), trinket1: piece('trinket', 'ember'), trinket2: piece('trinket', 'blight'),
    }));
    return { ok: r.active.length <= 6 && r.active.length >= 4, n: r.active.length, active: ids(r) };
  });
  check('warnings', () => {
    // 灼烧 + 流血来源同在：灼口提示（不禁止）
    const r = SY.evaluateLoadout(save({ weapon: piece('weapon', 'thorn', 'sword'), trinket1: piece('trinket', 'ember') }));
    return { ok: r.warnings.includes('cauterize'), warnings: r.warnings }; // 注意：warnings 里放的是反应 id
  });
  check('nearly', () => {
    // 只差一件就能激活的搭配：有寒意来源 1 件 → 「冰雷交织」差一件感电来源
    const r = SY.evaluateLoadout(save({ weapon: piece('weapon', 'frost', 'sword') }));
    const id = byReaction('shatter');
    return { ok: !!id && r.nearly.includes(id), id, nearly: r.nearly };
  });
  check('stats', () => {
    const s = save({ weapon: piece('weapon', 'frost', 'sword'), trinket1: piece('trinket', 'ember') });
    return { ok: computeStats(s).synergies.includes(byReaction('melt')), synergies: computeStats(s).synergies };
  });
  return out;
}

(async () => {
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
    ['generated', 'A 反应协同由反应表自动生成（每个反应一条），B 元素共鸣至少三条；全表字段齐全'],
    ['frostfire', '冰系武器 + 火系饰品 = 冰火交织 2 级；两件都不在武器上 = 1 级'],
    ['resonance', '同一状态来源 3 件才共鸣，2 件不共鸣'],
    ['wingsNotSource', '翅膀 / 光幕不算搭配来源'],
    ['cap', '同时生效的搭配最多 6 条'],
    ['warnings', '会互相抵消的来源同在时给「注意」（灼口），不禁止'],
    ['nearly', '「差一点」列出再穿一件就能激活的搭配'],
    ['stats', 'computeStats(save).synergies 带出生效的搭配 id'],
  ];
  for (const [key, label] of checks) ok(r[key]?.ok, label + (r[key]?.error ? ' ' + r[key].error : setupError ? ' 未执行（' + setupError + '）' : ''));
  ok(!setupError && !errs.length, 'PAGE ERRORS ' + (errs.join(' | ') || (setupError ? '未执行' : 'none')));
  console.log(bad ? 'SYNERGYTEST FAIL ' + bad : 'SYNERGYTEST ok');
  if (bad) process.exitCode = 1;
})();
