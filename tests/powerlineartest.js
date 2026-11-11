// power() 线性尺度守卫（FIX-3a 第 4 项，Claude 写，Codex 不改这个文件）。
//
// 膨胀门、单调门、首领动态难度（r = 战力 / REF_POWER）量的都是 power() 的比值。
// 在 power() 外套任何单调变换（sqrt、幂、对数、加常数），排序不变，但比值全被改写：
// FIX-3 的 100×sqrt 把 ~2.0 的膨胀比压成 ~1.4，把首领满强化从 2 倍原始强度挪到约 4 倍。
// 所以这里不看具体数值，只验证 power() 的「形状」：
//   G1 零点：所有属性回到「无加成」时战力 = 0（堵加常数、仿射变换）
//   G2 齐次：属性偏离零点的部分乘 t，战力也乘 t（「原始强度翻倍，r 翻倍」，堵 sqrt / 幂 / 对数）
//   G3 逐通道等差：任一属性连加两次同样增量，第二次涨幅等于第一次（堵只对某一项做非线性处理）
//   G4 取整一致：默认取整结果 = 原值四舍五入（堵「原值线性、显示值另套一层」）
// 另跑一组反例（sqrt、幂、对数、加常数、单项非线性、显示层开方），守卫必须全部判失败。
// 不依赖浏览器：同 tools/refpower.js，只给依赖链提供空画布占位，直接导入 src 离线计算。
const path = require('node:path');
const { pathToFileURL } = require('node:url');
let bad = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const mod = (rel) => import(pathToFileURL(path.join(__dirname, '..', rel)).href);

// power() 的零点：没有任何加成时各项取值（基础暴伤 1.5、基础回魔 0.11、倍率类 1，其余 0）。
// 这是战力公式的定义，不是可调参数；computeStats 的基础值改了，这里要同步改。
const NEUTRAL = { atk: 0, atkPct: 0, crit: 0, critDmg: 1.5, intMul: 1, cdr: 0, mpRegen: 0.11, normalMul: 1, maxHp: 0, def: 0 };
const CHANNELS = Object.keys(NEUTRAL).filter((k) => k !== 'atk' && k !== 'atkPct');

// 属性偏离零点的部分乘 t。攻击要拆开：computeStats 里 atk = 平直攻击 × (1 + 攻击%)。
// 刻印 / 状态 / 套装是整体乘区，保持不变；等级不变（参考攻击按等级算）。
function scale(S, t) {
  const out = { ...S };
  for (const k of CHANNELS) out[k] = NEUTRAL[k] + t * (S[k] - NEUTRAL[k]);
  const flat = S.atk / (1 + S.atkPct);
  out.atkPct = t * S.atkPct;
  out.atk = t * flat * (1 + out.atkPct);
  return out;
}
// 单通道加增量；攻击 % 只动乘区，平直攻击不变。
function bump(S, k, d) {
  const out = { ...S };
  if (k === 'atk') out.atk = (S.atk / (1 + S.atkPct) + d) * (1 + S.atkPct);
  else if (k === 'atkPct') { out.atkPct = S.atkPct + d; out.atk = S.atk / (1 + S.atkPct) * (1 + out.atkPct); }
  else out[k] = S[k] + d;
  return out;
}
const STEP = { atk: 25, atkPct: 0.06, crit: 0.04, critDmg: 0.2, intMul: 0.05, cdr: 0.04, mpRegen: 0.03, normalMul: 0.06, maxHp: 120, def: 15 };
const close = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

// 守卫：对战力函数 fn(S, rounded) 返回失败项；真实 power() 必须为空，反例必须非空。
function guard(fn, states) {
  const fails = [];
  for (const { tag, S } of states) {
    const p = fn(S, false);
    if (!(p > 0)) { fails.push(`${tag} 战力不为正 ${p}`); continue; }
    const zero = fn(scale(S, 0), false);
    if (!close(zero, 0, 1e-9)) fails.push(`${tag} G1 零点 ${zero}`);
    for (const t of [0.5, 2, 3]) {
      const q = fn(scale(S, t), false);
      if (!close(q, t * p)) fails.push(`${tag} G2 ×${t} 得 ${(q / p).toFixed(4)} 倍`);
    }
    for (const k of Object.keys(STEP)) {
      const d1 = fn(bump(S, k, STEP[k]), false) - p, d2 = fn(bump(S, k, 2 * STEP[k]), false) - p;
      if (!close(d2, 2 * d1)) fails.push(`${tag} G3 ${k} 第二次增量 / 第一次 = ${(d2 / d1 - 1).toFixed(4)}+1`);
    }
    const r = fn(S);
    if (r !== Math.round(p)) fails.push(`${tag} G4 取整 ${r} ≠ round(${p})`);
  }
  return fails;
}

(async () => {
  const previousDocument = globalThis.document;
  if (!previousDocument) globalThis.document = { createElement: (tag) => { if (tag !== 'canvas') throw new Error('离线测试不支持 DOM'); return { width: 0, height: 0 }; } };
  let progression, items, catalog, bossScale;
  try {
    progression = await mod('src/progression.js');
    items = await mod('src/items.js');
    catalog = await mod('src/gear/catalog.js');
    bossScale = await mod('src/boss_scale.js');
  } finally { if (!previousDocument) delete globalThis.document; }
  const { newSave, computeStats, power } = progression;
  const { REF_POWER } = bossScale;

  // 真实角色状态：1/5/10/20/30 级 × 稀有度 0～4 整套 × 随机属性点 / 技能 / 强化，固定种子。
  const random = Math.random;
  let seed = 20261111;
  Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const states = [];
  try {
    const int = (n) => Math.floor(Math.random() * (n + 1));
    const pickDef = (slot, rar) => catalog.defsBy({ slot, rar }).filter((d) => !d.variantOf)[0];
    for (const L of [1, 5, 10, 20, 30]) for (let rar = 0; rar < 5; rar++) for (let i = 0; i < 4; i++) {
      const s = newSave(); s.lv = L;
      for (const k of Object.keys(s.stats)) s.stats[k] = int(3 * L);
      for (const k of ['mastery', 'focus', 'flow']) s.skills[k] = int(5);
      s.equip = Object.fromEntries(items.SLOT_KEYS.map((k) => {
        const slot = k.startsWith('trinket') ? 'trinket' : k;
        const d = pickDef(slot, rar) || pickDef(slot, 3);
        if (!d) return [k, null];
        const it = items.makeItem(d.id, L); it.enh = int(10);
        return [k, it];
      }));
      states.push({ tag: `L${L}/r${rar}/#${i}`, S: computeStats(s) });
    }
  } finally { Math.random = random; }

  // 1. 真实 power() 通过全部守卫
  const real = guard(power, states);
  ok(real.length === 0, `线性守卫：${states.length} 个真实状态，G1 零点 / G2 齐次 / G3 逐通道等差 / G4 取整一致` + (real.length ? '：' + real.slice(0, 5).join('；') : ''));

  // 2. 「原始强度翻倍，r 翻倍」：按首领动态难度口径报 r
  const rows = [10, 20, 30].map((L) => {
    const { S } = states.find((x) => x.tag === `L${L}/r1/#0`);
    const r1 = power(S, false) / REF_POWER[L], r2 = power(scale(S, 2), false) / REF_POWER[L];
    return { L, r1: +r1.toFixed(3), r2: +r2.toFixed(3), ratio: r2 / r1 };
  });
  console.log(JSON.stringify(rows.map((x) => ({ ...x, ratio: +x.ratio.toFixed(6) }))));
  ok(rows.every((x) => close(x.ratio, 2)), '首领口径：原始强度 ×2 时 r = 战力 / REF_POWER 恰好 ×2（10 / 20 / 30 级）');

  // 3. 反例：守卫必须拦住每一种单调或局部非线性变换
  const wrap = (f) => (S, r = true) => { const v = f(power(S, false)); return r ? Math.round(v) : v; };
  const mutants = {
    'FIX-3 原样 100×sqrt': wrap((v) => 100 * Math.sqrt(Math.max(0, v))),
    '幂 0.9': wrap((v) => Math.max(0, v) ** 0.9),
    '对数': wrap((v) => 1000 * Math.log1p(Math.max(0, v) / 1000)),
    '加常数 200': wrap((v) => v + 200),
    '只对生命开方': (S, r = true) => power({ ...S, maxHp: 40 * Math.sqrt(Math.max(0, S.maxHp)) }, r),
    '暴击改乘法联动': (S, r = true) => power({ ...S, critDmg: 1.5 + (S.critDmg - 1.5) * (1 + S.crit) }, r),
    '只在显示值开方': (S, r = true) => (r ? Math.round(100 * Math.sqrt(Math.max(0, power(S, false)))) : power(S, false)),
  };
  for (const [name, fn] of Object.entries(mutants)) {
    const fails = guard(fn, states);
    ok(fails.length > 0, `反例被拦住：${name}` + (fails.length ? `（${fails.length} 项，例：${fails[0]}）` : '（守卫失效）'));
  }

  console.log(bad ? 'POWERLINEARTEST FAIL ' + bad : 'POWERLINEARTEST ok');
  if (bad) process.exitCode = 1;
})().catch((e) => { console.log('FAIL 未执行 ' + (e.stack || e.message)); process.exitCode = 1; });
