# 特效素材（ART_V5）

- 特效贴图 26 张、绯隼与通用序列帧 12 组 90 帧、首领特效 4 组 30 帧：项目作者提供（GitHub Release `assets-v5`：`fx_textures_v1.zip`、`fx_hero_v1.zip`、`fx_boss_v1.zip`）。原创设计，由图像生成工具制作、再经灰度化、配准与打包；符文和法阵是抽象几何纹样，不含真实文字；并非任何现有游戏的特效或提取素材
- 本目录是由 `tools/build_fx.py <fx_textures_v1> <fx_hero_v1> <fx_boss_v1>` 处理后的游戏用版本：裁掉透明边打成图集；贴图桌面原尺寸 / 手机 50%，序列帧桌面 50% / 手机 25%；首领特效按首领分开（`fx_bone`、`fx_warden`），只在对应关卡载入
- 敌人特效第 1 批（贴图 7 张、序列帧 16 组 112 帧：状态光、弓手瞄准线和箭、地面预警、词缀、司祭）：项目作者提供（GitHub Release `assets-v8`：`fx_enemy_v1_common.zip`，sha256 `0d0c5604…7467a`，规格 `docs/ART_FX_ENEMY_V1.md`）。原创手绘设计，发光类为灰度、引擎染色；并非任何现有游戏的特效或提取素材。
  由 `tools/build_fx.py --enemy <fx_enemy_v1_common>` 处理成 `fx_enemy_tex`（贴图：桌面原尺寸 / 手机 50%，可平铺的两张不裁边）和 `fx_enemy`（序列帧：桌面 60% / 手机 30%，地面预警圈画得大，比别的序列帧多存一点）
- 敌人特效第 2 批（贴图 1 张、序列帧 15 组 100 帧：五种杂兵的预警 / 出招 / 命中 / 死亡）：项目作者提供（GitHub Release `assets-v8`：`fx_enemy_v1_types.zip`，sha256 `684fdd33…dfd7e7`）。原创手绘设计；并非任何现有游戏的特效或提取素材。
  由 `tools/build_fx.py --enemy <fx_enemy_v1_common> <fx_enemy_v1_types>` 处理成每种敌人一套 `fx_enemy_<grunt|brute|archer|priest|wing>`（桌面 50% / 手机 25%，按关卡里有的敌人载入），贴图 `ember_trail` 并进 `fx_enemy_tex`
- 首领「夜鸦」专属特效（贴图 4 张、序列帧 10 组 76 帧）：项目作者提供（GitHub Release `assets-v8`：`fx_boss_raven_v1.zip`，sha256 `4c6fadb5…`，规格 `docs/ART_FX_BOSS_RAVEN_V1.md`）。原创手绘设计；并非任何现有游戏的特效或提取素材。
  由 `tools/build_fx.py --boss raven <fx_boss_raven_v1>` 处理成 `fx_boss_raven`（贴图和序列帧同一套图集：贴图桌面原尺寸 / 手机 50%、`night_veil` 不裁边；序列帧桌面 50% / 手机 25%），只在夜鸦那一关载入
- 首领「铁颚」「残影」专属特效（铁颚：贴图 2 张 + 序列帧 10 组 76 帧；残影：贴图 3 张 + 序列帧 10 组 72 帧）：项目作者提供（GitHub Release `assets-v8`：`fx_boss_ironjaw_v1.zip` sha256 `c14d3fcb…`、`fx_boss_afterimage_v1.zip` sha256 `4bac1b59…`，规格 `docs/ART_FX_BOSS_IRONJAW_V1.md`、`docs/ART_FX_BOSS_AFTERIMAGE_V1.md`）。原创手绘设计；并非任何现有游戏的特效或提取素材。
  由 `tools/build_fx.py --boss ironjaw|afterimage <包目录>` 处理成 `fx_boss_ironjaw`、`fx_boss_afterimage`（同夜鸦包的打法；`chain_glow`、`rev_ribbon`、`streak_line` 不裁边），各自只在第 3 关 / 第 5 关载入
- 场景小件（火把火苗、南出口台阶、试炼碑刻纹；贴图 4 张 + 序列帧 1 组 8 帧）：项目作者提供（GitHub Release `assets-v8`：`fx_scene_v1.zip`，sha256 `3b45b413…`，规格 `docs/ART_FX_SCENE_V1.md`）。原创手绘设计；并非任何现有游戏的素材。由 `tools/build_fx.py --scene <fx_scene_v1>` 处理成 `fx_scene`（`stairs_down` / `stairs_glow` 不裁边以便对齐），一启动就载
