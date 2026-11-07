# 素材包规格：`fx_boss_ironjaw_v1`（首领「铁颚」专属特效）

对应 Godot 前问题解决阶段**第 9 项**（五名首领逐个补身份）和第 14 项清单的 **14.12（首领招式光效）**（`docs/AUDIT_PRE_GODOT.md`）。
> **SPEC READY FOR CODEX：fx_boss_ironjaw_v1**（规格定稿 2026-11-07）
> 一个 zip `fx_boss_ironjaw_v1.zip`：贴图 2 张 + 序列帧 10 组 76 帧。
> 两步：先交 `docs/preview.png`（每组一帧 + 每张贴图），**Muse 审查通过**后出全帧打包。

这是子轮 H 的**第 2 包**（顺序见 `docs/AUDIT_PRE_GODOT.md` 第 9 项「子轮 H 素材包计划」）。铁颚现在完全没有专属特效，是五名首领里「最像换皮」的一个：
- 重砸、冲锋、冲击波、三连斩和骸骨统领是同一套通用光效；
- 读条「断头重锤」和其他首领共用同一圈符文；
- 锁链钩只有现成的钩子 / 链环静止图（ART_V6 的 `iron_jaw_hook`、`iron_jaw_link`），没有任何光效。

它的身份是**「刑场的重量」**：锁链、绞架、断头斧。所有特效都要「重」——火星、铁屑、震裂的石板，颜色是烧红的铁（引擎染 `#ff7a2e` 橙）和冷白的斧刃闪光。

## 一、要替换什么

铁颚：基于铁甲屠夫的首领，身高约 146 逻辑像素（素材仍按**身高 260 交付像素**的人画），颜色 `#ff7a2e`。
- 通用招式在 `boss.js`：slam 重砸、charge 冲锋、combo 三连斩、shockwave 冲击波、summon 召唤、channel 读条「断头重锤」；
- 专属招式在 `boss_moves.js`：chainHook 锁链钩、tripleStomp 刑台三震。

| 招式 / 时刻 | 现在 | 换成 |
|---|---|---|
| 锁链钩：甩出去 | 钩子 / 链环静止图 + 通用光晕 | 链条上叠一层烧红的光 `chain_glow`（沿链条平铺）；钩子图保留 |
| 锁链钩：钩中你 | 只有命中闪光 | `hook_spark`（钩尖咬住的火星迸溅） |
| 锁链钩：把你拖过去 | 无 | 你脚下 `chain_drag`（被拖着走的火星和划痕，循环） |
| 锁链钩：拉到面前那一锤 | 通用尘爆 | `heavy_cleave` + `stomp_quake` |
| 重砸（slam） | 通用红圈 + 通用 `impact_ground` | 落地 `stomp_quake`（红圈照旧） |
| 刑台三震 | 三个通用红圈的通用爆发 | 每一震 `stomp_quake`，一下比一下大（引擎按 1 / 1.2 / 1.5 放大）；第三震往两边炸开 `stomp_wave` |
| 冲击波（shockwave） | 通用地波 | `stomp_wave` |
| 三连斩 / 拉近那一锤的挥砍 | 代码新月 `fx.arc` + 通用刀光 | `heavy_cleave`（沉重的弧形斧光，尾端甩火星）。三连斩这个招式本身子轮 H 会从铁颚身上去掉（第 9 项：和骸骨统领重复），换成拉近重锤为主的招式组合 |
| 冲锋 | 尘土粒子 | 脚下 `charge_sparks`（铁靴刮地的火星，循环） |
| 读条「断头重锤」 | 通用符文圈 + 每 20 帧一个通用冲击环 | 脚下 `execution_mark`（刑场的地面印记，慢慢亮起）+ 斧刃 `headsman_glint`；读条结束 `execution_drop`（一把巨大的断头斧虚影从天而降砸下） |
| 召唤小怪 | 通用符文圈 | `execution_mark` |
| 第二阶段「铁颚扯断了身上的锁链」 | 只有横幅文字 + 全屏闪光 | `chain_break`（身上的锁链一节节崩断、碎片和火星飞散） |
| 死亡 | 首领通用：光点消散 | `ironjaw_death`（火星从甲缝里喷出、锁链落地、余烬升起） |

## 二、交付

一个 zip。第 1 步只交 `docs/preview.png`：每组序列帧取关键的一帧、每张贴图一格，暗底网格，标 id。**Muse 审查通过**后第 2 步出全帧、打包。

## 三、包里的内容

「染色」= 引擎按情况染色，素材只画灰度。锚点按画布比例 (x, y)。

### A. 贴图（2 张）

| id | 画布 | 锚点 | 混合 | 内容 |
|---|---|---|---|---|
| `chain_glow` | 256×32 | (0.5, 0.5) | add，灰度 | 烧红的锁链发出的光：一节节链环形状的亮光（不是连续的光带），中间最亮、上下快速衰减，链环之间有暗的间隙；**左右四方连续可平铺**（引擎沿锁链铺，叠在链环图上） |
| `execution_mark` | 512×256 | (0.5, 0.5) | add，灰度 | 刑场的地面印记（压扁成地面透视，宽:高 = 2:1）：一圈粗糙的、像用烧红的铁烙进石板的环，环里是交叉的两道斧痕和断开的锁链纹样（抽象纹样，不是文字），边缘有焦痕的笔触 |

### B. 序列帧（10 组 76 帧）

| id | 画布 × 帧 | 锚点 | 混合 | fps | 循环 | 内容 |
|---|---|---|---|---|---|---|
| `hook_spark` | 128×128 × 6 | (0.5, 0.5) | add，灰度 | 24 | 一次 | 钩尖咬住：一下尖锐的撞击白点 + 一圈放射状的火星迸溅 + 几片铁屑，迅速散掉；最后一帧完全消失 |
| `chain_drag` | 256×128 × 6 | (0.5, 0.8) 地面 | add，灰度 | 16 | 循环 | 被拖着走：地面上一串往后溅的火星和拉长的划痕光（朝右是拖动方向，火星往左后方甩），贴地；首尾无缝 |
| `heavy_cleave` | 384×384 × 8 | (0.35, 0.55) | add，灰度 | 24 | 一次 | 断头斧的一记重劈：一道宽而厚的弧形斧光从上往前下劈（比 `fx_enemy_v1` 屠夫的 `brute_cleave` 更宽、更慢、更「沉」），弧的外缘锐利、内侧拖着烧红的铁屑和火星；朝右；最后一帧完全消失 |
| `stomp_quake` | 512×256 × 8 | (0.5, 0.5) | add，灰度 | 20 | 一次 | 一震：地面（压扁成地面透视）从中心炸开一圈放射状的裂缝光，裂缝里透出炽光，边缘扬起一圈碎石的亮边，然后裂缝慢慢暗下去；最后一帧完全消失 |
| `stomp_wave` | 512×256 × 8 | (0.5, 0.5) | add，灰度 | 20 | 一次 | 震波：从中心往左右两边推出去的两道贴地的冲击波（压扁成地面透视），波前是翻起的碎石亮边和火星，越往外越淡；最后一帧完全消失 |
| `charge_sparks` | 256×128 × 6 | (0.5, 0.8) 脚底 | add，灰度 | 16 | 循环 | 冲锋：铁靴刮地，脚下往后方（左边）甩出成串的火星和短促的划痕光，贴地；首尾无缝 |
| `headsman_glint` | 256×256 × 6 | (0.5, 0.5) | add，灰度 | 16 | 一次 | 斧刃上一道冷白的长闪光沿着刃口从一端滑到另一端，滑过后留一点星芒再收掉（断头斧举起时）；最后一帧完全消失 |
| `execution_drop` | 384×512 × 8 | (0.5, 0.9) 落点 | add，灰度 | 20 | 一次 | 「断头重锤」的终结：一把巨大的断头斧的发光虚影从画面上方急速落下（前 3 帧），砸进地面（第 4 帧最亮，落点炸开一圈光），然后虚影碎成光屑消散；最后一帧完全消失 |
| `chain_break` | 384×384 × 10 | (0.5, 0.6) | add，灰度 | 16 | 一次 | 扯断锁链：缠在身上的几道锁链（亮边勾出的链环）一节节崩断，碎链和火星往四面飞散；最后一帧完全消失。人形只是锁链缠绕的空位，不画身体 |
| `ironjaw_death` | 384×384 × 10 | (0.5, 0.85) 脚底 | add，灰度 | 14 | 一次 | 死亡：火星从一个倒下的巨大人形轮廓的甲缝里成股喷出，几段锁链的亮边落地弹起，最后余烬缓缓升起散尽；最后一帧完全消失 |

合计：贴图 2 张 + 序列帧 10 组 76 帧。

## 四、通用规格（沿用 `docs/ART_FX.md` 第三节、`docs/ART_FX_ENEMY_V1.md` 第四节）

- **全部是发光类（`add`）、只用灰度**（R = G = B），引擎统一染烧红铁的橙色（斧刃的冷白闪光也由引擎染）；直通 alpha，无背景；从亮处平滑衰减到 0，边缘不能有硬切口或灰圈；四角和边缘中点 alpha 为 0。
- 贴地的（`chain_drag`、`stomp_quake`、`stomp_wave`、`execution_mark`、`charge_sparks`）按地面透视压扁画（宽:高 约 2:1 的椭圆范围）。
- 不画角色本体（首领、主角都不画）、文字、边框；`chain_break`、`ironjaw_death` 里的人形只能是锁链 / 火星勾出的空位或轮廓亮边。
- 序列帧每格同样大小、对准同一锚点；**每行 4 格**（6 帧 = 4×2 空 2 格，8 帧 = 4×2，10 帧 = 4×3 空 2 格）。
- 循环组首尾无缝（最后一帧到第一帧的差异不大于相邻帧之间的差异）；一次性组最后一帧完全消失。
- 原创暗黑幻想风，手绘笔刷质感，不是干净的数学渐变或几何形状；不要照搬任何现有游戏。

## 五、文件结构（`afterglow.fxpack.v1`）

**zip 根目录平铺**（不要再套一层 `fx_boss_ironjaw_v1/` 顶层目录）：

```
README_zh.md
fx.json
textures/chain_glow.png、execution_mark.png
frames/<id>/<id>_00.png …          （10 组）
sheets/<id>.png                     （每组一张 4 列总图）
docs/preview.png                    （第 1 步预览）
docs/contact_sheet.png              （全部帧，暗底）
docs/tinted_preview.png             （全部染 #ff7a2e 叠在暗底上；chain_glow 横向平铺 3 次）
```

`fx.json`：`textures` 每项写 `id`、`file`、`w`、`h`、`anchor`、`blend`；`flipbooks` 每项写 `id`、`w`、`h`、`anchor`、`blend`、`fps`、`loop`、`frames`（单帧路径列表）、**`sheet`（`"sheets/<id>.png"`）**。数值按第三节。上传到 GitHub Release（仓库 `leograntquinn-crypto/afterglow-blade`）。

## 六、交付前自查（我接入前会逐项验收）

1. 每项 id、画布、帧数、锚点、fps、loop、blend 和第三节一致；全部灰度（R = G = B）。
2. 四角和边缘中点 alpha 为 0；从亮处平滑衰减，没有硬边。
3. 循环组（`chain_drag`、`charge_sparks`）首尾无缝；一次性组最后一帧 alpha 总和为峰值帧的 1% 以下。
4. `chain_glow` 左右可平铺（左右各 1 列像素差异很小），亮光是一节节的链环，不是连续光带。
5. `heavy_cleave` 和 `fx_enemy_v1` 的 `brute_cleave` 并排放，一眼看得出更宽更重；`stomp_quake` 和 `fx_hero` 的 `impact_ground` 并排放，一眼分得开（裂缝透光 vs 通用尘爆）。
6. `execution_drop` 第 4 帧是全组最亮的一帧（砸下的瞬间）。
7. 文件齐全、命名正确、zip 平铺、`fx.json` 写了 `sheet`；`preview.png` 与最终帧一致。

## 七、生成提示词（给 Codex）

### 通用开头（每张都加）
```
Asset type: production VFX for a 2D side-scrolling dark-fantasy action game (original IP). True straight alpha
transparency, no background, hand-painted brush texture (not clean mathematical gradients or geometric shapes).
No characters, no text, no borders. GRAYSCALE ONLY (the engine tints them).
Theme: an executioner boss - heavy chains, a headsman's axe, red-hot iron, sparks, cracked flagstones. Everything must feel HEAVY.
```

### 各项【内容】（接在通用开头后面；画布、帧数、锚点按第三节）
- `chain_glow`：`the glow of a red-hot chain: separate glowing chain-link shapes (not a continuous beam) with dark gaps between links, brightest on the center line with fast falloff; horizontally tileable (seamless left/right edges).`
- `execution_mark`：`a ground-perspective (2:1 flattened) brand mark: a rough ring burned into flagstone like red-hot iron, inside it two crossing axe gouges and a broken-chain motif (abstract pattern, not letters), scorched brush-stroke edges.`
- `hook_spark`：`a hook biting into its target: a sharp white impact point, a radial burst of sparks and a few iron shavings, dispersing quickly; one-shot 6 frames, last frame fully transparent.`
- `chain_drag`：`being dragged across the ground: a trail of sparks flung back to the left and stretched scrape marks of light on a flattened ground plane, dragging direction is to the right; 6-frame seamless loop.`
- `heavy_cleave`：`a single heavy executioner's-axe chop: a wide, thick arc of light sweeping from above down and forward, slower and heavier than a normal slash, sharp outer edge, red-hot iron shavings and sparks trailing on the inner side; facing right; one-shot 8 frames, last frame fully transparent.`
- `stomp_quake`：`a massive stomp on a flattened ground plane: radial cracks of light bursting from the center with searing light inside the cracks, a ring of flying rubble rims at the edge, then the cracks slowly dim; one-shot 8 frames, last frame fully transparent.`
- `stomp_wave`：`two ground-hugging shockwaves pushing out to the left and right from the center on a flattened ground plane, wave fronts of upturned rubble rims and sparks, fading farther out; one-shot 8 frames, last frame fully transparent.`
- `charge_sparks`：`iron boots scraping the ground while charging: strings of sparks and short scrape streaks flung back to the left from the feet, ground-hugging; 6-frame seamless loop.`
- `headsman_glint`：`a long cold glint sliding along the edge of a raised axe blade from one end to the other, leaving a small star glint that then fades; one-shot 6 frames, last frame fully transparent.`
- `execution_drop`：`the finale of an execution: a giant glowing phantom headsman's axe plunges from the top (frames 0-2), strikes the ground (frame 3 is the brightest, a burst of light at the anchor), then the phantom shatters into light flecks and vanishes; one-shot 8 frames, last frame fully transparent.`
- `chain_break`：`several chains wrapped around an (unseen) body snapping link by link, chain fragments (drawn by their bright rims) and sparks flying outward; one-shot 10 frames, last frame fully transparent.`
- `ironjaw_death`：`jets of sparks bursting from the armor seams of a huge collapsing figure outline, a few chain segments (bright rims) dropping and bouncing, embers slowly rising and dying out; one-shot 10 frames, last frame fully transparent.`

## 八、接入（子轮 H，按 Quinn 规则 2 可派 Codex，模式同 `docs/CODEX_TICKETS_H.md` 的 H-1 / H-2 / H-3）

- 构建：`tools/build_fx.py --boss ironjaw`（H-1 做出的 `--boss` 模式直接复用），打成 `fx_boss_ironjaw`，只在铁颚那一关载入（`prepareBossFx` 加 `ironJaw: 'ironjaw'`）。
- `fx_data.js` 的 `BOSS_FX.ironJaw` 表 + `src/boss_fx.js`（夜鸦接入时建立的画法文件）里补铁颚的几处画法；按第一节的表逐项替换，素材没载好时不画新增的部分（第 14 项）。
- **只有铁颚**换：重砸 / 冲击波的地面爆发在 `Hazard` 上用可选字段 `art`（现有字段，骸骨统领的 `bone_spikes` 就是这么接的）按首领传入，不在 `combat.js` 里写死首领名；其他首领的重砸照旧。
- 机制补强（第 9 项「刑场的重量」：锁链把你拉到刑台上、去掉和骸骨统领重复的三连斩）我来设计，和特效同一子轮验收。
- 验收：截图对比（每个招式的关键时刻，桌面 + 手机）、全套测试 + 新的确定性测试（每个时刻选对素材、只有铁颚的重砸换了、三震一下比一下大）、帧率；「重」的手感等 Quinn 试玩确认。
