# 特效素材（ART_V5）

- 特效贴图 26 张、绯隼与通用序列帧 12 组 90 帧、首领特效 4 组 30 帧：项目作者提供（GitHub Release `assets-v5`：`fx_textures_v1.zip`、`fx_hero_v1.zip`、`fx_boss_v1.zip`）。原创设计，由图像生成工具制作、再经灰度化、配准与打包；符文和法阵是抽象几何纹样，不含真实文字；并非任何现有游戏的特效或提取素材
- 本目录是由 `tools/build_fx.py <fx_textures_v1> <fx_hero_v1> <fx_boss_v1>` 处理后的游戏用版本：裁掉透明边打成图集；贴图桌面原尺寸 / 手机 50%，序列帧桌面 50% / 手机 25%；首领特效按首领分开（`fx_bone`、`fx_warden`），只在对应关卡载入
