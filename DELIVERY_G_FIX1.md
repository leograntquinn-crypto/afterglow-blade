# G_FIX1 模块测试修复交付

日期：2026-11-09。仓库：afterglow-blade；分支：gear-data-cp1。以 DELIVERY_G_CP3.md「与旧测试的冲突点」和 tests/out/gearmodeltest.log 的失败行为背景。

本轮修改只有 `src/gear/rules.js`、`tests/gearmodeltest.js`、`tests/gear.js` 和本说明。未 commit / push，未跑 Playwright 全套。coretest / contracttest / countertest、ravennighttest 及相关生产代码均未修改。

## 1. 标定：只改数据表

`RARITY` 改动如下；未列字段保持原值。

| 稀有度 | affixes 前→后 | quality 前→后 | 基础倍率 mul（不变） | mark（不变） |
|---|---:|---:|---:|---:|
| r0 普通 | 0→0 | 0→0 | 1 | 0 |
| r1 精良 | 1→1 | 0.8→0.8 | 1.15 | 0 |
| r2 稀有 | 2→5 | 0.9→0.9 | 1.30 | 0.4 |
| r3 史诗 | 2→7 | 1→1.7 | 1.42 | 0.7 |
| r4 传说 | 3→9 | 1.15→2.7 | 1.55 | 1 |

原问题包含两类方差：抽中属性不同，以及刻印出现与否。增加高档词条覆盖面，减少少数高收益属性是否抽中的影响；再递增质量系数，使相邻档增益更稳定。保留刻印概率及其打法语义。最高九条，十种属性中仍留一种供重铸替换。

`BUDGET`、全部稀有度基础倍率、`AFFIX_SHARE`、`AFFIX_MAX`、80%～100% 随机区间、强化系数、掉率、刻印概率及附魔等级表均不变。kinds / catalog 不变。compareItem / computeStats / power 及评级公式均不变。普通、精良生成数据不变，避免影响精良基准装的 REF_POWER。

### 胜率结果

每组 10000 对；数字为低档胜高档。LCG：seed=20261109，`seed=(Math.imul(seed,1664525)+1013904223)>>>0`。判胜仅计 better / much。轮换十种成长款式、ilvl 1/10/20/30、同强化 n%11；清空所有装备，只装备比较中的高档件，饰品使用 trinket1。

同时跑了两种 Node 复刻：

- 完整前序：直接提取 gearmodeltest 的 page.evaluate 测试体，依序执行第 1～6 条。canvas 占位与 tools/refpower.js 相同；localStorage 用 Map 占位，fixture fetch 从原 JSON 文件读取。保留原测试的随机消费顺序。
- 独立第 5 条：在进入抽样前设种子，预缓存 defsBy 的无变体候选池；候选顺序和抽样规则不变，缓存不消费随机数。

| 配对 | 工单上限 | Muse 旧日志 | Node 完整前序：前→后 | Node 独立第5条：前→后 |
|---|---:|---:|---:|---:|
| r0→r1 | 5% | 0（0%） | 0→0（0%） | 0→0（0%） |
| r1→r2 | 5% | 994（9.94%） | 1024→216（2.16%） | 1026→241（2.41%） |
| r2→r3 | 5% | 2524（25.24%） | 2531→306（3.06%） | 2536→322（3.22%） |
| r3→r4 | 5% | 1719（17.19%） | 1733→185（1.85%） | 1732→195（1.95%） |
| r0→r2 | 1% | 0（0%） | 0→0（0%） | 0→0（0%） |
| r1→r3 | 1% | 510（5.10%） | 517→4（0.04%） | 497→3（0.03%） |
| r2→r4 | 1% | 926（9.26%） | 922→0（0%） | 914→0（0%） |

两种复刻的最终七组均达标。Node 旧表结果与 Muse 旧日志不完全一致，分别保留原始数字，不宣称字节级复现浏览器随机序列；最终以 Muse 复跑真实测试为准。

硬约束自检：

- 第 3 条：原测试 80 项预算检查全部通过（5 档×4 等级×4 属性）。七槽基础预算未调整。
- 第 6 条：原测试 6 项检查全部通过，含精良+8 对史诗+0、反向结论、同强化折算、实例不变和三段合计。
- 第 1～6 条 Node 测试体最终无失败。
- `node tools/refpower.js` 只读执行通过，输出 `逐项一致：是（31/31）`，未重写 boss_scale.js。

临时复刻文件与结果在 `/tmp/gear-fix-sim.mjs`、`/tmp/gear-fix-exact.mjs`、`/tmp/gear-fix-before-exact.json`、`/tmp/gear-fix-after-exact.json`、`/tmp/gear-fix-after-isolated.txt`；不属于提交文件。完整前序提取方式：读取 tests/gearmodeltest.js，取 `const results = await page.evaluate(async () => {` 后至 `// 7：` 前的测试体，补上 finally 恢复 Math.random 及 return results，将相对动态导入改成仓库绝对 file URL。第5条本身未修改。

## 2. 页面错误：记录 URL，限制豁免

`tests/gearmodeltest.js` 新增：

- requestfailed：记录完整 URL 和 errorText。
- response：记录 HTTP >=400 的 URL 和状态码，并直接参与失败判定，不能因缺少控制台消息而漏判。
- console error：记录 message.location().url 与原始消息。
- 桌面/手机分别输出 `9 资源失败 URL <mobile> <JSON>`，豁免项也保留诊断记录。

实际已抓到的 404 请求目标是 **`/favicon.ico`**，来源是工作区已有的 `/tmp/game_http.log` 第126、167行：

```text
127.0.0.1 - - [09/Nov/2026 19:30:51] "GET /favicon.ico HTTP/1.1" 404 -
127.0.0.1 - - [09/Nov/2026 19:30:56] "GET /favicon.ico HTTP/1.1" 404 -
```

该访问日志仅有相对 URL，没有 Host/端口。按 gearmodeltest 默认入口展开为 `http://localhost:8765/favicon.ico`；此完整 URL 是按配置还原，不能冒充原日志实录。日志中只有这两次 404，归类为浏览器 favicon 请求，不是游戏图集/脚本/数据路径错误，因此未修改游戏资源引用。

证据边界：旧 tests/out/gearmodeltest.log 只有无 URL 的 console 文本，不能据此证明其中两条 404 与上述访问日志逐条对应。本轮已补齐 URL 采集；真实模块复跑仍需核对新增 URL 输出。未以“所有404都是favicon”为前提扩大豁免。

判定规则只豁免：

1. 与 tests/run_all.js 同口径、完整匹配 `Failed to load resource: net::ERR_[A-Z_]+` 的资源控制台消息；requestfailed 对应的 net::ERR_* 同样豁免。
2. HTTP 404 且 URL pathname 严格等于 `/favicon.ico`。favicon 的其他 HTTP 状态不豁免。

其他 HTTP 错误（包括外部字体 HTTP 404）、游戏自身资源 404、普通 console error、pageerror 和未知请求错误仍失败。URL 缺失的 404 控制台消息也不会被豁免。

已用 Node 直接执行新增事件回调验证：网络层失败、favicon 404 可豁免；游戏素材/数据 404、favicon 500、JS console 错误、pageerror、未知 requestfailed 全部仍计入错误。

本沙箱禁止创建监听 socket（本地 HTTP 服务启动返回 Operation not permitted），未进行新一轮浏览器抓包，也未运行浏览器模块测试；以上 favicon 定性使用已有实抓访问日志，非本轮新抓包。

## 3. tests/gear.js 适配清单

以下行号为修改后的文件行号：

| 行 | 修改 | 原因与保留含义 |
|---|---|---|
| 14 | `s.equip.ring` → `s.equip.trinket1` | 真实饰品槽参与模型和详情页，精良旧件仍为+7传承来源。 |
| 15 | `makeItem('ring',14,3)` → rar4；去掉手工 `mark='air'` | 继续使用传说样本；由工厂真实生成必带刻印，避免手工赋值掩盖质量错误。原用例未对 air 的具体战斗效果作检查。 |
| 16 | 增加 rar4、九词条、非空 mark 断言 | 按本轮新表守住传说品质前提；三词条已不是新表的传说口径。 |
| 26 | 更新重铸注释 | 仍连续重铸第1条三次；九词条保留一个候选属性，仍可检查不重复与 reforged 计数。 |
| 31 | `equip.ring.enh` → `equip.trinket1.enh` | 传承后检查真实来源旧件归零。 |
| 32 | 明确断言新件+7、旧件+0 | 把原输出检查的传承含义变成失败条件，未改变检查目标。 |

原重铸三次、词条互异输出、锁定后出售禁用检查、精良及以下批量出售、锁定和强化件保留流程均保留。armor / ring 的工厂兼容调用继续使用；本轮未机械替换有效兼容入口。

## 自定决定与留终审事项

自定决定：高档采用5/7/9词条，并把史诗/传说质量调为1.7/2.7；保留精良和 REF_POWER，保留刻印概率。九词条刻意不占满十种属性，以维持旧重铸用例。资源错误采用事件与控制台双重采集；重复诊断允许保留，避免漏判。

影响：新生成/重铸的高档装备词条明显增多、增益提高，已存实例不会自动补词条或改写词条数值。此数据选择满足本次标定目标，但高档整套体验、详情页长词条列表仍需真实模块复跑与终审观察；未扩大到其他模块改动。

自检完成：三个修改的 JS 文件均通过 `node --check`；`git diff --check` 通过；Node 标定、第3/6条和 REF_POWER 结果见上。未运行 Playwright 全套，未 commit / push。

留 Muse/终审：复跑真实 gearmodeltest，确认第5条实际胜率、第9条桌面/手机的 URL 日志与严格过滤；复跑 tests/gear.js 的页面传承、重铸和锁定出售流程。若新 URL 输出显示游戏资源404，仍应失败并修路径，不能沿用 favicon 定性。CP3 其他终审事项及 ravennight 定性不在本轮处理范围。
