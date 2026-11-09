// 装备预算与随机质量集中放表，逻辑只按表执行。
export const RARITY = [
 {name:'普通',color:'#d8d3c8',mul:1,w:58,affixes:0,quality:0,mark:0,imbue:[]},
 {name:'精良',color:'#4fa3ff',mul:1.15,w:27,affixes:1,quality:0.8,mark:0,imbue:[]},
 {name:'稀有',color:'#b46bff',mul:1.30,w:10,affixes:2,quality:0.9,mark:0.4,imbue:[1,2]},
 {name:'史诗',color:'#ff5aa0',mul:1.42,w:4,affixes:2,quality:1,mark:0.7,imbue:[2,3]},
 {name:'传说',color:'#ff9a2e',mul:1.55,w:1,affixes:3,quality:1.15,mark:1,imbue:[3]},
];
export const BUDGET = {
 weapon:{atk:[8,3.2]}, chest:{def:[3,1.2],hp:[12,6]}, helm:{def:[1.5,0.6],hp:[6,3.5]},
 legs:{def:[2,0.8],hp:[7,3.5]}, boots:{def:[1.5,0.6],hp:[5,3]},
 bracers:{atk:[1,0.4]}, trinket:{atk:[1,0.4],crit:[0.005,0]},
};
export const AFFIX_SHARE = {weapon:1,chest:1,helm:0.5,legs:0.5,boots:0.4,bracers:0.4,trinket:0.45};
export const AFFIX_MAX = {str:[2,0.8],vit:[2,0.8],int:[2,0.8],agi:[2,0.8],hp:[12,9],crit:[0.04,0],critDmg:[0.16,0],cdr:[0.05,0],atkPct:[0.08,0],mpRegen:[0.2,0]};
export const ITEM_RULES = {affixMin:0.8,enhPer:0.08};

// 旧品质的费用保持原值；史诗费用档在稀有和传说之间插值。
export const COST_TIER = [0,1,2,2.5,3];
export const SELL_MULT = {0:1,1:3,2:8,2.5:16.5,3:25};
// 旧四类保留 34:22:22:22 的相对比例，预留 20% 给五个新部位均分。
export const DROP_RULES = {majorWeight:3,pityMisses:8,cosmeticStage:2,clearItems:1,newSlotShare:0.2,
 oldSlotWeights:{weapon:0.34,chest:0.22,helm:0.22,trinket:0.22},
 newSlots:['legs','boots','bracers','wings','veil']};
export const COMPARE_RULES = {same:1,much:5};
export const REF_RULES = {samples:200,seed:20261109,cosmeticLevel:4};
