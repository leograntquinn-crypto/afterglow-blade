# 素材包规格：`fx_boss_bone_v2`（首领「骸骨统领」专属特效·第二版）

对应 Godot 前问题解决阶段**第 9 项**（五名首领逐个补身份）和第 14 项清单的 **14.12（首领招式光效）**（`docs/AUDIT_PRE_GODOT.md`）。
> **SPEC READY FOR CODEX：fx_boss_bone_v2**（规格定稿 2026-11-08）
> 一个 zip `fx_boss_bone_v2.zip`：贴图 2 张 + 序列帧 8 组 66 帧。
> 两步：先交 `docs/preview.png`（每组一帧 + 每张贴图），**Muse 审查通过**后出全帧打包。

这是子轮 H 的**第 4 包**（顺序见 `docs/AUDIT_PRE_GODOT.md` 第 9 项「子轮 H 素材包计划」）。
骸骨统领是第 1 关的首领，已经有第一版专属特效 `fx_bone`（FX-3：地面骨刺 `bone_spikes`、巨剑斩痕 `bone_rend`），本包**只补缺的，不重画这两组**。

**身份：「拼合的骨」**。它的招式围绕骨头**拆散 → 飞回 → 重组**：
- 被打碎的骨片会飞回它身上；
- 骨牢一圈圈收紧；
- 读条「亡骨号令」是骨堆重组、全场骨矛破土。

颜色是骨白（带颜色的实物）+ 引擎染的暗红 `#ff5a3c`（骨髓里的光）。

## 一、要替换什么

骸骨统领：基于腐骨兵的首领，身高约 123 逻辑像素（素材按**身高 260 交付像素**的人画），颜色 `#ff5a3c`。
- 通用招式在 `boss.js`：combo、slam、charge、shockwave、summon、channel「亡骨号令」；
- 专属招式在 `boss_moves.js`：boneCage 骨牢、rendChase 裂地追斩。

| 招式 / 时刻 | 现在 | 换成 |
|---|---|---|
| 三连斩、重砸 / 冲击波 / 骨牢 / 裂地追斩的骨刺 | `fx_bone` 的 `bone_rend`、`bone_spikes`（**保留，不重画**） | —— |
| 骨牢：收紧的预警 | 七个通用地面红圈（每根骨刺一个） | 圈中心一道往里收的 `cage_tighten`（一圈骨齿压扁成地面透视，越收越小）；七个红圈之间用 `marrow_tether` 连成一圈（缺口那一处不连——缺口就是逃生路线，必须看得出来） |
| 裂地追斩、冲锋：巨剑拖地 | 尘土粒子 | 剑尖 `drag_sparks`（拖地的火星和骨屑，循环） |
| 被重击 / 破防：骨片飞散 | 通用碎片（掉在地上） | 几片 `shard_return` 先飞散、停一下、再**沿弧线飞回它身上**（「拆散 → 重组」），飞回时身后拖一段 `marrow_tether` |
| 第二阶段「骨骸重新拼合，发出愤怒的咆哮」 | 横幅 + 全屏闪光 | `bone_reform`（散落的骨头飞回、一节节拼回人形，最后骨缝里亮一下暗红） |
| 读条「亡骨号令」 | 通用符文圈 + 每 20 帧一个通用冲击环 | 脚下 `bone_sigil` + 身上 `marrow_glow`；读条结束 `bone_call_burst`（全场骨矛破土） |
| 召唤腐骨兵 | 通用符文圈 + 闪光 | 脚下 `bone_sigil`；每个小怪出现的地方 `summon_rise`（骨手从地里扒出来） |
| 死亡 | 首领通用：光点消散 | `bonelord_death`（巨大的骨架散落成骨堆，骨缝里的暗红光一点点熄灭，最后只剩骨堆） |

## 二、交付

一个 zip。第 1 步只交 `docs/preview.png`：每组序列帧取关键的一帧、每张贴图一格，暗底网格，标 id；另加一格把 `bonelord_death` 的最后一帧和 `fx_enemy_v1` 的 `bone_collapse` 最后一帧并排（首领的骨堆要明显更大、更「巨」）。**Muse 审查通过**后第 2 步出全帧、打包。

## 三、包里的内容

「染色」= 引擎按情况染色，素材只画灰度。锚点按画布比例 (x, y)。

### A. 贴图（2 张）

| id | 画布 | 锚点 | 混合 | 内容 |
|---|---|---|---|---|
| `bone_sigil` | 512×256 | (0.5, 0.5) | add，灰度 | 地面法阵（压扁成地面透视，宽:高 = 2:1）：一圈脊椎骨首尾相接排成的环，环里是交错的肋骨纹样和一个抽象的颅骨轮廓（抽象纹样，不是文字），笔触粗糙 |
| `marrow_tether` | 256×32 | (0.5, 0.5) | add，灰度 | 骨髓光丝：一条细的、有脉动结节的光线（像一节节骨髓里透出的光），中线最亮、上下快速衰减；**左右四方连续可平铺**（引擎沿两点之间铺） |

### B. 序列帧（8 组 66 帧）

| id | 画布 × 帧 | 锚点 | 混合 | fps | 循环 | 内容 |
|---|---|---|---|---|---|---|
| `cage_tighten` | 512×256 × 8 | (0.5, 0.5) | add，灰度 | 12 | 循环 | 骨牢收紧：一圈尖骨齿排成的环（压扁成地面透视），齿尖朝里，整圈慢慢往里收、亮度一跳一跳（引擎另外按预警进度把整张缩小）；首尾无缝 |
| `drag_sparks` | 256×128 × 6 | (0.8, 0.8) 剑尖着地点 | add，灰度 | 16 | 循环 | 巨剑拖地：剑尖着地点往后（左边）甩出火星和细碎的骨屑亮边，地面上一道划痕光；首尾无缝 |
| `shard_return` | 128×128 × 8 | (0.5, 0.5) | **normal，带颜色** | 16 | 循环 | 一片翻滚的骨片（骨白带裂纹，断口处一点暗红光），原地翻转一圈（位移由引擎做）；首尾无缝 |
| `bone_reform` | 256×384 × 10 | (0.5, 0.92) 脚底 | **normal，带颜色** | 14 | 一次 | 重新拼合：四周的骨头飞回来、一节节拼成一个高大人形的骨架轮廓，最后两帧骨缝里亮一下暗红再暗下去；最后一帧完全消失（身体由引擎画） |
| `marrow_glow` | 256×384 × 8 | (0.5, 0.92) 脚底 | add，灰度 | 12 | 循环 | 读条「亡骨号令」：暗红的光从脚下沿着脊椎、肋骨的位置往上流（人形只是光的路径，不画身体），胸口最亮；首尾无缝 |
| `bone_call_burst` | 512×384 × 8 | (0.5, 0.9) 地面 | add，灰度 | 20 | 一次 | 「亡骨号令」爆发：一大片发光的骨矛从地面破土而出（前 3 帧依次冒出、第 4 帧最高最亮），然后碎成骨屑光点落下；最后一帧完全消失 |
| `summon_rise` | 256×256 × 8 | (0.5, 0.9) 地面 | **normal，带颜色** | 14 | 一次 | 召唤：地面裂开，几只骨手扒出来、带起碎土和骨屑，然后沉下去（小怪由引擎在这里出现）；最后一帧完全消失 |
| `bonelord_death` | 384×384 × 10 | (0.5, 0.9) 地面 | **normal，带颜色** | 12 | 一次 | 死亡：巨大的骨架散落、塌成一大堆骨头（颅骨滚落在最上面），骨缝里的暗红光一点点熄灭；**最后一帧停在骨堆**（引擎停留后淡出，和 `bone_collapse` 的做法一样） |

合计：贴图 2 张 + 序列帧 8 组 66 帧。

## 四、通用规格（沿用 `docs/ART_FX.md` 第三节、`docs/ART_FX_ENEMY_V1.md` 第四节）

- **发光类（`add`）只用灰度**（R = G = B），引擎染暗红；直通 alpha，无背景；从亮处平滑衰减到 0，边缘不能有硬切口或灰圈；四角和边缘中点 alpha 为 0。
- **标了「带颜色」的（`shard_return`、`bone_reform`、`summon_rise`、`bonelord_death`）是实物**：骨白、暗黄的裂纹、断口处一点暗红光；和角色同一套暗黑手绘风格、光源左上，普通混合。要和 `fx_bone` 的骨刺、`fx_enemy_v1` 的骨屑 / 骨堆是**同一种骨头**（颜色、笔触一致），只是更大。
- 贴地的（`bone_sigil`、`cage_tighten`、`drag_sparks`、`bone_call_burst`、`summon_rise`）按地面透视画。
- 不画首领本体、主角、文字、边框；`bone_reform`、`marrow_glow` 里的人形只能是骨头拼出的轮廓 / 光的路径。
- 序列帧每格同样大小、对准同一锚点；**每行 4 格**（6 帧 = 4×2 空 2 格，8 帧 = 4×2，10 帧 = 4×3 空 2 格）。
- 循环组首尾无缝；一次性组最后一帧完全消失（`bonelord_death` 例外：停在骨堆）。
- 原创暗黑幻想风，手绘笔刷质感，不是干净的数学渐变或几何形状；不要照搬任何现有游戏。

## 五、文件结构（`afterglow.fxpack.v1`）

**zip 根目录平铺**：

```
README_zh.md
fx.json
textures/bone_sigil.png、marrow_tether.png
frames/<id>/<id>_00.png …          （8 组）
sheets/<id>.png                     （每组一张 4 列总图）
docs/preview.png                    （第 1 步预览，含骨堆对照格）
docs/contact_sheet.png              （全部帧，暗底）
docs/tinted_preview.png             （发光类染 #ff5a3c 叠在暗底上；marrow_tether 横向平铺 3 次）
```

`fx.json`：`textures` 每项写 `id`、`file`、`w`、`h`、`anchor`、`blend`；`flipbooks` 每项写 `id`、`w`、`h`、`anchor`、`blend`、`fps`、`loop`、`frames`、**`sheet`**。数值按第三节。上传到 GitHub Release（仓库 `leograntquinn-crypto/afterglow-blade`）。

## 六、交付前自查（我接入前会逐项验收）

1. 每项 id、画布、帧数、锚点、fps、loop、blend 和第三节一致；发光类全部灰度；四项「带颜色」的不是灰度。
2. 四角和边缘中点 alpha 为 0；从亮处平滑衰减，没有硬边。
3. 循环组（`cage_tighten`、`drag_sparks`、`shard_return`、`marrow_glow`）首尾无缝；一次性组最后一帧 alpha 总和为峰值帧的 1% 以下（`bonelord_death` 除外：最后两帧逐像素一致、停在骨堆）。
4. `marrow_tether` 左右可平铺（左右各 1 列像素差异很小）。
5. `bone_call_burst` 第 4 帧（下标 3）是全组最亮的一帧。
6. 骨头的颜色和笔触和 `fx_bone`、`fx_enemy_v1` 的 `bone_chips` / `bone_collapse` 一致；`bonelord_death` 的骨堆明显比 `bone_collapse` 大。
7. 文件齐全、命名正确、zip 平铺、`fx.json` 写了 `sheet`；`preview.png` 与最终帧一致。

## 七、生成提示词（给 Codex）

### 通用开头（每张都加）
```
Asset type: production VFX for a 2D side-scrolling dark-fantasy action game (original IP). True straight alpha
transparency, no background, hand-painted brush texture (not clean mathematical gradients or geometric shapes).
No characters, no text, no borders. Glow assets are GRAYSCALE ONLY (the engine tints them dark red).
Theme: a giant skeleton lord whose bones scatter and reassemble - bone-white, yellowed cracks, a dull red glow of marrow.
```

### 各项【内容】（接在通用开头后面；画布、帧数、锚点按第三节）
- `bone_sigil`：`a ground-perspective (2:1 flattened) sigil: a ring of vertebrae linked end to end, inside it interlaced rib motifs and an abstract skull outline (abstract pattern, not letters), rough strokes.`
- `marrow_tether`：`a thin glowing thread with pulsing nodes, like light seen through segments of bone marrow, brightest on the center line with fast falloff; horizontally tileable (seamless left/right edges).`
- `cage_tighten`：`a ground-perspective (2:1 flattened) ring of sharp bone teeth pointing inward, the whole ring slowly contracting with pulsing brightness; 8-frame seamless loop.`
- `drag_sparks`：`a greatsword tip dragging on the ground at the anchor: sparks and small bone-chip rims flung back to the left, a scrape streak of light along the ground; 6-frame seamless loop.`
- `shard_return`（带颜色）：`a single bone shard (bone-white with cracks, a dull red glow at the broken end) tumbling one full turn in place; 8-frame seamless loop; full color, top-left lighting.`
- `bone_reform`（带颜色）：`bones flying in from all sides and snapping together segment by segment into the skeleton outline of a tall figure (260px tall at the anchor), a dull red glow flaring in the joints in the last two frames; one-shot 10 frames, last frame fully transparent; full color.`
- `marrow_glow`：`dark red light flowing upward from the feet along the paths of a spine and ribs (no body drawn, only the light paths), brightest at the chest; 8-frame seamless loop.`
- `bone_call_burst`：`a wide field of glowing spectral bone spears erupting from the ground (rising over frames 0-2, tallest and brightest at frame 3), then shattering into falling bone-chip flecks; one-shot 8 frames, last frame fully transparent.`
- `summon_rise`（带颜色）：`the ground cracking open and several skeletal hands clawing out with dirt and bone chips, then sinking back; one-shot 8 frames, last frame fully transparent; full color.`
- `bonelord_death`（带颜色）：`a giant skeleton collapsing into a large heap of bones with the skull rolling on top, the dull red glow in the cracks slowly dying out; one-shot 10 frames, the last two frames identical (the final bone heap stays); full color.`

## 八、接入（子轮 H，按 Quinn 规则 2 可派 Codex，模式同 `docs/CODEX_TICKETS_H.md` 的 H-5 / H-6 / H-7）

- 构建：`tools/build_fx.py --boss bone`（H-5 做成的表驱动 `--boss`，加一行 `bone` 的规格表；`marrow_tether` 不裁边），打成 `fx_boss_bone_v2`，和现有 `fx_bone` **一起**只在第 1 关载入（`prepareBossFx` 的骸骨统领那一项改成载两套）。
- `BOSS_FX.boneLord` 表 + `src/boss_fx.js` 里补骸骨统领的几处画法；按第一节的表逐项接，素材没载好时不画新增的部分（第 14 项）。
- **骨牢的缺口必须一眼看得出来**：`marrow_tether` 只连相邻的两根骨刺，缺口那一处不连。
- 骨片飞回：受重击 / 破防时生成几片 `shard_return`，飞散 → 停 → 沿弧线飞回首领身上；这是画面表现，不改判定和数值。
- 机制补强（第 9 项「拼合的骨」：骨片飞回、骨牢收紧）我来设计，和特效同一子轮验收。
- 验收：`tools/fxsheet.js` 截图对比（每个招式的关键时刻，桌面 + 手机）、全套测试 + 新的确定性测试（每个时刻选对素材、骨牢缺口那一段没有光丝、`fx_bone` 原有两组照旧）、帧率；「拆散 → 重组」的观感等 Quinn 试玩确认。
