import { SERIES } from './series.js';
import { KINDS, WAYFARER_NAMES } from './kinds.js';

function definition(id, kind, series, rar, name, extra = {}) {
  const cosmetic = kind === 'wings' || kind === 'veil';
  return { id, slot: KINDS[kind].slot, kind, series, rar, name,
    art: { icon: id, portrait: id, battle: null }, effects: [],
    imbue: cosmetic ? null : SERIES[series].element,
    set: cosmetic || series === 'wayfarer' ? null : series,
    classReq: null, pvp: false, drop: { stages: SERIES[series].stages, weight: 1, boss: null },
    ...extra, ...(cosmetic ? { fixed: { atk: 10 }, imbue: null, set: null, effects: [] } : {}),
  };
}

// 旧传说保留名字和部位，迁移可以直接按名字定位。
const independent = [
 ['duanyue','断月','katana','frost'], ['shuangjin','霜烬','sword','frost'],
 ['wugui','无归','great','thorn'], ['zhulongzhiya','烛龙之牙','great','ember'],
 ['bumianzhezhiguan','不眠者之冠','helm','storm'], ['jinmietouguan','烬灭头冠','helm','ember'],
 ['canguangzhanyi','残光战衣','chest','dawn'], ['yuanhailinjia','渊海鳞甲','chest','frost'],
 ['shizhihuan','时之环','ring','dawn'], ['yongyezhishi','永夜之誓','ring','thorn'],
 ['binglingyu','冰棱羽','wings','frost'], ['jinhuoyi','烬火翼','wings','ember'],
 ['leitingyi','雷霆翼','wings','storm'], ['chenxiyu','晨曦羽','wings','dawn'],
 ['yongyemu','永夜幕','veil','thorn'], ['limingmu','黎明幕','veil','dawn'],
];
const bossSets = [
 ['boneLord','boneking','骨王','thorn',['great','helm','chest','ring'],['枯骨王剑','枯骨王冠','枯骨战甲','枯骨指环']],
 ['nightRaven','raven','夜鸦','storm',['katana','helm','boots','amulet'],['夜鸦羽刃','夜鸦面冠','夜鸦行靴','夜鸦誓符']],
 ['ironJaw','ironjaw','铁颚','thorn',['great','chest','legs','bracers'],['铁颚断链','铁颚重甲','铁颚腿甲','铁颚锁腕']],
 ['warden','gravekeeper','守墓人','blight',['sword','helm','legs','amulet'],['守墓长锋','守墓头冠','守墓护腿','守墓魂符']],
 ['afterimage','afterimage','残影','dawn',['sword','chest','boots','ring'],['残影之刃','残影战衣','残影战靴','残影之环']],
];
export const LEGENDS = [
 ...bossSets.flatMap(([boss,key,label,series,kinds,names],stage) => kinds.map((kind,i) => definition(
   `lg_${key}_${kind}`,kind,series,4,names[i], {set:key,effects:[`${key}_${kind}`],drop:{stages:[stage+1],weight:1,boss}}))),
 ...independent.map(([id,name,kind,series]) => definition(`lg_${id}`,kind,series,4,name,
   {effects:[`lg_${id}`],drop:{stages:['trial','clear_hard'],weight:1,boss:null}})),
];
export const CATALOG = {};
for (const S of Object.values(SERIES)) for (const K of Object.values(KINDS)) {
  if (S.id === 'wayfarer' && !WAYFARER_NAMES[K.id]) continue;
  for (let rar=0; rar<(S.id === 'wayfarer' ? 2 : 4); rar++) {
    const id = `${K.id}_${S.id}_r${rar}`;
    CATALOG[id] = definition(id,K.id,S.id,rar,S.id === 'wayfarer' ? WAYFARER_NAMES[K.id][rar] : `${S.name}·${K.tiers[rar]}`);
  }
}
for (const def of LEGENDS) CATALOG[def.id] = def;

// 素材清单可缺省；只允许变体覆盖名字和外观，预算与身份继承保底件。
export function addVariants(rows) {
  for (const row of rows) {
    const base = CATALOG[row.variantOf];
    if (!base || !/^[a-z0-9_]+$/.test(row.id) || CATALOG[row.id]) throw new Error('无效装备变体');
    CATALOG[row.id] = {...base,id:row.id,variantOf:base.id,name:row.name || base.name,art:{...base.art,...row.art}};
  }
}
async function readVariants() {
  const url = new URL('./gear_variants.json', import.meta.url);
  let rows;
  if (url.protocol === 'file:') {
    try { rows = JSON.parse(await (await import('node:fs/promises')).readFile(url,'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return; throw e; }
  } else {
    const response = await fetch(url);
    if (response.status === 404) return;
    if (!response.ok) throw new Error('装备变体清单读取失败');
    rows = await response.json();
  }
  addVariants(Array.isArray(rows) ? rows : rows.variants);
}
await readVariants();
export const defsBy = (filters = {}) => Object.values(CATALOG).filter((d) =>
  ['slot','series','rar','kind'].every((k) => filters[k] === undefined || d[k] === filters[k]));
