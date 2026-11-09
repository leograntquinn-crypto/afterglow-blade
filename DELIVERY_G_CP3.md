# 装备数据模块 · 检查点 3 交付

基于 `gear-data-cp1`，延续 CP1/CP2，仅实现 G-5、G-6。未修改 G-1～G-4 的目录、预算、掉落、养成、比较、迁移和战斗结算逻辑；未修改旧测试；未 commit / push。源素材只读，未下载或改动。

## G-5 逐条对照

| 要求 | 落实 |
| --- | --- |
| `tools/build_gear.py --icons <目录…>` | 新建 Python/Pillow 本地脚本，实际读取已备好的 a/b/c 三包。支持一个或多个目录，合并后校验。 |
| 校验 `gear.json` 与第八节第2条接口 | 校验 schema、items、必需字段、id合法字符/命名/唯一性、kind与slot映射、七系列、五档整数稀有度、名字、lore类型；拒绝接口以外字段，防止素材写入数值/效果/套装；校验 icon 路径与文件、portrait/battle 可空引用及对应id路径；身体/武器变体必须带立绘、variantOf须指向同格保底件；检查308个保底格齐全。图片解码检查256×256、alpha通道与透明像素；检查五张底板齐全、重复底板一致。 |
| 校验失败报错退出，不覆盖已有图集 | 全量校验和临时目录编码成功后才复制产物；失败输出 `GEAR BUILD ERROR`、退出1。已实际验证坏schema、缺必需字段、kind/slot错误、缺图标四种失败路径，26个已有产物逐文件SHA-256均不变。 |
| 桌面128、手机64一格，按系列分页，每页≤2048² | 七系列分别分页；每页最多16×16格。桌面最大2048×384，手机最大1024×192。未混入其他系列或进行装备染色。 |
| 底板单独5张 | 每种分辨率独立输出r0～r4五张WebP，不烘焙进装备图标，显示时先底板后图标。 |
| 参照fx图集存放/载入 | 产物置于 `assets/fx/`；同用 `sprite.js` 的 MOBILE 判定与WebP+JSON清单方式，单独导出 `GEAR_ART`。 |
| 只在打开角色页/背包时载入 | 仅 `Hub.render_hero()` 发起load；背包位于该页。启动、其他标签页、拾取绘制都不发起load。成功后仅在角色页仍打开且非战斗时重绘。失败保留单字，下次打开可重试。 |
| 离开关卡不释放，进关卡释放 | 关闭菜单或回地图不释放；统一在 `setScene('play')` 释放，涵盖关卡、训练、试炼。递增generation，使旧异步请求无法回填；清空Image/清单引用，并将隐藏DOM图集元素替回单字，避免隐藏页面继续持有图集引用。 |
| hub槽位/背包/拾取提示用底板+图标，未就绪退回单字 | 槽位和背包在既有glyph内换内容，详情/铭刻沿用同一显示函数；拾取toast附带装备实例，Canvas先底板后图标，不可用则单字。未增加页面分区或改布局/CSS。 |

说明：拾取发生在关卡中，此时遵照生命周期已经释放图集，因此正常战斗拾取提示显示单字。绘制函数仍支持已就绪时的底板+图标，但不会为拾取临时载图。素材只有308个保底件，没有36件传说图标；传说会按缺图回退，未借用其他装备图标冒充。

## G-6 九条对照

`tests/gearmodeltest.js` 已注册至 `tests/run_all.js`，超时600秒；沿用仓库测试驱动的CommonJS/Playwright方式，生产代码仍是原生ES模块。最后一行严格为 `GEARMODELTEST ok` 或 `GEARMODELTEST FAIL n`，失败非零退出；异常也进入汇总。

| 条目 | 落实 |
| --- | --- |
| 1 目录 | 独立枚举七系列×款式×档位每个保底格；308+36、非变体总344、id唯一/合法、完整字段、art接口、classReq/pvp逐件断言。 |
| 2 翅膀/光幕 | 每档40件、交替两槽，共200件；附带enh10检查itemStats恰好{atk:10}，词条/刻印/状态为空、不计setCount；canImprove/enhRate/reforgeAffix/inheritCost检查不可强化、重铸、传承。 |
| 3 预算 | L=1/10/20/30、五档逐一检查七个非武器成长槽；atk/def/hp/crit分别与设计稿旧三件总预算比较，容差±1；不用总战力代替基础预算。 |
| 4 迁移 | 读取三份真实fixture；件数、逐件逐属性不降、旧传说升rar4、字段保留、输入不变、幂等、armor/ring槽迁移；通过真实SaveStore本地入口检查自动迁移，finally恢复localStorage。 |
| 5 标定 | LCG固定种子20261109；相差一档4组、相差两档3组，每组10000对，共70000对；轮换全部成长款式和1/10/20/30等级，同强化；只装备被比较的一件，避免套装/搭配。以better/much计低档胜，分别≤500/≤100。 |
| 6 比较口径 | 精良+8对史诗+0、反向史诗+8对精良+0；检查enhAs、结论、原实例不变；候选改成同强化后收益完全一致，三段相加等于total。固定该用例词条/刻印为空，以隔离强化因素。 |
| 7 推荐不读总战力 | fetch真实compare源码，隔离Blob模块临时注入错误power（在已增强的atk上再次乘+8强化因子），验证两个方向结论不变；同时污染界面g.stats.atk至1e12，真实compare结论仍不变。生产power/compare文件均不改，Blob和全局临时值均恢复。 |
| 8 REF_POWER | 测试驱动以只读模式执行真实 `tools/refpower.js`；要求脚本退出成功且31/31逐项一致，不复制REF_POWER常量作伪验证，不使用--write。 |
| 9 页面与汇总 | 桌面/触屏手机上下文分别检查启动不请求图集、打开后正确分辨率清单、背包/槽位图标、详情、饰品选槽、关菜单保留、进关卡释放、缺图回退、在途载入释放防回填；收集pageerror与console.error，最后统一汇总。 |

第7条的错误power是一个具体的重复计入强化回归用例，不宣称对任意改写战力函数都能保持结论。它验证的结论不变针对工单第6条的两个确定性场景。

**执行边界**：本轮只编写并语法检查G-6，没有运行Playwright、`tests/run_all.js`、浏览器截图、浸泡或监听服务器，也没有声称 `GEARMODELTEST ok`。九条测试与全模块实际通过情况由Muse在“模块测试”阶段统一执行；旧测试适配同属该阶段。

## 文件清单

| 文件 | 作用 |
| --- | --- |
| `tools/build_gear.py` | 新增：E1接口校验、分系列双分辨率图集构建。 |
| `src/gear/art.js` | 新增：GEAR_ART延迟载入/释放、异步代次、HTML/Canvas底板图标显示。 |
| `src/hub.js` | 修改：角色页载入触发、既有glyph内容替换，详情共用图标。 |
| `src/main.js` | 修改：进play释放、拾取toast附带item；未改掉落与战斗计算。 |
| `src/hud.js` | 修改：拾取toast图标及单字回退。 |
| `tests/gearmodeltest.js` | 新增：九条确定性/页面测试与汇总。 |
| `tests/run_all.js` | 修改：仅增加gearmodeltest注册项。 |
| `assets/fx/gear_icons.json`、`gear_icons_m.json` | 新增：桌面/手机索引，各308条图标、7页引用、5底板引用。 |
| `assets/fx/gear_icons_{wayfarer,frost,ember,storm,blight,thorn,dawn}_0.webp`及各自`_0_m.webp` | 新增：14张系列图集。 |
| `assets/fx/gear_frame_r{0,1,2,3,4}.webp`及各自`_m.webp` | 新增：10张双分辨率底板。 |
| `DELIVERY_G_CP3.md` | 本交付记录。 |

图像/索引产物共26个文件，约4.6MB（含两种分辨率）。未引入依赖下载，Python使用环境已有Pillow。

## 构建实际运行与检查结果

运行命令：

```sh
python3 tools/build_gear.py --icons /home/hatch/workspace/gear_icons_src/a /home/hatch/workspace/gear_icons_src/b /home/hatch/workspace/gear_icons_src/c
```

校验与编码成功，退出0，无错误；收紧接口校验后再次实际运行成功。

| 系列 | 图标数 | 桌面尺寸（格128） | 手机尺寸（格64） |
| --- | ---: | --- | --- |
| wayfarer | 20 | 2048×256 | 1024×128 |
| frost | 48 | 2048×384 | 1024×192 |
| ember | 48 | 2048×384 | 1024×192 |
| storm | 48 | 2048×384 | 1024×192 |
| blight | 48 | 2048×384 | 1024×192 |
| thorn | 48 | 2048×384 | 1024×192 |
| dawn | 48 | 2048×384 | 1024×192 |

末行：`GEAR BUILD ok: 308 icons, 5 frames; desktop=128, mobile=64`。底板各为128²/64²。

负例均在 `/tmp` 临时构造清单，素材引用只读；坏schema、缺portrait字段、sword挂boots槽、图标文件不存在均退出1，并验证所有26个已有产物SHA-256保持不变。未改动源a/b/c。

`node --check`：art.js、hub.js、main.js、hud.js、gearmodeltest.js、run_all.js全部通过；`git diff --check`通过。这些不等同于模型数值和浏览器验收通过。

## 自定命名与结构决定

- 使用独立 `GEAR_ART`，不把装备包加入启动即载入的FX_ART队列；路径仍遵循fx惯例。
- 索引schema为 `afterglow.gearatlas.v1`；`items[id]=[页号,x,y]`，统一cell，pages记file/width/height，frames记稀有度到独立文件。分页命名 `gear_icons_{series}_{page}[_m]`，手机页号与桌面一致。
- 界面以目录的 `art.icon` 查图，素材名字/lore不覆盖目录名和玩法定义；本包没有变体，因此不生成/修改gear_variants.json。
- HTML用双层CSS背景（图标、底板）复用整页图集；Canvas用同一索引裁切。显示尺寸继承既有glyph字体尺寸，不改页面布局。
- `generation`同时保护载入后回填与finally清理；释放后允许立即发起新代次载入，旧请求无法清空新loading或重新挂回图像。
- toast新增可选item参数，其他系统toast仍走原有文本路径。战斗内不为图标发请求。

## 与旧测试的冲突点（逐条静态核对，旧文件均未修改）

1. `tests/gear.js:15`：直接把旧戒指写进 `s.equip.ring`。新模型只遍历trinket1/trinket2，这个字段不算穿戴，详情不会以它为传承来源。第33行仍从 `equip.ring.enh` 读传承后的旧件，检查对象也错误。应由Muse统一选择一个真实饰品槽，保留“传承后新件获得强化、旧件归零”的检查含义。
2. `tests/gear.js:16`：`makeItem('ring',14,3)` 的旧语义是传说；新rar3为史诗，传说为4。旧三词条/必带刻印的品质假设随之失效，且这里继续手工设置mark=air；工厂旧签名可用不代表品质含义未变。
3. `tests/coretest.js:24`：把 `makeItem('ring',5,3)` 计为legend。新模型该样本是史诗，刻印概率70%，不是传说必带；稀有rar2的40%含义不变。终审应保留“稀有概率/传说必带”原检查意图，另覆盖史诗。
4. `tests/coretest.js:28,44`：在 `equip.ring` 上注入/清空刻印，期待computeStats读取。新模型忽略此槽，导致原本的刻印战斗用例没有装备上对应刻印；应迁到真实饰品槽，不改刻印触发含义。
5. `tests/contracttest.js:61`：未发现直接访问旧equip.ring/armor或四槽数量的冲突；`makeItem('ring',5,2)` 是保留的旧签名，生成新trinket定义，rar2仍为稀有。本测试的铭刻、消耗和委托检查本身不需因槽位数机械改写；动态战斗结果需模块测试核验。
6. `tests/countertest.js:12`：只替换weapon，通过保留的旧工厂签名生成精良指定流派；weapon槽和流派语义不变，未发现四槽硬编码。第33/48行的enemy/boss.armor是敌人霸体，和旧装备armor槽无关，不应误改。原数值输出可能受新整套预算/REF_POWER影响，需Muse实跑评估，不能据静态阅读声称失败。
7. `tests/gear.js` 的 `makeItem('armor',...)`、上述测试的 `makeItem('ring',...)` 旧参数本身仍受兼容分支支持，不能与“直接访问equip.armor/ring”混为一个冲突；这些调用并非都需要改。上述四个旧脚本均未发现itemScore或旧REF_POWER常量的直接引用。

## 其他留待终审裁定的点

1. **素材缺传说图标**：提供的三包恰好是E1规定的308保底件。36件传说无可接入图标，本次按约定回退单字；后续补素材时重跑构建即可，未生成假图标。
2. **拾取显示与释放约束**：按“关卡里不载图、进关卡释放”严格实施，因此战斗拾取显示单字。若终审要求战斗拾取也必须有图标，需要另定可常驻的小型拾取图集等资源约束；本次未擅自保留图集。
3. **美术终审**：自动检查能验证接口、分辨率、alpha，无法证明主体留白、灰度造型差异、光源与原创性；本次不修改既备素材，人工美术验收仍由终审完成。
4. **G-1～G-4**：本轮静态阅读未为旧逻辑作修复。CP1/CP2已记录的独立传说构成、掉落新槽份额、保底粒度、通关奖励件数、未来搭配/状态与REF标定口径仍待原终审；本轮不重新裁定。
5. **测试结果待Muse**：70000对模拟的胜率、三个fixture不降、错误power用例、页面资源错误和手机版视觉均未实际执行；若G-6暴露G-1～G-4问题，应汇总后由模块测试阶段处理，不能通过放宽断言或修改旧逻辑冒充通过。
