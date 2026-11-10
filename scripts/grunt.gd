extends Node2D
## 腐骨兵（M2 竖切）：AI 与受击逻辑按网页版 2026-11-10 调优后的数值移植——
## 前摇 21f、冷却 46–84f；防连锁：75f 内连吃硬直 ×1/×0.8/×0.6（下限 0.4×），第 4 次触发 80f 挣脱。

const WALK_SPEED := 66.0
const SCALE := 0.6
const MAX_HP := 60

var stage: Node = null
var player: Node2D = null

var hp := MAX_HP
var facing := -1
var state := "idle"
var state_t := 0
var cd := 30
var flash_t := 0
# 防连锁状态（与网页版 enemy.js 同构）
var stun_t := 0
var chain_n := 0
var chain_age := 999
var break_t := 0
var struck := false

var _facing_node: Node2D
var _spr: AnimatedSprite2D
var _rng := RandomNumberGenerator.new()

func setup(p_stage: Node, p_player: Node2D, built: Dictionary) -> void:
	stage = p_stage
	player = p_player
	_rng.seed = 7
	_facing_node = Node2D.new()
	_facing_node.scale = Vector2(SCALE, SCALE)
	add_child(_facing_node)
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

func _physics_process(_delta: float) -> void:
	if stage and stage.get("frozen"):
		_spr.pause()
		return
	if not _spr.is_playing():
		_spr.play()
	state_t += 1
	chain_age += 1
	if break_t > 0:
		break_t -= 1
	if flash_t > 0:
		flash_t -= 1
		(_spr.material as ShaderMaterial).set_shader_parameter("flash", 1.0 if flash_t > 1 else 0.0)
	queue_redraw()
	if hp <= 0:
		return
	if stun_t > 0:
		stun_t -= 1
		if stun_t == 0:
			state = "idle"
			state_t = 0
		return
	_facing_node.scale.x = SCALE * facing
	if player == null:
		return
	var dx: float = player.position.x - position.x
	facing = 1 if dx > 0 else -1
	match state:
		"idle", "walk":
			if cd > 0:
				cd -= 1
			if absf(dx) > 58.0:
				state = "walk"
				position.x += signf(dx) * WALK_SPEED * _delta
				_play("walk", 1.1)
			elif cd <= 0:
				state = "atk"
				state_t = 0
				struck = false
				_play("slash", 1.6)
			else:
				state = "idle"
				_play("idle", 1.0)
		"atk":
			if state_t == 21 and not struck:
				struck = true
				if absf(dx) < 74.0 and signf(dx) == facing:
					player.take_hit(facing)
			if state_t >= 49:
				state = "idle"
				state_t = 0
				cd = _rng.randi_range(46, 84)

func take_hit(dmg: int, dir: int, heavy: bool) -> void:
	if hp <= 0:
		return
	hp -= dmg
	flash_t = 4
	position.x += dir * (7.0 if heavy else 4.0)
	if hp <= 0:
		state = "down"
		_play("down", 1.2)
		return
	if break_t > 0 and not heavy:
		return  # 挣脱中：轻击只造成伤害与小位移，不打断
	if chain_age <= 75:
		chain_n += 1
	else:
		chain_n = 1
	chain_age = 0
	if chain_n >= 4 and not heavy:
		chain_n = 0
		break_t = 80
		return  # 第 4 次连吃：挣脱，不进硬直
	var mult := maxf(0.4, 1.0 - 0.2 * float(chain_n - 1))
	stun_t = maxi(4, int(round(20.0 * mult)))
	state = "hurt"
	state_t = 0
	_play("hurt", 1.6)

func _draw() -> void:
	if hp > 0 and hp < MAX_HP:
		var w := 54.0
		var y := -128.0
		draw_rect(Rect2(-w / 2, y, w, 6), Color(0, 0, 0, 0.55))
		draw_rect(Rect2(-w / 2, y, w * float(hp) / MAX_HP, 6), Color(0.85, 0.3, 0.25))
