# D-3 单层装备框与缺图呈现交付

分支：gear-data-cp1。已阅读 DELIVERY_D1.md / DELIVERY_D2.md 并核对现行渲染。未 commit / push。

## 逐条对照

1. 已填充槽位与背包格子的自身 border / background / border-radius / box-shadow 清空，保留原 gearGlyph 图集与稀有度框 100% 铺满方式；视觉框由素材提供，图标尺寸与位置逻辑不变。
2. hover 使用 brightness(1.18)，详情打开的装备通过 is-selected 使用稀有度色 drop-shadow 外发光，关闭详情清除选中状态；hover 与选中可叠加。强化、比较、刻印及锁角标的位置和样式不变。
3. 空槽与空背包格继续使用原浅色虚线、底色与圆角占位，空槽仍 disabled。
4. 图集 ready 时，缺少图标的装备只输出满格稀有度框，内部透出深色面板，不输出汉字或其他字符；槽位与背包的 aria-label 仍保留装备名。详情共用该渲染路径。没有添加 E3 图标或数据。
5. 图集整体未加载时保持 D-1 的 itemGlyph 降级。缺图框的释放替换值为空，避免资源释放时为该节点重新引入文字。图集载入、释放与竞态控制逻辑保持原样。
6. D-1 布局与容器查询、D-2 悬停浮层、G 数据与公式、战斗代码均未修改。

## 文件清单

- `index.html`：清除已填充格子的外框，保留空格占位，增加 hover / 选中滤镜。
- `src/gear/art.js`：断开图集就绪时缺图装备的字形回退，输出仅素材框的空内容节点。
- `src/hub.js`：打开 / 重新渲染详情时同步选中格子，关闭时清除。
- `tests/gearmodeltest.js`：第 9 条追加单框与缺图断言。
- `DELIVERY_D3.md`：本交付说明。

## 测试改动与自检

第 9 条原有断言全部保留，新增：

- 桌面 / 手机图集 ready 后，所有已填充槽位与背包格子的计算样式 border-top-style 为 none 或 border-top-width 为 0。
- 已填充格子的 .gearGlyph / .glyph 无文本内容，覆盖直接文本回退与回退节点。
- 临时将缺图传说装备放入槽位与背包，断言两处保留装备 aria-label、存在稀有度框节点且 glyph 文本为空；随后恢复原样本，原几何与饰品断言继续执行。
- 原生命周期 missing 断言发生在 release 后，继续验证图集整体未加载的 D-1 降级；新增断言覆盖 ready 状态的缺图行为。

已执行 `node --check src/hub.js`、`node --check src/gear/art.js`、`node --check tests/gearmodeltest.js` 与 `git diff --check`，均通过。按要求未运行 Playwright；新增浏览器断言尚未执行。

## 自定决定

选中状态使用格子上的 class，直接跟随当前详情装备 id；不增设边框。缺图素材框内部透出已有深色面板，不另加可能形成第二层盒子的底板。若图集 ready 但对应稀有度框也不可用，则输出空内容，仍不生成文字回退。新增缺图节点仍标记 data-gear-icon，使原 release 清除 CSS 图片引用的机制继续适用。

## 留终审事项

获准运行浏览器后执行第 9 条；人工核对桌面 / 手机单层素材框、缺图传说深色空心、普通图标占格、选中与 hover 发光、角标位置及空格虚线。继续核对 D-2 浮层与详情点按，以及图集未加载 / 释放时原有降级。E3 到位后的数据接入另行处理。
