extends Label
## 伤害数字：弹出（先放大再回弹）→ 上浮 → 淡出

const NUM_FONT := preload("res://assets/fonts/Teko-SemiBold.ttf")
const TITLE_FONT := preload("res://assets/fonts/MaShanZheng-Regular.ttf")


func setup(value: String, crit: bool, col: Color, title := false, size := 30) -> void:
	text = value
	var ls := LabelSettings.new()
	ls.font = TITLE_FONT if title else NUM_FONT
	ls.font_size = size if title else (46 if crit else 30)
	ls.font_color = col
	ls.outline_size = 7
	ls.outline_color = Color(0.06, 0.02, 0.04, 0.95)
	ls.shadow_size = 2
	ls.shadow_color = Color(0, 0, 0, 0.5)
	label_settings = ls
	horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	z_index = 100


func _ready() -> void:
	# 以自身中心为缩放原点
	await get_tree().process_frame
	pivot_offset = size / 2.0
	position -= size / 2.0
	scale = Vector2(1.7, 1.7)
	var tw := create_tween()
	tw.tween_property(self, "scale", Vector2.ONE, 0.1).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(self, "position:y", position.y - 46.0, 0.8).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(self, "modulate:a", 0.0, 0.25)
	tw.tween_callback(queue_free)
