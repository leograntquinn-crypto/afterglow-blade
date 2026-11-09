# D-5 素材外框交付

分支：`hub-frame-d5`。未 push。实现已保留在工作区；浏览器验收及本地提交受环境限制，未完成。

## 改动文件

- `index.html`：新增 `.artframe`，置于 `.sheet` 规则之后，以覆盖面板及详情卡片原背景、边框、圆角和内边距。
- `src/hub.js`：只增加三个模板元素的 `artframe` class，无 JS 行为逻辑变动。
- `DELIVERY_D5.md`：本交付说明。

## `.artframe` 最终参数

背景由上至下为四角、上下边、左右边、既有 `var(--panel)` 渐变底色。素材均直接使用 `assets/ui/*.webp` 相对路径；未新增装饰图形或渐变，未改懒加载。

| 层 | 素材 | 显示尺寸 | 位置 | 重复 |
| --- | --- | --- | --- | --- |
| 左上 | frame_corner_tl.webp | 92×92px | 0 0 | no-repeat |
| 右上 | frame_corner_tr.webp | 92×92px | 100% 0 | no-repeat |
| 左下 | frame_corner_bl.webp | 92×92px | 0 100% | no-repeat |
| 右下 | frame_corner_br.webp | 92×92px | 100% 100% | no-repeat |
| 上边 | frame_edge_h.webp | 141×29px | left 92px top 6px | repeat-x |
| 下边 | frame_edge_h_flip.webp | 141×29px | left 92px bottom 6px | repeat-x |
| 左边 | frame_edge_v.webp | 29×141px | left 6px top 92px | repeat-y |
| 右边 | frame_edge_v_flip.webp | 29×141px | right 6px top 92px | repeat-y |

`border: 0`、`border-radius: 0`、`padding: 42px`；`background-clip` 使用默认 `border-box`。未使用 ±3px 微调，全部采用工单原值。`.hero` 仍为 880px 居中，两列等宽及拉伸等高规则未改。

## 应用点

1. 角色立绘：`.panel.figure.artframe`。
2. 背包：角色页的第二个顶层 `.panel.artframe`。
3. 装备详情：`renderModal` 普通详情分支最外层 `.sheet.artframe`。

属性翻板 `.stats-pop > .panel` 未加框；铭刻选择分支 `.sheet.wide` 未加框。装备格单层稀有度框、纸娃娃、悬停浮层、属性翻板触发及所有操作逻辑未改。

## 验收自查（逐项）

1. **角色页默认态**：静态核对四角素材及定位、四边朝内所需素材映射、背景层顺序和内容内边距。实际框体完整性、平铺接缝及槽位/背包格/标题是否避开角饰，尚未完成浏览器视觉验收。
2. **详情弹窗打开态**：静态核对 `.sheet` 获得素材背景及 42px 内边距，关闭和操作按钮模板不变。框体完整及按钮不受遮挡，尚未完成浏览器视觉验收。
3. **390px 手机宽**：原两面板堆叠与触屏槽位规则保留。框体完整、角饰无溢出及内容避让，尚未完成浏览器视觉验收。
4. **`tests/gearmodeltest.js`**：断言和测试文件均未改。已运行 `node tests/run_all.js --only gearmodeltest`，服务器启动失败：`listen EPERM: operation not permitted 127.0.0.1:8765`。另外使用本机 Playwright 模块路径直接运行测试，输出 `GEARMODELTEST FAIL 2`：子进程 `spawnSync /usr/bin/node EPERM`，以及 Playwright 所需 `chromium_headless_shell-1193` 不存在。因此不能宣称 gearmodeltest ok；需在可运行浏览器和本地服务器的环境重跑。

浏览器补充尝试：`/opt/meta-chromium/chrome` 因缺少必需的 Hatch WebGL domain policy 无法启动；缓存的 Chromium 1254 启动报 `setsockopt: Operation not permitted` 并以 SIGTRAP 退出。

**截图路径：无实际截图，因上述浏览器限制无法生成。** 待补拍建议路径为 `tests/out/d5-hero-desktop.png`、`tests/out/d5-detail-desktop.png`、`tests/out/d5-hero-mobile-390.png`（分别记录立绘和背包，可分两张）、`tests/out/d5-detail-mobile-390.png`；这些是待生成路径，不是已交付截图。

其他检查：`node --check src/hub.js` 通过；`node tools/refpower.js` 通过（31/31）；`git diff --check` 通过。

## 本地提交

已尝试 `git add index.html src/hub.js` 和 `git commit -m "Use supplied artwork for hero panels and equipment detail frame"`，均失败：`Unable to create .../.git/index.lock: Read-only file system`。未修改仓库权限，未 push，全部变更保留在工作区。本说明同样保留在工作区，待可写 Git 环境一并提交。
