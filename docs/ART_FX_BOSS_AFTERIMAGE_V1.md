# 素材包规格：`fx_boss_afterimage_v1`（最终首领「残影」专属特效）

对应 Godot 前问题解决阶段**第 9 项**（五名首领逐个补身份）和第 14 项清单的 **14.2（首领刀光）、14.12（首领招式光效）**（`docs/AUDIT_PRE_GODOT.md`）。
> **SPEC READY FOR CODEX：fx_boss_afterimage_v1**（规格定稿 2026-11-08）
> 一个 zip `fx_boss_afterimage_v1.zip`：贴图 3 张 + 序列帧 10 组 72 帧。
> 两步：先交 `docs/preview.png`（每组一帧 + 每张贴图），**Muse 审查通过**后出全帧打包。

这是子轮 H 的**第 3 包**（顺序见 `docs/AUDIT_PRE_GODOT.md` 第 9 项「子轮 H 素材包计划」）。残影是最终首领「深渊中的另一个你」：用主角绯隼的动画、盖一层暗紫。
它现在**完全没有专属特效**，只有主角自己的刀光染紫：
- 三连斩 / 瞬移斩用通用新月刀光；
- 剑气是主角的 `wave_crescent` 染紫；
- 镜像招式借主角的 `slash_spin`；
- 处决的五段冲刺路线是**代码画的直线**（`boss_moves.js` 的 `Streak.drawFloor`，第 14 项要清掉的）；
- 读条「残光逆转」用五名首领共用的符文圈。

**身份：「你的反面」**。主角的残光是「从刀刃往外放」的光；残影的光是**反过来的**：
- 光从四周往它身上、往刀刃上**倒吸**；
- 亮边在外侧、中间是一道**暗芯**，像光的负片；
- 颜色由引擎染暗紫 `#b46bff`。

每一项都要和主角那一套（`fx_blade_v1`、`fx_hero`）放在一起一眼分得开：同样的形状语言，反过来的光。

## 一、要替换什么

残影：身高约 86 逻辑像素（和主角一样；素材按**身高 260 交付像素**的人画），颜色 `#b46bff`。
- 通用招式在 `boss.js`：combo 三连斩、teleport 瞬移斩、volley 剑气齐射（`shot: 'wave'`）、rain 天降、charge 冲锋、channel 读条「残光逆转」；
- 专属招式在 `boss_moves.js`：mirror 镜像（照你上一次放的技能反打你）、execution 残光处决（五段冲刺斩）；
- 读你的习惯时弹出提示（`boss.js` 的 `READ_TOAST`）。

| 招式 / 时刻 | 现在 | 换成 |
|---|---|---|
| 三连斩、瞬移斩的刀光 | 通用新月刀光（主角刀光条带染紫） | `rev_ribbon` 条带（外亮内暗、尾端往刀刃倒吸）+ `rev_slash` 序列帧 |
| 剑气（齐射、镜像·裂） | 主角的 `wave_crescent` 染紫 | `rev_wave`（暗芯新月，光往后倒拖） |
| 镜像·风（旋风斩） | 主角的 `slash_spin` 染紫 | `rev_slash` 连播旋转 |
| 镜像：开始时 | 只有文字「镜 · 裂」 | 头顶 `mirror_sigil`（一面裂开的镜子里映出一把刀的抽象纹样）亮起 |
| 瞬移：消失 / 出现 | 通用能量环 | `shadow_step_out` → `shadow_step_in` |
| 残光处决：预警路线 | **代码画的直线** | 地面 `streak_line`（沿路线平铺）+ 每个折点 `exec_mark` |
| 残光处决：每一段冲刺 | 主角的 `slash_sweep` 染紫 | `exec_dash`（沿这一段的方向转过去、拉长） |
| 读到你的习惯 | 只有文字提示 | 它身上 `habit_read`（一只抽象的眼睛样的闪光：「我看见了」） |
| 读条「残光逆转」 | 通用符文圈 + 每 20 帧一个通用冲击环 | 身上 `reversal_gather`（光从四周倒吸进身体）；结束时 `reversal_burst` |
| 死亡 | 首领通用：光点消散 | `afterimage_death`（暗紫的身体碎成残光点，残光点**往你身上飘**过去消散——「你的反面」回到你身上） |

天降、冲锋这两个通用招式不在本包（天降用地面预警圈 + 陨落；冲锋用地面光带），子轮 H 设计残影的机制时会一起重排它的招式表。

## 二、交付

一个 zip。第 1 步只交 `docs/preview.png`：每组序列帧取关键的一帧、每张贴图一格，暗底网格，标 id。**另外放一行对照**：`rev_ribbon` 旁边放 `fx_blade_v1` 的 `blade_ribbon_skill`，`rev_wave` 旁边放 `wave_crescent`（都染色后叠在暗底上），证明一眼分得开。**Muse 审查通过**后第 2 步出全帧、打包。

## 三、包里的内容

「染色」= 引擎按情况染色，素材只画灰度。锚点按画布比例 (x, y)。

### A. 贴图（3 张）

| id | 画布 | 锚点 | 混合 | 内容 |
|---|---|---|---|---|
| `rev_ribbon` | 1024×128 | (0, 0) 不裁边 | add，灰度 | 残影的刀光条带。**格式和 `fx_blade_v1` 的 `blade_ribbon_light` 完全一样**（U = 沿挥砍方向，左端是刀尖刚扫过的地方、右端是最早的尾端；V = 0 在外沿、往下到内沿），引擎按刀尖轨迹铺。内容反过来：外沿一条亮边，**紧贴亮边下面是一道暗芯**（几乎透明），再往内才是柔光；尾端的光不是散开，而是**往刀刃方向倒吸**成细丝 |
| `streak_line` | 512×64 | (0.5, 0.5) | add，灰度 | 处决的冲刺路线（贴地）：一条细长的预警线，中线是一道暗芯、两侧两条亮边，线上有往前流的细碎残影；**左右四方连续可平铺** |
| `mirror_sigil` | 256×256 | (0.5, 0.5) | add，灰度 | 镜像的标记：一面裂开的圆镜的轮廓，镜里映出一把倒置的刀的剪影（抽象纹样，不是文字）；画在头顶 |

### B. 序列帧（10 组 72 帧）

| id | 画布 × 帧 | 锚点 | 混合 | fps | 循环 | 内容 |
|---|---|---|---|---|---|---|
| `rev_slash` | 256×256 × 6 | (0.3, 0.5) | add，灰度 | 24 | 一次 | 一道新月刀光，外沿亮、紧贴着一道暗芯；挥过以后光**往刀刃方向倒吸**收掉（主角的刀光是往外散）；朝右；最后一帧完全消失 |
| `rev_wave` | 256×256 × 6 | (0.6, 0.5) 前缘 | add，灰度 | 16 | 循环 | 残影的剑气：新月形，前缘一道亮边、里面是暗芯，后面拖着往后倒拉的光丝（像被吸回去）；朝右；首尾无缝 |
| `shadow_step_out` | 256×384 × 6 | (0.5, 0.92) 脚底 | add，灰度 | 24 | 一次 | 消失：一个人形轮廓的亮边被往一个点上吸、拉扁、缩成一道竖线再消失（和主角闪避的残影往外散开相反）；最后一帧完全消失 |
| `shadow_step_in` | 256×384 × 6 | (0.5, 0.92) 脚底 | add，灰度 | 24 | 一次 | 出现：一道竖线张开，人形轮廓的亮边从里面「翻」出来，再淡掉（身体由引擎淡入）；最后一帧完全消失 |
| `exec_dash` | 384×192 × 6 | (0.5, 0.5) | add，灰度 | 24 | 一次 | 处决的一段冲刺斩：一道横着的长条斩痕（引擎沿这一段的方向转过去、按长度拉伸），斩痕后面拖着两三个越来越淡的人形残影轮廓；最后一帧完全消失 |
| `exec_mark` | 192×96 × 8 | (0.5, 0.5) | add，灰度 | 12 | 循环 | 冲刺路线的折点标记（压扁成地面透视）：一个小的、往里收缩的环，环上一道暗芯，环心一点亮；首尾无缝 |
| `habit_read` | 128×128 × 8 | (0.5, 0.5) | add，灰度 | 16 | 一次 | 读到你的习惯：一只抽象的眼形闪光（两道弧线合成的眼形 + 中间一点），睁开、亮一下、闭上；最后一帧完全消失 |
| `reversal_gather` | 256×384 × 8 | (0.5, 0.92) 脚底 | add，灰度 | 12 | 循环 | 读条「残光逆转」：四面八方的光丝和光点**往人形胸口倒吸**，越往里越亮，人形轮廓边缘有一圈暗芯；首尾无缝 |
| `reversal_burst` | 512×512 × 8 | (0.5, 0.6) | add，灰度 | 20 | 一次 | 「残光逆转」爆发：先往里猛地一缩（前 2 帧，一圈亮环收向中心），再炸开成一个外沿亮、里面是暗芯的大环，碎成光屑；最后一帧完全消失 |
| `afterimage_death` | 256×384 × 10 | (0.5, 0.92) 脚底 | add，灰度 | 14 | 一次 | 死亡：人形轮廓碎成很多残光点，这些光点**整体往画面左边飘**（引擎按主角所在的方向镜像），一边飘一边变淡；最后一帧完全消失 |

合计：贴图 3 张 + 序列帧 10 组 72 帧。

## 四、通用规格（沿用 `docs/ART_FX.md` 第三节、`docs/ART_FX_ENEMY_V1.md` 第四节）

- **全部是发光类（`add`）、只用灰度**（R = G = B），引擎统一染暗紫；直通 alpha，无背景；从亮处平滑衰减到 0，边缘不能有硬切口或灰圈；四角和边缘中点 alpha 为 0（`rev_ribbon` 是条带，按 `fx_blade_v1` 的条带规则：左右两端可以不为 0）。
- **「暗芯」的画法**：发光类画不出黑色，暗芯就是在亮边旁边留一道几乎透明的窄缝（alpha 接近 0），叠在画面上看起来像光被挖掉了一道。不要用灰色填。
- 贴地的（`streak_line`、`exec_mark`）按地面透视压扁画。
- 不画角色本体（首领、主角都不画）、文字、边框；人形只能是轮廓亮边。
- 序列帧每格同样大小、对准同一锚点；**每行 4 格**（6 帧 = 4×2 空 2 格，8 帧 = 4×2，10 帧 = 4×3 空 2 格）。
- 循环组首尾无缝（最后一帧到第一帧的差异不大于相邻帧之间的差异）；一次性组最后一帧完全消失。
- 原创暗黑幻想风，手绘笔刷质感，不是干净的数学渐变或几何形状；不要照搬任何现有游戏。

## 五、文件结构（`afterglow.fxpack.v1`）

**zip 根目录平铺**（不要再套一层顶层目录）：

```
README_zh.md
fx.json
textures/rev_ribbon.png、streak_line.png、mirror_sigil.png
frames/<id>/<id>_00.png …          （10 组）
sheets/<id>.png                     （每组一张 4 列总图）
docs/preview.png                    （第 1 步预览，含和主角那一套的对照行）
docs/contact_sheet.png              （全部帧，暗底）
docs/tinted_preview.png             （全部染 #b46bff 叠在暗底上；streak_line 横向平铺 3 次）
```

`fx.json`：`textures` 每项写 `id`、`file`、`w`、`h`、`anchor`、`blend`；`flipbooks` 每项写 `id`、`w`、`h`、`anchor`、`blend`、`fps`、`loop`、`frames`（单帧路径列表）、**`sheet`（`"sheets/<id>.png"`）**。数值按第三节。上传到 GitHub Release（仓库 `leograntquinn-crypto/afterglow-blade`）。

## 六、交付前自查（我接入前会逐项验收）

1. 每项 id、画布、帧数、锚点、fps、loop、blend 和第三节一致；全部灰度（R = G = B）。
2. 四角和边缘中点 alpha 为 0（`rev_ribbon` 按条带规则）；没有硬边、没有灰色填充的「暗芯」。
3. 循环组（`rev_wave`、`exec_mark`、`reversal_gather`）首尾无缝；一次性组最后一帧 alpha 总和为峰值帧的 1% 以下。
4. `rev_ribbon` 的尺寸、U / V 方向和 `fx_blade_v1` 的 `blade_ribbon_light` 一致（拿同一段刀尖轨迹铺上去，两条的外沿对得上）。
5. `streak_line` 左右可平铺（左右各 1 列像素差异很小）。
6. 对照行：`rev_ribbon` / `blade_ribbon_skill`、`rev_wave` / `wave_crescent` 一眼分得开（暗芯、倒吸的方向）。
7. 文件齐全、命名正确、zip 平铺、`fx.json` 写了 `sheet`；`preview.png` 与最终帧一致。

## 七、生成提示词（给 Codex）

### 通用开头（每张都加）
```
Asset type: production VFX for a 2D side-scrolling dark-fantasy action game (original IP). True straight alpha
transparency, no background, hand-painted brush texture (not clean mathematical gradients or geometric shapes).
No characters, no text, no borders. GRAYSCALE ONLY (the engine tints them).
Theme: the final boss is the hero's dark mirror. Its light is INVERTED: a bright outer rim with a thin dark core
(a near-transparent gap) right inside it, and light that is SUCKED BACK inward instead of spreading outward.
```

### 各项【内容】（接在通用开头后面；画布、帧数、锚点按第三节）
- `rev_ribbon`：`a blade-trail ribbon strip in the exact format of the hero's ribbon (U along the swing, tip side on the left, V=0 at the outer edge): a bright outer rim, directly beneath it a thin dark core (near-transparent gap), then a soft inner glow; at the tail the light is drawn back toward the blade as thin strands instead of scattering.`
- `streak_line`：`a thin ground-perspective warning line for a dash path: two bright edges with a dark core between them, small afterimage flecks flowing forward along it; horizontally tileable (seamless left/right edges).`
- `mirror_sigil`：`the outline of a cracked round mirror reflecting the silhouette of an upside-down sword (abstract motif, not letters).`
- `rev_slash`：`a crescent sword slash with a bright outer rim and a thin dark core right inside it; after the swing the light is sucked back toward the blade and vanishes (the opposite of scattering); facing right; one-shot 6 frames, last frame fully transparent.`
- `rev_wave`：`a crescent sword wave flying right: a bright leading edge with a dark core inside, trailing strands of light pulled backward as if being sucked back; 6-frame seamless loop.`
- `shadow_step_out`：`the glowing rim of a standing figure (260px tall at the anchor) being sucked into a single point: squeezed flat into a vertical line, then gone; one-shot 6 frames, last frame fully transparent.`
- `shadow_step_in`：`a vertical line splits open and the glowing rim of a standing figure turns inside-out out of it, then fades; one-shot 6 frames, last frame fully transparent.`
- `exec_dash`：`one long horizontal dash-slash streak (the engine rotates and stretches it along the dash), with two or three fading figure-outline afterimages trailing behind; one-shot 6 frames, last frame fully transparent.`
- `exec_mark`：`a small ground-perspective (2:1 flattened) ring contracting inward, a dark core along the ring, a bright point at the center; 8-frame seamless loop.`
- `habit_read`：`an abstract eye-shaped glint (two arcs forming an eye with a point in the middle) opening, flashing once, closing; one-shot 8 frames, last frame fully transparent.`
- `reversal_gather`：`strands and points of light from every direction being sucked into the chest of a standing figure, brighter toward the center, a dark-core rim around the figure outline; 8-frame seamless loop.`
- `reversal_burst`：`first a sharp inward contraction (a bright ring shrinking to the center over 2 frames), then an explosion into a large ring with a bright outer rim and a dark core, breaking into flecks; one-shot 8 frames, last frame fully transparent.`
- `afterimage_death`：`a standing figure outline shattering into many afterglow flecks that drift together toward the LEFT side while fading; one-shot 10 frames, last frame fully transparent.`

## 八、接入（子轮 H，按 Quinn 规则 2 可派 Codex，模式同 `docs/CODEX_TICKETS_H.md` 的 H-1 / H-2 / H-3）

- 构建：`tools/build_fx.py --boss afterimage`（H-1 做出的 `--boss` 模式；`rev_ribbon` 按 `fx_blade_v1` 条带的规则不裁边），打成 `fx_boss_afterimage`，只在第 5 关和残影出现的试炼层载入（`prepareBossFx` 加 `afterimage: 'afterimage'`）。
- 刀光：残影的三连斩 / 瞬移斩现在走 `fx.arc`（铺的是 `fx_blade_v1` 的条带），给 `fx.arc` 加一个可选的条带 id 参数，残影传 `rev_ribbon`；别的首领照旧。
- 处决路线：`Streak.drawFloor` 的代码直线删掉，换成 `streak_line` 平铺 + 折点 `exec_mark`；素材没载好时不画路线（第 14 项）——**但处决本身的判定不变**，路线是提示，子轮 H 机制设计时会确认素材没载好时是否要在别处补提示。
- 镜像、读习惯、读条、死亡按第一节的表接。
- 机制补强（第 9 项「你的反面」：用你的连段、你的闪避时机反制你）我来设计，和特效同一子轮验收。
- 验收：截图对比（用 `tools/fxsheet.js`，每个招式的关键时刻，桌面 + 手机）、全套测试 + 新的确定性测试（每个时刻选对素材、只有残影换了刀光条带、处决路线不再有代码画的线）、帧率；「反面」的观感等 Quinn 试玩确认。
