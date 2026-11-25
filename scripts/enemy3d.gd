extends CharacterBody3D
## 地面腐骨兵 AI + 可选烬翼模型/飞行状态机；帧更新按 60Hz。
const MAX_HP := 60
const MOVE_SPEED := 1.6
const HIT_RANGE := 2.0
const WINDUP := 21
const RECOVER_END := 49
const COOLDOWN_MIN := 46
const COOLDOWN_MAX := 84
const CHAIN_WINDOW := 75
const BREAK_FRAMES := 80
const DEATH_FRAMES := 60
const BODY_RADIUS := 0.32
const JINYI_MODEL := "res://art/models/jinyi.glb"
const GRUNT_MODELS := ["res://art/models/enemy_grunt.glb", "res://art/models/grunt3d.glb", "res://art/models/corrupted_soldier.glb"]
const FLY_HEIGHT := 3.0
const FLY_SPEED := 2.2
const FLY_ATTACK_RANGE := 2.0
const FLY_ATTACK_PERIOD := 1.4

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
var freeze_t := 0
var shake_t := 0
var shake_amp := 0.0
var shake_dir := Vector3.FORWARD
var knock_t := 0
var knock_total := 0
var knock_dir := Vector3.ZERO
var knock_dist := 0.0
var body_radius := BODY_RADIUS
var visual: Node3D
var sword: Node3D
var metal: StandardMaterial3D
var blade: StandardMaterial3D
var bar: MeshInstance3D
var death_t := 0
var _rng := RandomNumberGenerator.new()
var is_flying := false
var model_path := ""
var anim_player: AnimationPlayer
var cur_anim := ""
var _fly_attack_t := 0.0
var _home_y := 0.05

func setup(owner_stage: Node, target: CharacterBody3D, flying := false) -> void:
	stage = owner_stage
	player = target
	is_flying = flying
	collision_layer = 4
	collision_mask = 1 | 2 | 4
	_rng.randomize()
	if is_flying and ResourceLoader.exists(JINYI_MODEL):
		model_path = JINYI_MODEL
		_setup_flying_model()
	elif not is_flying and not GRUNT_MODELS.filter(func(p): return ResourceLoader.exists(p)).is_empty():
		model_path = GRUNT_MODELS.filter(func(p): return ResourceLoader.exists(p))[0]
		_setup_asset_model()
	else:
		_setup_ground_model()
	_build_hp_bar()
	if is_flying:
		state = "hover"
		_home_y = FLY_HEIGHT

func _setup_ground_model() -> void:
	var capsule := CapsuleShape3D.new()
	capsule.radius = BODY_RADIUS
	capsule.height = 1.55
	var cs := CollisionShape3D.new()
	cs.shape = capsule
	cs.position.y = 0.78
	add_child(cs)
	visual = Node3D.new()
	add_child(visual)
	metal = StandardMaterial3D.new()
	metal.albedo_color = Color(0.12, 0.14, 0.18)
	metal.metallic = 0.65
	metal.roughness = 0.35
	blade = StandardMaterial3D.new()
	blade.albedo_color = Color(0.18, 0.2, 0.24)
	blade.metallic = 0.85
	blade.roughness = 0.2
	blade.emission_enabled = true
	blade.emission = Color.BLACK
	part(BoxMesh.new(), Vector3(0, 0.9, 0), Vector3(0.62, 0.78, 0.34), metal)
	part(SphereMesh.new(), Vector3(0, 1.52, 0), Vector3(0.34, 0.34, 0.34), metal)
	var eye := StandardMaterial3D.new()
	eye.albedo_color = Color(1, 0.05, 0.015)
	eye.emission_enabled = true
	eye.emission = Color(1, 0.02, 0.0) * 3.0
	part(BoxMesh.new(), Vector3(0, 1.55, 0.18), Vector3(0.2, 0.07, 0.04), eye)
	part(BoxMesh.new(), Vector3(-0.42, 0.42, 0), Vector3(0.2, 0.78, 0.23), metal)
	part(BoxMesh.new(), Vector3(0.42, 0.42, 0), Vector3(0.2, 0.78, 0.23), metal)
	part(BoxMesh.new(), Vector3(-0.39, 1.05, 0), Vector3(0.18, 0.62, 0.2), metal)
	part(BoxMesh.new(), Vector3(0.39, 1.05, 0), Vector3(0.18, 0.62, 0.2), metal)
	sword = part(BoxMesh.new(), Vector3(0.55, 0.82, 0.15), Vector3(0.11, 0.85, 0.12), blade)
	sword.rotation.x = 0.2

func _setup_asset_model() -> void:
	var capsule := CapsuleShape3D.new()
	capsule.radius = BODY_RADIUS
	capsule.height = 1.55
	var cs := CollisionShape3D.new()
	cs.shape = capsule
	cs.position.y = 0.78
	add_child(cs)
	visual = Node3D.new()
	add_child(visual)
	var packed := load(model_path) as PackedScene
	if packed == null:
		_setup_ground_model()
		return
	var model := packed.instantiate() as Node3D
	visual.add_child(model)
	var bounds: Array = []
	stage._mesh_bounds(model, Transform3D.IDENTITY, bounds)
	if not bounds.is_empty():
		var box: AABB = bounds[0]
		var factor := 1.7 / maxf(box.size.y, 0.001)
		model.scale = Vector3.ONE * factor
		model.position = Vector3(-box.get_center().x, -box.position.y, -box.get_center().z) * factor
	var aps := model.find_children("*", "AnimationPlayer", true, false)
	if not aps.is_empty():
		anim_player = aps[0] as AnimationPlayer

func _setup_flying_model() -> void:
	var capsule := SphereShape3D.new()
	capsule.radius = 0.4
	var cs := CollisionShape3D.new()
	cs.shape = capsule
	add_child(cs)
	visual = Node3D.new()
	add_child(visual)
	var packed := load(model_path) as PackedScene
	if packed == null:
		is_flying = false
		_setup_ground_model()
		return
	var model := packed.instantiate() as Node3D
	visual.add_child(model)
	var bounds: Array = []
	stage._mesh_bounds(model, Transform3D.IDENTITY, bounds)
	if not bounds.is_empty():
		var box: AABB = bounds[0]
		var factor := 1.5 / maxf(box.size.y, 0.001)
		model.scale = Vector3.ONE * factor
		model.position = Vector3(-box.get_center().x, -box.position.y, -box.get_center().z) * factor
	var aps := model.find_children("*", "AnimationPlayer", true, false)
	if not aps.is_empty():
		anim_player = aps[0] as AnimationPlayer
	_play_fly_anim("hover")

func _build_hp_bar() -> void:
	var bar_mesh := BoxMesh.new()
	bar_mesh.size = Vector3(0.8, 0.08, 0.04)
	bar = MeshInstance3D.new()
	bar.mesh = bar_mesh
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(0.75, 0.08, 0.05)
	bar.material_override = mat
	bar.position.y = 2.0
	add_child(bar)

func part(mesh: Mesh, at: Vector3, size: Vector3, material: Material) -> MeshInstance3D:
	var instance := MeshInstance3D.new()
	instance.mesh = mesh
	instance.position = at
	instance.scale = size
	instance.material_override = material
	visual.add_child(instance)
	return instance

func _play_fly_anim(name: String) -> void:
	if anim_player == null or not anim_player.has_animation(name):
		return
	if cur_anim == name and anim_player.is_playing():
		return
	cur_anim = name
	anim_player.play(name, 0.12)

func _physics_process(delta: float) -> void:
	if freeze_t > 0:
		freeze_t -= 1
		if shake_t > 0:
			shake_t -= 1
			_shake_apply()
		return
	if shake_t > 0:
		shake_t -= 1
		_shake_apply()
	else:
		if visual != null:
			visual.position = Vector3.ZERO
	state_t += 1
	cd = maxi(0, cd - 1)
	chain_age += 1
	break_t = maxi(0, break_t - 1)
	stun_t = maxi(0, stun_t - 1)
	flash_t = maxi(0, flash_t - 1)
	if hp <= 0:
		if is_flying and state != "down":
			state = "fall"
			_play_fly_anim("fall")
		if state == "fall":
			velocity = Vector3.DOWN * 2.5
			move_and_slide()
			if is_on_floor():
				state = "down"
				death_t = 0
			return
		state = "down"
		death_t += 1
		if death_t > DEATH_FRAMES:
			queue_free()
		return
	if stage.verify_mode:
		return
	if is_flying:
		_fly_ai(delta)
	else:
		_ground_ai(delta)
	_update_hp_bar()

func _ground_ai(delta: float) -> void:
	if not is_instance_valid(player):
		return
	var offset := player.position - position
	offset.y = 0.0
	var distance := offset.length()
	if distance > 0.05:
		visual.rotation.y = lerp_angle(visual.rotation.y, atan2(offset.x, offset.z), minf(8 * delta, 1))
	if break_t > 0 or stun_t > 0 or state == "hurt":
		velocity.x = move_toward(velocity.x, 0, MOVE_SPEED * 4 * delta)
		velocity.z = move_toward(velocity.z, 0, MOVE_SPEED * 4 * delta)
	else:
		if state == "idle" or state == "walk":
			if distance > HIT_RANGE:
				state = "walk"
				if distance > 0.01:
					velocity.x = offset.normalized().x * MOVE_SPEED
					velocity.z = offset.normalized().z * MOVE_SPEED
			else:
				velocity.x = 0.0
				velocity.z = 0.0
				if cd == 0:
					state = "atk"
					state_t = 0
					struck = false
		elif state == "atk":
			velocity.x = 0.0
			velocity.z = 0.0
			if state_t == WINDUP and not struck:
				struck = true
				if distance <= HIT_RANGE and visual.basis.z.dot(offset.normalized()) >= cos(deg_to_rad(70)):
					player.take_hit(visual.basis.z)
					player.freeze_t = maxi(player.freeze_t, 4)
					player._shake(-visual.basis.z, 0.03, 4)
					freeze_t = maxi(freeze_t, 3)
					_shake(visual.basis.z, 0.03, 3)
			if state_t >= RECOVER_END:
				state = "idle"
				cd = _rng.randi_range(COOLDOWN_MIN, COOLDOWN_MAX)
		if state != "atk":
			if sword != null:
				sword.rotation.x = 0.2
		else:
			if sword != null:
				sword.rotation.x = -1.2 if state_t < WINDUP else 1.3
			if blade != null:
				blade.emission = Color(1, 0.35, 0.08) if state_t < WINDUP else Color.BLACK
	_sync_asset_anim()
	if knock_t > 0:
		move_and_collide(knock_dir * (knock_dist / float(knock_total)))
		knock_t -= 1
	velocity.y = -2
	move_and_slide()

func _fly_ai(delta: float) -> void:
	if not is_instance_valid(player):
		return
	if state == "fall":
		velocity = Vector3.DOWN * 2.5
		move_and_slide()
		if is_on_floor():
			state = "down"
		return
	_fly_attack_t += delta
	var to_player := player.global_position - global_position
	var horizontal := Vector3(to_player.x, 0.0, to_player.z)
	var d := horizontal.length()
	var desired := player.global_position + Vector3.UP * FLY_HEIGHT
	if d > FLY_ATTACK_RANGE + 0.35:
		state = "move"
		_play_fly_anim("fly")
		var dir := (desired - global_position).normalized()
		velocity = dir * FLY_SPEED
	else:
		state = "hover"
		_play_fly_anim("hover")
		velocity = Vector3.ZERO
		global_position.y = lerpf(global_position.y, player.global_position.y + FLY_HEIGHT, 1.0 - exp(-2.0 * delta))
		if _fly_attack_t >= FLY_ATTACK_PERIOD:
			_fly_attack_t = 0.0
			state = "atk"
			_play_fly_anim("dive")
			if d <= FLY_ATTACK_RANGE and player.has_method("take_hit"):
				player.take_hit(horizontal.normalized())
				player.freeze_t = maxi(player.freeze_t, 4)
		move_and_slide()
	if state == "hurt":
		_play_fly_anim("hit")
	if visual != null and horizontal.length_squared() > 0.001:
		visual.rotation.y = lerp_angle(visual.rotation.y, atan2(horizontal.x, horizontal.z), minf(6.0 * delta, 1.0))

func _play_enemy_anim(name: String) -> void:
	if anim_player == null or not anim_player.has_animation(name):
		return
	if cur_anim == name and anim_player.is_playing():
		return
	cur_anim = name
	anim_player.play(name, 0.12)

func _sync_asset_anim() -> void:
	if anim_player == null:
		return
	match state:
		"walk", "move":
			_play_enemy_anim("walk")
		"atk":
			_play_enemy_anim("attack" if anim_player.has_animation("attack") else "atk")
		"hurt":
			_play_enemy_anim("hit")
		"down", "fall":
			_play_enemy_anim("death" if anim_player.has_animation("death") else "down")
		_:
			_play_enemy_anim("idle")

func _update_hp_bar() -> void:
	if bar != null:
		bar.scale.x = maxf(0.01, float(hp) / float(MAX_HP))

func _start_knockback(dir: Vector3, heavy: bool) -> void:
	knock_dir = Vector3(dir.x, 0.0, dir.z)
	if knock_dir.length_squared() > 0.0001:
		knock_dir = knock_dir.normalized()
	knock_total = 10 if heavy else 6
	knock_t = knock_total
	knock_dist = 0.8 if heavy else 0.25

func _shake(dir: Vector3, amp: float, frames: int) -> void:
	shake_dir = dir
	shake_amp = amp
	shake_t = frames

func _shake_apply() -> void:
	if visual == null:
		return
	var shake := shake_dir
	shake.y = 0.0
	if shake.length_squared() > 0.0001:
		shake = shake.normalized()
	visual.position = shake * shake_amp * cos((state_t - shake_t) * PI)

func take_hit(dmg: int, dir: Vector3, heavy: bool) -> void:
	if hp <= 0:
		return
	hp -= dmg
	flash_t = 4
	if hp <= 0:
		state = "down"
		if is_flying:
			state = "fall"
			_play_fly_anim("fall")
		return
	_start_knockback(dir, heavy)
	_shake(dir, 0.06 if heavy else 0.035, 8 if heavy else 5)
	if is_flying:
		state = "hurt"
		state_t = 0
		_play_fly_anim("hit")
		return
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
