# 「绯隼」素材：接入情况与优化指南

## v2 接入情况（当前版本）

素材包 `feisun_swordswoman_v2.zip`（Release `assets-v2`）：21 组动画、121 帧，攻击帧干净、跑动/攻击/闪避是原地动画、跳跃脚底在基线上。v1 指南里的 P0、P1 全部解决，已经全部接入。

| 游戏里 | 用的动画 |
|---|---|
| 普攻三段 | `attack_01/02/03`（8 帧，接触帧 3~4 对齐出伤帧） |
| W+J 上挑 | `launcher` |
| 空中三连 | `air_slash_01` → `air_slash_02` → `air_slash_01` |
| 空中 S+J 坠星斩 | `starfall_air`（下坠时停在末帧）→ 落地切 `starfall_land` |
| 冲刺攻击、五连刺 | `thrust`（五连刺在伸出帧之间来回切） |
| S+J 扫腿 | `low_sweep` |
| 按住 J 蓄力 | `charge` 循环（二段蓄力时播放加倍） |
| 裂空斩、崩山击 | `cast`（崩山击蓄力段用 `charge`） |
| 千刃·残光 | `cast` 起手 → 突刺 / 三段斩出刀帧轮换 → 重斩收尾 |
| 必杀 | `cast` 起手 → 瞬身斩交替两种出刀 → `charge` → 重斩 |
| 被击飞 | `air_hurt`，空中受身 `tech`，倒地后 `getup` |
| 跳跃 | `jump` 8 帧按上升/下落速度选帧，落地后播 6、7 两帧缓冲 |
| 首领「残影」 | 同一套动画（施法、突刺、三段斩），暗紫色覆盖 |

**刀光拖尾重新打开了。** 处理脚本会在每一帧里找出刀（细长的钢灰色连通区域），记下刀柄和刀尖；游戏在相邻两帧之间让刀尖绕刀柄转过去，扫出一段弧。刀光贴着画出来的刀走，颜色跟武器品质走。68 个攻击类帧里自动检测到 58 帧，另外 7 帧（刀被身体挡住或太细）在 `tools/build_sprites.py` 的 `BLADE_FIX` 里手工标注，剩 3 帧不在出刀窗口里，不影响。

### v2 剩下的小问题（不急）

1. **素材包里有 3 个残留的临时文件**：`atlas/.feisun_atlas.png.9jPqor` 之类，是生成时没写完的半截文件，可以删掉。
2. **`low_sweep_04` 刀柄刀尖方向检测反了**（刀柄在膝盖旁边，判定被腿干扰）。它是收招帧，不在刀光窗口里，所以没影响；以后要用可以加进 `BLADE_FIX`。
3. **起身第 1 帧（仰躺）和倒地最后一帧（侧躺）姿势接不上**，倒地 → 起身切换时会跳一下。下次可以让倒地末帧也是仰躺，或者起身第一帧改成侧躺。
4. **武器单独一层、左右手**：仍按 P2 保持现状。

---

## v1 指南（存档）

素材包 `feisun_swordswoman_v1.zip`（GitHub Release `assets-v1`）。整体质量很好：手绘风格统一、轮廓清楚、**脚底基线非常稳（±2px）**，已经接入游戏作为主角。

## 一、我已经做了什么

| 处理 | 方法 | 文件 |
|---|---|---|
| 缩小 + 打图集 | 512 → 256，8×7 WebP 图集，35MB → 0.8MB | `assets/hero/feisun_atlas.webp` |
| 跑动去漂移 | 用头和上半身轮廓与第一帧做模板匹配，逐帧对齐 | `tools/build_sprites.py` |
| 跳跃去高度 | 按脚底对齐，高度由游戏的物理算 | 同上 |
| 动作映射 | 游戏里 18 个招式映射到素材的 9 组动画，命中帧对齐到出伤帧 | `src/sprite.js` |
| 轮廓光 | 角色剪影往四周错开一点、用冷色画在身后，深色衣服在暗场景里也看得清 | `src/sprite.js` |
| 闪白 / 残影 | 运行时把整帧染色并缓存 | `src/sprite.js` |
| 首领「残影」 | 同一套动画，盖一层暗紫色 + 紫色轮廓光 | `src/boss.js` |
| 立绘、头像 | 标题画面、营地、必杀演出、血条头像 | `assets/hero/` |

重新处理素材：`python3 -I tools/build_sprites.py <解压后的素材包目录> hero`

## 二、诊断结果

见 `docs/feisun_diagnosis.jpg`：每组动画的 6 帧半透明叠在一起，青线是锚点，橙线是脚底基线。**叠影越集中越稳。**

| 动画 | 结论 |
|---|---|
| 待机 | ✅ 很稳，不用改 |
| 跑动 | ⚠️ 头和身体前后游动约 35px（原地跑应该在 4px 以内）。我修掉了一部分，根治需要重画 |
| 跳跃 | ⚠️ 图里带了 46px 的上升高度，和游戏物理叠加。我已经去掉了 |
| 三段攻击 | ⚠️ 身体前冲 40～63px，游戏代码也会让角色前冲，两者叠加；斩击光效画进了帧里 |
| 闪避 | ⚠️ 身体前冲 94px，问题同上 |
| 受击、倒地 | ✅ 动作本身就有后仰和倒下，正常 |

## 三、要改什么（按优先级）

### P0 · 影响手感，最先做

**1. 攻击帧去掉斩击光效（出一版「干净」的攻击帧）**
现在挥刀的弧光画在角色帧里。问题是：
- 游戏要根据武器品质改变刀光颜色（白/蓝/紫/橙），画死的光效改不了
- 游戏里的技能、空中攻击都复用这几组攻击帧，画死的光效在技能里会重复出现
- 命中时游戏自己会画斩痕、火花、冲击帧，叠上画死的光效显得乱

→ 重新生成 `attack_01/02/03`，只要人和刀，**不要任何光效、拖影、发光**。光效全部交给引擎。

**2. 补齐缺失的动作**
游戏现在有 18 个招式，素材只有 9 组动画，下面这些是用相近动作「借」的，越靠前越影响观感：

| 动作 | 帧数 | 游戏里的用途 | 现在借用的 |
|---|---|---|---|
| 上挑 launcher | 6 | W+J 把敌人挑上天 | 挑斩 |
| 空中斩 ×2 | 5 + 5 | 空中三连 | 地面三段斩 |
| 坠星斩（下坠 + 落地） | 3 + 3 | 空中 S+J | 重斩的单帧 |
| 突刺 thrust | 6 | 冲刺攻击、五连刺 | 横斩 |
| 扫腿 low sweep | 6 | S+J | 横斩 |
| 蓄力（循环） | 4 | 按住 J | 重斩的举刀帧 |
| 施法 cast | 6 | 技能起手 | 重斩 |
| 被击飞（空中） | 3 | 被打上天 | 倒地前 3 帧 |
| 起身 getup | 5 | 倒地后站起 | 倒地倒放 |
| 受身 tech | 3 | 空中翻身 | 跳跃 |

### P1 · 动画质量

**3. 加帧。** 每组 6 帧对快节奏战斗偏少，看起来会「跳」。建议：
- 攻击 8～10 帧：起手 2、挥出 1（带动作模糊的「拖影帧」）、命中 2、收招 3
- 跑动 8 帧
- 闪避 8 帧

**4. 做成「原地」动画。** 跑动、攻击、闪避都不要让身体在画布里移动，位移由游戏代码控制。要求：**头和躯干的水平位置每帧都在 x≈220 附近（±4px）**，只有手脚和武器动。

**5. 跳跃只要姿势，不要高度。** 起跳下蹲 / 上升 / 最高点 / 下落 / 落地，**每一帧脚底都在 y=448**（空中姿势也一样，以脚底为准）。

### P2 · 观感

**6. 加一点冷色边缘光。** 角色平均亮度 92/255，深色裤装在暗色墓穴里不够醒目。我在引擎里加了轮廓光作为补救，素材本身带边缘高光效果会更好。

**7. 武器单独一层（以后再做）。** 现在刀画在角色身上，装备系统换武器时外观不会变。如果以后要做「换刀换外观」，需要：一套不拿武器的角色帧 + 每帧武器的位置/角度（或单独的武器图）。

**8. 左右朝向（可以不改）。** 朝左是镜像，持刀手会从右手变成左手。2D 动作游戏普遍这样做，玩家很少注意到。

## 四、交付规格（沿用这一包的规格，我的处理脚本可以直接复用）

- 每帧 512×512 透明 PNG，锚点 (220, 448)，朝右
- 文件名 `动作名_00.png`、`动作名_01.png`……
- 附带 `animations.json`，格式和这一包相同（`frame_names`、`duration_ms`、`suggested_contact_frame_indices`）
- 打包成 zip，作为新的 Release 附件上传（比如 `assets-v2`）

## 五、生成提示词

沿用素材包 `docs/generation_prompts.json` 里的方法：**用 `artwork/hero_fullbody.png` 作为身份参考图**。每组动作用下面的模板，替换最后的【动作】部分。

### 通用模板（8 帧，4 列 × 2 行，2048×1024）
```
Use case: stylized-concept. Asset type: production sprite animation sheet for a 2D side-scrolling action game.
The reference image is the IDENTITY / COSTUME reference, not the layout. Draw exactly the SAME adult silver-haired
female swordswoman: small high ponytail dark ribbon red ornament, ivory short jacket, dark navy fitted trousers,
bracers, knee-high boots, crimson short sash tails, ONE long single-edged steel sword. Preserve her face, hair,
weapon, outfit and proportions, in crisp high-quality hand-drawn anime game art with consistent controlled cel
shading. Subtle cool rim light along the back edge of the silhouette.
OUTPUT LAYOUT IS CRITICAL: exactly EIGHT full-body sequential animation poses in a uniform FOUR-column TWO-row
sprite sheet, landscape 2048 by 1024 pixels, each invisible tile 512 by 512. Reading order left to right, top row
then bottom row. All cells identical camera and identical character scale: standing figure height approximately
360 px. Facing RIGHT throughout, side / three-quarter side camera.
IN-PLACE ANIMATION: feet ground line at y=448 inside EACH tile; head and torso stay near x=220 inside each tile
(within 4 px) — only limbs, hair, sash and sword move. Do not translate the body across the tile.
CLEAN FRAMES: NO slash effects, NO motion trails, NO glow, NO speed lines, NO sparks — character and sword only.
Real alpha transparency, no backdrop, no ground shadow, no grid, no borders, no text, no frame numbers.
ACTION: 【动作】
```

### 各动作的【动作】描述
- **上挑**：`rising upward launcher slash: 1-2 crouch low with sword held back and down; 3 explosive upward swing, blade passing in front of the body; 4 blade high above head, body rising on toes; 5-6 hold high; 7-8 recover to ready stance.`
- **空中斩 A**：`airborne horizontal slash, legs tucked in mid-air: 1-2 wind up sword behind shoulder; 3 fast horizontal cut forward; 4-5 follow-through; 6-8 recover to airborne ready pose. Feet line still at y=448 as the lowest point of the pose.`
- **空中斩 B**：`airborne rising backhand slash, legs tucked: 1-2 sword low behind; 3 diagonal upward cut; 4-5 follow-through high; 6-8 recover.`
- **坠星斩**：`downward plunge from the air: 1-2 sword raised overhead in mid-air; 3-5 diving straight down, sword pointing down past the feet; 6 impact crouch on the ground, sword driven into the floor; 7-8 rising from the impact crouch.`
- **突刺**：`lunging thrust: 1-2 sword pulled back at hip, weight on back leg; 3-4 full extension thrust straight forward at chest height; 5-6 hold extension; 7-8 recover. Keep the torso near x=220; the arm and sword extend forward.`
- **扫腿**：`low sweeping slash: 1-2 drop into a deep crouch; 3-4 sword sweeps horizontally at ankle height; 5-6 follow-through low; 7-8 rise to ready stance.`
- **蓄力循环（4 帧）**：`charging power loop: sword raised high behind the head with both hands, knees bent, body tense and trembling slightly; 4 frames looping seamlessly.`（布局改成 4 列 × 1 行，2048×512）
- **施法**：`skill cast: 1-2 draw the sword up in front of the face, eyes closed; 3-4 snap eyes open, sword pointed forward; 5-6 strike pose; 7-8 return to ready stance.`
- **被击飞（3 帧）**：`launched airborne by a heavy hit: body arched backward in the air, arms flung out, sword still in hand; 3 frames.`
- **起身（5 帧）**：`getting up from lying on the back: 1 lying; 2 pushing up on one arm; 3 kneeling; 4 rising; 5 ready stance.`
- **受身（3 帧）**：`mid-air recovery flip: tuck and backflip in the air, landing ready; 3 frames.`
- **攻击（干净版，替换 attack_01/02/03）**：沿用原来的动作描述，加上模板里的 `CLEAN FRAMES` 和 `IN-PLACE ANIMATION` 两段，并把帧数改成 8。

### 生成后的检查
1. 把 8 帧半透明叠在一起看（就像 `docs/feisun_diagnosis.jpg`）：头和躯干应该基本重合
2. 脚底都在同一条线上
3. 脸、发型、刀形每帧一致；不一致的帧单独重新生成，或者手动修图
