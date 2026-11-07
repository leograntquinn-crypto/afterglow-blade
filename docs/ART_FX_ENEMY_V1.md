# 素材包规格：`fx_enemy_v1`（敌人特效：预警、出招、命中、死亡，词缀和司祭的光效）

对应 Godot 前问题解决阶段**第 8 项**（敌人特效升级：每种敌人一套自己的视觉语言）和第 14 项清单里的 **14.7、14.8、14.10（箭）、14.11、14.13、14.14**（`docs/AUDIT_PRE_GODOT.md`）：这些现在还是**代码画的渐变、线段、三角、椭圆**，或者借用通用光晕 / 冲击环染色凑出来的。
> **SPEC READY FOR CODEX：fx_enemy_v1**（规格定稿 2026-11-07）
> 分两批交付、各自验货：**第 1 批 `fx_enemy_v1_common.zip`**（第三节 A～D：状态光、弓手、地面预警、词缀与司祭——贴图 7 张 + 序列帧 16 组 112 帧）→ **第 2 批 `fx_enemy_v1_types.zip`**（第三节 E：五种杂兵的出招 / 命中 / 死亡——贴图 1 张 + 序列帧 15 组 100 帧）。
> 每批两步：先交 `docs/preview.png`（每组一帧 + 每张贴图），**Muse 审查通过**后出全帧打包；第 1 批验收接入以后再开始第 2 批。

本包是本阶段的**第四包**（前三包 `hero_fix`、`fx_blade_v1`、`fx_light_v1` 已验收接入）。首领专属的东西（夜鸦的羽毛、铁颚的链钩、魂火、首领地面线）**不在本包**，归第 9 项的首领包。

## 一、要替换什么

| 清单 | 现在 | 位置 |
|---|---|---|
| 14.7 | 敌人身上的预警光 / 佯攻光 / 格挡光 / 霸体光 / 精英光：一个径向渐变染不同颜色 | `rig.js drawAura`，`enemy.js:466-472`、`boss.js:461` |
| 14.8 | 弓手瞄准线：红色虚线；背后来袭提示：两个描边三角 | `ai.js drawCues` |
| 14.10 | 弓手的箭：两条线段 + 一个三角 | `combat.js Projectile.draw`（`arrow`） |
| 14.11 | 地面预警圈：通用冲击环 + 柔光染红；爆发后一个实心椭圆；陨落的光球（圆 + 矩形）；冲锋 / 齐射前的地面红带（两个矩形） | `combat.js Hazard.drawFloor`、`Lane.drawFloor` |
| 14.13 | 词缀：坚盾是一段描边椭圆 + 折线裂纹；狂暴、迅影、爆裂、精英只有染色的光晕 | `affix.js drawAffixes`、`enemy.js` |
| 14.14 | 司祭的咒盾（通用冲击环 + 光晕染色）、地上的陷阱符（通用符文圈染色） | `enemies_ext.js drawWard`、`Trap.drawFloor` |
| 第 8 项 | 五种杂兵的出招 / 命中 / 死亡全部是通用粒子（尘土、火花、魂光）换颜色，彼此分不出来 | `enemy.js`、`enemies_ext.js`、`fx_data.js` |

第 8 项的视觉身份（`docs/AUDIT_PRE_GODOT.md` 第 8 项）：

| 敌人 | 身份 | 预警 | 出招 | 命中 | 死亡 |
|---|---|---|---|---|---|
| 腐骨兵 `grunt` | 锈骨、尘土、暗红 | 骨刀上的锈光一闪 | 锈色短刀光 | 骨屑飞溅 | 散架成骨堆 + 尘 |
| 铁甲屠夫 `brute` | 铁、火星、沉重 | 斧刃烧红 + 地面红圈（真 / 假两种节奏） | 沉重的弧形斧光 + 火星 | 金属火花 | 铁甲崩落、火星 |
| 影弓手 `archer` | 紫影、细长 | 流动的瞄准线 | 带残影的箭 | 箭羽碎裂 | 化作紫烟 |
| 灰烛司祭 `priest` | 灰白烛火、符文 | 提灯亮起、符文在地上展开 | 咒盾、陷阱符 | 符文碎裂 | 烛火熄灭的烟 |
| 烬翼 `wing` | 余烬、火星拖尾 | 身上裂纹发亮（真：红 / 假：琥珀，引擎染色） | 俯冲火星拖尾 | 余烬爆开 | 燃尽成灰 |

## 二、交付分两批（每批先交预览，Muse 审查通过后再出全帧打包）

本包有 31 组序列帧（212 帧）和 8 张贴图，一次全做完风险大（上一包在最后打包时断流）。分两批，**每批单独打 zip、单独验货**：

- **第 1 批 `fx_enemy_v1_common.zip`**：第三节 A～D（所有敌人共用的预警、瞄准、地面、词缀、司祭）——接入后 14.7 / 14.8 / 14.10 / 14.11 / 14.13 / 14.14 就清掉了；
- **第 2 批 `fx_enemy_v1_types.zip`**：第三节 E（五种杂兵各自的出招 / 命中 / 死亡）。

每批的第 1 步只交一张预览 `preview.png`：每组序列帧取**关键的一帧**、每张贴图一格，暗底排成网格并标上 id；**Muse 审查通过**后第 2 步出全帧、打包。

## 三、包里的内容

通用规格见第四节。下表里「画布」是每帧的尺寸，「锚点」按画布比例（x, y），**「染色」= 引擎按情况染色，素材只画灰度**。

### A. 敌人身上的状态光（第 1 批；发光类 `add`，灰度，循环）

引擎把它画在敌人身后、锚点对准脚底，按敌人身高缩放（素材按 **身高 260 像素** 的人画光的范围）。三种形状对应三种「意思」，颜色由引擎染：

| id | 画布 × 帧 | 锚点 | fps | 内容 | 用在（引擎染色） |
|---|---|---|---|---|---|
| `aura_threat` | 256×384 × 8 | (0.5, 0.92) | 16 | **要出手了**：从脚底往上窜的尖锐火舌状光焰，边缘锋利、一跳一跳往上冲，越到上面越碎 | 出招预警（红）、首领出招（红）、狂暴（橙红） |
| `aura_feint` | 256×384 × 8 | (0.5, 0.92) | 16 | **假动作**：和 `aura_threat` 同样的轮廓，但光焰**断断续续、闪烁、有缺口**，像接触不良的灯；一看就「不稳」 | 佯攻露出破绽（琥珀） |
| `aura_guard` | 256×384 × 8 | (0.5, 0.92) | 10 | **在防 / 有霸体**：贴着身体轮廓的一层平稳光壳，缓慢呼吸，边缘柔和，不往上窜 | 格挡（冷蓝）、霸体（余烬橙）、迅影闪现后（紫）、精英（金） |

### B. 弓手：瞄准线、箭、背后来袭（第 1 批）

| id | 类型 | 画布 × 帧 | 锚点 | 混合 | 内容 |
|---|---|---|---|---|---|
| `aim_line` | 贴图 | 256×32 | (0.5, 0.5) | add | 瞄准光线：一条细亮线，中线最亮，上下快速衰减；线里有**一节一节往前流的光点**（像能量顺着线流过去）。**左右四方连续可平铺**（引擎沿路线重复铺、按时间往前滚动） |
| `aim_mark` | 贴图 | 64×64 | (0.5, 0.5) | add | 瞄准终点的标记：一个小的锐利十字准星 + 外圈 4 段短弧，手绘笔触 |
| `arrow` | 贴图 | 128×32 | (0.85, 0.5) 箭头尖 | **normal，带颜色** | 箭：骨质箭杆、黑铁三棱箭头、两片暗紫色的箭羽，朝右；**这是实物，画成有颜色的**（和角色同风格） |
| `arrow_trail` | 贴图 | 256×32 | (1.0, 0.5) 右端 | add | 箭的残影拖尾：右端最亮，往左拉长渐隐，带两三道断续的残影条纹 |
| `arrow_break` | 序列帧 | 128×128 × 6 | (0.5, 0.5) | add | 箭命中 / 被弹开时：箭杆断成两截、几片羽毛碎屑飞散，**一次性**（不循环），12 fps |
| `threat_back` | 贴图 | 96×96 | (0.5, 0.5) | add | 「背后有人要出手」的提示：两个叠在一起的**手绘尖角箭头**朝右（引擎镜像），笔触锋利、外缘带一圈短促的光 |

### C. 地面预警（第 1 批；压扁成地面透视，宽:高 = 2:1）

| id | 类型 | 画布 × 帧 | 锚点 | 混合 | fps | 内容 |
|---|---|---|---|---|---|---|
| `warn_ring` | 序列帧 | 512×256 × 8 | (0.5, 0.5) | add | 16 循环 | 范围预警的**边缘**：一圈压扁的椭圆亮环，外缘锐利、往内拖一点柔光；环上有一圈细碎的刻痕 / 符纹在缓慢流动；8 帧亮度起伏（呼吸）。引擎染红，越临近爆发播得越快 |
| `warn_ring_fake` | 序列帧 | 512×256 × 8 | (0.5, 0.5) | add | 16 循环 | 假动作的预警圈：同样的椭圆，但**环是断开的几段**、碎段在闪，明显「不完整」（屠夫佯攻用） |
| `warn_fill` | 贴图 | 512×256 | (0.5, 0.5) | add | — | 预警圈**内部**的填充光：从中心往外均匀铺开的柔光，边缘在椭圆处收住（引擎按进度从中心往外放大） |
| `warn_flash` | 序列帧 | 512×256 × 6 | (0.5, 0.5) | add | 24 一次 | 爆发瞬间的地面闪光：整片椭圆一下亮起、碎成放射状的光纹再迅速熄灭 |
| `lane_band` | 贴图 | 256×64 | (0.5, 0.5) | add | — | 冲锋 / 齐射路线的地面光带：横向一条，中线亮、上下边柔；带往前流的斜纹；**左右四方连续可平铺** |
| `meteor` | 序列帧 | 128×256 × 6 | (0.5, 0.8) 火球中心 | add | 12 循环 | 从天而降的火球：下方一团亮核，往上拖一条燃烧的尾焰，6 帧翻滚、尾焰抖动 |

### D. 词缀、司祭（第 1 批）

| id | 类型 | 画布 × 帧 | 锚点 | 混合 | fps | 内容 |
|---|---|---|---|---|---|---|
| `shield_arc` | 序列帧 | 128×256 × 4 | (0.25, 0.5) | add | **不按时间播**：4 帧 = 4 个耐久档 | 坚盾：一面朝右的半透明弧形光盾（像一层竖着的弯光壳），第 0 帧完整，第 1～3 帧依次多一道、两道、三道裂纹（越来越碎），引擎按剩余格挡次数选帧 |
| `blink_flash` | 序列帧 | 256×384 × 6 | (0.5, 0.92) | add | 24 一次 | 迅影瞬移：一道竖直的撕裂光缝一下张开、人形的残光被吸进去 / 吐出来，再合上（离开和出现各播一次） |
| `volatile_core` | 序列帧 | 128×128 × 6 | (0.5, 0.5) | add | 10 循环 | 爆裂：一颗不稳定的炽热核，往外鼓、表面裂开细缝，像随时要炸（引擎画在敌人胸口） |
| `elite_crown` | 序列帧 | 256×384 × 8 | (0.5, 0.92) | add | 10 循环 | 精英：从肩头往上缓缓升起的一串细小光片和一圈若有若无的光环（像戴了冠），比 `aura_guard` 更「庄重」，引擎染金 |
| `ward_shell` | 序列帧 | 256×384 × 8 | (0.5, 0.92) | add | 10 循环 | 司祭的咒盾：包住整个人的半透明蛋形外壳，壳面上浮着淡淡的符文、缓慢转动（引擎染灰白偏冷） |
| `ward_break` | 序列帧 | 256×384 × 8 | (0.5, 0.92) | add | 20 一次 | 咒盾破碎：外壳裂成碎片向外崩开、符文散掉 |
| `trap_rune` | 序列帧 | 256×128 × 8 | (0.5, 0.5) | add | 10 循环 | 地上的陷阱符：压扁的圆形符阵，线条在缓慢地明暗流动（已布好、随时会触发） |
| `trap_draw` | 序列帧 | 256×128 × 6 | (0.5, 0.5) | add | 12 一次 | 陷阱符正在画出来：从中心一笔一笔往外展开，最后一帧和 `trap_rune` 第 0 帧接上 |

### E. 五种杂兵的出招 / 命中 / 死亡（第 2 批）

全部是序列帧，**一次性**（不循环），锚点和尺寸按下表；出招类锚点在出手的位置、朝右（引擎按朝向镜像）。

| 敌人 | id | 画布 × 帧 | 锚点 | 混合 | fps | 内容 |
|---|---|---|---|---|---|---|
| 腐骨兵 | `grunt_glint` | 128×128 × 4 | (0.5, 0.5) | add | 16 | 预警：骨刀刃口上一道锈红色的闪光滑过（短、锐） |
| | `grunt_slash` | 256×256 × 6 | (0.3, 0.5) | add | 24 | 出招：一道短而钝的弧形刀光，边缘毛糙、带锈渣颗粒 |
| | `bone_chips` | 192×192 × 6 | (0.5, 0.5) | **normal，带颜色** | 20 | 命中：骨屑和碎骨片向外飞溅（骨白、暗黄） |
| | `bone_collapse` | 256×192 × 8 | (0.5, 0.9) 地面 | **normal，带颜色** | 14 | 死亡：骨架散落成一小堆骨头、扬起一团尘土，最后一帧尘土散尽、只剩骨堆（引擎在最后一帧停留后淡出） |
| 铁甲屠夫 | `brute_heat` | 192×192 × 6 | (0.5, 0.5) | add | 12 循环 | 预警：斧刃从暗变红热、刃口冒出细小热浪（引擎画在斧刃位置） |
| | `brute_cleave` | 384×384 × 8 | (0.35, 0.55) | add | 24 | 出招：沉重宽大的弧形斧光（比腐骨兵的厚两三倍），尾端甩出一串火星 |
| | `metal_spark` | 192×192 × 6 | (0.5, 0.5) | add | 24 | 命中（打在铁甲上）：放射状的金属火花 + 一圈白亮的撞击点 |
| | `armor_fall` | 256×256 × 8 | (0.5, 0.9) 地面 | **normal，带颜色** | 14 | 死亡：几块铁甲板崩落砸地、火星四散，最后只剩地上散落的甲片 |
| 影弓手 | `shadow_fade` | 256×384 × 8 | (0.5, 0.92) | normal，灰度（引擎染紫） | 12 | 死亡：人形轮廓从脚往上化作紫黑色的烟散掉 |
| 灰烛司祭 | `lantern_flare` | 128×128 × 6 | (0.5, 0.5) | add | 16 | 预警：提灯的烛火猛地亮起、往外鼓一圈光 |
| | `rune_shatter` | 192×192 × 6 | (0.5, 0.5) | add | 20 | 命中：几个符文字形碎裂成光屑 |
| | `candle_smoke` | 256×384 × 8 | (0.5, 0.92) | normal，灰度 | 12 | 死亡：烛火熄灭的一缕青烟升起、扩散，人形淡去 |
| 烬翼 | `ember_crack` | 192×192 × 6 | (0.5, 0.5) | add | 12 循环 | 预警：身上的裂纹由暗转亮、裂缝里透出炽光（引擎染红 = 真俯冲 / 琥珀 = 假动作） |
| | `ember_trail` | 256×64（贴图） | (1.0, 0.5) 右端 | add | — | 俯冲的火星拖尾：右端最亮，往左拉长、散成火星点（引擎沿俯冲方向旋转、拉长） |
| | `ember_pop` | 192×192 × 6 | (0.5, 0.5) | add | 24 | 命中：一团余烬爆开、火星四散 |
| | `ash_fall` | 256×384 × 8 | (0.5, 0.92) | normal，灰度 | 12 | 死亡：身体燃尽，灰烬往下飘落、散开 |

合计：**第 1 批** 贴图 7 张（`aim_line`、`aim_mark`、`arrow`、`arrow_trail`、`threat_back`、`warn_fill`、`lane_band`）+ 序列帧 16 组 112 帧；**第 2 批** 贴图 1 张（`ember_trail`）+ 序列帧 15 组 100 帧。

## 四、通用规格（沿用 `docs/ART_FX.md` 第三节）

- **发光类（`add`）只用灰度**（R = G = B）：引擎按敌人、状态、真假染色；真实透明通道（直通 alpha），无背景。中心最亮、平滑衰减到完全透明，边缘不能有硬切口或灰圈。
- **标了「带颜色」的（`arrow`、`bone_chips`、`bone_collapse`、`armor_fall`）是实物**：画成有颜色的，和角色同一套暗黑手绘风格、同样的光源方向（左上）；普通混合。
- 标了「normal，灰度」的烟（`shadow_fade`、`candle_smoke`、`ash_fall`）：灰度带明暗（上亮下暗），引擎乘色。
- 主体四周留透明边；序列帧每格同样大小、对准同一锚点；**每行 4 格**（4 帧 = 4×1，6 帧 = 4×2 空 2 格，8 帧 = 4×2）。
- 循环的序列帧首尾无缝；一次性的序列帧最后一帧要「收得住」（完全消失，或停在一个可以淡出的静止状态）。
- 「可平铺」的贴图（`aim_line`、`lane_band`）左右边缘无缝（左右各 1 列像素差异要很小）。
- 原创暗黑幻想风，手绘笔刷质感，不是干净的数学渐变或几何形状；不要照搬任何现有游戏；不要画角色本体、文字、边框。

## 五、文件结构（`afterglow.fxpack.v1`，两批各一个 zip）

```
fx_enemy_v1_common/                      （第 1 批）
  README_zh.md
  fx.json
  textures/aim_line.png、aim_mark.png、arrow.png、arrow_trail.png、threat_back.png、warn_fill.png、lane_band.png
  frames/<id>/<id>_00.png …              （aura_threat、aura_feint、aura_guard、arrow_break、warn_ring、warn_ring_fake、
                                           warn_flash、meteor、shield_arc、blink_flash、volatile_core、elite_crown、
                                           ward_shell、ward_break、trap_rune、trap_draw —— 16 组）
  sheets/<id>.png                        （每组一张 4 列的序列帧总图）
  docs/preview.png                       （第 1 步预览：每组一帧 + 每张贴图，暗底网格，标 id）
  docs/contact_sheet.png                 （全部帧的总览，暗底）
  docs/tinted_preview.png                （发光类染成 红 #ff3a2e、琥珀 #ffb347、冷蓝 #9fd0ff、金 #ffd65a、紫 #c48bff 叠在暗底上）
  docs/tiling.png                        （aim_line、lane_band 横向 3 次平铺，看不出接缝）

fx_enemy_v1_types/                       （第 2 批）
  README_zh.md
  fx.json
  textures/ember_trail.png
  frames/<id>/<id>_00.png …              （grunt_glint、grunt_slash、bone_chips、bone_collapse、brute_heat、brute_cleave、
                                           metal_spark、armor_fall、shadow_fade、lantern_flare、rune_shatter、candle_smoke、
                                           ember_crack、ember_pop、ash_fall —— 15 组）
  sheets/<id>.png
  docs/preview.png、docs/contact_sheet.png
  docs/per_enemy.png                     （每种敌人一行：预警 → 出招 → 命中 → 死亡，各取关键帧）
```

`fx.json` 的 `textures` 写 `blend`（`add` / `normal`）、`anchor`；`flipbooks` 写 `fps`、`loop`、`anchor`、`blend`（数值按第三节）。`shield_arc` 写 `"fps": 0`（按耐久选帧，不按时间播）。
两批分别上传到 GitHub Release（仓库 `leograntquinn-crypto/afterglow-blade`）。

## 六、交付前自查（我接入前会逐项验收）

1. 每项 id、画布、帧数、锚点、fps、loop、blend 和第三节一致；发光类全部灰度（R = G = B）；「带颜色」的四项不是灰度。
2. 发光类：从亮处平滑衰减到 0，四角和边缘中点 alpha 为 0（屏幕贴边的除外），没有硬边。
3. 循环组首尾无缝（最后一帧到第一帧的差异不大于相邻帧之间的差异）；一次性组最后一帧 alpha 总量明显低于峰值帧（收得住）。
4. `aim_line`、`lane_band` 左右可平铺；`shield_arc` 4 帧裂纹依次增多，第 0 帧无裂纹；`trap_draw` 最后一帧和 `trap_rune` 第 0 帧接得上。
5. `aura_threat` / `aura_feint` / `aura_guard` 三种一眼分得清（尖锐上窜 / 断续闪烁 / 平稳贴身）——这是预警可读性的核心。
6. 文件齐全、命名正确、没有多余的临时文件；`preview.png` 与最终帧一致。

## 七、生成提示词（给 Codex）

### 通用开头（每张都加）
```
Asset type: production VFX for a 2D side-scrolling dark-fantasy action game (original IP). True straight alpha
transparency, no background, hand-painted brush texture (not clean mathematical gradients or geometric shapes).
No characters, no text, no borders. Glow assets are GRAYSCALE ONLY (the engine tints them).
```

### 各项【内容】（接在通用开头后面；画布、帧数、锚点按第三节）
- `aura_threat`：`an aggressive body aura: sharp flame-like tongues of light surging upward from the feet in pulses, crisp edges, breaking into fragments near the top; 8-frame seamless loop; sized for a 260px tall figure standing at the anchor.`
- `aura_feint`：`the same aura silhouette as a threat aura but unstable: broken, flickering, with gaps, like a faulty lamp; clearly reads as "fake"; 8-frame seamless loop.`
- `aura_guard`：`a calm protective light shell hugging a standing body silhouette, slowly breathing, soft edges, no upward flames; 8-frame seamless loop.`
- `aim_line`：`a thin aiming beam, brightest on the center line with fast falloff above and below, with small pulses of light flowing along it; horizontally tileable (seamless left/right edges).`
- `aim_mark`：`a small sharp crosshair with four short arc segments around it, brush-stroke edges.`
- `arrow`（带颜色）：`a painted arrow pointing right: bone shaft, black iron three-edged head, two dark violet fletching feathers; full color, top-left lighting, matching dark hand-painted character art.`
- `arrow_trail`：`an afterimage streak behind a flying arrow: brightest at the right end, stretching and fading to the left, with two or three broken ghost stripes.`
- `arrow_break`：`an arrow snapping in two with a few feather fragments scattering, one-shot 6 frames.`
- `threat_back`：`two overlapping hand-painted sharp chevron arrows pointing right, with a brief rim of light; a warning icon, not geometric.`
- `warn_ring`：`a ground-perspective (2:1 flattened) danger ring: crisp bright outer edge with a soft inward falloff, fine etched rune marks slowly flowing along the ring, breathing brightness; 8-frame seamless loop.`
- `warn_ring_fake`：`the same flattened ring but broken into several flickering segments, clearly incomplete; 8-frame seamless loop.`
- `warn_fill`：`a soft flattened elliptical glow filling the inside of a danger ring, contained at the ellipse edge.`
- `warn_flash`：`a flattened ground flash: the whole ellipse lights up, splits into radial light cracks and quickly dies out; one-shot 6 frames.`
- `lane_band`：`a horizontal ground light band, bright center line with soft top and bottom edges and diagonal streaks flowing forward; horizontally tileable.`
- `meteor`：`a falling fireball: bright core at the anchor with a burning tail streaming upward, tumbling; 6-frame seamless loop.`
- `shield_arc`：`a translucent curved light shield facing right, like a vertical curved shell of light; frame 0 intact, frames 1-3 show one, two, three cracks (progressively more broken).`
- `blink_flash`：`a vertical tear of light opens, a human-shaped afterglow is sucked in, then it seals; one-shot 6 frames.`
- `volatile_core`：`an unstable searing core swelling outward with thin cracks on its surface, as if about to explode; 6-frame seamless loop.`
- `elite_crown`：`small flakes of light rising slowly from the shoulders and a faint ring of light above the head like a crown; solemn; 8-frame seamless loop.`
- `ward_shell`：`a translucent egg-shaped shell enclosing a standing figure, faint runes floating on its surface and slowly rotating; 8-frame seamless loop.`
- `ward_break`：`that shell cracking into shards bursting outward, runes scattering; one-shot 8 frames.`
- `trap_rune`：`a flattened circular rune seal on the ground, lines slowly pulsing; 8-frame seamless loop.`
- `trap_draw`：`the same rune seal being drawn stroke by stroke from the center outward; one-shot 6 frames, last frame matches the armed seal.`
- `grunt_glint`：`a rust-red glint sliding along a bone blade edge, short and sharp; 4 frames.`
- `grunt_slash`：`a short blunt arc of blade light with ragged edges and rust grit particles; 6 frames.`
- `bone_chips`（带颜色）：`bone splinters and small bone fragments bursting outward, bone white and dark ochre; 6 frames.`
- `bone_collapse`（带颜色）：`a skeleton collapsing into a small pile of bones with a puff of dust; dust clears in the last frame leaving the pile; 8 frames.`
- `brute_heat`：`an axe edge heating from dark to red-hot with thin heat shimmer rising; 6-frame seamless loop.`
- `brute_cleave`：`a heavy wide arc of axe light, two to three times thicker than a sword slash, flinging a string of sparks from its tail; 8 frames.`
- `metal_spark`：`radial metal sparks with a bright white impact point; 6 frames.`
- `armor_fall`（带颜色）：`several iron armor plates breaking off and slamming to the ground with sparks, ending with scattered plates; 8 frames.`
- `shadow_fade`：`a humanoid silhouette dissolving from the feet upward into dark smoke; grayscale with top-lit shading; 8 frames.`
- `lantern_flare`：`a lantern candle flame flaring up and pushing out a ring of light; 6 frames.`
- `rune_shatter`：`a few rune glyphs shattering into flakes of light; 6 frames.`
- `candle_smoke`：`a wisp of smoke rising from a snuffed candle, spreading out as a figure fades; grayscale with top-lit shading; 8 frames.`
- `ember_crack`：`glowing cracks on a body surface brightening from dark to searing; 6-frame seamless loop.`
- `ember_trail`：`a diving ember trail, brightest at the right end, stretching left and breaking into spark dots.`
- `ember_pop`：`a burst of embers popping and scattering sparks; 6 frames.`
- `ash_fall`：`a body burning out, ash drifting down and dispersing; grayscale; 8 frames.`

## 八、接入（我这边，子轮 G）

- `tools/build_fx.py` 打成图集（第 1 批一直载入；第 2 批按关卡用到的敌人类型载入，和首领特效同样的按需方式）。
- **8a（代码，先于素材）**：`fx_data.js` 按敌人类型分表（预警 / 出招 / 命中 / 死亡 → 素材 id + 颜色 + 大小），各处改成查表；素材没到时不画新增的那部分（不加代码画的替身）。
- `rig.js drawAura` 改成按状态选 `aura_threat / aura_feint / aura_guard`（染色同现在的颜色表）；精英叠 `elite_crown`；迅影 `blink_flash`；爆裂 `volatile_core`；坚盾 `shield_arc` 按剩余格挡选帧。
- `ai.js drawCues`：瞄准线 `aim_line` 沿路线平铺滚动 + 终点 `aim_mark`；背后来袭 `threat_back`。
- `combat.js`：箭 `arrow` + `arrow_trail`、命中 `arrow_break`；`Hazard.drawFloor` 改 `warn_ring`（屠夫佯攻 `warn_ring_fake`）+ `warn_fill` + 爆发 `warn_flash`；陨落 `meteor`；`Lane` 改 `lane_band`。
- `enemies_ext.js`：咒盾 `ward_shell` / `ward_break`，陷阱 `trap_draw` → `trap_rune`。
- 第 2 批：五种杂兵的出招 / 命中 / 死亡逐个接入（腐骨兵、屠夫、弓手、司祭、烬翼）。
- 验收：截图对比（每种敌人的四个时刻、地面预警真 / 假、词缀、司祭，桌面 + 手机）、全套测试 + 新的确定性测试（每种状态选对素材、真假预警分得开）、帧率；预警可读性等 Quinn 试玩确认。

## 九、接入记录（子轮 G 第 1 批，2026-11-07）

- **包**：`fx_enemy_v1_common.zip`（Release `assets-v8`，6 494 429 字节，sha256 `0d0c5604…7467a`），Muse 验货通过；接入前我这边又查了一遍：16 组 / 7 张的尺寸、帧数、锚点、fps、loop、blend 和第三节一致，发光类全部灰度、边缘 alpha 为 0，`aim_line` / `lane_band` 左右接缝差 0。
- **构建**：`python3 -I tools/build_fx.py --enemy fx_enemy_v1_common`（新加的模式，只打这一包、不动别的图集）→ `fx_enemy_tex`（7 张，桌面 27KB / 手机 11KB；可平铺的两张不裁边）、`fx_enemy`（16 组 112 帧，桌面 440KB / 手机 145KB）。序列帧桌面存交付尺寸的 60%、手机 30%（别的包是 50% / 25%）：地面预警圈在游戏里画得大（屠夫的红圈宽约 240 逻辑像素），按 50% 存会被放大发糊。
- **一直载入**（和主角、刀光同一批，启动后在大地图时就载好）。第 2 批到了以后按关卡里有的敌人载入。
- **8a 数据表**：`fx_data.js` 的 `ENEMY_FX`（第 1 批，每项：素材 id、染色、大小、不透明度、叠画遍数）和 `ENEMY_TYPE_FX`（第 2 批，五种敌人 × tele / attack / hit / death）；画法集中在 `src/enemy_fx.js`。第 2 批的四个时刻已经接好调用点（出招开始、出手、挨打、`game.onKill`），素材没到时查到了也不画。

| 原来（代码画 / 通用贴图凑的） | 现在 |
|---|---|
| `rig.js drawAura` 径向渐变（敌人和首领） | `aura_threat`（出招红、首领出招红、狂暴橙红）、`aura_feint`（佯攻露馅琥珀）、`aura_guard`（举斧格挡冷蓝、霸体橙、迅影闪现后紫、精英金、首领平时用首领的颜色）。按敌人身高缩放（素材按身高 260 画），每只敌人播放相位错开。主角自己的蓄力 / 霸体光不在本包，还是原来的 |
| 精英只有金色光晕 | 叠 `elite_crown`（画在身体前面） |
| 迅影：冲击环 + 光点 | 离开和出现各播一次 `blink_flash`（冲击环、光点保留） |
| 爆裂：只有词缀标签 | 胸口 `volatile_core` |
| 坚盾：描边椭圆 + 折线裂纹 | `shield_arc`，按已经挡掉的次数选帧（挡 0 下 = 第 0 帧完整，挡 3 下 = 第 3 帧最碎） |
| 弓手瞄准线：红色虚线 | `aim_line` 沿真实路线平铺、往前流，终点 `aim_mark` 慢慢转 |
| 背后来袭：两个描边三角 | `threat_back`（朝右，左边镜像） |
| 箭：两条线段 + 三角 | `arrow`（带颜色的实物）+ 后面的 `arrow_trail`；打中 / 被立柱挡掉播 `arrow_break`。夜鸦的箭雨也是这支箭 |
| 地面预警：通用环 + 柔光染红 + 往里收的细环 | `warn_ring`（越临近爆发播得越快）+ 从中心往外放大的 `warn_fill`；屠夫佯攻露出破绽后换成断开的 `warn_ring_fake`（琥珀，叠画 3 遍：素材本身很淡） |
| 爆发后的实心椭圆 | `warn_flash` |
| 陨落：两个圆 + 一个矩形 | `meteor` |
| 冲锋 / 齐射路线：两个矩形 | `lane_band` 沿路线平铺、往前流 |
| 司祭咒盾：通用环 + 光晕染紫 | `ward_shell`（灰白偏冷，`#cfc8ff`）；破碎播 `ward_break` |
| 陷阱符：通用符文圈染紫 | 先播 `trap_draw` 把符阵画出来（30 帧，布好要 40 帧），接着循环 `trap_rune` |

- **代码画的删掉了**（第 14 项）：径向状态光、虚线瞄准线、描边三角、线段箭、陨落光球、爆发椭圆、路线矩形、坚盾椭圆 + 裂纹；这些素材没载好时**不画**。地面红圈、咒盾、陷阱符没载好时仍用原来的手绘环 / 符文贴图（成品贴图，不是代码画的形状），因为红圈是玩法信息。
- **调过的地方**（截图对比后）：佯攻光、格挡光、迅影光放大 10～15% 并叠画 2 遍（贴身的光壳大部分被身体挡住）；坚盾缩小到身高的 80%、往前挪、不透明度 0.7（原尺寸会盖住半个敌人）；陷阱符叠画 2 遍；箭放大到 0.5 倍（约 50 逻辑像素长）；瞄准线粗一点。
- **验收**：确定性测试 `efxtest`（18 项：图集和帧数、三种状态光的颜色、佯攻光的帧间亮度起伏明显大于真预警（实测 1.98 对 1.29）、每种状态选对状态光、坚盾选帧、真假红圈的切换时机和颜色、迅影 / 咒盾破碎 / 箭断的一次性特效、陷阱符的播放顺序、第 2 批查表不画、素材没载好时不画也不出错）。截图对比 `docs/fx_enemy_v1_cmp.jpg`（桌面）/ `docs/fx_enemy_v1_cmp_m.jpg`（手机）：上 v45、下本轮，两组场景（状态光 + 词缀；地面预警真假圈 + 陨落 + 瞄准线 + 箭 + 咒盾 + 陷阱符 + 背后来袭）。
- **待 Quinn 看**：三种状态光一眼分不分得清（尤其是佯攻的琥珀断续光和格挡的冷蓝光，比原来的整团光晕小、贴身）；假红圈够不够显眼（素材是断开的几段，比原来的淡红整圈更「不完整」，也更淡）；陷阱符比原来细；瞄准线现在是一节节流动的光点而不是连续虚线。
- **全套回归**（最终代码 `8ce1776`）：全部通过（含新的 `efxtest` 18 项、两个自动通关五关全通、页面无报错），只有 `aitest3` 的「令牌上限和连段保护」一项失败了一次。查下来是**测试本身的时序误报**，不是游戏规则被破坏，也不是这一轮引起的：
  - 测试在敌人出招预警的第 1 帧才看「连段保护开没开」；保护恰好在出招开始后的下一帧打开时，这次出招会被算成「保护期间出招」。加了记录跑 40 次：本轮 1 次、v45 也是 2 次，每一次都是「出招开始那一帧保护还没开（`mayAttack` 为真）、下一帧才开」。80 次里没有一次是保护开着时开始出招。子轮 E 时那一次没能复现的失败也是这个。
  - 修正（只改测试）：按「开始出招那一帧」保护开没开来判。修正后连跑 8 次全过。
- **帧耗时**（渲染一帧，两次平均；无头浏览器是软件渲染，绝对值偏大，只看对比）：状态光 + 词缀的场景 v45 50.2 → 本轮 50.4 毫秒（桌面）、330 → 331 毫秒（手机 4 倍降速），持平；地面预警 + 瞄准线 + 光带 + 陷阱符堆在一起的场景 50.3 → 53.2 毫秒（桌面）、336 → 358 毫秒（手机，两次分别 346 / 369，波动大），约多 6%：大张的预警圈加填充光、平铺的瞄准线和光带比原来的几何形状多画一些像素。这是专门堆满特效的压力场景，正常战斗里同时出现的预警没这么多。
