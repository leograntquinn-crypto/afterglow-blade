extends Node2D
## 火把：托架 + 火焰粒子 + 会闪烁的 2D 点光源

@export var color := Color(1.0, 0.67, 0.32)
var _seed := randf() * 100.0

@onready var light: PointLight2D = $Light


func _ready() -> void:
	light.color = color


func _process(_delta: float) -> void:
	var t := Time.get_ticks_msec() / 1000.0 * 60.0 + _seed
	var fl := 0.85 + sin(t * 0.31) * 0.1 + sin(t * 0.73) * 0.06
	light.energy = 1.15 * fl
	light.texture_scale = 2.4 + fl * 0.3
	queue_redraw()


func _draw() -> void:
	draw_rect(Rect2(-4, 12, 8, 20), Color("1a1210"))
	draw_rect(Rect2(-9, 8, 18, 6), Color("1a1210"))
