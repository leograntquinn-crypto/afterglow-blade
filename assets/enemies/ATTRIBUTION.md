# 敌人素材

- 腐骨兵 `grunt`、铁甲屠夫 `brute`、影弓手 `archer`：项目作者提供（GitHub Release `assets-v3`：`enemy_grunt_v1.zip`、`enemy_brute_v1.zip`、`enemy_archer_v1.zip`）。原创设计，美术图由图像生成工具制作，再进行拆帧、配准与图集装配；并非任何现有游戏的官方角色或提取素材
- 本目录是由 `tools/build_sprites.py <素材包目录> grunt|brute|archer` 处理后的游戏用版本（缩小、打图集、走路帧稳身偏移）
- 手机版图集 `*_m`（192 格子，内存约为桌面的 56%）由同一个脚本生成，像素来源相同
- 灰烛司祭 `ashpriest`（48 帧）、烬翼 `emberwing`（32 帧）：项目作者提供（GitHub Release `assets-v6`：`enemy_ashpriest_v1.zip`、`enemy_emberwing_v1.zip`，规格见 `docs/ART_V6.md`）。原创设计，美术图由图像生成工具制作，再进行拆帧、配准与图集装配；并非任何现有游戏的官方角色或提取素材。由 `tools/build_sprites.py <素材包目录> ashpriest|emberwing` 处理；这两套按关卡载入（烬翼第 2 关起、司祭第 3 关起，试炼提前一层载入），回营地释放
