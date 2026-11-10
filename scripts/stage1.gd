extends Node2D
## M2 战斗竖切 · 第一关：背景/地面/相机 + 绯隼 vs 腐骨兵×2。
## 顿帧（hitstop）与震屏在此统一调度：实体在 frozen 期间跳过物理、动画同步暂停。
## --demo：脚本驱动输入做自动演示；--capture：在预定时刻截帧存盘后退出。

const FLOOR_Y := 492.0
const WORLD_W := 1680.0

var floor_y := FLOOR_Y
var frozen := false
var _freeze_t := 0
var _trauma := 0.0

var _player: Node2D
var _cam: Camera2D
var _t := 0.0
var _demo := false
var _capture := false
var _shots := 0
var _shot_times: Array[float] = [0.9, 1.8, 2.8, 4.2, 6.0]
var _demo_phase := 0

const Player := preload("res://scripts/player.gd")
const Grunt := preload("res://scripts/grunt.gd")

func _ready() -> void:
	_demo = "--demo" in OS.get_cmdline_user_args()
	_capture = "--capture" in OS.get_cmdline_user_args()
	var bg := Sprite2D.new()
	bg.texture = load("res://art/env/stage_01.webp")
	bg.centered = true
	bg.position = Vector2(WORLD_W / 2, 272)
	bg.scale = Vector2(WORLD_W / 2048.0, WORLD_W / 2048.0)
	add_child(bg)

	var hero_built := AtlasAnim.build("res://art/hero/feisun_atlas.webp", "res://art/hero/feisun.json")
	var grunt_built := AtlasAnim.build("res://art/enemies/grunt_atlas.webp", "res://art/enemies/grunt.json")

	_player = Player.new()
	_player.position = Vector2(220, FLOOR_Y)
	add_child(_player)
	_player.setup(self, hero_built)

	var enemies: Array = []
	for gx in [760.0, 1140.0]:
		var g := Grunt.new()
		g.position = Vector2(gx, FLOOR_Y)
		add_child(g)
		g.setup(self, _player, grunt_built)
		enemies.append(g)
	_player.enemies = enemies

	_cam = Camera2D.new()
	_cam.position = Vector2(480, 270)
	add_child(_cam)
	_cam.make_current()

func hitstop(frames: int) -> void:
	_freeze_t = maxi(_freeze_t, frames)

func add_trauma(amount: float) -> void:
	_trauma = minf(_trauma + amount, 0.6)

func _physics_process(_delta: float) -> void:
	if _freeze_t > 0:
		_freeze_t -= 1
		frozen = true
	else:
		frozen = false
	if _demo:
		_drive_demo()
	elif _player:
		_read_keyboard()

func _process(delta: float) -> void:
	_t += delta
	if _cam and _player:
		var cx := clampf(_player.position.x, 480.0, WORLD_W - 480.0)
		_trauma = maxf(_trauma - 1.8 * delta, 0.0)
		var sh := _trauma * _trauma * 15.0
		_cam.position = Vector2(cx + randf_range(-sh, sh), 270 + randf_range(-sh, sh) * 0.6)
		_cam.rotation = randf_range(-1.0, 1.0) * _trauma * _trauma * 0.02
	if _capture:
		if _shots < _shot_times.size() and _t >= _shot_times[_shots]:
			_shots += 1
			await RenderingServer.frame_post_draw
			var img := get_viewport().get_texture().get_image()
			img.save_png(ProjectSettings.globalize_path("res://") + "shot_%d.png" % _shots)
			if _shots >= _shot_times.size():
				get_tree().quit()

func _read_keyboard() -> void:
	var dir := 0
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
		dir -= 1
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
		dir += 1
	_player.inp["dir"] = dir
	_player.inp["jump"] = Input.is_key_pressed(KEY_K) or Input.is_key_pressed(KEY_W)
	_player.inp["attack"] = Input.is_key_pressed(KEY_J)
	_player.inp["dash"] = Input.is_key_pressed(KEY_L)

var _atk_cool := 0
func _drive_demo() -> void:
	# 演示驱动：跑向最近的敌人，进身位后连续出刀（连段+防连锁挣脱都走一遍），再扑向下一个
	var inp := {"dir": 0, "jump": false, "attack": false, "dash": false}
	var target: Node2D = null
	for e in _player.enemies:
		if is_instance_valid(e) and e.get("hp") > 0:
			target = e
			break
	if target:
		var dx: float = target.position.x - _player.position.x
		if absf(dx) > 64.0:
			inp["dir"] = 1 if dx > 0 else -1
			_atk_cool = 6
		else:
			_atk_cool -= 1
			if _atk_cool <= 0:
				inp["attack"] = true
				_atk_cool = 16
	_player.inp = inp
