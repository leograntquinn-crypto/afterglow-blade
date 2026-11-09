// 用法：node tools/refpower.js [--write]。固定随机种子，重复生成结果逐项一致。
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
// progression 的技能名依赖链会创建一张空画布；离线标定只提供该占位，不启动渲染或战斗。
const previousDocument=globalThis.document;
if (!previousDocument) globalThis.document={createElement:tag=>{if(tag!=='canvas') throw new Error('标定脚本不支持 DOM');return {width:0,height:0};}};
let progression;
try {progression=await import('../src/progression.js');}
finally {if(!previousDocument) delete globalThis.document;}
const {newSave,computeStats,power,MAX_LV}=progression;
import { SLOT_KEYS, makeItem } from '../src/items.js';
import { defsBy } from '../src/gear/catalog.js';
import { REF_RULES } from '../src/gear/rules.js';
import { REF_POWER } from '../src/boss_scale.js';

export function referencePower() {
  const random=Math.random;
  let seed=REF_RULES.seed >>> 0;
  Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  try {
    const result=[0];
    for(let lv=1;lv<=MAX_LV;lv++) {
      let sum=0;
      for(let n=0;n<REF_RULES.samples;n++) {
        const save=newSave();
        save.lv=lv;
        save.stats.str=save.stats.vit=(lv-1)*3/2;
        for(const slot of SLOT_KEYS) {
          if((slot==='wings' || slot==='veil') && lv<REF_RULES.cosmeticLevel) {save.equip[slot]=null;continue;}
          const pool=defsBy({slot:slot.startsWith('trinket') ? 'trinket' : slot,rar:1}).filter(d=>!d.variantOf);
          save.equip[slot]=makeItem(pool[Math.floor(Math.random()*pool.length)].id,lv);
        }
        sum+=power(computeStats(save));
      }
      result.push(Math.round(sum/REF_RULES.samples));
    }
    return result;
  } finally {Math.random=random;}
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const result=referencePower(), url=new URL('../src/boss_scale.js',import.meta.url);
  console.log(`seed=${REF_RULES.seed}; 每级 ${REF_RULES.samples} 套；翅膀/光幕从 ${REF_RULES.cosmeticLevel} 级起`);
  console.log('等级 旧值 新值 差值');
  result.forEach((n,lv)=>console.log(`${lv} ${REF_POWER[lv]} ${n} ${n-REF_POWER[lv]}`));
  if(process.argv.includes('--write')) {
    const source=await readFile(url,'utf8');
    await writeFile(url,source.replace(/export const REF_POWER = \[[^\]]*\];/,`export const REF_POWER = [${result.join(', ')}];`));
  }
  const source=await readFile(url,'utf8');
  const actual=JSON.parse(source.match(/export const REF_POWER = (\[[^\]]*\]);/)[1]);
  const equal=actual.length===result.length && actual.every((v,i)=>v===result[i]);
  console.log(`REF_POWER = [${result.join(', ')}]`);
  console.log(`逐项一致：${equal ? '是（31/31）' : '否'}`);
  if(!equal) process.exitCode=1;
}
