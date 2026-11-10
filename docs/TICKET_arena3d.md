# 工单：3D 全方位竞技场验证场景（arena3d）

背景：项目方向已定为全 3D（Quinn 2026-11-10）——不要 2D 纵深地图，要 3D 全方位完整地图。
本工单只做**方向验证场景**：一个 3D 墓穴竞技场 + 一名 3D 角色全方位移动 + 环绕相机，
证明「3D 全方位」的手感骨架成立。角色模型是图生 3D 管线的现成产物（蒙眼剑士），不是绯隼本人，
本工单不做美术精修、不做战斗系统。

## 交付物（只许动这些文件，不要碰 stage1/wing_proof 及其他已有文件）

1. `scenes/arena3d.tscn` — 根节点 Node3D，挂 `scripts/arena3d.gd`。
2. `scripts/arena3d.gd` — 全部逻辑（场景内容在代码里程序化构建即可，便于核验）。
3. 不要执行任何 git 操作（不 add/commit/push）。不要改 project.godot 的主场景。

## 场景规格

- **地面与建筑**：石板地面约 60×60（可用一张大 PlaneMesh + 深灰材质，或方块拼石板纹理感）；
  四周与场内布置石柱（CylinderMesh/BoxMesh）、断墙、拱门框（盒体拼）、碎石堆，
  构成一个可绕行的墓穴竞技场，角色能全方位走动、有遮挡与纵深。
  材质用 StandardMaterial3D 的纯色/粗糙度区分即可（石材灰、暗紫雾感），不要贴图依赖。
- **光影氛围**：WorldEnvironment 开雾（fog，暗紫灰）；一盏冷色 DirectionalLight3D 带阴影；
  4–6 盏暖色 PointLight3D 模拟火把（放在柱子旁，omni_range 约 6–9，能量偏暖橙）。
- **角色**：实例化 `res://art/models/heroine3d.glb`。
  先用代码量它导入后的 AABB，按高度缩放到约 1.7m，并把原点对齐到脚底（y 方向以 AABB 最低点贴地）。
  角色朝向：移动时平滑转身朝向移动方向（lerp_angle，速度约 10/s）。
- **移动（全方位）**：CharacterBody3D 或手动 Node3D 积分均可（推荐 CharacterBody3D + 简单 CollisionShape3D 胶囊；
  地面与柱子给 StaticBody3D 碰撞，角色不能穿柱、不能走出场地）。
  - WASD：相对相机朝向的全方位移动，速度 4.2 m/s；
  - Space：跳跃（初速 5.2 m/s，重力 9.8×1.6）；
  - 鼠标左键拖拽：环绕相机（yaw/pitch），滚轮缩放距离 4–10m；相机用 SpringArm3D 防穿墙；
  - 相机默认在角色后上方跟随。
- **输入读取**：直接用 `Input.is_key_pressed` 等原始接口，不要新增 InputMap 动作（保持与 stage1.gd 一致）。
- **演示与截帧（验收靠它，务必实现）**：
  - `--demo`：脚本驱动角色沿一个能展示全方位的路径行走（例如绕场多边形巡逻：先朝北、再朝东、再朝南、再朝西各走一段，
    中途有一次跳跃），相机缓慢自动环绕（yaw 随时间匀速转动），无需键盘。
  - `--capture`：在 t≈1.2 / 3.0 / 4.8 / 6.6 秒各截一帧存为 `shot3d_1.png` … `shot3d_4.png`（存到 res:// 根目录，
    用 `ProjectSettings.globalize_path`），最后一帧后 `get_tree().quit()`。
    截帧写法参考 `scripts/stage1.gd` 的 _process 截帧段（await RenderingServer.frame_post_draw 后取 viewport 图像）。
  - 无 `--demo` 时为手动模式（WASD/鼠标），同一套代码。

## 验收标准（Muse 会逐条核验）

1. 无头运行无脚本错误：`godot --headless --path . res://scenes/arena3d.tscn --quit-after 120` 输出无 SCRIPT ERROR / Parse Error。
2. Xvfb + opengl3 下 `--demo --capture` 能产出 4 张截帧；画面中：角色在 3D 场景内、比例正常（约 1.7m 对柱子）、
   地面/柱子/雾/暖光齐备；不同截帧里角色朝向与相机角度明显不同（证明全方位与环绕成立）。
3. 移动有碰撞：角色不穿柱、不出场（代码层面有碰撞体与场地约束即可，验收以截帧与代码走查为准）。
4. 代码可读：关键参数（速度/跳高/相机距离）集中为常量并带中文注释。

## 环境备忘（本机已验证的做法）

- 引擎：`~/workspace/tools/godot/Godot_v4.7.2-stable_linux.x86_64`（4.7.2）。
- 沙盒内不能监听端口、不能跑 git 提交；文件写完即可，提交由 Muse 做。
- GLB 已导入过（.import 在仓里），直接 load 实例化。
- 不要点任何外部网站/账号；本工单完全离线。
