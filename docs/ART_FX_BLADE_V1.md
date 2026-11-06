# 素材包规格：`fx_blade_v1`（刀光：刀尖最亮、往刀柄方向渐暗）

对应 Godot 前问题解决阶段第 6 项（刀光是一块亮度均匀的半圆）和第 14 项的 14.1 / 14.2 / 14.9（刀光拖尾、新月刀光、剑气还是代码画的）。诊断见 `docs/AUDIT_PRE_GODOT.md`。
本包是本阶段的**第二包**（第一包 `hero_fix_v1` 已验收接入）。

## 一、要解决什么

现在主角挥刀时的刀光由三样东西叠成：
1. 代码画的拖尾色带（`player.js drawSpriteTrail`）：每一小段从内沿到外沿**一种颜色**，所以宽度方向亮度是平的；
2. 代码画的新月（`fx.js drawArc`）：三层纯色带；
3. 手绘序列帧 `slash_sweep / slash_rise / slash_down / slash_spin / slash_cross`（`fx_hero_v1`）：整体偏均匀。

要的效果：**最亮的是刀尖扫过的那条外沿**，往刀柄方向（往弧的内侧）**平滑渐暗**到透明；新的那一端亮、旧的那一端散成光片消失。普攻和技能都一样，要贴着刀尖的真实轨迹。
按永久规则，最终画面上不能再有代码画的刀光形状：代码只负责「把贴图沿刀尖轨迹铺开、按时间淡出、按颜色染色」。

## 二、包里的内容

### A. 刀光条带贴图（3 张 + 1 张刀尖光）—— 拖尾、敌人 / 首领的新月刀光都用它

引擎把条带**沿刀尖轨迹弯曲铺开**（每一小段按刀尖点和刀身内侧点组成的四边形贴一段），所以条带本身画成**一条水平的直带**。

坐标约定（非常重要）：
- **横向（U，从左到右）= 沿着拖尾**：右端 = 最新（刀现在的位置），左端 = 最旧（尾巴）。
- **纵向（V，从上到下）= 拖尾的宽度**：**上沿 = 刀尖扫过的外沿（最亮）**，下沿 = 靠近刀柄的内沿（完全透明）。

| id | 画布 | 用途 | 内容 |
|---|---|---|---|
| `blade_ribbon_light` | 1024×128 | 普攻（轻） | 细、利落；外沿一条很亮的细线，往下快速衰减 |
| `blade_ribbon_heavy` | 1024×192 | 重击、第三段、下劈 | 更宽、更厚，外沿亮带更粗，带少量碎光片 |
| `blade_ribbon_skill` | 1024×192 | 技能（裂空斩、回风斩、千刃） | 外沿亮带 + 内部有能量流纹（沿 U 方向的细长笔触），尾端碎成光片 |
| `blade_tip_flare` | 128×128 | 刀尖当前位置的一点亮光（叠在条带最新端的上沿） | 中心近白的小星芒，柔和衰减，锚点居中 |

**亮度分布（纵向 V，按条带高度的比例；数值是灰度 0～1，误差 ±0.1）**：

| V 位置 | 0%（上沿） | 4% | 12% | 25% | 45% | 70% | 100%（下沿） |
|---|---|---|---|---|---|---|---|
| 亮度 | 0.85 | **1.0（最亮）** | 0.75 | 0.45 | 0.2 | 0.06 | 0 |

- 上沿不是硬切口：0%→4% 是很短的一段柔和过渡（不能有一圈灰边）。
- **横向（U）**：右端最后 15% 最亮（1.0 倍）；中段约 0.7 倍；左端最后 20% 逐渐散成细小光片和光点，到最左边完全透明。
- 条带里要有**沿 U 方向的速度纹理**（细长笔刷线、轻微不规则），不能是一块平滑的渐变——平滑渐变就是代码画的样子。

### B. 重画的刀光序列帧（5 组，32 帧）—— 直接替换 `fx_hero_v1` 里的同名组

**id、帧数、格子、布局、锚点和 `fx_hero_v1` 完全一样**（见 `docs/ART_FX.md` 第六节的表），引擎不用改映射；只改亮度分布：

- 新月形刀光的**外沿（离锚点远的那一侧，刀尖扫过的轨迹）最亮**，按上面同样的比例往弧的内侧（靠近锚点 / 刀柄）渐暗到透明；
- 第 1 帧最亮最锐利，之后从尾部变细、散成光片、淡出，最后一帧几乎完全透明；
- 光片、碎屑也主要分布在外沿附近。

| id | 帧数 | 格子 | 布局 / 画布 | 锚点 |
|---|---|---|---|---|
| `slash_sweep` | 6 | 512×256 | 4×2 / 2048×512 | (0.3, 0.5) |
| `slash_rise` | 6 | 512×512 | 4×2 / 2048×1024 | (0.3, 0.6) |
| `slash_down` | 6 | 512×512 | 4×2 / 2048×1024 | (0.3, 0.4) |
| `slash_spin` | 8 | 512×512 | 4×2 / 2048×1024 | (0.5, 0.5) |
| `slash_cross` | 6 | 512×512 | 4×2 / 2048×1024 | (0.5, 0.5) |

`slash_spin`（回风斩）：环的**外圈**最亮、往圆心渐暗。`slash_cross`（十字斩）：两道斩痕各自的**前缘**最亮、后缘渐暗，交叉点一闪。

### C. 剑气（1 组，8 帧）—— 替换代码画的剑气（裂空斩、残影的波）

| id | 帧数 | 格子 | 布局 / 画布 | 锚点 | 循环 | 内容 |
|---|---|---|---|---|---|---|
| `wave_crescent` | 8 | 512×256 | 4×2 / 2048×512 | (0.5, 0.5) | 是（飞行中循环播放，首尾无缝） | 竖立的新月形剑气朝右飞行：**前缘（右侧弧）最亮**，往后渐暗，尾部拖出碎光片；帧之间能量纹流动、外沿轻微闪烁 |

合计：贴图 4 张，序列帧 6 组 40 帧。

## 三、通用规格（沿用 `docs/ART_FX.md` 第三节）

- **只用灰度**，白色 = 最亮；引擎运行时按武器 / 角色 / 首领颜色染色。
- **真实透明通道（直通 alpha）**，无背景；全部是发光类，`blend: "add"`。
- 主体四周留透明边（条带的上下沿除外：条带本身就是横跨全宽的，但左右两端要渐隐到透明，不能有切口）。
- 序列帧每格同样大小，每格的特效对准同一个锚点；每行 4 格，6 帧的组按 4×2 排、空 2 格透明。
- 原创暗黑幻想风：手绘笔刷感的能量线条，锐利形状 + 柔和衰减；「残光」意象——能量消散时碎成细小光片，像余烬慢慢飘走。不要照搬任何现有游戏的特效。
- 不要画角色、武器、文字、帧号、边框。

## 四、文件结构（`afterglow.fxpack.v1`）

```
fx_blade_v1/
  README_zh.md
  fx.json
  textures/blade_ribbon_light.png
  textures/blade_ribbon_heavy.png
  textures/blade_ribbon_skill.png
  textures/blade_tip_flare.png
  frames/<id>/<id>_00.png …      （slash_sweep / slash_rise / slash_down / slash_spin / slash_cross / wave_crescent）
  sheets/<id>.png
  docs/contact_sheet.png         （全部内容在暗底上的总览）
  docs/tinted_preview.png        （同一批图染成青 #7ff3ff、金 #ffd65a、红 #ff4d4d、紫 #b46bff，叠在暗底上）
  docs/ribbon_profile.png        （三张条带各自沿 V 方向的平均亮度曲线，标出第二节表里的目标值）
  docs/arc_preview.png           （把三张条带分别弯成 120° 的弧铺开：外沿亮、内侧暗的效果；弧的外侧 = 条带上沿）
```

`fx.json` 例子（和 `fx_hero_v1` 同格式）：

```json
{
  "schema": "afterglow.fxpack.v1",
  "textures": [
    { "id": "blade_ribbon_light", "file": "textures/blade_ribbon_light.png", "w": 1024, "h": 128, "anchor": [1.0, 0.0], "blend": "add" },
    { "id": "blade_tip_flare", "file": "textures/blade_tip_flare.png", "w": 128, "h": 128, "anchor": [0.5, 0.5], "blend": "add" }
  ],
  "flipbooks": [
    { "id": "slash_sweep", "frames": ["frames/slash_sweep/slash_sweep_00.png"], "w": 512, "h": 256, "anchor": [0.3, 0.5], "fps": 30, "loop": false, "blend": "add" },
    { "id": "wave_crescent", "frames": ["frames/wave_crescent/wave_crescent_00.png"], "w": 512, "h": 256, "anchor": [0.5, 0.5], "fps": 20, "loop": true, "blend": "add" }
  ]
}
```

条带的 `anchor` 写 `[1.0, 0.0]`（右上角 = 最新端的刀尖外沿）。

打包成 `fx_blade_v1.zip`，上传到新的 GitHub Release（仓库 `leograntquinn-crypto/afterglow-blade`）。

## 五、交付前自查（我接入前会逐项验收）

1. **亮度分布**：三张条带沿 V 方向的平均亮度（只算不透明部分，按 alpha 加权）和第二节表格的误差 ≤ 0.1；最亮点在 V = 2%～8%。
2. **条带方向**：上沿最亮、下沿透明；右端最新最亮、左端散开透明——方向反了整包不能用。
3. **不是平滑渐变**：条带里有沿 U 方向的笔刷速度纹理和光片（放大看不是一块干净的渐变色）。
4. **序列帧**：5 组替换帧的 id、帧数、格子、锚点和 `fx_hero_v1` 一致；每组的外沿明显比内侧亮（`arc_preview` 和 `contact_sheet` 上一眼看得出）。
5. `wave_crescent` 首尾帧能无缝循环；前缘最亮。
6. 全部灰度、真实透明、没有硬边灰圈、没有任何东西碰到画布边缘（条带左右两端渐隐）。
7. 文件齐全、命名正确、没有多余的临时文件。

## 六、生成提示词（给 Codex）

### 条带（单张）
```
Asset type: production VFX texture for a 2D side-scrolling action game. Grayscale only (white = brightest energy),
true straight alpha transparency, no background, additive-blend glow art in an original dark-fantasy hand-painted style.
A HORIZONTAL sword-light ribbon strip, canvas {W} x {H} pixels, that a game engine will bend along a sword-tip path.
Orientation is critical: the TOP edge is the sword-tip track and must be the brightest — a crisp near-white hot line
a few pixels below the top, with a very short soft falloff above it; brightness then fades smoothly DOWNWARD to fully
transparent at the bottom edge (bottom = the inner side near the sword handle). The RIGHT end is the newest part and the
brightest; toward the LEFT end the light thins out and breaks into small glowing flakes and specks until it is fully
transparent at the far left. Inside the strip: fine brush-stroke speed lines running horizontally, slight irregularity,
NOT a clean smooth gradient. {VARIANT}
No characters, no weapons, no text, no borders.
```
`{VARIANT}`：
- light（1024×128）：`thin and sharp, a single bright edge line, quick falloff, very few flakes.`
- heavy（1024×192）：`wider and thicker, a broad bright edge band, more flakes breaking off the tail, a heavier feel.`
- skill（1024×192）：`a bright edge band plus flowing energy filaments inside the strip, the tail shattering into many luminous shards.`

### 刀尖光（单张，128×128）
```
（同上的灰度、透明、发光要求）A small sword-tip flare: a near-white core with a few short sharp rays, soft falloff, centered.
```

### 刀光序列帧（替换 fx_hero_v1 的同名组）
沿用 `docs/ART_FX.md` 第六节各组的【内容】描述和布局，并加上：
```
BRIGHTNESS DISTRIBUTION IS CRITICAL: the OUTER edge of the crescent (the side farthest from the anchor, traced by the
sword tip) is the brightest near-white line; brightness fades smoothly INWARD toward the anchor / sword handle until fully
transparent. Light shards and specks gather near the outer edge. Not uniformly bright.
```

### 剑气 `wave_crescent`（8 帧，4×2，2048×512，每格 512×256，循环）
```
（同上的灰度、透明、发光、序列帧要求）An upright crescent-shaped sword wave flying to the right: the leading (right-hand)
curved edge is the brightest near-white line, brightness fades toward the back, a short trail of breaking light shards
behind it; energy filaments flow inside from frame to frame and the edge flickers slightly; frames 1 and 8 must loop
seamlessly. The wave stays centered on the anchor in every frame (the engine moves it).
```

## 七、接入（我这边）

- `tools/build_fx.py` 打成图集（桌面 / 手机），同名序列帧组覆盖 `fx_hero_v1` 里的旧组。
- `player.js`：拖尾改成「沿刀尖轨迹铺条带贴图」——每一小段用刀尖点和刀身内侧点组成的四边形，把条带对应的一段仿射贴上去（上沿对着刀尖轨迹）；轻击 / 重击 / 技能按招式选条带；最新端叠刀尖光。代码画的色带删掉。
- `fx.js drawArc`（敌人和首领的新月刀光）改成同一套条带贴图（按角色染色）；代码画的新月删掉。
- `combat.js` 剑气改成 `wave_crescent` 序列帧；代码画的椭圆新月删掉。
- 验收：截图对比（普攻三段、上挑、技能、空中招、敌人 / 首领刀光，桌面 + 手机）、全套测试、帧率。
