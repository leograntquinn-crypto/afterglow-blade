# 状态系统工单（装备第二个代码模块，可派 Codex）

规则来源：`docs/DESIGN_EQUIPMENT.md` 第三节（12 种状态、相互作用矩阵、结算、兼容）和第十节（搭配效果）。**系统规则以设计稿为准，本文只把它落成接口、数据和步骤。**

三件套：
- 设计说明：本文第一～三节；
- 先行写好的验收测试：`tests/statustest.js`（20 项）、`tests/synergytest.js`（8 项），随本文入库，Codex 不改测试，只让它通过；
- 错误状态 / 边缘清单：本文第四节。

**前置条件**：装备数据模块（`gear-data-cp1` + FIX-3）合并进 main 之后再开工，因为要用到 `computeStats` 输出的 `imbues` / `setCount` 和 `src/gear/rating.js`。**基于那时的 main 开分支。**

**排队**：会改 `src/main.js`（`applyHit` / `calcDamage` / 主循环）、`src/enemy.js`、`src/ai.js`、`src/boss.js`、`src/player.js`、`src/hud.js`，新建 `src/status.js`、`src/gear/synergy.js`。和装备展示线（`hub.js`）只在「生效状态栏」一处相邻；谁后合并，谁就基于新 main 改。

**素材**：特效画面依赖 E2 `fx_status_v1`（设计稿第八节第 4 条）。素材没到时，**规则照常生效，画面不画**（第 14 项）：只显示伤害数字和反应名字（文字是现有的成品 HUD 字体）。E2 到了以后单独一张接入单 S-6。

| 工单 | 内容 | 检查点 |
|---|---|---|
| S-1 | `src/status.js`：数据表 + 状态引擎（叠层、积累、控制、跳伤、反应） | 1 |
| S-2 | 接入战斗：命中积累、被击触发、首领替代效果、AI 受控、抗性、格挡不积累 | 1 |
| S-3 | `src/gear/synergy.js`：四类搭配、`evaluateLoadout`、战力当量补值 | 2 |
| S-4 | 敌人施加状态的四个来源 | 2 |
| S-5 | 角色页「生效状态」栏的数据接口 + 战斗 HUD 的状态图标位（素材到之前只占位不画） | 3 |
| S-6 | E2 素材接入（素材到了再派） | — |

---

## 一、接口（`src/status.js`）

```js
export const STATUS = { burn: {...}, poison: {...}, ... }   // 数值见第二节
export const REACTIONS = { melt: { a: 'chill', b: 'burn', ... }, ..., cooldown: 90 }
export const RESIST = { grunt: { bleed: 1, burn: -0.3 }, wing: { burn: 1 }, brute: { poison: 0.5, chill: 0.25 }, boss: { dot: 0.3 } }
export const HIT_TIER = { light: 1, heavy: 2, skill: 3, ult: 5 }
export const IMBUE_STRENGTH = { 1: 6, 2: 9, 3: 12 }
export const ENEMY_SOURCES = { altarFire: 'burn', priest: 'poison', brute: 'bleed', ironJaw: 'bleed' }

statusOf(actor)                          // actor.status ??= 空状态；见下方结构
addStatus(game, target, id, amount, src) // → 本次触发的反应 id 数组
updateStatuses(game, actor)              // 每帧，主循环对主角和每个敌人各调一次
isControlled(actor)                      // 冻结或麻痹
damageTakenMul(actor)                    // 脆化 1.2、冻结 1.1，可叠乘
healMul(actor)                           // 中毒时 0.5，否则 1
onDisplaced(game, actor)                 // 被击飞 / 撞墙 / 被拖拽：流血额外结算一跳
playerHitStatus(game, target, h)         // 主角命中成立后调用
absorbShield(game, actor, dmg)           // → 吸收后剩下的伤害
```

状态对象：

```js
{ stacks: { burn: { n, t, snap }, poison: {...}, bleed: {...} },   // n 层数，t 剩余帧，snap 施加时攻击力快照
  build: { chill, shock },  idleBuild: { chill, shock },             // 积累值 0～100+，多久没再积累
  freeze, paralyze, brittle, slow, fury,                              // 剩余帧（fury 另有层数 furyN）
  shield, dr: { freeze: { mul, t }, paralyze: { mul, t } },           // 护盾值、控制递减
  reactCd, tick, lastTick: { burn, poison, bleed } }                  // 反应冷却、跳伤计时、最近一次跳伤
```

## 二、数据（第三节的数值落表）

| 状态 | 字段 |
|---|---|
| burn | `max 5, dur 240, every 30, pct 0.02`（每层每跳 = 快照攻击力 × pct） |
| poison | `max 10, dur 360, every 30, pct 0.01, heal 0.5` |
| bleed | `max 5, dur 300, every 30, pct 0.015, poisonAmp 1.3` |
| chill | `full 100, decayAfter 180, decay 1 / 帧, slow 0.2` |
| freeze | `normal 72, elite 36, bossArmor 0.15, dr 1.5, drFor 480, takenMul 1.1` |
| shock | `full 100, decayAfter 180, decay 1 / 帧` |
| paralyze | `normal 48, elite 24, bossChannel 3, bossWindupSlow 0.2, dr 1.5, drFor 480` |
| slow | `v 0.15, dur 180`（不叠，取最高、刷新） |
| brittle | `mul 1.2, dur 240`（只能由反应产生；期间不能再冻） |
| fury | `max 3, per 0.06, dur 360` |
| shield | `cap 0.3`（× 最大生命） |
| lifesteal | `capPerSec 0.02, total 0.08` |
| thorns | `total 0.6` |
| cleanse | `shieldPerStack 0.02, cd 720` |

反应（`REACTIONS`，`cooldown 90` 帧 = 1.5 秒，按目标计）：

| id | a × b | 效果参数 |
|---|---|---|
| melt | chill × burn | 双清；爆发 = 灼烧剩余跳伤 × 1.5 + 寒意比例 × 攻击 × 0.4；半径 90，周围 50% |
| toxic_blast | poison × burn | 消耗中毒层；爆炸 = 剩余毒伤 × 1.2；半径 120；周围各 2 层中毒；灼烧保留 |
| shatter | freeze × shock | 解冻；伤害 = 攻击 × 0.6；挂脆化 |
| bloodpoison | poison × bleed | 持续：流血每跳 × 1.3 |
| cauterize | bleed × burn | 清流血，每层转 1 层灼烧（不超上限） |
| clot | bleed × freeze | 持续：冻结期间流血暂停（层数、时间都不动） |
| numb | slow × chill | 持续：寒意积累 × 1.3 |

## 三、步骤（伪代码）

**S-1 引擎**

```
addStatus(game, t, id, amount, src):
  if RESIST 让 t 免疫 id: return []
  amount *= 1 - resist(t, id)
  if t 是首领 and id 是控制 / 积累类: 走「首领替代」（见 S-2）
  按 id 的类型：
    叠层类（burn/poison/bleed）：n = min(max, n + amount)，t = dur，snap = src 的攻击力（快照）
    积累类（chill/shock）：build += amount × （numb 时 1.3）；idleBuild = 0
       build ≥ full × dr.mul → 触发控制（freeze/paralyze），build = 0，记控制递减
       脆化期间 chill 不触发冻结
    计时类（slow/brittle/fury/shield/cleanse）：按表
  reacted = checkReactions(t, id)        // 只查「新挂的 id」和身上已有的组合
  return reacted

checkReactions(t, id):
  if t.reactCd > 0: return []
  for r in REACTIONS where id ∈ {r.a, r.b} and 另一边在身上:
     执行 r；t.reactCd = cooldown；return [r.id]   // 一次只触发一个
  return []

updateStatuses(game, a):  每帧
  各计时 -1；积累值空闲超过 decayAfter 后每帧 -decay
  冻结中：流血暂停（clot）
  tick += 1；tick % every == 0 时结算跳伤：
     dmg = Σ 各叠层状态的跳伤（bleed 有中毒时 ×1.3），记进 lastTick
     主角：先过 absorbShield；敌人：乘 RESIST.boss.dot（首领）
     扣血走「状态伤害」入口：不加连击、不加风格分、不造成硬直、不打断；击杀照常算
```

**S-2 接入战斗**

- `applyHit`：命中成立（没被格挡、没被闪避）之后，主角打敌人时调用 `playerHitStatus`：
  ```
  for (状态, 来源列表) in game.stats.imbues:
     strength = min(3 × IMBUE_STRENGTH[1], √(Σ IMBUE_STRENGTH[lv]²))   // 平方和开方：单件等于它自己（1 件 2 档 = 9），多件递减，上限 18
     amount = HIT_TIER[招式级别] × strength
     addStatus(game, target, 状态, amount, 主角)
  ```
  招式级别：普攻 light、重击 / 上挑 heavy、技能 skill、必杀 ult。
- `calcDamage`：乘 `damageTakenMul(target)`。
- 主角受伤：先 `absorbShield`，再荆棘（近战时反弹，带血棘时给攻击者挂 1 层流血）。
- **首领替代**：首领永不冻结 / 麻痹。
  - 寒意满：霸体立即削 `bossArmor`（15%），积累清零；
  - 感电满：有读条时读条打断值 `+bossChannel`（3）；没读条时，当前出招的前摇变慢 20%。
- **AI**：`isControlled(e)` 时等同硬直：释放进攻名额（`attackers`）、打断前摇（麻痹）、不移动。
- **格挡不积累**：坚盾、屠夫格挡挡住的攻击不调 `playerHitStatus`。
- 破招：麻痹打断不算破招（不给破招奖励）。
- 主循环：每帧对主角和每个敌人调 `updateStatuses`。

**S-3 搭配**（`src/gear/synergy.js`）
- `buildSynergies(REACTIONS)`：
  - 每个「a、b 都是可施加状态」的反应生成一条 A 类：
    - 1 级：两种来源都有；
    - 2 级：一种在武器上、另一种在非武器槽，再加跨状态附加 30%。
  - 每种可积累 / 叠层的元素状态生成一条 B 类共鸣：来源 ≥ 3 件触发。
- 手写 C（系列搭配，首批 4 条，设计稿第十节）、D（流派搭配，3 条）。
- `evaluateLoadout(save)`：
  - 统计状态来源（翅膀 / 光幕不算），按 A → B → C → D 的优先级取，最多 6 条；
  - 「注意」列出 cauterize / clot 这类抵消组合；
  - 「差一点」列出再穿一件就能激活的条目。
- `computeStats` 输出 `synergies`。`rating.js` 里状态 / 套装 / 搭配的战力当量补上实际值（我在检查点 2 给数，先填 0.02 / 档、套装 2 件 0.03 / 4 件 0.06、搭配 0.02 / 条）。

**S-4 敌人来源**（只这四个，`ENEMY_SOURCES`）：
- 祭坛关的火焰（关卡机制火焰）命中 → 灼烧 1 层；
- 腐化司祭的诅咒 → 中毒 2 层；
- 屠夫斧伤 → 流血 1 层；
- 铁颚重击 → 流血 1 层。

**S-5 界面接口**：
- `evaluateLoadout` 的结果给角色页「生效状态」栏用（套装 / 搭配 / 注意 / 差一点四块，设计稿第五节）；
- 战斗 HUD 的状态图标位：素材到之前不画图标，只在反应触发时冒反应名字（现有的飘字）。

---

## 四、错误状态 / 边缘清单（逐条要有处理和测试覆盖）

1. **目标在状态结算前死亡 / 被移除**：`updateStatuses` 跳过 `!alive` 的目标；反应的范围伤害只打活着的敌人；不对已移除的对象写状态。
2. **状态伤害打死目标**：照常算击杀、掉落、经验；不算连击和风格分；不触发「击杀时」类刻印以外的打击感（不顿帧）。
3. **同一帧多个状态挂上**：反应一次只触发一个，按 REACTIONS 表顺序；冷却期间后来的组合不触发，但状态照常挂上。
4. **快照攻击力**：挂上时记攻击力，之后换装 / 战意结束不影响已挂的层；刷新时取新旧快照的较大值。
5. **主角死亡 / 复活 / 换关**：换关和回城清空主角和所有敌人的状态；死亡时清空。
6. **控制递减和脆化防无限连**：冻结 → 碎冰（脆化）→ 不能再冻；8 秒内再冻要 150%。
7. **首领**：任何时候 `isControlled(boss)` 都是 false；替代效果不能把霸体削到负数（最低 0，到 0 时照现有逻辑破防）。
8. **抗性为负**（骨兵怕火 -0.3）：放大，不出现负的积累；免疫（1）时直接返回，不触发反应。
9. **护盾超过上限**：截到最大生命 × 30%。
10. **吸血**：每秒回复上限 2% 最大生命；中毒时减半；不能吸状态伤害（只吸直接伤害）。
11. **翅膀 / 光幕**：不算状态来源、不算共鸣件数。
12. **旧存档**：没有 `status` 字段的对象由 `statusOf` 懒创建；存档里不存战斗状态。
13. **训练场木桩**：显示状态和反应名字，木桩不死（状态伤害对木桩按现有木桩规则）。
14. **帧率**：一屏 20 个敌人各挂 3 种状态时，`updateStatuses` 总耗时 < 0.5 ms / 帧（模块测试测）。
15. **素材没到**：规则全部生效，画面上不画状态特效；反应名字用现有飘字。

## 五、验收

- `tests/statustest.js`、`tests/synergytest.js` 全过；
- 全套照跑（以汇总表和退出码为准）；
- 浸泡两项照跑：首领动态难度会读状态战力当量，要看五关仍然打得过；
- 截图（训练场木桩挂各种状态、反应名字）；
- 帧率（边缘清单第 14 条）。
- 「好不好玩」待 Quinn 试玩。
