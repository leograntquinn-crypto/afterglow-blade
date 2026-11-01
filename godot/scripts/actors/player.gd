class_name Player
extends Actor
## 主角：状态机 + 招式执行 + 取消系统（逻辑从网页版移植，帧数据完全一致）
##
##   idle/run ──攻击──> attack ──取消──> attack(下一招) / 技能 / 闪避
##      │  └──跳跃──> air ──攻击──> attack(空中)
##      └──闪避──> dash ──攻击──> attack(冲刺攻击)
##   被打 → hurt / knock(击飞) → down(倒地) → idle

signal hp_changed

const SPEED_X := 4.2
const SPEED_Y := 2.7
const JUMP_V := 12.5
const WAVE_SCENE := preload("res://scenes/fx/sword_wave.tscn")

var moves := {}
var move: MoveData
var mf := 0                 ## 当前招式的帧数
var hit_sets: Array = []
var landed := false
var dash_cd := 0
var air_hangs := 0
var walk := 0.0
var hurt_t := 16
var mp := 120.0
var max_mp := 120.0
var skill_cd := 0
var glow := Color("7ff3ff")
var main: Node               ## 主场景，负责命中结算和生成特效

@onready var view: FighterView = $Visual/Body


func _ready() -> void:
	team = &"player"
	hp = max_hp
	hp_trail = max_hp
	for f in DirAccess.get_files_at("res://data/moves"):
		var path := "res://data/moves/" + f.trim_suffix(".remap")
		if path.ends_with(".tres"):
			var m: MoveData = load(path)
			moves[m.id] = m
	view.look = {
		"rig": "hero", "h": 86.0, "body": "#2b3f5c", "limb": "#1d2533", "head": "#efd6bd", "hair": "#1b2233",
		"eye": "#7ff3ff", "ribbon": "#7ff3ff", "trim": "#c9c1b3", "belt": "#3b2c22", "blade": "#e8fdff",
		"glow": "#7ff3ff", "blade_len": 64.0,
	}


func _physics_process(_delta: float) -> void:
	if Game.frozen:
		return
	st += 1
	if invuln > 0: invuln -= 1
	if flash > 0: flash -= 1
	if dash_cd > 0: dash_cd -= 1
	if skill_cd > 0: skill_cd -= 1
	mp = minf(max_mp, mp + 0.11)
	hp_trail = maxf(hp, hp_trail - max_hp * 0.004) if hp_trail > hp else hp

	match state:
		&"idle", &"run": _ground()
		&"air": _air()
		&"attack": _update_move()
		&"dash": _dash()
		&"hurt":
			vx *= 0.8
			vy = 0.0
			if st >= hurt_t: set_state(&"idle")
		&"down":
			vx *= 0.8
			vy = 0.0
			if st >= 40:
				set_state(&"idle")
				invuln = 45
		&"knock", &"dead":
			vy = 0.0
			if z <= 0.0: vx *= 0.85
	physics_step()
	_update_view()


func on_land(_v: float) -> void:
	main.spawn_dust(Vector2(gx, Game.GROUND_Y + gy), 5)
	main.play_sfx(&"land")
	air_hangs = 0
	if state == &"knock":
		set_state(&"down")
		Game.shake(4.0, 8)
	elif state == &"air" or (state == &"attack" and move and move.air):
		move = null
		vx = 0.0
		set_state(&"idle")


# ---------- 地面 ----------
func _ground() -> void:
	if _try_actions():
		return
	var dx := Buffer.move_x()
	var dy := Buffer.move_y()
	vx = dx * SPEED_X
	vy = dy * SPEED_Y
	if absf(dx) > 0.1:
		facing = signi(int(signf(dx)))
	if absf(dx) > 0.1 or absf(dy) > 0.1:
		walk += 0.32
		if state != &"run": set_state(&"run")
	elif state != &"idle":
		set_state(&"idle")


## 优先级：技能 > 闪避 > 跳跃 > 攻击
func _try_actions() -> bool:
	if _try_skill():
		return true
	if Buffer.buffered(&"dash") and dash_cd <= 0:
		Buffer.consume(&"dash")
		_start_dash()
		return true
	if Buffer.buffered(&"jump"):
		Buffer.consume(&"jump")
		_jump()
		return true
	if Buffer.buffered(&"attack"):
		Buffer.consume(&"attack")
		_start_move(&"upper" if Buffer.move_y() < -0.5 else &"slash1")
		return true
	return false


func _jump() -> void:
	move = null
	vz = JUMP_V
	z = 0.01
	vx = Buffer.move_x() * SPEED_X
	air_hangs = 0
	set_state(&"air")
	main.spawn_dust(Vector2(gx, Game.GROUND_Y + gy), 4)
	main.play_sfx(&"jump")


func _air() -> void:
	var dx := Buffer.move_x()
	vx += (dx * SPEED_X - vx) * 0.12
	vy = Buffer.move_y() * 1.6
	if absf(dx) > 0.1:
		facing = int(signf(dx))
	if Buffer.buffered(&"attack"):
		Buffer.consume(&"attack")
		_start_move(&"air_slash")


# ---------- 闪避（带无敌帧）----------
func _start_dash() -> void:
	var dx := Buffer.move_x()
	if absf(dx) > 0.1:
		facing = int(signf(dx))
	move = null
	set_state(&"dash")
	invuln = 14
	dash_cd = 30
	main.spawn_dust(Vector2(gx, Game.GROUND_Y + gy), 6)
	main.play_sfx(&"dash")


func _dash() -> void:
	vx = facing * 11.0 * maxf(0.0, 1.0 - st / 20.0)
	vy = Buffer.move_y() * 1.2
	if st % 2 == 0:
		main.spawn_afterimage(self)
	if st >= 4 and Buffer.buffered(&"attack"):
		Buffer.consume(&"attack")
		_start_move(&"dash_attack")
		return
	if st >= 6 and _try_skill():
		return
	if st >= 20:
		set_state(&"idle")


# ---------- 招式 ----------
func _start_move(id: StringName) -> void:
	var m: MoveData = moves[id]
	var dx := Buffer.move_x()
	if absf(dx) > 0.1 and not m.air:
		facing = int(signf(dx))
	move = m
	mf = 0
	landed = false
	hit_sets = []
	for _h in m.hits:
		hit_sets.append({})
	set_state(&"attack")
	if not m.air:
		vx = 0.0
		vy = 0.0
	if m.hang > 0.0 and air_hangs < 2 and vz < m.hang:
		vz = m.hang
		air_hangs += 1


func _update_move() -> void:
	var m := move
	var f := mf
	# 位移
	if f >= m.lunge_from and f < m.lunge_to:
		vx = facing * m.lunge_speed
	elif not m.air:
		vx *= 0.7
		vy = 0.0
	if m.thrust and f % 2 == 0 and f < 16:
		main.spawn_afterimage(self)
	# 刀光
	if f == m.first_hit_at():
		main.spawn_slash(self, m)
	if m.id == &"wave" and f == 10:
		_fire_wave()  # 裂空斩：第 10 帧放出剑气
	# 判定
	for i in m.hits.size():
		var h: HitData = m.hits[i]
		if f < h.at or f >= h.at + h.dur:
			continue
		var box := Combat.box_of(self, h)
		for e in get_tree().get_nodes_in_group(&"enemies"):
			if hit_sets[i].has(e) or not Combat.overlaps(box, e):
				continue
			var dir := (int(signf(e.gx - gx)) if e.gx != gx else facing) if h.radial else facing
			if main.apply_hit(self, e, h, dir):
				hit_sets[i][e] = true
				landed = true
	mf += 1
	# 取消：到了 cancel 帧之后，可以提前进入下一个动作
	var can_cancel := f >= m.cancel
	if can_cancel:
		if m.next_move and Buffer.buffered(&"attack"):
			Buffer.consume(&"attack")
			_start_move(m.next_move)
			return
		if m.jump_cancel and z <= 0.0 and Buffer.buffered(&"jump"):
			Buffer.consume(&"jump")
			_jump()
			return
	# 普攻打中后可以立刻用技能取消
	if not m.air and (can_cancel or landed) and _try_skill():
		return
	if not m.air and can_cancel and dash_cd <= 0 and Buffer.buffered(&"dash"):
		Buffer.consume(&"dash")
		_start_dash()
		return
	if mf >= m.total:
		move = null
		set_state(&"air" if z > 0.0 else &"idle")


# ---------- 技能（第 1 步只移植裂空斩，其余在第 2 步）----------
func _try_skill() -> bool:
	if z > 0.0 or not Buffer.buffered(&"skill1"):
		return false
	Buffer.consume(&"skill1")
	if skill_cd > 0 or mp < 15.0:
		main.spawn_label(body_point(1.3), "冷却中" if skill_cd > 0 else "魔力不足", Color("9fb3c8"), 18)
		main.play_sfx(&"deny")
		return false
	mp -= 15.0
	skill_cd = 150
	var m := MoveData.new()
	m.id = &"wave"
	m.total = 30
	m.cancel = 20
	m.swing_from = -2.3
	m.swing_to = 1.0
	m.heavy = true
	move = m
	mf = 0
	landed = false
	hit_sets = []
	set_state(&"attack")
	vx = 0.0
	vy = 0.0
	main.spawn_label(body_point(1.35), "裂空斩", glow, 28)
	return true


func _fire_wave() -> void:
	var w := WAVE_SCENE.instantiate()
	main.add_projectile(w, self)


# ---------- 受击 ----------
func take_hit(h: HitData, dir: int, dmg: int) -> bool:
	if invuln > 0 or state == &"dead" or state == &"down":
		return false
	hp = maxf(0.0, hp - dmg)
	flash = 6
	hp_changed.emit()
	move = null
	if hp <= 0.0:
		set_state(&"dead")
		vz = 8.0
		z = maxf(z, 0.01)
		vx = dir * 4.0
		return true
	if h.launch > 0.0 or z > 0.0:
		set_state(&"knock")
		vz = maxf(h.launch, 5.0)
		z = maxf(z, 0.01)
		vx = dir * h.kb
	else:
		set_state(&"hurt")
		hurt_t = h.stun
		vx = dir * h.kb
	facing = -dir
	invuln = 8
	return true


# ---------- 姿势（给占位模型；换成逐帧动画后改为播放对应动画）----------
func _update_view() -> void:
	view.facing = facing
	view.flash = flash > 3
	var p := {"lean": 0.0, "walk": walk, "crouch": 0.0, "angle": 0.7, "lie": 0.0, "lift": 0.0}
	match state:
		&"idle":
			p.walk = 0.0
			p.crouch = 0.08 + sin(Time.get_ticks_msec() * 0.0048) * 0.06
			p.angle = 0.75
		&"run":
			p.lean = 5.0
			p.angle = 1.0
			p.lift = 1.0
			p.back_angle = 1.35 - sin(walk) * 0.8
		&"air":
			p.walk = 1.2
			p.angle = -0.5 if vz > 0.0 else 0.4
			p.crouch = 0.3
			p.lift = 1.0
			p.back_angle = 2.4
		&"dash":
			p.lean = 12.0
			p.angle = 2.5
			p.crouch = 0.35
			p.walk = 1.4
			p.back_angle = 2.8
		&"hurt":
			p.lean = -8.0
			p.angle = 1.4
		&"knock":
			p.lie = minf(1.0, st / 14.0)
			p.angle = 2.0
		&"down", &"dead":
			p.lie = 1.0 - (st - 30) / 10.0 if state == &"down" and st > 30 else 1.0
			p.angle = 2.2
		&"attack":
			var at := move.first_hit_at() if move.id != &"wave" else 8
			var dur := move.first_hit_dur()
			var u := clampf(float(mf - at) / dur, 0.0, 1.0)
			p.angle = lerpf(move.swing_from, move.swing_to, 1.0 - (1.0 - u) * (1.0 - u))
			p.lean = -3.0 if mf < at else 7.0
			p.crouch = 0.25 if mf < at else 0.1
			p.walk = 0.6
			p.back_angle = 2.5
			if move.thrust:
				p.lean = 12.0
				p.crouch = 0.3
	view.pose = p
	modulate.a = 0.45 if invuln > 0 and (state == &"idle" or state == &"run") and (Time.get_ticks_msec() / 66) % 2 == 0 else 1.0
