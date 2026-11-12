extends "res://scripts/combat3d.gd"
## 可玩 v1：三波波次制（3/4/5）+ 胜负结算 + R 重开 + 新镜头默认。
## 复用 combat3d 的竞技场、HUD、相机、顿帧与自动战斗驱动，只重写流程层。
## --demo 自动战斗；--god 玩家不受伤害（自动跑通全程用）；--capture 预定时刻截帧存 play_%d.png。

const HERO_MODEL := "res://art/models/feisun_s1.glb"
const WAVE_COUNTS := [3, 4, 5]
const INTERMISSION := 2.0
const PLAY_CAPTURE_TIMES := [2.0, 6.0, 12.0, 20.0]

var god_mode := false
var wave := 0
var phase := "fighting"
var phase_t := 0.0
var clear_time := -1.0
var _wave_label: Label

func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	_demo = "--demo" in args
	_capture = "--capture" in args
	god_mode = "--god" in args
	_build_hud()
	_build_play_hud()
	_build_arena()
	fighter = Player3D.new()
	fighter.position = Vector3(0, 0.05, 3)
	add_child(fighter)
	if ResourceLoader.exists(HERO_MODEL):
		fighter.model_path = HERO_MODEL
	fighter.setup(self)
	_hero = fighter
	_build_camera()
	_pitch = -0.7
	_distance = 11.0
	(_arm.get_child(0) as Camera3D).fov = 50.0
	_update_camera()
	_initialized = true
	if fighter.anim_player:
		print("PLAY hero model=", fighter.model_path, " anims=", fighter.anim_player.get_animation_list())
	else:
		print("PLAY hero model=", fighter.model_path, " anims=NONE")
	_start_wave(1)

func _build_play_hud() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	_wave_label = Label.new()
	_wave_label.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	_wave_label.offset_top = 14
	_wave_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_wave_label.add_theme_font_size_override("font_size", 22)
	layer.add_child(_wave_label)
	var hint2 := Label.new()
	hint2.text = "R 重新开始"
	hint2.position = Vector2(24, 72)
	layer.add_child(hint2)

func _start_wave(n: int) -> void:
	wave = n
	enemies.clear()
	var count: int = WAVE_COUNTS[n - 1]
	for i in count:
		var a := TAU * float(i) / float(count) + float(n) * 0.7
		var enemy := Enemy3D.new()
		enemy.position = Vector3(sin(a) * 12.0, 0.05, cos(a) * 12.0)
		add_child(enemy)
		enemy.setup(self, fighter)
		enemies.append(enemy)
	phase = "fighting"
	phase_t = 0.0
	_result.text = ""
	print("PLAY wave ", n, " start count=", count)

func _alive_count() -> int:
	var alive := 0
	for e in enemies:
		if is_instance_valid(e) and e.hp > 0:
			alive += 1
	return alive

func _physics_process(delta: float) -> void:
	if not _initialized or not is_instance_valid(fighter):
		return
	_time += delta
	frozen = _freeze_t > 0
	if frozen:
		_freeze_t -= 1
	else:
		if _demo:
			_drive_combat_demo()
		elif phase == "fighting" or phase == "intermission":
			var input := Vector2(float(Input.is_key_pressed(KEY_D)) - float(Input.is_key_pressed(KEY_A)), float(Input.is_key_pressed(KEY_S)) - float(Input.is_key_pressed(KEY_W)))
			fighter.direction = (Basis(Vector3.UP, _yaw) * Vector3(input.x, 0, input.y)).normalized()
			fighter.attack = Input.is_key_pressed(KEY_J)
			fighter.jump = Input.is_key_pressed(KEY_SPACE)
	if _demo:
		_yaw += delta * 0.16
	if god_mode and is_instance_valid(fighter):
		fighter.hp = 100 # player3d MAX_HP
	if phase == "won" or phase == "lost":
		fighter.direction = Vector3.ZERO
		fighter.attack = false
		fighter.jump = false
	_update_camera()
	if is_instance_valid(_health):
		_health.size.x = 200.0 * float(fighter.hp) / 100.0
	if Input.is_key_pressed(KEY_R):
		get_tree().reload_current_scene()
		return
	_flow(delta)
	if is_instance_valid(_wave_label):
		_wave_label.text = "第 %d / %d 波 · 余敌 %d" % [wave, WAVE_COUNTS.size(), _alive_count()]

func _flow(delta: float) -> void:
	if phase == "fighting":
		if fighter.hp <= 0:
			phase = "lost"
			phase_t = 0.0
			_result.text = "败北\n按 R 重新开始"
			print("PLAY defeat wave=", wave, " time=", _time)
			return
		if _alive_count() == 0:
			if wave >= WAVE_COUNTS.size():
				phase = "won"
				phase_t = 0.0
				clear_time = _time
				_result.text = "肃清\n用时 %d 秒 · 按 R 再来一局" % int(clear_time)
				print("PLAY VICTORY time=", clear_time)
			else:
				phase = "intermission"
				phase_t = 0.0
				_result.text = "第 %d 波 · 肃清" % wave
				print("PLAY wave ", wave, " cleared")
	elif phase == "intermission":
		phase_t += delta
		if phase_t >= INTERMISSION:
			_start_wave(wave + 1)
	elif _demo and (phase == "won" or phase == "lost"):
		phase_t += delta
		if phase_t >= 1.5:
			get_tree().quit(0 if phase == "won" else 1)

func _unhandled_input(event: InputEvent) -> void:
	if _demo:
		return
	if event is InputEventMouseMotion and Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
		_yaw -= event.relative.x * MOUSE_SENSITIVITY
		_pitch = clampf(_pitch - event.relative.y * MOUSE_SENSITIVITY, -1.15, -0.1)
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			_distance = clampf(_distance - 0.5, 4.0, 16.0)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_distance = clampf(_distance + 0.5, 4.0, 16.0)

func _process(delta: float) -> void:
	if not _initialized or not is_instance_valid(_arm):
		return
	_trauma = maxf(_trauma - TRAUMA_DECAY * delta, 0.0)
	var camera := _arm.get_child(0) as Camera3D
	var amplitude := _trauma * _trauma * 0.35
	camera.h_offset = sin(_time * 111) * amplitude
	camera.v_offset = sin(_time * 137 + 1.7) * amplitude
	if _capture and not _capturing and _shots < PLAY_CAPTURE_TIMES.size() and _time >= PLAY_CAPTURE_TIMES[_shots]:
		_capturing = true
		await RenderingServer.frame_post_draw
		var path := ProjectSettings.globalize_path("res://play_%d.png" % (_shots + 1))
		var error := get_viewport().get_texture().get_image().save_png(path)
		if error != OK:
			push_error("截帧失败：%s" % path)
			get_tree().quit(1)
			return
		print("play3d: saved ", path)
		_shots += 1
		_capturing = false
		if _shots == PLAY_CAPTURE_TIMES.size() and not _demo:
			get_tree().quit()
