// 装备预算与随机质量集中放表，逻辑只按表执行。
// 词条按参考配装的边际战力等值标定。
export const RARITY = [
 {name:'普通',color:'#d8d3c8',mul:1,w:58,affixes:0,quality:0,mark:0,imbue:[]},
 {name:'精良',color:'#4fa3ff',mul:1.15,w:27,affixes:1,quality:0.8,mark:0,imbue:[]},
 {name:'稀有',color:'#b46bff',mul:1.30,w:10,affixes:2,quality:0.9,mark:0.4,imbue:[1,2]},
 {name:'史诗',color:'#ff5aa0',mul:1.42,w:4,affixes:3,quality:1.0,mark:0.7,imbue:[2,3]},
 {name:'传说',color:'#ff9a2e',mul:1.55,w:1,affixes:4,quality:1.1,mark:1,imbue:[3]},
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
export const DROP_RULES = {majorWeight:3,pityMisses:8,cosmeticStage:2,clearItems:1,
 slotWeights:{weapon:0.18,chest:0.12,helm:0.10,legs:0.10,boots:0.10,bracers:0.10,trinket:0.16,wings:0.07,veil:0.07}};
export const COMPARE_RULES = {same:1,much:5};
export const REF_RULES = {samples:200,seed:20261109,cosmeticLevel:4};

// BEGIN GENERATED AFFIX VALUE
export const AFFIX_VALUE = [
 null,
 {
  "str": 16,
  "vit": 10.2,
  "int": 1.05024,
  "agi": 0.4376,
  "hp": 0.6,
  "crit": 87.52,
  "critDmg": 15.7536,
  "cdr": 87.52,
  "atkPct": 175.04,
  "mpRegen": 87.52
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 1.51488,
  "agi": 0.6312,
  "hp": 0.6,
  "crit": 126.24,
  "critDmg": 22.7232,
  "cdr": 126.24,
  "atkPct": 252.48,
  "mpRegen": 126.24
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 1.97952,
  "agi": 0.8248,
  "hp": 0.6,
  "crit": 164.96,
  "critDmg": 29.6928,
  "cdr": 164.96,
  "atkPct": 329.92,
  "mpRegen": 164.96
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 2.44416,
  "agi": 1.0184,
  "hp": 0.6,
  "crit": 203.68,
  "critDmg": 36.6624,
  "cdr": 203.68,
  "atkPct": 407.36,
  "mpRegen": 203.68
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 2.9088,
  "agi": 1.212,
  "hp": 0.6,
  "crit": 242.4,
  "critDmg": 43.632,
  "cdr": 242.4,
  "atkPct": 484.8,
  "mpRegen": 242.4
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 3.37344,
  "agi": 1.4056,
  "hp": 0.6,
  "crit": 281.12,
  "critDmg": 50.6016,
  "cdr": 281.12,
  "atkPct": 562.24,
  "mpRegen": 281.12
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 3.83808,
  "agi": 1.5992,
  "hp": 0.6,
  "crit": 319.84,
  "critDmg": 57.5712,
  "cdr": 319.84,
  "atkPct": 639.68,
  "mpRegen": 319.84
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 4.30272,
  "agi": 1.7928,
  "hp": 0.6,
  "crit": 358.56,
  "critDmg": 64.5408,
  "cdr": 358.56,
  "atkPct": 717.12,
  "mpRegen": 358.56
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 4.76736,
  "agi": 1.9864,
  "hp": 0.6,
  "crit": 397.28,
  "critDmg": 71.5104,
  "cdr": 397.28,
  "atkPct": 794.56,
  "mpRegen": 397.28
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 5.232,
  "agi": 2.18,
  "hp": 0.6,
  "crit": 436,
  "critDmg": 78.48,
  "cdr": 436,
  "atkPct": 872,
  "mpRegen": 436
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 5.69664,
  "agi": 2.3736,
  "hp": 0.6,
  "crit": 474.72,
  "critDmg": 85.4496,
  "cdr": 474.72,
  "atkPct": 949.44,
  "mpRegen": 474.72
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 6.16128,
  "agi": 2.5672,
  "hp": 0.6,
  "crit": 513.44,
  "critDmg": 92.4192,
  "cdr": 513.44,
  "atkPct": 1026.88,
  "mpRegen": 513.44
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 6.62592,
  "agi": 2.7608,
  "hp": 0.6,
  "crit": 552.16,
  "critDmg": 99.3888,
  "cdr": 552.16,
  "atkPct": 1104.32,
  "mpRegen": 552.16
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 7.09056,
  "agi": 2.9544,
  "hp": 0.6,
  "crit": 590.88,
  "critDmg": 106.3584,
  "cdr": 590.88,
  "atkPct": 1181.76,
  "mpRegen": 590.88
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 7.5552,
  "agi": 3.148,
  "hp": 0.6,
  "crit": 629.6,
  "critDmg": 113.328,
  "cdr": 629.6,
  "atkPct": 1259.2,
  "mpRegen": 629.6
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 8.01984,
  "agi": 3.3416,
  "hp": 0.6,
  "crit": 668.32,
  "critDmg": 120.2976,
  "cdr": 668.32,
  "atkPct": 1336.64,
  "mpRegen": 668.32
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 8.48448,
  "agi": 3.5352,
  "hp": 0.6,
  "crit": 707.04,
  "critDmg": 127.2672,
  "cdr": 707.04,
  "atkPct": 1414.08,
  "mpRegen": 707.04
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 8.94912,
  "agi": 3.7288,
  "hp": 0.6,
  "crit": 745.76,
  "critDmg": 134.2368,
  "cdr": 745.76,
  "atkPct": 1491.52,
  "mpRegen": 745.76
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 9.41376,
  "agi": 3.9224,
  "hp": 0.6,
  "crit": 784.48,
  "critDmg": 141.2064,
  "cdr": 784.48,
  "atkPct": 1568.96,
  "mpRegen": 784.48
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 9.8784,
  "agi": 4.116,
  "hp": 0.6,
  "crit": 823.2,
  "critDmg": 148.176,
  "cdr": 823.2,
  "atkPct": 1646.4,
  "mpRegen": 823.2
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 10.34304,
  "agi": 4.3096,
  "hp": 0.6,
  "crit": 861.92,
  "critDmg": 155.1456,
  "cdr": 861.92,
  "atkPct": 1723.84,
  "mpRegen": 861.92
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 10.80768,
  "agi": 4.5032,
  "hp": 0.6,
  "crit": 900.64,
  "critDmg": 162.1152,
  "cdr": 900.64,
  "atkPct": 1801.28,
  "mpRegen": 900.64
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 11.27232,
  "agi": 4.6968,
  "hp": 0.6,
  "crit": 939.36,
  "critDmg": 169.0848,
  "cdr": 939.36,
  "atkPct": 1878.72,
  "mpRegen": 939.36
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 11.73696,
  "agi": 4.8904,
  "hp": 0.6,
  "crit": 978.08,
  "critDmg": 176.0544,
  "cdr": 978.08,
  "atkPct": 1956.16,
  "mpRegen": 978.08
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 12.2016,
  "agi": 5.084,
  "hp": 0.6,
  "crit": 1016.8,
  "critDmg": 183.024,
  "cdr": 1016.8,
  "atkPct": 2033.6,
  "mpRegen": 1016.8
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 12.66624,
  "agi": 5.2776,
  "hp": 0.6,
  "crit": 1055.52,
  "critDmg": 189.9936,
  "cdr": 1055.52,
  "atkPct": 2111.04,
  "mpRegen": 1055.52
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 13.13088,
  "agi": 5.4712,
  "hp": 0.6,
  "crit": 1094.24,
  "critDmg": 196.9632,
  "cdr": 1094.24,
  "atkPct": 2188.48,
  "mpRegen": 1094.24
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 13.59552,
  "agi": 5.6648,
  "hp": 0.6,
  "crit": 1132.96,
  "critDmg": 203.9328,
  "cdr": 1132.96,
  "atkPct": 2265.92,
  "mpRegen": 1132.96
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 14.06016,
  "agi": 5.8584,
  "hp": 0.6,
  "crit": 1171.68,
  "critDmg": 210.9024,
  "cdr": 1171.68,
  "atkPct": 2343.36,
  "mpRegen": 1171.68
 },
 {
  "str": 16,
  "vit": 10.2,
  "int": 14.5248,
  "agi": 6.052,
  "hp": 0.6,
  "crit": 1210.4,
  "critDmg": 217.872,
  "cdr": 1210.4,
  "atkPct": 2420.8,
  "mpRegen": 1210.4
 }
];
export const LINE = [0,13.2030528,18.04896,23.0001856,28.0567296,33.218592,38.4857728,43.858272,49.3360896,54.9192256,60.60768,66.4014528,72.300544,78.3049536,84.4146816,90.629728,96.9500928,103.375776,109.9067776,116.5430976,123.284736,130.1316928,137.083968,144.1415616,151.3044736,158.572704,165.9462528,173.42512,181.0093056,188.6988096,196.493632];
// END GENERATED AFFIX VALUE
