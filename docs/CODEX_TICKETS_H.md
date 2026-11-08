# 子轮 H 工单（第一批，可派 Codex）

> **测试节奏（Quinn 2026-11-08）：模块级测试。** 检查点之间不逐步跑测试 / 全套回归、不逐个出 fxsheet 截图；一个模块（H-2 + H-3、H-6 + H-7、H-8 + H-9）整单做完后统一测一次，发现的问题汇总成一张清单、集中一轮改完再测。下面各工单里「每个检查点跑…」的要求一律按此理解为**模块末尾统一做**。检查点仍然保留，作用只是分段交代码给我看设计方向（不跑测试）。素材包验货、预览审查照旧逐步；合并 main 前的模块级全套测试照旧必须有。

按 Quinn 的常驻规则 2（2026-11-07）：我做设计、写工单、终审、接入合并；Codex 按工单写代码，**只交代码（补丁 / 改过的文件），不碰仓库**；Muse 先做机械核验（文件和 diff 对照工单、能跑的检查先跑），再交给我终审。审查不过打回重做，仍走 Muse。

通用约定（每张工单都适用）：
- 仓库：`leograntquinn-crypto/afterglow-blade`，基于 main 最新版。原生 JS ES 模块 + Canvas，没有构建步骤；中文注释风格照现有代码（「做什么 + 为什么」，不写废话）。
- 调效果的数值一律放数据表（`src/fx_data.js` 这类），代码只按表执行。
- **第 14 项永久规则**：不许新加代码画的特效形状（`arc / lineTo / ellipse / 渐变 / fillRect` 画出来的特效本体）；素材没载好时新加的部分**不画**。
- 不许改玩法数值、AI、关卡规则；不许动和工单无关的文件。
- 跑测试：仓库根目录 `python3 -m http.server 8765`，另开终端 `bash tests/run_all.sh`（见 `tests/README.md`）。交付时附上全套的输出。

| 工单 | 内容 | 依赖 | 难度 | 可派 |
|---|---|---|---|---|
| H-0 | 测试运行器整理：统一端口、自动起服务器、汇总、退出码 | 无，**现在就能做** | 机械 | ✓ |
| H-1 | 夜鸦特效包的构建脚本 + 按首领载入 | 无（先用自己造的假包），素材到了再跑真包 | 机械 | ✓ |
| H-2 | 夜鸦特效接入（查表 + 替换各招式的调用点），分三个检查点 | H-1；素材包 | 复杂（按指导执行） | ✓ |
| H-3 | 夜鸦特效的确定性测试 | H-1；和 H-2 同步 | 中 | ✓ |
| H-4 | 通用特效截图工具（逐格截图、定格、拼图） | 无，**现在就能做** | 机械 | ✓ |
| — | 夜鸦机制补强（第二阶段夜幕压暗、只在羽毛闪光时现身）的设计和手感 | — | — | ✗ 我自己做 |
| — | 第 2 包 `fx_boss_ironjaw_v1` 规格、所有大小 / 亮度的手感调校、最终审查和测试结论 | — | — | ✗ 我自己做 |

---

## H-0 测试运行器整理（现在就能做）

**目标**：`tests/` 里的 30 个脚本是从开发会话的临时目录搬过来的，各自硬写了端口、只靠人看输出判断。整理成一条命令跑完、给出明确结论。

**改哪些文件**：新建 `tests/run_all.js`；改 `tests/*.js` 里写死 `localhost:8765` 的地方（16 个脚本、17 处）；`tests/run_all.sh` 改成调用 `run_all.js`；`tests/README.md` 更新用法。

**确切行为**：
1. `node tests/run_all.js [--only a,b] [--skip soakd,soakd60] [--port N]`：自己在仓库根目录起静态服务器（Node 内置 `http` 模块，正确的 MIME：`.js` → `text/javascript`、`.webp`、`.json`），找一个空闲端口（默认 8765，被占就往后找），把端口用环境变量 `PORT` 传给每个测试。
2. 按 `tests/run_all.sh` 现在的顺序、参数、超时时间跑（`LV=7 channeltest`、`DIFF=0 soakd`、`DIFF=2 soakd60`、`worldtest` 等带 `m` 参数的跑两次）。
3. 每个测试的判定（和现在人工判定的规则一致）：
   - 超时、进程非零退出 → 不过；
   - 输出里有 `FAIL` 或 `FAILED`（区分大小写，整词）→ 不过；
   - 有 `ERR ` 或 `PAGE ERRORS ` 开头的行而后面不是 `none` → 不过；
   - `soakd` / `soakd60`：每行 JSON 的 `scene` 必须是 `"clear"`、`err` 必须是 `null`，而且要有 5 行。
4. 每个测试的完整输出写到 `tests/out/<name>.log`；最后打印汇总表（名字、通过 / 不过、用时、不过的原因第一行），任何一个不过 → 退出码 1。
5. 测试脚本本身的断言**一行都不改**（只改端口的读法：`process.env.PORT || 8765`）。

**验收**：
- 在当前 main 上 `node tests/run_all.js` 全部通过、退出码 0（附汇总表）；
- 故意把 `tests/efx2test.js` 里一个期望值改错再跑 `--only efx2test` → 不过、退出码 1（演示完改回来，不要提交这个改动）；
- `--port 9000` 时所有测试连的都是 9000（日志里能看到）。

---

## H-1 夜鸦特效包的构建 + 按首领载入

**规格**：`docs/ART_FX_BOSS_RAVEN_V1.md`（第三节内容、第五节文件结构、第八节接入）。

**改哪些文件**：`tools/build_fx.py`、`src/fx_art.js`。

**确切行为**：
1. `python3 -I tools/build_fx.py --boss raven <fx_boss_raven_v1 目录>`：只打这一包，不动别的图集（照现有 `--enemy` 模式的写法）。输出 `assets/fx/fx_boss_raven.{webp,json}`（桌面）和 `fx_boss_raven_m.{webp,json}`（手机）：
   - 贴图：桌面原尺寸 / 手机 50%，`night_veil` 不裁边（`keep_full`），其余裁透明边；
   - 序列帧：桌面 50% / 手机 25%，每帧裁透明边（`build_flipbooks` 现有逻辑）；
   - 贴图和序列帧放进**同一套图集**（JSON 同时有 `tex` 和 `fb` 两个键——`FxPack.load()` 两个都支持）。
   - 兼容两种 zip 结构：传入目录下直接有 `fx.json`，或者多一层子目录（自动找到 `fx.json` 所在层）。帧用 `frames` 列表里的单帧路径，不依赖 `sheet` 字段。
   - 检查：每项的画布尺寸和 `fx.json` 写的一致、帧数和规格第三节一致，不一致就报错退出（不要静默打包）。
2. `src/fx_art.js`：
   - `FX_ART.raven = new FxPack('fx_boss_raven')`；
   - `BOSS_FX` 映射加 `nightRaven: 'raven'`（`prepareBossFx` 现有逻辑就会只在夜鸦那一关载入、离开释放）；
   - `flipbook(id)` 的查找列表加上 `FX_ART.raven`；
   - 新导出 `bossTex(packName, id)`：返回那一套里的贴图（没载好返回 `null`），写法照 `enemyTex`。

**验收**：
- 素材包还没到：自己按规格第三节的 id / 画布 / 帧数造一个假包（纯色占位图，只用来测脚本；**不要提交**），跑通构建，贴出输出的图集尺寸和 JSON 里的键；把假包故意改错一项尺寸 → 脚本报错退出；
- 在浏览器里：进第 2 关（夜鸦）`FX_ART.raven.ready` 变成 true；进第 1 关它被释放（`ready` false）；
- 全套测试通过。

---

## H-2 夜鸦特效接入（复杂件：按指导执行，三个检查点）

**规格**：`docs/ART_FX_BOSS_RAVEN_V1.md` 第一节的替换表就是要做的全部内容。照 `src/enemy_fx.js`（敌人特效）的模式写：数据在表里，画法集中在一个文件，调用点只调函数。

**改哪些文件**：`src/fx_data.js`（加表）、新建 `src/boss_fx.js`（画法）、`src/boss.js`、`src/boss_moves.js`、`src/combat.js`（只动 `kind === 'feather'` 和箭的分支）。

**数据表**（`fx_data.js`，先照这个写，大小和亮度我接入时调）：
```js
export const BOSS_FX = {
  nightRaven: {
    feather: { fb: 'feather_blade_spin', trail: 'feather_trail', k: 0.42, trailColor: '#ff4dd2' },   // 回旋羽：k = 逻辑像素 / 交付像素
    burst: { fb: 'feather_burst', color: '#ff4dd2', size: 1 },      // 化作黑羽（size × 身高 / 260）
    appear: { fb: 'raven_appear', color: '#ff4dd2', size: 1 },      // 浮现
    wisps: { fb: 'split_wisps', color: '#c070ff', size: 1, alpha: 0.8 },
    arrow: { tex: 'raven_arrow', k: 0.5, trailColor: '#ff4dd2' },
    glint: { fb: 'bow_glint', color: '#ff4dd2', size: 0.6, x: 0.35, z: 0.62 }, // 弓上闪光的位置（× 身高）
    rain: { fb: 'arrow_rain', impact: 'rain_impact', color: '#ff4dd2', k: 0.45 },
    sigil: { tex: 'raven_sigil', color: '#ff4dd2', spin: 0.004 },
    gather: { fb: 'channel_gather', color: '#ff4dd2', size: 1 },
    veil: { tex: 'night_veil' },                                     // H-2 只做读条结束的一闪；第二阶段常驻压暗是机制，我来做
    death: { fb: 'raven_death', color: '#ff4dd2', size: 1.2 },
  },
};
```

**指导要点（关键取舍）**：
- **分身不许泄露真身**：分身期间三个身影的特效必须完全一样（`split_wisps` 三个都画，同样的大小、相位规则、透明度）；分辨真身的线索只能是现在已有的「脚下有影子」。
- **箭**：夜鸦射出的所有箭（齐射、分身、读条）用 `raven_arrow`。区分办法：`Projectile` 的 `owner?.key === 'nightRaven'`，不要加新的 `kind`（别的代码按 `kind === 'arrow'` 判断命中、立柱挡箭等，不能断）。假箭照样用这张图。
- **天降**：只有夜鸦的 `rain` 换成 `arrow_rain` + 落地 `rain_impact`；`Hazard` 的预警圈不变；别的首领（残影、祭坛守护者）的 `rain` 照旧用 `meteor`。在 `Hazard` 上加一个可选字段（比如 `art: 'raven'`）由 `boss.js` 的 `rain` 按首领传入，不要在 `combat.js` 里写死首领名。
- **画在哪一层**：身上的（`split_wisps`、`channel_gather`、`bow_glint`）在 `Boss.draw` 里每帧画（照 `drawTypeTele` 的写法）；一次性的（`feather_burst`、`raven_appear`、`rain_impact`、`raven_death`）交给粒子 `game.fx.flip(...)`（`size` 参数直接给逻辑像素 / 交付像素）；地面的（`raven_sigil`）在 `drawFloor` 那一层画。
- **素材没载好**：新加的部分不画；被替换的部分保留现在的画法作为退路（羽刃的静止图、通用箭、火球、通用符文圈都是成品贴图，不算代码画的形状）。
- **不做**：第二阶段常驻压暗、飘落黑羽、「只在羽毛闪光时现身」这些机制（我来设计）；不调任何数值手感。

**三个检查点**（每个检查点交一次，Muse 核验后转我看，我回话再做下一段）：
1. 表 + `boss_fx.js` 骨架 + 回旋羽（羽刃 + 拖尾 + 掉头的小 `feather_burst`）+ 夜鸦的箭 + 齐射的 `bow_glint`；
2. 鸦影分身（化作黑羽 → 三处浮现 → 三个身影的丝缕 → 识破 / 散掉的 `feather_burst`）+ 瞬移（消失 `feather_burst`、出现 `raven_appear`）+ 天降箭雨；
3. 读条（脚下 `raven_sigil` + 身上 `channel_gather` + 结束时 `night_veil` 一闪）+ 召唤（`raven_sigil`）+ 死亡（`raven_death`）。

**验收**：H-3 的测试全过 + 全套测试通过 + 每个检查点附截图（用 H-4 的工具，每个招式的关键时刻，桌面 + 手机）。

---

## H-3 夜鸦特效的确定性测试

**改哪些文件**：新建 `tests/bossfxtest.js`，加进 `tests/run_all.js` 的列表。照 `tests/efx2test.js` 的写法（在页面里用 `__game` 直接摆出场景、推进帧、检查粒子和标记）。

**要测的**（每条一个 `ok(...)`，输出格式和 `efx2test` 一样，最后一行 `BOSSFXTEST ok` 或 `BOSSFXTEST FAIL n`）：
1. 进第 2 关 `fx_boss_raven` 载入；进第 1 关释放；
2. 回旋羽飞行中画的是 `feather_blade_spin`（在 `boss_fx.js` 里留一个测试用的标记，照 `enemy_fx.js` 里 `e.teleColor` 的做法）；掉头那一帧有一次 `feather_burst`；
3. 齐射预警期间有 `bow_glint`；射出的箭 `owner.key === 'nightRaven'`、画的是 `raven_arrow`；
4. 分身：开始时一次 `feather_burst`、三处 `raven_appear`；分身期间**真身和两个分身的丝缕参数完全一样**（大小、透明度、帧号规则）；识破时两个分身位置各一次 `feather_burst`；
5. 瞬移：消失一次 `feather_burst`、出现一次 `raven_appear`；
6. 夜鸦的天降：`Hazard` 画 `arrow_rain`、爆发时有 `rain_impact`；**残影的天降仍然是 `meteor`**；
7. 读条：脚下 `raven_sigil`、身上 `channel_gather`；读条结束 `night_veil` 一闪；被打断时这些马上消失；
8. 死亡：一次 `raven_death`；
9. 夜鸦的素材没载好（`FX_ART.raven.ready = false`）：新加的都不画、被替换的退回原来的画法，页面没有报错；
10. 页面报错为 none。

**验收**：在 H-2 每个检查点上跑，已经做了的部分全过；全部做完后全过。

---

## H-4 通用特效截图工具（现在就能做）

**目标**：给每次特效接入做「旧版 vs 新版」逐格对比图（我审查用）。现在的做法是一次性脚本，要做成可复用的工具。

**改哪些文件**：新建 `tools/fxsheet.js`、`tools/fxsheet_cases/enemy_types.json`（示例配置）。

**确切行为**：
1. `node tools/fxsheet.js <配置.json> <输出.png> [--port N] [--mobile]`：配置是格子列表，每格 `{ "label", "stage": 关卡序号, "spawn": "敌人类型" 或首领 key, "moment": "tele|attack|hit|death|move:<招式名>", "frames": 推进帧数 }`。
2. 每格：清场（敌人、飞行物、地面效果、掉落、粒子、飘字）→ 摆出主角和目标 → 触发时刻 → 推进指定帧数 → **把游戏自己的循环停住**（替换 `update`，截完还原；不停住的话截图前一次性特效就播完了）→ 渲染 → 按目标位置裁一块（逻辑画面是 960×540，按画布实际尺寸换算）。
3. 截图前关伤害数字（`settings.numbers = 'off'`）、清横幅；去掉敌人的「大脑」（`e.T = { ...e.T, brain: null }`），不然不在距离内会收招。
4. 出图：按配置的列数拼成一张，每格左上角标 `label`；`--compare <另一个端口>` 时左右两半分别是两个版本。
5. 首领招式（`move:<名字>`）：调首领的 `startAct`（或 `boss.js` 里等价的入口）直接开始那个招式。

**验收**：用 `enemy_types.json`（五种敌人 × 四个时刻）在当前 main 上出图，和 `docs/fx_enemy_v1_types_cmp.jpg` 右半边内容一致；`--compare` 能出左右对比；`--mobile` 用手机视口和手机图集。

---

# 第二批工单（2026-11-08，H-1 接入后）

| 工单 | 内容 | 依赖 | 难度 | 可派 |
|---|---|---|---|---|
| H-5 | `--boss` 模式通用化：夜鸦、铁颚、残影三包按一张规格表构建 + 按首领载入 | H-1（已接入） | 机械 | ✓ |
| H-6 | 铁颚特效接入（规格 `docs/ART_FX_BOSS_IRONJAW_V1.md` 第一、八节），两个检查点 | H-5；铁颚包（已在 assets-v8） | 复杂（按指导执行） | ✓ |
| H-7 | 铁颚特效的确定性测试 | H-5；和 H-6 同步 | 中 | ✓ |

## H-5 `--boss` 模式通用化

**目标**：H-1 的 `--boss raven` 是夜鸦专用的（`validate_raven`、`build_raven`）。铁颚包已经到了、残影包在排队，改成一张表驱动，以后每包只加一行表。

**改哪些文件**：`tools/build_fx.py`、`src/fx_art.js`。

**确切行为**：
1. `BOSS_PACKS = { raven: {...}, ironjaw: {...}, afterimage: {...} }`：每项写 `out`（图集名：`fx_boss_raven` / `fx_boss_ironjaw` / `fx_boss_afterimage`）、`textures`（id → (宽, 高)）、`flipbooks`（id → (宽, 高, 帧数)）、`keep_full`（不裁边的贴图 id）。三包的数值分别照各自规格第三节：
   - `docs/ART_FX_BOSS_RAVEN_V1.md`（现有 `validate_raven` 的表原样搬过去，`keep_full = {night_veil}`）；
   - `docs/ART_FX_BOSS_IRONJAW_V1.md`（`keep_full = {chain_glow}`：可平铺）；
   - `docs/ART_FX_BOSS_AFTERIMAGE_V1.md`（`keep_full = {rev_ribbon, streak_line}`：条带 / 可平铺）。
2. `python3 -I tools/build_fx.py --boss <raven|ironjaw|afterimage> <包目录>`：`validate_raven` / `build_raven` 改成通用的 `validate_boss(name, root, m)` / `build_boss(name, root)`，校验和打包逻辑不变（id 缺 / 多 / 重复、画布、帧数、单帧实际尺寸不符 → 报错退出，不覆盖已有图集）。未知的名字 → 报错并列出可用的。
3. `src/fx_art.js`：`FX_ART.ironjaw = new FxPack('fx_boss_ironjaw')`、`FX_ART.afterimage = new FxPack('fx_boss_afterimage')`；`BOSS_FX` 加 `ironJaw: 'ironjaw'`、`afterimage: 'afterimage'`；`flipbook()` 查找列表加上这两套。
4. **不要提交图集**（我接入时用真包打）；铁颚的真包在 `assets-v8`（`fx_boss_ironjaw_v1.zip`）。

**验收**：
- `--boss raven` 用真包打出的 `fx_boss_raven*.{webp,json}` 和仓库里现在的**逐字节一致**；
- `--boss ironjaw` 用真包跑通，贴出图集尺寸和 JSON 的键；改错一项画布 → 报错退出、已有图集不变；
- `--boss afterimage`：包还没到，用按规格造的假包跑通（不要提交假包）；
- 浏览器里：进第 3 关（铁颚）`FX_ART.ironjaw.ready` 为 true、进第 1 关被释放；
- `node tests/run_all.js` 全过。

## H-6 铁颚特效接入（两个检查点）

**规格**：`docs/ART_FX_BOSS_IRONJAW_V1.md` 第一节的替换表就是全部内容；照 H-2（夜鸦）的写法：数据在 `fx_data.js` 的 `BOSS_FX.ironJaw` 表、画法在 `src/boss_fx.js`（H-2 建立的文件；H-2 还没合并的话等它合并后再开始，避免两边同时新建这个文件）。

**指导要点**：
- **只有铁颚换**：重砸 / 冲击波的地面爆发用 `Hazard` 现有的可选字段 `art`（骸骨统领的 `bone_spikes` 就是这么接的），由 `boss.js` / `boss_moves.js` 按首领传入；`combat.js` 里不许写首领名。别的首领的重砸照旧。
- **刑台三震一下比一下大**：三震的 `stomp_quake` 按 1 / 1.2 / 1.5 放大；第三震炸开 `stomp_wave`。
- **锁链光** `chain_glow`：沿锁链平铺（照 `src/enemy_fx.js` 里 `tileAlong` 的写法，叠在现有链环图上）；拖拽 `chain_drag` 跟着主角的脚（被拉的那十几帧）。
- **读条「断头重锤」**：脚下 `execution_mark`、举斧时 `headsman_glint`、结束 `execution_drop`；被打断时这些马上消失。
- 第二阶段咆哮时 `chain_break`、死亡 `ironjaw_death`。
- 素材没载好：新加的部分不画；被替换的部分退回现在的画法。
- **不做**：去掉铁颚的三连斩、「锁链把你拉到刑台上」这些机制（我来设计）；不调数值手感。

**检查点**：
1. 表 + 锁链钩（链光、钩中火星、拖拽火星、拉近那一锤的 `heavy_cleave` + `stomp_quake`）+ 重砸 / 冲击波 / 刑台三震（`stomp_quake`、`stomp_wave`，只有铁颚）+ 冲锋 `charge_sparks`；
2. 读条（`execution_mark`、`headsman_glint`、`execution_drop`）+ 召唤（`execution_mark`）+ 第二阶段 `chain_break` + 死亡 `ironjaw_death`。

**验收**：H-7 全过 + 全套通过 + 每个检查点用 `tools/fxsheet.js` 出截图（铁颚各招式的关键时刻，加 `--compare` 对照 main，桌面 + 手机）。

## H-7 铁颚特效的确定性测试

照 H-3（夜鸦）的写法，新建 `tests/ironjawfxtest.js` 并加进 `tests/run_all.js`。要测：进第 3 关载入 / 进第 1 关释放；锁链钩四个时刻各自的素材；**骸骨统领的重砸仍然是 `bone_spikes`、普通的通用招式不受影响，只有铁颚换**；三震的三次 `stomp_quake` 大小依次变大、第三震有 `stomp_wave`；读条三个素材、被打断马上消失；第二阶段 `chain_break` 一次；死亡 `ironjaw_death` 一次；素材没载好时新加的不画、页面无报错。输出格式同 `efx2test`，最后一行 `IRONJAWFXTEST ok` / `IRONJAWFXTEST FAIL n`。

---

# 第三批工单（2026-11-08，H-5 接入后）：残影

三包图集都已经在仓库里（`fx_boss_raven`、`fx_boss_ironjaw`、`fx_boss_afterimage`，`FX_ART.raven / ironjaw / afterimage`，按关卡载入，见 `tests/bosspacktest.js`）。

| 工单 | 内容 | 依赖 | 难度 | 可派 |
|---|---|---|---|---|
| H-8 | 残影特效接入（规格 `docs/ART_FX_BOSS_AFTERIMAGE_V1.md` 第一、八节），两个检查点 | H-2 合并后（共用 `src/boss_fx.js`） | 复杂（按指导执行） | ✓ |
| H-9 | 残影特效的确定性测试 | 和 H-8 同步 | 中 | ✓ |

派单顺序建议：H-2（夜鸦）→ H-6 / H-7（铁颚）→ H-8 / H-9（残影），一次只开一个改 `src/boss_fx.js` 的工单，避免合并冲突。

## H-8 残影特效接入

**指导要点**：
- **刀光条带**：残影的三连斩 / 瞬移斩现在走 `game.fx.arc(...)`（铺的是 `fx_blade_v1` 的条带）。给 `fx.arc` 加一个可选参数（条带贴图，默认现在的），残影传 `rev_ribbon`（从 `FX_ART.afterimage` 取，`bossTex('afterimage', 'rev_ribbon')`）；**别的首领、主角的刀光一律不变**。另外在出刀那一帧叠一个 `rev_slash`。
- **剑气**：`Projectile` 的 `kind === 'wave'` 且 `owner?.key === 'afterimage'` 时画 `rev_wave`；主角自己的剑气（`wave_crescent`）不变。不要加新的 `kind`。
- **镜像**：`mirror` 招式开始时头顶 `mirror_sigil`（每帧画，招式结束消失）；镜像·风（旋风）用 `rev_slash` 连播代替主角的 `slash_spin`；镜像·千刃的 `fx.arc` 同样传 `rev_ribbon`。
- **瞬移**：消失 `shadow_step_out`、出现 `shadow_step_in`，代替通用能量环。
- **残光处决**：`boss_moves.js` 里 `Streak.drawFloor` 的代码直线**删掉**，换成 `streak_line` 沿路线平铺（照 `src/enemy_fx.js` 的 `tileAlong`）+ 每个折点 `exec_mark`；每一段冲刺 `exec_dash` 沿这一段方向转过去、按长度拉伸，代替主角的 `slash_sweep`。素材没载好时路线不画（第 14 项）——判定不变。
- **读习惯**：`boss.js` 的 `habitTable` 弹出 `READ_TOAST` 的那一刻，在残影身上播一次 `habit_read`。
- **读条「残光逆转」**：身上 `reversal_gather`（每帧画）；结束 `reversal_burst`；被打断马上消失。
- **死亡**：`afterimage_death` 一次，**朝向主角所在的一边**（素材里光点往左飘：主角在右边时镜像）。
- 素材没载好：新加的不画，被替换的退回现在的画法（处决路线除外：代码直线已经删掉，不画）。
- **不做**：残影「用你的连段 / 闪避时机反制你」的机制（我来设计）；不调数值。

**检查点**：
1. 刀光条带（`fx.arc` 的可选条带参数）+ `rev_slash` + `rev_wave` + 瞬移两段 + 镜像（印记、风、千刃）；
2. 残光处决（路线平铺、折点、冲刺斩，删掉代码直线）+ 读习惯 + 读条两段 + 死亡。

**验收**：H-9 全过 + 全套通过 + 每个检查点 `tools/fxsheet.js` 截图（`--compare` 对照 main，桌面 + 手机）。

## H-9 残影特效的确定性测试

新建 `tests/afterimagefxtest.js` 并加进 `tests/run_all.js`。要测：
- 残影的刀光用 `rev_ribbon`、**主角和其他首领的刀光仍是原来的条带**；
- 残影的剑气画 `rev_wave`、主角的剑气仍是 `wave_crescent`；
- 镜像期间头顶有 `mirror_sigil`、结束后没有；
- 瞬移各一次 `shadow_step_out` / `shadow_step_in`；
- 处决：路线画的是 `streak_line` 贴图、**`Streak.drawFloor` 里不再有 `stroke()` 调用**（在测试里包一层 `ctx.stroke` 计数）；五段各一次 `exec_dash`；
- 读到习惯时一次 `habit_read`；读条两段、被打断马上消失；
- 死亡一次 `afterimage_death`，主角在右边时朝向镜像；
- 素材没载好时新加的不画、页面无报错。

最后一行 `AFTERIMAGEFXTEST ok` / `AFTERIMAGEFXTEST FAIL n`。

---

# 第四批工单（2026-11-08）：骸骨统领补充包 `fx_boss_bone_v2`

素材包已验货上架（`assets-v8/fx_boss_bone_v2.zip`，sha256 `e238f1ee…`，8 725 167 字节）。规格 `docs/ART_FX_BOSS_BONE_V2.md`。**模块级测试**：H-10 + H-11 + H-12 作为一个模块，做完统一测一次（见本文件开头的测试节奏）。

| 工单 | 内容 | 依赖 | 难度 | 可派 |
|---|---|---|---|---|
| H-10 | `--boss bone` 加进 `BOSS_PACKS`；骸骨统领那一关同时载两套（`fx_bone` + `fx_boss_bone_v2`） | 无（H-5 已接入） | 机械 | ✓ |
| H-11 | 骸骨统领补充特效接入（规格第一、八节），两个检查点 | H-10；排在 H-8 / H-9（残影）之后（共用 `src/boss_fx.js`） | 复杂（按指导执行） | ✓ |
| H-12 | 骸骨统领补充特效的确定性测试 | 和 H-11 同一模块 | 中 | ✓ |

## H-10 构建 + 一关载两套

- `tools/build_fx.py` 的 `BOSS_PACKS` 加 `bone`：`out = "fx_boss_bone_v2"`，`textures = { bone_sigil: (512, 256), marrow_tether: (256, 32) }`，`flipbooks = { cage_tighten: (512, 256, 8), drag_sparks: (256, 128, 6), shard_return: (128, 128, 8), bone_reform: (256, 384, 10), marrow_glow: (256, 384, 8), bone_call_burst: (512, 384, 8), summon_rise: (256, 256, 8), bonelord_death: (384, 384, 10) }`，`keep_full = { marrow_tether }`。
- `src/fx_art.js`：`FX_ART.bonev2 = new FxPack('fx_boss_bone_v2')`；`BOSS_FX` 的值允许是数组，`boneLord: ['bone', 'bonev2']`（`prepareBossFx` 对数组里每一套 load，其他首领的照旧 release）；`flipbook()` 查找列表加上 `FX_ART.bonev2`。现有 `fx_bone`（`bone_spikes`、`bone_rend`）一字不改。
- 验收（并进模块测试）：真包打出图集；`--boss raven / ironjaw / afterimage` 打出的和仓库现有图集逐像素一致；`tests/bosspacktest.js` 的期望改成第 1 关同时载 `bone` 和 `bonev2`、其他关两套都释放。

## H-11 骸骨统领补充特效接入

**指导要点**：
- **只补缺的**：`bone_spikes`、`bone_rend` 现有的用法一律不动。
- **骨牢**（`boss_moves.js` 的 `boneCage`）：预警期间，以牢中心画 `cage_tighten`（随预警进度从 1 缩到 0.6 倍）；七个骨刺位置里**相邻且都存在的两根之间**用 `marrow_tether` 平铺连线（照 `src/enemy_fx.js` 的 `tileAlong`）。**缺口两边那一段不连**——缺口是逃生路线，必须一眼看得出来。
- **拖地火星**：裂地追斩的预警和出刺阶段、冲锋期间，剑尖位置画 `drag_sparks`（循环，跟着首领；剑尖位置 = 首领前方 0.55 × 身高、贴地）。
- **骨片飞回**：骸骨统领受重击（`heavy`）或破防时，生成 3～5 片 `shard_return`：先往外飞散（约 18 帧，带重力），停 10 帧，再沿弧线飞回首领胸口（约 24 帧），飞回途中身后拖一段 `marrow_tether`。纯表现：不改判定、不改血量、不影响别的东西。数量和时长写进 `BOSS_FX.boneLord` 表。
- **第二阶段**（咆哮时）：首领身上一次 `bone_reform`。
- **读条「亡骨号令」**：脚下 `bone_sigil`（慢慢转）、身上 `marrow_glow`（每帧画）；读条结束 `bone_call_burst`；被打断时这些马上消失。
- **召唤**：脚下 `bone_sigil`；每只小怪出现的位置一次 `summon_rise`（替换现在的通用符文圈；`summon_circle` 是祭坛守护者的，不要碰）。
- **死亡**：`bonelord_death` 一次，停在骨堆后淡出（`holdFade`，照 `fx_enemy_v1` 的 `bone_collapse`）。
- 素材没载好：新加的不画，被替换的退回现在的画法。
- **不做**：第 9 项骸骨统领的机制补强（我来设计）；不调数值。

**检查点**（只交代码看方向，不跑测试）：
1. 骨牢（收紧 + 光丝，缺口不连）+ 拖地火星 + 骨片飞回；
2. 第二阶段重组 + 读条三段 + 召唤 + 死亡。

## H-12 骸骨统领补充特效的确定性测试

新建 `tests/bonefxtest.js` 并加进 `tests/run_all.js`。要测：第 1 关两套都载入、换关都释放；骨牢预警期间 `cage_tighten` 在画、**光丝的段数 = 存在的相邻骨刺对数、缺口两侧没有光丝**；拖地火星只在裂地追斩 / 冲锋期间画；重击后有 3～5 片骨片、最后都回到首领身边并消失；第二阶段一次 `bone_reform`；读条两段 + 结束 `bone_call_burst`、被打断马上消失；召唤每只小怪一次 `summon_rise`；死亡一次 `bonelord_death`；**`bone_spikes`、`bone_rend` 原有的触发次数不变**；素材没载好时新加的不画、页面无报错。最后一行 `BONEFXTEST ok` / `BONEFXTEST FAIL n`。

**模块测试**（H-10 ～ H-12 全做完后统一一次）：`node tests/run_all.js` 全过 + `tools/fxsheet.js` 骸骨统领各招式关键时刻的对比截图（`--compare` 对照 main，桌面 + 手机）；问题汇总成一张清单、集中改完再测。

---

# 第五批工单（2026-11-08）：祭坛守护者补充包 `fx_boss_warden_v2`

素材包已验货上架（`assets-v8/fx_boss_warden_v2.zip`，sha256 `7a9c7030…`，5 685 469 字节）。规格 `docs/ART_FX_BOSS_WARDEN_V2.md`。**模块级测试**：H-13 + H-14 + H-15 一个模块，做完统一测一次。

| 工单 | 内容 | 依赖 | 难度 | 可派 |
|---|---|---|---|---|
| H-13 | `--boss warden` 加进 `BOSS_PACKS`；第 4 关同时载两套（`fx_warden` + `fx_boss_warden_v2`） | H-10（「一关载两套」的写法在 H-10 里做） | 机械 | ✓ |
| H-14 | 祭坛守护者补充特效接入（规格第一、八节），两个检查点 | H-13；排在 H-10 ～ H-12（骸骨统领）之后 | 复杂（按指导执行） | ✓ |
| H-15 | 祭坛守护者补充特效的确定性测试 | 和 H-14 同一模块 | 中 | ✓ |

## H-13 构建 + 一关载两套

- `BOSS_PACKS` 加 `warden`：`out = "fx_boss_warden_v2"`，`textures = { fire_lane: (256, 64) }`，`flipbooks = { brazier: (128, 192, 4), brazier_flame: (128, 192, 8), brazier_break: (192, 192, 8), judgment_sweep: (512, 256, 8), warden_flame: (256, 384, 8), phase_ignite: (384, 384, 10), inferno_gather: (256, 384, 8), inferno_burst: (512, 384, 8), warden_death: (384, 384, 10) }`，`keep_full = { fire_lane }`。
- `src/fx_art.js`：`FX_ART.wardenv2 = new FxPack('fx_boss_warden_v2')`；`BOSS_FX.warden = ['warden', 'wardenv2']`；`flipbook()` 查找列表加上。`fx_warden`（`soul_fire`、`summon_circle`）一字不改。
- 验收（并进模块测试）：真包打出图集；其他四套首领图集重打逐像素不变；`tests/bosspacktest.js` 期望改成第 4 关同时载 `warden` 和 `wardenv2`。

## H-14 祭坛守护者补充特效接入

**指导要点**：
- **按阶段染色**：`BOSS_FX.warden` 表写三个阶段的颜色 `['#ffb347', '#6fe38a', '#d6ffe0']`，`warden_flame`、`brazier_flame`、`fire_lane`、`judgment_sweep`、`phase_ignite`、`inferno_*`、`warden_death` 都按 `b.phase` 取色。第 3 阶段（`phase === 2`）`warden_flame` 播放速度 × 1.6、每隔 20～40 帧随机亮跳一下（倍数、间隔写进表）。
- **火舌方向要镜像对**：`warden_flame` 素材往左上拉、`brazier_flame` 往左拉、`fire_lane` 往右倾——引擎按「拉向谁」镜像：守护者的火拉向最近的魂火炉（没有炉子时拉向它背后），炉口的火拉向守护者，`fire_lane` 倾向长戟扫过来的方向。
- **魂火炉**（`boss_moves.js` 的 `Brazier`）：`draw()` 里代码画的石墩（`fillRect` / `arc` / `stroke`）**删掉**，换成 `brazier`（4 帧轮换）+ 炉口 `brazier_flame`；被打碎时 `brazier_break` 代替通用爆点 / 碎片（`soul` 粒子可以保留）。素材没载好时不画炉身（第 14 项）——**炉子的判定、血量照旧**，标出炉子位置的办法我在机制设计里定，这一单不做替身。
- **审判长戟**：两条地面光带改用 `fire_lane` 平铺（代替 `lane_band`，只对守护者）；两道横扫用 `judgment_sweep`（按光带长度横向拉伸）代替那道半径 220 的通用新月（`fx.arc`）。
- **身上的火**：`warden_flame` 每帧画（活着的时候一直在）；**它代替通用的首领状态光**（`bossIdle`），出招预警时的红色 `bossThreat` 照旧。
- **换阶段**（咆哮时）：`phase_ignite` 一次，颜色用新阶段的颜色。
- **读条「祭坛炎狱」**：身上 `inferno_gather`（每帧画）；结束 `inferno_burst`；被打断马上消失。`summon_circle` 原来的用法不动。
- **死亡**：`warden_death` 一次。
- 素材没载好：新加的不画，被替换的退回现在的画法（炉身除外：代码画的已删）。
- **不做**：第 9 项「借来的火」三阶段机制真正不同 / 第 3 阶段火焰失控的玩法（我来设计）；不调数值。

**检查点**（只交代码看方向，不跑测试）：
1. 表 + 按阶段染色 + 身上的火（含第 3 阶段失控）+ 魂火炉（本体、炉口火、打碎）；
2. 审判长戟（火带 + 横扫）+ 换阶段 + 读条 + 死亡。

## H-15 祭坛守护者补充特效的确定性测试

新建 `tests/wardenfxtest.js` 并加进 `tests/run_all.js`。要测：第 4 关两套都载、换关释放；三个阶段 `warden_flame` 的颜色依次是表里的三色、第 3 阶段播放加快；魂火炉画的是 `brazier` + `brazier_flame`、**`Brazier.draw` 里不再调用 `fillRect` / `arc` / `stroke`**（包一层 ctx 计数）、打碎一次 `brazier_break`；审判长戟两条 `fire_lane`、两次 `judgment_sweep`、**不再有半径 220 的 `fx.arc`**；**其他首领的 `bossIdle` 状态光和光带不受影响**；换阶段各一次 `phase_ignite`；读条两段、被打断马上消失；死亡一次 `warden_death`；**`soul_fire`、`summon_circle` 的触发次数不变**；素材没载好时新加的不画、页面无报错。最后一行 `WARDENFXTEST ok` / `WARDENFXTEST FAIL n`。

**模块测试**（H-13 ～ H-15 全做完后统一一次）：`node tests/run_all.js` 全过 + `tools/fxsheet.js` 守护者各招式关键时刻 × 三个阶段的对比截图（`--compare` 对照 main，桌面 + 手机）；问题汇总成一张清单、集中改完再测。

---

# 子轮 H 派单总顺序（2026-11-08）

H-0、H-1、H-4、H-5 已接入（v50）。剩下的按顺序，一次只开一个改 `src/boss_fx.js` 的模块：

1. **H-2 + H-3**（夜鸦特效 + 测试）——第一个建立 `src/boss_fx.js`；
2. **H-6 + H-7**（铁颚）；
3. **H-8 + H-9**（残影）；
4. **H-10 ～ H-12**（骸骨统领；H-10 是纯构建，可以提前插空做）；
5. **H-13 ～ H-15**（祭坛守护者；H-13 依赖 H-10 的「一关载两套」）。

每个模块交回后我终审 + 模块级全套测试 + 合并发布；第 9 项每名首领的机制补强（我做）跟着对应模块一起验收。
