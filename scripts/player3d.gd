extends CharacterBody3D
## 3D 玩家；所有帧计数以 60Hz 物理帧运行。
const MOVE_SPEED := 4.2
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
var stage: Node
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
var flash_t := 0
var flash: StandardMaterial3D
var arcs: Array = []

func setup(owner_stage: Node) -> void:
	stage = owner_stage
	collision_layer = 2
	collision_mask = 1
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
	var model := (load("res://art/models/heroine3d.glb") as PackedScene).instantiate() as Node3D
	var bounds: Array = []
	stage._mesh_bounds(model, Transform3D.IDENTITY, bounds)
	var box: AABB = bounds[0]
	var factor := 1.7 / box.size.y
	var normalized := Node3D.new()
	normalized.scale = Vector3.ONE * factor
	normalized.position = Vector3(-box.get_center().x, -box.position.y, -box.get_center().z) * factor
	visual.add_child(normalized)
	normalized.add_child(model)
	flash = StandardMaterial3D.new()
	flash.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	flash.albedo_color = Color(1, 0.08, 0.03, 0.65)
	flash.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA

func forward() -> Vector3:
	return visual.basis.z.normalized()

func _overlay(node: Node, enabled: bool) -> void:
	if node is MeshInstance3D:
		node.material_overlay = flash if enabled else null
	for child in node.get_children():
		_overlay(child, enabled)

func _physics_process(delta: float) -> void:
	if stage.frozen:
		return
	for arc in arcs.duplicate():
		arc.life -= delta
		arc.mesh.material_override.albedo_color.a = maxf(arc.life / 0.12, 0.0)
		if arc.life <= 0:
			arc.mesh.queue_free()
			arcs.erase(arc)
	var pressed := attack and not previous_attack
	var jumped := jump and not previous_jump
	previous_attack = attack
	previous_jump = jump
	state_t += 1
	flash_t = maxi(0, flash_t - 1)
	_overlay(visual, flash_t > 0)
	if hp <= 0:
		return
	match state:
		"attack":
			if state_t == CONTACT_FRAME:
				_do_hit()
			if pressed and state_t >= CANCEL_FRAME:
				buffered = true
			velocity.x = move_toward(velocity.x, 0, 8 * delta)
			velocity.z = move_toward(velocity.z, 0, 8 * delta)
			if state_t >= ATTACK_FRAMES:
				if buffered and atk_idx < 2:
					start_attack(atk_idx + 1)
				else:
					state = "idle"
		"hurt":
			if state_t >= HURT_FRAMES:
				state = "idle"
		_:
			velocity.x = direction.x * MOVE_SPEED
			velocity.z = direction.z * MOVE_SPEED
			if direction.length_squared() > 0.001:
				visual.rotation.y = lerp_angle(visual.rotation.y, atan2(direction.x, direction.z), minf(TURN_SPEED * delta, 1))
			if pressed:
				start_attack(0)
			elif jumped and is_on_floor():
				velocity.y = JUMP_SPEED
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
	velocity.x = forward().x * 1.2
	velocity.z = forward().z * 1.2
	_slash()

func _do_hit() -> void:
	for enemy in stage.enemies:
		if not is_instance_valid(enemy) or enemy.hp <= 0:
			continue
		var offset: Vector3 = enemy.position - position
		offset.y = 0
		if offset.length() <= REACH and (offset.length() < 0.01 or forward().dot(offset.normalized()) >= cos(deg_to_rad(HALF_ANGLE))):
			var before: int = enemy.hp
			enemy.take_hit(DAMAGE[atk_idx], forward(), atk_idx == 2)
			stage.record_hit(atk_idx, before, enemy.hp)
			stage.hitstop(8 if atk_idx == 2 else 6)
			stage.add_trauma(0.32 if atk_idx == 2 else 0.25)

func take_hit(from_dir: Vector3) -> void:
	if state == "hurt" or hp <= 0:
		return
	hp = maxi(0, hp - 8)
	state = "hurt"
	state_t = 0
	flash_t = 4
	velocity.x = from_dir.x * KNOCKBACK / (HURT_FRAMES / 60.0)
	velocity.z = from_dir.z * KNOCKBACK / (HURT_FRAMES / 60.0)

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
