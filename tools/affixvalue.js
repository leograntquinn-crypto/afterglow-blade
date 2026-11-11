// node tools/affixvalue.js：生成；--check：只比对，报告第一处差异。
import { readFile, writeFile } from 'node:fs/promises';
import { referenceSamples } from './referencegear.js';
import { AFFIX_MAX, AFFIX_VALUE, LINE, REF_RULES } from '../src/gear/rules.js';
const previousDocument=globalThis.document;
if (!previousDocument) globalThis.document={createElement:tag=>{if(tag!=='canvas') throw new Error('标定脚本不支持 DOM');return {width:0,height:0};}};
let progression;
try {progression=await import('../src/progression.js');}
finally {if(!previousDocument) delete globalThis.document;}
const {newSave,computeStats,power}=progression;
try {
  const values=Array.from({length:31},()=>({})), lines=[0];
  referenceSamples(newSave,(save,L)=>{
    const start=power(computeStats(save),false);
    for (const k of Object.keys(AFFIX_MAX)) {
      const step=['str','vit','int','agi','hp'].includes(k)?1:0.001;
      const it=save.equip.weapon;
      it.affix.push({k,v:step});
      const w=(power(computeStats(save),false)-start)/step;
      it.affix.pop();
      if (!Number.isFinite(w)||w<1e-6) throw new Error(`边际价值过小 L=${L} k=${k}: ${w}`);
      values[L][k]=(values[L][k]||0)+w/REF_RULES.samples;
    }
  },{calibration:true});
  values[0]=null;
  // LINE 按满掷点 r=1 标定；随机掷点只在 affixRoll 中乘一次。
  for(let L=1;L<=30;L++) {
    for(const k of Object.keys(AFFIX_MAX)) values[L][k]=+values[L][k].toFixed(9);
    lines[L]=+(Object.entries(AFFIX_MAX).reduce((sum,[k,[a,b]])=>sum+(a+b*L)*values[L][k],0)/10).toFixed(9);
  }
  if(process.argv.includes('--check')) {
    for(let L=0;L<=30;L++) {
      for(const k of L?Object.keys(AFFIX_MAX):[]) if(AFFIX_VALUE[L]?.[k]!==values[L][k]) throw new Error(`第一处差异 AFFIX_VALUE[${L}].${k}: ${AFFIX_VALUE[L]?.[k]} != ${values[L][k]}`);
      if(LINE[L]!==lines[L]) throw new Error(`第一处差异 LINE[${L}]: ${LINE[L]} != ${lines[L]}`);
    }
    if(AFFIX_VALUE.length!==31||LINE.length!==31||AFFIX_VALUE[0]!==null) throw new Error('第一处差异：表长度或索引 0');
    console.log('AFFIX_VALUE / LINE 逐项一致（30 × 10）');
  } else {
    const url=new URL('../src/gear/rules.js',import.meta.url), source=await readFile(url,'utf8');
    const block=`// BEGIN GENERATED AFFIX VALUE\nexport const AFFIX_VALUE = ${JSON.stringify(values,null,1)};\nexport const LINE = ${JSON.stringify(lines)};\n// END GENERATED AFFIX VALUE`;
    await writeFile(url,source.replace(/\/\/ BEGIN GENERATED AFFIX VALUE[\s\S]*?\/\/ END GENERATED AFFIX VALUE/,block));
    console.log('已生成 AFFIX_VALUE / LINE');
  }
} catch(e) {console.error(e.message);process.exitCode=1;}
