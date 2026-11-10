extends "res://scripts/arena3d.gd"
## 复用竞技场环境、相机与模型边界算法；不改原场景或主场景。
const Player3D := preload("res://scripts/player3d.gd")
const Enemy3D := preload("res://scripts/enemy3d.gd")
const CAPTURE_TIMES := [1.5, 3.5, 5.5, 8.0]
const TRAUMA_MAX := 0.6
const TRAUMA_DECAY := 1.8
var enemies: Array = []
var fighter: CharacterBody3D
var frozen := false
var verify_mode := false
var _freeze_t := 0
var _trauma := 0.0
var _pulse := 0
var _health: ColorRect
var _result: Label
var _victory_t := -1.0
var _hits: Array = []
var _verify_tick := 0
var _verify_phase := 0
var _verify_victim: WeakRef
var _initialized := false
var _failures: Array[String] = []

func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	_demo = "--demo" in args
	_capture = "--capture" in args
	verify_mode = "--verify" in args
	_build_hud()
	_build_arena()
	fighter = Player3D.new()
	fighter.position = Vector3(0, 0.05, 3)
	add_child(fighter)
	fighter.setup(self)
	_hero = fighter
	_build_camera()
	for at in [Vector3(0, 0.05, -0.5), Vector3(-2, 0.05, -3), Vector3(2, 0.05, -4)]:
		var enemy := Enemy3D.new()
		enemy.position = at
		add_child(enemy)
		enemy.setup(self, fighter)
		enemies.append(enemy)
	_initialized = true
	if verify_mode:
		_verify_victim = weakref(enemies[0])
		enemies[0].position = fighter.position + Vector3.FORWARD * 1.6
		enemies[1].position.x = -20
		enemies[2].position.x = 20

func _build_hud() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	var bg := ColorRect.new()
	bg.position = Vector2(24, 24)
	bg.size = Vector2(204, 20)
	bg.color = Color(0.08, 0.04, 0.07)
	layer.add_child(bg)
	_health = ColorRect.new()
	_health.position = Vector2(26, 26)
	_health.size = Vector2(200, 16)
	_health.color = Color(0.8, 0.12, 0.2)
	layer.add_child(_health)
	var hint := Label.new()
	hint.text = "HP 100   |   WASD / Space / J   |   Drag to orbit"
	hint.position = Vector2(24, 48)
	layer.add_child(hint)
	_result = Label.new()
	_result.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_result.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_result.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_result.add_theme_font_size_override("font_size", 52)
	layer.add_child(_result)

func hitstop(frames: int) -> void:
	_freeze_t = maxi(_freeze_t, frames)
	# 命中同帧也阻止后续实体更新。
	frozen = true

func add_trauma(amount: float) -> void:
	_trauma = minf(_trauma + amount, TRAUMA_MAX)

func record_hit(index: int, before: int, after: int) -> void:
	if verify_mode:
		_hits.append([index, before - after])
		print("VERIFY combo ", index + 1, " hit: HP ", before, " -> ", after, " damage=", before - after)

func _physics_process(delta: float) -> void:
	if not _initialized or not is_instance_valid(fighter):
		return
	_time += delta
	frozen = _freeze_t > 0
	if frozen:
		_freeze_t -= 1
	else:
		if verify_mode:
			_drive_verify()
		elif _demo:
			_drive_combat_demo()
		else:
			var input := Vector2(float(Input.is_key_pressed(KEY_D)) - float(Input.is_key_pressed(KEY_A)), float(Input.is_key_pressed(KEY_S)) - float(Input.is_key_pressed(KEY_W)))
			fighter.direction = (Basis(Vector3.UP, _yaw) * Vector3(input.x, 0, input.y)).normalized()
			fighter.attack = Input.is_key_pressed(KEY_J)
			fighter.jump = Input.is_key_pressed(KEY_SPACE)
	if _demo:
		_yaw += delta * 0.16
	_update_camera()
	if is_instance_valid(_health):
		_health.size.x = 200.0 * fighter.hp / 100
	var alive := false
	for enemy in enemies:
		if is_instance_valid(enemy) and enemy.hp > 0:
			alive = true
	if not alive and _victory_t < 0:
		_victory_t = _time
	if is_instance_valid(_result):
		_result.text = "肃清" if _victory_t >= 0 and _time - _victory_t <= 2 else ("败北" if fighter.hp <= 0 else "")

func _drive_combat_demo() -> void:
	var target: CharacterBody3D
	var nearest := INF
	for enemy in enemies:
		if is_instance_valid(enemy) and enemy.hp > 0:
			var distance: float = fighter.position.distance_to(enemy.position)
			if distance < nearest:
				nearest = distance
				target = enemy
	fighter.direction = Vector3.ZERO
	fighter.attack = false
	if target:
		var offset: Vector3 = target.position - fighter.position
		offset.y = 0
		if nearest > 1.9:
			fighter.direction = offset.normalized()
		else:
			if fighter.state == "idle":
				fighter.visual.rotation.y = atan2(offset.x, offset.z)
			_pulse += 1
			fighter.attack = _pulse % 16 == 1

func _process(delta: float) -> void:
	if not _initialized or not is_instance_valid(_arm):
		return
	_trauma = maxf(_trauma - TRAUMA_DECAY * delta, 0)
	var camera := _arm.get_child(0) as Camera3D
	var amplitude := _trauma * _trauma * 0.35
	camera.h_offset = sin(_time * 111) * amplitude
	camera.v_offset = sin(_time * 137 + 1.7) * amplitude
	if _capture and not _capturing and _shots < CAPTURE_TIMES.size() and _time >= CAPTURE_TIMES[_shots]:
		_capturing = true
		await RenderingServer.frame_post_draw
		var path := ProjectSettings.globalize_path("res://shotc_%d.png" % (_shots + 1))
		var error := get_viewport().get_texture().get_image().save_png(path)
		if error != OK:
			push_error("截帧失败：%s" % path)
			get_tree().quit(1)
			return
		print("combat3d: saved ", path)
		_shots += 1
		_capturing = false
		if _shots == CAPTURE_TIMES.size():
			get_tree().quit()

func _drive_verify() -> void:
	_verify_tick += 1
	fighter.attack = _verify_tick in [1, 12, 34]
	if _verify_phase == 0 and _verify_tick >= 75:
		var victim = _verify_victim.get_ref() if _verify_victim != null else null
		var targets := enemies.filter(func(candidate): return is_instance_valid(candidate) and candidate != victim and candidate.hp > 0)
		if not is_instance_valid(victim) or targets.is_empty():
			print("VERIFY FAIL: missing verification enemies")
			get_tree().quit(1)
			return
		if _hits != [[0, 12], [1, 12], [2, 16]] or victim.hp != 20:
			_failures.append("三连段命中或伤害错误: %s" % str(_hits))
		# 独立重置链窗，用真实受击入口测试四次非重击。
		var enemy = targets[0]
		for i in range(4):
			enemy.take_hit(1, Vector3.FORWARD, false)
			print("VERIFY light ", i + 1, " stun=", enemy.stun_t, " break=", enemy.break_t)
		if enemy.break_t != 80 or enemy.chain_n != 0:
			_failures.append("四连击未触发80帧挣脱")
		var old_stun: int = enemy.stun_t
		enemy.take_hit(1, Vector3.FORWARD, false)
		if enemy.stun_t != old_stun:
			_failures.append("霸体轻击硬直错误")
		enemy.take_hit(1, Vector3.FORWARD, true)
		if enemy.state != "hurt" or enemy.stun_t != 20:
			_failures.append("重击未打断霸体")
		victim.take_hit(20, Vector3.FORWARD, true)
		print("VERIFY death HP=", victim.hp, " state=", victim.state)
		if victim.state != "down":
			_failures.append("敌人无法死亡")
		_verify_phase = 1
	if _verify_phase == 1 and _verify_tick >= 170:
		if _verify_victim != null and is_instance_valid(_verify_victim.get_ref()):
			_failures.append("死亡后未移除")
		print("VERIFY PASS" if _failures.is_empty() else "VERIFY FAIL: " + "; ".join(_failures))
		get_tree().quit(0 if _failures.is_empty() else 1)
