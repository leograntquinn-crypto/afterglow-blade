extends Node2D
## 后墙：砖墙、拱形壁龛、石柱、破旗、锁链。
## _draw 只在第一次执行，之后 Godot 会缓存绘制结果 —— 几千块砖也不影响帧率。
## 等背景素材到了，这个节点会换成 Sprite2D 贴图。

const TORCH := preload("res://scenes/world/torch.tscn")

@export var width := 1800.0
@export var height := 330.0
@export var brick := Color("2c2232")
@export var mortar := Color("0e0a12")
@export var pillar := Color("30263a")
@export var banner := Color("6a1e2a")
@export var emblem := Color("c9a45c")

var rng := RandomNumberGenerator.new()


func _ready() -> void:
	rng.seed = 7
	# 每根柱子上一支火把
	var x := 0.0
	while x <= width:
		var t := TORCH.instantiate()
		t.position = Vector2(x, 160)
		add_child(t)
		x += 300.0


func shade(c: Color, f: float) -> Color:
	return Color(c.r * f, c.g * f, c.b * f, c.a)


func _draw() -> void:
	draw_rect(Rect2(0, 0, width, height), mortar)
	# 砖
	var y := 0.0
	var row := 0
	while y < height:
		var bx := -26.0 if row % 2 else 0.0
		while bx < width:
			var bw := 44.0 + rng.randi_range(0, 18)
			var f := 0.8 + rng.randf() * 0.35
			draw_rect(Rect2(bx + 1, y + 1, bw - 2, 20), shade(brick, f))
			draw_rect(Rect2(bx + 1, y + 1, bw - 2, 2), shade(brick, f * 1.25))
			draw_rect(Rect2(bx + 1, y + 18, bw - 2, 3), shade(brick, f * 0.7))
			bx += bw
		y += 22.0
		row += 1
	# 拱形壁龛
	var ax := 150.0
	while ax < width:
		_arch(ax, 170.0, 112.0)
		ax += 300.0
	# 顶部压暗、墙脚阴影
	for i in 12:
		draw_rect(Rect2(0, i * 10, width, 10), Color(0, 0, 0, 0.75 * (1.0 - i / 12.0)))
	for i in 8:
		draw_rect(Rect2(0, height - 40 + i * 5, width, 5), Color(0, 0, 0, 0.07 * i))
	# 石柱 + 旗帜
	var px := 0.0
	var n := 0
	while px <= width:
		_pillar(px, n % 2 == 1)
		px += 300.0
		n += 1
	# 锁链
	for cx in [95.0, 520.0, 910.0, 1330.0]:
		var len := 60.0 + rng.randf() * 80.0
		var yy := 0.0
		while yy < len:
			draw_arc(Vector2(cx + sin(yy * 0.05) * 3, yy), 3.5, 0, TAU, 10, Color(0, 0, 0, 0.75), 2.0)
			yy += 7.0


func _arch(x: float, w: float, top: float) -> void:
	var pts := PackedVector2Array([Vector2(x - w / 2, height)])
	for i in 17:
		var a := PI + PI * i / 16.0
		pts.append(Vector2(x + cos(a) * w / 2, top + w / 2 + sin(a) * w / 2))
	pts.append(Vector2(x + w / 2, height))
	draw_colored_polygon(pts, Color(0, 0, 0, 0.82))
	draw_arc(Vector2(x, top + w / 2), w / 2 + 4, PI, TAU, 24, shade(brick, 1.25), 7.0)


func _pillar(px: float, with_banner: bool) -> void:
	var w := 52.0
	# 柱身：左亮右暗，用竖条模拟渐变
	for i in 13:
		var f := lerpf(1.35, 0.55, i / 12.0)
		draw_rect(Rect2(px - w / 2 + i * 4, 30, 4, height - 30), shade(pillar, f))
	var y := 60.0
	while y < height - 30:
		draw_rect(Rect2(px - w / 2, y, w, 2), Color(0, 0, 0, 0.35))
		y += 46.0
	for seg in [[24.0, 16.0, w + 18], [40.0, 6.0, w + 8], [height - 28, 10.0, w + 10], [height - 18, 18.0, w + 20]]:
		draw_rect(Rect2(px - seg[2] / 2, seg[0], seg[2], seg[1]), shade(pillar, 1.1))
		draw_rect(Rect2(px - seg[2] / 2, seg[0] + seg[1] - 3, seg[2], 3), shade(pillar, 0.6))
	if not with_banner:
		return
	var bx := px + w / 2 + 8
	var by := 52.0
	var bw := 46.0
	var bh := 120.0
	draw_rect(Rect2(bx - 4, by - 4, bw + 8, 5), Color("1a1414"))
	var pts := PackedVector2Array([Vector2(bx, by), Vector2(bx + bw, by), Vector2(bx + bw, by + bh - 10)])
	for i in range(6, -1, -1):
		pts.append(Vector2(bx + bw * i / 6.0, by + bh - (0.0 if i % 2 else 14.0) - rng.randf() * 8))
	draw_colored_polygon(pts, banner)
	draw_rect(Rect2(bx + bw * 0.6, by, bw * 0.4, bh - 14), Color(0, 0, 0, 0.25))
	draw_arc(Vector2(bx + bw / 2, by + 44), 12, 0, TAU, 24, Color(emblem, 0.7), 2.0)
	draw_line(Vector2(bx + bw / 2, by + 28), Vector2(bx + bw / 2, by + 60), Color(emblem, 0.7), 2.0)
