# 大地图素材（ART_V7）

- 地形 `world_terrain_v1`（4 张无缝地面、16 个地面贴花、6 块地图边缘）、地标 `world_landmarks_v1`（8 个地标 + 烽灯 + 封印）、散件 `world_props_v1`（24 个）、守灯驿的三个人 `npc_zhupo_v1` / `npc_moheng_v1` / `npc_ali_v1`（各 8 帧 + 头像 + 对话立绘）：项目作者提供（GitHub Release `assets-v7`，规格见 `docs/ART_V7.md`）。原创设计，美术图由图像生成工具制作，再进行拆帧、配准与图集装配；并非任何现有游戏的官方素材或提取素材
- 本目录是处理后的游戏用版本：
  - `tools/build_world.py <地形包> <地标包> <散件包>`：`terrain_*.webp`（无缝地面，手机 `_m` 一半）、`world_land*`（地标、烽灯、封印）、`world_props*`（散件、边缘、贴花）。桌面图集保留 2 倍原尺寸，手机一半；每块裁掉透明边，锚点和入口不变
  - `tools/build_sprites.py <NPC 包> npc_zhupo|npc_moheng|npc_ali`：`npc_*` 逐帧图集（桌面 256 格子、手机 192 格子）、头像、对话立绘（768 → 512）
- 地图素材只在地图上载入，进关时释放，回到地图再载入
