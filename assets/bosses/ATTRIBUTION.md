# 首领素材（ART_V4）

- 骸骨领主 `bone_lord`（68 帧）、祭坛守护者 `altar_warden`（60 帧）：项目作者提供（GitHub Release `assets-v4`：`boss_bone_lord_v1.zip`、`boss_altar_warden_v1.zip`）。原创设计，美术图由图像生成工具制作，再进行拆帧、配准与图集装配；并非任何现有游戏的官方角色或提取素材
- 本目录是由 `tools/build_sprites.py <素材包目录> bone_lord|altar_warden` 处理后的游戏用版本：桌面图集（256 格子）和手机图集（`_m`，192 格子）
- 首领图集只在自己那一关（或试炼里首领层的前一层）载入，离开就释放

# 首领素材（ART_V6）

- 夜鸦 `night_raven`（68 帧 + 道具图羽刃 `night_raven_feather`）、铁颚 `iron_jaw`（72 帧 + 道具图钩子 `iron_jaw_hook`、链环 `iron_jaw_link`）：项目作者提供（GitHub Release `assets-v6`：`boss_night_raven_v1.zip`、`boss_iron_jaw_v1.zip`，规格见 `docs/ART_V6.md`）。原创设计，美术图由图像生成工具制作，再进行拆帧、配准与图集装配；并非任何现有游戏的官方角色或提取素材
- 由 `tools/build_sprites.py <素材包目录> night_raven|iron_jaw` 处理：桌面图集（256 格子）、手机图集（`_m`，192 格子）；道具图原尺寸转 WebP，桌面和手机共用。和其他首领一样只在自己那一关载入
