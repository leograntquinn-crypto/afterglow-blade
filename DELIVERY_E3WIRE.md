# E3 传说图标接入交付

工作分支：`gear-legend-wire`，基线 `main eb4b44c`。未 commit / push。

## 方案与自定决定

- 新增 `--legend <目录>`，读取传说包精简的 `gear.json`（36 个 id/name 条目）和 `icons/<id>.png`。校验数量、字段、id、去重、名称、PNG 清单一致性，并沿用 256×256、alpha、透明像素检查。
- 传说单独分组，按 id 排序，沿用无损 WebP、16 列、桌面 cell=128 / 手机 cell=64。索引并入现有 `gear_icons.json` / `gear_icons_m.json`，schema 不变；保留原 308 项并新增 36 项。无需第二次索引请求。
- `gearGlyph`、Canvas 共用现有 entry 与图集机制。目录 art.icon 优先，传说（lg_ 或目录 rar=4）可按目录 id 查找；不添加任何文字回退。
- 传说页载入失败可单独降级：普通图标与底板仍可用，传说只显示稀有度框。索引或普通资源整体失败仍沿用未就绪空白路径。
- 角色页发起加载、进关 release 清除引用与 DOM 图标、generation 防止在途加载恢复引用，全部沿用原生命周期。
- 全部素材校验、编码均在发布前完成，临时目录完整生成后才复制产物。沿用原发布方式；不承诺复制阶段发生系统 I/O 故障时多文件原子更新。

## 实际构建

```sh
python3 tools/build_gear.py --icons /home/hatch/workspace/gear_icons_src/a /home/hatch/workspace/gear_icons_src/b /home/hatch/workspace/gear_icons_src/c --legend /home/hatch/workspace/gear_legend_src
```

输出：344 icons / 5 frames。重复执行全部 gear 产物 SHA256 一致；原普通 WebP 与底板未变化。

## 产物清单与体积

| 文件（assets/fx/ 下） | 尺寸 / 内容 | 字节数 |
| --- | --- | ---: |
| gear_icons_legend_0.webp | 2048×384，36 张传说 | 418238 |
| gear_icons_legend_0_m.webp | 1024×192，36 张传说 | 132482 |
| gear_icons.json | 桌面完整索引，344 项 / 8 页 | 21987 |
| gear_icons_m.json | 手机完整索引，344 项 / 8 页 | 21705 |

## 文件清单

- `tools/build_gear.py`：传说输入校验及独立分组构建。
- `src/gear/art.js`：传说缺页独立降级、entry 缺页保护与目录 id 查找。
- `tests/gearmodeltest.js`：传说就绪与缺页断言更新。
- 上表两份 WebP、两份 JSON。
- `DELIVERY_E3WIRE.md`：本说明。

## 测试改动与验证

- 将原 lg_duanyue「就绪后只剩框」断言改为真实槽位、背包及直接 glyph 均有传说背景图，保持无文字与无障碍名称检查。桌面、手机共用该断言。
- 增加临时清空传说页引用后仅保留框且无文字的断言，随后恢复引用。
- 保留原未加载、加载失败、释放后无文字、在途释放及其他断言。
- 通过 Node 语法检查：art.js（module 模式）、gearmodeltest.js；通过 Python AST 语法检查。
- Python 自检：两份索引各 344 项、36 个 lg_ id、包含 lg_duanyue，全部坐标及 WebP 尺寸有效；重复构建 SHA256 一致；错误传说清单拒绝发布且原产物 SHA256 全部不变。
- 额外 Node 模拟 Image/fetch 自检通过（双分辨率）：普通/传说背景、Canvas 双层绘制、未加载/释放空白、传说页加载失败仅框且普通页保留、在途释放。该自检不等同浏览器视觉验证。

## 留终审事项

按工单未运行 Playwright。待终审运行更新后的浏览器断言，并检查桌面/手机传说图标实际观感、角色页切换及进关释放。源素材位于仓库外，复建需保留上述普通三包和传说包；源 PNG 未复制入仓库。
