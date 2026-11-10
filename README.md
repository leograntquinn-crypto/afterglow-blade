# Afterglow Blade — Godot 主线工程

网页版（Canvas2D）渲染到顶后立项：Godot 4.7.2，工程骨架 + M1 翅膀蒙皮样例。
迁移计划见目标文件 GODOT_MIGRATION_PLAN.md（里程碑 M0–M7）。

- `scenes/wing_proof.tscn` — M1 样例：Skeleton2D 5 骨 + Polygon2D 权重蒙皮挥翅（晨辉侧翼）。
  无头自检：`godot --headless --path . --quit-after 90`；截帧验证：`-- --capture`（Xvfb + opengl3）。
- `art/wings/` — 网页版侧翼主图原件（复用，不重画）。
- `data/`、`scripts/`、`scenes/` — 后续系统与场景。

引擎与导出模板在 ~/workspace/tools/godot/（4.7.2-stable）。
