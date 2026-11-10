# 工单 C2：装备/状态/掉落数据层移植 + 存档系统

背景：全 3D Godot 版要接过网页版的全部系统数据。网页版源码在 `~/workspace/afterglow-blade/`
（src/gear/catalog.js、kinds.js、rules.js、statuses 相关文件、save 相关文件——先通读再动手）。
本工单只做**数据层**：把数据变成 Godot 可直接 load 的 JSON + 一个存档模块，不做 UI。

## 交付物（新建文件，不改已有场景脚本）

1. `tools/port_gear_data.py` — 转换器：读网页版源码（或用 node 跑网页版模块导出真值——优先后者，
   避免手抄规则出错），产出下面三份 JSON。脚本要可重复运行、幂等。
2. `data/gear_catalog.json` — 全部装备定义：id、kind、series、rar、名称、基础数值、词条池、
   固定属性（翅膀/光幕 fixed atk +10 的规则必须体现在数据里）。
3. `data/statuses.json` — 14 状态 + 7 反应（含相互作用矩阵）。
4. `data/drop_rules.json` — 掉落规则：稀有度权重 58/27/10/4/1、保底 pityMisses=8、
   Boss 传说 30% 走全池、高稀有（rar≥3）未拥有优先（防重复）、背包满自动出售策略参数
   （卖背包内严格更低稀有度的最差一件、传说永不自动卖）。
5. `scripts/save_game.gd` — 存档模块（class_name SaveGame）：user://afterglow_save.json 读写，
   字段镜像网页版 save 形状（equip/bag/gearSeen/等级/残光等核心字段），带 version 号与
   坏档保护（解析失败时备份坏档并返回默认档，不许崩溃）。
6. `docs/DATA_PORT_REPORT.md` — 移植报告：三份 JSON 的条目数、与网页版真值的对账方法与结果、字段映射表、未移植项清单。
7. 不要执行 git 操作。

## 验收标准

1. **对账**：gear_catalog 条目数 = **346**（普通 310 + 传说 36），id 集合与网页版逐一比对零差异
   （报告里写明比对方法与结果，例如 node 导出网页 id 列表 diff）。statuses = 14 状态 + 7 反应。
2. 翅膀/光幕类条目带 fixed atk 10 且无 imbue/set/effects 字段（网页版规则）。
3. Godot 无头自检：写一个 `--check-data` 入口（可用一个小场景或 -s 脚本）加载三份 JSON 并断言
   条目数与关键字段，打印 `DATA CHECK PASS`。
4. save_game.gd 无头自检：写入→读回→字段一致；喂一个损坏 JSON 时不崩溃且走默认档，
   打印 `SAVE CHECK PASS`。
5. 转换器重跑一次，JSON 无 diff（幂等）。
