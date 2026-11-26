extends CharacterBody3D
## 3D 玩家；所有帧计数以 60Hz 物理帧运行。
const MOVE_SPEED := 4.2
const RUN_CLIP_SPEED := 2.26 # run 片段自然速度实测（P0 诊断：Hip 位移 2.827m / 周期 1.25s）
const ACCEL := 28.0 # 起步/停步加速度（Fable 指导 ②.1：25–30 m/s²，约 0.15s 到满速/停稳）
const JUMP_SPEED := 5.2
const GRAVITY := 15.68
const TURN_SPEED := 10.0
const MAX_HP := 100
const ATTACK_FRAMES := 22
const CANCEL_FRAME := 10
const CONTACT_FRAME := 6
const REACH := 2.1
const HALF_ANGLE := 70.0
const DAMAGE := [12, 12, 16]
const HURT_FRAMES := 12
const KNOCKBACK := 1.2
const BODY_RADIUS := 0.3
const ATTACK_BUFFER := 10
const JUMP_BUFFER := 8
const MAGNET_RADIUS := 4.0
const MAGNET_HALF_ANGLE := 60.0
const MAGNET_STANDOFF := 1.52
const MAGNET_SEG := [2.0, 2.0, 2.6]
const MAGNET_NO_TARGET := 0.28
var stage: Node
var model_path := "res://art/models/feisun_gen4.glb"
var visual: Node3D
var hp := MAX_HP
var state := "idle"
var state_t := 0
var atk_idx := 0
var buffered := false
var direction := Vector3.ZERO
var attack := false
var jump := false
var previous_attack := false
var previous_jump := false
var freeze_t := 0
var buf_attack_age := 999
var buf_jump_age := 999
var anim_speed := 1.0
var magnet_target: Node3D
var magnet_remaining := 0.0
var magnet_dir := Vector3.FORWARD
var shake_t := 0
var shake_amp := 0.0
var shake_dir := Vector3.FORWARD
var spring_runtime: Node
var spring_count := 0
var body_radius := BODY_RADIUS
var flash_t := 0
var flash: StandardMaterial3D
var arcs: Array = []
var anim_player: AnimationPlayer
var cur_anim := ""

func setup(owner_stage: Node) -> void:
	stage = owner_stage
	collision_layer = 2
	collision_mask = 1 | 4
	var shape := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.3
	capsule.height = 1.7
	shape.shape = capsule
	shape.position.y = 0.85
	add_child(shape)
	visual = Node3D.new()
	visual.rotation.y = PI
	add_child(visual)
	var model := (load(model_path) as PackedScene).instantiate() as Node3D
	var bounds: Array = []
	stage._mesh_bounds(model, Transform3D.IDENTITY, bounds)
	var box: AABB = bounds[0]
	var factor := 1.7 / box.size.y
	var normalized := Node3D.new()
	normalized.scale = Vector3.ONE * factor
	normalized.position = Vector3(-box.get_center().x, -box.position.y, -box.get_center().z) * factor
	visual.add_child(normalized)
	normalized.add_child(model)
	_setup_animation(model)
	var spring_script := load("res://scripts/spring_bone_runtime.gd") as Script
	spring_runtime = spring_script.new()
	add_child(spring_runtime)
	spring_count = spring_runtime.setup(model)
	flash = StandardMaterial3D.new()
	flash.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	flash.albedo_color = Color(1, 0.08, 0.03, 0.65)
	flash.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA

func _setup_animation(model: Node) -> void:
	var players := model.find_children("*", "AnimationPlayer", true, false)
	if players.is_empty():
		return
	anim_player = players[0] as AnimationPlayer
	for loop_name in ["idle", "walk", "run"]:
		var a := anim_player.get_animation(loop_name)
		if a:
			a.loop_mode = Animation.LOOP_LINEAR
	# 注意：S1 资产暂缺 attack1（劈砍）与 jump 两段，待真实片段补入后自动生效；
	# 此处不做别名冒充（不用 attack2 顶 attack1、不用 run 顶 jump），缺段时 _play_anim 自动跳过。
	# 位移由胶囊控制器驱动：把所有片段 Hip 的水平行进钉掉，只保留纵向起伏。
	var skels := model.find_children("*", "Skeleton3D", true, false)
	var skel := skels[0] as Skeleton3D if not skels.is_empty() else null
	for anim_name in anim_player.get_animation_list():
		_pin_root(anim_player.get_animation(anim_name), skel)
	_play_anim("idle", 1.0)

func _pin_root(anim: Animation, skel: Skeleton3D) -> void:
	if anim == null:
		return
	for t in anim.get_track_count():
		if anim.track_get_type(t) != Animation.TYPE_POSITION_3D:
			continue
		var path := anim.track_get_path(t)
		if path.get_subname_count() == 0:
			continue
		var bone_name := String(path.get_subname(0))
		if bone_name != "Hip" and bone_name != "Hips":
			continue
		var keys := anim.track_get_key_count(t)
		if keys == 0:
			continue
		# 轨道数值在父骨坐标系里表达，轴向与世界轴不一致（S1 的行进大头在轨道 Y 分量上），
		# 不能按分量硬钉：把世界 Up 换算进父骨坐标系，只保留位移沿 Up 的分量（纵向起伏）。
		var up := Vector3.UP
		if skel != null:
			var bi := skel.find_bone(bone_name)
			if bi >= 0:
				var up_skel := (skel.global_transform.basis.inverse() * Vector3.UP).normalized()
				var parent := skel.get_bone_parent(bi)
				if parent >= 0:
					up = (skel.get_bone_global_rest(parent).basis.inverse() * up_skel).normalized()
				else:
					up = up_skel
		var first: Vector3 = anim.track_get_key_value(t, 0)
		for k in keys:
			var v: Vector3 = anim.track_get_key_value(t, k)
			var d := v - first
			anim.track_set_key_value(t, k, first + up * d.dot(up))

func _play_anim(anim_name: String, speed: float, from_time := -1.0) -> void:
	anim_speed = speed
	if anim_player == null or not anim_player.has_animation(anim_name):
		return
	if cur_anim == anim_name and anim_player.is_playing():
		return
	cur_anim = anim_name
	anim_player.speed_scale = speed
	anim_player.play(anim_name, 0.12)
	if from_time >= 0.0:
		anim_player.seek(from_time, true)

func forward() -> Vector3:
	return visual.basis.z.normalized()

func _overlay(node: Node, enabled: bool) -> void:
	if node is MeshInstance3D:
		node.material_overlay = flash if enabled else null
	for child in node.get_children():
		_overlay(child, enabled)

func _physics_process(delta: float) -> void:
	var pressed := attack and not previous_attack
	var jumped := jump and not previous_jump
	previous_attack = attack
	previous_jump = jump
	if pressed:
		buf_attack_age = 0
	if jumped:
		buf_jump_age = 0
	if buf_attack_age < 999:
		buf_attack_age += 1
	if buf_jump_age < 999:
		buf_jump_age += 1
	for arc in arcs.duplicate():
		arc.life -= delta
		arc.mesh.material_override.albedo_color.a = maxf(arc.life / 0.12, 0.0)
		if arc.life <= 0:
			arc.mesh.queue_free()
			arcs.erase(arc)
	if freeze_t > 0:
		freeze_t -= 1
		if spring_runtime != null:
			spring_runtime.set_frozen(true)
		if anim_player != null:
			anim_player.speed_scale = 0.0
		if shake_t > 0:
			_shake_apply()
		return
	if anim_player != null:
		anim_player.speed_scale = anim_speed
	if spring_runtime != null:
		spring_runtime.set_frozen(false)
	state_t += 1
	flash_t = maxi(0, flash_t - 1)
	_overlay(visual, flash_t > 0)
	if shake_t > 0:
		shake_t -= 1
		_shake_apply()
	else:
		visual.position = Vector3.ZERO
	if hp <= 0:
		return
	match state:
		"attack":
			if state_t == CONTACT_FRAME:
				collision_mask = 1 | 4
				_do_hit()
			if 1 <= state_t and state_t < CONTACT_FRAME:
				_magnet_step(delta)
			if state_t == CANCEL_FRAME:
				if buf_attack_age <= ATTACK_BUFFER:
					buffered = true
				buf_attack_age = 999
			velocity.x = move_toward(velocity.x, 0, 8 * delta)
			velocity.z = move_toward(velocity.z, 0, 8 * delta)
			if state_t >= ATTACK_FRAMES:
				collision_mask = 1 | 4
				if buffered and atk_idx < 2:
					start_attack(atk_idx + 1)
				else:
					state = "idle"
		"hurt":
			if state_t >= HURT_FRAMES:
				state = "idle"
		_:
			if buf_attack_age <= ATTACK_BUFFER:
				start_attack(0)
				buf_attack_age = 999
			velocity.x = move_toward(velocity.x, direction.x * MOVE_SPEED, ACCEL * delta)
			velocity.z = move_toward(velocity.z, direction.z * MOVE_SPEED, ACCEL * delta)
			if direction.length_squared() > 0.001:
				visual.rotation.y = lerp_angle(visual.rotation.y, atan2(direction.x, direction.z), minf(TURN_SPEED * delta, 1))
			if not is_on_floor():
				_play_anim("jump", 1.5)
			elif direction.length_squared() > 0.001:
				_play_anim("run", MOVE_SPEED / RUN_CLIP_SPEED) # B 路线临时同步：播放倍速对齐足速与移速，P1 的 A 路线 4.2m/s 片段到位后回 1.0
			else:
				_play_anim("idle", 1.0)
			if buf_jump_age <= JUMP_BUFFER and is_on_floor():
				velocity.y = JUMP_SPEED
				buf_jump_age = 999
	if not is_on_floor():
		velocity.y -= GRAVITY * delta
	move_and_slide()
	position.x = clampf(position.x, -29.25, 29.25)
	position.z = clampf(position.z, -29.25, 29.25)

func start_attack(index: int) -> void:
	state = "attack"
	state_t = 0
	atk_idx = index
	buffered = false
	buf_attack_age = 999
	collision_mask = 1
	velocity = Vector3.ZERO
	_acquire_target()
	velocity.x = magnet_dir.x * 1.2
	velocity.z = magnet_dir.z * 1.2
	_slash()
	# 片段本体 5.3s，从挥砍段（约 1.0s 处）起播并加速，让接触帧落在挥砍动作上；判定仍走帧数据。
	_play_anim("attack1" if index == 0 else "attack2", 5.0, 1.0)

func _acquire_target() -> void:
	magnet_target = null
	magnet_remaining = 0.0
	magnet_dir = forward()
	var dir := direction if direction.length_squared() > 0.001 else forward()
	var best_score := 1e9
	var best: Node3D = null
	var best_offset := Vector3.ZERO
	for enemy in stage.enemies:
		if not is_instance_valid(enemy) or enemy.hp <= 0:
			continue
		var offset: Vector3 = enemy.position - position
		var dy: float = absf(offset.y)
		offset.y = 0.0
		var d: float = offset.length()
		if d < 0.05 or d > MAGNET_RADIUS or dy > 1.0:
			continue
		var angle: float = absf(wrapf(atan2(offset.x, offset.z) - atan2(dir.x, dir.z), -PI, PI))
		if angle > deg_to_rad(MAGNET_HALF_ANGLE):
			continue
		var score: float = d / MAGNET_RADIUS + angle / deg_to_rad(MAGNET_HALF_ANGLE) * 0.8
		if score < best_score:
			best_score = score
			best = enemy
			best_offset = offset
	if best != null:
		magnet_target = best
		magnet_dir = best_offset.normalized() if best_offset.length_squared() > 0.001 else forward()
		visual.rotation.y = atan2(magnet_dir.x, magnet_dir.z)
		magnet_remaining = minf(best_offset.length() - MAGNET_STANDOFF, MAGNET_SEG[atk_idx])
		if magnet_remaining < 0.0:
			magnet_remaining = 0.0
	else:
		magnet_remaining = MAGNET_NO_TARGET

func _magnet_step(delta: float) -> void:
	if magnet_remaining <= 0.0:
		return
	var frames_left := maxf(1.0, float(CONTACT_FRAME - state_t))
	var step: float = minf(magnet_remaining / frames_left, magnet_remaining)
	if magnet_target == null:
		step = minf(step, MAGNET_NO_TARGET / float(CONTACT_FRAME - 1))
	var move := magnet_dir * step
	var target_d := magnet_remaining
	if magnet_target != null and is_instance_valid(magnet_target) and magnet_target.hp > 0:
		var offset := magnet_target.position - position
		offset.y = 0.0
		target_d = offset.length()
		if target_d > MAGNET_STANDOFF:
			var wanted: float = minf(magnet_remaining / frames_left, target_d - MAGNET_STANDOFF)
			move = offset.normalized() * wanted
			step = wanted
	var coll := move_and_collide(move)
	if coll != null:
		magnet_remaining = 0.0
		return
	magnet_remaining -= step
	if magnet_target != null and is_instance_valid(magnet_target) and state_t >= CONTACT_FRAME - 1:
		var final_offset := magnet_target.global_position - global_position
		final_offset.y = 0.0
		if final_offset.length() > MAGNET_STANDOFF:
			global_position = magnet_target.global_position - final_offset.normalized() * MAGNET_STANDOFF
			global_position.y = position.y
			magnet_remaining = 0.0

func _shake_apply() -> void:
	var shake := shake_dir
	shake.y = 0.0
	if shake.length_squared() > 0.0001:
		shake = shake.normalized()
	visual.position = shake * shake_amp * cos(state_t * PI)

func _do_hit() -> void:
	for enemy in stage.enemies:
		if not is_instance_valid(enemy) or enemy.hp <= 0:
			continue
		var offset: Vector3 = enemy.position - position
		offset.y = 0
		if offset.length() <= REACH and (offset.length() < 0.01 or forward().dot(offset.normalized()) >= cos(deg_to_rad(HALF_ANGLE))):
			var before: int = enemy.hp
			var heavy := atk_idx == 2
			enemy.take_hit(DAMAGE[atk_idx], forward(), heavy)
			stage.apply_hitstop(self, enemy, heavy)
			stage.record_hit(atk_idx, before, enemy.hp)
			stage.add_trauma(0.32 if heavy else 0.25)

func take_hit(from_dir: Vector3) -> void:
	if state == "hurt" or hp <= 0:
		return
	hp = maxi(0, hp - 8)
	state = "hurt"
	state_t = 0
	flash_t = 4
	freeze_t = maxi(freeze_t, 4)
	_shake(-from_dir, 0.03, 4)
	_play_anim("death" if hp <= 0 else "hit", 1.0 if hp <= 0 else 4.0)
	velocity.x = from_dir.x * KNOCKBACK / (HURT_FRAMES / 60.0)
	velocity.z = from_dir.z * KNOCKBACK / (HURT_FRAMES / 60.0)

func _shake(dir: Vector3, amp: float, frames: int) -> void:
	shake_dir = dir
	shake_amp = amp
	shake_t = frames

func _slash() -> void:
	# 占位弧形刃光：正式版换 CG 特效素材。
	var mesh := ImmediateMesh.new()
	mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in range(24):
		var a := deg_to_rad(-70.0 + i * 140.0 / 24)
		var b := deg_to_rad(-70.0 + (i + 1) * 140.0 / 24)
		for v in [Vector3(sin(a), 0, cos(a)) * 0.65, Vector3(sin(a), 0, cos(a)) * REACH, Vector3(sin(b), 0, cos(b)) * REACH, Vector3(sin(a), 0, cos(a)) * 0.65, Vector3(sin(b), 0, cos(b)) * REACH, Vector3(sin(b), 0, cos(b)) * 0.65]:
			mesh.surface_set_color(Color(0.4, 0.85, 1, 1 if v.length() > 1 else 0))
			mesh.surface_add_vertex(v)
	mesh.surface_end()
	var instance := MeshInstance3D.new()
	instance.mesh = mesh
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	material.vertex_color_use_as_albedo = true
	instance.material_override = material
	stage.add_child(instance)
	instance.position = position + Vector3.UP * 1.0
	instance.rotation.y = visual.rotation.y
	arcs.append({"mesh": instance, "life": 0.12})
