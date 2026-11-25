# 《3D 化优化路线图》

> 项目：《残光之刃》/ AFTERGLOW BLADE（Godot 4.7.2，分支 `godot`）
> 阶段：阶段 0（阶段 0 只做审计与路线图交付，不开始施工，不改任何代码）
> 产出形式：落盘文件 `docs/3D_ROADMAP.md`
> 编写依据：`docs/FABLE_3D_HANDOFF.md`（交接简报）、`docs/CHARACTER_3D_PIPELINE.md`（管线定版）、`docs/GUIZANG_ABSORPTION_SPEC.md`（吸收规格 v2）

---

## 0. 阶段 0 验收结果（已跑通，不作为施工内容）

### 0.1 三条验收命令执行记录

| # | 命令 | 预期 | 实际结果 | 备注 |
|---|------|------|----------|------|
| 1 | `godot --headless --path . --import` | 资产无报错导入 | 通过（23 步资产扫描+导入全绿） | — |
| 2 | `godot --headless --path . scenes/combat3d.tscn -- --verify` | 输出 `VERIFY PASS`，伤害序列 12/12/16 | **VERIFY PASS**；三段伤害 12/12/16，四连轻击触发 80 帧挣脱，重击打断霸体，死亡进入 `down` | 帧数据红线未动 |
| 3 | `godot --path . scenes/play3d.tscn -- --demo --god` | 打印 `PLAY VICTORY` 并以 0 退出 | **PLAY VICTORY time=64.77s**（简报称 64.8s，一致） | 三波 3/4/5 全清 |

### 0.2 等效验证方式说明（本机差异）

本机 Mac 未安装 `godot` 命令行，也未安装 Godot 4.7.2 编辑器。实际使用 `~/Downloads/Godot.app`（**Godot 4.6.stable.official**，非 4.7.2）的头less/窗口等效方式跑通上述三条命令。项目 `config_version=5` 与 Godot 4.6/4.7 兼容，验证结论适用；**报告中注明此版本差异，待 4.7.2 环境可用时再复核一次**。

### 0.3 铁律遵守声明

- 帧数据 **12/12/16 不许动**；任何战斗相关代码改动后必跑 `--verify` 且伤害序列不变。
- **不动 `main` 分支**；不动 2D 旧线文件 `scripts/player.gd`、`grunt.gd`、`atlas_anim.gd`、`scenes/stage1.tscn`。
- 在 `godot` 分支工作；大改动先开工单说明（目标/做法/验收标准）给 Muse 核验后再施工。
- 产出必须是落盘文件，不只留在对话里。

---

## 1. 现状审计 —— §3 清单与代码实际逐项核对

以下对照简报 §3「当前状态（2026-11-25 盘点）」，逐项核对完成/缺口清单与代码实际是否一致；不一致处附代码证据（文件:行，引用关键片段）。

### 1.1 已完成并验证项（§3 第一段）

| §3 项 | 代码实际 | 一致性 | 证据 |
|-------|----------|--------|------|
| 可玩 v1：三波敌人（3/4/5）+ 波次 HUD + 胜负结算 + R 重开；自动通关 64.8s；`--verify` PASS | `scripts/play3d.gd` 实现三波制（`WAVE_COUNTS=[3,4,5]`、`_start_wave`、`_flow` 状态机、胜负结算、`KEY_R` 重开）；`--demo --god` 自动通关 | **一致** | `scripts/play3d.gd:27-60`；验收命令 3 输出 `PLAY VICTORY time=64.77s` |
| 主角 S1：300k 面、58 骨重涂骨架、12 段动画（idle/walk/run/attack2/hit/hit2/death/jump/jump_down/cast/dive/relax） | `play3d.gd` `_setup_animation` 遍历 `anim_player.get_animation_list()`；实际动画列表为 `["attack2","cast","death","dive","hit","hit2","idle","jump","jump_down","relax","run","walk"]`，共 12 段，**不含 attack1** | **一致**（并印证缺口 1：attack1 缺失） | `scripts/play3d.gd:58` 验收输出；`scripts/player3d.gd:96` `_play_anim("attack1" ...)` 引用不存在片段 |
| 烬翼（飞行敌人）模型完成：80k 面、85 骨、5 段 Blender 自制动画，已入库 `art/models/jinyi.glb`；飞行 AI 未接 | `art/models/jinyi.glb` 存在并通过 `--import` 导入；`scripts/enemy3d.gd` 仅实现地面杂兵逻辑（walk/atk/idle/hurt/down），无飞行状态机 | **一致** | `scripts/enemy3d.gd:44-75` 状态机仅 `idle/walk/atk/hurt/down`，无 `fly/hover` |
| 数据层移植完成（装备/状态/掉落/存档，逐条对账 MATCH） | `data/gear_catalog.json`、`data/drop_rules.json`、`data/statuses.json` 存在；`scripts/save_game.gd` 完整实现本地 JSON 存档（`SLOT_KEYS` 十槽、`default_save`、`load_save`/`write_save`） | **一致** | `scripts/save_game.gd` 全文；`data/` 三文件 |

### 1.2 在制未入库项（§3 第二段）

| 项 | 代码/仓库实际 | 状态 |
|----|---------------|------|
| 绯隼服装成品 `art/models/feisun_outfit1.glb`（66MB）与 `feisun_outfit1_full.glb`（250MB） | 仓库中 **不存在**这两个文件；`art/models/` 下现有 `feisun_s1.glb`、`feisun_gen4.glb`、`feisun3d.glb`、`heroine3d.glb`、`jinyi.glb`；服装尚未换进游戏（`player3d.gd` `model_path` 默认 `feisun_gen4.glb`，`play3d.gd` 用 `feisun_s1.glb`） | 未入库，需向 Muse 索取或走 Drive |
| 头发定版 tcand2 切分版 + bow2 蝴蝶结 | 仓库中不见相关 GLB | 未交付入库 |

### 1.3 缺口 1–7 审计（逐项代码证据）

#### 缺口 1 —— attack1（第一段劈砍 slash）仍缺真实动画段

**审计结论：一致，缺口存在。**

`scripts/player3d.gd` 中 `start_attack` 用 `_play_anim("attack1" if index == 0 else "attack2", 5.0, 1.0)`（第 96 行），但 `attack1` 片段不在 S1 动画列表中，`_play_anim` 会因 `has_animation("attack1")` 为假而静默跳过（`scripts/player3d.gd:72-75`）。第一下挥砍无角色动作，伤害/帧数据正常（`--verify` 的 12 点伤害正好印证判定正常，只是缺动画表现）。

**证据：** `scripts/player3d.gd:92-96`；`scripts/play3d.gd:58` anim_list 无 `attack1`。

**禁止项确认：** 代码中未将 `attack2` 别名冒充 `attack1`（符合简部「禁止拿 attack2 别名冒充」的定版纪律）。

#### 缺口 2 —— 场景还是灰盒试验场

**审计结论：一致，缺口存在。**

`scripts/arena3d.gd` 全程程序生成：`_box` BoxMesh 地面/墙/断墙、`_pillar` CylinderMesh 柱子、随机 rubble BoxMesh，无地形、无 PBR 材质层、无高度雾体系、无远山/天空（背景纯色 `Color(0.085,0.065,0.12)`，仅指数雾 `fog_density=0.012`）。`Environment` 写死在脚本里，不可复用（与 GUIZANG 规格 C.1/C.2/C.4 要求的 `env/afterglow_night.tres`、`terrain_v5.gdshader` 等均不存在）。

**证据：** `scripts/arena3d.gd:63-130`（`_build_arena` 全程 `_box`/`_pillar`）；`scripts/arena3d.gd:133-141`（Environment 仅 BG_COLOR + 指数雾 + 弱泛光）。

#### 缺口 3 —— 敌人还是盒子代理

**审计结论：一致，缺口存在。**

`scripts/enemy3d.gd` `setup` 中 `part()` 全程 `BoxMesh` 构建身体（躯干、头、眼、剑），材质为深色金属 + 红眼发光；无真模型；腐骨兵等敌人模型未生产；`jinyi.glb` 虽入库但飞行 AI 未接。

**证据：** `scripts/enemy3d.gd:42-68`（`part` 全程 BoxMesh，`metal`/`blade`/`eye` 程序材质）。

#### 缺口 4 —— 镜头未达定版参数

**审计结论：一致，缺口存在。**

现状：`arena3d.gd` `_pitch=-0.32 rad`（约 18°）、`CAMERA_DISTANCE=6.5m`、FOV 65、缩放 4–10m、SpringArm 撞墙后往前推、无焦点缰绳、无一键回正、无遮挡淡出；`play3d.gd` `_pitch=-0.7 rad`（约 40°）、`_distance=11m`、FOV 50、缩放 4–16m、鼠标左键环绕。

定版目标（GUIZANG 规格 C6.3 / 简部 §3 缺口 4）：俯角 45° / 距离 16m / FOV 38° / 牵绳 3.5m / 遮挡淡出 + 一键回正。

**证据：** `scripts/arena3d.gd:37` (`_pitch := -0.32`)、`scripts/arena3d.gd:38` (`_distance := 6.5`)、`scripts/arena3d.gd:102` (`camera.fov = 65`)、`scripts/arena3d.gd:44-45` (`CAMERA_MIN=4.0`、`CAMERA_MAX=10.0`)、`scripts/play3d.gd:85` (`_pitch = -0.7`)、`scripts/play3d.gd:86` (`_distance = 11.0`)、`scripts/play3d.gd:87` (`fov = 50.0`)、`scripts/play3d.gd:110-118` (滚轮 4–16m)。

#### 缺口 5 —— 战斗增量未做（格挡/弹反/反击、攻击磁吸、逐角色顿帧、无碰撞）

**审计结论：一致，缺口存在。**

- 格挡/弹反/反击：`scripts/player3d.gd` 无任何格挡/弹反/反击状态；`scripts/enemy3d.gd` 无破防条；`combat3d.gd` 无相关输入映射。
- 攻击磁吸：`player3d.gd` `start_attack` 仅 `velocity = forward() * 1.2` 固定前冲（`scripts/player3d.gd:93-94`），无 `_acquire_target`/`_magnet_step`。
- 逐角色顿帧：`combat3d.gd` `hitstop()` 设置全局 `frozen = true`（`scripts/combat3d.gd:85-88`），`_physics_process` 开头 `if stage.frozen: return` 停住所有实体；无实体级 `freeze_t`。
- 玩家与敌人无碰撞（会穿身）：玩家 `collision_layer=2, collision_mask=1`（`scripts/player3d.gd:46`）；敌人 `collision_layer=4, collision_mask=1`（`scripts/enemy3d.gd:48`）；双方 mask 都只有层 1，互不碰撞。

**证据：** `scripts/combat3d.gd:83-88`；`scripts/player3d.gd:46`；`scripts/enemy3d.gd:48`；`scripts/player3d.gd:93-94`。

#### 缺口 6 —— 弹簧骨未做（马尾/腰布运行时弹簧模拟）

**审计结论：一致，缺口存在。**

代码中无 `SpringBone`、`SkeletonModifier3D`、verlet/spring 求解器；现动画里的头发是烘焙的（`scripts/player3d.gd` 无弹簧骨相关逻辑）。GUIZANG 规格 B2 已裁决为「运行时弹簧骨模拟（Godot 侧 verlet + 弹簧求解）」，固定 60Hz 步长。

**证据：** 仓库全文 grep `SpringBone`/`verlet` 无匹配；`scripts/player3d.gd` 无弹簧骨节点。

#### 缺口 7 —— walk/run 根运动靠 `_pin_root` 钉帧原地化，run ≈2.3m/s 与代码移速 4.2m/s 不一致

**审计结论：一致，缺口存在。**

`_pin_root`（`scripts/player3d.gd:76-85`）把所有片段 Hips 的水平位移钉在首帧，只保留纵向起伏；`MOVE_SPEED := 4.2`（`scripts/player3d.gd:8`）。run 片段自身节奏 ≈2.3m/s（简部 §3 所述）与代码 4.2m/s 不一致，可能滑步。简部明确要求「不要擅自改帧数据去迁就」，手感待 Quinn 实机判。

**证据：** `scripts/player3d.gd:76-85`（`_pin_root` 钉 Hips x/z）；`scripts/player3d.gd:8` (`MOVE_SPEED := 4.2`)。

---

## 2. 缺口 1–7 施工排序

排序原则：先做「纯代码、独立完成、零资产依赖、收益高、风险低、不触碰帧数据铁律」的项；后做「需要 Muse 侧 Tripo/Blender 资产生产配合」的项；涉及帧数据变动的项置后并强制 `--verify` 回归。缺口 7 不主动施工，等 Quinn 实机判定。

施工顺序（七项全部列出，标注顺序）：

| 顺序 | 缺口 | 名称 | 做法（简述） | 依赖 | 验收标准（数字线） | 风险 | 独立/需 Muse |
|------|------|------|-------------|------|-------------------|------|--------------|
| 1 | 4 | 镜头定版 + 遮挡淡出 + 一键回正 | 新建 `CameraRig3D` 替代/包装现有 `SpringArm3D`；参数 45°/16m/FOV38°/牵绳 3.5m；右键/手柄摇杆偏航；遮挡物按距连线淡出 alpha 0.25；一键回正（中键/C/R3）按帧数过渡 10–24 帧 | 无外部资产；仅改 `arena3d.gd`/`play3d.gd` 相机部分（或新增 `scripts/camera_rig3d.gd`） | 俯角 45°±0.2°、距离 16m（缩放 15.2–20.8m）、FOV 38°；偏航回正第 T 帧（T=round(10+14×|Δ|/180)）误差 ±0.5°；遮挡淡出 0.15s→alpha 0.25，0.3s 恢复；`--verify`/`--demo --god` 仍通过 | 现有 SpringArm 撞墙前推逻辑需替换为淡出，行为差异可能影响现有手感；FOV 50→38 改变透视感，需 Quinn 确认 | **能独立完成**（不需要 Muse 资产） |
| 2 | 5（子项） | 攻击磁吸 | `player3d.gd` 增加 `_acquire_target()`（半径 4m、±60° 扇形、评分取最近）+`_magnet_step()`（第 1–5 帧滑步，`move_and_collide`，撞墙停，standoff 1.52m） | 无 | 敌人 3.5m/偏 40° → 第 6 帧距离 ∈ [1.45,1.60]m 且朝向误差 <3°，命中；敌人 5m → 不吸附，只前冲 0.35m | 滑步可能穿薄墙，需 `move_and_collide` 挡住 | **能独立完成** |
| 3 | 5（子项） | 身体碰撞（玩家↔敌人互碰 + 软分离） | 玩家 mask 加敌人层 4，敌人 mask 加玩家层 2 和敌人层 4；重叠时各沿连线退一半，单帧最多 0.08m；闪避/倒地临时去掉 bit 4 | 无 | 玩家顶着敌人走 60 帧，水平距离始终 ≥ 0.58m（半径和 0.62 − 容差 0.04） | 软分离可能把角色推出场地，需配合 clamp 兜底 | **能独立完成** |
| 4 | 5（子项） | 按角色顿帧 + 输入缓冲 | 把全局 `stage.frozen` 换成实体 `freeze_t`；受击方加 30Hz 抖动；加 `InputBuffer`（冻结期间寿命不减，边沿检测在冻结判断之前） | 无 | 玩家打中敌人 A 时敌人 B `state_t` 继续增加；顿帧第 2 帧按攻击 → 顿帧结束后当段 cancel 帧自动进入下一段 | 顿帧改动可能改变 `--verify` 判定时序，必须重跑 `--verify` 确保 12/12/16 不变 | **能独立完成** |
| 5 | 2 | 场景 v5 第一包（雪原） | `scenes/field_v5.tscn` + `scripts/field_v5.gd` + `env/afterglow_night.tres` + `shaders/terrain_v5.gdshader` + `shaders/ground_mist.gdshader`；384×384m 地形，220×220m 可走核心区，四层 PBR（雪/裂纹岩/冻土/枯草地）、雪层、高度雾/体积雾、FogVolume、贴地雾片、跟镜头走的雪/风线 | 需 Muse/Blender 提供 PBR 贴图（Poly Haven CC0，2K 源→1K 进游戏）与高度图 `data/field_v5_height.exr`；`data/field_v5_layout.json` 点缀物布置 | P1 雪覆盖率 35–50%；全画面 255 白 < 0.3%；开发机 1080p 高档 P1–P6 平均 ≥60 FPS、1% low ≥50；`verify_field_v5.gd` 输出 `FIELDV5 PASS` | 贴图/高度图资产未到手前无法完成；地形 LOD 分块与裙边实现有工程量 | 需 Muse 配合（贴图与高度图） |
| 6 | 1 | attack1 真实动画段 | 由 Muse 侧按管线定版 Tripo 生成 attack1 片段（源名 slash→attack1）→ 导出母版 → Blender 绑骨/重涂权重/三验 → 减面 → 动画按骨名迁移到重涂骨架 → 入库 `art/models/` → `player3d.gd` `model_path` 指向 | 需 Muse Tripo/Blender 资产生产（Tripo 国际站专业版，Quinn 账号 jasperblasl70，到期 2026-12-11；Blender 装配权威） | `--verify` 仍 PASS 且伤害序列不变（12/12/16、第 6 帧判定）；attack1 片段在 `--demo --god` 下正常播放，不滑步（根运动由 `_pin_root` 钉 Hips x/z） | 动画补入后可能改变判定帧与动作节拍对齐，需重跑 `--verify`；Tripo 权重不可信需重涂 | 需 Muse 配合（动画生产） |
| 7 | 3 | 敌人真模型 + 烬翼飞行 AI | 腐骨兵等敌人模型按管线定版生产并替换 `enemy3d.gd` BoxMesh 代理；烬翼 `jinyi.glb` 接入飞行 AI（hover/move/attack/hit/fall） | 需 Muse 资产生产（敌人模型、烬翼飞行 AI 逻辑配合） | 敌人模型入库 `art/models/` 并通过三验；`enemy3d.gd` 飞行敌人实现 hover/move/attack/hit/fall 状态机 | 资产生产周期不可控；飞行 AI 需与地面逻辑分离 | 需 Muse 配合（模型 + AI） |
| 8 | 6 | 弹簧骨（马尾/腰布） | Godot 侧 `SkeletonModifier3D`（或自写 `SkeletonModifier3D` 子类）运行时 verlet + 弹簧求解，固定 60Hz 步长；碰撞体用 `SpringBoneCollisionSphere3D`/胶囊挂在头/胸/骨盆/大腿 | 无外部资产，但依赖已验骨架；实现较复杂 | 马尾跑步→急停 0.6–0.9s 内停稳（振幅 <2cm）；跑步中尾尖相对头骨滞后角 15°–35°；全套动作中穿透深度 <1cm；30/60/144 FPS 轨迹最大偏差 <3cm；顿帧时弹簧骨冻结 | 求解器与现有动画系统兼容性；固定 60Hz 与渲染帧率插值需处理 | **能独立完成**（代码侧，但较复杂） |
| 9 | 7 | 根运动滑步（待判） | **不主动改帧数据**（简部铁律：不要擅自改帧数据去迁就）；等 Quinn 实机判定 run ≈2.3m/s vs 代码 4.2m/s 的滑步手感；如 Quinn 决定调整，则在 `_pin_root` 或动画节奏上改，并重跑 `--verify` | 无（待判） | Quinn 实机确认手感后方可动；如改动则 `--verify` 必须 PASS 且 12/12/16 不变 | 改帧数据可能破坏 `--verify` 红线 | **能独立完成**（但当前不施工） |

> 简报 §8 建议第一件施工项从「镜头定版 + 遮挡淡出 + 一键回正」或「场景 v5 第一包」二选一。本路线图选 **缺口 4（镜头定版 + 遮挡淡出 + 一键回正）** 作为第 1 施工项，理由见第 3 节。

---

## 3. 第一件施工项详细方案 —— 缺口 4：镜头定版 + 遮挡淡出 + 一键回正

### 3.1 选此项的理由

简报 §8 明确授权从两个候选中选一件作为第一件施工项。选择 **缺口 4 镜头定版 + 遮挡淡出 + 一键回正**，理由：

1. **纯代码、独立完成，不需要 Muse 任何 Tripo/Blender 资产配合**，可立即着手，不受外部资产生产周期阻塞。
2. **零资产依赖、不触碰帧数据铁律**（不改 `player3d.gd`/`enemy3d.gd` 中的伤害/帧/顿帧逻辑），`--verify` 红线天然安全。
3. **对全局影响最大**：镜头参数直接决定后续所有美术验收（P1–P7 截图、角色可见度、特效可读性）与手感感知，做完后为场景 v5、战斗增量、动画验收奠定统一参照系。
4. **风险最低**：改动范围限定在相机 rig（`arena3d.gd`/`play3d.gd` 相机部分，或新增 `scripts/camera_rig3d.gd`），不涉及战斗判定、碰撞层、动画片段；可先在 `combat3d.tscn` 验证宿主上做，再同步到 `play3d.tscn`。

### 3.2 做法（技术方案，不改代码，只写规格）

#### 3.2.1 镜头参数（CameraRig3D）

| 参数 | 定版规格 | 备注 |
|------|----------|------|
| 俯角 | 默认 45°，玩家可调 38°–55° | 替代现有 `arena3d.gd` -0.32 rad(≈18°) / `play3d.gd` -0.7 rad(≈40°) |
| 距离 | 默认 16m（焦点到镜头） | 替代现有 6.5m / 11m |
| 缩放倍率 | 锁 0.95–1.3（即 15.2–20.8m），滚轮每格 0.05 倍，0.2s 平滑 | 替代现有 4–10m / 4–16m 宽范围 |
| FOV | 38°（竖直） | 替代现有 65 / 50 |
| 焦点 | 主角位置 + 上 1.0m | — |
| 主角屏幕占比 | 高度占视口 9–14%；竖直位置 52–58%（中心略偏下） | 构图参照 |
| 旋转 | 右键拖拽或手柄右摇杆，偏航角自由，松开保持不自动回正 | — |
| 缰绳 | 焦点最多偏离主角 3.5m；Boss 战偏 Boss 25%，但偏移上限仍 3.5m；前视牵引 ≤ 0.6m | — |
| 跟随 | 临界阻尼弹簧 `smooth_damp`，平滑时间 0.18s；过场交还控制时跟随速度 0.6s 内从 20% 平滑升至 100% | — |
| 地形 | 镜头高度每帧取 `max(当前高度, 地形高度 + 1.5m)` | — |
| 震屏 | trauma 模型，上限 0.6，衰减 1.8/s，振幅按镜头距离等比放大（16m 下 ×2.0） | — |

#### 3.2.2 遮挡淡出

- 注册遮挡物进入 `occluder` 组（鸟居、枯树、立石群、灯笼等）。
- 每帧对注册遮挡物计算其到「镜头—主角」连线的水平距离。
- 距离 < `物件半径 + 0.6m`：在 0.15s 内淡到 `transparency` 0.75（即 alpha ≤ 0.25），使用 `GeometryInstance3D.transparency`，**不换材质**。
- 离开阈值后 0.3s 内恢复到 0。
- **不用 SpringArm 把镜头往前推**（避免构图和手感变化）。

#### 3.2.3 一键回正（C6.4）

| 项 | 规格 |
|----|------|
| 动作名与按键 | `InputMap` 动作 `camera_recenter`；默认鼠标中键单击、键盘 `C`、手柄 R3；仅识别按下边沿 |
| 回正目标 | 偏航 = 主角模型当前朝向（按下那一帧的值，过渡中主角转身不追）；Boss 战中改为「面朝 Boss」；俯角同时回到 45°；缩放不动 |
| 路径 | 偏航走最短弧（|Δ| ≤ 180°）；|Δ偏航| < 2° 且俯角差 < 1° 时视为已正，不播过渡 |
| 时长 | `T = round(10 + 14 × |Δ偏航| / 180°)` 帧，即 10–24 帧（0.17–0.40 秒）；转 90° 约 17 帧；俯角与偏航共用同一个 T，同时到位 |
| 缓动 | ease-out cubic `1 − (1−t)³`，按实时走，不受 `Engine.time_scale`（完美闪避/处决慢镜头）和角色顿帧影响 |
| 期间：旋转输入 | 右键拖动 > 2 像素，或右摇杆超出 0.2 死区 → 立即中止回正，交给玩家 |
| 期间：缩放 | 滚轮缩放照常生效，与回正并行 |
| 期间：移动输入 | 移动参考系锁在按下那一帧的镜头偏航；回正结束后摇杆/方向键一直按着且方向变化 ≤ 30° 则继续沿用旧参考系，松开或变化 > 30° 切到新参考系 |
| 期间：战斗输入 | 攻击/闪避/举剑/反击全部照常，回正不吃战斗输入、不打断战斗状态 |
| 期间：再次按回正 | 以当前角度为起点、当前主角朝向为新目标，按剩余转角重新计算 T |
| 不响应时段 | 处决镜头、过场、Boss 开场演出期间忽略（不缓冲） |
| 跟随 | 回正只改偏航和俯角；焦点弹簧跟随、缰绳、地形取大、遮挡淡出照常每帧运行 |

#### 3.2.4 验收断言（数字线）

1. 偏航 0°、主角朝向 150° 时按回正 → 第 0 帧开始转动，第 T = 22 帧时偏航 = 150° ± 0.5°、俯角 = 45° ± 0.2°。
2. 途中第 8 帧注入右摇杆输入 → 当帧中止，偏航不再向 150° 靠近。
3. 回正期间按住「前」，主角的世界移动方向与按下那一帧的方向偏差 < 1°。
4. `--verify` 仍输出 `VERIFY PASS`（12/12/16 不变）；`--demo --god` 仍 `PLAY VICTORY`。

### 3.3 依赖与风险

- **依赖**：无外部美术资产依赖；仅改动 `scripts/arena3d.gd` / `scripts/play3d.gd` 中的相机构造与更新逻辑（或新增 `scripts/camera_rig3d.gd`），不改 `scripts/player3d.gd`、`scripts/enemy3d.gd`、`scripts/combat3d.gd`，不碰 2D 旧线和 `main` 分支。
- **风险**：现有 `SpringArm3D` 撞墙后往前推的逻辑需替换为遮挡淡出，行为差异可能影响现有手感（需在 `combat3d.tscn` 与 `play3d.tscn` 上分别自测）；FOV 从 50→38 改变透视感，需 Quinn 实机确认；与 `--capture` 截帧时刻（2/6/12/20 秒）及 `--demo` 自动战斗需保持兼容。

### 3.4 可否独立完成 / 是否需要 Muse 配合

- **能独立完成**：是，整个方案可在代码侧独立实现并自测（`--verify` + `--demo --god` + 截帧）。
- **需要 Muse 配合**：无（本项不依赖 Tripo/Blender 资产）。

---

## 4. 施工纪律与铁律提醒（施工开始前再确认）

1. **帧数据 12/12/16 不许动**；任何战斗相关代码改动后必跑 `godot --headless --path . scenes/combat3d.tscn -- --verify`，要求 `VERIFY PASS` 且伤害序列不变。
2. **不动 `main` 分支**，不动 2D 旧线文件 `scripts/player.gd`、`grunt.gd`、`atlas_anim.gd`、`scenes/stage1.tscn`。
3. 在 `godot` 分支工作；大改动先开工单式说明（目标/做法/验收标准）给 Muse 核验后再施工。
4. **每件施工项闭环**：施工 → 自测（`--verify` + `--demo --god` + 截帧）→ 交 Muse 核验 → 入库。
5. **产出必须落盘为文件**，不只留在对话里。

---

> 本路线图仅做阶段 0 交付，**不开始任何施工，不改任何代码**。经 Quinn/Muse 拍板后，再按上述顺序逐项施工。
