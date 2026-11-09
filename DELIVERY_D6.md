# D-6 交付说明

分支：`hub-shell-d6`。代码变更仅涉及 `index.html` 的样式与 nav class；未改任何 JS、测试断言或面板结构。

## 改动点

- `#hub` 改为 `background: transparent`，删除普通及 WebKit backdrop-filter；保留 fixed/inset/z-index/overflow，菜单层继续拦截点击。
- `.hub-top` 改为 `position: static`、`background: none`。其内 span、b、small、button 使用 `text-shadow: 0 1px 10px rgba(0,0,0,.85), 0 0 2px rgba(0,0,0,.9)`，选择器仅作用于顶部。
- nav 改为 `class="tabs rail"`，保留原横排 `.tabs` 规则。右下竖排仍使用原 data-tab、data-act，沿用 `.on` 的颜色与光晕；按钮取消底边，不依赖底边颜色表示选中。
- `.artframe` 大框、`#hub-modal` 遮罩、角色双面板、纸娃娃、装备浮层与属性翻板均未改。

## .tabs.rail 最终参数

- fixed；right/bottom 各 18px；z-index 6；flex column；gap 6px；margin 0；border-bottom none；border 0；border-radius 0；padding 16px 14px。
- 背景从上至下：四角、上下边、左右边、`var(--panel)`。素材全部来自 `assets/ui`。

| 层 | 素材 | 尺寸 | 定位 | 重复 |
| --- | --- | --- | --- | --- |
| 左上 | frame_corner_tl.webp | 40×40px | 0 0 | no-repeat |
| 右上 | frame_corner_tr.webp | 40×40px | 100% 0 | no-repeat |
| 左下 | frame_corner_bl.webp | 40×40px | 0 100% | no-repeat |
| 右下 | frame_corner_br.webp | 40×40px | 100% 100% | no-repeat |
| 上边 | frame_edge_h.webp | 55×13px | left 40px top 3px | repeat-x |
| 下边 | frame_edge_h_flip.webp | 55×13px | left 40px bottom 3px | repeat-x |
| 左边 | frame_edge_v.webp | 13×55px | left 3px top 40px | repeat-y |
| 右边 | frame_edge_v_flip.webp | 13×55px | right 3px top 40px | repeat-y |

按钮 font 为 20px var(--font-title)，padding 8px 16px，居中，border-bottom none，margin 0；红点 top/right 各 6px。返回地图位于最后，margin 8px 0 0，font 15px var(--font-ui)。

在 max-width: 680px 下，栏 right/bottom 各 10px，按钮 17px、padding 6px 12px；返回地图保留 15px，角饰仍为 40px。

## 验收自查（逐项）

1. **打开菜单、地图透出与按钮栏**：静态核对通过，#hub 无暗色背景及模糊，顶部背景透明，nav fixed 于右下且竖排。实际地图透出、框体观感及游戏点击拦截尚未完成浏览器验收。
2. **技能/委托切换、.on 跟随、返回地图**：静态确认 data-tab/data-act 与原事件逻辑未改，按钮仍沿用 .on/.dot 规则。实际点击验收未完成。
3. **D-5 两面板与素材框、390px 窄屏**：自动静态检查确认 .hero、.artframe、#hub-modal 规则与基线完全相同，HTML 除 nav class 外完全相同，所有框素材路径存在。已添加窄屏定位与按钮参数；390px 无溢出及两面板视觉效果尚未完成浏览器验收。
4. **node --check**：不涉及，未改 JS。`tests/gearmodeltest.js` 及全部测试断言未改。已运行 `node tests/run_all.js --only gearmodeltest`，失败原因是 `listen EPERM: operation not permitted 127.0.0.1:8765`。另运行 `node tests/gearmodeltest.js`，失败原因是 `Cannot find module 'playwright'`。因此无法声明浏览器及装备模型测试通过。
5. **其他检查**：`node tools/refpower.js` 通过，31/31 一致；`git diff --check` 通过。自动静态检查确认脚本不变、面板 HTML 不变、仅 nav class 改动。

无浏览器截图；上述运行环境限制阻止实际交互及窄屏视觉验收。

## 本地提交

已尝试 `git add index.html`，失败：`Unable to create .../.git/index.lock: Read-only file system`。Git 元数据只读，无法暂存及本地提交；未绕过权限，未 push。`index.html` 与本说明保留在工作区，待 Git 可写时一并提交。
