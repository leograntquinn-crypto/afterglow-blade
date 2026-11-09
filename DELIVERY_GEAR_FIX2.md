# FIX-2 合并前修复交付

分支：gear-data-cp1。已阅读 REVIEW_GEAR_MERGE.md 的 B1/B2/B4 及非阻断建议。本次只处理指定四项；B3 词条数量/质量系数及其他裁定、比较、保底、目录构成均未修改。未 commit/push。

## 逐条对照

- FIX-1 / B1：删除 Hub.drawPreview 中装备翅膀时新增的第二段径向渐变与 fillRect。原背景渐变保留；glow_soft 的翅膀尺寸、alpha 增强保留。src/hub.js 的 createRadialGradient 为 1 次，与 683e9e2 一致。
- FIX-2 / B2：共用 canEngrave 判定 rar>=2，且定义非 fixed、kind 非 wings/veil。详情隐藏按钮，engrave 点击路径返回 false，engraveMark 写入分支在扣石/写 mark 前返回 false。renderModal 还会拒绝被直接设为 true 的铭刻页面状态。
- FIX-3 / B4：gearGlyph 未加载、加载失败、释放后返回空串；ready 缺图保留已有框。release 将图标替换为空文本，data-gear-glyph 也不再携带单字。槽位、背包、详情大图及铭刻大图共用此函数。HUD 拾取图标失败时不画字，装备名文案保留。全仓检索额外发现 loot.js 地面掉落物单字，已去掉，仅保留底座。aria-label 保留。
- FIX-4：newSave 初始 lv 从 2 恢复为 1。

## 附魔 / 状态写入核查

- src/items.js makeItem：生成状态及 opts 覆盖后已有 fixed 外观件清空 affix/mark/imbueLv 的防护，无需改变。测试加强为传入恶意 mark、状态和词条后仍为空。
- src/gear/migrate.js convert：旧字段转换原本可能按旧稀有度写 imbueLv=1；新增 fixed 或 wings/veil 的守卫，迁移生成外观件时 mark=null、imbueLv=0。非外观旧字段保留规则不变。
- src/hub.js onClick：未发现独立附魔/状态升级操作；唯一铭刻写入分支已拦截。
- src/gear/compare.js：imbueLv 只写入比较副本，不写回装备，不是附魔入口。
- src/progression.js computeStats：只读汇总，已有 fixed 排除；catalog 的外观定义 imbue=null。未对既有 v2 存档执行额外清洗。

## 文件清单

- src/hub.js：铭刻三个入口、铭刻页防御、移除翅膀代码光晕。
- src/gear/art.js：所有图集生命周期下无文字回退。
- src/hud.js：拾取提示图标不再回退文字。
- src/loot.js：地面掉落物不再画装备单字。
- src/gear/migrate.js：外观件迁移状态/刻印守卫。
- src/progression.js：新存档等级恢复。
- tests/gearmodeltest.js：测试更新。
- DELIVERY_GEAR_FIX2.md：本交付说明。

## 测试改动与验证

保留原有测试，反转 lifecycle 中释放后单字回退断言，补充未加载、释放后以及模拟加载失败时实际槽位/背包文字为空的断言；保留 ready 缺图时实际槽位/背包仅框无字断言。保留图集关闭保留、释放清引用及在途竞态断言。

新增桌面/手机测试：稀有翅膀与光幕详情无铭刻按钮；直接调用实际 onClick 的 engrave 和 engraveMark 分支均返回 false，mark 仍为 null、刻印石不变；强制铭刻页标志也无法显示写入按钮。

已执行所有修改 JS 文件的 node --check，全部通过；git diff --check 通过。按要求未运行 Playwright，因此新增浏览器断言未实跑，不宣称浏览器行为测试通过。

## 自定决定

- 将地面掉落物的装备单字视为同一禁止占位字要求，去掉字而保留底座，未新增代码绘制效果。
- 对迁移生成外观件的状态赋值补防护；不扩展为已有存档清洗，不调整普通装备迁移规则。
- 保留 itemGlyph 导出以避免无关 API 改动；全仓 JS 检索已无其可见渲染调用，剩余定义不会自行显示。
