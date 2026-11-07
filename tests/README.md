# 回归测试（浏览器里跑的确定性测试 + 自动通关）

所有测试都用 Playwright 打开本地服务器上的游戏，在页面里直接驱动 `__game`。

```bash
# 1. 在仓库根目录起一个静态服务器（测试默认连 8765；可以用 PORT=… 改）
python3 -m http.server 8765
# 2. 另开一个终端跑全套（约 40～60 分钟），最后一行是 ALLDONE
bash tests/run_all.sh
```

- 判定：每个测试输出里出现 `FAIL` / `FAILED` / 页面报错（`ERR` 后面不是 `none`、`PAGE ERRORS` 后面不是 `none`）就算不过；`soakd` / `soakd60` 每关一行 JSON，`scene` 要是 `clear`、`err` 要是 `null`。
- 截图、日志写到 `tests/out/`（不进仓库）。
- 单个跑：`node tests/efx2test.js`（`PORT=8767 node …` 连别的端口）。
- 这些脚本原来在开发会话的临时目录里，子轮 G 起搬进仓库，方便 Codex / Muse 跑机械核验。整理成统一的运行器（退出码、汇总）见 `docs/CODEX_TICKETS_H.md` 的 H-0。
