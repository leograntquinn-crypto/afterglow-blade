extends Camera2D
## 镜头：跟随主角（略微看向前方）、震屏、重击时短暂推近

var target: Node2D
var room_width := 1600.0
var _shake := 0.0
var _shake_t := 0
var _shake_dur := 1
var _zoom_kick := 0.0


func _ready() -> void:
	Game.shake_requested.connect(_on_shake)
	Game.zoom_kick.connect(func(a: float) -> void: _zoom_kick = maxf(_zoom_kick, a))


func _on_shake(strength: float, frames: int) -> void:
	var cur := _shake * (float(_shake_t) / _shake_dur) if _shake_t > 0 else 0.0
	if strength >= cur:
		_shake = strength
		_shake_t = frames
		_shake_dur = frames


func _physics_process(_delta: float) -> void:
	if target:
		var want := clampf(target.gx + target.facing * 60.0, 480.0, room_width - 480.0)
		position.x += (want - position.x) * 0.08
		position.y = 270.0
	# 震屏：随帧衰减的随机偏移（顿帧期间也继续）
	if _shake_t > 0:
		var m := _shake * (float(_shake_t) / _shake_dur)
		offset = Vector2(randf_range(-m, m), randf_range(-m, m) * 0.7)
		_shake_t -= 1
	else:
		offset = Vector2.ZERO
	_zoom_kick *= 0.86
	zoom = Vector2.ONE * (1.0 + _zoom_kick)
