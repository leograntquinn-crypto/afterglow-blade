# 装备数据模块 · 检查点 1 交付

本次仅实现 G-1、G-2；未提交、未推送，未启动服务器，未执行模块测试或全套测试，未新增或修改测试文件。G-3～G-6 留给后续检查点。

## 文件清单

| 文件 | 说明 |
| --- | --- |
| `src/gear/series.js`（新） | 七系列的名称、状态 id、掉落关卡、母题及 2/4 件效果文字与 id。 |
| `src/gear/kinds.js`（新） | 十二款式的槽位、流派、四档名字和行者名字表。 |
| `src/gear/rules.js`（新） | 五档稀有度、槽位预算、词条份额、质量与随机区间等数据。 |
| `src/gear/catalog.js`（新） | 规则展开 308 件，手写传说数据 36 件，目录筛选与可选变体读取。 |
| `src/gear/migrate.js`（新） | 纯函数迁移 v1 到 v2，并恢复 v2 实例的非序列化访问器。 |
| `src/items.js`（改） | 十槽位、实例生成、预算计算、旧调用兼容和固定攻击例外。 |
| `src/progression.js`（改） | 新存档 v2、背包 60、十槽汇总、套装/状态来源及胸甲外观衔接。 |
| `src/save.js`（改） | 本地和云存档统一经过迁移入口，保留原 localStorage key 以读取旧档。 |
| `src/main.js`（改） | 传说特效判断用 isLegend，地狱首领保证传说的档位同步到 4。 |
| `src/loot.js`（改） | 五档光柱高度及 isLegend 衔接，保留原有素材绘制。 |
| `src/hub.js`（改） | 沿用槽位循环、装备查找记录实际槽位、饰品可选两个穿戴目标。 |
| `DELIVERY_G_CP1.md`（新） | 本交付说明及命名表。 |

## G-1 逐条对照

| 工单要求 | 落实情况 |
| --- | --- |
| 七系列及中文名、元素 | 已集中在 SERIES；行者元素为 null。 |
| 主要掉落关卡 | 已记录；晨辉包含 trial，行者覆盖五关。 |
| 2/4 件套文字与效果 id | 已记录六系列的原设计文字，id 为 `{series}_2`、`{series}_4`；行者为空。只存引用，不实现状态结算。 |
| 造型母题 | 已记录结构、配色与纹样的一句话。 |
| 十二款式、槽位、档位名字、武器流派 | 已实现，见下表；wtype 与 WTYPES key 一致。 |
| 308 件规则目录 | 行者十款二档，六元素系列十二款四档。 |
| 36 件传说 | 五套首领各四件，加独立十六件；旧十个名字及原部位保留。独立外观件数量存在设计冲突，处理见下文。 |
| CATALOG、defsBy | 已导出 id 字典与按 slot/series/rar/kind 筛选函数；饰品定义槽位统一 trinket。 |
| 定义字段 | 工单列出的字段全部由统一工厂写入；classReq 为 null，pvp 为 false。 |
| 可选变体 | 读取 `src/gear/gear_variants.json`；浏览器 404 / Node ENOENT 视为缺省，其他错误上抛。支持数组或 `{ variants: [...] }`，每项包含 id、variantOf、name、art；仅名字与 art 可覆盖，其他属性继承。未创建清单文件。 |
| 翅膀/光幕例外 | 定义 fixed: { atk: 10 }，imbue/set 为 null、effects 为空；实例无词条、无刻印、imbueLv 为 0；itemStats 直接返回固定攻击，不读强化或品质。 |

## G-2 逐条对照

| 工单要求 | 落实情况 |
| --- | --- |
| 十槽及 RESERVED_SLOTS | 已按指定顺序导出，class 未放入可穿槽位。 |
| 两个饰品槽 | 定义写 trinket；界面提供“穿戴至饰品一/二”；卸下按实际装备槽位执行。 |
| 五档 RARITY | 颜色、倍率、权重与设计表一致，随机词条数、刻印概率和状态强度也在同表。 |
| 统一传说判断 | 新增 isLegend；main 传说特效改用它，原保证传说的 minRar 从 3 改为 4；loot 光柱按五档并用 isLegend；旧重铸中的传说条件也仅替换判断，公式未改。 |
| makeItem(defId, ilvl, opts) | 已生成 uid/def/ilvl/enh/affix/mark/imbueLv/reforged/locked/skin；保留 newId。 |
| 槽位基础预算 | 按表计算，普通属性乘稀有度；武器流派倍率、太刀暴击照旧。内部保留小数，避免拆槽逐件取整造成总预算漂移；展示沿用 fmtStat。固定暴击和旧武器一样不乘品质倍率。 |
| 词条数量、份额、质量、80%～100% | 新生成词条按 RARITY.affixes、AFFIX_SHARE、质量系数及原池上界计算；沿用原数值显示精度。旧重铸随机公式属 G-3，未改。 |
| 刻印概率与 imbueLv | 稀有 40%、史诗 70%、传说 100%；强度分别抽 1～2、2～3、3，只记录不结算。 |
| itemStats / computeStats | 遍历十槽；翅膀/光幕只返回攻击 10，且不计套装、状态来源或刻印来源；原战斗属性公式与字段保留。 |
| setCount / imbues | 输出 setCount（套装标签→件数）和 imbues（状态 id→来源列表），来源含 slot/uid/def/lv。首领套以专属 set 标签计数。 |
| BAG_MAX 60 | 已修改。 |
| 纯函数迁移 | migrateSave 克隆输入、返回新对象，不读写全局或使用随机数；v2 不再次转换装备身份。 |
| armor/ring 迁移 | armor→chest、ring→trinket1，其余新槽为空。 |
| 旧品质与目录映射 | 普通/精良映射行者同款同档；稀有按名字关键词选最近元素系列同款同档，无法判定时选晨辉；旧 rar 3 按名字映射传说 rar 4。 |
| 旧实例字段保留 | id→uid，ilvl/enh/affix/mark/locked/reforged 保留；缺省字段补默认值；旧稀有和传说 imbueLv=1。 |
| 逐项不降与 legacyBase | 任一旧基础属性高于新预算则原样保存整个旧 base；计算时新旧逐项取大，再按原强化规则和原 affix 汇总。 |
| v2 自动加载、云入口 | newSave 为 v2；本地、云端均经 migrateSave；v1 自动转 v2，后续保存持久化为 v2。 |
| playerLook | armor→chest，外观规则保持原样；定义派生字段经兼容访问器提供。 |
| hub/hud 最小适配 | hub 原有 SLOT_KEYS 循环直接扩为十槽，无页面布局改版；补了新槽位单字与实际槽位操作。hud 没有装备槽位循环，因此未改。 |
| ▲ 和最佳掉落使用 G-4 比较 | **本次未做**：明确依赖 G-4，而用户禁止本检查点实施 G-4；保留 itemScore 和 hud 原最佳掉落选择，后续统一接 compareItem。 |

已只读查看三个 fixture：early 5 件、mid 24 件、late 44 件；确认原四槽及样本传说名字均有映射。未执行迁移测试、未声称数值验收通过，交由 G-6 和 Muse 的模块测试验证。

## 命名和结构决定

- `rules.js` 单独存可调数据；预算不散落在生成逻辑中。
- `hydrateItem` 提供不可枚举的 id/slot/rar/name/wtype/base 访问器供旧调用使用；JSON 仅保存实例字段，不重复存定义。加载经迁移入口恢复访问器。
- `makeItem` 保留旧四参数调用兼容，供尚未接入 G-3 的 randomDrop 使用；原槽位抽取比例与随机等级逻辑未动。G-3 仍须实现系列权重、合法传说来源、保底、翅膀/光幕掉落门槛和费用档等。
- 首领 set 标签为 boneking/raven/ironjaw/gravekeeper/afterimage；drop.boss 使用仓库实际 key：boneLord/nightRaven/ironJaw/warden/afterimage。
- 首领专属效果 id 为 `{set}_{kind}`，独立传说为自身定义 id；目前仅标识，不新增任何战斗实现，后续状态模块审定其含义。
- **设计冲突待终审**：16 件独立传说要求同时包含 6 翅膀+4 光幕+6 武器/饰品，但必须保留的旧 10 名含 2 头盔、2 胸甲，不能在保留原槽位时全部满足。本次优先总数 36 和旧物迁移，独立部分为旧 10 件+4 翅膀+2 光幕；未满足 6 翅膀/4 光幕的分项数量。没有另造两套装备或重映射旧防具为外观件。
- 行者仅两档，旧五等级段名字无法全部放入 20 个格子；采用旧名字表前两项，新增部位自行命名。稀有以上迁往元素系列；没有按等级另建隐藏定义。

### 款式与四档名字（待终审）

| kind | 槽位 | 流派 | 普通 | 精良 | 稀有 | 史诗 |
| --- | --- | --- | --- | --- | --- | --- |
| sword | weapon | 游刃 | 铁剑 | 钢剑 | 纹刃 | 名锋 |
| katana | weapon | 疾斩 | 打刀 | 长刀 | 月纹刀 | 天羽刀 |
| great | weapon | 崩山 | 阔剑 | 重剑 | 裂岩剑 | 镇岳剑 |
| helm | helm | — | 布头巾 | 皮盔 | 刻纹冠 | 镇魂盔 |
| chest | chest | — | 布衣 | 皮甲 | 纹鳞甲 | 御灵战衣 |
| legs | legs | — | 布裤 | 皮护腿 | 嵌纹护腿 | 镇岳腿甲 |
| boots | boots | — | 布靴 | 皮战靴 | 刻纹靴 | 逐星战靴 |
| bracers | bracers | — | 布缠 | 皮护腕 | 刻纹护腕 | 镇魂护腕 |
| ring | trinket | — | 铜戒 | 银戒 | 纹石戒 | 星辉指环 |
| amulet | trinket | — | 木符 | 铜护符 | 铭纹符 | 守誓护符 |
| wings | wings | — | 短羽 | 展翼 | 棱羽 | 天穹翼 |
| veil | veil | — | 微光 | 流辉 | 环光 | 苍穹幕 |

行者名字覆盖（普通 / 精良）：长剑 铁剑/青钢剑；太刀 打刀/霜纹太刀；巨剑 阔剑/断岩巨剑；头盔 布头巾/皮盔；胸甲 布衣/皮甲；护腿 布裤/皮护腿；战靴 布靴/皮战靴；护腕 布缠/皮护腕；戒指 铜戒/银戒；护符 木符/铜护符。

### 传说 36 件 id 与名字（待终审）

| id | 名字 | kind | 系列 | 套装/来源 |
| --- | --- | --- | --- | --- |
| lg_duanyue | 断月 | katana | frost | 独立 / trial、clear_hard |
| lg_shuangjin | 霜烬 | sword | frost | 独立 / trial、clear_hard |
| lg_wugui | 无归 | great | thorn | 独立 / trial、clear_hard |
| lg_zhulongzhiya | 烛龙之牙 | great | ember | 独立 / trial、clear_hard |
| lg_bumianzhezhiguan | 不眠者之冠 | helm | storm | 独立 / trial、clear_hard |
| lg_jinmietouguan | 烬灭头冠 | helm | ember | 独立 / trial、clear_hard |
| lg_canguangzhanyi | 残光战衣 | chest | dawn | 独立 / trial、clear_hard |
| lg_yuanhailinjia | 渊海鳞甲 | chest | frost | 独立 / trial、clear_hard |
| lg_shizhihuan | 时之环 | ring | dawn | 独立 / trial、clear_hard |
| lg_yongyezhishi | 永夜之誓 | ring | thorn | 独立 / trial、clear_hard |
| lg_binglingyu | 冰棱羽 | wings | frost | 独立 / trial、clear_hard |
| lg_jinhuoyi | 烬火翼 | wings | ember | 独立 / trial、clear_hard |
| lg_leitingyi | 雷霆翼 | wings | storm | 独立 / trial、clear_hard |
| lg_chenxiyu | 晨曦羽 | wings | dawn | 独立 / trial、clear_hard |
| lg_yongyemu | 永夜幕 | veil | thorn | 独立 / trial、clear_hard |
| lg_limingmu | 黎明幕 | veil | dawn | 独立 / trial、clear_hard |

## node --check

以下 11 个 JS 文件逐一执行 `node --check <文件>`，全部退出码 0，无语法错误：

- src/gear/series.js
- src/gear/kinds.js
- src/gear/rules.js
- src/gear/catalog.js
- src/gear/migrate.js
- src/items.js
- src/progression.js（最后调整刻印来源过滤后再次通过）
- src/save.js
- src/main.js
- src/loot.js
- src/hub.js

这仅代表语法检查通过；浏览器表现、模块加载、迁移不降、目录计数及完整回归均未运行，按工单留给后续统一验收。
