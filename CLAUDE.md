# 残光之刃 / Afterglow Blade — 仓库约定（开工先读）

原创 2.5D 动作游戏。当前是网页版（原生 JS ES 模块 + Canvas，`index.html` 直接打开），**路线已定**：2.5D、八方向精灵、迁 Godot（`godot/` 目录），热血传奇式形态。渲染路线不再讨论。

## 分工与工作规范（Quinn 定，长期执行）

- **Claude**：设计与规格、伪代码、边界 / 错误状态清单、终审、合并、测试结论、手感判断。额度优先花在这些上，**不闷头写大批代码**。
- **Codex**：按工单写代码（本地沙箱只写代码，不提交、不开端口）；按规格生成素材。
- **Muse**：转达 Quinn、核验素材与代码、派单、提交推送、本地跑测试。
- **工单三件套，缺一不下发**：设计说明 + 先行写好的验收测试 + 错误状态 / 边缘清单。规格和工单写进 `docs/` 留档。
- **调试走证据包**：完整日志 + 截图 + 复现步骤，按控制流定位，不猜。
- **模块级测试**：模块做完统一测一次（全套 + 新测试 + 截图 + 帧率），问题汇总一轮改完再测。检查点只看代码方向。素材按批验收。
- **「全过」以测试运行器的汇总表和退出码为准**。运行被打断就用 `--only` 补跑剩下的，拿到汇总表才算。
- 测试失败或问题清不掉：先说清楚再处理，不静默跳过。「好不好玩」一律标未验证，等 Quinn 试玩。
- 每次计划 / 汇报都提前列出接下来要的素材包（包名、顺序、对应哪项工作），让 Codex 并行备料。

## 铁律

- **绯隼外形**：银白单马尾 + 黑蝴蝶结配红飘带、白色短外套、红腰带、深色长裤、黑色高筒靴。任何主角素材都按这个验收。
- **原创**：不照搬任何现有游戏的角色、美术、关卡。
- **第 14 项**：特效、场景一律用成品素材，**不写代码画的形状**。素材没载好时不画（允许退回已载入的成品素材）。
- **质量铁律**：真特效、真动画，**禁止同形换色**。状态特效每种独立造型和动态；装备档位和变体是造型本身的变化；系列靠「造型母题 + 纹样 + 配色」区分。验收时去色看灰度。
- **不卖数值**：装备只从掉落、首领、试炼、委托来；翅膀 / 光幕一律攻击 +10，稀有度只决定外观和手感。PVP 场外装备不进场（数据里只留开关）。
- 能调的数值放数据表（`src/fx_data.js`、`src/gear/rules.js`、`src/boss_identity.js` 的 `IDENTITY` 等），逻辑只按表执行。
- 不提前做职业系统 / PVP 的实现（只留字段）；敌人 AI 第 4 轮独立调校暂缓。

## 测试

```bash
node tests/run_all.js                      # 全套（约 25 分钟，自带服务器，从 8765 起找端口）
node tests/run_all.js --only a,b --skip c  # 部分
```

- 日志在 `tests/out/<名字>.log`，最后打印汇总表，任何一项不过退出码为 1。
- 网络层资源失败（`net::ERR_*`，没外网时字体拉不到）不算失败；HTTP 状态错误和页面脚本报错照算。
- 截图对比：`node tools/fxsheet.js tools/fxsheet_cases/<x>.json out.png --port 8767 --compare 8771 [--mobile]`（敌人 / 首领招式）；`node tools/sceneshot.js`（场景）。
- 新测试写成 `tests/<名字>.js`，最后一行 `<NAME> ok` / `<NAME> FAIL n`，并加进 `tests/run_all.js`。

## 管线顺序

1. Claude 写规格（`docs/ART_*.md` 素材 / `docs/DESIGN_*.md` 设计 / `docs/CODEX_TICKETS_*.md` 工单）。
2. 素材：Muse 派 Codex 生成 → 先交 `docs/preview.png` → 审过出全量 → Muse 核验上传 GitHub Release → Claude 用 `tools/build_*.py` 建图集、接入。
3. 代码：Muse 派 Codex → 检查点看方向 → 模块做完 Muse 提交推送分支 → Claude 终审（代码 + 全套 + 截图 + 帧率）→ 合并 main → 发布网页版。
4. 提交说明结尾带 Co-Authored-By / Claude-Session 两行；不写模型名。

## 目录速查

- `src/main.js` 游戏主循环与结算（`calcDamage` / `applyHit`）；`src/boss.js`、`src/boss_moves.js` 首领；`src/boss_fx.js` 首领特效画法；`src/boss_identity.js` 首领身份机制；`src/fx*.js` 粒子与特效；`src/items.js`、`src/gear/`、`src/progression.js` 装备与成长；`src/hub.js` 角色页。
- 设计与审计总表：`docs/AUDIT_PRE_GODOT.md`；装备：`docs/DESIGN_EQUIPMENT.md`。
