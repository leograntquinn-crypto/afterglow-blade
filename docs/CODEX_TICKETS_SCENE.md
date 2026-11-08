# 第 14 项场景尾巴工单（可派 Codex）

素材包 `fx_scene_v1` 已验货上架（`assets-v8/fx_scene_v1.zip`，sha256 `3b45b413…`，479 159 字节）。规格 `docs/ART_FX_SCENE_V1.md`（第一节替换表、第八节接入）。

通用约定同 `docs/CODEX_TICKETS_H.md` 开头（只交代码不碰仓库、调效果的数值放数据表、第 14 项不许新加代码画的特效形状、不改玩法）。**模块级测试**：S-1 ～ S-3 一个模块，做完统一测一次。

**排队**：这个模块改的是 `src/scenery.js`、`src/draw.js`、`src/world.js`、`tools/build_fx.py`、`src/fx_art.js`，和子轮 H 的首领模块（`src/boss_fx.js`、`src/boss.js`、`src/boss_moves.js`、`src/combat.js`、`src/fx_data.js`）**不重叠**，所以可以和 H-6 + H-7（铁颚）**并行**派。数据表和画法放新文件 `src/scene_fx.js`，**不要往 `src/fx_data.js` 里加**（H 系列一直在往那个文件末尾追加，同时改会冲突）。`tools/build_fx.py` 和 `src/fx_art.js` 和 H-10 / H-13 会碰到同一个文件的不同位置——先合并的那一边合进 main 后，另一边基于新 main 改。

| 工单 | 内容 | 难度 | 可派 |
|---|---|---|---|
| S-1 | `--scene` 构建模式 + `fx_scene` 一直载入 | 机械 | ✓ |
| S-2 | 火把火苗、南出口台阶、试炼碑刻纹接入；拱门占位和程序前景两个替身改成「等素材」 | 中（按指导执行） | ✓ |
| S-3 | 场景素材的确定性测试 | 中 | ✓ |

## S-1 构建 + 一直载入

- `tools/build_fx.py` 加 `--scene <fx_scene_v1 目录>`：照 `--boss` 的写法，表里写 `textures = { stairs_down: (256, 128), stairs_glow: (256, 128), trial_runes: (128, 128), torch_glow_base: (64, 64) }`、`flipbooks = { torch_flame: (64, 128, 8) }`，校验不符就报错退出（不覆盖已有图集）。打成 `fx_scene`（贴图和序列帧同一图集，同首领包）。
  - **`stairs_down`、`stairs_glow` 都不裁边**：两张要逐像素对齐，裁边后偏移不同就对不上了。
- `src/fx_art.js`：`FX_ART.scene = new FxPack('fx_scene')`，**一启动就载**（关卡的火把和大地图的试炼碑都要用；放在 `FX_ART.light.load()` 旁边，不等 `afterBoot`）；新导出 `sceneTex(id)`（贴图）；`flipbook()` 查找列表加上 `FX_ART.scene`。
- 验收（并进模块测试）：真包打出图集；其他图集重打逐像素不变；进关卡前 `FX_ART.scene.ready` 已经为 true。

## S-2 接入（指导要点）

新建 `src/scene_fx.js`：顶部 `SCENE_FX` 数据表（大小、亮度、呼吸速度、颜色），下面是画法函数（素材没载好返回 false）。

1. **火把**（`src/scenery.js` 两处：素材场景路径约 686 行、程序场景路径约 344 行）：
   - 删掉两个 `ctx.ellipse` 实心椭圆（外层 + 内芯）；
   - 换成 `torch_glow_base`（根部的一团亮）+ `torch_flame`（序列帧，循环），用关卡主题的 `th.torch` 染色；
   - 大小乘现在的 `fl` 系数（忽大忽小照旧）；
   - **每支火把相位错开**：用火把的序号 `i` 或屏幕 x 算一个固定偏移，不要用随机数（每帧都会变）；
   - 火光 `glow_warm`（`drawLightTex`）一字不改，光照系统的火把光源（`torches` 数组）照旧返回。
2. **南出口**（`src/draw.js` 的 `drawDoors`，`room.doors.s` 那一段）：
   - 删掉黑色梯形和四条描边线；
   - 换成 `stairs_down`（锚点顶边中点，放在 `(world.w / 2 - camX, GROUND_TOP + DEPTH + 6)`，宽度和现在梯形的上底差不多：约 160～180 逻辑像素宽）+ 同位置同大小的 `stairs_glow`；
   - `stairs_glow` 染色和现在描边线一样：没清完红 `255,77,94`、清完青 `127,243,255`，透明度按现在的 `pulse` 呼吸。
3. **试炼碑**（`src/world.js` 的 `drawGlow`，`g.rune` 那一段）：
   - 删掉四条描边半椭圆；
   - 换成 `trial_runes`，染 `#7ff3ff`；位置和大小按现在 `g.rune = [r0, step, w]` 覆盖的范围（中心在 `y + r0 + 1.5 × step`，宽约 `2 × w`，高约 `4 × step + 8`）；
   - 透明度 `g.a × 0.8`，加一点慢呼吸（表里可调）。
4. **两个替身改成「等素材」**（第 14 项「占位」那一条）：
   - `src/draw.js` 的 `drawArch`（关卡门素材 `propsL` 没载入时画的拱门占位）：不再画实心拱门路径、栅栏线、描边；**只画门光** `door_light`（成品贴图，现在就在用），让「这里有门、封着 / 开着」的信息还在。
   - `src/scenery.js` 的 `drawProcForeground`（场景素材没载入时的程序前景：锁链、碎石、骨头）：**整段不画**（`drawForeground` 里 `envReady()` 为假时直接跳过，浮尘粒子 `drawParticles` 照旧）。
   - 程序场景的**背景**（`drawProcBackground` 那一套：素材全挂时的整张底图）这一单不动——它是最后的兜底，动它要先定「素材全挂时显示什么」，我来定。
5. 素材没载好：火苗、台阶、刻纹都不画（火光、门光、试炼碑的光晕照旧）。

**检查点**（只交代码看方向，不跑测试）：1. S-1 + 火把；2. 南出口 + 试炼碑 + 两个替身。

## S-3 确定性测试

新建 `tests/scenefxtest.js` 并加进 `tests/run_all.js`。要测：
- 启动后 `fx_scene` 载入（进关卡前就 ready）；
- 关卡里画火把时**不再调用 `ellipse`**（包一层 ctx 计数）、实际画的是 `torch_flame` 和 `torch_glow_base`；相邻两支火把的帧号不同（相位错开）；
- 有南出口的房间：画的是 `stairs_down` + `stairs_glow`，**不再有 `lineTo` / `stroke`**；没清完 / 清完 `stairs_glow` 的染色分别是红 / 青；
- 大地图试炼碑：画的是 `trial_runes`，`drawGlow` 里**不再调用 `ellipse` / `stroke`**；
- `propsL` 没载入时：`drawArch` 只画门光，没有 `fill` / `stroke` 路径；场景素材没载入时 `drawProcForeground` 不画任何东西；
- `fx_scene` 没载入时：火苗、台阶、刻纹都不画，火光 / 门光照旧，页面无报错。

最后一行 `SCENEFXTEST ok` / `SCENEFXTEST FAIL n`。

**模块测试**（S-1 ～ S-3 全做完后统一一次）：`node tests/run_all.js` 全过；截图对比：`tools/fxsheet.js` 只能摆敌人 / 首领，拍不了空房间和大地图，所以另写一个小脚本 `tools/sceneshot.js`（五关各一个带火把的房间、有南出口的房间封着 / 清完各一张、大地图试炼碑；桌面 + 手机；`--compare <端口>` 左右对照 main，写法照 `fxsheet.js`：定格游戏循环、按逻辑画面 960×540 换算裁切）；帧率对比（火把多的房间）。问题汇总成一张清单，集中改完再测。
