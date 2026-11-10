import { CATALOG, LEGENDS } from './catalog.js';
import { SLOT_KEYS, hydrateItem, itemBase } from '../items.js';

const slots = {armor:'chest',ring:'trinket1'};
const themes = [
  [/霜|寒|月|海/,'frost'], [/火|烛|烬/,'ember'], [/雷|风/,'storm'],
  [/毒|腐|渊/,'blight'], [/血|鬼|狱|夜/,'thorn'], [/星|光|天/,'dawn'],
];

// 不依赖全局状态、不使用随机数，重复迁移不会再改变实例。
export function migrateSave(input) {
  if (!input || ![1,2].includes(input.v)) return null;
  const save = JSON.parse(JSON.stringify(input));
  const convert = (old) => {
    if (!old) return null;
    if (old.def) return hydrateItem(old);
    const slot = slots[old.slot] || old.slot;
    const kind = old.slot === 'weapon' ? old.wtype || 'sword' : old.slot === 'ring' ? 'ring' : slot;
    const rar = old.rar === 3 ? 4 : old.rar;
    let def;
    if (rar === 4) def = LEGENDS.find((d)=>d.name === old.name);
    const series = rar < 2 ? 'wayfarer' : themes.find(([re])=>re.test(old.name || ''))?.[1] || 'dawn';
    def ||= CATALOG[`${kind}_${series}_r${rar}`];
    if (!def) throw new Error(`无法迁移装备：${old.name}`);
    const it = {uid:old.id,def:def.id,ilvl:old.ilvl,enh:old.enh,affix:old.affix || [],
      mark:def.fixed || ['wings','veil'].includes(def.kind) ? null : old.mark ?? null,
      imbueLv:def.fixed || ['wings','veil'].includes(def.kind) ? 0 : old.rar >= 2 ? 1 : 0,
      locked:old.locked ?? false,reforged:old.reforged ?? 0,skin:null};
    const base = itemBase(it);
    if (Object.entries(old.base || {}).some(([k,v])=>v > (base[k] || 0))) it.legacyBase = {...old.base};
    return hydrateItem(it);
  };
  const equip = Object.fromEntries(SLOT_KEYS.map((k)=>[k,null]));
  for (const [slot,it] of Object.entries(save.equip || {})) {
    const key = slots[slot] || slot;
    if (SLOT_KEYS.includes(key)) equip[key] = convert(it);
  }
  save.equip = equip;
  save.bag = (save.bag || []).map(convert);
  save.legendPity ||= {};
  if (!Array.isArray(save.gearSeen)) { // 防重复掉落的持有记录：老存档按当前穿戴+背包补种
    const seen = new Set();
    for (const it of [...Object.values(save.equip || {}), ...(save.bag || [])]) if (it?.def) seen.add(it.def);
    save.gearSeen = [...seen];
  }
  save.v = 2;
  return save;
}
