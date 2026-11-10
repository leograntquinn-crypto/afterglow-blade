extends CharacterBody3D
## 腐骨兵代理体：正式版替换为图生 3D 模型。
const MAX_HP := 60
const WALK_SPEED := 1.6
const DETECT_RANGE := 14.0
const ATTACK_RANGE := 2.0
const HIT_RANGE := 2.2
const WINDUP := 21
const RECOVERY := 49
const COOLDOWN_MIN := 46
const COOLDOWN_MAX := 84
const CHAIN_WINDOW := 75
const BREAK_FRAMES := 80
const DEATH_FRAMES := 60
var stage: Node
var player: CharacterBody3D
var hp := MAX_HP
var state := "idle"
var state_t := 0
var cd := 30
var flash_t := 0
var stun_t := 0
var chain_n := 0
var chain_age := 999
var break_t := 0
var struck := false
var visual: Node3D
var sword: Node3D
var metal: StandardMaterial3D
var blade: StandardMaterial3D
var bar: MeshInstance3D
var death_t := 0
var _rng := RandomNumberGenerator.new()

func setup(owner_stage: Node, hero: CharacterBody3D) -> void:
	stage = owner_stage
	player = hero
	_rng.seed = 7
	collision_layer = 4
	collision_mask = 1
	var collision := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.height = 1.8
	capsule.radius = 0.32
	collision.shape = capsule
	collision.position.y = 0.9
	add_child(collision)
	visual = Node3D.new()
	add_child(visual)
	metal = stage._material(Color(0.13, 0.16, 0.19))
	metal.emission_enabled = true
	blade = stage._material(Color(0.45, 0.48, 0.55))
	blade.emission_enabled = true
	part(Vector3(0.55, 0.65, 0.3), Vector3(0, 1.05, 0), metal, visual)
	part(Vector3(0.42, 0.38, 0.38), Vector3(0, 1.6, 0), metal, visual)
	for side in [-1, 1]:
		part(Vector3(0.3, 0.24, 0.4), Vector3(side * 0.4, 1.32, 0), metal, visual)
		part(Vector3(0.19, 0.7, 0.22), Vector3(side * 0.18, 0.36, 0), metal, visual)
		var eye: StandardMaterial3D = stage._material(Color(1, 0.01, 0.01))
		eye.emission_enabled = true
		eye.emission = Color(1, 0, 0)
		eye.emission_energy_multiplier = 3
		part(Vector3(0.08, 0.06, 0.03), Vector3(side * 0.11, 1.63, 0.2), eye, visual)
	sword = Node3D.new()
	sword.position = Vector3(0.5, 1.0, 0.15)
	visual.add_child(sword)
	part(Vector3(0.12, 0.95, 0.08), Vector3(0, 0.42, 0), blade, sword)
	part(Vector3(0.35, 0.08, 0.15), Vector3.ZERO, metal, sword)
	bar = MeshInstance3D.new()
	var quad := QuadMesh.new()
	quad.size = Vector2(0.85, 0.08)
	bar.mesh = quad
	var red: StandardMaterial3D = stage._material(Color(0.95, 0.08, 0.06))
	red.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	red.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	bar.material_override = red
	bar.position.y = 2.05
	add_child(bar)
	bar.visible = false

func part(size: Vector3, at: Vector3, material: Material, parent: Node3D) -> void:
	var instance := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = size
	instance.mesh = box
	instance.material_override = material
	instance.position = at
	parent.add_child(instance)

func _physics_process(delta: float) -> void:
	if stage.frozen:
		return
	state_t += 1
	chain_age += 1
	if break_t > 0:
		break_t -= 1
	if flash_t > 0:
		flash_t -= 1
	metal.emission = Color.WHITE if flash_t > 0 else Color.BLACK
	bar.visible = hp > 0 and hp < MAX_HP
	bar.scale.x = maxf(float(hp) / MAX_HP, 0.01)
	if hp <= 0:
		death_t += 1
		visual.rotation.z = minf(death_t / 20.0, 1) * PI * 0.5
		if death_t >= DEATH_FRAMES:
			_fade(visual, 1.0 - (death_t - DEATH_FRAMES) / 30.0)
		if death_t >= DEATH_FRAMES + 30:
			queue_free()
		return
	if stun_t > 0:
		stun_t -= 1
		if stun_t == 0:
			state = "idle"
			state_t = 0
		return
	if stage.verify_mode or player.hp <= 0:
		return
	var offset := player.position - position
	offset.y = 0
	var distance := offset.length()
	if state != "atk" and distance > 0.01:
		visual.rotation.y = atan2(offset.x, offset.z)
	velocity = Vector3.ZERO
	match state:
		"idle", "walk":
			if cd > 0:
				cd -= 1
			if distance <= DETECT_RANGE and distance > ATTACK_RANGE:
				state = "walk"
				velocity = offset.normalized() * WALK_SPEED
			elif distance <= ATTACK_RANGE and cd <= 0:
				state = "atk"
				state_t = 0
				struck = false
			else:
				state = "idle"
		"atk":
			if state_t == WINDUP and not struck:
				struck = true
				if distance <= HIT_RANGE and visual.basis.z.dot(offset.normalized()) >= cos(deg_to_rad(70)):
					player.take_hit(visual.basis.z)
			if state_t >= RECOVERY:
				state = "idle"
				state_t = 0
				cd = _rng.randi_range(COOLDOWN_MIN, COOLDOWN_MAX)
	sword.rotation.x = -1.2 if state == "atk" and state_t < WINDUP else (1.3 if state == "atk" else 0.2)
	blade.emission = Color(1, 0.35, 0.08) if state == "atk" and state_t < WINDUP else Color.BLACK
	velocity.y = -2
	move_and_slide()

func _fade(node: Node, opacity: float) -> void:
	if node is GeometryInstance3D:
		node.transparency = clampf(1 - opacity, 0, 1)
	for child in node.get_children():
		_fade(child, opacity)

func take_hit(dmg: int, dir: Vector3, heavy: bool) -> void:
	if hp <= 0:
		return
	hp -= dmg
	flash_t = 4
	# 对应 2D 的 7/4 像素小击退，使用碰撞运动避免穿墙。
	move_and_collide(dir * (0.07 if heavy else 0.04))
	if hp <= 0:
		state = "down"
		return
	# 防连锁分支与 grunt.gd 同序同值，重击永远打断。
	if break_t > 0 and not heavy:
		return
	if chain_age <= CHAIN_WINDOW:
		chain_n += 1
	else:
		chain_n = 1
	chain_age = 0
	if chain_n >= 4 and not heavy:
		chain_n = 0
		break_t = BREAK_FRAMES
		return
	var mult := maxf(0.4, 1.0 - 0.2 * float(chain_n - 1))
	stun_t = maxi(4, int(round(20.0 * mult)))
	state = "hurt"
	state_t = 0
