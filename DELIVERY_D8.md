# DELIVERY D-8（Muse 实现：Codex/Claude 额度均耗尽，Quinn 已授权本版免审合并）

1. **立绘底图**（src/sprite.js）：heroSprite 的 full 映射 fullbody → front_base（assets/hero/feisun_front_base.webp，严格正面对称底图）；旧图保留未删。
2. **晨辉翅膀**（src/hub.js）：模块级 WING_ART 懒加载 + flapAngle 关键帧曲线（2200ms 周期，smoothstep）+ MOTE_SEEDS。drawPreview 在人物绘制前插翅膀层：触发 = equip.wings 且 CATALOG[def].series==='dawn' 且图就绪；装配按实测标定（根点相对人物框 (0.491, 0.235)、根距 ±0.044W、半翼宽 0.643W、源根点 (1024,172)/2048×300）；两段绘制：内段源宽 563 绕根点转 θ，外段源宽 461 绕 55% 轴点转 θ+lag（lag 由相位差 0.04 推导 ×1.1）；根部径向暗影；人物后画 28 颗金色光点（纯函数 of t，下压相位增亮）。其他系列不画（无占位）。
3. **触屏按钮**（index.html）：8 个 .tbtn 文本换 <img> 技能图标（attack/jump/dash/skill1-4/ult.webp），新增 .tbtn img 圆形裁切 CSS；aria-label 与状态类不变。
4. **HUD 技能格**（src/hud.js）：模块级 SKILL_ICONS 懒加载 skill1..4 图标；原 fillText(sk.glyph) 改为 drawImage（未学：alpha .28+灰度滤镜；未就绪状态：alpha .55；图片未就绪：不画），冷却扫层与 LV 文本保持原样，映射依据 = 循环变量 key（skill1..skill4）。
