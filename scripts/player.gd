extends Node2D
## 绯隼（M2 竖切）：移动/跳跃/冲刺/三段连斩，帧数据对齐网页版
## （slash 总 22f、10f 起可衔接、接触帧取图集 contact 元数据；轻击命中顿帧由 stage 统一处理）。

const RUN_SPEED := 156.0
const GRAVITY := 1980.0
const JUMP_VEL := -570.0
const SCALE := 0.6

var stage: Node = null
var enemies: Array = []
var anims_meta: Dictionary = {}

var hp := 100
var facing := 1
var vel := Vector2.ZERO
var grounded := true
var state := "idle"
var state_t := 0
var atk_idx := 0
var atk_hit_done := false
var atk_buffered := false
var flash_t := 0

var inp := {"dir": 0, "jump": false, "attack": false, "dash": false}
var _prev := {"jump": false, "attack": false, "dash": false}

var _facing_node: Node2D
var _spr: AnimatedSprite2D
var _wing: SkinnedWing

func setup(p_stage: Node, built: Dictionary) -> void:
	stage = p_stage
	anims_meta = built["anims"]
	_facing_node = Node2D.new()
	_facing_node.scale = Vector2(SCALE, SCALE)
	add_child(_facing_node)
	# 翅膀先加（同 z 靠树序在人物身后）：不能用 z_index=-1——相对 z 会让它沉到全屏背景之后
	_wing = SkinnedWing.new(load("res://art/wings/wings_side_dawn.webp") as Texture2D, 300.0)
	_wing.position = Vector2(-8, -176)
	_facing_node.add_child(_wing)
	_spr = AnimatedSprite2D.new()
	_spr.sprite_frames = built["frames"]
	var pv: Array = built["pivot"]
	_spr.offset = Vector2(-float(pv[0]), -float(pv[1]))
	_spr.centered = false
	var mat := ShaderMaterial.new()
	mat.shader = preload("res://shaders/flash.gdshader")
	_spr.material = mat
	_facing_node.add_child(_spr)
	_spr.play("idle")

func _play(anim: String, speed := 1.0) -> void:
	if _spr.animation != anim:
		_spr.play(anim)
	_spr.speed_scale = speed

func _physics_process(delta: float) -> void:
	if stage and stage.get("frozen"):
		_spr.pause()  # 顿帧期间动画同步冻结，不然动作会跑在逻辑前面
		return
	if not _spr.is_playing():
		_spr.play()
	# 输入边沿
	var pressed := {}
	for k in ["jump", "attack", "dash"]:
		pressed[k] = inp[k] and not _prev[k]
		_prev[k] = inp[k]
	state_t += 1
	if flash_t > 0:
		flash_t -= 1
		(_spr.material as ShaderMaterial).set_shader_parameter("flash", 1.0 if flash_t > 1 else 0.0)

	match state:
		"attack":
			var contact: Array = anims_meta.get("attack_0%d" % (atk_idx + 1), {}).get("contact", [])
			if not atk_hit_done and _spr.frame in contact:
				atk_hit_done = true
				_do_hit()
			if pressed["attack"] and state_t >= 10:
				atk_buffered = true
			vel.x = move_toward(vel.x, 0.0, 900.0 * delta)
			if state_t >= 22:
				if atk_buffered and atk_idx < 2:
					_start_attack(atk_idx + 1)
				else:
					state = "idle"
					state_t = 0
		"dash":
			vel.x = facing * 520.0
			if state_t >= 14:
				state = "idle"
				state_t = 0
		"hurt":
			vel.x = move_toward(vel.x, 0.0, 1200.0 * delta)
			if state_t >= 12:
				state = "idle"
				state_t = 0
		_:
			if pressed["attack"] and grounded:
				_start_attack(0)
			elif pressed["dash"]:
				state = "dash"
				state_t = 0
				_play("dodge", 1.6)
			elif pressed["jump"] and grounded:
				vel.y = JUMP_VEL
				grounded = false
				_play("jump", 1.2)
			else:
				vel.x = inp["dir"] * RUN_SPEED
				if inp["dir"] != 0:
					facing = inp["dir"]

	if state != "attack" and state != "dash":
		if not grounded:
			vel.y += GRAVITY * delta
		else:
			vel.y = 0.0
	position += vel * delta
	var floor_y: float = stage.get("floor_y") if stage else 468.0
	if position.y >= floor_y:
		position.y = floor_y
		vel.y = 0.0
		grounded = true
	elif position.y < floor_y - 1.0:
		grounded = false
	_facing_node.scale.x = SCALE * facing

	# 动画与翅膀状态
	if state == "idle" or state == "run" or state == "air":
		if not grounded:
			state = "air"
			_play("jump", 1.2)
		elif absf(vel.x) > 1.0:
			state = "run"
			_play("run", 1.1)
		else:
			state = "idle"
			_play("idle", 1.0)
	match state:
		"run":
			_wing.amp = 0.24
			_wing.speed = 6.5
		"dash":
			_wing.amp = 0.05
			_wing.speed = 3.0
		_:
			_wing.amp = 0.12
			_wing.speed = 1.7

func _start_attack(idx: int) -> void:
	state = "attack"
	atk_idx = idx
	state_t = 0
	atk_hit_done = false
	atk_buffered = false
	vel.x = facing * 46.0
	_play("attack_0%d" % (idx + 1), 2.0)

func _do_hit() -> void:
	for e in enemies:
		if not is_instance_valid(e) or e.get("hp") <= 0:
			continue
		var dx: float = e.position.x - position.x
		var dy: float = absf(e.position.y - position.y)
		if signf(dx) == facing and absf(dx) < 86.0 and dy < 44.0:
			e.take_hit(12, facing, atk_idx == 2)
			if stage:
				stage.hitstop(8 if atk_idx == 2 else 6)
				stage.add_trauma(0.32 if atk_idx == 2 else 0.22)

func take_hit(from_dir: int) -> void:
	if state == "dash" or state == "hurt":
		return
	hp = maxi(hp - 8, 0)
	state = "hurt"
	state_t = 0
	vel.x = from_dir * 130.0
	flash_t = 4
	_play("hurt", 1.4)
