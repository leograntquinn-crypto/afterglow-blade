class_name Actor
extends Node2D
## 主角和敌人的共同基类：2.5D 坐标、重力、影子。
##
## 2.5D 的做法：
##   gx = 左右位置，gy = 纵深（地面上的前后），z = 离地高度
##   节点本身放在「脚下的地面」上：position = (gx, GROUND_Y + gy)
##   画面（Visual 子节点）再往上抬 z —— 跳起来时影子留在地上
##   父节点开启 y_sort_enabled，Godot 自动按 position.y 排序：靠前的挡住靠后的

@export var w := 34.0
@export var h := 86.0
@export var max_hp := 100.0

var gx := 0.0
var gy := 0.0
var z := 0.0
var vx := 0.0
var vy := 0.0
var vz := 0.0
var facing := 1
var hp := 100.0
var hp_trail := 100.0
var state: StringName = &"idle"
var st := 0          ## 当前状态已持续的帧数
var flash := 0       ## 受击闪白
var invuln := 0      ## 无敌帧
var team := &"enemy"
var room_width := 1600.0

@onready var visual: Node2D = $Visual


func set_state(s: StringName) -> void:
	state = s
	st = 0


func place(x: float, y: float) -> void:
	gx = x
	gy = y
	sync_position()


func sync_position() -> void:
	position = Vector2(gx, Game.GROUND_Y + gy)
	if visual:
		visual.position.y = -z


## 通用物理：速度、重力、落地。落地时调用 on_land(落地速度)
func physics_step() -> void:
	gx += vx
	gy += vy
	if z > 0.0 or vz > 0.0:
		vz -= Game.GRAVITY * gravity_scale()
		z += vz
		if z <= 0.0:
			z = 0.0
			var v := vz
			vz = 0.0
			on_land(v)
	gx = clampf(gx, 30.0, room_width - 30.0)
	gy = clampf(gy, 0.0, Game.DEPTH)
	sync_position()


func gravity_scale() -> float:
	return 1.0


func on_land(_v: float) -> void:
	pass


## 屏幕上（世界坐标）身体中心的位置，给特效用
func body_point(height_ratio := 0.55) -> Vector2:
	return Vector2(gx, Game.GROUND_Y + gy - z - h * height_ratio)
