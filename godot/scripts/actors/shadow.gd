extends Node2D
## 脚下的影子：角色跳得越高，影子越小越淡

func _process(_delta: float) -> void:
	queue_redraw()


func _draw() -> void:
	var a: Actor = get_parent()
	var s := 1.0 - minf(a.z, 220.0) / 300.0
	draw_set_transform(Vector2.ZERO, 0.0, Vector2(1.0, 0.22))
	draw_circle(Vector2.ZERO, a.w * 0.8 * s, Color(0, 0, 0, 0.42 * s))
