# 3D 施工报告

> 项目：残光之刃 / AFTERGLOW BLADE  
> 分支：`godot`  
> 对照：`docs/3D_ROADMAP.md`  
> 施工日期：2026-07-23（本机验收）  
> 验收引擎：Godot 4.6.stable.official；项目定版为 Godot 4.7.2，Muse 仍需在 4.7.2 复验。

## 0. 红线核对

- 未切换或修改 `main`；当前分支为 `godot`。
- 未修改 2D 旧文件：`scripts/player.gd`、`scripts/grunt.gd`、`scripts/atlas_anim.gd`、`scenes/stage1.tscn`。
- 三段战斗帧数据未改：攻击伤害仍为 **12 / 12 / 16**，总帧 22、接触帧 6、取消帧 10。
- 未施工路线图第 9 项根运动；没有改 `_pin_root` 去迁就 2.3m/s 与代码移速差异。
- 没有用程序生成的模型、服装或 attack1 冒充 Muse 成品资产。程序生成内容仅限运行时系统、灰盒兼容 fallback、天气与验证工具。

## 1. 镜头定版（已完成）

### 做了什么

- 新增 `scripts/camera_rig3d.gd`，并由 `arena3d.gd` / `play3d.gd` 接入。
- 默认镜头：俯角 45°、焦点距离 16m、FOV 38°、缩放倍率 0.95–1.30。
- 加入焦点弹簧跟随、3.5m 缰绳、地形射线高度下限、右键/左键拖拽旋转、滚轮窄范围缩放。
- 加入 `camera_recenter`：键盘 C、鼠标中键、手柄 R3；最短弧、10–24 帧 ease-out cubic、回正期间输入中止、移动参考系锁定。
- 注册 `occluder` 组并按相机—主角连线做 `GeometryInstance3D.transparency` 淡出/恢复，不再用 SpringArm 把镜头推近。

### 自测结果

`tools/verify_camera3d.gd` 输出 `CAMERAV3 PASS`：

- 默认俯角 45°。
- 默认镜头到焦点实测 16.00m。
- FOV 38°。
- 回正结束误差 0°，测试目标 45°俯角通过。
- 回正中旋转输入可中止。
- 缩放上下限 1.30 / 0.95 通过。
- 遮挡透明度实测 0.75，离开后恢复 0.00。

## 2. 攻击磁吸（已完成）

### 做了什么

- `player3d.gd` 增加 `_acquire_target()`：半径 4m、±60°、高差 1m、距离+角度评分。
- 出招第 0 帧转向目标；第 1–5 帧按剩余距离滑步，站位距离 1.52m；无目标使用约 0.35m 前冲。
- 磁吸阶段避开敌人身体层但保留场景墙体碰撞；到站位时不冲过头。
- 仍保留 attack1 缺失时静默不播放的纪律，没有把 attack2 作为别名。

### 自测结果

`tools/verify_feel.gd` 输出 `FEELVERIFY PASS`：

- 3.5m / 偏 40°：第 6 帧距离实测 1.51m，朝向误差 0.17°，命中 12 点。
- 5m：不吸附，仅前冲，实测剩余距离 4.65m。

## 3. 身体碰撞与软分离（已完成）

### 做了什么

- 玩家碰撞层 2、mask 改为 `1 | 4`。
- 敌人碰撞层 4、mask 改为 `1 | 2 | 4`。
- `combat3d.gd` 增加玩家—敌人—敌人水平软分离，单帧上限 0.08m；角色半径使用 0.30m / 0.32m。

### 自测结果

`tools/verify_feel.gd` 输出通过：顶敌人 60 帧后最小水平距离实测 0.65m，达到不低于 0.58m 的数字线。

## 4. 按角色顿帧与输入缓冲（已完成）

### 做了什么

- 从全局 `stage.frozen` 改为实体 `freeze_t`。
- 玩家和敌人分别维护自己的顿帧；攻击方/受击方独立冻结，其他敌人继续运行。
- 命中后增加 30Hz 方向抖动；顿帧时动画速度置 0，恢复后回到原速度。
- 输入边沿在冻结判断前采集；攻击缓冲寿命在非冻结帧推进，冻结期间不会吞键。
- 轻击当前攻击方/受击方分别为 4/5 帧，重击为 6/8 帧；原 12/12/16 帧伤害线没有改。

### 自测结果

`tools/verify_feel.gd` 输出 `FEELVERIFY PASS`：

- 受击方顿帧期间 `state_t` 停止。
- 同挥击的其他敌人 `state_t` 从 7 继续到 10。
- 顿帧第 2 帧按攻击并在第 3 帧松开，取消帧自动进入下一段。
- `scenes/combat3d.tscn -- --verify` 输出 `VERIFY PASS`，伤害序列为 12 / 12 / 16。

## 5. 场景 v5 第一包（代码侧做到极限；资产阻塞）

### 已完成的代码侧产出

- 新增 `scenes/field_v5.tscn`、`scripts/field_v5.gd`。
- 新增 `shaders/terrain_v5.gdshader`：四层地貌接口、雪层噪声/坡度/湿度遮罩、雪 debug view、Texture2DArray PBR 接口；没有伪造贴图。
- 新增 `shaders/ground_mist.gdshader`。
- 新增 `scripts/weather_rig.gd`：跟随镜头焦点的雪粒子、贴地雾片、风线。
- 新增 `env/afterglow_night.tres`，由 `tools/gen_env_v5.gd` 生成并包含冷色环境、指数雾、体积雾参数、SSAO、泛光和调色基础配置。
- 新增 `tools/verify_field_v5.gd`，只在正式源资产齐全并满足尺寸要求时输出 `FIELDV5 PASS`。

### 自测结果

`field_v5.tscn` 可载入；缺资产时只报告 warning，不生成假资源。`verify_field_v5.gd` 当前如实输出：

```text
FIELDV5 BLOCKED missing_assets=[
  res://data/field_v5_height.exr,
  res://data/splat_v5.png,
  res://art/terrain/field_v5_pbr.tres
]
FIELDV5 FAIL
```

### 待 Muse 补资产清单

1. `data/field_v5_height.exr`：1537×1537，正式高度图。
2. `data/splat_v5.png`：1024×1024，雪/岩/冻土/枯草控制图。
3. `art/terrain/field_v5_pbr.tres` 及其正式贴图：Poly Haven CC0 四套 PBR；主雪层按规格可用 2K，其余进游戏 1K。
4. 远山、鸟居、残件、立石、枯树、灯笼/篝火、冰面碎片等 360° 成品点缀资产及碰撞简化体。
5. FogVolume 所需正式密度噪声资源。
6. P1–P7 截图与性能验收必须在正式资产到位后重跑。

## 6. attack1 真实动画（代码侧钩子完成；资产待 Muse）

### 做了什么

- `player3d.gd` 继续使用固定名字 `attack1`；片段存在时自动播放，不存在时不做别名冒充。
- 新增 `tools/verify_attack1.gd`，可扫描入场 GLB 的动画列表。

### 自测与现状

当前游戏主角 `feisun_s1.glb` 动画列表没有 `attack1`；`feisun_gen4.glb` 中存在名为 `attack1` 的片段，但它不是本次 Muse 交付的 S1 成品替换，未擅自把它换入主线。探针已能识别两者。

### 待 Muse 补资产清单

- 按管线生成真实 slash→attack1，完成母版导出、重涂骨架、三验、根位移复核后入库。
- 入库后需重新跑 `verify_attack1.gd`、`--verify`、`--demo --god` 和 4.7.2 截帧。

## 7. 敌人真模型与烬翼 AI

### 代码侧完成

- `enemy3d.gd` 增加真模型挂钩：检测 `enemy_grunt.glb` / `grunt3d.glb` / `corrupted_soldier.glb`，资产存在就归一化加载；不存在则保留原盒体 fallback，不把 fallback 宣称成成品。
- 烬翼接入 `art/models/jinyi.glb`，支持 `hover`、`move`、`atk`、`hurt`、`fall`；接入现有 5 段动画 `hover/fly/dive/hit/fall`。
- `play3d.gd` 支持 `--jinyi` 在第二波加入烬翼，不改变默认三波计数验收。
- 新增 `tools/verify_jinyi.gd`。

### 自测结果

`verify_jinyi.gd` 输出 `JINYI PASS`：

- 80k 面、85 骨的 `jinyi.glb` 可加载。
- 5 段动画全部存在。
- 远距离接近从 8.20m 到 0.25m。
- 飞行高度保持在空中（实测约 y=3.97）。
- 近身攻击使玩家 HP 100→92。
- 受击进入 hurt，致命伤进入 fall，随后 down/回收。

### 待 Muse 补资产清单

- 腐骨兵等地面敌人正式 GLB（6–10 万面、重涂权重、三验、完整 360°外观）。
- 每种敌人的正式材质、武器、攻击/受击/倒地动画片段。
- 烬翼正式碰撞探针、翼/尾羽碰撞体与三验报告；当前 AI 是代码接入版，不替代资产验收。

## 8. 弹簧骨

### 做了什么

- 新增 `scripts/spring_bone_runtime.gd`，使用 Godot 原生 `SpringBoneSimulator3D`，支持马尾/腰布候选骨链、stiffness/drag/gravity 参数和顿帧冻结。
- 玩家在模型装载后自动探测骨链；没有目标骨链则不创建虚假物理链。
- 新增 `tools/verify_spring_bone.gd`。

### 自测结果与阻塞

Godot 4.6 运行时确认 `SpringBoneSimulator3D=true`，但当前 `feisun_s1.glb` 只有 58 骨，缺少：

`HairRoot`、`Hair_01`、`PonytailRoot`、`WaistClothL_01`、`WaistClothR_01`、`WaistL_01`、`WaistR_01`。

因此探针如实输出 `SPRINGBONE BLOCKED`。没有伪造马尾/腰布轨迹，也没有宣称穿透验收通过。

### 待 Muse 补资产清单

- 带正式马尾和红腰布骨链的成品角色 GLB，骨名需接入运行时候选或提供映射表。
- 头/胸/骨盆/大腿的弹簧碰撞绑定点。
- 30/60/144 FPS 轨迹、急停 0.6–0.9s、滞后角 15–35°、穿透 <1cm 的三验报告。

## 9. 明确未施工项

- 路线图第 9 项根运动滑步：按 Quinn 规则不施工。
- 格挡、弹反、反击、处决、闪避、敌人攻击令牌、完整韧性条、正式斩击 VFX：本轮没有冒进施工；它们不在“路线图第 2 节的独立优先子项”可安全交付范围内，避免改变未冻结的更多战斗规则。
- 场景正式模型、PBR 贴图、高度图、控制图、attack1、敌人真模型、马尾/腰布骨链：均列为资产待补，不用程序结果冒充成品。

## 10. 总回归记录

| 命令/工具 | Godot 4.6 本机结果 |
|---|---|
| `godot --headless --path . --import` | 导入扫描完成；仅有既有 `verify_c4.gd` UID 重建提示 |
| `scenes/combat3d.tscn -- --verify` | **VERIFY PASS**；12/12/16，防连晕与死亡通过 |
| `scenes/play3d.tscn -- --demo --god` | **PLAY VICTORY**，本次实测 47.43s；此前基线约 64.8s，磁吸/顿帧改动导致时序变化，结果仍正常通关 |
| `tools/verify_camera3d.gd` | **CAMERAV3 PASS** |
| `tools/verify_feel.gd` | **FEELVERIFY PASS** |
| `tools/verify_jinyi.gd` | **JINYI PASS** |
| `tools/verify_attack1.gd` | 如实识别 S1 缺 `attack1`；gen4 有片段但未替换主线 |
| `tools/verify_spring_bone.gd` | **SPRINGBONE BLOCKED**，当前骨架无发/腰布链 |
| `tools/verify_field_v5.gd` | **FIELDV5 BLOCKED**，正式高度图、控制图、PBR 包未入库 |

## 11. 4.7.2 复验清单

Muse 在 Godot 4.7.2 上需要重新执行：

1. `godot --headless --path . --import`
2. `godot --headless --path . scenes/combat3d.tscn -- --verify`
3. `godot --path . scenes/play3d.tscn -- --demo --god`
4. `tools/verify_camera3d.gd`、`tools/verify_feel.gd`、`tools/verify_jinyi.gd`
5. 正式资产到位后的 `tools/verify_field_v5.gd`、`tools/verify_spring_bone.gd`、attack1 探针和 P1–P7 截帧。

本报告只把“已验证”“只确认可载入/无解析错误”“等待 Muse 资产”分开记录，不把代码侧 fallback 或工具探针写成美术成品验收。
