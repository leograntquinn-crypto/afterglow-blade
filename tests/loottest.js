// 掉落改造（Quinn 2026-11-10）：防重复（未持有优先）+ boss 混池 + 重复件用途（同名重铸/词条嫁接）+ 持有记录迁移
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765;
(async () => {
  let failures = 0, browser;
  const check = (ok, label, detail = '') => {
    console.log(`${ok ? 'ok' : 'FAIL'} ${label}${detail ? ' ' + detail : ''}`);
    if (!ok) failures++;
  };
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://localhost:${PORT}/index.html`);
    await page.waitForFunction(() => !!window.__game);
    const results = await page.evaluate(async () => {
      const { CATALOG } = await import('./src/gear/catalog.js');
      const items = await import('./src/items.js');
      const { makeItem, randomDrop, duplicatesOf, reforgeAllWithDuplicate, graftAffix, seenDefs, markSeen } = items;
      const { newSave } = await import('./src/progression.js');
      const { migrateSave } = await import('./src/gear/migrate.js');
      const out = [];
      const check = (ok, label, detail = '') => out.push({ ok, label, detail });

      // 固定种子 RNG（mulberry32），保证统计断言可复现
      const realRandom = Math.random;
      let seed = 20261110;
      Math.random = () => {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };

      const legends = Object.values(CATALOG).filter((d) => d.rar === 4);
      const bonePool = legends.filter((d) => d.drop.boss === 'boneLord');
      check(bonePool.length >= 3, '前置：骸骨统领传说池', `pool=${bonePool.length} legends=${legends.length}`);
      const target = bonePool[0];

      // 1) 防重复：除目标外所有传说都记为已持有 + 保底触发 → 必出目标
      {
        const save = newSave();
        save.gearSeen = legends.filter((d) => d.id !== target.id).map((d) => d.id);
        let allTarget = true;
        for (let i = 0; i < 8; i++) {
          save.legendPity = { 'boss:boneLord': 99 };
          const it = randomDrop(20, { save, stage: 1, source: 'boss', boss: 'boneLord' });
          if (!it || it.def !== target.id) allTarget = false;
        }
        check(allTarget, '防重复：只剩一件没见过时必出它');
      }

      // 2) 混池：全新存档刷同一 boss，200 次保底传说里应出现别的 boss 的传说
      {
        const save = newSave();
        save.gearSeen = [];
        const got = new Set();
        for (let i = 0; i < 200; i++) {
          save.legendPity = { 'boss:boneLord': 99 };
          const it = randomDrop(20, { save, stage: 1, source: 'boss', boss: 'boneLord' });
          if (it && CATALOG[it.def]?.rar === 4) got.add(it.def);
        }
        const foreign = [...got].filter((id) => CATALOG[id].drop.boss !== 'boneLord');
        check(foreign.length >= 1, '混池：boss 掉落出现全图传说', `kinds=${got.size} foreign=${foreign.length}`);
        check([...got].some((id) => CATALOG[id].drop.boss === 'boneLord'), '混池：本 boss 传说仍在池中');
      }

      // 3) 持有记录小工具
      {
        const save = newSave();
        markSeen(save, 'sword_frost_r3');
        markSeen(save, 'sword_frost_r3');
        check(seenDefs(save).size === 1 && save.gearSeen.length === 1, 'markSeen 去重');
      }

      // 4) 重复件：识别 / 锁定排除 / 同名重铸
      {
        const save = newSave();
        const kept = makeItem('sword_frost_r3', 20);
        const dup = makeItem('sword_frost_r3', 18);
        const other = makeItem('chest_frost_r3', 18);
        save.bag.push(kept, dup, other);
        check(duplicatesOf(save, kept).length === 1, 'duplicatesOf 只认同名件');
        dup.locked = true;
        check(duplicatesOf(save, kept).length === 0, 'duplicatesOf 排除锁定件');
        dup.locked = false;
        const gold0 = save.gold, reforged0 = kept.reforged || 0, affixN = kept.affix.length;
        check(affixN > 0, '前置：稀有以上有词条', `affix=${affixN}`);
        const ok = reforgeAllWithDuplicate(save, kept, dup);
        check(ok && !save.bag.includes(dup) && save.bag.includes(kept), '同名重铸消耗重复件');
        check((kept.reforged || 0) === reforged0 + 1 && kept.affix.length === affixN, '同名重铸计数 +1、词条数不变');
        check(save.gold === gold0, '同名重铸不花金币');
        check(reforgeAllWithDuplicate(save, kept, other) === false, '异名件不能同名重铸');
      }

      // 5) 词条嫁接：满词条替换 / 有空位追加 / 同类拒绝
      {
        const save = newSave();
        const kept = makeItem('sword_frost_r3', 20);
        const dup = makeItem('sword_frost_r3', 18);
        save.bag.push(kept, dup);
        const srcIdx = dup.affix.findIndex((a) => !kept.affix.some((x) => x.k === a.k));
        check(srcIdx >= 0, '前置：重复件有可嫁接词条');
        const srcK = dup.affix[srcIdx].k, srcV = dup.affix[srcIdx].v;
        const ok = graftAffix(save, kept, dup, srcIdx, 0);
        check(ok && !save.bag.includes(dup), '嫁接消耗重复件');
        check(kept.affix.some((a) => a.k === srcK && a.v === srcV), '嫁接词条原样搬入（满词条替换）');

        const kept2 = makeItem('sword_frost_r3', 20);
        const dup2 = makeItem('sword_frost_r3', 18);
        save.bag.push(kept2, dup2);
        kept2.affix = kept2.affix.slice(0, 2);
        const s2 = dup2.affix.findIndex((a) => !kept2.affix.some((x) => x.k === a.k));
        const ok2 = graftAffix(save, kept2, dup2, s2, null);
        check(ok2 && kept2.affix.length === 3, '嫁接有空位时追加');

        const kept3 = makeItem('sword_frost_r3', 20);
        const dup3 = makeItem('sword_frost_r3', 18);
        save.bag.push(kept3, dup3);
        dup3.affix = kept3.affix.map((a) => ({ ...a }));
        check(graftAffix(save, kept3, dup3, 0, 0) === false && save.bag.includes(dup3), '同类词条嫁接被拒绝且不消耗');
      }

      // 6) 老存档迁移补种持有记录
      {
        const raw = JSON.parse(JSON.stringify(makeItem('sword_frost_r3', 10)));
        const migrated = migrateSave({ v: 2, equip: {}, bag: [raw] });
        check(!!migrated && Array.isArray(migrated.gearSeen) && migrated.gearSeen.includes('sword_frost_r3'), '迁移按现有装备补种 gearSeen');
        const empty = migrateSave({ v: 2, equip: {}, bag: [] });
        check(!!empty && Array.isArray(empty.gearSeen) && empty.gearSeen.length === 0, '迁移空背包 gearSeen 为空数组');
      }

      Math.random = realRandom;
      return out;
    });
    for (const r of results) check(r.ok, r.label, r.detail);
    check(errors.length === 0, '页面无报错', errors.join('; '));
    await context.close();
  } catch (error) {
    check(false, '未完成断言', error.stack || error.message);
  } finally {
    if (browser) { try { await browser.close(); } catch (e) { check(false, '关闭浏览器', e.message); } }
    console.log(failures ? `LOOTTEST FAIL ${failures}` : 'LOOTTEST ok');
    if (failures) process.exitCode = 1;
  }
})();
