# 素材包规格：`fx_scene_v1`（第 14 项场景尾巴：火把火苗、南出口台阶、试炼碑刻纹）

对应 Godot 前问题解决阶段**第 14 项**的场景尾巴（`docs/AUDIT_PRE_GODOT.md` 第 14 项末尾：「仍是代码画、留给后面的包」）。子轮 H 之后的下一步（Quinn 2026-11-08 的顺序：子轮 H → 第 14 项场景尾巴 → 内容扩充 → …）。
> **SPEC READY FOR CODEX：fx_scene_v1**（规格定稿 2026-11-08）
> 一个 zip `fx_scene_v1.zip`：贴图 4 张 + 序列帧 1 组 8 帧（小包）。
> 两步：先交 `docs/preview.png`，**Muse 审查通过**后出全帧打包。

## 一、要替换什么（现在每一样都是代码画的形状）

| 东西 | 现在 | 位置 | 换成 |
|---|---|---|---|
| 关卡里墙上火把的火苗 | 两个叠在一起的实心椭圆（外层 `th.torch` 色、内芯 `th.flame` 色），按 `fl` 系数忽大忽小 | `src/scenery.js`：素材场景路径约 686 行、程序场景路径约 344 行 | `torch_flame`（灰度火苗序列帧，引擎按关卡主题染色；每支火把播放相位错开）。火光（`glow_warm`）照旧 |
| 房间南边的下行出口 | 一个黑色梯形 + 四条描边线（按房间清没清染红 / 青） | `src/draw.js` 的 `drawDoors`（`room.doors.s`） | `stairs_down`（带颜色的石阶实物：往下通进黑暗）+ 叠一层 `stairs_glow`（台阶沿口的光，引擎染红 = 封着 / 青 = 可走，呼吸） |
| 大地图上试炼碑的刻纹光 | 四条描边的半椭圆（`#7ff3ff`） | `src/world.js` 的 `drawGlow` | `trial_runes`（灰度刻纹光，引擎染青，呼吸） |

不在本包：关卡门素材没载入时的拱门占位（`draw.js` 的 `drawArch`）和程序画的场景前景（`scenery.js` 的 `drawProcForeground`）——这两个是**素材载入失败时**才出现的替身，按第 14 项「占位」那一条的办法处理（改成等素材、不再画替身），是代码工单，不需要新素材。

## 二、交付

一个 zip。第 1 步只交 `docs/preview.png`：每张贴图一格、`torch_flame` 取一帧，暗底网格，标 id；另加两格「实际效果」示意：`stairs_down` + 染红的 `stairs_glow`、`stairs_down` + 染青的 `stairs_glow`。**Muse 审查通过**后第 2 步出全帧、打包。

## 三、包里的内容

「染色」= 引擎按情况染色，素材只画灰度。锚点按画布比例 (x, y)。

### A. 贴图（4 张）

| id | 画布 | 锚点 | 混合 | 内容 |
|---|---|---|---|---|
| `stairs_down` | 256×128 | (0.5, 0) 顶边中点 | **normal，带颜色** | 南出口：几级粗糙的石阶从画面上沿往下、往前延伸进黑暗（俯视偏前的视角，和关卡地面同一个透视：上窄下宽），两侧是碎石和断掉的矮墙，越往下越暗、最下面没入全黑；和关卡场景同一套暗黑手绘风格、光源左上。台阶沿口留出清楚的边（`stairs_glow` 要对齐） |
| `stairs_glow` | 256×128 | (0.5, 0) 顶边中点 | add，灰度 | 和 `stairs_down` **同一个画布、逐像素对齐**：只画每一级台阶沿口的一道细光（最上面一级最亮，往下渐暗），两侧有一点散射；其余全透明 |
| `trial_runes` | 128×128 | (0.5, 0.5) | add，灰度 | 试炼碑正面的刻纹光：几道竖排的、刻进石头里的抽象纹路（弧线、断开的折线，不是文字）透出光，中间一道最亮；边缘柔和（叠在大地图的试炼碑素材上） |
| `torch_glow_base` | 64×64 | (0.5, 0.5) | add，灰度 | 火苗根部一团很小的亮光（火把头上燃着的那一点），叠在 `torch_flame` 下面；给两种场景（素材场景 / 程序场景）共用 |

### B. 序列帧（1 组 8 帧）

| id | 画布 × 帧 | 锚点 | 混合 | fps | 循环 | 内容 |
|---|---|---|---|---|---|---|
| `torch_flame` | 64×128 × 8 | (0.5, 0.85) 火苗根部 | add，灰度 | 12 | 循环 | 墙上火把的火苗：一簇往上窜的火舌，根部最亮、往上变尖变暗，8 帧摇曳（左右晃、高低起伏，偶尔断出一小片火星）；首尾无缝 |

合计：贴图 4 张 + 序列帧 1 组 8 帧。

## 四、通用规格（沿用 `docs/ART_FX.md` 第三节）

- **发光类（`add`）只用灰度**（R = G = B）；直通 alpha，无背景；从亮处平滑衰减到 0，边缘不能有硬切口或灰圈；四角和边缘中点 alpha 为 0（`stairs_glow` 例外：底边可以不为 0，因为台阶往下延伸出画布）。
- **`stairs_down` 是实物**：带颜色、普通混合；底边是全黑（不透明），左右两侧渐变到透明（和地面接得上）。
- 序列帧每格同样大小、对准同一锚点；8 帧 = 4×2。循环首尾无缝。
- 原创暗黑幻想风，手绘笔刷质感，不是干净的数学渐变或几何形状；不要照搬任何现有游戏。

## 五、文件结构（`afterglow.fxpack.v1`）

**zip 根目录平铺**：

```
README_zh.md
fx.json
textures/stairs_down.png、stairs_glow.png、trial_runes.png、torch_glow_base.png
frames/torch_flame/torch_flame_00.png … _07.png
sheets/torch_flame.png
docs/preview.png、docs/contact_sheet.png
```

`fx.json`：`textures` 每项写 `id`、`file`、`w`、`h`、`anchor`、`blend`；`flipbooks` 写 `id`、`w`、`h`、`anchor`、`blend`、`fps`、`loop`、`frames`、`sheet`。上传到 GitHub Release（仓库 `leograntquinn-crypto/afterglow-blade`）。

## 六、交付前自查（我接入前会逐项验收）

1. id、画布、帧数、锚点、fps、loop、blend 和第三节一致；发光类全部灰度；`stairs_down` 带颜色。
2. 发光类四角和边缘中点 alpha 为 0（`stairs_glow` 底边除外）；没有硬边。
3. `stairs_glow` 的每道光正好落在 `stairs_down` 的台阶沿口上（两张叠起来看对得上）。
4. `torch_flame` 首尾无缝；根部在锚点。
5. 文件齐全、命名正确、zip 平铺、`fx.json` 写了 `sheet`；`preview.png` 与最终帧一致。

## 七、生成提示词（给 Codex）

### 通用开头（每张都加）
```
Asset type: production art for a 2D side-scrolling dark-fantasy action game (original IP). True straight alpha
transparency, no background, hand-painted brush texture (not clean mathematical gradients or geometric shapes).
No characters, no text, no borders. Glow assets are GRAYSCALE ONLY (the engine tints them).
```

### 各项【内容】
- `stairs_down`（带颜色）：`rough stone steps descending from the top edge forward and down into darkness, seen slightly from above and in front (narrow at the top, wider at the bottom), rubble and a broken low wall on both sides, darker the lower it goes, the bottom fully black; clear step lips; full color, top-left lighting, matching dark hand-painted dungeon art.`
- `stairs_glow`：`on the same canvas, perfectly aligned with the stairs: only a thin line of light along the lip of each step (the top step brightest, fading downward) with a little scattered light at the sides; everything else transparent.`
- `trial_runes`：`glowing lines carved into the face of a stone tablet: several vertical abstract carved strokes (arcs, broken zigzags, not letters) with light shining out of the grooves, the middle one brightest, soft edges.`
- `torch_glow_base`：`a tiny bright glow at the head of a burning torch, soft round falloff.`
- `torch_flame`：`a wall-torch flame: a cluster of flame tongues licking upward, brightest at the root (anchor) and tapering and dimming upward, swaying left and right and rising and falling, occasionally shedding a small spark; 8-frame seamless loop.`

## 八、接入（第 14 项场景尾巴，按 Quinn 规则 2 可派 Codex，模块级测试）

- 构建：`tools/build_fx.py` 加一个 `--scene` 模式（或复用 `--boss` 的表驱动写法加一行 `scene`），打成 `fx_scene`，一直载入（关卡和大地图都用）。
- 火把：两处代码画的椭圆删掉，换成 `torch_glow_base` + `torch_flame`（按关卡主题 `th.torch` 染色，每支火把相位错开；`fl` 系数继续控制大小）。
- 南出口：`drawDoors` 里的梯形 + 描边线删掉，换成 `stairs_down` + `stairs_glow`（红 / 青和现在的颜色一致，呼吸）。
- 试炼碑：`drawGlow` 里四条描边半椭圆删掉，换成 `trial_runes`（染 `#7ff3ff`）。
- 素材没载好：这几样不画（第 14 项）；火光、门光照旧。
- 同一模块顺带做（代码，不需要素材）：关卡门素材没载入时的拱门占位、程序场景前景这两个替身改成「等素材」（第 14 项「占位」那一条），之后第 14 项的场景尾巴清零。
- 验收（模块末尾统一一次）：`tools/fxsheet.js` / 截图对比（各关火把、南出口封着 / 可走、大地图试炼碑，桌面 + 手机）、全套测试 + 新的确定性测试（这几处不再调用 `ellipse` / 梯形路径 / 描边、素材没载好时不画）、帧率。

## 九、接入记录（第 14 项场景尾巴，2026-11-09）

- **代码**：S-1（`build_fx.py --scene`、`fx_scene` 一启动就载、`sceneTex`）、S-2（`src/scene_fx.js` + 三处替换 + 两个替身改成等素材）、S-3（`tests/scenefxtest.js` 17 项 + `tools/sceneshot.js`，Muse 补了地图淡入黑场的截图修正），Codex 交付，终审通过后合进 main。
- **终审改了一处**：南出口台阶沿口光原来按描边线的透明度（`0.2 + 0.35 × pulse`）画，素材的沿口光很细，呼吸低谷时红 / 青几乎看不出——这是「封着 / 能走」的玩法信息，调成 `0.6 + 0.5 × pulse`（上限 1）、叠画两遍；台阶画布宽 172 → 210（台阶本身约占画布 0.6，和原来梯形的开口差不多宽）。数值在 `SCENE_FX.stairs`。
- **截图**：`tools/sceneshot.js` 桌面 + 手机左右对照 main，另用全分辨率核对了南出口和试炼碑。火把五关按主题染色、相邻火把帧号不同、火苗落在火把台上。
- **观感待 Quinn 试玩**：试炼碑刻纹素材的内容只占画布宽的三分之一，叠在原来那团光上读起来像一道竖光，比旧的四道横弧细；南出口在画面最下沿，只露出最上面两三级台阶（和原来的梯形一样贴着下沿）。
