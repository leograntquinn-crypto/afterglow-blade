# 特效素材需求 v5：技能、受击与首领特效

这份文档**只提需求和提示词**，交给 Codex 生成。素材回来以后，我再接入游戏，替换现在程序生成的占位贴图（接入方式见每一项的「替换」一栏）。

---

## 一、现状：特效引擎已经就位，缺的是「手绘的质感」

经过特效重做的四步，引擎这边已经具备：

| 已有能力 | 位置 |
|---|---|
| 粒子池、数据化发射器、按曲线变化的大小 / 透明度 / 颜色 | `src/fx.js`、`src/fx_data.js` |
| 受击分级（轻击 / 暴击 / 重击 / 破招 / 击杀）、星芒、冲击线、刀光光带 | `src/fx_data.js` 的 `HIT_TIERS`、`src/player.js` |
| 技能三拍（蓄力压暗聚光 → 爆发 → 余韵）、地面冲击波、光柱、首领预警 | `src/cine.js`、`src/moves.js` |
| WebGL 后处理：高斯泛光、冲击波扭曲、色差、调色 | `src/glpost.js` |

**目前所有特效贴图都是程序画的**（`src/fx_tex.js`）：柔光点、拉长火花、针芒、烟团、冲击环、星芒、碎片、地裂。程序贴图的问题是**太规整**：烟团是几个圆叠起来的，冲击环是完美的圆，星芒是直线十字，地裂是折线 —— 画面「干净但没有手绘的笔触和能量感」。

这一批素材要做的，就是把这些规整的占位换成**有笔触、有能量纹理、有不规则边缘**的手绘特效，并补上程序很难画好的东西：**笔刷感的刀光、命中爆点、地面冲击的尘爆、首领专属的招式特效**。

**不需要做的**（引擎画得更好，或者不划算）：
- 柔光点、余烬、光点：高斯柔光已经很好，手绘没有优势
- 刀光拖带的形状：由刀身实时位置决定，只能程序画
- 集中线、压暗、聚光、泛光、扭曲、色差：后处理，不需要贴图
- 法线贴图、自发光贴图：2D 画布用不上，收益很低

---

## 二、这一批的素材包

| 顺序 | 素材包 | 内容 | 为什么值得做 | 下载 / 内存（桌面 · 手机） |
|---|---|---|---|---|
| 1 | **FX-1 特效贴图** `fx_textures_v1` | 单张贴图 26 张：烟团、尘爆、碎片、地裂（含炽热层）、能量冲击环、星芒、光柱、能量丝、符文圈 | 替换全部程序占位，所有特效马上有手绘质感；只是单张图，生成最稳 | 约 0.8MB · 解码约 10MB / 2.5MB |
| 2 | **FX-2 绯隼与通用序列帧** `fx_hero_v1` | 序列帧 12 组 90 帧：五种刀光（横扫、上挑、下劈、旋斩、十字）、四档命中爆点、地面尘爆、能量爆发、滚烟、残光爆散 | 刀光和爆点是玩家每秒都在看的东西，序列帧比粒子更有「动画感」 | 约 1.6MB · 解码约 16MB / 4MB |
| 3 | **FX-3 首领特效** `fx_boss_v1` | 序列帧 4 组 30 帧：骨刺突刺、骨裂斩痕、魂火、召唤法阵 | 骸骨统领、祭坛守护者的招式有自己的视觉语言 | 约 0.6MB · 只在对应关卡载入，解码约 4.5MB / 1.1MB |

内存按接入时的图集尺寸估算：序列帧桌面按交付尺寸的 50%、手机按 25% 打图集（和角色图集同样的做法，手机屏幕上看不出区别）；单张贴图桌面原尺寸、手机 50%。

**发布位置**：GitHub Release **`assets-v5`**。文件名：`fx_textures_v1.zip`、`fx_hero_v1.zip`、`fx_boss_v1.zip`。可以分批上传，**FX-1 最优先**（它不依赖另外两个包，单独就能替换全部占位贴图）。

**上传前自检**：每个 zip 用 `unzip -t` 检查完整（上一批有一个包缺了 ZIP 中央目录、在中途截断）；每个包附 `docs/contact_sheet.png`（全部贴图 / 帧的总览）。

---

## 三、通用规格（三个包都适用）

### 颜色与透明

- **只用灰度**：白色 = 最亮的能量，越暗越弱。**不要画颜色** —— 引擎在运行时按刀光颜色（武器品质）、关卡主题、首领颜色染色。同一张图会被染成青、金、紫、橙、红、绿
- **真实透明通道（直通 alpha）**，不要黑底、不要棋盘格、不要任何背景
- **发光类**（会用叠加混合画的：刀光、爆点、冲击环、星芒、光柱、能量丝、符文圈）：中心最亮接近纯白，向外**平滑衰减到完全透明**，边缘不能有硬切口或一圈灰边
- **实体类**（普通混合：烟、尘、碎片、地裂的暗缝）：灰度要带体积明暗（顶部受光偏亮、底部偏暗），边缘不规则、有笔触

### 构图

- 主体居中，四周留足透明边（至少 8%），**任何东西都不能碰到画布边缘**
- 锚点：除非另有说明，锚点在画布正中心
- 2D 横版侧视角；地面上的东西（地裂、地面冲击、法阵）画成**压扁的透视**（纵向约为横向的 0.32）

### 序列帧

- 每组 4 / 6 / 8 / 12 帧，排成**每行 4 格**的网格（4 帧 = 4×1，8 帧 = 4×2，12 帧 = 4×3），每格同样大小
- **每一格里特效的中心对准同一个锚点**（不能一格偏左一格偏右）
- 时间节奏：**第 1 帧就要有冲击力**（不要从一个小点慢慢长出来）；前 1～2 帧最亮、形状最锐利，之后扩散、变淡、碎裂，**最后一帧几乎完全透明**
- 循环的（魂火）首尾要能无缝衔接
- 6 帧的组也排成 4 列（4×2，最后两格留空透明）

### 风格

- **原创**的暗黑幻想风：手绘动画游戏特效，笔刷感的能量线条、锐利的形状 + 柔和的衰减、带一点碎屑和火星
- 「残光」是这个游戏的核心意象：**能量消散时会碎成细小的光片和光点，像余烬一样慢慢飘走**，而不是一下子消失
- 不要照搬任何现有游戏的特效、符文、标志；符文用**原创的抽象几何纹样**，不要任何真实文字（汉字、拉丁字母、如尼文都不要）
- 不要画角色、武器、文字、帧号、边框

### 文件结构

```
包名/
  README_zh.md
  fx.json                     # 清单，格式见下
  textures/<id>.png           # 单张贴图（FX-1）
  frames/<id>/<id>_00.png ... # 序列帧的单帧（FX-2、FX-3）
  sheets/<id>.png             # 序列帧拼表
  docs/contact_sheet.png      # 全部内容的总览（黑底上画，方便看）
  docs/tinted_preview.png     # 同一批图分别染成青 #7ff3ff、金 #ffd65a、红 #ff4d4d、绿 #6fe38a 叠在暗底上的效果
```

`fx.json`：

```json
{
  "schema": "afterglow.fxpack.v1",
  "textures": [
    { "id": "smoke_01", "file": "textures/smoke_01.png", "w": 256, "h": 256, "anchor": [0.5, 0.5], "blend": "normal" }
  ],
  "flipbooks": [
    { "id": "slash_sweep", "frames": ["frames/slash_sweep/slash_sweep_00.png"], "w": 512, "h": 256,
      "anchor": [0.5, 0.5], "fps": 30, "loop": false, "blend": "add" }
  ]
}
```

`blend`：`add`（叠加发光）或 `normal`（普通遮挡）。`anchor` 是画布内的比例坐标。

---

## 四、提示词模板

**单张贴图**：

```
Use case: game VFX texture. Asset type: 【贴图类型】 for a 2D side-scrolling dark-fantasy action game.
Style: original hand-painted anime game VFX, crisp energetic brush-stroke shapes with smooth soft falloff,
small sparks and fragments, high quality, no characters, no weapons, no text, no symbols from any real writing system.
COLOR: pure grayscale only — white is the brightest energy, darker grey is weaker; do not use any hue,
the game engine tints the texture at runtime.
BACKGROUND: real alpha transparency (straight alpha), no backdrop, no checkerboard, no border, no grid, no label.
Composition: subject centered, generous transparent margin on all sides, nothing touching the canvas edges.
Canvas 【宽】 by 【高】 pixels.
SUBJECT: 【内容】
```

**序列帧**：

```
Use case: game VFX animation. Asset type: production flipbook sprite sheet for a 2D side-scrolling dark-fantasy
action game.
Style: original hand-painted anime game VFX, crisp energetic brush-stroke shapes with smooth soft falloff,
small sparks and fragments, high quality, no characters, no weapons, no text, no symbols from any real writing system.
COLOR: pure grayscale only — white is the brightest energy, darker grey is weaker; no hue at all,
the game engine tints it at runtime.
OUTPUT LAYOUT IS CRITICAL: exactly 【N】 sequential frames of ONE single effect, in a uniform grid of FOUR columns and
【R】 rows, canvas 【宽】 by 【高】 pixels, each invisible cell 【格宽】 by 【格高】 pixels, reading order left to right,
top row first. 【空格说明】 The effect is anchored at the SAME point in every cell (【锚点】); it must never drift between cells.
TIMING: frame 1 already has full impact (brightest, sharpest shape); the effect then expands, thins, breaks into small
glowing fragments and fades; the last frame is almost fully transparent with only a few faint embers.
BACKGROUND: real alpha transparency (straight alpha), no backdrop, no checkerboard, no cell borders, no grid lines,
no frame numbers, no labels. Nothing may touch or cross the edge of its cell.
EFFECT: 【内容】
```

【空格说明】只有 6 帧的组用：`The last two cells of the second row are left completely empty and transparent.`；其他组删掉这一句。

---

## 五、FX-1 特效贴图 `fx_textures_v1`（单张，26 张）

| id | 尺寸 | 混合 | 数量 | 替换 / 用途 | 【内容】（英文，填进单张模板） |
|---|---|---|---|---|---|
| `smoke_01`～`smoke_06` | 256×256 | normal | 6 | 替换程序烟团：命中尘土、落地尘、技能扬尘 | `one soft billowing puff of thick smoke / dust, volumetric, lit from the top (brighter top edge, darker underside), irregular wispy brush-stroke edges with small curls, about 70% of the canvas, variation 【n】 of 6 with a clearly different silhouette` |
| `dustburst_01`～`dustburst_03` | 512×256 | normal | 3 | 地面冲击时贴地炸开的尘浪（崩山击、砸地、落地） | `a low wide burst of dust and grit kicked up sideways from the ground, seen from the side, flat bottom edge resting on the ground line at 85% of the canvas height, spreading left and right with a curling crest, small pebbles flying, variation 【n】 of 3` |
| `chip_01`～`chip_04` | 128×128 | normal | 4 | 替换程序碎片：骨渣、碎石、金属屑（每张 3～4 块分开的小碎片，引擎随机取一块区域） | `three or four separate small jagged shards of broken stone and bone, each with a dark outline and one brighter lit facet, scattered with space between them, variation 【n】 of 4` |
| `crack_01`～`crack_02` | 512×192 | normal | 2 | 替换程序地裂的暗缝（压扁的地面透视） | `a radial network of deep cracks in a stone floor seen in flattened ground perspective (vertical extent about one third of the horizontal), dark near-black fissures with a slightly lighter chipped rim, thick at the center and thinning outward, a few loose chips, variation 【n】 of 2` |
| `crackglow_01`～`crackglow_02` | 512×192 | add | 2 | 同一张地裂的「炽热缝」发光层，**必须和 crack_01 / crack_02 的裂缝形状逐像素对齐**（拿对应的 crack 图当参考） | `the glowing energy seeping out of exactly the same crack network as the reference image: bright white thin lines inside each fissure, soft glow halo around them, brightest at the center, nothing outside the cracks` |
| `ring_energy_thin` | 512×512 | add | 1 | 替换程序冲击环（细的）：命中环、闪避环 | `a thin circular shockwave ring of energy, the ring band is about 4% of the radius, uneven brightness along the ring with a few brighter arcs and tiny breaks, faint soft inner haze, the circle fills about 90% of the canvas` |
| `ring_energy_thick` | 512×512 | add | 1 | 替换程序冲击环（粗的）：技能爆发、首领倒下 | `a thick turbulent circular shockwave of energy, the band is about 14% of the radius with a sharp bright outer front and a wispy fading trail toward the center, torn streaks, the circle fills about 90% of the canvas` |
| `flare_01` | 256×256 | add | 1 | 替换程序星芒：命中瞬间的十字闪光 | `a sharp four-point star flare with two long thin horizontal and vertical spikes and two shorter diagonal spikes, intense white core, very fine spike tips` |
| `flare_02` | 256×256 | add | 1 | 暴击、破招用的星芒变体 | `a six-point star burst flare with slightly uneven spike lengths, intense core, a faint thin ring around the core` |
| `pillar_01` | 128×512 | add | 1 | 替换程序光柱（崩山击、必杀终结、首领倒下）；锚点在底部中心 (0.5, 0.95) | `a vertical column of light shooting upward from the ground, brightest and widest at the bottom, thin bright core line with streaky energy filaments running upward, fading out toward the top` |
| `wisp_01`～`wisp_02` | 256×64 | add | 2 | 能量丝：剑气、刀光尾端、蓄力汇聚的光线 | `a single horizontal flowing filament of energy, thick and bright at the right end, thinning into wispy strands toward the left, slight wave, variation 【n】 of 2` |
| `rune_circle_01` | 512×512 | add | 1 | 必杀蓄力、首领召唤时地面上的法阵（引擎压扁成地面透视并缓慢旋转） | `an ORIGINAL abstract magic circle seen from directly above: two concentric thin rings, a ring of original geometric glyph-like marks (not letters of any real writing system), a central star polygon, thin and elegant lines` |
| `rune_circle_02` | 512×512 | add | 1 | 同上，首领用的、更锐利压迫的版本 | `an ORIGINAL abstract hostile sigil seen from directly above: jagged outer ring with spikes pointing outward, an inner ring of angular original geometric marks (not letters of any real writing system), sharp and aggressive` |

数量合计：6 + 3 + 4 + 2 + 2 + 1 + 1 + 1 + 1 + 1 + 2 + 1 + 1 = **26 张**（其中 crack / crackglow 是成对的）。

**接入方式**：`src/fx_tex.js` 里同名替换（`smoke` → smoke_01～06，`chip` → chip_01～04 切块，`crack.dark` / `crack.hot` → crack / crackglow，`ring` → 两张能量环，`flare` → flare_01 / 02，光柱改用 pillar_01）；尘爆、能量丝、符文圈是新增的，接到崩山击、剑气、必杀和首领召唤。

---

## 六、FX-2 绯隼与通用序列帧 `fx_hero_v1`（12 组，90 帧）

刀光类的约定：**朝右**挥砍（引擎朝左时镜像）；刀光是一道**新月形的笔刷光带**，前缘锐利明亮、后缘柔和，扫过的弧上带细碎光片；**锚点 = 角色握刀的肩部位置**。

| id | 帧数 | 格子 | 布局 / 画布 | 锚点 | 用途 | 【内容】（英文，填进序列帧模板） |
|---|---|---|---|---|---|---|
| `slash_sweep` | 6 | 512×256 | 4×2 / 2048×512 | (0.3, 0.5) | 普攻一、二段（横扫） | `a horizontal crescent sword-slash arc sweeping from upper left to lower right in front of the anchor, a crisp bright leading edge and a soft trailing body; frame 1 the full arc at its brightest, then it thins from the tail, breaks into small light shards along the arc and fades` |
| `slash_rise` | 6 | 512×512 | 4×2 / 2048×1024 | (0.3, 0.6) | 上挑 | `a rising crescent sword-slash arc sweeping from low front to high above, curving upward, crisp bright leading edge; frame 1 full arc, then thinning from the tail and scattering upward drifting shards` |
| `slash_down` | 6 | 512×512 | 4×2 / 2048×1024 | (0.3, 0.4) | 普攻三段、重斩、下劈 | `a heavy downward crescent sword-slash from high above down to the ground in front, very thick and bright, the lower end bursting slightly where it meets the ground; frame 1 full arc, then thinning and breaking into heavy falling shards` |
| `slash_spin` | 8 | 512×512 | 4×2 / 2048×1024 | (0.5, 0.5) | 回风斩（旋斩） | `a full circular spinning sword-slash ring around the center, flattened horizontally to about 45% height like a disc seen slightly from the side, motion-blurred brush strokes chasing each other around the circle; frames progress the spin and the last frames dissolve into a ring of drifting shards` |
| `slash_cross` | 6 | 512×512 | 4×2 / 2048×1024 | (0.5, 0.5) | 千刃·残光收尾的十字斩 | `two crossing diagonal sword-slash streaks forming a large X, a bright flash at the crossing point; frame 1 both strokes at full length and brightness, then they split apart along their length into fragments and fade` |
| `hit_light` | 6 | 256×256 | 4×2 / 1024×512 | (0.5, 0.5) | 轻击命中 | `a small sharp impact burst: a bright core with a few short spiky rays and tiny sparks flying outward, quick and snappy` |
| `hit_heavy` | 8 | 256×256 | 4×2 / 1024×512 | (0.5, 0.5) | 重击、击杀命中 | `a heavy impact burst: a large bright core, thick spiky rays, a thin expanding ring and many sparks and small fragments flying outward, then the fragments drift and fade` |
| `hit_break` | 8 | 384×384 | 4×2 / 1536×768 | (0.5, 0.5) | 破招 / 破防（最强的一档） | `a shattering impact: a bright core with a burst of sharp crystalline shards exploding outward like breaking glass, a strong expanding ring and long thin rays, the shards spin and fade` |
| `impact_ground` | 8 | 512×256 | 4×2 / 2048×512 | (0.5, 0.85) | 崩山击、坠星、首领砸地的地面爆发 | `a ground impact explosion seen from the side: a bright flash at the ground point, a wide dome-shaped shock of dust and energy bursting up and sideways, rock debris flying, then the dust rolls outward and settles` |
| `burst_energy` | 8 | 512×512 | 4×2 / 2048×1024 | (0.5, 0.5) | 技能爆发的能量冲击（千刃收尾、裂空斩出手） | `a radial explosion of pure energy: a blinding core, curved energy streaks spiraling outward, a turbulent shockwave ring, then the streaks break into countless small glowing shards that drift outward and fade` |
| `smoke_roll` | 8 | 256×256 | 4×2 / 1024×512 | (0.5, 0.6) | 落地烟、撞墙烟（普通混合，**不是发光**；fx.json 里 blend 写 normal） | `a puff of thick dust smoke rolling outward and rising: frame 1 a dense compact puff, expanding and curling, thinning out, the last frame is a faint wisp; volumetric shading lit from the top` |
| `afterglow_burst` | 12 | 512×512 | 4×3 / 2048×1536 | (0.5, 0.6) | 必杀「残光·终焉」终结与余韵（这个游戏的标志性特效） | `the signature "afterglow" burst: a huge blinding flash, then the light shatters into thousands of tiny glowing light flakes and thin luminous shards that slowly float upward and outward like embers on a breeze, some flakes leave very faint thin trails, gradually dimming until only a few faint motes remain` |

帧数合计：6 + 6 + 6 + 8 + 6 + 6 + 8 + 8 + 8 + 8 + 8 + 12 = **90 帧**（其中 6 帧的组按 8 格排，空 2 格）。

**接入方式**：刀光序列帧叠在现在的程序刀光带上面（光带负责「跟着刀走」，序列帧负责「笔刷质感」）；四种命中爆点按受击分级播放；地面爆发、能量爆发、残光爆散接到崩山击、千刃、必杀终结；滚烟替换落地和撞墙的程序烟。

---

## 七、FX-3 首领特效 `fx_boss_v1`（4 组，30 帧）

| id | 帧数 | 格子 | 布局 / 画布 | 锚点 | 用途 | 【内容】（英文，填进序列帧模板） |
|---|---|---|---|---|---|---|
| `bone_spikes` | 8 | 512×256 | 4×2 / 2048×512 | (0.5, 0.9) | 骸骨统领：地面突刺（砸地后骨刺从地下冒出） | `a row of jagged bone spikes bursting up out of the ground along a line, cracked ground at their base, frame 1 the spikes erupting with debris, frames 2-3 fully extended and sharp, then they crumble into bone fragments and dust that fall and fade` |
| `bone_rend` | 6 | 512×256 | 4×2 / 2048×512 | (0.3, 0.5) | 骸骨统领：巨剑斩痕（比主角的刀光更粗、带锯齿和裂纹） | `a brutal jagged greatsword slash arc with a serrated, cracked, uneven edge like torn bone, heavy and rough rather than elegant, frame 1 full and bright, then it splits along its cracks into heavy fragments that fall and fade` |
| `soul_fire` | 8 | 256×256 | 4×2 / 1024×512 | (0.5, 0.85) | 祭坛守护者：手中香炉和身上缭绕的魂火（**循环**，fx.json 里 loop 写 true） | `a ghostly soul flame flickering upward from a small base point, slender wavy tongues of cold fire with wispy curls breaking off at the top, a seamless looping flicker cycle where frame 8 flows back into frame 1` |
| `summon_circle` | 8 | 512×512 | 4×2 / 2048×1024 | (0.5, 0.5) | 祭坛守护者：召唤、读条时地面上成形的法阵（引擎压扁成地面透视） | `an ORIGINAL abstract summoning circle seen from directly above, forming over time: frame 1 a bright point and a thin outer ring snapping into place, then concentric rings and original geometric glyph-like marks (not letters of any real writing system) draw themselves around the circle, the last frames fully formed and pulsing slightly brighter` |

帧数合计：8 + 6 + 8 + 8 = **30 帧**。

**接入方式**：只在对应首领的关卡载入、离开就释放（和首领图集一样）；骨刺和斩痕接到骸骨统领的砸地、横斩；魂火挂在祭坛守护者的香炉和身上；召唤法阵接到读条和召唤。

---

## 八、验收标准（我接入前会逐项检查）

1. **灰度 + 透明**：没有颜色、没有底色；发光类的边缘平滑衰减到 0，没有一圈灰边或硬切口
2. **锚点稳定**：序列帧叠帧检查（所有帧叠在一起）时，特效中心不漂移
3. **第一帧有冲击力**，最后一帧几乎透明；循环的魂火首尾无缝
4. **染色后好看**：在 `#1a1420` 暗底上分别染成青、金、红、绿，缩到 50% 依然清楚、不糊
5. **成对的地裂**：crackglow 叠在 crack 上逐像素对齐
6. **原创**：符文和法阵是抽象几何纹样，不含任何真实文字；不照搬任何现有游戏的特效造型
7. **包完整**：`unzip -t` 通过；`fx.json` 列出的每个文件都存在、尺寸和写的一致

---

## 九、给 Codex 的总说明（请原样转给 Codex）

```
请为原创 2D 横版动作游戏《残光之刃》生成三套特效素材包，规格、清单和每一项的英文提示词都在 docs/ART_FX.md：

1. fx_textures_v1.zip —— 第五节的 26 张单张贴图（最优先，先交这个包）
2. fx_hero_v1.zip —— 第六节的 12 组序列帧
3. fx_boss_v1.zip —— 第七节的 4 组序列帧

要求：
- 严格按第三节的通用规格：只用灰度、真实透明通道、主体不碰边、序列帧每格锚点一致、第一帧最强最后一帧几乎透明
- 每一项都用第四节的模板，把表格里的【内容】填进去生成；序列帧用模板里的网格布局一次生成整张拼表，再切成单帧
- 地裂的 crackglow_01 / crackglow_02 必须拿 crack_01 / crack_02 作为参考图生成，保证裂缝形状逐像素对齐
- 文件结构和 fx.json 按第三节；每个包附 docs/contact_sheet.png 和 docs/tinted_preview.png
- 保持原创：不照搬任何现有游戏的特效、符文、标志；符文是抽象几何纹样，不含任何真实文字
- 某一组序列帧如果反复生成都不稳定（锚点漂移、帧之间不连贯），先交一个 4 帧版本，并在 README_zh.md 里注明
- 打包后用 unzip -t 自检，上传到 GitHub Release assets-v5，文件名 fx_textures_v1.zip、fx_hero_v1.zip、fx_boss_v1.zip
- 不要改游戏代码，不要接入素材，只生成和打包素材
```
