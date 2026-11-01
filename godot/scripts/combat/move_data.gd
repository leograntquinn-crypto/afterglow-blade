class_name MoveData
extends Resource
## 一个招式的完整帧数据。动作游戏的手感，很大程度上就是这些数字。

@export var id: StringName
@export var total := 22                 ## 招式总帧数
@export var cancel := 10                ## 从第几帧起可以取消进下一招（连招的关键）
@export var next_move: StringName       ## 普攻连段的下一招

@export_group("位移")
@export var lunge_from := 0
@export var lunge_to := 0
@export var lunge_speed := 0.0          ## 出招时向前踏步的速度

@export_group("动作")
@export var swing_from := -2.0          ## 武器挥动起始角度（弧度，0 = 正前方，负数向上）
@export var swing_to := 0.9
@export var air := false                ## 空中招式
@export var hang := 0.0                 ## 空中出招时的滞空
@export var jump_cancel := false        ## 可以用跳跃取消（上挑后追击）
@export var thrust := false             ## 突刺
@export var heavy := false
@export var anim: StringName            ## 换上素材后对应的动画名

@export var hits: Array[HitData] = []


func first_hit_at() -> int:
	return hits[0].at if hits.size() > 0 else 6


func first_hit_dur() -> int:
	return hits[0].dur if hits.size() > 0 else 4
