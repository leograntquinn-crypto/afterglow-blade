# 素材包规格：`fx_boss_warden_v2`（首领「祭坛守护者」专属特效·第二版）

对应 Godot 前问题解决阶段**第 9 项**（五名首领逐个补身份）和第 14 项清单的 **14.12（首领招式光效、魂火炉）**（`docs/AUDIT_PRE_GODOT.md`）。
> **SPEC READY FOR CODEX：fx_boss_warden_v2**（规格定稿 2026-11-08）
> 一个 zip `fx_boss_warden_v2.zip`：贴图 1 张 + 序列帧 9 组 72 帧。
> 两步：先交 `docs/preview.png`（每组一帧 + 每张贴图），**Muse 审查通过**后出全帧打包。

这是子轮 H 的**第 5 包、最后一包**（顺序见 `docs/AUDIT_PRE_GODOT.md` 第 9 项「子轮 H 素材包计划」）。
祭坛守护者是第 4 关的首领，已经有第一版专属特效 `fx_warden`（魂火 `soul_fire`、召唤法阵 `summon_circle`），本包**只补缺的，不重画这两组**。

**身份：「借来的火」**。三个阶段的火是三种火，引擎按阶段染色：
- 第 1 阶段：琥珀，借来的祭坛火；
- 第 2 阶段：绿，「祭坛的火焰变成了绿色」；
- 第 3 阶段：近白的青绿，「守护者燃尽了最后的生命」，火焰失控、一跳一跳。

素材画灰度的火，形状语言是「从祭坛 / 炉子里被抽出来的火」：火舌被拉向它，不是自然往上烧。

## 一、要替换什么

祭坛守护者：基于铁甲屠夫的首领，身高约 151 逻辑像素（素材按**身高 260 交付像素**的人画），颜色按阶段 `#ffb347` → `#6fe38a` → `#d6ffe0`。
- 通用招式在 `boss.js`：slam、shockwave、charge、rain、summon、channel「祭坛炎狱」；
- 专属招式在 `boss_moves.js`：soulBraziers 魂火炉、judgment 审判长戟。

| 招式 / 时刻 | 现在 | 换成 |
|---|---|---|
| 魂火（炉子吐的火球）、召唤 / 魂火炉的法阵 | `fx_warden` 的 `soul_fire`、`summon_circle`（**保留，不重画**） | —— |
| 魂火炉本体 | **代码画的**石墩（`fillRect` / `arc` / 描边）+ 通用光晕 | `brazier`（带颜色的石炉实物，静止图 4 帧轮换的微光）+ 炉口 `brazier_flame`（灰度火，按阶段染色，循环） |
| 魂火炉被打碎 | 通用地面爆点 + 通用魂火粒子 + 通用碎片 | `brazier_break`（石炉崩裂、火被抽向守护者） |
| 审判长戟：两道横扫 | 一道巨大的通用新月刀光（`fx.arc` 半径 220） | `judgment_sweep`（沿地面光带横扫过去的一道长戟火刃） |
| 审判长戟：两条地面光带 | 通用光带 `lane_band`（红、琥珀） | `fire_lane`（燃着的地面火带，可平铺） |
| 守护者身上（三个阶段一直在） | 通用状态光 | `warden_flame`（火舌从身体被拉向祭坛 / 炉子的方向；引擎按阶段染色，第 3 阶段加快播放、随机闪跳） |
| 换阶段 | 横幅 + 全屏闪光 | `phase_ignite`（一圈火从身上炸开、换成新颜色） |
| 读条「祭坛炎狱」 | 通用符文圈 + 每 20 帧一个通用冲击环 | 身上 `inferno_gather`（四周的火被抽进身体）；结束 `inferno_burst`（全场火柱） |
| 死亡 | 首领通用：光点消散 | `warden_death`（火一点点熄灭、沉成余烬） |

## 二、交付

一个 zip。第 1 步只交 `docs/preview.png`：每组序列帧取关键的一帧、贴图一格，暗底网格，标 id；`warden_flame` 另外放三格，分别染 `#ffb347`、`#6fe38a`、`#d6ffe0`（三个阶段）。**Muse 审查通过**后第 2 步出全帧、打包。

## 三、包里的内容

「染色」= 引擎按情况染色，素材只画灰度。锚点按画布比例 (x, y)。

### A. 贴图（1 张）

| id | 画布 | 锚点 | 混合 | 内容 |
|---|---|---|---|---|
| `fire_lane` | 256×64 | (0.5, 0.5) | add，灰度 | 燃着的地面火带（贴地）：一条横向的低矮火舌带，中线最亮，火舌一律**往右倾**（被拉向长戟扫过来的方向，引擎按方向镜像），上下边柔和；**左右四方连续可平铺** |

### B. 序列帧（9 组 72 帧）

| id | 画布 × 帧 | 锚点 | 混合 | fps | 循环 | 内容 |
|---|---|---|---|---|---|---|
| `brazier` | 128×192 × 4 | (0.5, 0.92) 底座 | **normal，带颜色** | 6 | 循环 | 魂火炉：一座半人高的粗糙石炉（青灰石、苔痕、刻着抽象纹样），炉口内沿被火映亮；4 帧只是炉口映光的明暗轮换（炉身不动）；首尾无缝。**不画火**（火是 `brazier_flame`） |
| `brazier_flame` | 128×192 × 8 | (0.5, 0.42) 炉口 | add，灰度 | 12 | 循环 | 炉口的火：一团从炉口升起的火，火舌的尖**整体往一侧（左）被拉过去**（引擎按守护者所在方向镜像）；首尾无缝 |
| `brazier_break` | 192×192 × 8 | (0.5, 0.8) | **normal，带颜色** | 16 | 一次 | 石炉崩裂：炉身裂成几块倒塌、碎石飞溅，炉里的火被一下子抽走（火的部分画成灰度亮边也可以，但碎石要带颜色）；最后一帧完全消失 |
| `judgment_sweep` | 512×256 × 8 | (0.15, 0.6) 起点 | add，灰度 | 24 | 一次 | 审判长戟的横扫：一道贴地的长条火刃从左端（锚点）往右扫过整张画布，刃口锐利，身后留下一溜烧着的火星；引擎按光带长度横向拉伸；最后一帧完全消失 |
| `warden_flame` | 256×384 × 8 | (0.5, 0.92) 脚底 | add，灰度 | 12 | 循环 | 守护者身上的火：沿一个高大人形轮廓边缘的火舌，火舌**一律往左上被拉过去**（引擎按祭坛方向镜像），不遮脸；首尾无缝 |
| `phase_ignite` | 384×384 × 10 | (0.5, 0.75) | add，灰度 | 16 | 一次 | 换阶段：一圈火从身体中心炸开成环往外扩，环上的火舌在中途「翻色」（画成亮度突然跳高一下，颜色由引擎换），然后散成火星；最后一帧完全消失 |
| `inferno_gather` | 256×384 × 8 | (0.5, 0.92) 脚底 | add，灰度 | 12 | 循环 | 读条「祭坛炎狱」：四周的火舌和火星螺旋着被抽进人形胸口，越往里越亮；首尾无缝 |
| `inferno_burst` | 512×384 × 8 | (0.5, 0.9) 地面 | add，灰度 | 20 | 一次 | 「祭坛炎狱」爆发：一片火柱从地面依次窜起（前 3 帧冒出、第 4 帧最高最亮），然后塌成火星落下；最后一帧完全消失 |
| `warden_death` | 384×384 × 10 | (0.5, 0.85) 脚底 | add，灰度 | 12 | 一次 | 死亡：人形轮廓上的火一层层熄灭、往下沉，最后只剩地面上几点暗红的余烬再灭掉；最后一帧完全消失 |

合计：贴图 1 张 + 序列帧 9 组 72 帧（`brazier` 4 + `brazier_flame` 8 + `brazier_break` 8 + `judgment_sweep` 8 + `warden_flame` 8 + `phase_ignite` 10 + `inferno_gather` 8 + `inferno_burst` 8 + `warden_death` 10）。

## 四、通用规格（沿用 `docs/ART_FX.md` 第三节、`docs/ART_FX_ENEMY_V1.md` 第四节）

- **发光类（`add`）只用灰度**（R = G = B），引擎按阶段染色；直通 alpha，无背景；从亮处平滑衰减到 0，边缘不能有硬切口或灰圈；四角和边缘中点 alpha 为 0。
- **标了「带颜色」的（`brazier`、`brazier_break`）是实物**：和角色、第 4 关场景同一套暗黑手绘风格（青灰石、苔痕），光源左上，普通混合。
- 贴地的（`fire_lane`、`judgment_sweep`、`inferno_burst`）按地面透视画。
- 不画首领本体、主角、文字、边框；人形只能是火舌勾出的轮廓。
- 序列帧每格同样大小、对准同一锚点；**每行 4 格**（4 帧 = 4×1，8 帧 = 4×2，10 帧 = 4×3 空 2 格）。
- 循环组首尾无缝；一次性组最后一帧完全消失。
- 原创暗黑幻想风，手绘笔刷质感，不是干净的数学渐变或几何形状；不要照搬任何现有游戏。

## 五、文件结构（`afterglow.fxpack.v1`）

**zip 根目录平铺**：

```
README_zh.md
fx.json
textures/fire_lane.png
frames/<id>/<id>_00.png …          （9 组）
sheets/<id>.png                     （每组一张 4 列总图）
docs/preview.png                    （第 1 步预览，含 warden_flame 三色格）
docs/contact_sheet.png              （全部帧，暗底）
docs/tinted_preview.png             （发光类按三个阶段各染一行；fire_lane 横向平铺 3 次）
```

`fx.json`：`textures` 每项写 `id`、`file`、`w`、`h`、`anchor`、`blend`；`flipbooks` 每项写 `id`、`w`、`h`、`anchor`、`blend`、`fps`、`loop`、`frames`、**`sheet`**。数值按第三节。上传到 GitHub Release（仓库 `leograntquinn-crypto/afterglow-blade`）。

## 六、交付前自查（我接入前会逐项验收）

1. 每项 id、画布、帧数、锚点、fps、loop、blend 和第三节一致；发光类全部灰度；两项「带颜色」的不是灰度。
2. 四角和边缘中点 alpha 为 0；没有硬边。
3. 循环组（`brazier`、`brazier_flame`、`warden_flame`、`inferno_gather`）首尾无缝；一次性组最后一帧 alpha 总和为峰值帧的 1% 以下。
4. `fire_lane` 左右可平铺（左右各 1 列像素差异很小）。
5. `inferno_burst` 第 4 帧（下标 3）是全组最亮的一帧。
6. `brazier` 四帧炉身逐像素不动、只有炉口映光变化；`brazier` 里没有火。
7. 火舌方向：`brazier_flame` 往左拉、`warden_flame` 往左上拉、`fire_lane` 往右倾（引擎会镜像，方向要一致才镜像得对）。
8. 文件齐全、命名正确、zip 平铺、`fx.json` 写了 `sheet`；`preview.png` 与最终帧一致。

## 七、生成提示词（给 Codex）

### 通用开头（每张都加）
```
Asset type: production VFX for a 2D side-scrolling dark-fantasy action game (original IP). True straight alpha
transparency, no background, hand-painted brush texture (not clean mathematical gradients or geometric shapes).
No characters, no text, no borders. Glow assets are GRAYSCALE ONLY (the engine tints them per phase).
Theme: an altar guardian wielding BORROWED fire - flames are always being PULLED toward something (the guardian,
an altar, a brazier), never just burning upward naturally.
```

### 各项【内容】（接在通用开头后面；画布、帧数、锚点按第三节）
- `fire_lane`：`a low ground-hugging band of flames, brightest on the center line, every flame tongue leaning to the RIGHT, soft top and bottom edges; horizontally tileable (seamless left/right edges).`
- `brazier`（带颜色）：`a waist-high rough stone brazier (blue-grey stone, moss stains, carved abstract patterns), the inner rim of its mouth lit by firelight; 4 frames where only the rim glow pulses, the stone body is identical in every frame; NO flame drawn; seamless loop; full color, top-left lighting.`
- `brazier_flame`：`a flame rising from a brazier mouth at the anchor, its tips all being pulled toward the LEFT; 8-frame seamless loop.`
- `brazier_break`（带颜色）：`the stone brazier cracking apart and collapsing in chunks with flying rubble, its fire sucked away at once; one-shot 8 frames, last frame fully transparent; rubble in full color.`
- `judgment_sweep`：`a ground-level long halberd blade of fire sweeping from the left end (anchor) across the whole canvas to the right, sharp edge, a trail of burning sparks left behind; one-shot 8 frames, last frame fully transparent.`
- `warden_flame`：`flame tongues along the outline of a tall figure (260px tall at the anchor), all pulled toward the UPPER LEFT, never covering the face; 8-frame seamless loop.`
- `phase_ignite`：`a ring of fire bursting outward from the body center, the ring's flames jumping sharply brighter halfway through (a color change will be applied by the engine), then scattering into sparks; one-shot 10 frames, last frame fully transparent.`
- `inferno_gather`：`flame tongues and sparks spiraling inward from all around into the chest of a standing figure, brighter toward the center; 8-frame seamless loop.`
- `inferno_burst`：`a field of fire pillars erupting from the ground one after another (rising over frames 0-2, tallest and brightest at frame 3), then collapsing into falling sparks; one-shot 8 frames, last frame fully transparent.`
- `warden_death`：`the flames on a figure outline going out layer by layer and sinking down, leaving only a few dim embers on the ground that then die; one-shot 10 frames, last frame fully transparent.`

## 八、接入（子轮 H，按 Quinn 规则 2 可派 Codex，模式同 H-10 ～ H-12，模块级测试）

- 构建：`tools/build_fx.py --boss warden`（`BOSS_PACKS` 加一行；`fire_lane` 不裁边），打成 `fx_boss_warden_v2`，和现有 `fx_warden` 一起只在第 4 关载入（`BOSS_FX.warden` 改成两套，同 H-10 的骸骨统领）。
- **魂火炉本体**：`boss_moves.js` 里 `Brazier.draw` 的代码画石墩**删掉**，换成 `brazier` + 炉口 `brazier_flame`（按当前阶段染色）；素材没载好时不画炉身（第 14 项），但炉子的判定、血量照旧——子轮 H 机制设计时确认素材没载好时是否要用别的方式标出炉子位置。
- **按阶段染色**：`BOSS_FX.warden` 表写三个阶段的颜色，`warden_flame`、`brazier_flame`、`fire_lane`、`inferno_*` 都按 `b.phase` 取色；第 3 阶段 `warden_flame` 播放加快、随机闪跳（表里可调）。
- 审判长戟、换阶段、读条、死亡按第一节的表接；`soul_fire`、`summon_circle` 一字不改。
- 机制补强（第 9 项「借来的火」：三个阶段机制真正不同、第 3 阶段火焰失控）我来设计，和特效同一子轮验收。
- 验收（模块末尾统一一次）：`tools/fxsheet.js` 截图对比（每个招式关键时刻 × 三个阶段，桌面 + 手机）、全套测试 + 新的确定性测试（每个时刻选对素材、三阶段颜色对、`Brazier.draw` 不再有代码画的形状、`soul_fire` / `summon_circle` 照旧）、帧率。
