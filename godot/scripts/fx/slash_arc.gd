extends Node2D
## 刀光：一段逐渐变细、变淡的圆弧（三层叠加：白色核心 + 两层彩色外圈）

var facing := 1
var radius := 64.0
var a0 := -2.0
var a1 := 0.9
var color := Color("7ff3ff")
var width := 13.0
var life := 9.0
var _t := 0.0


func _ready() -> void:
	var mat := CanvasItemMaterial.new()
	mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	material = mat


func _process(delta: float) -> void:
	_t += delta * 60.0
	if _t >= life:
		queue_free()
	queue_redraw()


func _draw() -> void:
	var k := 1.0 - _t / life
	for i in 3:
		var col := Color.WHITE if i == 0 else color
		col.a = k * (1.0 - i * 0.3)
		var r := maxf(4.0, radius - i * 7.0)
		var w := maxf(0.5, width * k * (1.0 - i * 0.25))
		# 朝左时把角度镜像
		var s := a0 if facing > 0 else PI - a0
		var e := a1 if facing > 0 else PI - a1
		draw_arc(Vector2.ZERO, r, s, e, 24, col, w, true)
