extends Node2D
## 按 F1 显示判定框：绿色 = 身体，红色 = 正在生效的攻击判定。调手感时非常有用。

func _process(_delta: float) -> void:
	if visible:
		queue_redraw()


func _draw() -> void:
	var main := owner
	for a in main.world.get_children():
		if not (a is Actor):
			continue
		var base: float = Game.GROUND_Y + a.gy
		draw_rect(Rect2(a.gx - a.w / 2, base - a.z - a.h, a.w, a.h), Color(0.3, 1, 0.4, 0.8), false, 1.0)
		draw_line(Vector2(a.gx - 20, base), Vector2(a.gx + 20, base), Color(0.3, 1, 0.4, 0.5), 1.0)
	var p: Player = main.player
	if p and p.state == &"attack" and p.move:
		for h in p.move.hits:
			if p.mf - 1 >= h.at and p.mf - 1 < h.at + h.dur:
				var b := Combat.box_of(p, h)
				var base: float = Game.GROUND_Y + p.gy
				draw_rect(Rect2(b.cx - b.hw, base - b.z1, b.hw * 2, b.z1 - b.z0), Color(1, 0.2, 0.2, 0.9), false, 2.0)
