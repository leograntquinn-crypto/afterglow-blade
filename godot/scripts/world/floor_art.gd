extends Node2D
## 地面：6 行石板，每行放在一个 Parallax2D 里，滚动速度从 0.88 到 1.18。
## 越靠近镜头的行移动越快 —— 这就是「透视」的来源，不需要 3D。

@export var floor_color := Color("3a2e3a")
@export var width := 1900.0

const ROWS := [[0, 14, 70], [14, 32, 86], [32, 56, 104], [56, 88, 126], [88, 132, 152], [132, 228, 190]]


func _ready() -> void:
	for r in ROWS:
		var p := Parallax2D.new()
		var mid: float = (r[0] + r[1]) / 2.0
		p.scroll_scale = Vector2(0.88 + mid / 228.0 * 0.3, 1.0)
		var row := FloorRow.new()
		row.y0 = r[0]
		row.y1 = r[1]
		row.stone_w = r[2]
		row.color = floor_color
		row.width = width
		row.position.y = Game.GROUND_Y
		p.add_child(row)
		add_child(p)


class FloorRow extends Node2D:
	var y0 := 0.0
	var y1 := 0.0
	var stone_w := 100.0
	var color := Color.GRAY
	var width := 1900.0

	func _draw() -> void:
		var rng := RandomNumberGenerator.new()
		rng.seed = int(y0 * 31 + 5)
		var h := y1 - y0
		var depth := y0 / 228.0
		draw_rect(Rect2(-200, y0, width + 400, h), Color(color.r * 0.35, color.g * 0.35, color.b * 0.35))
		var x := -200.0 - rng.randf() * stone_w * 0.5
		while x < width + 200:
			var f := (0.72 + rng.randf() * 0.32) * (0.75 + depth * 0.35)
			var base := Color(color.r * f, color.g * f, color.b * f)
			draw_rect(Rect2(x + 2, y0 + 2, stone_w - 4, h - 3), base)
			draw_rect(Rect2(x + 2, y0 + 2, stone_w - 4, 1.5), Color(1, 1, 1, 0.07))
			draw_rect(Rect2(x + 2, y0 + h * 0.6, stone_w - 4, h * 0.4 - 1), Color(0, 0, 0, 0.12))
			if rng.randf() < 0.3:
				var cx := x + rng.randf() * stone_w
				draw_line(Vector2(cx, y0 + 3), Vector2(cx + rng.randf_range(-12, 12), y0 + h * 0.7), Color(0, 0, 0, 0.4), 1.0)
			x += stone_w
		if y0 == 0.0:
			# 墙脚的接触阴影
			for i in 8:
				draw_rect(Rect2(-200, i * 4.0, width + 400, 4), Color(0, 0, 0, 0.5 * (1.0 - i / 8.0)))
