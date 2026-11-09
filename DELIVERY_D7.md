# D-7 交付说明

分支：`hub-shell-d7`。修改 `index.html` 与 `src/hub.js`，素材和测试断言未改。

## 改动点与最终参数

- 新增通用 `.ibtn`：relative，56×56px，flex none，padding/border 0，50% 圆角，grid 居中，pointer 光标；背景为 `assets/ui/icons/btn_medallion.webp`，center / 100% 100% no-repeat。
- `::before` 内盘 inset 15%，50% 圆角；径向渐变 circle at 50% 38%，#251c33 → #110c18 74%；inset 0 1px 6px rgba(0,0,0,.85) 阴影。
- img 宽高 60%，contain，relative/z-index 1，pointer-events none；默认 brightness(.95)，filter 过渡 .15s ease；hover/focus-visible brightness(1.2)。焦点 outline 2px solid rgba(233,207,142,.7)，offset 2px。
- `.on img` brightness(1.22) 与 0 0 6px rgba(233,207,142,.5) 发光；`.dot::after` 为 7px ember 圆点，top/right 3px，z-index 2。
- `.sm` 44×44px；暂停钮 52×52px；`.off img` opacity .38，grayscale(.5) brightness(.8)。新增 `.sr-only` 裁剪工具类。
- `.tip` 左浮：right calc(100% + 10px)，top 50%，初始 translateY(-50%) translateX(4px)，悬停/键盘焦点归零横移；深色渐变背景、金色半透明 1px 边框、14px UI 字体、5px 10px padding、6px 圆角、z-index 40，opacity/transform .15s ease。
- `.tip.b` 下浮：left 50%，top calc(100% + 8px)，初始 translateX(-50%) translateY(-4px)，悬停/焦点纵移归零。粗指针隐藏全部 tip。

## 四处接入清单

1. 菜单 `.tabs.rail`：右下 fixed 18px/18px，竖排 gap 10px，背景 none、padding/border 0；移除 D-6 框背景和旧按钮/窄屏覆盖。角色、技能、委托、返回地图四钮分别使用 hero/skills/contracts/map 图标，汉字在 tip 与 aria-label 内。
2. `.hub-top`：音乐、剧情、设置改为 `.ibtn.sm`，下浮 tip.b；音乐状态文字移入 sr-only。唯一 JS 修改位于 render 原音乐文字更新处：更新 sr-only，并按 music.muted 切换 off。
3. `#world-bar`：右下 fixed 18px/18px，竖排 gap 10px，移除 top 定位及旧 .btn 背景；角色、技能、委托、剧情、设置五钮分别使用对应图标和左浮标签。原 world 场景显示条件保留。
4. `#pause-btn`：添加 ibtn，使用 pause 图标和原 aria-label；52px 圆形。定位与粗/细指针、play 场景 display 规则保留原义。

## 验收自查（逐项）

- **大地图五钮、左浮标签、打开对应菜单**：静态核对五个 data-menu、图标、中文标签、右下竖排与显示条件通过；原事件属性未改。实际悬停和点击未完成浏览器验收。
- **菜单四钮、选中发光、顶部三小钮、标签方向、音乐关闭变暗**：静态核对结构和 CSS 通过；原 on/dot 切换代码不变，音乐仅修改指定 render 位置。实际页签切换、焦点/悬停与音乐操作未完成浏览器验收。
- **粗指针暂停钮与点击暂停**：静态核对圆框、暂停图标、52px 尺寸及原显示/定位规则通过；实际触屏模拟与点击暂停未完成浏览器验收。
- **gearmodeltest、worldtest、settest**：已运行 `node tests/run_all.js --only gearmodeltest,worldtest,settest`，启动静态服务器失败：`listen EPERM: operation not permitted 127.0.0.1:8765`。另分别直接运行三个测试，均因 `Cannot find module 'playwright'` 失败。未修改测试断言，不能声明测试通过。
- **其他检查**：`node --input-type=module --check < src/hub.js` 与 `git diff --check` 通过。HTML 解析比对确认全部 id/data-* 属性保持一致；图像路径存在。自动比对确认 `.artframe`、`.hub-top`、`#hub`、`.tbtn`、`#hub-modal` 相关 CSS 与基线一致；暂停场景/指针规则未改；tests 与 assets 无 diff。纸娃娃、各面板 HTML 未改。

## 本地提交

已尝试 `git add index.html src/hub.js`，失败：`Unable to create '/home/hatch/workspace/hub_d7_repo/.git/index.lock': Read-only file system`。Git 元数据只读，无法暂存或本地提交。代码与本说明保留在工作区；未 push。
