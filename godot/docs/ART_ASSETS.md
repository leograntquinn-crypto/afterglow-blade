# 美术素材清单

现在的角色是代码画的占位模型，场景是程序生成的。这份清单列出替换成正式美术需要的素材，按**对观感的提升从大到小**排序。

## 先说两件事

**1. 优先找现成素材包。** 角色动画最难用 AI 生成：每一帧的角色要长得一模一样，而 AI 生成的图常常每张都不一样（衣服细节、比例、武器会变）。所以：

| 素材 | 建议 |
|---|---|
| 角色和敌人的动画 | **优先用素材包**。在 itch.io 搜索关键词见下文 |
| 背景、场景元素 | AI 很擅长，可以直接生成 |
| 技能图标、装备图标、头像 | AI 很擅长 |
| 粒子、刀光 | 不需要，代码已经做了 |

**2. 选素材包时看清授权。** 要选允许商用、允许修改的（CC0、CC-BY，或者作者写明 commercial use OK）。把授权说明和素材一起放进仓库。

### itch.io 搜索关键词
- 角色：`dark fantasy swordsman sprite sheet`、`knight sprite sheet side view`、`samurai sprite sheet`
- 敌人：`skeleton enemy sprite sheet`、`undead enemies pixel`、`executioner boss sprite`
- 场景：`gothic dungeon background parallax`、`crypt tileset side view`

**重要**：主角和敌人最好来自**同一个作者或同一种画风**（同为像素风，或同为手绘风），否则放在一起会很违和。选好之后告诉我素材包的名字或链接，我来写导入和动画配置。

---

## 交付格式（无论来自素材包还是 AI）

- **PNG，透明背景**
- 角色每个动画一张**横向长条图**（所有帧从左到右排成一行，每帧大小相同），文件名写明帧数，例如 `hero_run_8f.png`
- 角色**朝右**，侧视角，脚底在每一帧的同一高度
- 放到仓库的 `godot/assets/art/incoming/` 文件夹，推送到 `godot-port` 分支（也可以在 GitHub 网页上「Add file → Upload files」）

---

## A. 角色动画（优先找素材包）

### A1 主角「残光剑士」　每帧 256×256，角色高约 180 像素

| 动画 | 帧数 | 文件名 | 说明 |
|---|---|---|---|
| 待机 | 6~8 | `hero_idle_8f.png` | 呼吸起伏，剑垂在身前 |
| 奔跑 | 8 | `hero_run_8f.png` | |
| 一段斩 | 5~6 | `hero_attack1_6f.png` | 从上往下劈，**第 3 帧**是命中瞬间 |
| 二段斩 | 5~6 | `hero_attack2_6f.png` | 从下往上反撩 |
| 三段斩 | 7 | `hero_attack3_7f.png` | 跨步重劈，**第 3 帧**命中 |
| 上挑 | 6 | `hero_upper_6f.png` | 由下往上挑飞 |
| 起跳 / 下落 | 2 + 2 | `hero_jump_2f.png`、`hero_fall_2f.png` | |
| 空中斩 | 5 | `hero_airattack_5f.png` | |
| 空中下劈 | 6 | `hero_airslam_6f.png` | |
| 闪避 | 4 | `hero_dash_4f.png` | 前冲，身体压低 |
| 冲刺突刺 | 6 | `hero_thrust_6f.png` | |
| 受击 | 2 | `hero_hurt_2f.png` | |
| 击倒 → 躺地 → 起身 | 5 + 4 | `hero_knockdown_5f.png`、`hero_getup_4f.png` | |
| 施法 | 6 | `hero_cast_6f.png` | 放技能时的蓄力动作 |
| 死亡 | 6 | `hero_death_6f.png` | |

**AI 生成提示词（先做一张设定图，确定外观）**：
```
2D side-view action game character concept sheet, a young swordsman in a dark navy
long coat with split coat tails, cyan cloth headband with long trailing ribbons,
dark spiky hair, steel pauldron on the right shoulder, brown leather belt with gold
buckle, dark boots, holding a slim longsword with a faint cyan glow along the blade,
hand-painted dark fantasy style, clean readable silhouette, cel shading with soft
gradients, muted desaturated palette with cyan accent, front view and side view,
full body, plain transparent background
```
**每个动画（在设定图基础上，用图生图或角色参考功能）**：
```
sprite sheet, 8 frames in a single horizontal row, equal spacing, the same swordsman
character from the reference image, side view facing right, [running cycle],
consistent proportions and colors in every frame, feet aligned on the same baseline,
hand-painted dark fantasy game sprite, transparent background, no text, no shadow
```
把方括号里的内容换成：`idle breathing animation` / `running cycle` / `overhead sword slash` / `rising upward sword slash` / `heavy stepping slash` / `dash forward low to the ground` / `hit reaction recoiling backward` / `knocked down falling on the back` …

### A2 敌人　每帧 256×256（屠夫 320×320）

| 角色 | 需要的动画（帧数） |
|---|---|
| 腐骨兵（骷髅剑兵） | 待机 6、走路 8、出刀蓄力 4、出刀 5、受击 2、被打飞 3、倒地 4、起身 4、死亡散架 6 |
| 影弓手（兜帽弓手） | 待机 6、走路 8、拉弓 5、放箭 3、受击 2、被打飞 3、倒地 4、起身 4、死亡 6 |
| 铁甲屠夫（重甲巨汉，双手斧） | 待机 6、走路 8、举斧蓄力 5、砸地 5、受击 2、破防踉跄 4、倒地 4、起身 4、死亡 6 |

提示词参考：
```
腐骨兵：undead skeleton soldier, rusty broken chest plate, tattered loincloth,
glowing red eye sockets, rusty short sword ...
影弓手：hooded archer in a dark purple cloak, face hidden in shadow with two glowing
violet eyes, quiver on the back, wooden recurve bow ...
铁甲屠夫：huge armored executioner, horned iron bucket helmet with glowing orange eye slit,
spiked pauldrons, bare muscular arms with iron bracers, leather apron,
giant two-handed axe ...
```
（后面接上 A1 里「每个动画」那段格式要求）

### A3 首领（第 3 步再做）
骸骨统领、夜鸦、铁颚、祭坛守护者、残影（黑化的主角：白发、紫色太刀、紫色眼睛）。

---

## B. 场景（AI 可以直接生成）

每个关卡一套，共 5 套。下面以第一关「墓穴入口」为例，其他关卡换颜色关键词即可。

| 图层 | 尺寸 | 文件名 | 说明 |
|---|---|---|---|
| 远景后墙 | 3600×660 | `crypt_wall.png` | 不透明，可以左右无缝拼接 |
| 柱子与旗帜 | 3600×660 | `crypt_pillars.png` | 透明背景，柱子间隔约 600 像素 |
| 地面 | 3600×420 | `crypt_floor.png` | 带透视的石板地面，可左右无缝拼接 |
| 前景装饰 | 2048×300 | `crypt_foreground.png` | 透明背景：垂下的锁链、地上的碎骨和石块 |

```
后墙：2D side-scroller game background, interior wall of an ancient underground crypt,
dark purple stone bricks, arched alcoves in deep shadow, hanging iron chains,
hand-painted dark fantasy style, moody low light, seamless horizontal tiling,
orthographic side view, no characters, no text

柱子：row of gothic stone pillars with carved capitals, tattered crimson banners with
a gold circular emblem hanging between them, iron torch sconces, side view,
hand-painted dark fantasy, transparent background, seamless horizontal tiling

地面：stone slab floor of a crypt seen from a low side-scroller camera angle,
worn flagstones with cracks and dust, slight perspective, hand-painted,
seamless horizontal tiling, no characters
```
其他关卡的颜色关键词：
- 骸骨回廊：`cold blue stone, pale blue torchlight, navy banners`
- 屠夫刑场：`reddish brown stone, blood-stained floor, hanging hooks, orange firelight`
- 深渊祭坛：`moss-green stone, glowing green runes, emerald flames`
- 残光深渊：`deep indigo stone, floating violet crystals, purple void light`

---

## C. 界面（AI 可以直接生成）

| 素材 | 尺寸 | 数量 |
|---|---|---|
| 主角头像（半身） | 256×256 | 1 |
| 技能图标：裂空斩、回风斩、崩山击、千刃·残光 | 128×128 | 4 |
| 被动技能图标：剑术精通、残心、回气 | 128×128 | 3 |
| 装备图标：长剑、太刀、巨剑、头盔、护甲、戒指 | 128×128 | 6 |

```
技能图标：square game skill icon, [a crescent of cyan sword energy flying forward],
dark fantasy, painterly, high contrast, glowing cyan accent on a dark background,
no text, no border
```
方括号内容依次换成：
- 裂空斩：`a crescent of cyan sword energy flying forward`
- 回风斩：`a spinning whirlwind of blade light`
- 崩山击：`a sword slamming into the ground, shattering rock`
- 千刃·残光：`dozens of afterimage sword slashes crossing`

装备图标不用画边框，品质颜色（白、蓝、紫、橙）由代码加。

---

## D. 音效与音乐（可选，之后再说）
现在的音效是程序生成的。如果找到更好的，直接替换 `assets/sfx/` 里的同名 WAV 文件：
`swing` 挥刀、`hit` 命中、`heavy` 重击、`jump` 起跳、`land` 落地、`dash` 闪避、`hurt` 受伤、`skill` 技能、`kill` 击杀、`deny` 操作无效。

---

## 推荐的顺序
1. **先定主角的画风**：找一个素材包，或用 AI 生成一张设定图，发给我看
2. 主角动画到位后，我接入 `AnimatedSprite2D`，判定帧和动画帧对齐
3. 再做敌人、场景、图标
