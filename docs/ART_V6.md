# 素材需求 v6：新敌人与两个首领的专属素材

这份文档**只提需求和提示词**，交给 Codex 生成。素材回来以后，我再接入游戏（在那之前游戏里先用占位美术把玩法做好、调好手感）。
玩法设计见 `docs/DESIGN_CONTENT.md`。所有角色都是原创，不照搬任何现有作品的角色、名字或造型。

---

## 一、这一批要做的素材

| 顺序 | 素材包 | 是什么 | 帧数 | 下载 / 内存（桌面 · 手机） |
|---|---|---|---|---|
| 1 | **ENEMY-4 灰烛司祭** `enemy_ashpriest_v1` | 新杂兵：后排支援施法者（加盾、放陷阱） | 48 | 约 0.5MB · 解码约 12MB / 7MB（从第 3 关起载入） |
| 2 | **ENEMY-5 烬翼** `enemy_emberwing_v1` | 新杂兵：小型飞行兽，三五只一群 | 32 | 约 0.3MB · 解码约 8MB / 5MB（从第 2 关起载入） |
| 3 | **BOSS-3 夜鸦** `boss_night_raven_v1` | 第 2 关首领的专属素材（现在是放大的影弓手） | 68 + 1 张道具图 | 约 0.7MB · 解码约 18MB / 10MB（只在第 2 关载入） |
| 4 | **BOSS-4 铁颚** `boss_iron_jaw_v1` | 第 3 关首领的专属素材（现在是放大的铁甲屠夫） | 72 + 2 张道具图 | 约 0.7MB · 解码约 19MB / 11MB（只在第 3 关载入） |

**发布位置**：GitHub Release **`assets-v6`**。文件名：`enemy_ashpriest_v1.zip`、`enemy_emberwing_v1.zip`、`boss_night_raven_v1.zip`、`boss_iron_jaw_v1.zip`。可以按顺序分批上传；**两个杂兵最优先**（它们是新玩法的主角，接入后马上能看到效果）。

**上传前自检**：每个 zip 用 `unzip -t` 检查完整；每个包附 `docs/visibility_90px_dark.png`（90px 暗底剪影检查）和叠帧图。

---

## 二、通用规格（和绯隼、ART_V4 的首领包完全一致）

- 每帧 **512×512** 透明 PNG（直通 alpha），**朝右**，锚点 **(220, 448)** = 脚底中心
- 站立高度：杂兵约 340px；首领约 360px（引擎会放大到首领尺寸；不要画得比这更大，否则举过头顶的武器会被裁掉）
- 飞行的烬翼：没有「脚底」，锚点 (220, 448) 是**身体最低点**（尾巴尖除外），身体悬在锚点上方，见第五节
- **原地动画**：骨盆（飞兽为身体中心）的水平位置每帧都在 x≈220 附近（±6px），位移、跳跃高度、击退、飞行轨迹都由引擎做；空中姿势以身体最低点落在 y=448
- **干净帧**：没有特效光、拖影、发光、速度线、火花、血、尘土、地面阴影；眼睛的光只能是小亮点；提灯里的火画成一小团扁平的灰白火焰形状，不要光晕（光由引擎画）
- **帧数只用 4 或 8**：4 帧排 4×1（2048×512），8 帧排 4×2（2048×1024）
- **倒地最后一帧 = 起身第一帧**（同一张图逐字节复制）
- **同一角色跨帧一致**：每套先生成一张全身身份参考图，之后所有动作都拿它当参考
- **走路**：提示词里加 `the torso and head keep the same lean and the same horizontal position in every frame; only the legs, arms and weapon move; the head bobs smoothly — lowest on the contact frames (0 and 4), highest on the passing frames (2 and 6)`
- **90px 暗底检查**：每个动作缩到站立高度 90px（烬翼缩到翼展 70px），放在 `#1a1420` 底色上看，预警帧要一眼看出是什么招；看不清剪影就重做
- **画风**：和现有角色一致 —— 高质量手绘日系游戏美术、统一克制的赛璐璐明暗、暗黑地下城气质；身后边缘一道淡淡的冷色轮廓光
- **文件结构**：
  ```
  包名/
    README_zh.md
    animations.json           # 格式同 feisun.spritepack.v1：frame_names、duration_ms、
                              # suggested_contact_frame_indices、suggested_windup_frame_indices
    artwork/identity_fullbody.png   # 1024×1536 身份参考图
    artwork/avatar_128.png          # 128×128 头像（血条用）
    artwork/<道具名>.png             # 首领包的道具图（见各包）
    frames/动作名/动作名_00.png ...
    sheets/动作名.png
    docs/onion/动作名.png            # 叠帧图（检查对齐）
    docs/visibility_90px_dark.png    # 90px 暗底剪影检查
  ```
- 帧号**从 0 开始**（表格和 JSON 一致）；英文提示词里从 1 开始

### 提示词模板

身份参考图：

```
Use case: stylized-concept. Asset type: character identity reference for a 2D side-scrolling action game.
Single full-body character, standing in a ready stance, three-quarter side view FACING RIGHT, entire body visible
with generous margin. Crisp high-quality hand-drawn anime game art with consistent controlled cel shading, dark
fantasy underground setting, matching a silver-haired anime swordswoman hero from the same game. Subtle cool rim
light along the back edge of the silhouette. Real alpha transparency, no backdrop, no ground shadow, no text.
Portrait canvas 1024 by 1536.
CHARACTER: 【身份描述】
```

动作表（把身份参考图作为参考图片输入）：

```
Use case: stylized-concept. Asset type: production sprite animation sheet for a 2D side-scrolling action game.
The reference image is the IDENTITY / COSTUME reference, not the layout. Draw exactly the SAME character:
【身份描述】
Preserve the face, body proportions, costume and weapon exactly, in crisp high-quality hand-drawn anime game art
with consistent controlled cel shading. Subtle cool rim light along the back edge of the silhouette.
OUTPUT LAYOUT IS CRITICAL: 【帧数布局】 Reading order left to right, top row then bottom row. All cells identical
camera and identical character scale: standing figure height approximately 【站立高度】 px. Facing RIGHT throughout,
side / three-quarter side camera.
IN-PLACE ANIMATION: feet ground line at y=448 inside EACH tile (for airborne poses the lowest point of the body is
at y=448); the pelvis stays near x=220 inside each tile (within 6 px). The body may lean, crouch and twist, but
must not translate across the tile.
CLEAN FRAMES: NO slash effects, NO motion trails, NO glow, NO speed lines, NO sparks, NO blood, NO dust —
character and weapon only.
Real alpha transparency, no backdrop, no ground shadow, no grid, no borders, no text, no frame numbers.
ACTION: 【动作】
```

【帧数布局】
- 8 帧：`exactly EIGHT full-body sequential animation poses in a uniform FOUR-column TWO-row sprite sheet, landscape 2048 by 1024 pixels, each invisible tile 512 by 512.`
- 4 帧：`exactly FOUR full-body sequential animation poses in a single row of FOUR columns, landscape 2048 by 512 pixels, each invisible tile 512 by 512.`

【站立高度】杂兵 `340`，首领 `360`。烬翼的动作表用第五节的专用模板。

---

## 三、ENEMY-4 灰烛司祭 `enemy_ashpriest_v1`

**玩法**：躲在后排，举灯读条给同伴加盾（读条时被打中会被打断），用杖尾在你脚下画陷阱符文，被贴身时用杖把你推开。所以「举灯读条」和「杖尾敲地」两个预警姿势必须在 90px 下一眼认得出。

**身份描述**：

```
an original gaunt hunched priest of a forgotten underground cult: a deep ash-grey hooded robe with faded violet
trim and a frayed hem, the face hidden behind a cracked white porcelain half-mask covering the left side, thin
pale hands wrapped in grey bandages, a long dark iron staff topped by a small iron cage-lantern holding a tiny flat
pale-grey flame shape (no glow halo), a string of small bone charms hanging from the belt, tall and thin silhouette
leaning slightly forward
```

| 动作 | 帧数 | 接触帧 | 预警帧 | 用途 | 【动作】（英文，填进模板） |
|---|---|---|---|---|---|
| `idle` | 4 | — | — | 待机（循环） | `idle breathing loop: hunched, staff planted beside him, lantern swaying slightly; 4 frames looping.` |
| `walk` | 8 | — | — | 后退 / 走位（循环） | `slow gliding walk cycle, robe hem swaying, staff held upright in the front hand; 8 frames looping.` |
| `cast_ward` | 8 | 6 | 0–5 | 护咒读条（0–1 举灯，2–5 读条循环，6 释放，7 收势） | `channeling a protective ward: frames 1-2 raise the lantern-staff high overhead with both hands, frames 3-6 hold it high with the robe billowing upward and the head tilted back (this is a held pose that can loop), frame 7 thrust the lantern forward to release, frame 8 lower the staff.` |
| `cast_trap` | 8 | 3 | 0–2 | 灰烬陷阱（杖尾敲地画符） | `drawing a curse sigil on the ground: frames 1-3 crouch and swing the staff butt downward in a wide arc, frame 4 strike the staff butt hard into the ground in front, frames 5-8 straighten up slowly.` |
| `shove` | 4 | 1 | 0 | 推开（被贴身时） | `quick defensive staff shove: frame 1 pull the staff back, frame 2 jab the staff shaft forward horizontally at chest height, frames 3-4 recover.` |
| `hurt` | 4 | — | — | 受击（读条被打断也用这个） | `staggered by a hit: recoiling backward, the lantern swinging wildly, mask turned away; 4 frames.` |
| `air_hurt` | 4 | — | — | 被打上天 | `knocked into the air: body bent backward, robe flaring, limbs loose, staff still gripped; 4 frames.` |
| `down` | 4 | — | — | 倒地 | `falling flat onto the back and lying on the ground, staff beside him; 4 frames, the last frame lying still.` |
| `getup` | 4 | — | — | 起身（第一帧 = down 最后一帧） | `getting up from lying on the back using the staff as support; frame 1 identical to the last down frame; 4 frames.` |

合计 **48 帧**（4 + 8 + 8 + 8 + 4 + 4 + 4 + 4 + 4）。

---

## 四、BOSS-3 夜鸦 `boss_night_raven_v1`（第 2 关首领）

**玩法**：远程猎手，拉开距离射箭，会瞬移；专属招式「羽刃回旋」（扔出回旋的羽刃）和「鸦影分身」（化作黑羽分成三个身影）。

**身份描述**：

```
an original tall lean hunter called the Night Raven: a long layered black feather cloak whose overlapping layers
fall like folded wings, a fitted dark leather hunting coat beneath, a smooth black bone mask shaped like a bird's
skull with two small magenta pinpoint eyes, long dark hair tied back, an enormous black bone recurve bow strung with
a pale cord, a quiver of long arrows with magenta fletching on the back, slender gloved hands, an elegant and
predatory silhouette
```

| 动作 | 帧数 | 接触帧 | 预警帧 | 用途 | 【动作】（英文，填进模板） |
|---|---|---|---|---|---|
| `idle` | 4 | — | — | 待机 | `idle loop: bow held low in the front hand, cloak feathers shifting, head tilted watchfully; 4 frames looping.` |
| `walk` | 8 | — | — | 走位 | `stalking walk cycle, light and silent steps, bow held low, cloak trailing; 8 frames looping.` |
| `hurt` | 4 | — | — | 受击 | `staggered by a hit: recoiling, cloak flaring, mask turned aside; 4 frames.` |
| `air_hurt` | 4 | — | — | 被打上天 | `knocked into the air: body arched backward, cloak spread like broken wings; 4 frames.` |
| `down` | 4 | — | — | 倒地 | `falling onto the back and lying on the ground, cloak spread around; 4 frames, last frame still.` |
| `getup` | 4 | — | — | 起身（第一帧 = down 最后一帧） | `getting up from lying on the back with a swift roll to a crouch; frame 1 identical to the last down frame; 4 frames.` |
| `shoot` | 8 | 3, 7 | 0–2, 4–6 | 齐射（两轮） | `two quick bow shots in a row: frames 1-3 nock and draw the bow fully, frame 4 release, frames 5-7 nock and draw again, frame 8 release.` |
| `sky_shot` | 4 | 2 | 0–1 | 天降（向上射） | `aiming straight upward: frames 1-2 lean back and draw the bow pointing at the sky, frame 3 release upward, frame 4 lower the bow.` |
| `vanish` | 4 | — | 0 | 瞬移消失 | `vanishing: frame 1 crouch and wrap the cloak around the body, frames 2-4 the figure folds into the cloak and the silhouette shrinks into a dense knot of black feathers (the last frame is a small bundle of feathers only).` |
| `appear` | 4 | — | — | 瞬移出现（倒放 vanish 的感觉） | `appearing: frame 1 a small bundle of black feathers, frames 2-3 the cloak unfolds upward into the figure, frame 4 standing ready with the bow drawn halfway.` |
| `feather_throw` | 8 | 4 | 0–3 | 专属：羽刃回旋 | `throwing feather blades: frames 1-3 spread the cloak wide with the free hand pulled back holding a fan of three long razor feathers, frame 4 whip the arm forward in a wide horizontal sweep releasing them, frames 5-8 the arm follows through and the cloak settles.` |
| `split` | 4 | — | 0–1 | 专属：鸦影分身（化作黑羽） | `splitting into shadows: frame 1 cloak thrown open dramatically, frame 2 the figure begins to break apart at the edges into black feathers, frame 3 half of the body is scattering feathers, frame 4 a cloud of scattering black feathers with the bow still visible in the middle.` |
| `channel` | 4 | — | — | 读条（循环） | `channeling: kneeling on one knee with the bow raised horizontally overhead, cloak feathers rising; 4 frames looping.` |
| `roar` | 4 | — | — | 转阶段 | `furious screech: head thrown back, cloak flared wide like wings, bow held out to the side; 4 frames.` |

合计 **68 帧**（通用 6 组 28 帧 + 专属 8 组 40 帧）。

**道具图**：`artwork/feather_blade.png`，256×256，一片长长的锋利黑羽（剃刀一样的羽刃），水平朝右，居中，透明背景，同画风。引擎会旋转、染色、加拖尾。

```
Use case: game sprite prop. A single long razor-sharp black feather blade lying horizontally pointing right,
centered, crisp hand-drawn anime game art with controlled cel shading, matching a dark fantasy 2D action game.
Real alpha transparency, no backdrop, no glow, no text. Canvas 256 by 256.
```

---

## 五、ENEMY-5 烬翼 `enemy_emberwing_v1`

**玩法**：三五只一群，在玩家头顶盘旋，俯冲前悬停一下，被打中会掉到地上挣扎再起飞。所以「悬停预警」和「俯冲」两个姿势必须一眼认得出。

**身份描述**：

```
an original small bat-like ember creature: a compact charred black body about the size of a cat, cracked skin
with thin dull dark-red ember lines inside the cracks (drawn flat, no glow), large tattered membranous wings,
a long thin whip-like tail ending in a small barb, two tiny bright pinpoint eyes, small hooked claws
```

**尺寸**：身体约 120px 长，翼展约 300px；**锚点 (220, 448) 是身体最低点**（悬停时爪子的位置），身体在锚点上方。地上挣扎的动作（`grounded`）身体贴地。

烬翼的动作表用这个模板（把身份参考图作为参考图片输入；身份参考图用第二节的模板，CHARACTER 填上面的身份描述，并把 `standing in a ready stance` 换成 `hovering with wings spread`）：

```
Use case: stylized-concept. Asset type: production sprite animation sheet for a 2D side-scrolling action game.
The reference image is the IDENTITY reference, not the layout. Draw exactly the SAME creature:
【身份描述】
Preserve the body, wings, tail and colors exactly, in crisp high-quality hand-drawn anime game art with consistent
controlled cel shading. Subtle cool rim light along the back edge of the silhouette.
OUTPUT LAYOUT IS CRITICAL: 【帧数布局】 Reading order left to right, top row then bottom row. All cells identical
camera and identical creature scale: wingspan approximately 300 px. Facing RIGHT throughout, side view.
IN-PLACE ANIMATION: the lowest point of the body (claws) is at y=448 inside EACH tile and the body center stays
near x=220 (within 6 px); the creature does not travel across the tile.
CLEAN FRAMES: NO glow, NO fire, NO sparks, NO motion trails, NO speed lines, NO smoke — creature only.
Real alpha transparency, no backdrop, no ground shadow, no grid, no borders, no text, no frame numbers.
ACTION: 【动作】
```

| 动作 | 帧数 | 接触帧 | 预警帧 | 用途 | 【动作】（英文，填进烬翼模板） |
|---|---|---|---|---|---|
| `fly` | 8 | — | — | 盘旋（循环） | `hovering flight loop: a full wingbeat cycle (wings high, sweeping down, low, recovering up), tail swaying; 8 frames looping.` |
| `dive_windup` | 4 | — | 0–3 | 俯冲前的悬停预警 | `preparing to dive: wings pulled back and up, body coiling with the head lowered toward the front, claws extended; 4 frames, increasingly tense.` |
| `dive` | 4 | 1 | — | 俯冲 | `diving attack: wings folded tight against the body, the body angled steeply forward and downward like an arrow, claws and jaws leading; 4 frames.` |
| `hurt` | 4 | — | — | 空中受击 | `struck in mid-air: body recoiling, wings crumpled and flailing; 4 frames.` |
| `fall` | 4 | — | — | 失去平衡往下掉 | `tumbling down out of control: body spinning, wings limp and twisted; 4 frames.` |
| `grounded` | 4 | — | — | 掉在地上挣扎（循环） | `stunned on the ground: lying on its side flapping one wing weakly, trying to right itself, body touching the ground line; 4 frames looping.` |
| `takeoff` | 4 | — | — | 重新起飞 | `taking off from the ground: frame 1 crouched on the ground with wings raised, frames 2-4 a strong downward wingbeat lifting the body into a hover; the last frame matches the hovering pose.` |

合计 **32 帧**。

---

## 六、BOSS-4 铁颚 `boss_iron_jaw_v1`（第 3 关首领）

**玩法**：刑场的行刑者，重锤、冲锋；专属招式「锁链钩」（把钩子甩出去把你拉过来）和「刑台三震」（向前连砸三下）。

**身份描述**：

```
an original massive executioner called Iron Jaw: a huge hulking man with a riveted iron plate bolted over the lower
half of the face like an iron jaw, a bald scarred head, small furious ember-orange pinpoint eyes, a bare scarred
torso crossed by heavy chains, a thick stained leather executioner's apron, rusted iron gauntlets and boots,
a long iron chain ending in a large meat hook coiled around the left forearm, wielding an enormous two-handed
headsman's hammer-axe with a broad blade on one side and a square hammer face on the other
```

| 动作 | 帧数 | 接触帧 | 预警帧 | 用途 | 【动作】（英文，填进模板） |
|---|---|---|---|---|---|
| `idle` | 4 | — | — | 待机 | `idle loop: heavy breathing, hammer-axe resting on the shoulder, chain hook swinging slightly; 4 frames looping.` |
| `walk` | 8 | — | — | 走位 | `heavy stomping walk cycle, hammer-axe on the shoulder; 8 frames looping.` |
| `hurt` | 4 | — | — | 受击 | `staggered by a hit: rocking backward, free arm thrown out for balance; 4 frames.` |
| `air_hurt` | 4 | — | — | 被打上天 | `knocked off the ground: huge body tipping backward in the air, chains flying; 4 frames.` |
| `down` | 4 | — | — | 倒地 | `crashing onto the back and lying on the ground, hammer-axe beside him; 4 frames, last frame still.` |
| `getup` | 4 | — | — | 起身（第一帧 = down 最后一帧） | `getting up from lying on the back, pushing up with the hammer-axe; frame 1 identical to the last down frame; 4 frames.` |
| `slam` | 8 | 4 | 0–3 | 跳劈 / 重砸 | `overhead smash: frames 1-4 heave the hammer-axe high over the head with both hands, leaning back, frame 5 slam it straight down into the ground in front, frames 6-8 heavy recovery pulling it out.` |
| `charge` | 4 | — | — | 冲锋（循环） | `charging run loop: body hunched forward like a bull, shoulder leading, hammer-axe held low to the side; 4 frames looping.` |
| `stunned` | 4 | — | — | 撞墙晕眩（循环） | `dazed after crashing into a wall: swaying on unsteady legs, head lolling, hammer-axe dragging on the ground; 4 frames looping.` |
| `chain_throw` | 8 | 4 | 0–3 | 专属：锁链钩（甩出） | `hurling the chain hook: frames 1-3 swing the hook in a wide circle overhead with the left arm while the hammer-axe rests on the right shoulder, frame 4 whip the arm forward throwing the hook straight ahead (the chain stretches out of frame to the right), frames 5-8 the arm stays extended holding the taut chain.` |
| `chain_yank` | 4 | 1 | — | 专属：锁链钩（拉回） | `yanking the chain back: frame 1 lean back hard pulling the chain with both hands, frame 2 the chain coils in, frames 3-4 raise the hammer-axe ready for a follow-up blow.` |
| `stomp_triple` | 8 | 2, 4, 6 | 0–1 | 专属：刑台三震 | `three heavy advancing blows: frames 1-2 raise the hammer-axe, frame 3 first smash into the ground, frame 4 step forward and lift, frame 5 second smash, frame 6 step forward and lift higher, frame 7 the third and hardest smash with the whole body, frame 8 hunched recovery.` |
| `channel` | 4 | — | — | 读条（循环） | `channeling: hammer-axe raised high overhead with both hands, chains rattling, body tensed; 4 frames looping.` |
| `roar` | 4 | — | — | 转阶段 | `furious roar: tearing a chain off the chest with one hand, head thrown back; 4 frames.` |

合计 **72 帧**（通用 6 组 28 帧 + 专属 8 组 44 帧）。

**道具图**（透明背景、同画风、居中、无光效、无文字）：

- `artwork/chain_hook.png`，256×256：一个大铁钩挂着两三节锁链，钩尖朝右
- `artwork/chain_link.png`，128×128：单独一节粗铁链环，水平放置（引擎重复拼成锁链）

```
Use case: game sprite prop. 【A single large rusted iron meat hook hanging from two or three thick chain links, the hook point facing right / A single thick rusted iron chain link lying horizontally】, centered, crisp hand-drawn anime game art with controlled cel shading, matching a dark fantasy 2D action game. Real alpha transparency, no backdrop, no glow, no text. Canvas 【256 by 256 / 128 by 128】.
```

---

## 七、验收标准（我接入前会逐项检查）

1. 帧数、动作名、帧号和本文档一致；`animations.json` 的接触帧和预警帧填写正确
2. 每帧 512×512，锚点对齐：叠帧图里脚底（烬翼为身体最低点）稳定在 y=448、身体中心在 x≈220
3. 干净帧：没有光效、拖影、阴影、文字
4. 倒地最后一帧和起身第一帧逐字节相同
5. 90px 暗底检查：读条、敲地、俯冲预警、甩钩、扔羽刃这些预警姿势一眼认得出
6. 原创：造型、面具、武器、纹样不照搬任何现有作品
7. 包完整：`unzip -t` 通过，`animations.json` 列出的文件都存在

---

## 八、给 Codex 的总说明（请原样转给 Codex）

```
请为原创 2D 横版动作游戏《残光之刃》生成四套角色素材包，规格、清单和每一项的英文提示词都在 docs/ART_V6.md：

1. enemy_ashpriest_v1.zip —— 第三节，新杂兵「灰烛司祭」，48 帧（最优先）
2. enemy_emberwing_v1.zip —— 第五节，新杂兵「烬翼」，32 帧（最优先）
3. boss_night_raven_v1.zip —— 第四节，首领「夜鸦」，68 帧 + 道具图 feather_blade.png
4. boss_iron_jaw_v1.zip —— 第六节，首领「铁颚」，72 帧 + 道具图 chain_hook.png、chain_link.png

要求：
- 严格按第二节的通用规格：512×512 透明帧、朝右、锚点 (220, 448)、原地动画、干净帧、帧数只用 4 或 8、倒地最后一帧 = 起身第一帧
- 每套先用第二节的身份参考图模板生成 artwork/identity_fullbody.png，之后每个动作都把它作为参考图输入，用动作表模板把表格里的【动作】填进去生成整张拼表，再切成单帧
- 烬翼用第五节的专用动作表模板（锚点是身体最低点，翼展约 300px）
- 画风和现有的绯隼、腐骨兵、骸骨统领、祭坛守护者一致
- 文件结构和 animations.json 按第二节（格式同 feisun.spritepack.v1）；每个包附 artwork/avatar_128.png、docs/onion/ 叠帧图和 docs/visibility_90px_dark.png
- 保持原创：不照搬任何现有作品的角色、名字、造型、面具、武器或纹样
- 打包后用 unzip -t 自检，上传到 GitHub Release assets-v6，文件名 enemy_ashpriest_v1.zip、enemy_emberwing_v1.zip、boss_night_raven_v1.zip、boss_iron_jaw_v1.zip
- 不要改游戏代码，不要接入素材，只生成和打包素材
```
