class_name Enemy
extends Actor
## 腐骨兵：靠近 → 预警（红光 + 感叹号）→ 出刀。
## 受击反应：硬直 / 浮空（被连续浮空会越来越重）/ 砸地反弹 / 倒地（倒地无敌）

@export var speed := 1.7
@export var weight := 1.0
@export var attack_range := 62.0
@export var windup := 26
@export var recover := 34
@export var hit: HitData

var attack_cd := 0
var hitstun := 16
var juggle := 0          ## 被连续浮空的次数 —— 越多下落越快，防止无限连
var spiked := false
var bounced := false
var dead_t := 0
var slot := 0
var y_off := 0.0
var hit_once := false
var main: Node

@onready var view: FighterView = $Visual/Body
@onready var alert: Label = $Visual/Alert


func _ready() -> void:
	team = &"enemy"
	add_to_group(&"enemies")
	hp = max_hp
	hp_trail = max_hp
	attack_cd = randi_range(40, 100)
	y_off = randf_range(-40, 40)
	slot = get_index() % 3
	set_state(&"spawn")
	if hit == null:
		hit = HitData.new()
		hit.at = 4
		hit.dur = 5
		hit.box_x = 46.0
		hit.box_w = 76.0
		hit.box_d = 26.0
		hit.box_z1 = 90.0
		hit.dmg = 9.0
		hit.kb = 4.0
		hit.stun = 18
		hit.stop = 4
		hit.shake = 4.0
	view.look = {"rig": "grunt", "h": 82.0, "body": "#4a3b33", "limb": "#e2d7c0", "head": "#e8dcc4", "eye": "#ff5a3c", "blade": "#8d8178", "blade_len": 44.0}


var alive: bool:
	get: return state != &"dying"


func can_be_hit() -> bool:
	return alive and state != &"spawn" and state != &"down" and invuln <= 0


func set_state(s: StringName) -> void:
	# 离开出招状态时归还「攻击令牌」
	if (state == &"windup" or state == &"attack") and s != &"attack":
		Game.attackers.erase(self)
	super.set_state(s)


func _physics_process(_delta: float) -> void:
	if Game.frozen:
		return
	st += 1
	if flash > 0: flash -= 1
	if invuln > 0: invuln -= 1
	if attack_cd > 0: attack_cd -= 1
	hp_trail = maxf(hp, hp_trail - max_hp * 0.006) if hp_trail > hp else hp
	match state:
		&"spawn":
			if st >= 36: set_state(&"idle")
		&"idle": _think()
		&"windup":
			vx *= 0.7
			vy = 0.0
			if st >= windup:
				set_state(&"attack")
				vx = facing * 5.0
				hit_once = false
		&"attack": _attack()
		&"hurt":
			vx *= 0.85
			vy = 0.0
			if st >= hitstun: set_state(&"idle")
		&"air":
			vy = 0.0
		&"down":
			vx *= 0.8
			if st >= 46:
				set_state(&"idle")
				invuln = 24
				juggle = 0
		&"dying":
			vy = 0.0
			if z <= 0.0:
				vx *= 0.85
				dead_t += 1
				if dead_t > 45:
					queue_free()
	physics_step()
	_update_view()


# ---------- AI ----------
## 设计原则：敌人要「公平」——出招前有明显预警，同一时间最多 2 个敌人进攻
func _think() -> void:
	var p: Actor = main.player
	if p.state == &"dead":
		vx *= 0.8
		vy = 0.0
		return
	var dxp := p.gx - gx
	facing = int(signf(dxp)) if dxp != 0.0 else facing
	var tx: float
	var ty := p.gy
	if attack_cd > 0 or Game.attackers.size() >= 2:
		tx = p.gx - facing * (attack_range + 80 + slot * 30)
		ty = p.gy + y_off
	else:
		tx = p.gx - facing * attack_range * 0.7
	var mx := tx - gx
	var my := ty - gy
	vx = signf(mx) * minf(speed, absf(mx)) if absf(mx) > 6.0 else 0.0
	vy = signf(my) * minf(speed * 0.7, absf(my)) if absf(my) > 4.0 else 0.0
	if attack_cd <= 0 and absf(dxp) <= attack_range + 8 and absf(p.gy - gy) < 18 and Game.attackers.size() < 2:
		set_state(&"windup")
		Game.attackers.append(self)
		vx = 0.0
		vy = 0.0


func _attack() -> void:
	vx *= 0.8
	if st == hit.at:
		main.spawn_slash(self, null)
	if st >= hit.at and st < hit.at + hit.dur and not hit_once:
		var p: Actor = main.player
		if Combat.overlaps(Combat.box_of(self, hit), p) and main.apply_hit(self, p, hit, facing):
			hit_once = true
	if st >= recover:
		set_state(&"idle")
		attack_cd = randi_range(70, 130)


# ---------- 受击 ----------
func take_hit(h: HitData, dir: int, dmg: int) -> Dictionary:
	if not can_be_hit():
		return {}
	hp -= dmg
	flash = 6
	if hp <= 0.0:
		hp = 0.0
		set_state(&"dying")
		vz = maxf(h.launch, 7.0)
		z = maxf(z, 0.01)
		vx = dir * (h.kb + 3.0)
		remove_from_group(&"enemies")
		return {"killed": true}
	var airborne := z > 0.0 or h.launch > 0.0
	if airborne:
		juggle += 1
		var decay := maxf(0.3, 1.0 - juggle * 0.07)
		vz = -11.0 if h.spike else maxf(vz * 0.3, (h.launch if h.launch > 0.0 else 3.0) * decay / weight)
		z = maxf(z, 0.01)
		vx = dir * h.kb * 0.6
		spiked = h.spike
		set_state(&"air")
	else:
		set_state(&"hurt")
		hitstun = h.stun
		vx = dir * h.kb / weight
	facing = -dir
	return {"ok": true}


func gravity_scale() -> float:
	return 1.0 + juggle * 0.05


func on_land(v: float) -> void:
	if state == &"dying":
		main.spawn_dust(Vector2(gx, Game.GROUND_Y + gy), 8)
		return
	if state != &"air":
		return
	# 被砸下来或者摔得很重 → 弹起一次，给玩家追打的机会
	if spiked or (v < -9.0 and not bounced):
		var hard := spiked
		spiked = false
		bounced = true
		vz = 6.5 if hard else 4.0
		z = 0.01
		main.spawn_dust(Vector2(gx, Game.GROUND_Y + gy), 10)
		Game.shake(6.0 if hard else 3.0, 10)
		return
	bounced = false
	set_state(&"down")
	main.spawn_dust(Vector2(gx, Game.GROUND_Y + gy), 8)


# ---------- 画面 ----------
func _update_view() -> void:
	view.facing = facing
	view.flash = flash > 2
	var p := {"lean": 0.0, "walk": 0.0, "crouch": 0.0, "angle": 0.8, "lie": 0.0, "lift": 0.0}
	match state:
		&"idle":
			if vx != 0.0 or vy != 0.0:
				p.walk = st * 0.34
				p.lean = 3.0
				p.lift = 1.0
		&"windup":
			p.crouch = 0.3
			p.lean = -5.0
			p.angle = -2.3
		&"attack":
			p.lean = 8.0
			p.angle = lerpf(-2.3, 1.1, clampf((st - hit.at + 2) / 5.0, 0.0, 1.0))
		&"hurt":
			p.lean = -9.0
			p.angle = 1.5
			p.crouch = 0.15
		&"air", &"dying":
			p.lie = clampf(0.3 + st / 18.0, 0.0, 1.0) if z > 0.0 else 1.0
			p.angle = 2.2
		&"down":
			p.lie = maxf(0.0, 1.0 - (st - 34) / 12.0) if st > 34 else 1.0
			p.angle = 2.2
		&"spawn":
			p.crouch = maxf(0.0, 0.6 - st / 60.0)
	view.pose = p
	# 出招预警：红色脉动 + 感叹号
	alert.visible = state == &"windup"
	if state == &"windup":
		var k := 0.5 + 0.5 * sin(st * 0.6)
		view.modulate = Color(1.0 + k, 0.55, 0.55)
	else:
		view.modulate = Color.WHITE
	if state == &"spawn":
		modulate.a = minf(1.0, st / 24.0)
	elif state == &"dying" and z <= 0.0:
		modulate.a = maxf(0.0, 1.0 - dead_t / 45.0)
	else:
		modulate.a = 1.0
