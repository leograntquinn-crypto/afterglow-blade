# 素材包规格：`hero_fix_v2`（绯隼跑步重画第二版）

对应 Godot 前问题解决阶段第 4 项（走路腿不自然）。`hero_fix_v1` 的跑步姿势被玩家否决（Quinn 2026-11-06 21:23，v40：「跑步姿势太怪了，看着太难受了」），第 4 项重开。
v1 的刀柄—刀镡—刀身同线修复保留有效；被否的是跑步的**姿势语言**。`jump_02` 本次不动（保留 v1 版）。

## 一、v1 被否的原因（Muse 逐帧诊断，本版必须逐条解决）

1. **步幅太短**：腿基本收在身体下方，没有旧版那种前后大开的剪刀步，看起来原地倒腾；加上 0.35 秒一圈的快循环，就是小碎步。
2. **高抬腿踏步感**：第 2、3、6、7 帧前腿膝盖抬得过高、小腿垂直下垂、脚尖下指，像踏步 / 小跑马，而不是奔跑中前摆的腿。奔跑的回收腿应该是脚跟收向臀下、膝盖向前送；前伸帧要打开。
3. **脚尖着地**：第 0、4 帧着地脚只有脚尖点地、脚跟高翘，配高跟靴像踮脚跑。着地应该更平（前掌到全掌、靴底角度更平），而且落在髋部前方。
4. **躯干太直太僵**：全程近乎直立，缺少奔跑的前倾（约 8°～12°、随相位微变）和身体起伏（下压帧最低、蹬伸后最高，总落差约 10～14 px，要稳定可读）；双臂摆幅太小，自由臂几乎每帧都缩在胸前，持刀臂基本不动。
5. **没有蹬伸 / 腾空感**：第 3、7 帧后腿应该向后完全蹬直、脚尖刚离地，前腿同时大幅前伸，形成一帧明确的大开剪刀（旧版第 3、7 帧有这个瞬间，v1 丢了）。

**姿势语言以旧版（`feisun_swordswoman_v2` 的 `run_00`～`run_07`）的剪影为准**：长步幅、前倾、大开剪刀。参考图：`docs/ref_run_v2_old.jpg`（旧版 8 帧 + 地面线 + x = 220 + 大致的髋部高度）。
**不要照抄旧版的两个问题**：刀柄从拳头里折出去的「V」字；`run_03`≈`run_04`、`run_07`≈`run_00` 的重复姿势。

## 二、硬指标（沿用 v1，全部保留）

- 8 帧：`run_00`～`run_07`，每帧 **512×512 透明 PNG**，锚点 **(220, 448)**，朝右，人物身高约 360 px（和现有帧同比例）。
- **原地动画**：身体不在画布里平移（躯干中心 x 在 220 附近，随前倾自然偏移 ±12 px 以内）。
- **地面线 y = 448**：每帧的着地脚（或刚离地的脚尖）贴在 448 上（离地帧见第三节）。
- **没有重复姿势**：任意两帧都要明显不同（尤其 `00`/`04`、`03`/`07`、`03`/`04`、`07`/`00`）。
- **着地脚每帧匀速后移**：见第三节表格，每帧约 **44 px**（40～48）。
- **刀柄—刀镡—刀身一条直线**：柄头、刀柄、刀镡、刀身根部 40 px 在同一直线上，刀柄从拳头里穿过；夹角 ≤ 8°。
- **身份以定稿造型为准**（`docs/ART_FEISUN.md`「定稿造型」）：银白色单马尾（黑色蝴蝶结 + 红缎带）、白色短外套 + 深色内搭、红腰布、深色长裤、黑色高筒靴配银色星形饰件，一把单刃长刀。用 `artwork/hero_fullbody.png` 当身份参考图。
- **干净帧**：没有刀光、拖尾、发光、速度线；真实 alpha，无背景、无地面阴影、无文字和帧号。

## 三、逐帧要求（R = 靠镜头的右腿，L = 远侧的左腿；坐标是 512 画布像素）

一个循环 = 左右各一步。每半个循环：**着地 → 下压 → 过渡 → 蹬伸剪刀（脚刚离地）**。

| 帧 | 相位 | 躯干前倾 | 身体高度（相对最低帧） | 着地脚：位置 / 状态 | 后腿 | 前腿 / 摆动腿：膝高、小腿角度 | 手臂 |
|---|---|---|---|---|---|---|---|
| `run_00` | R 着地 | 9° | +4 | **R** 落在髋部前方，前掌着地 x ≈ **270**，靴底和地面夹角 ≤ 15°（接近平），脚跟只略高 | L 在身后，膝微屈，脚刚离地往前收 | R 是着地腿：膝微屈，小腿前倾 | 自由臂（左）在身后，持刀臂在前 |
| `run_01` | R 下压 | 10° | **0（最低）** | **R** 全掌着地 x ≈ **226**，膝屈约 25° | —— | **L 回收**：脚跟收向臀下，小腿接近水平（和地面夹角 ≤ 30°），膝盖朝前下方 | 两臂经过身体两侧 |
| `run_02` | R 过渡 | 11° | +6 | **R** 在髋部正下方偏后 x ≈ **182**，脚跟开始抬起（前掌） | —— | **L 前送**：大腿向前约 45°～60°，膝盖高度在髋部以下 30～60 px（**不要高抬腿**），小腿向后斜（脚在膝盖后方，和竖直方向夹角 20°～45°），**脚尖不往下指** | 自由臂往前摆，持刀臂往后 |
| `run_03` | **蹬伸剪刀** | 12° | **+12（最高）** | **R 脚尖刚离地**：在身后 x ≈ **138**，脚尖离地 3～8 px | **R 向后完全蹬直**（髋—膝—踝接近一条线） | **L 大幅前伸**：膝盖接近伸直，大腿向前 40°～55°，脚在前方 x ≥ **300**，脚跟低于脚尖（准备平着落地）；**两脚水平距离 ≥ 200 px** | 自由臂摆到最前（手在胸前偏前），持刀臂摆到最后 |
| `run_04` | L 着地 | 9° | +4 | **L** 落在髋部前方 x ≈ **270**，前掌、接近平 | R 在身后，膝微屈，脚离地往前收 | （同 `run_00`，左右互换；**不能和 `run_00` 画成同一张**：近腿 / 远腿的前后关系相反） | 与 `run_00` 相反 |
| `run_05` | L 下压 | 10° | 0 | **L** 全掌 x ≈ **226** | —— | **R 回收**：脚跟收向臀下，小腿接近水平 | 两臂经过身体两侧 |
| `run_06` | L 过渡 | 11° | +6 | **L** x ≈ **182**，脚跟抬起 | —— | **R 前送**：同 `run_02`（膝在髋下 30～60 px、小腿向后斜、脚尖不下指） | 与 `run_02` 相反 |
| `run_07` | **蹬伸剪刀** | 12° | +12 | **L 脚尖刚离地** x ≈ **138**，离地 3～8 px | **L 向后完全蹬直** | **R 大幅前伸**，脚在前方 x ≥ 300，两脚水平距离 ≥ 200 px | 与 `run_03` 相反 |

- **着地脚匀速后移**：270 → 226 → 182 → 138，每帧约 44 px（40～48）。
- **前倾**：从髋部到肩部的连线和竖直方向的夹角，按表在 8°～12° 之间随相位变化。
- **起伏**：以头顶或骨盆高度计，`01`/`05` 最低，`03`/`07` 最高，总落差 10～14 px，左右两半一致。
- **手臂**：自由臂（左臂）前后摆，`03` 和 `07` 两帧之间手的水平位置相差 ≥ 80 px，不要一直缩在胸前；持刀臂（右臂）也要摆，`03` 和 `07` 之间手的水平位置相差 ≥ 30 px，刀始终在身后斜向下指向后下方。
- 近腿（R）比远腿（L）略亮、略大，左右腿分得清。头发、腰带尾随跑动飘向身后，每帧连贯。

## 四、游戏里怎么播（我这边，供理解）

游戏按「走过的距离」换帧，着地的帧每走一段距离换一帧，脚踩住地面不滑：
- 着地帧（`00`～`02`、`04`～`06`）：每帧对应着地脚后移的距离 44 px → 游戏里 44 × 0.5 × 0.54 ≈ **11.9 逻辑像素**；
- 蹬伸剪刀帧（`03`、`07`）：脚已经离地，可以多停一会儿而不打滑，按腾空距离播放 ≈ **27 逻辑像素**。
- 一个循环 = 2 ×（3 × 11.9 + 27）≈ 126 逻辑像素 → 正常跑速（每帧 4.2）下一圈约 **0.5 秒**（目标 0.45～0.55 秒，不再是 v1 的 0.35 秒碎步）。
- 交付后按实测的着地脚位置重新标定这两个数。

这也是为什么第 3、7 帧必须是「脚尖刚离地」：如果脚还踩在地上，多停的那一段距离就会滑步。

## 五、交付分两步（新增预览关，避免整包返工）

**第 1 步：预览**。只交一张 8 帧横排的原图 `run_sheet_preview.png`（**4096×512**，8 格 × 512，左到右 `run_00`～`run_07`），外加一张标注图 `run_sheet_annotated.png`（同一张图上画出：地面线 y = 448、x = 220、每帧着地脚位置和数值、躯干前倾角、髋部高度、蹬伸帧的两脚距离）。
Muse 按第六节的姿势验收项审查，**Muse 审查通过后打包**（进入第 2 步）。不通过就只改这张预览，不切单帧。

**第 2 步：打包**。按通过的预览切单帧并打包：

```
hero_fix_v2/
  frames/run_00.png … run_07.png
  animations.json        （feisun.spritepack.v1：canvas 512×512、pivot (220,448)；run 一组 8 帧、loop: true、每帧 83 ms）
  check/
    run_sheet.png        （= 通过的预览，逐像素一致）
    run_onion.png        （8 帧叠影 + 地面线 + x = 220）
    run_feet.png         （每帧着地脚位置和数值）
    run_pose_metrics.png （每帧前倾角、髋部高度、两脚距离、膝高、小腿角度的标注）
    sword_lines.png      （每帧刀柄 / 刀身直线标注）
    side_by_side.png     （新 8 帧和旧 v2 的 8 帧上下对照）
    validation.json      （第六节各项的实测数值）
  prompts.json
  README_zh.md
```

打包成 `hero_fix_v2.zip`，上传到新的 GitHub Release（仓库 `leograntquinn-crypto/afterglow-blade`）。

## 六、验收项（预览关和打包后都按这张表查）

姿势（对应第一节的 5 条）：

| # | 检查 | 通过标准 |
|---|---|---|
| P1 步幅 | `03`、`07` 两脚水平距离；着地帧的着地脚在髋部前方 | 两脚距离 ≥ 200 px；`00`/`04` 着地脚 x ≥ 255（髋部前方） |
| P2 不是高抬腿 | `02`、`06` 摆动腿膝盖高度和小腿角度；`01`、`05` 回收腿 | 膝盖在髋部以下 30～60 px；小腿向后斜 20°～45°，脚尖不朝下；回收腿小腿和地面夹角 ≤ 30° |
| P3 平着地 | `00`、`04` 着地脚 | 前掌到全掌着地，靴底和地面夹角 ≤ 15°；不是脚尖点地 |
| P4 前倾、起伏、摆臂 | 每帧前倾角；起伏；手的摆幅 | 前倾 8°～12°；起伏 10～14 px，最低在 `01`/`05`、最高在 `03`/`07`；自由手摆幅 ≥ 80 px、持刀手 ≥ 30 px |
| P5 蹬伸剪刀 | `03`、`07` 后腿和前腿 | 后腿髋—膝—踝接近直线（夹角 ≥ 165°），脚尖离地 3～8 px；前腿大幅前伸、脚在前方 x ≥ 300 |

硬指标：

| # | 检查 | 通过标准 |
|---|---|---|
| H1 | 画布 / 锚点 / 地面线 | 512×512，着地帧最低不透明行 = 448（± 2） |
| H2 | 不重复 | 任意两帧腿部区域（y 260～448）不透明像素差异 ≥ 8% |
| H3 | 着地脚匀速后移 | 每帧 44 ± 4 px |
| H4 | 刀同线 | 刀柄轴线和刀身根部 40 px 夹角 ≤ 8°，刀柄穿过拳头 |
| H5 | 身份 | 和 `idle_00`、定稿造型一致；人物高度和现有帧一致（± 3%） |
| H6 | 文件 | 齐全、命名正确、无多余临时文件；`check/run_sheet.png` 和单帧逐像素一致 |

## 七、生成提示词（给 Codex）

```
Use case: stylized-concept. Asset type: production sprite animation sheet for a 2D side-scrolling action game.
The reference image is the IDENTITY / COSTUME reference, not the layout. Draw exactly the SAME adult female
swordswoman as the reference: silver-white single ponytail with a black bow and red ribbons, white cropped jacket
over a dark top, red waist cloth, dark long trousers, tall black boots with silver star-shaped ornaments,
ONE long single-edged steel sword. Crisp high-quality hand-drawn anime game art, consistent cel shading,
subtle cool rim light on the back edge of the silhouette.
OUTPUT LAYOUT: exactly EIGHT full-body poses in ONE ROW, landscape 4096 by 512 pixels, each invisible tile
512 by 512, left to right = frames 1..8. Same camera and scale in every tile, standing height about 360 px.
Facing RIGHT, side / three-quarter side camera. IN-PLACE: ground line y=448 in each tile; the torso stays near
x=220 (it may shift a little with the forward lean). CLEAN FRAMES: no slash effects, trails, glow, speed lines.
Real alpha, no backdrop, no ground shadow, no text, no frame numbers.
ACTION: an athletic sprinting RUN CYCLE with a LONG STRIDE, a clear FORWARD LEAN (8 to 12 degrees) and an OPEN
SCISSOR stride — NOT high-knee marching, NOT tiptoe running, NOT short shuffling steps. Every frame a different pose:
1 near (right) foot lands in front of the hip on the ball of the foot with the sole almost flat; far leg behind;
2 weight drops onto the right leg (lowest body height), knee bent; the far leg's heel tucks up toward the buttock,
  shin nearly horizontal;
3 right leg straight under/behind the hip, heel lifting; the far knee drives FORWARD below hip height, the shin
  angled BACK (foot behind the knee), toes NOT pointing down;
4 PUSH-OFF SCISSOR (highest body height): the right leg fully extended straight behind, its toe JUST leaving the
  ground; the far leg reaching far forward almost straight, heel leading; feet at least 200 px apart;
5-8 the same four phases with legs swapped (far foot lands in front … near leg reaching forward) — frame 5 must
  NOT look like frame 1, frame 8 must NOT look like frame 4.
The planted foot slides back evenly by about 44 px per frame (x about 270, 226, 182, then toe-off at 138).
Arms swing opposite to the legs with a clear range: the free left arm swings well forward and back, the sword arm
also swings. SWORD: in the right hand, normal grip, trailing low behind her pointing back and down; the pommel,
the wrapped grip, the guard and the blade form ONE STRAIGHT LINE through her closed fist.
Pose language reference: the long-stride, forward-leaning silhouettes in docs/ref_run_v2_old.jpg — but do not
copy its bent sword grip or its duplicated frames.
```

## 八、接入（我这边）

`python3 -I tools/build_sprites.py <v2 包> hero <skills_v3 包> <hero_fix_v1 适配包（只用 jump_02）> <hero_fix_v2 包>`（后面的覆盖前面的同名帧）；
跑步按实测的着地脚位置标定「着地帧每帧距离」和「蹬伸帧距离」（`src/sprite.js` 改成按帧的距离表），确认正常跑速一圈 0.45～0.55 秒；
截图（战斗、地图，桌面 + 手机）、全套测试、帧率；姿势手感等 Quinn 试玩确认。
