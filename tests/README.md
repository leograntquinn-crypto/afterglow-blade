# 回归测试（浏览器里跑的确定性测试 + 自动通关）

测试用 Playwright 打开游戏，在页面里直接驱动 `__game`。运行前需要 Node.js、Playwright 和对应的 Chromium。

```bash
# 在仓库根目录跑全套（约 40～60 分钟）
node tests/run_all.js

# 只跑指定脚本
node tests/run_all.js --only worldtest,efx2test

# 跳过长时间通关测试，从指定端口开始找空闲端口
node tests/run_all.js --skip soakd,soakd60 --port 8767

# 旧入口接受同样的参数
bash tests/run_all.sh --only worldtest_m
```

运行器会自行从仓库根目录提供静态文件，默认从 8765 开始尝试，遇到占用就向后找，并将实际端口通过 `PORT` 传给测试。顺序、参数和超时沿用原运行脚本。

- `--only` 和 `--skip` 接受逗号分隔的测试名。对于 `worldtest`、`wstorytest` 和 `w4arttest`，脚本名匹配桌面和移动两次执行，带 `_d` 或 `_m` 的名字只匹配一个版本。先按 `--only` 筛选，再应用 `--skip`。
- 超时、非零退出、输出中的大写整词 `FAIL` / `FAILED` 都算不过。以 `ERR ` 或 `PAGE ERRORS ` 开头的行，其余内容须为 `none`。
- `soakd` 和 `soakd60` 各须输出 5 行 JSON 通关记录，每行的 `scene` 须为 `clear`，`err` 须为 `null`。
- 每次执行的完整输出写入 `tests/out/<name>.log`，截图仍在 `tests/out/` 下。结束时打印测试名、结果、用时和不过原因。任一测试不过时退出码为 1。

已有静态服务器时也可单独运行测试，例如 `PORT=8767 node tests/efx2test.js`。不设置 `PORT` 时，测试连接 8765。
