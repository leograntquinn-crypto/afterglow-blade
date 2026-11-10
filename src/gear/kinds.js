// 档位名按款式集中维护；流派 key 与 WTYPES 一致。
const rows = [
 ['sword','weapon','长剑','游刃',['铁剑','钢剑','纹刃','名锋']],
 ['katana','weapon','太刀','疾斩',['打刀','长刀','月纹刀','天羽刀']],
 ['great','weapon','巨剑','崩山',['阔剑','重剑','裂岩剑','镇岳剑']],
 ['helm','helm','头盔',null,['布头巾','皮盔','刻纹冠','镇魂盔']],
 ['chest','chest','胸甲',null,['布衣','皮甲','纹鳞甲','御灵战衣']],
 ['legs','legs','护腿',null,['布裤','皮护腿','嵌纹护腿','镇岳腿甲']],
 ['boots','boots','战靴',null,['布靴','皮战靴','刻纹靴','逐星战靴']],
 ['bracers','bracers','护腕',null,['布缠','皮护腕','刻纹护腕','镇魂护腕']],
 ['ring','trinket','戒指',null,['铜戒','银戒','纹石戒','星辉指环']],
 ['amulet','trinket','护符',null,['木符','铜护符','铭纹符','守誓护符']],
 ['wings','wings','翅膀',null,['短羽','展翼','棱羽','天穹翼']],
 ['veil','veil','光幕',null,['微光','流辉','环光','苍穹幕']],
];
export const KINDS = Object.fromEntries(rows.map(([id,slot,name,school,tiers]) => [id,{id,slot,name,school,wtype: slot === 'weapon' ? id : null,tiers}]));
export const WAYFARER_NAMES = {
 sword: ['铁剑','青钢剑'], katana: ['打刀','霜纹太刀'], great: ['阔剑','断岩巨剑'],
 helm: ['布头巾','皮盔'], chest: ['布衣','皮甲'], legs: ['布裤','皮护腿'],
 boots: ['布靴','皮战靴'], bracers: ['布缠','皮护腕'], ring: ['铜戒','银戒'], amulet: ['木符','铜护符'],
 wings: ['布羽','旅人展翼'],
};
