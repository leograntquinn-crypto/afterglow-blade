# 敌人素材：规格与生成提示词

游戏里的敌人还是程序画的骨架小人，和手绘的「绯隼」放在一起差距很大。这份文档列出要做的 3 套敌人素材。

**3 套素材能覆盖全部敌人：**

| 素材 | 游戏里的敌人 | 用到它的首领（引擎会放大、换颜色，不用单独画） |
|---|---|---|
| 腐骨兵 `grunt` | 最常见的杂兵，近身劈砍 + 中距离突刺 | 骸骨统领（第 1 关） |
| 铁甲屠夫 `brute` | 重甲大块头，有霸体 | 铁颚（第 3 关）、祭坛守护者（第 4 关） |
| 影弓手 `archer` | 远程，会后跳拉开距离 | 夜鸦（第 2 关） |

（第 5 关首领「残影」已经在用绯隼的素材。）

## 进度

| 素材 | 状态 |
|---|---|
| 腐骨兵 P0 | ✅ 已接入（Release `assets-v3` 的 `enemy_grunt_v1.zip`）。骸骨统领也在用它（放大 1.5 倍、压暗、红色轮廓光） |
| 铁甲屠夫 P0 | ✅ 已接入（`assets-v3` 的 `enemy_brute_v1.zip`）。铁颚、祭坛守护者也在用它 |
| 影弓手 P0 | ✅ 已接入（`assets-v3` 的 `enemy_archer_v1.zip`）。夜鸦也在用它 |
| 三套 P1 | 待做。首领现在借用 P0：冲锋用突刺帧（屠夫用快速走路帧），撞墙晕眩用受击帧，瞬移用后跳帧 |

### 走路动画的问题和处理（三套都有，腐骨兵最明显）

量了每帧上身（头肩到腰）的水平位置和头顶高度：

| 走路 | 上身前后晃 | 头顶上下跳 |
|---|---|---|
| 腐骨兵 | **37px** | **31px**，而且不规律 |
| 铁甲屠夫 | 18px | 7px |
| 影弓手 | 21px | 14px |

（512 尺度。腐骨兵的 37px 在游戏里约 9px，是身高的 11%，每秒晃 10 次。）

素材按骨盆对齐了，但驼背的身体在骨盆上面前后摆，所以看起来一抽一抽的。处理：
- 处理脚本按上身重心给每帧加水平偏移，拉回 75%（腐骨兵 37 → 9px，屠夫、弓手 → 5px）。只改偏移，不动像素
- 游戏里走路帧按**实际移动距离**推进（以前按固定节奏，走得很慢时脚也在快速踏步）
- **后退时倒着播**（以前攻击后边面朝玩家边往后退，播的是向前走，像太空步）
- 速度很小时显示待机，不在待机和走路之间来回闪
- 腐骨兵待机一帧比一帧低、播完跳回第一帧，改成来回播

**下次做走路动画**，提示词里加一句：`the torso and head keep the same lean and the same horizontal position in every frame; only the legs, arms and weapon move; the head bobs smoothly — lowest on the contact frames (0 and 4), highest on the passing frames (2 and 6)`。

### 腐骨兵 v1 的接入结论

整体合格，可以照这个标准做后面两套：原地动画、骨盆对齐、预警帧好认（举剑过肩 vs 剑收腰侧）、倒地末帧 = 起身首帧，这几条都做到了。

接入方式：
- 预警段：前 35%（最多 10 帧）播举刀，剩下的时间停在预警帧（第 2 帧）上，同时引擎画红光和感叹号
- 出招段：劈砍第 3 帧、突刺第 3～4 帧对齐出伤帧；突刺前冲的整段都停在伸展帧上
- 走路的步频跟着实际移动速度；被打飞时按上升 / 下落速度选 `air_hurt` 的帧；倒地后直接接 `getup`
- 首领「骸骨统领」按武器角度选帧：举刀 → 预警帧，挥砍中 → 接触帧，劈下后 → 收势帧；冲锋用突刺帧，撞墙晕眩用受击帧

**唯一的问题：整体偏暗。** 骨头画成了锈褐色，暗紫色的墓穴地面上，离主角远一点（灯光照不到）就几乎只剩剪影。现在引擎里做了补救（暖色轮廓光 + 整体提亮 30%），站在主角附近时没问题。

**后面两套要注意：**
- **铁甲屠夫**：盔甲和斧刃留出明显的高光（金属边缘一条亮线），皮肤用偏暖的中间调，不要整体压暗
- **影弓手最要小心**：「暗紫黑色斗篷」本身就和地面一个颜色。提示词里加上 `bright cool rim light along the cloak edges, glowing violet eyes clearly visible, lighter purple highlights on the cloak folds`，让斗篷边缘、弓和眼睛亮起来。生成后缩到 90px 放在暗背景上看一下，看不清剪影就重做

## 一、做的顺序

1. **先只做腐骨兵的 P0 动作**，上传让我接进游戏。它最常见，接好就能看出问题，问题先在一套上改完，另外两套就不用返工
2. 腐骨兵没问题后，做铁甲屠夫和影弓手的 P0
3. 最后做三套的 P1（首领招式）。没有 P1，首领会先借用 P0 里相近的动作

每套的第一步都是**先生成一张身份参考图**（全身立绘），之后所有动作表都拿它当参考。这和绯隼用 `hero_fullbody.png` 当参考是同一个办法，可以保证每一帧都是同一个角色。

## 二、交付规格（和绯隼素材包一样）

- 每帧 **512×512** 透明 PNG，**朝右**，锚点 **(220, 448)**，也就是脚底中心在这个点
- **角色站立高度**：腐骨兵、影弓手约 **330px**，铁甲屠夫约 **300px**。屠夫举斧过头时要留出空间，所以画小一点，游戏里会按体型放大
- **原地动画**：骨盆的水平位置每帧都在 x≈220 附近，左右不超过 6px。前冲、后跳、击退的位移由游戏控制。身体可以前倾、后仰，但不要整个人在格子里平移
- **脚底在 y=448**：包括跳起来的姿势，空中帧的最低点也放在 448，高度由游戏算
- **干净帧**：不要刀光、拖影、发光、速度线、火花、血花、尘土、地面阴影。眼睛的光可以画成一个小亮点，不要外发光。红色预警光、受击闪白这些都由引擎画
- **帧数只用 4 或 8**：4 帧排成 4 列×1 行（2048×512），8 帧排成 4 列×2 行（2048×1024）。这样生成工具不用留空格
- **倒地最后一帧 = 起身第一帧**：同一个仰躺姿势。绯隼 v2 这两帧不一样，倒地→起身时会跳一下
- 文件名、`animations.json` 格式和绯隼素材包相同：`frames/动作名/动作名_00.png`……，JSON 里包含 `frame_names`、`duration_ms`、`suggested_contact_frame_indices`
- 打包：一套一个 zip，`enemy_grunt_v1.zip`、`enemy_brute_v1.zip`、`enemy_archer_v1.zip`，放进 Release **`assets-v3`**

## 三、动作表

**编号注意**：表格里的帧号从 0 开始（和 `animations.json` 一致），英文提示词里从 1 开始（生成工具更容易理解）。比如腐骨兵 `slash` 表格写「2 预警」，提示词里就是 `3 WIND-UP HOLD`。

「接触帧」是武器打中的那一帧，我会把它对到游戏的出伤帧上。「预警」是出招前停住的姿势：游戏里敌人会停在这个姿势 0.4～0.9 秒，同时引擎画红光提示玩家闪避，所以**这一帧的剪影要一眼能看出要出什么招**。

### 共用动作（三套都要，P0）

| 动作 ID | 帧数 | 循环 | 说明 |
|---|---|---|---|
| `idle` | 4 | 是 | 待机，轻微呼吸起伏 |
| `walk` | 8 | 是 | 原地走（追击玩家时用） |
| `hurt` | 4 | 否 | 受击：0 被打的瞬间往后一缩，1 后仰最大，2～3 恢复。前两帧用得最多，要有力度 |
| `air_hurt` | 4 | 否 | 被打飞到空中：身体后弓、四肢甩开，0→3 慢慢翻转成快要背朝下 |
| `down` | 4 | 否 | 摔倒：0 着地撞击，1 弹起一点，2～3 **仰躺**静止 |
| `getup` | 4 | 否 | 起身：0 **和 down 的最后一帧同一个仰躺姿势**，1 撑地，2 半跪，3 站好 |

### 腐骨兵 `grunt`

| 动作 ID | 帧数 | 接触帧 | 等级 | 说明 |
|---|---|---|---|---|
| `slash` | 8 | 3 | P0 | 斜劈：0～1 举剑，**2 预警**（剑高举过肩），3 劈下，4 收势，5～7 回到待机 |
| `lunge` | 8 | 3, 4 | P0 | 突刺：0～1 压低重心、剑收到腰侧，**2 预警**（全身蓄力），3～4 剑尖向前刺到最远，5～7 收回 |
| `slash_b` | 8 | 3 | P1 | 反手上撩（首领三连斩的第二下）：0～2 剑放低在身后，3 向上撩，4～7 收势 |
| `leap_slam` | 8 | 4 | P1 | 跳劈：0 下蹲，1 起跳，**2～3 空中双手举剑**，4 落地劈到地面，5 剑插地半蹲，6～7 拔剑站起 |
| `charge_run` | 4 | — | P1 | 冲锋循环：身体大幅前倾，剑横在身前 |
| `stunned` | 4 | — | P1 | 冲锋撞墙后晕眩：摇晃、剑垂下 |
| `roar` | 4 | — | P1 | 首领咆哮、召唤：仰头张开双臂 |
| `spawn` | 4 | — | P1 | 从地下爬出：0 只露头和一只手，3 站起来 |

### 铁甲屠夫 `brute`

| 动作 ID | 帧数 | 接触帧 | 等级 | 说明 |
|---|---|---|---|---|
| `slam` | 8 | 4 | P0 | 重砸：0～2 双手把斧头举过头顶，**3 预警**（斧举到最高、身体后仰），4 砸到地面，5 斧头砸进地里、半蹲，6～7 拔出斧头站起 |
| `sweep` | 8 | 4 | P1 | 横扫：0～2 斧头拉到身后，**3 预警**，4 横扫过身前，5～7 收势 |
| `stomp` | 4 | 2 | P1 | 跺地（震地波）：0 抬起一条腿，**1 预警**（腿抬到最高），2 跺下，3 恢复 |
| `charge_run` | 4 | — | P1 | 肩撞冲锋循环：低头、肩膀朝前、斧头拖在身后 |
| `stunned` | 4 | — | P1 | 撞墙晕眩 |
| `roar` | 4 | — | P1 | 咆哮：挺胸张臂 |

### 影弓手 `archer`

| 动作 ID | 帧数 | 接触帧 | 等级 | 说明 |
|---|---|---|---|---|
| `shoot` | 8 | 5 | P0 | 射箭：0～1 从箭袋取箭搭弦，2～3 拉弓，**4 满弓预警**，5 放箭（弓弦回弹），6～7 放下弓 |
| `hop` | 4 | — | P0 | 后跳躲闪：0 下蹲，1～2 向后跃起的姿势（身体留在原地，后跳的位移游戏来做），3 落地蹲 |
| `cast_up` | 4 | — | P1 | 朝天射箭雨：弓指向斜上方，0 拉弓，1～2 满弓，3 放箭 |
| `vanish` | 4 | — | P1 | 瞬移：披风卷起、身体压低，0→3 越来越蜷缩（消失的淡出效果引擎来做） |
| `roar` | 4 | — | P1 | 首领起身宣告：直立、披风张开 |

## 四、生成提示词

### 第 1 步：身份参考图（每套一张）

```
Use case: stylized-concept. Asset type: character identity reference for a 2D side-scrolling action game.
Single full-body character, standing in a ready stance, three-quarter side view FACING RIGHT, entire body visible
from head to boots with generous margin. Crisp high-quality hand-drawn anime game art with consistent controlled
cel shading, dark fantasy crypt setting, matching a silver-haired anime swordswoman hero from the same game.
Subtle cool rim light along the back edge of the silhouette. Real alpha transparency, no backdrop, no ground
shadow, no text. Portrait canvas 1024 by 1536.
CHARACTER: 【身份描述】
```

**【身份描述】**（三套各一段）：

- **腐骨兵**：`an undead skeleton soldier: bleached ivory bones with cracks and dark grime, small glowing ember-red pinpoints in the eye sockets, a torn dark brown cloth hood and tattered waist wraps, rusted bronze-brown shoulder pauldron on one side and broken chest plate fragments strapped with old leather, a notched rusty single-edged broadsword in the right hand. Slightly hunched, lean, menacing but readable silhouette.`
- **铁甲屠夫**：`a hulking executioner brute: enormous shoulders and heavy gut, about one and a half times as wide as a normal man, bare scarred muscular tan forearms, riveted dark iron pauldrons and a bucket helmet with a narrow slit visor glowing amber, a stained dark leather apron over chain mail, heavy iron boots, wielding a huge two-handed butcher's great axe with a pitted steel blade. Slow, heavy, intimidating silhouette.`
- **影弓手**：`a lean hooded shadow archer: deep violet-black hooded cloak with ragged flowing edges, face hidden in shadow except two small glowing violet eyes, dark purple cloth wrappings over a slim body, brown leather bracers, belt and a quiver of black-fletched arrows on the back, holding a dark wood recurve longbow. Agile, light, sinister silhouette.`

**检查**：三张放在一起和绯隼立绘对比，画风、线条粗细、上色方式要像同一个游戏。剪影要一眼区分：骷髅兵瘦、屠夫宽、弓手有披风和弓。

### 第 2 步：动作表（通用模板）

把第 1 步的参考图作为参考图片输入，替换最后的【身份描述】【帧数布局】【动作】。

```
Use case: stylized-concept. Asset type: production sprite animation sheet for a 2D side-scrolling action game.
The reference image is the IDENTITY / COSTUME reference, not the layout. Draw exactly the SAME character:
【身份描述】
Preserve the face, body proportions, costume and weapon exactly, in crisp high-quality hand-drawn anime game art
with consistent controlled cel shading. Subtle cool rim light along the back edge of the silhouette.
OUTPUT LAYOUT IS CRITICAL: 【帧数布局】 Reading order left to right, top row then bottom row. All cells identical
camera and identical character scale: standing figure height approximately 【330 / 300】 px. Facing RIGHT throughout,
side / three-quarter side camera.
IN-PLACE ANIMATION: feet ground line at y=448 inside EACH tile (for airborne poses the lowest point of the body is
at y=448); the pelvis stays near x=220 inside each tile (within 6 px). The body may lean, crouch and twist, but
must not translate across the tile.
CLEAN FRAMES: NO slash effects, NO motion trails, NO glow, NO speed lines, NO sparks, NO blood, NO dust —
character and weapon only.
Real alpha transparency, no backdrop, no ground shadow, no grid, no borders, no text, no frame numbers.
ACTION: 【动作】
```

**【帧数布局】**：
- 8 帧：`exactly EIGHT full-body sequential animation poses in a uniform FOUR-column TWO-row sprite sheet, landscape 2048 by 1024 pixels, each invisible tile 512 by 512.`
- 4 帧：`exactly FOUR full-body sequential animation poses in a single row of FOUR columns, landscape 2048 by 512 pixels, each invisible tile 512 by 512.`

### 【动作】描述

**共用**
- `idle`：`idle breathing loop: relaxed ready stance, weapon held low, subtle rise and fall of the shoulders and chest; 4 frames looping seamlessly.`
- `walk`：`walking loop toward the right, in place: 8 frames of a full stride cycle, weapon swaying slightly; the pelvis stays at x=220 while the legs step.`
- `hurt`：`hit reaction: 1 sharp recoil the instant the hit lands, head snapping back; 2 maximum recoil, torso bent backward, arms thrown out; 3-4 recovering to the ready stance.`
- `air_hurt`：`launched into the air by a heavy blow: body arched backward, limbs flung out, weapon still in hand; over 4 frames the body rotates from upright to almost horizontal, back facing down. The lowest point of the body at y=448.`
- `down`：`falling to the ground: 1 back slams onto the ground; 2 a small bounce; 3-4 lying flat on the back, face up, still. Frames 3 and 4 are the same resting pose.`
- `getup`：`getting up: 1 lying flat on the back face up, EXACTLY the same pose as the final lying frame; 2 pushing up on one arm; 3 kneeling on one knee; 4 standing in the ready stance.`

**腐骨兵**
- `slash`：`diagonal overhead slash: 1-2 raising the sword over the right shoulder; 3 WIND-UP HOLD, sword high above the shoulder, body coiled, an unmistakable readable pose; 4 the fast diagonal cut down in front of the body; 5 follow-through low; 6-8 return to the ready stance.`
- `lunge`：`lunging thrust: 1-2 dropping the weight low, sword pulled back to the hip; 3 WIND-UP HOLD, whole body coiled like a spring, sword pointed forward at hip height; 4-5 full thrust, sword arm fully extended forward at chest height, torso leaning forward; 6-8 pulling back to the ready stance.`
- `slash_b`：`rising backhand slash: 1-3 sword held low behind the body; 4 fast upward diagonal cut in front of the body; 5 sword high after the follow-through; 6-8 recover.`
- `leap_slam`：`leaping overhead slam: 1 deep crouch; 2 jumping pose, legs pushing off; 3-4 airborne, both hands raising the sword high over the head, knees tucked (lowest point of the body at y=448); 5 landing with the sword smashing down into the ground in front; 6 crouched, sword stuck in the ground; 7-8 pulling the sword out and standing up.`
- `charge_run`：`charging run loop: body leaning far forward, sword held horizontally in front, legs in a fast running stride; 4 frames looping.`
- `stunned`：`dazed after crashing into a wall: swaying unsteadily, head lolling, sword hanging low; 4 frames looping.`
- `roar`：`commanding roar: head thrown back, jaw open, arms spread wide, sword raised in one hand; 4 frames building to the peak.`
- `spawn`：`climbing out of the ground: 1 only the skull and one bony hand above the ground line; 2 shoulders and both arms out, pulling up; 3 crouched on one knee; 4 standing in the ready stance.`

**铁甲屠夫**
- `slam`：`overhead axe smash: 1-3 heaving the great axe up with both hands until it is high above the head; 4 WIND-UP HOLD, axe at its highest point, body leaning back, an unmistakable readable pose; 5 smashing the axe down into the ground in front; 6 crouched, axe buried in the ground; 7-8 wrenching the axe out and standing up.`
- `sweep`：`horizontal axe sweep: 1-3 swinging the axe back behind the body at waist height; 4 WIND-UP HOLD, torso twisted, axe far behind; 5 the wide horizontal sweep across the front of the body; 6-8 heavy follow-through and recover.`
- `stomp`：`ground stomp: 1 lifting one huge boot; 2 WIND-UP HOLD, knee raised high, arms out for balance; 3 stomping down hard, knees bent; 4 recover.`
- `charge_run`：`shoulder-charge run loop: head down, one armored shoulder forward, axe dragged behind, heavy pounding stride; 4 frames looping.`
- `stunned`：`dazed after crashing into a wall: swaying, helmet tilted, axe head resting on the ground; 4 frames looping.`
- `roar`：`furious roar: chest thrust out, arms spread wide, axe raised in one hand; 4 frames building to the peak.`

**影弓手**
- `shoot`：`shooting a bow: 1-2 drawing an arrow from the back quiver and nocking it; 3-4 raising the bow and drawing the string; 5 FULL DRAW HOLD, string at the cheek, bow aimed straight forward, an unmistakable readable pose; 6 release, string snapping forward, no arrow trail; 7-8 lowering the bow.`
- `hop`：`evasive back-hop: 1 quick crouch; 2-3 springing backward pose, legs tucked, cloak flaring (stays in place in the tile, lowest point at y=448); 4 landing in a low crouch, bow ready.`
- `cast_up`：`shooting a volley into the sky: bow aimed steeply upward; 1 drawing; 2-3 full draw hold; 4 release.`
- `vanish`：`vanishing into shadow: cloak swirling up around the body, the figure crouching lower and lower over 4 frames, finally almost entirely wrapped in the cloak.`
- `roar`：`dramatic announcement: standing tall, cloak spread wide like wings, bow held out to the side; 4 frames.`

## 五、上传前的检查

1. **叠帧看**：每组动作的帧半透明叠在一起，骨盆基本重合，脚底都在同一条线上
2. **预警帧**：缩小到游戏里的大小（约 90px 高）看，剪影还能一眼分出是劈、刺、砸还是射
3. **同一个角色**：脸、盔甲、武器形状每帧一致，不一致的帧单独重新生成或手修
4. **倒地末帧和起身首帧是同一个姿势**

## 六、我收到以后做什么

- 用处理脚本把每套缩小、打成图集，检测武器位置
- 把敌人的状态（待机、走、预警、出招、受击、击飞、倒地、起身、首领各招式）映射到动画，接触帧对齐出伤帧，预警帧对齐游戏里的预警时长
- 首领用同一套素材，放大并叠上各自的颜色（骸骨统领红、铁颚锈红、祭坛守护者绿、夜鸦紫）
- 截图检查，有问题再写一份像这样的修改清单
