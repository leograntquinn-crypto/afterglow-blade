# 工单 C4：传奇式斜俯视竖切（Y-sort 地图 + 八方向移动 / 战斗）

三件套：
- **设计说明**：本文第一～四节；
- **先行验收测试**：`tools/verify_c4.gd`（随本文入库）；
- **错误状态 / 边缘清单**：本文第五节。

验收测试 Codex 不改。如果测试脚本本身有语法错误跑不起来，报给 Claude 改，**不自行改判定**。

**派 Codex**：本文第二、三节的代码全部派 Codex；Muse 转交执行和本地实跑；Claude 终审。

## 〇、方向说明（先读）

- 路线已定：**2.5D、八方向精灵**、Godot、热血传奇式形态（Quinn 2026-11-10）。
- 分支上现有的 C1（`combat3d`，3D 战斗竖切）和 3D 模型保留作参考，**不在 C4 里扩展**。
- C4 沿用 C1 已验证的**战斗规则和数值**（帧数据、防连晕、顿帧、震屏），渲染换成 2D 精灵 + Y-sort。
- 绯隼八方向图集由 Muse 从 Codex 回收，**到位之前用分支里现有的侧视图集**（`art/hero/feisun*`、`art/enemies/grunt*`）打通逻辑。图集到位后只换数据，不改代码（第二节第 3 条的接口）。

## 一、坐标与投影（核心约定）

- **地面坐标**：逻辑都在地面平面上算，单位逻辑像素，`M = 48` 像素 = 1 米。
- **屏幕坐标**：屏幕 y = 地面 y × `ISO_K`，`ISO_K = 0.6667`（传奇式 3/4 俯视的纵向压缩，对应 48×32 的地块比例），屏幕 x = 地面 x。
- **物理**：Godot 2D 物理直接在屏幕坐标里跑（`CharacterBody2D`）。
  - 移动：输入方向在地面坐标里归一化，换成屏幕位移时 y 乘 `ISO_K`。所以「往上走」在屏幕上比「往右走」慢，这是传奇式俯视的正确观感。
  - 碰撞体：屏幕上的椭圆（胶囊横放），宽 0.6 米、高 0.6 × `ISO_K` 米。
- **距离和角度判定一律在地面坐标里做**：
  - 屏幕坐标先 `to_ground(v) = Vector2(v.x, v.y / ISO_K)`，再比距离和夹角；
  - 不许在屏幕坐标里直接比距离（会让上下方向的攻击距离短三分之一）。
- **八方向编号**（屏幕朝向）：0 东、1 东南、2 南、3 西南、4 西、5 西北、6 北、7 东北。由地面坐标的移动方向按 45° 扇区取整。

## 二、交付物与规格

新建文件。arena3d、combat3d、stage1 一律不改坏，复用优先于复制。

1. `scenes/iso_slice.tscn` + `scripts/iso_slice.gd`：场景总控。地图、Y-sort 容器、相机、顿帧、震屏、HUD、波次、演示和自检模式都在这里。
2. `scripts/iso_actor.gd`：主角和敌人共用的「八方向角色」基类：
   - 地面坐标换算、八方向朝向；
   - 精灵选帧（第 3 条）；
   - 受击闪白、击退、防连晕计数。
3. `scripts/dir_sprite.gd`：八方向精灵适配层（`AnimatedSprite2D` 的包装）。
   - `set_anim(anim, dir)`：图集里有 `<anim>_<dir>`（如 `run_ne`）就用它；
   - 没有时退回侧视图集：东半边（0、1、7）用原图，西半边（3、4、5）水平翻转，正南北（2、6）保持上一次的左右朝向。
   - 图集格式沿用 `atlas_anim.gd` 读的网页版 JSON。八方向图集只是动作名多了方向后缀，不需要新读法。
4. `scripts/iso_player.gd`、`scripts/iso_grunt.gd`：主角、腐骨兵，继承 `iso_actor.gd`。
5. **地图**：
   - `TileMapLayer`，矩形地块 48×32（屏幕像素），灰盒占位（两种灰色地砖贴图，注释标「正式版替换」）。
   - 场地 30 × 30 块，四周一圈墙（碰撞）。
   - 场内 6 根立柱：精灵 + 碰撞，原点在柱脚，参与 Y-sort。占位贴图标「正式版替换」。

### 数值（与 C1 一致，单位换算后）

| 项 | 值 |
|---|---|
| 主角移速 | 4.2 米/秒 = 201.6 地面像素/秒（八方向同速，斜向不更快） |
| 主角 HP | 100 |
| 三连斩 | 每段 22 帧；第 10 帧起可衔接下一段；第 6 帧接触判定；伤害 12 / 12 / 16；第三段是重击 |
| 攻击判定 | 地面坐标里以朝向为轴的扇形：距离 ≤ 2.1 米、半角 ≤ 70° |
| 攻击朝向 | 出招时取当前移动方向；没有移动输入时取朝向；**辅助瞄准**：朝向 ±45° 内 2.4 米以内最近的敌人，出招时朝向转到它所在的八方向扇区 |
| 主角受击 | 硬直 12 帧、击退 1.2 米、闪白 4 帧 |
| 腐骨兵 | HP 60；发现 14 米；走速 1.6 米/秒；2.0 米内开始蓄力 21 帧；挥砍判定 2.2 米、前方半角 60°、伤害 8；恢复到第 49 帧；冷却 46～84 帧（随机数种子 7） |
| 防连晕（一字不差移植） | 连击链窗 75 帧；硬直 = max(4, round(20 × max(0.4, 1 − 0.2 × (链数 − 1))))；第 4 次连续非重击触发挣脱 80 帧（霸体、不吃硬直）；重击永远打断 |
| 顿帧 | 轻击 6 帧、终结（第三段）8 帧；冻结双方逻辑与动画 |
| 震屏 | 每次命中 trauma +0.25，上限 0.6，每秒衰减 1.8；偏移 = trauma² × 18 像素 |

### Y-sort

- 所有角色和立柱放在同一个 `y_sort_enabled = true` 的容器里，**节点原点在脚底 / 柱脚**。
- 精灵用 `offset` 把脚底对准原点（网页版图集的 `pivot`）。
- 地图地块在容器之下（`TileMapLayer` 单独一层，不参与排序）。
- 效果：主角走到柱子上方（屏幕 y 更小）时被柱子挡住，走到下方时挡住柱子。

### 相机

- `Camera2D` 跟随主角，平滑 `position_smoothing_speed = 8`；
- 场地边缘限位；
- 震屏用 `offset`。

### 模式（必须实现）

- `--demo`：主角自动索敌（走向最近的活敌，进入 1.9 米自动出招），绕柱子走（简单的避障：被挡 10 帧就换一个 45° 方向）。
- `--capture`：t ≈ 1.5 / 3.5 / 5.5 / 8.0 秒截帧，存 `shot_c4_1.png`…`_4.png` 后退出。
- **测试接口**（验收测试直接调，必须有，名字不许改）：
  - `iso_slice.gd`：`const ISO_K`、`const M`、`var player`、`var actor_layer`（Y-sort 容器）、`var frozen`、`func spawn_enemy(ground_pos: Vector2) -> Node`、`func clear_enemies()`、`func set_test_mode(on: bool)`（关演示、关随机波次、关 HUD 动画）。
  - `iso_slice.gd` 另有：`var pillars`（立柱节点数组）。主角出生点在场地中央，**周围 4 米内不放立柱**（测试在这里跑八方向）。
  - `iso_actor.gd`：`var hp`（整数）、`var state`、`var dir`（0～7）、`var sprite`（它的 `dir_sprite`）、`func ground_pos() -> Vector2`、`func set_ground_pos(p: Vector2)`、`var chain_n`、`var break_t`、`var stun_t`、`func take_hit(dmg: int, dir: Vector2, heavy: bool)`（dir 是地面坐标方向）。
  - `iso_player.gd`：`var inp = { "move": Vector2.ZERO, "attack": false }`（测试直接写它驱动主角；`move` 是地面坐标方向）；`func can_hit(target) -> bool`（按当前朝向的扇形判定，倒地的目标返回 false）。
  - `iso_grunt.gd`：`var ai_enabled := true`（测试关掉 AI 用）；状态名用 `idle / walk / windup / strike / recover / hurt / down`。
  - `dir_sprite.gd`：`var flip_h_now`、`var anim_now`（当前实际播放的动作名和是否翻转）。

## 三、实现步骤（伪代码）

```
iso_actor._physics_process:
  if stage.frozen: 精灵暂停; return
  状态机推进（idle / run / attack / hurt / stun / down）
  移动：vel_ground = dir_vector × speed；velocity = Vector2(vel_ground.x, vel_ground.y × ISO_K)；move_and_slide()
  dir = sector8(vel_ground)（有移动时）

sector8(v):  i = round(atan2(v.y, v.x) / (PI / 4)) mod 8   # 0 东，顺时针（屏幕 y 向下）

hit_fan(attacker, target, reach_m, half_deg):
  d = to_ground(target.position − attacker.position)
  return d.length() ≤ reach_m × M and angle_between(d, dir_vector(attacker.dir)) ≤ half_deg

iso_player 三连斩：同 C1 player3d（ATTACK_FRAMES 22、CANCEL 10、CONTACT 6、DAMAGE [12, 12, 16]），判定换 hit_fan
iso_grunt AI：同 C1 enemy3d（距离用地面坐标），take_hit 的防连晕分支逐行照抄
```

## 四、验收

1. `godot --headless --path . --script res://tools/verify_c4.gd` 末行 `C4VERIFY PASS`（逐项见脚本）。
2. 全程无 `SCRIPT ERROR`；arena3d、combat3d、stage1 仍可无头运行无错（没被改坏）。
3. Xvfb + opengl3 下 `--demo --capture` 四帧齐全。Muse 人工看图：
   - 主角绕柱子时前后遮挡正确；
   - 八个方向都出现过；
   - 敌人有血条、被打有闪白。
4. 参数常量集中、中文注释；占位素材在注释里标「正式版替换」。

## 五、错误状态 / 边缘清单（逐条要处理）

1. **斜向更快**：地面方向向量必须先归一化再乘速度；验收测试会量八个方向的速度。
2. **屏幕距离代替地面距离**：所有距离 / 夹角判定先 `to_ground`。验收测试放一个正北 2.0 米的敌人，必须打得到。
3. **零向量朝向**：没有移动输入时 `sector8` 不能用零向量，保持上一次的 `dir`。
4. **扇区边界抖动**：输入方向恰好在 22.5° 边界附近来回时，朝向不能每帧翻。加 5° 的滞回：新方向离当前扇区中心超过 22.5° + 5° 才切换。
5. **侧视图集的南北方向**：没有八方向图集时，正南 / 正北保持上一次的左右翻转，不能每帧翻。
6. **Y-sort 原点错位**：精灵原点必须在脚底。验收测试检查角色节点在 Y-sort 容器里、`y_sort_enabled` 打开、精灵 `offset` 让 pivot 落在原点。
7. **顿帧期间的输入**：顿帧期间按下的攻击要缓冲，顿帧一结束就执行，不吞。
8. **顿帧期间的物理**：冻结时所有角色 `velocity = 0` 且不调 `move_and_slide`，敌人计时不推进。
9. **多个敌人同帧被打**：顿帧取最大，不累加；震屏累加但封顶 0.6。
10. **敌人死亡**：HP ≤ 0 立刻不再参与判定、不再攻击；倒地 60 帧后移除；不在 Y-sort 里留空节点。
11. **挣脱期间**：非重击只扣血不硬直，链数清零后重新计；重击照常打断（硬直按链数算）。
12. **主角被围**：主角受击硬直期间不能出招；主角 HP ≤ 0 时停止输入，显示「战败」。
13. **墙和立柱卡住**：贴墙斜走沿墙滑动（`move_and_slide` 默认行为），不能卡死；演示模式的避障规则见第二节。
14. **种子**：敌人冷却用固定种子 7 的随机数，验收可复现。
