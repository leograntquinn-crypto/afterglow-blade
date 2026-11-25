# Fable 5.2 交接简报：《残光之刃》3D 化优化

> 致接手的 Fable 5.2：你接手的是一个已经跑通「可玩 3D 版」的 Godot 项目，任务是把它从「技术验证能玩」优化成「像一款真正的 3D 商业游戏」。本文是唯一入口：代码在哪、现状如何、3D 模型是怎么做出来的、哪些铁律不能碰、你第一步交付什么。看完先交阶段 0 审计与路线图，经 Muse 核验后再逐阶段施工。
>
> 项目负责人：Quinn（拍板人）。统筹/核验/落盘：Muse。你的产出经 Muse 核验才算数；不要自己对外发布、不要自己点任何付费/迁移/绑手机操作。

---

## 1. 代码在哪里

| 项 | 值 |
|---|---|
| 引擎 | Godot 4.7.2（工程 `config_version=5`，不要用其他大版本打开） |
| GitHub | `leograntquinn-crypto/afterglow-blade`（公开仓库） |
| 主线分支 | **`godot`**（3D 主线，只在这条分支干活；`main` 是已冻结的网页版，禁止改动） |
| 当前 HEAD | `b25affe`「S1 clips completed to 12」（2026-11-12） |
| Muse 侧工作副本 | `~/workspace/afterglow-godot/`（在 Muse 的 VM 上；你在 Mac 的 Cursor 里工作时，先把仓库 clone 到 Mac 本地并切到 `godot` 分支） |
| 主场景 | `scenes/play3d.tscn`（`project.godot` 已指向它） |
| 导出预设 | `export_presets.cfg`：macOS → `export/AfterglowBlade.app`；Windows → `export/AfterglowBlade.exe`（均未签名，macOS 需右键打开） |

### 工程结构（只列要紧的）

```
afterglow-godot/
├─ project.godot            # 主场景 = play3d；窗口 960×540
├─ scenes/
│  ├─ play3d.tscn           # ★ 可玩主场景（三波制）
│  ├─ combat3d.tscn         # 战斗验证场景（--verify 的宿主，不要改坏）
│  ├─ arena3d.tscn          # 竞技场基类场景
│  ├─ model_view.tscn       # 模型转台质检工具
│  └─ stage1.tscn           # 已退役的 2D 主场景（存档，勿删勿改）
├─ scripts/
│  ├─ play3d.gd             # ★ 玩法流程层：波次 3/4/5、波次 HUD、胜负结算、R 重开、镜头默认
│  ├─ combat3d.gd           # 战斗宿主：竞技场/HUD/相机/顿帧/震屏/自动战斗驱动（play3d 的父类）
│  ├─ arena3d.gd            # 竞技场搭建（地面/柱/墙/火把/雾/月光，程序搭建的灰盒）
│  ├─ player3d.gd           # ★ 玩家：帧数据战斗、动画接线、根运动钉帧（_pin_root）
│  ├─ enemy3d.gd            # 敌人 AI（地面杂兵，盒子代理身体 + 自带血条）
│  └─ （player.gd/grunt.gd/atlas_anim.gd 是 2D 旧线，勿动）
├─ art/models/              # 游戏内模型（见 §4 资产清单）
└─ docs/                    # 工单与报告（含本文）
```

### 运行与验收（动手前先跑通这三条）

```bash
# 1) 无头导入（新克隆/新资产后必跑）
godot --headless --path . --import
# 2) 帧数据回归（必须输出 VERIFY PASS，伤害序列 12/12/16）——红线，改任何战斗相关代码后必跑
godot --headless --path . scenes/combat3d.tscn -- --verify
# 3) 自动通关（自动战斗 + 无敌，跑完三波应打印 PLAY VICTORY 并以 0 退出）
godot --path . scenes/play3d.tscn -- --demo --god
#    带 --capture 会在 2/6/12/20 秒截帧到 play_1..4.png
```

手动操作：WASD 移动（相机相对）、J 攻击、Space 跳跃、鼠标左键拖拽环绕、滚轮缩放（4–16m）、R 重开。

---

## 2. 这个游戏是什么

《残光之刃》/ AFTERGLOW BLADE：斜俯视实时 3D 动作 RPG，目标是 **Steam 商业发售**（不是做个 demo 交差，质量按商业标准）。5 个关卡；主角绯隼；有完整的成长/装备/技能系统设计（数据层已从网页版移植：装备 346 件、状态与反应、掉落与存档模块，见 `docs/TICKET_c2_dataport.md` 与 DATA CHECK 记录）。

**设计铁律（Quinn 定版，违反任何一条 = 返工）：**
- 「我们不是卖数值的」：不卖数值、装备不能靠付费变强；装备/皮肤是同一套系统，差异在手感与机制，不在数值碾压。
- 属性成长来自装备（含攻速，主要靠武器/词缀）；技能点服务技能，技能有上限；不做刷数值的角色属性点成长。
- Boss 难度随玩家战力动态 +10%~50%；PVP 双方开局等战力、局内渐进成长（后期系统，本阶段不做）。
- **Item 14 永久规则**：游戏内一切特效必须是成品美术资产，禁止程序绘制的占位特效出货（当前 play3d 里的白色扇形斩击弧就是占位，必须换成美术资产）。
- 角色待机必须呼吸（~3.8s 周期，脚锚定、躯干起伏）；所有翅膀必须 2–3 段关节相位滞后地活扇，禁止整板僵扇。
- 翅膀按稀有度分模型与尺寸：r2 一对 → r3 四翼 → 传奇六翼，逐级变大；传奇装备保持独特造型。

---

## 3. 当前状态（2026-11-25 盘点，照实）

**已完成并验证：**
- 可玩 v1：三波敌人（3/4/5）+ 波次 HUD + 胜利（肃清+用时）/败北结算 + R 重开；自动通关实测 VICTORY 64.8s；`--verify` PASS。
- 主角 S1 已入场：300,000 面、58 骨重涂骨架、**12 段动画**（idle/walk/run/attack2/hit/hit2/death/jump/jump_down/cast/dive/relax）。
- 烬翼（飞行敌人）模型完成：80k 面、85 骨、5 段 Blender 自制动画，已入库 `art/models/jinyi.glb`——**但它的飞行 AI 还没接**（enemy3d 只有地面逻辑）。
- 数据层移植完成（装备/状态/掉落/存档，逐条对账 MATCH）。

**在制未入库（在 Muse 的 VM 上，不在 git 里，接手时向 Muse 索取或走 Drive）：**
- 绯隼服装成品：`art/models/feisun_outfit1.glb`（减面版 66MB）与 `feisun_outfit1_full.glb`（全精度版 250MB）——已组装验收，但**还没换进游戏**（游戏里现在跑的还是素体 S1）。装配源文件在 `~/workspace/feisun_outfit/`（assemble_stageA–F.blend）。
- 头发定版：tcand2 切分版 + bow2 蝴蝶结已交付（Drive 有 GLB），等后续装配阶段并入。

**明确的缺口（你的优化清单起点）：**
1. **attack1（第一段劈砍 slash）仍缺真实动画段**：Tripo 全量导出里也没这段，`player3d.gd` 里如实留空（禁止拿 attack2 别名冒充——这是定版纪律）。第一下挥砍目前无角色动作，伤害/帧数据正常。
2. **场景还是灰盒试验场**：arena3d 程序搭的地面/柱子/火把，无地形、无 PBR 材质层、无高度雾体系。目标规格已写好：`files/GUIZANG_ABSORPTION_SPEC.md` 的 C 节「场景 v5」（地形、四层 PBR+雪公式、五层雾参数、道具密度、光照色调、镜头规则，验收点 P1–P7 带数字线）——第一关定为雪原。
3. **敌人还是盒子代理**：enemy3d 身体是深色金属盒+红眼+剑的程序代理，没有真模型；腐骨兵等敌人模型未生产。
4. **镜头未达定版参数**：现为俯角 ~40°/距离 11m/FOV 50；定版目标 45°/16m/FOV 38/牵绳 3.5m/遮挡淡出 + 一键回正（回正键未做，遮挡淡出未做——现在角色会被柱子挡住）。
5. **战斗增量未做**：格挡/弹反/反击（Quinn 拍板全做）、攻击磁吸、逐角色顿帧（现为全局顿帧且会吞输入）、玩家与敌人无碰撞（mask 都不互碰，会穿身）——数值规格在 GUIZANG_ABSORPTION_SPEC 的 D 节（12 项按价值/成本排序，带帧级数字）。
6. **弹簧骨未做**：马尾/腰布的运行时弹簧模拟（Godot 内 verlet+spring，固定 60Hz）已定版方案，未实现；现动画里的头发是烘焙的。
7. **walk/run 根运动靠 _pin_root 钉帧原地化**：run 片段自身节奏 ≈2.3m/s 与代码移速 4.2m/s 不一致，可能滑步，手感待 Quinn 实机判，不要擅自改帧数据去迁就。

---

## 4. 3D 模型是怎么做出来的（完整管线，必须照此生产）

> 权威文档：`~/workspace/goals/afterglow-blade-remaining-enemy-packs-and-development/files/CHARACTER_3D_PIPELINE.md`（下称「管线定版」）与技能 `character_3d_pipeline`。本节是操作摘要，与定版冲突时以定版为准、先问 Muse。

### 4.1 平台分工
- **Tripo（主力）**：走**国际站** studio.tripo3d.com / tripo3d.ai（Quinn 2026-11-12 拍板，此后一律国际站；国际站认专业版，余额两站共享）。账号 jasperblasl70（Outlook），专业版到期 **2026-12-11**。计费参考：HD 生成 50 积分、多视图、绑骨 20、预置动画免费、导出免费。**积分不是约束**（Quinn 定版：「不要怕消耗积分，质量优先，该多生成候选就多生成」），但每笔花销要记账汇报。
- **红线**：不点账号迁移（migrate）、不绑手机号、不充值/改套餐——这些只能 Quinn 本人决定。
- **Blender 是唯一装配权威**（Muse 侧 Blender 4.2.3 无头；Quinn 的 Mac 上是 Blender 5.3 + 官方 Blender Lab MCP）。平台产出只作原料，永远不直接当成品。
- **Rodin/Hyper3D**：备选身份母版生成器，由 Quinn 本人操作，你不要接管。

### 4.2 单件生产流程（步步有门，顺序不许跳）
1. **设定冻结**：先有设定图（正/侧/背 + 色板；背面不靠猜）。角色身份以已出货美术为准（绯隼见 §5）。
2. **整只生成**：Tripo 图生 3D **整只生成**（连人带衣一体）。**严禁**把头发、衣服等部件单独生成再往身上套——部件一律「整只生成后原位切分」。
3. **先导出母版**：任何加工（绑骨/减面/重拓扑）都会原地覆盖资产——生成后**第一件事导出高模母版 GLB 存档**，再做任何加工。
4. **绑骨**：Tripo 类人自动绑骨（骨架可用：S1 是 58 骨标准层级 + 完整手指链）。
5. **权重必重涂（血泪铁律）**：Tripo 导出的权重**一律不可信**（人形、动物同病：权重和 <1e-6、大部分顶点被根骨支配、骨头转了模型纹丝不动）。标准修法：保留骨架，用距离衰减法重涂（最近 4 段骨、w=1/(d²+ε)、排除 BoneRoot/面部骨/扭转骨）。
6. **三验（缺一不算过）**：① 权重普查（逐骨主导顶点数 + 权重和分布）；② 杠杆扫描（逐骨旋转 0.6 rad 测探针位移）；③ 姿势与**全动画**渲染验收——含正脸特写、**双手特写帧**（gen4 曾在减面时丢掉整只左手，这是为它设的门）。静态单姿验收不算数。验收只认 Blender 自渲图，平台预览不算。
7. **减面**：只许 Decimate-Collapse 且**保留原 UV**。主角 30 万面（S1 现行）、敌人 6–10 万、Boss 15–25 万。减面后复验双手顶点普查（5cm 内顶点数与减面前成比例存活）。
8. **动画**：Tripo 预置动画免费，应用后导出带动画 GLB；动画按**骨名迁移**到重涂骨架（源/目标骨名一致才可直迁，迁移后逐段与源曲线核对）。游戏内片段名固定：`idle / walk / run / attack1 / attack2 / hit / hit2 / death / jump / jump_down / cast / dive / relax`。源名映射示例：chop→attack2、hit_to_body_01→hit、defeat_02→death、slash→attack1。
9. **服装做法（五步定版）**：设计图（S1 本人穿定版造型、A 姿）→ Tripo 整只图生（连人带衣）→ 导出母版 → Blender **沿颈线原位切分**：头与头发永远用 S1 母版，只取颈线以下服装段（颈围偏差 ≤8mm 才许装）→ 服装段挂回已验骨架、重涂权重、三验、12 段全动画验收。
10. **入游戏**：GLB 放 `art/models/`，`player3d.gd` 的 `model_path` 指向它（默认 gen4 是给 --verify 用的参照，不要改默认值）；模型按 AABB 自动归一到 1.7m；根运动由 `_pin_root` 钉 Hips 的 x/z 处理，动画片段自带的位移不要在代码里再叠加。
11. **存档**：成品资产（母版 GLB、组装成品、参考图包）全部上传 Google Drive（文件名可搜）+ 本地留档；已验收发布的资产包**不重复上传、不覆盖**。

### 4.3 已知坑（每条都是实测换来的）
- Tripo 页面统计不可信（面数能报 316 实测 22,359），一切以 Blender 实测为准。
- 两站（国内/国际）的绑骨与动画状态**不互通**；同一资产只在一边处理到底。
- 减面是丢手高发环节：没有双手特写验收，不许宣布减面完成。
- Blender 无头脚本：导出蒙皮 GLB 用 `export_skins=True, export_apply=False, export_rest_position_armature=True, export_animation_mode="ACTIONS"`；姿势骨导入默认四元数，先设 `rotation_mode="XYZ"`；写关键帧前先 `scene.frame_set(f)` 再设值。
- Godot 侧：ALSA 音频报错无害；截帧验收用 Xvfb + `--rendering-driver opengl3`（无头驱动渲不出画面）。

---

## 5. 绯隼身份（不许改）

银白单马尾（黑蝴蝶结 + 红飘带）、蓝眼、白短外套罩深色内搭、红腰布、深色长裤、黑高筒靴带银星饰、单刃长剑挂左胯。素体 S1 是「只有内衣的素体」，是刻意的基底层，不代表最终造型。任何写「黑发/无袖/袴」的文本都是错的。主角现行母版：`feisun_outfit/feisun_outfit1_master.glb`（在 feisun_outfit 工作区）+ S1 素体母版（`~/workspace/feisun_parts/feisun_base_s1_repaint.blend/.glb`）。

## 6. 战斗数值（帧数据，不许动）

- 三连斩伤害 **12 / 12 / 16**；攻击总帧 22、命中帧第 6 帧、攻击距离 2.1m、扇形半角 70°。
- 敌人：HP 60、伤害 8；防连晕链（4 连轻击→80 帧挣脱，重击必打断）。
- 顿帧与震屏已实现（全局版，逐角色化是优化项，见缺口 5）。
- 改任何战斗代码后：`--verify` 必须 PASS 且伤害序列不变。

## 7. 工作纪律

- **质量优先、不图快**（Quinn 铁律）：慢工细活，做细致做精准；除非 Quinn 明说赶进度。
- **不许淡化残项**：汇报缺陷禁用「极小/微撕/一线」这类词，附截图与坐标，照实说。
- **交付要落盘**：你的产出必须是文件（代码/文档/GLB），不是聊天里的描述；Cursor 里写完要确认文件真的落盘（有过 Write 只进变更集没落盘的事故）。
- **分支纪律**：在 `godot` 分支工作；大改动先开工单式说明（目标/做法/验收标准）给 Muse 核验再施工；不要动 `main`、不要动 2D 旧线文件、不要删存档。
- **图片给 Quinn 看**：Quinn 的聊天客户端看不到图片附件——关键验收图走「图空间」+ Google Drive + Mac 本地文件夹，并在消息里写明文件名（这条由 Muse 执行，你把图文件和文件名清单交 Muse 即可）。
- 费用/积分：花销逐步记账汇报；订阅、充值、实名、账号迁移永远等 Quinn 拍板。

## 8. 你的第一阶段任务（阶段 0，只做这一件）

通读本文 + 管线定版 + GUIZANG_ABSORPTION_SPEC，打开工程跑通 §1 的三条验收命令，然后交付一份**《3D 化优化路线图》**文档（落盘为文件），内容：

1. 现状审计：逐项核对 §3 的完成/缺口清单与代码实际是否一致（不一致处列证据）；
2. 优化排序：把缺口 1–7 排成施工顺序，每项写清做法、依赖、验收标准（数字线）、预估风险；特别说明哪些项你能独立完成、哪些需要 Tripo/Blender 资产生产配合（资产生产由 Muse 侧管线执行，你出规格）；
3. 第一件施工项的详细方案（建议从「镜头定版参数 + 遮挡淡出 + 一键回正」或「场景 v5 第一包」二选一，给出理由）。

路线图经 Quinn/Muse 拍板后，再逐项施工：每项 = 施工 → 自测（--verify + --demo --god + 截帧）→ 交 Muse 核验 → 入库。

## 9. 关键文档索引

| 文档 | 路径 |
|---|---|
| 3D 角色管线定版 | 仓库内 `docs/CHARACTER_3D_PIPELINE.md`（原件在 Muse 侧 goal files，同名） |
| guizang 吸收规格 v2（场景 v5 + 战斗增量） | 仓库内 `docs/GUIZANG_ABSORPTION_SPEC.md` |
| Godot 迁移计划 | 同上目录 `GODOT_MIGRATION_PLAN.md` |
| Tripo M0 实测报告 | 同上目录 `TRIPO_M0_REPORT.md` |
| S1 工作区（母版/验收图/脚本） | `~/workspace/feisun_s1_work/`、`~/workspace/feisun_parts/` |
| 服装装配工作区 | `~/workspace/feisun_outfit/` |
| 试玩清单（只有 Quinn 能填） | goal files `v37-playtest-checklist.md`（手感类结论永远等 Quinn 本人，不要用自动观察代替） |

—— Muse 统筹，2026-11-25
