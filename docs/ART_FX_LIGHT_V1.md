# 素材包规格：`fx_light_v1`（光、光晕、光照、压暗、掉落 / 门 / 地图的小光效）

对应 Godot 前问题解决阶段第 14 项清单里的 14.3～14.6、14.15～14.18（`docs/AUDIT_PRE_GODOT.md`）：这些现在还是**代码生成的贴图或代码画的渐变**。
本包是本阶段的**第三包**（前两包 `hero_fix_v1`、`fx_blade_v1` 已验收接入）。

## 一、要替换什么

| 清单 | 现在 | 位置 |
|---|---|---|
| 14.3 | 柔光点 `glow`、光核 `core`：代码生成的径向渐变贴图，几乎所有光效都在用（火焰、提灯、能量点、受击闪光、敌人光） | `fx_tex.js makeGlow / makeCore` |
| 14.4 | 火花针 `needle`、光条 `streak`：代码生成；火花、速度线、斩痕 `cut`、蓄力吸入都用它 | `fx_tex.js makeNeedle / makeStreak` |
| 14.5 | 光照：在黑暗层上用径向渐变「挖洞」 | `post.js applyLighting` |
| 14.6 | 技能演出压暗、暗角、胶片颗粒：径向渐变 / 随机噪点 | `cine.js drawDim`、`draw.js drawVignette`、`post.js` 颗粒 |
| 14.15 | 掉落物光柱、宝箱 / 泉水的光 | `loot.js`、`props.js` |
| 14.16 | 关卡门的光、出口箭头 | `draw.js drawDoors` |
| 14.17 | 大地图的光点（深渊冒的光、烽灯火星）：2×2 的方块 | `world.js updateMotes / drawGlow` |
| 14.18 | 未解锁入口的暗雾 | `world.js` |

## 二、包里的内容

### A. 光晕与火花（发光类，`blend: "add"`，灰度）

| id | 画布 | 锚点 | 内容 | 替换 |
|---|---|---|---|---|
| `glow_soft` | 128×128 | 中心 | 柔和的圆形光晕：中心近白，按近似高斯平滑衰减到边缘完全透明；边缘带一点点不规则的光斑感（不是完美的数学圆） | `glow` |
| `glow_warm` | 128×128 | 中心 | 火光用的光晕：比 `glow_soft` 中心更集中、外圈带轻微的火焰状起伏 | 火焰、提灯、火把、烽灯 |
| `glow_core` | 64×64 | 中心 | 很小很亮的光核：中心一点纯白，很快衰减 | `core` |
| `spark_needle` | 256×24 | 中心 | 细长火花：中线最亮，往两端和上下快速衰减，两端尖 | `needle` |
| `light_streak` | 256×48 | 中心 | 柔和的长光条（泛光用）：比火花宽、软，两端渐隐 | `streak` |
| `cut_mark` | 256×32 | 中心 | 斩痕：一道锐利的细亮线，一侧边缘略带碎光 | 斩痕 `cut` |
| `mote` | 32×32 | 中心 | 小光点：中心亮、柔和的小圆，略不规则 | 地图光点、深渊光点 |
| `ember` | 32×32 | 中心 | 火星：亮的小核 + 一点点拖尾感（朝上） | 烽灯火星、余烬 |

### B. 光照 cookie（光照系统用；**白 = 被照亮**，透明 = 黑暗；`blend: "normal"`，灰度 + alpha）

光照的做法不变（黑暗层上「挖洞」），只是洞的形状从代码渐变换成手绘的 cookie：

| id | 画布 | 锚点 | 内容 |
|---|---|---|---|
| `light_round` | 256×256 | 中心 | 通用光：圆形，中心全亮，外圈平滑衰减到 0；边缘有很淡的笔触不规则 |
| `light_flame` | 256×256 × **4 帧**（序列帧，循环） | 中心 | 火光：形状略往上偏（火焰在下方，光往上铺），每帧轮廓轻微起伏，4 帧循环形成摇曳 |
| `light_lantern` | 256×256 | 中心 | 提灯 / 灯塔光：中心一圈很亮，外面一圈较暗的光晕，像透过灯罩 |
| `light_magic` | 256×256 | 中心 | 法术 / 能量光（深渊、试炼碑、咒盾）：柔和的圆光里带极淡的流动纹理 |

### C. 屏幕层（普通混合，暗色 + alpha）

| id | 画布 | 内容 |
|---|---|---|
| `vignette` | 1024×576 | 暗角：中间完全透明，四角和边缘渐暗（最暗处 alpha 约 0.75），边缘带一点笔刷质感，不是机械的椭圆渐变 |
| `dim_hole` | 512×512 | 技能演出压暗：中心一个**透明的洞**（洞的边缘柔和、略不规则），往外渐变到不透明的暗色。引擎把洞对准演出焦点、拉伸铺满屏幕 |
| `grain` | 256×256 | 胶片颗粒：灰度噪点，**四方连续可平铺**（上下左右无缝），颗粒细、均匀 |
| `seal_fog` | 256×256 | 暗雾：一团不规则的暗色烟雾（普通混合，深紫黑色调用灰度表示，引擎染色），边缘柔和散开 |

### D. 道具、门、掉落（发光类，`add`，灰度）

| id | 画布 / 帧 | 锚点 | 内容 |
|---|---|---|---|
| `loot_beam` | 128×384 × **6 帧**（循环） | (0.5, 0.95) 底部中心 | 掉落物光柱：从地面往上的细光柱，底部亮、往上渐隐，内部有往上流动的光点；6 帧循环。引擎按稀有度染色 |
| `chest_glow` | 256×256 | (0.5, 0.8) | 宝箱打开时往上喷出的扇形光 |
| `shrine_glow` | 256×256 | (0.5, 0.8) | 泉水的柔光（往上的光雾） |
| `door_light` | 128×384 | (0.5, 1.0) 底部中心 | 关卡出口的门光：竖直的光幕，底部最亮往上渐隐 |
| `exit_chevron` | 64×64 | 中心 | 出口方向的箭头标记（朝右，引擎镜像），发光的手绘笔触，不是几何三角 |

合计：单张贴图 **19 张**（A 8 张、B 3 张、C 4 张、D 4 张：`chest_glow`、`shrine_glow`、`door_light`、`exit_chevron`），序列帧 **2 组 10 帧**（`light_flame` 4 帧、`loot_beam` 6 帧）。

## 三、通用规格（沿用 `docs/ART_FX.md` 第三节）

- **只用灰度**（引擎按场景、角色、稀有度染色）；真实透明通道（直通 alpha），无背景。
- 发光类：中心最亮、向外平滑衰减到完全透明，边缘不能有硬切口或灰圈。
- 光照 cookie、屏幕层：按上表说明的「白 = 亮 / 暗色 + alpha」做；`grain` 必须四方连续。
- 主体四周留透明边（屏幕层、`grain` 除外）；锚点按表。
- 序列帧每格同样大小、对准同一锚点，每行 4 格（4 帧 = 4×1，6 帧 = 4×2 空 2 格）；循环的首尾无缝。
- 原创暗黑幻想风，手绘笔刷质感 + 柔和衰减；不要照搬任何现有游戏；不要画角色、文字、边框。

## 四、文件结构（`afterglow.fxpack.v1`）

```
fx_light_v1/
  README_zh.md
  fx.json
  textures/<id>.png
  frames/light_flame/light_flame_00.png … _03.png
  frames/loot_beam/loot_beam_00.png … _05.png
  sheets/light_flame.png、sheets/loot_beam.png
  docs/contact_sheet.png        （暗底上的总览）
  docs/tinted_preview.png       （发光类染成 金 #ffd65a、青 #7ff3ff、紫 #b46bff、红 #ff4d4d 叠在暗底上）
  docs/lighting_preview.png     （一张暗色场景示意图：把四种 cookie 当光照洞挖出来的效果）
  docs/grain_tiling.png         （grain 2×2 平铺，看不出接缝）
```

`fx.json` 的 `textures` 写 `blend`（`add` 或 `normal`），`flipbooks` 写 `fps`、`loop`（`light_flame` 8 fps、`loot_beam` 12 fps，都循环）。
打包成 `fx_light_v1.zip`，上传到新的 GitHub Release（仓库 `leograntquinn-crypto/afterglow-blade`）。

## 五、交付前自查（我接入前会逐项验收）

1. 每项 id、画布、锚点、帧数和第二节一致；全部灰度（R = G = B）。
2. 发光类：亮度从中心平滑衰减到边缘为 0，没有硬边；不是干净的数学渐变（放大看有手绘质感）。
3. 光照 cookie：中心 alpha 最高，边缘为 0；`light_flame` 4 帧循环无跳变。
4. `vignette` 中心完全透明；`dim_hole` 中心洞完全透明、外圈不透明；`grain` 平铺无缝。
5. `loot_beam` 6 帧循环无缝；底部最亮。
6. 文件齐全、命名正确、没有多余的临时文件。

## 六、生成提示词（给 Codex）

### 通用开头（每张都加）
```
Asset type: production VFX texture for a 2D side-scrolling action game. Grayscale only, true straight alpha
transparency, no background, original dark-fantasy hand-painted style with subtle brush texture (not a clean
mathematical gradient). No characters, no text, no borders.
```

### 各项【内容】（接在通用开头后面）
- `glow_soft`：`a soft round light orb, near-white center fading smoothly to fully transparent at the edge, very slight organic irregularity at the rim, centered, 128x128.`
- `glow_warm`：`a warm fire-light glow, a concentrated bright center with a gently flame-shaped, slightly wavering outer halo, centered, 128x128.`
- `glow_core`：`a tiny intense light core, a pure white point with a very fast falloff, centered, 64x64.`
- `spark_needle`：`a thin elongated spark, brightest along its center line, tapering to sharp points at both ends, fast falloff above and below, horizontal, 256x24.`
- `light_streak`：`a soft elongated light streak, wider and softer than a spark, fading at both ends, horizontal, 256x48.`
- `cut_mark`：`a crisp thin bright slash mark, a razor line of light with a few tiny light flakes breaking off one edge, horizontal, 256x32.`
- `mote`：`a small soft glowing speck, bright center, soft slightly irregular edge, 32x32.`
- `ember`：`a tiny hot ember, bright core with a faint short upward trail, 32x32.`
- 光照 cookie（`light_round`、`light_lantern`、`light_magic`）：`a lighting cookie mask: WHITE means lit, transparent means dark. ` + 第二节 B 表的内容，256x256。
- `light_flame`（4 帧，4×1，1024×256）：`a flickering fire-light cookie: white = lit, the lit area biased upward from a flame below; the outline wavers slightly from frame to frame; 4 frames loop seamlessly.`
- `vignette`（1024×576）：`a screen vignette overlay: fully transparent center, edges and corners darken smoothly (darkest alpha about 0.75), with a subtle painterly brush texture along the dark border.`
- `dim_hole`（512×512）：`a cinematic dimming mask: a fully transparent soft-edged hole in the center, slightly irregular, fading outward to an opaque dark area.`
- `grain`（256×256）：`fine uniform film grain noise, seamlessly tileable on all four sides.`
- `seal_fog`：`an irregular puff of dark smoke, soft dissolving edges, normal blend.`
- `loot_beam`（6 帧，4×2，512×768，每格 128×384）：`a slim vertical light beam rising from the ground, brightest at the base and fading upward, small light specks drifting upward inside; 6 frames loop seamlessly.`
- `chest_glow`：`a fan of light bursting upward from an opened chest, bright at the bottom, fading upward and outward.`
- `shrine_glow`：`a soft upward mist of light above a small spring, gentle and calm.`
- `door_light`：`a vertical curtain of light for a doorway, brightest at the bottom, fading upward, soft edges, 128x384.`
- `exit_chevron`：`a glowing hand-painted chevron arrow pointing right, brush-stroke edges, not a geometric triangle, 64x64.`

## 七、接入（我这边）

- `tools/build_fx.py` 打成图集；`fx_tex.js` 的 `glow / core / needle / streak` 改用本包（代码生成的版本删掉）。
- `post.js` 光照：`addLight` 加光的类型（通用 / 火 / 灯 / 法术），挖洞改用对应 cookie（火光按时间换帧）；颗粒改用 `grain`。
- `cine.js` 压暗改 `dim_hole`；`draw.js` 暗角改 `vignette`、门光改 `door_light`、出口箭头改 `exit_chevron`。
- `loot.js` 光柱改 `loot_beam`（按稀有度染色）；`props.js` 宝箱 / 泉水光改 `chest_glow` / `shrine_glow`。
- `world.js` 地图光点改 `mote` / `ember`，封印暗雾改 `seal_fog`。
- 验收：截图对比（战斗光照、技能演出、掉落、宝箱、门、大地图，桌面 + 手机）、全套测试、帧率。

## 八、接入记录（子轮 F，2026-11-06）

- **包**：`fx_light_v1.zip`（Release `assets-v8`，2 519 602 字节，sha256 `454347ef…8f73e6a9`），37 个文件，Muse 验货通过。
- **构建**：`python3 -I tools/build_fx.py fx_textures_v1 fx_hero_v1 fx_boss_v1 fx_blade_v1 fx_light_v1` → 新增 `fx_light_tex`（19 张，桌面 160KB / 手机 60KB）和 `fx_light`（2 组 10 帧，20KB / 8KB）；原有图集重新构建逐字节不变。
  - 屏幕层 `vignette`、`dim_hole`、`grain` 不裁边（整张铺满 / 平铺）。
  - `grain` 交付时整张 alpha 是 24：浏览器画布按预乘 alpha 存像素，±10 的灰度起伏会被压成三四档，所以图集里存成不透明、JSON 记下原 alpha（无损，alpha 是常数）。
- **一启动就载**（不等主角 / 战斗素材）：大地图的光照、光点、暗雾也要用；两套合计约 180KB。没载好时这些东西**不画**（第 14 项永久规则：不用代码画的替身），只有环境暗度。

| 原来 | 现在 |
|---|---|
| `fx_tex.js` 代码生成的 `glow / core / streak / needle` | `glow_soft / glow_core / light_streak / spark_needle`（`makeGlow / makeCore / makeStreak / makeNeedle` 已删）。各处画法按原来的逻辑尺寸写缩放，每张记横竖两个换算系数，可见大小和原来一致 |
| 斩痕的白芯（针芒） | `cut_mark` |
| 余烬粒子（光核） | `ember` |
| `post.js` 光照：径向渐变挖洞 | cookie 挖洞：`addLight` 加光的类型——通用 `light_round`、火光 `light_flame`（8 fps 换帧，每个火光相位错开）、提灯 / 灯塔 `light_lantern`、法术 / 深渊 / 试炼碑 / 地面预警 `light_magic`。手绘 cookie 收得比原来的渐变早，按「总亮度和原来一样」放大（通用 ×1.1、火 ×1.11、法术 ×1.1、提灯 ×1.31） |
| 颗粒：启动时随机噪点 | `grain`（Canvas 和 WebGL 两条路都是），起伏按原来的强度换算（标准差 10 → 74） |
| WebGL 合成里的暗角（smoothstep）和颗粒（hash） | 同一张 `vignette` / `grain` 贴图（上传一次，颗粒按 1:1 像素重复平铺） |
| `cine.js` 压暗：径向渐变 | `dim_hole` 对准演出焦点（贴图半宽 345：洞边约 235、完全变暗约 310，和原来 110～360 相当），贴图外面用同色铺满 |
| `cine.js` 集中线：针芒 | `light_streak`（针芒的亮芯太短太细，做集中线看不清） |
| `draw.js` 暗角 | `vignette` 铺满画面 |
| `draw.js` 门光、地面光带、出口箭头 | `door_light`（竖着做门光；横过来铺在地上做光带）、`exit_chevron`（朝右，西门镜像） |
| `loot.js` 光柱 + 地上的椭圆圈 | `loot_beam` 6 帧（12 fps，按稀有度染色，高度按品质）+ 压扁的 `glow_soft` |
| `loot.js` 回血光球、金币闪光 | `glow_soft` + `glow_core` |
| `props.js` 宝箱未开的金光 / 打开的光 | 未开：`door_light` 染金色呼吸；打开：`chest_glow`（开盖那一下最亮） |
| `props.js` 泉水的光柱和光点 | `shrine_glow` + `mote` |
| `world.js` 地图光点（2×2 方块） | 深渊光点 `mote`、烽灯 / 灯塔火星 `ember` |
| `world.js` 烽灯、灯塔的光晕 | `glow_warm` |
| `world.js` 封印暗雾：径向渐变 | `seal_fog` 染成深紫黑 |
| （顺带）`scenery.js` 火把火光和地面倒影、`main.js` 完美闪避的画面青边 | `glow_warm`、`vignette` 染青 |

- **验收**：截图对比 `docs/fx_light_v1_cmp.jpg`（桌面）/ `docs/fx_light_v1_cmp_m.jpg`（手机）：每行左 v43 / 右本轮，依次是战斗光照、技能演出、掉落、宝箱 + 泉水、门、大地图三处（烽灯、封印、深渊）。WebGL 合成路径另外强制打开截图核对（无报错、没有退回 Canvas）。
- **待 Quinn 看**：整体明暗（暗角比原来的渐变轻、集中在四角）、技能压暗的洞边更利落、掉落光柱的高度和亮度、封印暗雾的浓度。

