# 残光之刃 · Godot 版

网页版原型（`../src/`）的玩法已经验证过，这里用 Godot 4 重建成正式版。

## 在 Mac 上打开

1. 到 https://godotengine.org/download/macos/ 下载 **Godot 4.3 或更新的 4.x**（选普通版，不要选 .NET 版），拖进「应用程序」
2. 把仓库下载到电脑（推荐用 GitHub Desktop），切换到 `godot-port` 分支
3. 打开 Godot → 点「导入」→ 选择本文件夹里的 `project.godot`
4. 第一次打开会花一点时间导入资源，然后按 **⌘B**（或右上角的 ▶）运行

## 操作

| 键盘 | 手柄（Xbox 布局） | 作用 |
|---|---|---|
| WASD | 左摇杆 / 十字键 | 移动（W/S 是纵深） |
| J | X | 攻击，连按三连斩 |
| W + J | 上 + X | 上挑浮空，再按 K 追击 |
| K | A | 跳跃（空中可以两段斩） |
| L | B | 闪避（前 14 帧无敌） |
| U | Y | 裂空斩 |
| F1 | | 显示判定框（绿 = 身体，红 = 攻击） |

## 项目结构

```
project.godot          项目配置
scenes/
  main.tscn            主场景（在编辑器里打开它，看整体结构）
  actors/              主角、敌人
  fx/                  火花、尘土、剑气（GPUParticles2D）
  world/               火把（粒子火焰 + 闪烁的点光源）
scripts/
  autoload/game.gd     全局：顿帧、震屏、连击、攻击令牌
  autoload/input_buffer.gd  按键映射（含手柄）+ 输入缓冲
  combat/              HitData / MoveData 资源定义、2.5D 判定
  actors/              Actor 基类、主角状态机、敌人 AI、占位模型
  fx/                  刀光、伤害数字、残影、剑气
  world/               场景美术、镜头
  ui/                  HUD、判定框调试
  main.gd              命中结算（打击感五件套）、特效工厂、音效池
data/moves/*.tres      ★ 招式帧数据：在检查器里直接改数字调手感
shaders/post.gdshader  后期：泛光、调色、暗角、颗粒
assets/                字体、音效、生成的贴图
tests/                 自动化测试
tools/                 一次性工具（生成招式数据、生成音效）
docs/ART_ASSETS.md     ★ 美术素材清单和 AI 生成提示词
```

## 和网页版相比，用了哪些 Godot 自带的功能

| 功能 | 网页版（手写） | Godot 版 |
|---|---|---|
| 光照 | 自己画光照图 | `CanvasModulate` 压暗 + `PointLight2D` 点光源 |
| 粒子 | 手写粒子数组 | `GPUParticles2D` + `ParticleProcessMaterial`，可在编辑器里调参 |
| 招式数据 | JS 对象 | `Resource`（`.tres`），检查器里可视化编辑 |
| 视差 | 自己算偏移 | `Parallax2D` 节点 |
| 纵深排序 | 每帧排序 | `y_sort_enabled` |
| 后期 | 离屏画布叠加 | 屏幕读取着色器（`hint_screen_texture`） |
| 固定帧率 | 自己写累加器 | `_physics_process` 固定 60 次/秒 |
| 手柄 | 无 | `InputMap` 原生支持 |

## 小练习

1. 打开 `data/moves/slash3.tres`，展开 `hits`，把 `stop`（顿帧）从 8 改成 20，运行游戏感受区别
2. 选中 `scenes/world/torch.tscn` 里的 `Flame` 节点，在检查器里改粒子的颜色和数量
3. 运行时按 F1，看攻击判定框是怎么和敌人的身体框重叠的

## 自动化测试

```bash
godot --headless --fixed-fps 60 --path . res://tests/run_tests.tscn
```

机器人会自动打 30 秒，检查击杀、连击、顿帧、浮空、波次是否正常。
Mac 上把 `godot` 换成 `/Applications/Godot.app/Contents/MacOS/Godot`。

## 进度

- [x] **第 1 步**：移动、三连斩、上挑、空中连击、冲刺攻击、闪避、裂空斩；腐骨兵 AI；光照、粒子、泛光；音效；测试
- [ ] **第 2 步**：搬运其余系统：全部技能、三种敌人、首领、成长、装备、技能树、存档、营地界面
- [ ] **第 3 步**：任务系统、地下城场景、首领战演出
- [ ] **第 4 步**：替换正式美术素材（见 `docs/ART_ASSETS.md`）
