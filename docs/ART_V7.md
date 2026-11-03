# 素材需求 v7：大地图「守灯原」

这份文档**只提需求和提示词**，交给 Codex 生成。素材回来以后再接入游戏；在那之前地图先用程序画的占位美术把玩法做好。
玩法和剧情设计见 `docs/DESIGN_WORLD.md`。所有地名、人物、建筑都是原创，不照搬任何现有作品。

---

## 一、这一批要做的素材

| 顺序 | 素材包 | 是什么 | 内容 |
|---|---|---|---|
| 1 | **WORLD-1 地形** `world_terrain_v1` | 地图的地面 | 4 张无缝地面贴图 + 16 个地面散布贴花 + 6 块地图边缘（枯林、断崖） |
| 2 | **WORLD-2 地标** `world_landmarks_v1` | 地图上的地点 | 8 个地标 + 烽灯 + 封印 |
| 3 | **WORLD-3 散件** `world_props_v1` | 装饰和障碍 | 24 个散件（枯树、石头、断墙、路牌、路灯、墓碑……） |
| 4 | **NPC-1 烛婆** `npc_zhupo_v1` | 守灯驿的老守灯人 | 8 帧 + 头像 + 对话立绘 |
| 5 | **NPC-2 墨衡** `npc_moheng_v1` | 守灯驿的铁匠 | 8 帧 + 头像 + 对话立绘 |
| 6 | **NPC-3 阿砾** `npc_ali_v1` | 捡废墟的小孩 | 8 帧 + 头像 + 对话立绘 |

**发布位置**：GitHub Release **`assets-v7`**。文件名：`world_terrain_v1.zip`、`world_landmarks_v1.zip`、`world_props_v1.zip`、`npc_zhupo_v1.zip`、`npc_moheng_v1.zip`、`npc_ali_v1.zip`。可以分批上传，**地形和地标最优先**（地图的样子主要由它们决定）。

**上传前自检**：每个 zip 用 `unzip -t` 检查完整；每个包附 `docs/` 里的检查图（见各包）。

---

## 二、地图类素材：通用规格（WORLD-1、WORLD-2、WORLD-3）

### 视角和比例

- **俯视 3/4 视角**：镜头朝下约 **45°**，正对着画面（没有左右旋转），**所有地图素材用同一个角度**。能看到物体的顶面和正面，看不到侧面透视的消失点
- 地图逻辑尺寸 2400 × 1500，桌面最高按 2 倍渲染，**素材按 2 倍画**（以下尺寸都是 2 倍尺寸）
- 比例尺：地图上的人物站立高度约 **116 像素**（2 倍尺寸），一扇普通的门约 150 像素高，一棵枯树约 300～400 像素高
- 地图上的人物是**侧面**的逐帧精灵，放在 3/4 俯视的地图上（这种搭配常见且自然），所以地标不要画得像正俯视的平面图

### 画面要求

- **画风**：和角色一致的高清手绘日系游戏美术、受控的色块阴影；材质真实（风化的石头、枯草、铁锈、旧木），**不要规则的网格**
- **夜晚、低亮度**：这是一个太阳熄灭了一百年的世界，整体是暗的。平均亮度 20%～35%，最亮的地方不超过 60%。人物要是画面里最亮、对比最强的东西
- **不要画光源**：所有灯、烽灯、火盆、篝火都是**熄灭的**（空的灯笼、冷的火盆、灰烬）。火光、光晕、光柱都由引擎实时画（这样才能随剧情点亮、才能照亮人物）
- **饱和度低**：接近灰的冷色调（灰蓝、灰紫、枯黄褐），只有很克制的点缀色。整体色调由引擎统一调
- **影子**：只画物体底部很淡的接触阴影（贴地的一圈暗），**不要画长的投影**（光源由引擎决定）
- **透明**：地标、散件、贴花、边缘都要真实透明（直通 alpha）。如果生成工具做不了透明，就把要透明的区域填成**纯品红 #FF00FF**，我来抠
- **没有人物、没有文字、没有界面、没有边框**

### 锚点

- 每个地标、散件、边缘块都有一个**锚点** = 物体「站在地上的底部中心」（树干根部的中心、建筑正面墙脚的中心）。引擎按锚点摆放，并按锚点的 y 做前后遮挡
- 锚点写在 `world.json` 里（像素坐标，从左上角算）

### 可读性检查（交付前必做）

把现有绯隼的 `idle_00` 缩到**站立 116 像素**，贴在 WORLD-1 的地面 + 一个地标前面，确认她的剪影清楚。看不清就降低背景的亮度或对比，而不是提亮人物。存成 `docs/readability_116px.png`。

### 文件结构和 `world.json`

```
world_xxx_v1/
  README_zh.md
  world.json
  terrain/*.png | landmarks/*.png | props/*.png | decals/*.png | edges/*.png
  docs/*.png                    # 检查图
```

```json
{
  "schema": "afterglow.worldpack.v1",
  "scale": 2,
  "view": "top-down three-quarter, 45 degrees",
  "items": [
    { "id": "camp", "file": "landmarks/camp.png", "kind": "landmark", "anchor": [512, 900], "entrance": [512, 860] },
    { "id": "tree_a", "file": "props/tree_a.png", "kind": "prop", "anchor": [256, 470] },
    { "id": "moor", "file": "terrain/moor.png", "kind": "terrain", "tile": true }
  ]
}
```

- `anchor`：底部中心（像素）
- `entrance`：只有地标有 —— 人物走到哪里算「站在入口前」（门口、台阶口的地面中心）

---

## 三、WORLD-1 地形 `world_terrain_v1`

### 地面贴图：4 张，每张 1024 × 1024，**上下左右都无缝**

提示词（每张替换【地面】）：
```
Use case: game environment art. Asset type: seamlessly tileable ground texture for a top-down three-quarter view
2D action RPG world map, 1024 by 1024 pixels, tiling seamlessly on all four sides.
Hand-painted dark fantasy in crisp high-quality anime game art style with controlled cel-like shading, matching
hand-drawn anime characters. Viewed from above at about 45 degrees. A world where the sun went out a hundred
years ago: night-time, dark and desaturated, low contrast (average brightness about 25 percent, nothing brighter
than 55 percent), cold grey-blue and withered brown tones. No light sources, no glow, no cast shadows, no
characters, no text, no large distinctive features that would make the repetition obvious.
GROUND: 【地面】
```

| id | 【地面】 |
|---|---|
| `moor` | `a withered moor: short dead grass in muted grey-brown tufts, patches of dark damp soil, scattered pebbles.` |
| `ash` | `ash flats: grey cracked ash-covered earth, fine cracks, small half-buried stones, a few dry thorny weeds.` |
| `road` | `an old worn cobblestone road surface: irregular rounded cobbles, many missing, dirt and dead grass in the gaps.` |
| `grave` | `old cemetery soil: dark loose earth with sparse moss, fallen dry leaves and tiny bone fragments.` |

引擎会把这几张混在一起用（荒原做底，石路沿着道路画，墓园土铺在①附近，灰烬地铺在④⑤附近），边缘用柔和的遮罩过渡。

### 地面散布贴花：16 个，4 × 4 排列，每格 256 × 256，透明

```
Use case: game environment art. Asset type: a set of 16 separate ground decals for a top-down three-quarter view
2D action RPG world map, each on its own transparent tile, laid out in a 4 by 4 grid of 256 by 256 tiles
(1024 by 1024 total).
Same art style, same 45 degree top-down view and same dark desaturated night palette as a withered moor ground.
1 a tuft of dead grass, 2 a cluster of three small stones, 3 a shallow dark puddle, 4 a long ground crack,
5 a patch of grey ash, 6 scattered small bones, 7 a broken cobblestone patch, 8 a ring of dry thorny weeds,
9 fallen dead leaves, 10 a rusty broken sword stuck in the ground, 11 a cracked old clay pot lying on its side,
12 a half-buried iron lantern (unlit, empty), 13 a patch of dark moss, 14 animal tracks in the mud,
15 a small heap of rubble, 16 a trampled dirt patch.
Soft edges that blend into the ground, transparent background, no glow, no cast shadows, no text.
```

### 地图边缘：6 块，3 × 2 排列，每块 1024 × 512，透明

地图四周围一圈，挡住「地图外」，也是走不过去的边界。

```
Use case: game environment art. Asset type: a set of 6 separate map border pieces for a top-down three-quarter
view 2D action RPG world map, each on its own transparent tile, laid out in a 3 by 2 grid of 1024 by 512 tiles
(3072 by 1024 total).
Same art style, same 45 degree top-down view, very dark (these sit at the edge of the map and frame it):
1 a dense thicket of dead leafless trees, 2 another dense thicket of dead trees with different shapes,
3 a jagged rocky cliff edge with a drop into darkness, 4 a long tumbled ruined stone wall overgrown with dead
vines, 5 a field of tall dry reeds and thorns, 6 a rocky ridge with a few dead trees on top.
Each piece is wide and low, its bottom edge is the ground line, the top fades into near-black. Transparent
background, no light sources, no text.
```

### 检查图
- `docs/tile_check_<id>.png`：每张地面贴图 2 × 2 拼起来，检查接缝
- `docs/readability_116px.png`（见第二节）

---

## 四、WORLD-2 地标 `world_landmarks_v1`

每个地标一张 **1024 × 1024** 透明图（深渊是 1536 × 1024），俯视 3/4，地标占画面宽度约 70%，**底部中心是锚点**，下方留出约 80 像素空地（引擎在这里放入口的提示）。所有灯、火盆都是熄灭的。

提示词模板（每个替换【地标】）：
```
Use case: game environment art. Asset type: a single landmark building for a top-down three-quarter view 2D
action RPG world map, 1024 by 1024 pixels, transparent background.
Hand-painted dark fantasy in crisp high-quality anime game art style with controlled cel-like shading, matching
hand-drawn anime characters. Viewed from above at about 45 degrees, facing the camera straight on. The landmark
stands on its own small patch of ground that fades out softly at the edges; its base center is at the bottom
center of the image with about 80 pixels of empty ground below it. Scale: a normal door is about 150 pixels tall.
A world where the sun went out a hundred years ago: night-time, dark and desaturated, low contrast (average
brightness about 25 percent, nothing brighter than 60 percent). Every lamp, brazier and fire is cold and unlit —
no flames, no glow, no light beams (light is added by the game engine). Only a faint soft contact shadow under the
structure, no long cast shadows. No characters, no text, no signs with letters.
Real alpha transparency (or pure magenta #FF00FF where transparent).
LANDMARK: 【地标】
```

| id | 用途 | 【地标】 |
|---|---|---|
| `camp` | ★ 守灯驿（起点） | `a small fortified camp of the last lamp-keepers: a tall slender iron lamp tower in the center with a large empty glass lantern cage at the top, three patched canvas tents around it, a cold stone fire pit full of ash, stacked crates and barrels, a low palisade of sharpened stakes with an open gap facing the camera.` |
| `crypt` | ① 墓穴入口 | `an old cemetery around a squat stone mausoleum: crooked weathered gravestones, a rusted iron fence, the mausoleum's heavy doors broken open facing the camera revealing stone stairs descending into darkness.` |
| `ossuary` | ② 骸骨回廊 | `a collapsed sinkhole in the ground: the broken edge of the earth reveals an underground colonnade below, a steep stairway lined with bones and skulls spiralling down into darkness, cracked flagstones around the rim.` |
| `gallows` | ③ 屠夫刑场 | `a bleak execution hill: a large wooden gallows platform with hanging chains, two empty iron gibbet cages, a chopping block, and at the foot of the hill a heavy iron trapdoor left open over stairs going down, facing the camera.` |
| `altar` | ④ 深渊祭坛 | `a ruined stepped temple: broken pillars carved with coiling serpents, a wide stair leading up to a square dark opening that descends underground, toppled stone censers, carved rune circles on the steps (carved, not glowing).` |
| `abyss` | ⑤ 残光深渊（1536 × 1024） | `the rim of a vast bottomless chasm seen from above: jagged rock edges falling away into pure darkness, a broken ancient stone bridge reaching out over the void and ending mid-air, small broken rocks floating just above the chasm. The chasm itself is pitch black (the game engine adds the light rising from below).` |
| `training` | 练剑场 | `a small sword training yard: a ring of trampled sand bordered by short wooden posts, three battered straw practice dummies on wooden stands, a weapon rack with wooden swords, a water barrel.` |
| `trial` | 残光试炼 | `a tall broken black stone obelisk on a round stepped plinth, its surface carved with concentric rings and abstract lamp sigils (carved grooves only, not glowing), a few cracked stone steps around it, roughly three times the height of a person.` |
| `beacon` | 烽灯（每个入口旁一座） | `a single tall iron beacon post: a slender wrought-iron pole on a stone base, topped by an empty iron fire basket cage, cold and unlit, a few old ribbons tied to the pole. Tall and narrow, centered.`（这一张画布 **512 × 1024**） |
| `seal` | 封印（盖在没解锁的入口上） | `heavy rusted iron chains crossing in an X, held together in the middle by a round iron lock plate engraved with an abstract lamp-shaped sigil (engraved, not glowing). Flat-on, centered, no background.`（这一张画布 **512 × 512**） |

`world.json` 里给每个地标填 `anchor` 和 `entrance`（门口 / 台阶口的地面中心；`beacon`、`seal` 不需要 `entrance`）。

### 检查图
- `docs/landmarks_on_ground.png`：8 个地标排在 `moor` 地面上（缩小到 25%），检查视角、比例、亮度是否统一
- `docs/readability_116px.png`：绯隼站在 `crypt` 入口前

---

## 五、WORLD-3 散件 `world_props_v1`

24 个散件，**4 × 6 排列，每格 512 × 512**，透明，俯视 3/4，**每格底部中心附近是锚点**（树干根部、石头底部中心）。

```
Use case: game environment art. Asset type: a set of 24 separate props for a top-down three-quarter view 2D
action RPG world map, each on its own transparent tile, laid out in a 4 column by 6 row grid of 512 by 512 tiles
(2048 by 3072 total). Each prop stands on the ground at the bottom center of its tile.
Hand-painted dark fantasy in crisp high-quality anime game art style with controlled cel-like shading, viewed from
above at about 45 degrees, night-time, dark and desaturated, low contrast. Every lamp is cold and unlit, no glow.
Only a faint soft contact shadow, no cast shadows. No characters, no text, no letters on signs.
Scale: a person is about 116 pixels tall.
1 a large dead leafless tree, 2 a twisted dead tree leaning left, 3 a small dead tree, 4 a broken tree stump,
5 a large mossy boulder, 6 a cluster of three rocks, 7 a flat rock slab, 8 a tall standing stone,
9 a short section of ruined stone wall, 10 a broken stone archway, 11 a wooden fence section, 12 a broken wooden
fence section, 13 a wooden signpost with two blank arrow boards, 14 a weathered stone milestone with a carved
abstract lamp symbol, 15 a tall iron street lamp (unlit, empty glass), 16 a fallen broken street lamp,
17 a weathered gravestone, 18 a leaning cracked gravestone, 19 a stone grave cross, 20 a small roadside shrine with
an empty lamp niche, 21 a dry thorny bush, 22 a clump of tall dead reeds, 23 an abandoned wooden cart with a broken
wheel, 24 a pile of old crates and a barrel.
Transparent background (or pure magenta #FF00FF).
```

`world.json` 里给每个散件填 `id`（按上面顺序：`tree_a`、`tree_b`、`tree_c`、`stump`、`boulder`、`rocks`、`slab`、`menhir`、`wall`、`arch`、`fence`、`fence_broken`、`signpost`、`milestone`、`lamp`、`lamp_fallen`、`grave_a`、`grave_b`、`grave_cross`、`shrine`、`bush`、`reeds`、`cart`、`crates`）和 `anchor`。

### 检查图
- `docs/props_on_ground.png`：24 个散件排在 `moor` 地面上，旁边站一个 116 像素高的绯隼，检查比例

---

## 六、NPC-1～3：守灯驿的三个人

### 规格（和 ART_V6 的角色包完全一致）

- 每帧 **512×512** 透明 PNG（直通 alpha），**朝右**，锚点 **(220, 448)** = 脚底中心，**原地动画**
- 站立高度：大人约 **340px**；阿砾是小孩，约 **250px**
- 干净帧：没有光效、拖影、阴影、文字；提灯、灯笼都是熄灭的；阿砾罐子里的残光画成一小团扁平的淡色光点形状，**没有光晕**
- 画风：和绯隼、现有敌人一致 —— 高质量手绘日系游戏美术、统一克制的赛璐璐明暗；身后边缘一道淡淡的冷色轮廓光
- 帧号从 0 开始（表格和 JSON 一致）；英文提示词里从 1 开始
- 每套先用身份参考图模板生成 `artwork/identity_fullbody.png`，之后每个动作都把它作为参考图输入
- 文件结构、`animations.json` 格式同 ART_V6 第二节（`feisun.spritepack.v1`）

| 动作 | 帧数 | 说明 |
|---|---|---|
| `idle` | 4 | 待机，循环 |
| `talk` | 4 | 说话：小幅度的手势、点头，循环 |

另外每套要：
- `artwork/avatar_128.png`：128×128 头像
- `artwork/portrait.png`：**768 × 768** 胸像立绘（对话框用），朝右、透明背景、上半身、略微侧身，表情符合人物性格
- `docs/visibility_90px_dark.png`：缩到站立 90px（阿砾 66px）放在 `#1a1420` 底色上的剪影检查

### 提示词

身份参考图（模板同 ART_V6 第二节，把 CHARACTER 换成下表的身份描述）：
```
Use case: stylized-concept. Asset type: character identity reference for a 2D side-scrolling action game.
Single full-body character, standing in a relaxed pose, three-quarter side view FACING RIGHT, entire body visible
with generous margin. Crisp high-quality hand-drawn anime game art with consistent controlled cel shading, dark
fantasy setting, matching a silver-haired anime swordswoman hero from the same game. Subtle cool rim light along
the back edge of the silhouette. Real alpha transparency, no backdrop, no ground shadow, no text.
Portrait canvas 1024 by 1536.
CHARACTER: 【身份描述】
```

动作表（模板同 ART_V6 第二节，【帧数布局】用 4 帧那一种，【站立高度】大人 `340`、阿砾 `250`）：
```
Use case: stylized-concept. Asset type: production sprite animation sheet for a 2D side-scrolling action game.
The reference image is the IDENTITY / COSTUME reference, not the layout. Draw exactly the SAME character:
【身份描述】
Preserve the face, body proportions, costume and props exactly, in crisp high-quality hand-drawn anime game art
with consistent controlled cel shading. Subtle cool rim light along the back edge of the silhouette.
OUTPUT LAYOUT IS CRITICAL: exactly FOUR full-body sequential animation poses in a single row of FOUR columns,
landscape 2048 by 512 pixels, each invisible tile 512 by 512. Reading order left to right. All cells identical
camera and identical character scale: standing figure height approximately 【站立高度】 px. Facing RIGHT
throughout, side / three-quarter side camera.
IN-PLACE ANIMATION: feet ground line at y=448 inside EACH tile; the pelvis stays near x=220 inside each tile
(within 6 px). The body may sway and gesture, but must not translate across the tile.
CLEAN FRAMES: NO glow, NO light halo, NO motion trails, NO sparks — character and props only.
Real alpha transparency, no backdrop, no ground shadow, no grid, no borders, no text, no frame numbers.
ACTION: 【动作】
```

【动作】：
- `idle`：`idle breathing loop, standing relaxed with a small natural sway; 4 frames looping.`
- `talk`：`talking loop: small hand gestures and slight nods while speaking to someone in front of them; 4 frames looping.`

对话立绘：
```
Use case: stylized-concept. Asset type: dialogue portrait for a 2D action game.
Bust portrait (head and upper chest) of exactly the SAME character as the reference image:
【身份描述】
Three-quarter view FACING RIGHT, 【表情】. Crisp high-quality hand-drawn anime game art with consistent controlled
cel shading, subtle cool rim light on the back edge. Real alpha transparency, no backdrop, no text, no frame.
Square canvas 768 by 768, the head in the upper middle.
```

| 包 | 人物 | 【身份描述】 | 【表情】 |
|---|---|---|---|
| `npc_zhupo_v1` | **烛婆**：守灯驿最老的守灯人 | `an original elderly lamp-keeper woman, small and slightly bent but sharp-eyed and dignified, silver-white hair tied in a tight low bun pinned with a long iron pin shaped like a lamp hook, a deep-lined kind face, a heavy patched dark-blue wool cloak over a soot-stained grey robe, fingerless knitted gloves, a ring of old brass keys at her belt, leaning on a tall dark wooden pole topped with an iron hook holding a small unlit lantern` | `a calm, knowing, slightly sad smile` |
| `npc_moheng_v1` | **墨衡**：守灯驿的铁匠，从前的守灯人 | `an original broad-shouldered middle-aged blacksmith, a former lamp-keeper swordsman, short black beard streaked with grey, a scar across the left eyebrow, his right forearm replaced by a riveted dark-iron prosthetic forearm and hand, a burn-marked leather apron over a rolled-sleeve linen shirt, a thick dark scarf, a pair of blacksmith tongs hanging at his hip, solid and steady stance` | `gruff but warm, one eyebrow raised` |
| `npc_ali_v1` | **阿砾**：在废墟里捡东西的小孩（约 12 岁的男孩） | `an original scrappy twelve-year-old scavenger boy, shaggy brown hair with a pair of old brass goggles pushed up on his forehead, a smudged cheerful face, an oversized patched canvas satchel stuffed with rolled-up hand-drawn maps, a too-big hooded jacket with rolled sleeves, patched shorts, cloth-wrapped shins and worn boots, holding a small glass jar with a tiny pale mote of light inside (drawn as a flat soft shape, no glow)` | `curious and eager, wide eyes, a small grin` |

合计每套 **8 帧**（idle 4 + talk 4）+ 头像 + 立绘。

---

## 七、接入时我会怎么做（不用 Codex 做）

- 地形：四张地面贴图按区域混合，贴花和散件按地图数据摆放；桌面 2 倍图、手机 1 倍图（内存约 1/4）
- 地标、散件、边缘打成图集；地图上只载入地图的图集，进关时释放，回地图再载入
- 烽灯、长明灯塔、灯笼、深渊的光由引擎画（点亮、闪烁、照亮周围）
- 封印叠在没解锁的入口上，解锁时碎开
- NPC 用和敌人一样的图集流程，对话框里放立绘

## 八、给 Codex 的总说明（请原样转给 Codex）

```
请为原创 2D 动作游戏《残光之刃》的大地图「守灯原」生成 6 个素材包，规格、清单和每一项的英文提示词都在 docs/ART_V7.md：

1. world_terrain_v1.zip —— 第三节：4 张无缝地面贴图、16 个地面贴花、6 块地图边缘（最优先）
2. world_landmarks_v1.zip —— 第四节：8 个地标 + 烽灯 + 封印（最优先）
3. world_props_v1.zip —— 第五节：24 个散件
4. npc_zhupo_v1.zip —— 第六节：烛婆，idle 4 帧 + talk 4 帧 + 头像 + 对话立绘
5. npc_moheng_v1.zip —— 第六节：墨衡，同上
6. npc_ali_v1.zip —— 第六节：阿砾，同上（小孩，站立约 250px）

要求：
- 地图类素材（1～3）严格按第二节：俯视 3/4 视角（约 45°）、所有素材同一个角度、按 2 倍尺寸画、夜晚低亮度低饱和、所有灯和火都是熄灭的（光由引擎画）、只画很淡的接触阴影、真实透明背景、没有人物和文字
- 每个地图类包附 world.json（格式见第二节，填好每一项的 anchor，地标还要填 entrance）和第三～五节要求的检查图
- 地面贴图上下左右都要无缝，交付前 2×2 拼起来检查
- NPC（4～6）规格和 ART_V6 的角色包完全一致：512×512 透明帧、朝右、锚点 (220, 448)、原地动画、干净帧；每套先生成 artwork/identity_fullbody.png 作为之后所有动作和立绘的参考图；附 avatar_128.png、portrait.png（768×768）和 docs/visibility_90px_dark.png
- 画风和现有的绯隼、腐骨兵、骸骨统领、祭坛守护者一致
- 保持原创：不照搬任何现有作品的地名、建筑、角色、造型或纹样
- 打包后用 unzip -t 自检，上传到 GitHub Release assets-v7，文件名见第一节
- 不要改游戏代码，不要接入素材，只生成和打包素材
```
