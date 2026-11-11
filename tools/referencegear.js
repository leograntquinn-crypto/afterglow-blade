// 两个标定工具共用等级、属性分配、装备池、随机种子与采样数。
import { SLOT_KEYS, makeItem, hydrateItem } from '../src/items.js';
import { defsBy } from '../src/gear/catalog.js';
import { REF_RULES, AFFIX_MAX, AFFIX_SHARE } from '../src/gear/rules.js';
export function referenceSamples(newSave, visit, { calibration = false } = {}) {
  const random = Math.random;
  let seed = REF_RULES.seed >>> 0;
  Math.random = () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
  try {
    for (let lv=1; lv<=30; lv++) for (let n=0; n<REF_RULES.samples; n++) {
      const save=newSave(); save.lv=lv;
      save.stats.str=save.stats.vit=(lv-1)*3/2;
      for (const slot of SLOT_KEYS) {
        if ((slot==='wings'||slot==='veil') && lv<REF_RULES.cosmeticLevel) {save.equip[slot]=null;continue;}
        const pool=defsBy({slot:slot.startsWith('trinket')?'trinket':slot,rar:1}).filter(d=>!d.variantOf);
        const d=pool[Math.floor(Math.random()*pool.length)];
        if (!calibration) save.equip[slot]=makeItem(d.id,lv);
        else {
          // 固定旧精良词条预算，避免生成表依赖自身，也避免重复生成时漂移。
          const keys=Object.keys(AFFIX_MAX), k=keys[Math.floor(Math.random()*keys.length)];
          const [a,b]=AFFIX_MAX[k], v=(a+b*lv)*AFFIX_SHARE[d.slot]*0.8*(0.8+Math.random()*0.2);
          save.equip[slot]=hydrateItem({def:d.id,ilvl:lv,enh:0,affix:d.fixed?[]:[{k,v:k==='hp'||['str','vit','int','agi'].includes(k)?Math.max(1,Math.round(v)):+v.toFixed(3)}],mark:null,imbueLv:0});
        }
      }
      visit(save,lv,n);
    }
  } finally {Math.random=random;}
}
