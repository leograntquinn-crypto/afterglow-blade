import { SERIES } from './series.js';
import { LEGENDS } from './catalog.js';
// 战力当量为基础战力的比例；只用于展示、比较和首领动态难度，不参与伤害结算。
export const MARK_RATING = {counter:0.03,air:0.03,dodge:0.03,pristine:0.02,desperate:0.02,otg:0.03,wall:0.03,streak:0.03};
export const STATUS_RATING = Object.fromEntries(['burn','poison','bleed','chill','freeze','shock','paralyze','slow','brittle','fury','shield','lifesteal','thorns','cleanse'].map(id=>[id,{1:0,2:0,3:0}]));
export const SET_RATING = Object.fromEntries([...new Set([...Object.keys(SERIES),...LEGENDS.map(d=>d.set).filter(Boolean)])].map(id=>[id,{2:0,4:0}]));
// 状态模块提供激活 id 与规则；本检查点仅预留当量，不实现搭配结算。
export const SYNERGY_RATING = {frostfire:0,toxic_blast:0,shatter:0,bloodpoison:0,cauterize:0,clot:0,numb:0,
 resonance_chill:0,resonance_burn:0,resonance_shock:0,
 holy_blood:0,conduct_poison:0,frost_thunder:0,ember_blight:0,
 katana_shock:0,great_chill:0,sword_cleanse:0};
export function buffRating(S) {
  let n=0;
  for (const [id,sources] of Object.entries(S.imbues || {})) for (const source of sources) n+=STATUS_RATING[id]?.[source.lv] || 0;
  for (const [id,count] of Object.entries(S.setCount || {})) for (const [need,value] of Object.entries(SET_RATING[id] || {})) if (count>=+need) n+=value;
  for (const id of S.synergies || []) n+=SYNERGY_RATING[id] || 0;
  return n;
}
export const markRating = (S) => [...(S.marks || [])].reduce((n,id)=>n+(MARK_RATING[id] || 0),0);
