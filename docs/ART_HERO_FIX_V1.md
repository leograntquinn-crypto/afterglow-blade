# 素材包规格：`hero_fix_v1`（绯隼跑步重画 + 刀握直）

对应 Godot 前问题解决阶段第 4 项（走路腿不自然）和第 5 项（刀柄和刀身不在一条线）。诊断见 `docs/AUDIT_PRE_GODOT.md`。
本包是本阶段的**第一包**；下一包（`fx_blade_v1`，刀光）在本包验收接入后再交。

## 一、为什么要重画

现有素材 `feisun_swordswoman_v2`（Release `assets-v2`）里的 `run_00`～`run_07`：

1. **腿**：`run_03` 和 `run_04` 几乎一样，`run_07` 和 `run_00` 几乎一样（都是「双脚分开」），按顺序播放时每半个循环腿停一下再跳；着地的脚在相邻帧之间后移的距离很不均匀，怎么调播放速度都会打滑。
2. **刀**：8 帧里刀柄都从手往左上翘、刀身从手往左下，刀柄和刀身在刀镡处折成约 90° 的「V」字。`jump_02` 同样的问题。

刀画在角色帧里，代码没法单独掰直，所以这几帧要重画。

## 二、要交的帧

| 文件 | 内容 | 必须 / 条件 |
|---|---|---|
| `run_00.png`～`run_07.png` | 新的 8 帧跑步循环（见第四节） | 必须 |
| `jump_02.png` | 跳跃第 3 帧（上升中段），姿势照旧，只把刀握直 | 必须 |
| `launcher_00.png` | 上挑第 1 帧（蹲低、刀在身后下方） | **条件**：按第五节第 4 条检查原帧，刀柄和刀身夹角超过 8° 才重画；不超过就不交，并在报告里写「已检查，无需重画」 |
| `air_slash_02_00.png` | 空中斩 B 第 1 帧（刀在身后下方） | 同上 |

## 三、通用规格（和现有绯隼素材完全一致，处理脚本直接复用）

- 每帧 **512×512 透明 PNG**，真实 alpha，无背景、无地面阴影、无网格、无文字、无帧号。
- 锚点 **(220, 448)**：脚底基线 y = 448；朝右。
- 人物身高约 360 px（和现有帧同比例，交付前和 `idle_00` 并排比对）。
- **原地动画**：头和躯干的水平位置每帧都在 x ≈ 220（±4 px），只有手脚、头发、腰带、刀动；身体不在画布里平移。
- **干净帧**：没有刀光、拖尾、发光、速度线、火花——只有角色和刀。
- 身份：和现有绯隼完全一致——银发高马尾、深色发带红饰、象牙色短上衣、深藏青紧身裤、护腕、及膝长靴、深红短腰带尾、**一把单刃长刀**（刀身微弯，刀镡、刀柄缠绳、柄头和现有帧一样）。用 `artwork/hero_fullbody.png` 当身份参考图。
- 画风：和现有帧一致的手绘动漫游戏风、稳定的赛璐璐阴影、背光一侧淡淡的冷色轮廓光。

## 四、跑步循环 8 帧的动作要求

一个循环左右脚各迈一步（共 2 步）。帧序和姿势：

| 帧 | 姿势 | 着地脚（右脚 = 靠镜头那条腿，R；左脚 = 远侧，L） |
|---|---|---|
| `run_00` | **着地**：R 脚跟刚着地在身体前方，L 脚在身后脚尖蹬地 | R 在 x ≈ 335 |
| `run_01` | **下压**：重心落到 R 上，R 膝微屈；L 腿离地往前收 | R 在 x ≈ 278 |
| `run_02` | **过渡**：R 腿在身体正下方伸直支撑；L 腿屈膝从 R 旁边经过 | R 在 x ≈ 220 |
| `run_03` | **腾空**：R 脚尖蹬离地面（在身后）；L 腿往前摆出，双脚都离地 | R 脚尖 x ≈ 165，刚离地 |
| `run_04` | **着地**：L 脚跟着地在身体前方，R 脚在身后（和 `run_00` 左右镜像，**不能和 `run_00`、`run_03` 画成同一个姿势**） | L 在 x ≈ 335 |
| `run_05` | **下压**：重心落到 L 上；R 腿离地往前收 | L 在 x ≈ 278 |
| `run_06` | **过渡**：L 腿在身体正下方；R 腿屈膝经过 | L 在 x ≈ 220 |
| `run_07` | **腾空**：L 脚尖蹬离；R 腿往前摆，双脚离地 | L 脚尖 x ≈ 165 |

- **步幅标定**：着地脚每帧往后移约 **57 px**（335 → 278 → 220 → 165），匀速。游戏按「每走一段距离换一帧」播放，匀速才不会打滑。
- 两腿要分得清：靠镜头的腿（R）比远侧的腿（L）略亮、略大；远侧的腿颜色略深。
- 手臂和腿反向摆动；持刀的手（右手）摆幅小一些。
- 头的高度：着地 / 下压帧最低，腾空帧最高，上下起伏约 6～10 px。
- 头发、腰带尾随跑动自然飘向身后，每帧连贯。
- 时长：每帧 83 ms（只用于素材预览；游戏里按距离换帧）。

**持刀**：右手反握或正握都可以，但要和现有待机帧的握法一致（正握，刀在身后斜向下指向后下方）。
**刀必须是一条直线**：柄头 → 刀柄 → 刀镡 → 刀身，在同一条直线上（刀身本身可以有轻微的弧度，但刀身根部 40 px 和刀柄的方向一致）。刀柄从拳头里穿过，柄头露在拳头的另一侧，不要从拳头里往别的方向折出来。

## 五、交付前自查（我接入前会逐项验收）

1. **叠影**：8 帧跑步半透明叠在一起，头和躯干基本重合（x 偏差 ≤ 4 px）；脚底基线一致（着地帧 y = 448 ± 2）。
2. **帧都不一样**：任意相邻两帧、以及 `run_00`/`run_04`、`run_03`/`run_07` 之间，腿部区域（y 260～448）像素差明显；不能有两帧几乎一样。
3. **步幅**：按第四节表格量着地脚位置，每帧后移 57 ± 8 px。
4. **刀**：每帧画一条从柄头到刀身根部 40 px 的直线，刀柄轴线和刀身根部轴线夹角 ≤ 8°。
5. **身份**：和 `idle_00` 并排，脸、发型、服装、刀形一致。
6. 文件齐全、命名正确、无多余文件（不要有 `.png.xxxx` 之类的半截临时文件）。

## 六、文件结构（`feisun.spritepack.v1` 格式，和 v2 / skills_v3 包一样）

```
hero_fix_v1/
  frames/
    run_00.png … run_07.png
    jump_02.png
    launcher_00.png            （条件，见第二节）
    air_slash_02_00.png        （条件）
  animations.json             （格式同 v2：run 一组 8 帧、loop: true、每帧 83 ms；jump_02 作为 jump 组的单帧替换说明）
  check/
    run_onion.png             （8 帧叠影 + 基线 + x=220 参考线）
    run_feet.png              （每帧标出着地脚位置和数值）
    sword_lines.png           （每帧刀柄 / 刀身直线标注，含 jump_02 和条件帧）
    side_by_side_idle.png     （新跑步帧和 idle_00 并排）
  prompts.json                （实际用的提示词和参数）
  README.md                   （交付说明、条件帧的检查结论）
```

打包成 `hero_fix_v1.zip`，上传到 GitHub Release **`assets-hero-fix-v1`**（仓库 `leograntquinn-crypto/afterglow-blade`）。

## 七、生成提示词（给 Codex，可以原样使用）

身份参考图：`artwork/hero_fullbody.png`（素材包 `feisun_swordswoman_v2` 里）。

### 跑步循环（8 帧，4 列 × 2 行，2048×1024）
```
Use case: stylized-concept. Asset type: production sprite animation sheet for a 2D side-scrolling action game.
The reference image is the IDENTITY / COSTUME reference, not the layout. Draw exactly the SAME adult silver-haired
female swordswoman: small high ponytail dark ribbon red ornament, ivory short jacket, dark navy fitted trousers,
bracers, knee-high boots, crimson short sash tails, ONE long single-edged steel sword with a slight curve.
Preserve her face, hair, weapon, outfit and proportions, in crisp high-quality hand-drawn anime game art with
consistent controlled cel shading. Subtle cool rim light along the back edge of the silhouette.
OUTPUT LAYOUT IS CRITICAL: exactly EIGHT full-body sequential animation poses in a uniform FOUR-column TWO-row
sprite sheet, landscape 2048 by 1024 pixels, each invisible tile 512 by 512. Reading order left to right, top row
then bottom row. All cells identical camera and identical character scale: standing figure height approximately
360 px. Facing RIGHT throughout, side / three-quarter side camera.
IN-PLACE ANIMATION: feet ground line at y=448 inside EACH tile; head and torso stay near x=220 inside each tile
(within 4 px) — only limbs, hair, sash and sword move. Do not translate the body across the tile.
CLEAN FRAMES: NO slash effects, NO motion trails, NO glow, NO speed lines, NO sparks — character and sword only.
Real alpha transparency, no backdrop, no ground shadow, no grid, no borders, no text, no frame numbers.
ACTION: a natural athletic RUN CYCLE, legs clearly alternating, every frame a DIFFERENT pose:
1 right (near) heel strikes far in front, left foot pushing off behind;
2 weight drops onto the right leg, knee slightly bent, left leg lifts and swings forward;
3 right leg straight directly under the body, left leg bent passing beside it;
4 flight: right toe leaves the ground behind, left leg swings forward, both feet off the ground;
5 left (far) heel strikes far in front, right foot pushing off behind (mirror of 1, NOT the same drawing);
6 weight drops onto the left leg, right leg swings forward;
7 left leg straight under the body, right leg bent passing beside it;
8 flight: left toe leaves the ground behind, right leg swings forward, both feet off the ground.
The planted foot moves backward evenly, about 57 px per frame. Near leg slightly brighter than the far leg.
Head bobs: lowest on frames 1,2,5,6, highest on 4,8. Arms swing opposite to the legs.
SWORD: held in the right hand in a normal grip, trailing low behind her, blade pointing back and down.
The pommel, the wrapped grip, the guard and the blade form ONE STRAIGHT LINE through her closed fist —
the grip must NOT bend away from the blade at the hand. Same sword design in every frame.
```

### `jump_02`（单帧，512×512）
```
（同上的身份、画风、锚点、干净帧要求，单帧 512 by 512）
ACTION: the rising middle of a jump (same pose as the existing jump frame 3: body rising, knees drawing up),
sword in the right hand trailing low behind; the pommel, grip, guard and blade form ONE STRAIGHT LINE through
the closed fist.
```

### 条件帧 `launcher_00`、`air_slash_02_00`
先按第五节第 4 条检查 v2 / skills_v3 包里的原帧；需要重画时，沿用原动作描述（`ART_FEISUN.md` 第五节的「上挑」「空中斩 B」第 1 帧），加上面 SWORD 一段。

## 八、接入（我这边）

`python3 -I tools/build_sprites.py <v2 包> hero <skills_v3 包> <hero_fix_v1 包>`（后面的包覆盖同名帧），重新生成桌面 / 手机图集；
跑步改回完整 8 帧按距离播放（`src/sprite.js` 的 `RUN_CYCLE`、`RUN_STEP` 按新步幅标定），刀光检测（`blade`）把 `run`、`jump` 加进去复核；
截图对比、跑全套测试、记录帧率后发布。
