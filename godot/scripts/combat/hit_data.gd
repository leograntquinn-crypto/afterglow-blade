class_name HitData
extends Resource
## 一次攻击判定。所有时间单位都是「帧」（60 帧 = 1 秒）。
## 在编辑器里选中一个招式 .tres，展开 hits 就能直接改这些数字。

@export_group("时机")
@export var at := 5            ## 招式第几帧开始生效
@export var dur := 4           ## 持续几帧

@export_group("判定框（相对角色，x 为朝向前方的偏移）")
@export var box_x := 48.0
@export var box_w := 92.0
@export var box_d := 30.0      ## 纵深方向的容差
@export var box_z0 := 0.0      ## 高度下限
@export var box_z1 := 100.0    ## 高度上限
@export var abs_z := false     ## 以地面为基准（震地类技能）

@export_group("效果")
@export var dmg := 10.0
@export var kb := 2.5          ## 击退
@export var launch := 0.0      ## 浮空力度
@export var stun := 20         ## 硬直帧
@export var stop := 4          ## 顿帧
@export var shake := 2.0       ## 震屏
@export var heavy := false     ## 重击（更大的火花、更重的音效）
@export var spike := false     ## 向下砸，落地反弹
@export var radial := false    ## 以自身为中心向外击退
