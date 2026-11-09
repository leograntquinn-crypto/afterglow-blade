// 固定种子守住装备模型；由模块测试运行器提供服务器，本检查点不运行浏览器。
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const path = require('path');
const PORT = process.env.PORT || 8765;
(async () => {
  let failures = 0, browser;
  const check = (ok, label, detail = '') => {
    console.log(`${ok ? 'ok' : 'FAIL'} ${label}${detail ? ' ' + detail : ''}`);
    if (!ok) failures++;
  };
  try {
    // 8：运行真实离线生成器的只读模式，脚本自己逐项核对31个表值。
    try {
      const output = execFileSync(process.execPath, [path.resolve(__dirname, '../tools/refpower.js')], { encoding: 'utf8', timeout: 120000 });
      check(output.includes('逐项一致：是（31/31）'), '8 REF_POWER');
    } catch (error) { check(false, '8 REF_POWER', error.stdout?.toString() || error.message); }
    browser = await chromium.launch();
    for (const mobile of [false, true]) {
      const context = await browser.newContext({ viewport: mobile ? {width:390,height:844} : {width:1280,height:720}, isMobile:mobile, hasTouch:mobile });
      const page = await context.newPage(), errors = [], requests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('request', request => { if (/gear_(icons|frame)/.test(request.url())) requests.push(request.url()); });
      await page.goto(`http://localhost:${PORT}/index.html`);
      await page.waitForFunction(() => !!window.__game);
      check(requests.length === 0, '9 启动不载入装备图集 ' + mobile);
      if (!mobile) {
        const results = await page.evaluate(async () => {
          const {CATALOG, defsBy, LEGENDS} = await import('./src/gear/catalog.js');
          const {KINDS} = await import('./src/gear/kinds.js');
          const {SERIES} = await import('./src/gear/series.js');
          const {makeItem, itemStats, itemBase, SLOT_KEYS, canImprove, enhRate, reforgeAffix, inheritCost} = await import('./src/items.js');
          const {newSave, computeStats, power} = await import('./src/progression.js');
          const {compareItem} = await import('./src/gear/compare.js');
          const {migrateSave} = await import('./src/gear/migrate.js');
          const {SaveStore} = await import('./src/save.js');
          const results = [];
          const check = (ok, label, detail = '') => results.push({ok, label, detail});
          const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
          const allItems = save => [...Object.values(save.equip), ...save.bag].filter(Boolean);
          const random = Math.random;
          let seed = 20261109;
          Math.random = () => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed / 4294967296; };
          try {
            // 1：逐格枚举，不用目录自己的总数代替期望集合。
            const defs = Object.values(CATALOG), base = defs.filter(d => !d.variantOf && d.rar < 4);
            check(base.length === 308 && LEGENDS.length === 36 && defs.filter(d=>!d.variantOf).length === 344, '1 308+36');
            for (const series of Object.keys(SERIES)) for (const kind of Object.keys(KINDS)) {
              if (series === 'wayfarer' && ['wings','veil'].includes(kind)) continue;
              for (let rar=0;rar<(series==='wayfarer'?2:4);rar++) check(!!CATALOG[`${kind}_${series}_r${rar}`], `1 格子 ${kind}/${series}/${rar}`);
            }
            check(new Set(defs.map(d=>d.id)).size === defs.length, '1 id唯一');
            for (const d of defs) check(/^[a-z0-9_]+$/.test(d.id) && CATALOG[d.id] === d &&
              ['id','slot','kind','series','rar','name','art','effects','imbue','set','classReq','pvp','drop'].every(k=>Object.hasOwn(d,k)) &&
              d.classReq === null && d.pvp === false && ['icon','portrait','battle'].every(k=>Object.hasOwn(d.art,k)), `1 字段 ${d.id}`);
            // 2：每档各抽40件，交替两种外观件，并给恶意强化/词条确认不会漏入属性。
            for (let rar=0;rar<5;rar++) for (let n=0;n<40;n++) {
              const slot=n%2?'wings':'veil', pool=defsBy({slot,rar});
              const it=makeItem(pool[n%pool.length].id,1+n,{enh:10});
              check(same(itemStats(it),{atk:10}) && it.affix.length===0 && it.mark===null && it.imbueLv===0, `2 固定属性 ${rar}/${n}`);
              const s=newSave(); s.equip=Object.fromEntries(SLOT_KEYS.map(k=>[k,null])); s.equip[slot]=it;
              check(Object.keys(computeStats(s).setCount).length===0, `2 不计套装 ${rar}/${n}`);
              check(!canImprove(it) && enhRate(it)===0 && !reforgeAffix(it,0) && inheritCost(it,it)===0, `2 禁养成 ${rar}/${n}`);
            }
            // 3：旧预算独立写在测试中，分别核对每个属性，不以总战力掩盖预算挪动。
            const multipliers=[1,1.15,1.30,1.42,1.55];
            for (const level of [1,10,20,30]) for (let rar=0;rar<5;rar++) {
              const total={};
              for (const slot of ['helm','chest','legs','boots','bracers','trinket1','trinket2']) {
                const def=defsBy({slot:slot.startsWith('trinket')?'trinket':slot,rar}).find(d=>!d.variantOf);
                for (const [key,value] of Object.entries(itemBase(makeItem(def.id,level)))) total[key]=(total[key]||0)+value;
              }
              const mul=multipliers[rar], old={def:(8+3.2*level)*mul,hp:(30+16*level)*mul,atk:(3+1.2*level)*mul,crit:0.01};
              for(const [key,value] of Object.entries(old)) check(Math.abs((total[key]||0)-value)<=1, `3 预算 L${level}/r${rar}/${key}`, `${total[key]} vs ${value}`);
            }
            // 4：旧属性按旧代码定义计算；自动迁移通过真实SaveStore入口验证。
            const key='afterglow-blade-save-v1', stored=localStorage.getItem(key);
            try {
              for (const phase of ['early','mid','late']) {
                const response=await fetch(`tests/fixtures/save_v1_${phase}.json`), input=await response.json();
                const snapshot=JSON.stringify(input), migrated=migrateSave(input), before=allItems(input), after=allItems(migrated);
                check(before.length===after.length, `4 件数 ${phase}`);
                const byUid=new Map(after.map(it=>[it.uid,it]));
                for (const old of before) {
                  const it=byUid.get(old.id), stats={};
                  for (const [k,v] of Object.entries(old.base)) stats[k]=v*(k==='crit'?1:1+old.enh*0.08);
                  for (const affix of old.affix) stats[affix.k]=(stats[affix.k]||0)+affix.v;
                  check(!!it && Object.entries(stats).every(([k,v])=>(itemStats(it)[k]||0)+1e-9>=v), `4 逐项不降 ${phase}/${old.id}`);
                  check(!!it && it.ilvl===old.ilvl && it.enh===old.enh && same(it.affix,old.affix) && (it.mark??null)===(old.mark??null) && it.locked===(old.locked??false) && it.reforged===(old.reforged??0), `4 字段 ${phase}/${old.id}`);
                  if(old.rar===3) check(it?.rar===4, `4 旧传说 ${old.id}`);
                }
                check(snapshot===JSON.stringify(input) && same(migrateSave(migrated),migrated), `4 纯函数/幂等 ${phase}`);
                localStorage.setItem(key,JSON.stringify(input));
                check(same(new SaveStore().data,migrated), `4 自动加载 ${phase}`);
                check(migrated.equip.chest?.uid===input.equip.armor?.id && migrated.equip.trinket1?.uid===input.equip.ring?.id, `4 槽迁移 ${phase}`);
              }
            } finally {if(stored===null) localStorage.removeItem(key);else localStorage.setItem(key,stored);}
            // 5：每个稀有度配对10000次，轮换全部成长槽/武器款式，系列不凑套装。
            const kinds=Object.keys(KINDS).filter(k=>!['wings','veil'].includes(k));
            for (const gap of [1,2]) for (let low=0;low+gap<5;low++) {
              let wins=0;
              for(let n=0;n<10000;n++) {
                const kind=kinds[n%kinds.length], slot=KINDS[kind].slot, level=[1,10,20,30][n%4];
                const pool=rar=>defsBy({kind,rar}).filter(d=>!d.variantOf);
                const lp=pool(low),hp=pool(low+gap), a=makeItem(lp[n%lp.length].id,level),b=makeItem(hp[n%hp.length].id,level);
                a.enh=b.enh=n%11;
                const s=newSave(); s.equip=Object.fromEntries(SLOT_KEYS.map(k=>[k,null]));
                s.equip[slot==='trinket'?'trinket1':slot]=b;
                const result=compareItem(s,a,{slot:slot==='trinket'?'trinket1':slot});
                if(['better','much'].includes(result.verdict)) wins++;
              }
              check(wins<= (gap===1?500:100), `5 标定 r${low}对r${low+gap}`, `${wins}/10000`);
            }
            // 6：去除随机词条干扰，专门守住同强化折算及不修改实例。
            const save=newSave(), fine=makeItem('sword_wayfarer_r1',10,{enh:8,affix:[],mark:null}), epic=makeItem('sword_frost_r3',10,{enh:0,affix:[],mark:null});
            save.equip.weapon=fine;
            const snapshot=JSON.stringify([fine,epic]), forward=compareItem(save,epic);
            check(forward.enhAs===8 && ['better','much'].includes(forward.verdict),'6 精良+8对史诗+0');
            check(snapshot===JSON.stringify([fine,epic]),'6 原实例不变');
            const normalized=makeItem('sword_frost_r3',10,{enh:8,affix:[],mark:null});
            const normalizedResult=compareItem(save,normalized);
            check(forward.total===normalizedResult.total && forward.verdict===normalizedResult.verdict,'6 候选原强化不影响结果');
            check(Math.abs(Object.values(forward.parts).reduce((a,b)=>a+b,0)-forward.total)<1e-9,'6 三段合计');
            epic.enh=8;fine.enh=0;save.equip.weapon=epic;
            const reverse=compareItem(save,fine);
            check(reverse.enhAs===8 && !['better','much'].includes(reverse.verdict),'6 史诗+8对精良+0');
            check(epic.enh===8 && fine.enh===0,'6 反向实例不变');
            // 7：隔离导入比较模块，暂用重复乘入强化的错误power；不改生产导出或其他测试。
            const source=await (await fetch('src/gear/compare.js')).text();
            const altered=source.replace("import { computeStats, power } from '../progression.js';", "import { computeStats, power as correctPower } from '../progression.js';\nconst power = S => correctPower({...S, atk:S.atk*(1+8*0.08)});")
              .replace(/from '([^']+)'/g, (_,relative)=>`from '${new URL(relative,new URL('src/gear/compare.js',location.href)).href}'`);
            const url=URL.createObjectURL(new Blob([altered],{type:'text/javascript'}));
            try {
              const mutated=await import(url);
              check(altered!==source,'7 已注入错误power');
              const game=__game, displayed=game.stats;
              try {
                game.stats={...displayed,atk:1e12};
                check(compareItem(save,fine).verdict===reverse.verdict,'7 界面总战力不参与推荐');
              } finally {game.stats=displayed;}
              check(mutated.compareItem(save,fine).verdict===reverse.verdict,'7 错误power反向结论');
              fine.enh=8;epic.enh=0;save.equip.weapon=fine;
              check(mutated.compareItem(save,epic).verdict===forward.verdict,'7 错误power正向结论');
            } finally {URL.revokeObjectURL(url);}
          } finally {Math.random=random;}
          return results;
        });
        for (const result of results) check(result.ok, result.label, result.detail);
      }
      // 9：真实页面、装备详情、饰品选槽和异步释放；桌面/手机都跑。
      await page.evaluate(async () => {
        const {makeItem}=await import('./src/items.js');
        const g=__game;g.startWorld();g.story.clear();
        g.save.equip.weapon=makeItem('sword_wayfarer_r0',1);
        g.save.bag=[makeItem('sword_frost_r3',10),makeItem('ring_dawn_r2',10)];
        g.refreshStats();g.openMenu('hero');
      });
      await page.waitForFunction(async () => (await import('./src/gear/art.js')).GEAR_ART.ready);
      check(requests.some(url => url.endsWith(mobile ? 'gear_icons_m.json' : 'gear_icons.json')), '9 分辨率清单 '+mobile);
      check(await page.locator('.bag .glyph [style*="background-image"]').count()===2,'9 背包图标 '+mobile);
      check(await page.locator('.slots .glyph [data-gear-icon]').count()>0,'9 槽位图标 '+mobile);
      await page.locator('.bag [data-act="sel"]').first().click();
      check(await page.locator('#hub-modal [data-act="close"]').count()>0,'9 装备详情 '+mobile);
      await page.locator('#hub-modal [data-act="close"]').click();
      await page.locator('.bag [data-act="sel"]').nth(1).click();
      await page.locator('[data-act="compareSlot"][data-slot="trinket2"]').click();
      check(await page.evaluate(()=>__game.hub.compareSlot==='trinket2'),'9 饰品切换 '+mobile);
      const lifecycle=await page.evaluate(async () => {
        const {GEAR_ART,gearGlyph}=await import('./src/gear/art.js');
        const {makeItem,itemGlyph}=await import('./src/items.js');
        const g=__game,it=g.save.bag[0];
        g.hub.hide();const retained=GEAR_ART.ready;
        g.startStage(0);const released=!GEAR_ART.ready && !GEAR_ART.meta && GEAR_ART.pages.length===0;
        const fallback=gearGlyph(it)===itemGlyph(it);
        // 立即释放在途请求，旧请求不能恢复已释放图集。
        const pending=GEAR_ART.load();GEAR_ART.release();await pending;
        const race=!GEAR_ART.ready && GEAR_ART.pages.length===0;
        const missing=gearGlyph(makeItem('lg_duanyue',10))===itemGlyph(makeItem('lg_duanyue',10));
        return {retained,released,fallback,race,missing};
      });
      for(const [label,ok] of Object.entries(lifecycle)) check(ok,'9 '+label+' '+mobile);
      check(errors.length===0,'9 页面无报错 '+mobile,errors.join('; '));
      await context.close();
    }
  } catch(error) {check(false,'未完成断言',error.stack || error.message);}
  finally {
    if(browser) {try {await browser.close();} catch(error) {check(false,'关闭浏览器',error.message);}}
    console.log(failures ? `GEARMODELTEST FAIL ${failures}` : 'GEARMODELTEST ok');
    if(failures) process.exitCode=1;
  }
})();
