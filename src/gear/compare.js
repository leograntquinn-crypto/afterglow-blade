import { hydrateItem } from '../items.js';
import { computeStats, power } from '../progression.js';
import { CATALOG } from './catalog.js';
import { COMPARE_RULES } from './rules.js';
export const COMPARISON = {
 much:{symbol:'▲▲',text:'明显更强',color:'#72dc93'},better:{symbol:'▲',text:'略强',color:'#72dc93'},
 same:{symbol:'＝',text:'相当',color:'#aaa'},worse:{symbol:'▼',text:'略弱',color:'#ed8585'},
 muchWorse:{symbol:'▼▼',text:'明显更弱',color:'#ed8585'},playstyle:{symbol:'◆',text:'看打法',color:'#ffd65a'},
};
const copy = (it,enh,extra={}) => it ? hydrateItem({...it,enh,...extra}) : null;
// 分段替换同一个目标槽，始终以原整套战力为分母，三段可直接相加。
function atSlot(save,cand,slot) {
  const against=save.equip[slot] || null, enhAs=against?.enh || 0;
  const old=copy(against,enhAs), next=copy(cand,enhAs);
  const equip={...save.equip,[slot]:old};
  const original=computeStats({...save,equip}), start=power(original);
  const evaluate=(it,meta)=>power(computeStats({...save,equip:{...equip,[slot]:it}},meta ? {[slot]:meta} : {}));
  // 空槽的旧效果为空，避免候选定义的状态在基础段提前出现。
  const empty={def:null,imbueLv:0};
  const base=evaluate(copy(next,enhAs,{affix:old?.affix || [],mark:old?.mark || null,imbueLv:old?.imbueLv || 0}),old || empty);
  const effect=evaluate(copy(next,enhAs,{imbueLv:old?.imbueLv || 0}),old || empty);
  const finish=evaluate(next);
  const pct=n=>n/Math.max(1,start)*100;
  const parts={base:pct(base-start),effect:pct(effect-base),buff:pct(finish-effect)};
  const total=pct(finish-start), direct=parts.base+parts.effect;
  let verdict=total>=COMPARE_RULES.much ? 'much' : total>=COMPARE_RULES.same ? 'better' : total<=-COMPARE_RULES.much ? 'muchWorse' : total<=-COMPARE_RULES.same ? 'worse' : 'same';
  if (direct*parts.buff<0 && direct*total<0) verdict='playstyle';
  const reasons=[];
  if (cand.ilvl!==(against?.ilvl || 0)) reasons.push({id:'ilvl',delta:cand.ilvl-(against?.ilvl || 0)});
  const after=computeStats({...save,equip:{...equip,[slot]:next}});
  for (const id of new Set([...Object.keys(original.setCount),...Object.keys(after.setCount)])) {
    const from=original.setCount[id] || 0,to=after.setCount[id] || 0;
    if(from!==to) reasons.push({id:'setCount',set:id,from,to});
  }
  for (const mark of new Set([old?.mark,next.mark].filter(Boolean))) reasons.push({id:'conditionalMark',mark});
  for (const [change,it] of [['before',old],['after',next]]) {
    const status=CATALOG[it?.def]?.imbue;
    if(status && it.imbueLv) reasons.push({id:'conditionalStatus',change,status,lv:it.imbueLv});
  }
  return {slot,against,enhAs,parts,total,verdict,reasons};
}
export function compareItem(save,cand,options={}) {
  const requested=typeof options==='string' ? options : options.slot;
  const slot=CATALOG[cand.def]?.slot || cand.slot;
  const slots=slot==='trinket' ? ['trinket1','trinket2'] : [slot];
  if(requested && !slots.includes(requested)) throw new Error('比较目标槽位不匹配');
  if(requested) return atSlot(save,cand,requested);
  // 两个饰品按同强化折算后的替换收益选择较弱者；各槽的原强化差异不用于选槽。
  if(slots.length===2) {
    const neutral={...save,equip:{...save.equip}};
    for(const k of slots) neutral.equip[k]=copy(save.equip[k],0);
    const target=slots.map(k=>atSlot(neutral,cand,k)).sort((a,b)=>b.total-a.total)[0].slot;
    return atSlot(save,cand,target);
  }
  return atSlot(save,cand,slots[0]);
}
