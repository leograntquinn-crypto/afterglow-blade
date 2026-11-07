# 素材包规格：`fx_boss_raven_v1`（首领「夜鸦」专属特效）

对应 Godot 前问题解决阶段**第 9 项**（五名首领逐个补身份）和第 14 项清单的 **14.10（夜鸦的羽毛、首领的箭）、14.12（首领招式光效）**（`docs/AUDIT_PRE_GODOT.md`）。
> **SPEC READY FOR CODEX：fx_boss_raven_v1**（规格定稿 2026-11-07）
> 一个 zip `fx_boss_raven_v1.zip`：贴图 4 张 + 序列帧 10 组 76 帧。
> 两步：先交 `docs/preview.png`（每组一帧 + 每张贴图），**Muse 审查通过**后出全帧打包。

这是子轮 H（第 9 项首领专属特效）的**第 1 包**，五包的顺序和分工见 `docs/AUDIT_PRE_GODOT.md` 第 9 项「子轮 H 素材包计划」。为什么先做夜鸦：
- 五名首领里，它和铁颚、残影一样**完全没有专属特效**；
- 它的身份（「看不清的猎手」：光线压暗、只在羽毛闪光时现身）几乎全靠视觉撑；
- 现在它的箭雨借的是火球陨石（和「夜幕」完全不搭），分身只是把身体半透明再画两遍。

## 一、要替换什么

夜鸦：基于影弓手的首领，身高约 113 逻辑像素（素材仍按**身高 260 交付像素**的人画），颜色 `#ff4dd2`（洋红）。招式在 `boss.js`（通用：volley 三线齐射、teleport 瞬移斩、rain 天降、summon 召唤、channel 读条「夜幕箭雨」）和 `boss_moves.js`（专属：featherRang 回旋羽、ravenSplit 鸦影分身）。

| 招式 / 时刻 | 现在 | 换成 |
|---|---|---|
| 回旋羽（羽刃飞出去再飞回来） | 一张静止的羽刃图（ART_V6 `night_raven_feather`）由代码旋转 + 两道染色残影 + 通用光晕 | `feather_blade_spin`（转动的羽刃，带刃口闪光）+ 拖尾 `feather_trail`；掉头那一刻 `feather_burst` 小号 |
| 鸦影分身：化作黑羽 | 通用魂火粒子染成深紫 | `feather_burst` |
| 分身浮现 | 身体淡入 | `raven_appear`（羽毛聚拢成人形） |
| 分身存在期间 | 两个半透明的身体 | 三个身影（真身也一样）都带 `split_wisps`；**分辨真身的线索仍然只有脚下的影子**，不能让特效泄露真身 |
| 识破 / 分身散掉 | 通用魂火粒子 | 分身位置 `feather_burst` |
| 三线齐射、分身的箭、读条的箭 | 敌人通用的箭（`fx_enemy_v1` 的 `arrow`） | `raven_arrow`（夜鸦自己的黑羽箭）；拖尾仍用 `arrow_trail` 染洋红 |
| 齐射的预警 | 只有地面光带 | 加弓上的 `bow_glint`（「只在羽毛闪光时现身」：出手前弓弦上一点洋红闪光） |
| 瞬移斩：消失 / 出现 | 通用能量环 | `feather_burst` → `raven_appear` |
| 天降 | 火球 `meteor`（借来的） | `arrow_rain`（成束的箭从天而降）+ 落地 `rain_impact`；地面预警圈照旧 |
| 读条「夜幕箭雨」 | 通用符文圈 + 每 20 帧一个通用冲击环 | 脚下 `raven_sigil` + 身上 `channel_gather`；读条结束全场 `night_veil` 一闪 |
| 召唤小怪 | 通用符文圈 | `raven_sigil` |
| 第二阶段「夜色笼罩了整条回廊」 | 只有横幅文字 | `night_veil` 常驻压暗（主角周围留一圈能看清的地方）+ 空中飘落的 `feather_drift`（具体机制子轮 H 设计） |
| 死亡 | 首领通用：光点消散 | `raven_death`（身体崩散成一群黑羽） |

## 二、交付

一个 zip。第 1 步只交 `docs/preview.png`：每组序列帧取关键的一帧、每张贴图一格，暗底网格，标 id；`night_veil` 缩小放一格。**Muse 审查通过**后第 2 步出全帧、打包。

## 三、包里的内容

「染色」= 引擎按情况染色，素材只画灰度。锚点按画布比例 (x, y)。

### A. 贴图（4 张）

| id | 画布 | 锚点 | 混合 | 内容 |
|---|---|---|---|---|
| `feather_trail` | 256×64 | (1.0, 0.5) 右端 | add，灰度 | 回旋羽身后的拖尾：右端最亮，往左拉长、散成几片细小的羽毛剪影和光屑（引擎沿飞行方向旋转，染洋红） |
| `raven_arrow` | 128×32 | (0.85, 0.5) 箭头尖 | **normal，带颜色** | 夜鸦的箭：乌木箭杆、骨白色细长箭头、**两片乌黑的大鸦羽**做箭羽，羽毛边缘一线暗洋红反光；朝右。和角色同风格、光源左上。要和 `fx_enemy_v1` 的影弓手箭（骨杆、黑铁头、暗紫羽）一眼分得开：更长、羽毛更大更黑 |
| `raven_sigil` | 512×256 | (0.5, 0.5) | add，灰度 | 地面法阵（压扁成地面透视，宽:高 = 2:1）：一圈羽毛排成的环，环里是交错的羽毛和一只抽象的鸦眼图形（抽象纹样，不是文字）。读条、召唤用，引擎染洋红、慢慢转 |
| `night_veil` | 1024×512 | (0.5, 0.5) | **normal，灰度（黑）** | 夜幕：铺满屏幕的压暗层，**中间一个柔和的椭圆透明洞**（洞约占宽 40%、高 55%，边缘柔和过渡），洞外从半透明到接近不透明；外缘有**羽毛形状的暗影触须**伸进洞的边缘。RGB 全黑（0,0,0），只靠 alpha 表现明暗。引擎拉伸铺满屏幕、洞对准主角 |

### B. 序列帧（10 组 76 帧）

| id | 画布 × 帧 | 锚点 | 混合 | fps | 循环 | 内容 |
|---|---|---|---|---|---|---|
| `feather_blade_spin` | 128×128 × 8 | (0.5, 0.5) | **normal，带颜色** | 24 | 循环 | 回旋羽：一片狭长锋利的乌黑大羽刃（约画布 85% 长）绕中心旋转一整圈的 8 个角度（每帧转 45°），刃口一道洋红高光随角度移动，带一点运动模糊。替换现在的静止图 |
| `feather_burst` | 256×256 × 8 | (0.5, 0.5) | add，灰度 | 24 | 一次 | 化作黑羽：一团黑羽和光屑从中心向外炸开、翻飞、消散（羽毛轮廓用亮边勾出来，发光类只画亮边和光屑），最后一帧完全消失。引擎染洋红 |
| `raven_appear` | 256×384 × 8 | (0.5, 0.92) 脚底 | add，灰度 | 20 | 一次 | 浮现：四周的羽毛光屑旋转着往中间聚拢，聚成一个人形轮廓的亮边再淡掉（人形按身高 260 交付像素的站立首领）；最后一帧完全消失（身体由引擎同时淡入） |
| `split_wisps` | 256×384 × 8 | (0.5, 0.92) 脚底 | add，灰度 | 12 | 循环 | 分身期间身上缭绕的暗影丝缕：从肩背往上飘、断断续续，边缘柔和，不遮住脸和弓；首尾无缝 |
| `feather_drift` | 64×64 × 8 | (0.5, 0.5) | **normal，带颜色** | 12 | 循环 | 一片乌黑的羽毛在空中翻转飘落（原地翻转，位移由引擎做），边缘一线暗洋红反光；首尾无缝 |
| `bow_glint` | 128×128 × 6 | (0.5, 0.5) | add，灰度 | 20 | 一次 | 弓弦上的一点闪光：一个锐利的星芒一闪、两道细光沿弓弦上下划开，再收掉；最后一帧完全消失 |
| `arrow_rain` | 128×384 × 6 | (0.5, 0.95) 落点 | add，灰度 | 16 | 循环 | 夜幕箭雨：一束三四支箭的发光轮廓从上往下斜着急坠（略向左倾），拖着长长的光痕；锚点在箭尖落地的位置，引擎从高处往下移动；首尾无缝 |
| `rain_impact` | 192×96 × 6 | (0.5, 0.6) | add，灰度 | 20 | 一次 | 箭束扎进地面：压扁成地面透视的一圈碎光 + 几道竖着溅起的光屑；最后一帧完全消失 |
| `channel_gather` | 256×384 × 8 | (0.5, 0.92) 脚底 | add，灰度 | 12 | 循环 | 读条「夜幕箭雨」：黑羽光屑从四周螺旋着往人形胸口和弓上收拢，越往中间越亮；首尾无缝 |
| `raven_death` | 384×384 × 10 | (0.5, 0.85) 脚底 | add，灰度 | 14 | 一次 | 死亡：人形轮廓崩散成一大群黑羽，往上、往两边飞散，最后只剩几点光屑；最后一帧完全消失 |

合计：贴图 4 张 + 序列帧 10 组 76 帧。

## 四、通用规格（沿用 `docs/ART_FX.md` 第三节、`docs/ART_FX_ENEMY_V1.md` 第四节）

- **发光类（`add`）只用灰度**（R = G = B）；直通 alpha，无背景；从亮处平滑衰减到 0，边缘不能有硬切口或灰圈；四角和边缘中点 alpha 为 0。
- **标了「带颜色」的（`raven_arrow`、`feather_blade_spin`、`feather_drift`）是实物**：和角色同一套暗黑手绘风格、光源左上，普通混合。
- **`night_veil` 是唯一的「normal，灰度」**：RGB 全为 0，alpha 表现明暗；洞的中心 alpha 为 0。
- 不画角色本体（首领、主角都不画）、文字、边框；`raven_appear`、`channel_gather`、`split_wisps`、`raven_death` 里的「人形」只能是光的轮廓 / 剪影亮边，不画五官和衣服细节。
- 序列帧每格同样大小、对准同一锚点；**每行 4 格**（6 帧 = 4×2 空 2 格，8 帧 = 4×2，10 帧 = 4×3 空 2 格）。
- 循环组首尾无缝（最后一帧到第一帧的差异不大于相邻帧之间的差异）；一次性组最后一帧完全消失。
- 原创暗黑幻想风，手绘笔刷质感，不是干净的数学渐变或几何形状；不要照搬任何现有游戏。

## 五、文件结构（`afterglow.fxpack.v1`）

**和第 1 批一样平铺**：zip 根目录下直接是 `README_zh.md`、`fx.json`、`textures/` ……（**不要**再套一层 `fx_boss_raven_v1/` 顶层目录——第 2 批多了一层，接入时要特殊处理）。

```
README_zh.md
fx.json
textures/feather_trail.png、raven_arrow.png、raven_sigil.png、night_veil.png
frames/<id>/<id>_00.png …          （10 组）
sheets/<id>.png                     （每组一张 4 列总图）
docs/preview.png                    （第 1 步预览）
docs/contact_sheet.png              （全部帧，暗底）
docs/tinted_preview.png             （发光类染洋红 #ff4dd2 叠在暗底上；night_veil 叠在一张游戏截图上看压暗效果）
```

`fx.json`：
- `textures`：每项写 `id`、`file`、`w`、`h`、`anchor`、`blend`；
- `flipbooks`：每项写 `id`、`w`、`h`、`anchor`、`blend`、`fps`、`loop`、`frames`（单帧路径列表），**并且写上 `sheet`：`"sheets/<id>.png"`**（第 2 批没写，按约定路径找的）。

数值按第三节。上传到 GitHub Release（仓库 `leograntquinn-crypto/afterglow-blade`）。

## 六、交付前自查（我接入前会逐项验收）

1. 每项 id、画布、帧数、锚点、fps、loop、blend 和第三节一致；发光类全部灰度；三项「带颜色」的不是灰度；`night_veil` RGB 全 0。
2. 发光类和带颜色的序列帧：四角和边缘中点 alpha 为 0。`night_veil` 例外：它的四边应该接近不透明（铺满屏幕的压暗层）。
3. 循环组首尾无缝；一次性组最后一帧 alpha 总和为峰值帧的 1% 以下。
4. `feather_blade_spin` 8 帧是同一片羽刃转一整圈（每帧约 45°），首尾无缝。
5. `night_veil` 的洞在正中、边缘柔和（洞边到不透明至少 80 像素的过渡），不能看出椭圆的硬边。
6. `raven_arrow` 和 `fx_enemy_v1` 的 `arrow` 并排放，一眼分得开。
7. 文件齐全、命名正确、zip 平铺、`fx.json` 写了 `sheet`；`preview.png` 与最终帧一致。

## 七、生成提示词（给 Codex）

### 通用开头（每张都加）
```
Asset type: production VFX for a 2D side-scrolling dark-fantasy action game (original IP). True straight alpha
transparency, no background, hand-painted brush texture (not clean mathematical gradients or geometric shapes).
No characters, no text, no borders. Glow assets are GRAYSCALE ONLY (the engine tints them).
Theme: a raven-like night hunter boss - black feathers, darkness, a single magenta glint.
```

### 各项【内容】（接在通用开头后面；画布、帧数、锚点按第三节）
- `feather_trail`：`a streak trailing behind a spinning feather blade: brightest at the right end, stretching left and breaking into small feather silhouettes and light flecks.`
- `raven_arrow`（带颜色）：`a painted arrow pointing right: ebony shaft, long slender bone-white head, two large pitch-black raven feathers as fletching with a thin dark magenta sheen on their edges; longer and darker than an ordinary arrow; full color, top-left lighting.`
- `raven_sigil`：`a ground-perspective (2:1 flattened) sigil: a ring made of feathers, inside it interlaced feathers and an abstract raven-eye motif (abstract pattern, not letters).`
- `night_veil`（黑色）：`a full-screen darkness overlay: pure black (RGB 0) painted only through alpha; a soft transparent elliptical hole in the center (about 40% of the width, 55% of the height) with a long soft falloff; feather-shaped shadow tendrils reaching into the edge of the hole; nearly opaque toward the borders.`
- `feather_blade_spin`（带颜色）：`a long razor-sharp pitch-black feather blade spinning around its center: 8 frames = one full turn (45 degrees per frame), a magenta highlight sliding along the cutting edge, slight motion blur; seamless loop; full color.`
- `feather_burst`：`a body bursting into black feathers: feathers (drawn by their bright rims) and light flecks exploding outward from the center, tumbling and fading; one-shot 8 frames, last frame fully transparent.`
- `raven_appear`：`feather light flecks swirling inward from all around and gathering into the glowing rim of a standing figure (260px tall at the anchor), then fading; one-shot 8 frames, last frame fully transparent.`
- `split_wisps`：`thin shadowy wisps curling up from the shoulders and back of a standing figure, broken and soft, never covering the face; 8-frame seamless loop.`
- `feather_drift`（带颜色）：`a single pitch-black feather tumbling in the air (rotating in place), a thin dark magenta sheen on its edge; 8-frame seamless loop; full color.`
- `bow_glint`：`a sharp star glint flashing on a bowstring, two thin streaks running up and down along the string, then vanishing; one-shot 6 frames.`
- `arrow_rain`：`a bundle of three or four glowing arrow silhouettes plunging steeply downward (slightly slanted to the left) with long light trails; the arrow tips are at the anchor near the bottom; 6-frame seamless loop.`
- `rain_impact`：`arrows striking the ground: a flattened ring of shattered light and a few vertical splashes of light flecks; one-shot 6 frames, last frame fully transparent.`
- `channel_gather`：`black-feather light flecks spiraling inward toward the chest and bow of a standing figure, brighter toward the center; 8-frame seamless loop.`
- `raven_death`：`a standing figure's silhouette disintegrating into a large flock of black feathers flying up and outward, ending with only a few light flecks; one-shot 10 frames, last frame fully transparent.`

## 八、接入（我这边，子轮 H）

- `tools/build_fx.py` 打成 `fx_boss_raven`（序列帧桌面 50% / 手机 25%；`night_veil` 不裁边、桌面 1024×512 / 手机 512×256），只在夜鸦那一关载入（和 `fx_bone` / `fx_warden` 同样的按首领载入，`fx_art.js` 的 `prepareBossFx`）。
- `fx_data.js` 加 `BOSS_FX.nightRaven` 表（每个招式时刻 → 素材 id、颜色、大小、位置），`boss.js` / `boss_moves.js` 各处查表；素材没载好时不画新增的部分（第 14 项）。
- 按第一节的表逐项替换：回旋羽、分身、齐射、瞬移、天降、读条、召唤、第二阶段夜幕、死亡。
- 子轮 H 同时做夜鸦的机制补强（第 9 项「看不清的猎手」：第二阶段压暗、只在羽毛闪光时现身），机制设计和特效一起验收。
- 验收：截图对比（每个招式的关键时刻，桌面 + 手机）、全套测试 + 新的确定性测试（每个时刻选对素材、分身期间真身和分身的特效完全一样、压暗层的洞跟着主角）、帧率；「看不清但能读」的手感等 Quinn 试玩确认。
