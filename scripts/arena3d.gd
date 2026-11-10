extends Node3D
## 3D 墓穴方向验证；原始输入，不修改 InputMap 或主场景。

const MOVE_SPEED := 4.2 # 移动速度（米/秒）
const JUMP_SPEED := 5.2 # 跳跃初速度（米/秒）
const GRAVITY := 9.8 * 1.6 # 重力加速度
const TURN_SPEED := 10.0 # 平滑转身速度
const HERO_HEIGHT := 1.7 # 模型目标高度（米）
const ARENA_HALF := 30.0 # 60×60 米场地
const CAMERA_DISTANCE := 6.5 # 默认相机距离
const CAMERA_MIN := 4.0 # 滚轮最近距离
const CAMERA_MAX := 10.0 # 滚轮最远距离
const MOUSE_SENSITIVITY := 0.006
const DEMO_LEG_SECONDS := 1.8 # 北、东、南、西，每段走 1.8 秒
const SHOT_TIMES := [1.2, 3.0, 4.8, 6.6]

var _hero: CharacterBody3D
var _visual: Node3D
var _rig: Node3D
var _arm: SpringArm3D
var _yaw := 0.0
var _pitch := -0.32
var _distance := CAMERA_DISTANCE
var _time := 0.0
var _demo := false
var _capture := false
var _shots := 0
var _capturing := false
var _jump_was_down := false
var _demo_jumped := false

func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	_demo = "--demo" in args
	_capture = "--capture" in args
	_build_arena()
	_build_hero()
	_build_camera()

func _material(color: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.93
	return material

func _solid(mesh: Mesh, at: Vector3, shape: Shape3D, material: Material) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.position = at
	add_child(body)
	var visual := MeshInstance3D.new()
	visual.mesh = mesh
	visual.material_override = material
	body.add_child(visual)
	var collision := CollisionShape3D.new()
	collision.shape = shape
	body.add_child(collision)
	return body

func _box(size: Vector3, at: Vector3, material: Material) -> StaticBody3D:
	var mesh := BoxMesh.new()
	mesh.size = size
	var shape := BoxShape3D.new()
	shape.size = size
	return _solid(mesh, at, shape, material)

func _pillar(at: Vector3, material: Material) -> void:
	var mesh := CylinderMesh.new()
	mesh.top_radius = 0.55
	mesh.bottom_radius = 0.7
	mesh.height = 4.8
	var shape := CylinderShape3D.new()
	shape.radius = 0.7
	shape.height = 4.8
	_solid(mesh, at + Vector3.UP * 2.4, shape, material)
	_box(Vector3(1.7, 0.3, 1.7), at + Vector3.UP * 0.15, material)
	_box(Vector3(1.6, 0.35, 1.6), at + Vector3.UP * 4.65, material)

func _build_arena() -> void:
	var stone := _material(Color(0.28, 0.29, 0.34))
	var dark_stone := _material(Color(0.16, 0.17, 0.21))
	var floor_material := _material(Color(0.22, 0.23, 0.27))
	_box(Vector3(60, 0.4, 60), Vector3(0, -0.2, 0), floor_material)
	# 薄石缝提供尺度与纵深；无贴图依赖。
	for i in range(-10, 11):
		_box(Vector3(0.035, 0.012, 60), Vector3(i * 3.0, 0.006, 0), dark_stone)
		_box(Vector3(60, 0.012, 0.035), Vector3(0, 0.006, i * 3.0), dark_stone)
	# 连续边墙碰撞，另有位置钳制兜底。
	for side in [-1.0, 1.0]:
		_box(Vector3(60, 2.8, 0.8), Vector3(0, 1.4, side * 30), stone)
		_box(Vector3(0.8, 2.8, 60), Vector3(side * 30, 1.4, 0), stone)
	for x in [-24.0, -12.0, 0.0, 12.0, 24.0]:
		for z in [-25.0, 25.0]:
			_pillar(Vector3(x, 0, z), stone)
	for at in [Vector3(-8, 0, -6), Vector3(8, 0, -6), Vector3(-8, 0, 8), Vector3(8, 0, 8)]:
		_pillar(at, stone)
	# 可从两侧绕过的断墙、盒体拼成的拱门。
	for side in [-1.0, 1.0]:
		_box(Vector3(6, 2.3, 0.9), Vector3(side * 16, 1.15, -10), stone)
		_box(Vector3(0.9, 3.8, 1.3), Vector3(side * 3.1, 1.9, -15), stone)
	_box(Vector3(7.1, 0.9, 1.3), Vector3(0, 4.0, -15), stone)
	var rng := RandomNumberGenerator.new()
	rng.seed = 31803
	for i in range(30):
		var at := Vector3(rng.randf_range(11, 23) * (-1 if i % 2 == 0 else 1), 0, rng.randf_range(-19, 19))
		var size := Vector3(rng.randf_range(0.3, 1.2), rng.randf_range(0.2, 0.7), rng.randf_range(0.4, 1.1))
		var rubble := _box(size, at + Vector3.UP * size.y * 0.5, dark_stone)
		rubble.rotation.y = rng.randf_range(-PI, PI)
	var world := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color(0.085, 0.065, 0.12)
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color(0.48, 0.46, 0.63)
	environment.ambient_light_energy = 0.7
	environment.fog_enabled = true
	environment.fog_light_color = Color(0.16, 0.13, 0.22)
	environment.fog_density = 0.012
	world.environment = environment
	add_child(world)
	var moon := DirectionalLight3D.new()
	moon.light_color = Color(0.65, 0.76, 1.0)
	moon.light_energy = 1.4
	moon.shadow_enabled = true
	moon.rotation_degrees = Vector3(-48, -30, 0)
	add_child(moon)
	# Godot 的点光源节点名称为 OmniLight3D。
	for at in [Vector3(-8, 2.4, -5), Vector3(8, 2.4, -5), Vector3(-8, 2.4, 7), Vector3(8, 2.4, 7), Vector3(-3, 2.4, -14), Vector3(3, 2.4, -14)]:
		var torch := OmniLight3D.new()
		torch.position = at
		torch.light_color = Color(1.0, 0.43, 0.12)
		torch.light_energy = 3.0
		torch.omni_range = 9.0
		add_child(torch)
		var flame := MeshInstance3D.new()
		var sphere := SphereMesh.new()
		sphere.radius = 0.12
		sphere.height = 0.35
		flame.mesh = sphere
		var glow := _material(Color(1.0, 0.48, 0.12))
		glow.emission_enabled = true
		glow.emission = Color(1.0, 0.25, 0.04)
		glow.emission_energy_multiplier = 3.0
		flame.material_override = glow
		flame.position = at
		add_child(flame)

# 将所有网格 AABB 的八个角变换到导入根节点空间，包含嵌套变换。
func _mesh_bounds(node: Node, transform_from_root: Transform3D, bounds: Array) -> void:
	var local := transform_from_root
	if node is Node3D:
		local = transform_from_root * (node as Node3D).transform
	if node is MeshInstance3D:
		var mesh_node := node as MeshInstance3D
		if mesh_node.mesh:
			var aabb := mesh_node.get_aabb()
			for i in range(8):
				var point := local * aabb.get_endpoint(i)
				if bounds.is_empty():
					bounds.append(AABB(point, Vector3.ZERO))
				else:
					bounds[0] = (bounds[0] as AABB).expand(point)
	for child in node.get_children():
		_mesh_bounds(child, local, bounds)

func _build_hero() -> void:
	_hero = CharacterBody3D.new()
	_hero.name = "Hero"
	_hero.position = Vector3(-3.5, 0.05, 3.5)
	add_child(_hero)
	var collision := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.3
	capsule.height = HERO_HEIGHT
	collision.shape = capsule
	collision.position.y = HERO_HEIGHT * 0.5
	_hero.add_child(collision)
	_visual = Node3D.new()
	_visual.rotation.y = PI # 默认朝北，相机从角色后上方跟随
	_hero.add_child(_visual)
	var packed := load("res://art/models/heroine3d.glb") as PackedScene
	if packed == null:
		push_error("无法加载 heroine3d.glb")
		return
	var model := packed.instantiate() as Node3D
	var bounds: Array = []
	_mesh_bounds(model, Transform3D.IDENTITY, bounds)
	if bounds.is_empty() or (bounds[0] as AABB).size.y <= 0.0001:
		push_error("角色模型 AABB 高度无效")
		model.free()
		return
	var aabb: AABB = bounds[0]
	var factor := HERO_HEIGHT / aabb.size.y
	var normalized := Node3D.new()
	normalized.scale = Vector3.ONE * factor
	normalized.position = Vector3(-aabb.get_center().x, -aabb.position.y, -aabb.get_center().z) * factor
	_visual.add_child(normalized)
	normalized.add_child(model)
	print("arena3d: imported AABB=", aabb, " normalized height=", aabb.size.y * factor)

func _build_camera() -> void:
	_rig = Node3D.new()
	add_child(_rig)
	_arm = SpringArm3D.new()
	_arm.spring_length = _distance
	_arm.margin = 0.2
	_arm.add_excluded_object(_hero.get_rid())
	var probe := SphereShape3D.new()
	probe.radius = 0.18
	_arm.shape = probe
	_rig.add_child(_arm)
	var camera := Camera3D.new()
	camera.fov = 65
	camera.far = 130
	_arm.add_child(camera)
	camera.current = true
	_update_camera()

func _unhandled_input(event: InputEvent) -> void:
	if _demo:
		return
	if event is InputEventMouseMotion and Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
		_yaw -= event.relative.x * MOUSE_SENSITIVITY
		_pitch = clampf(_pitch - event.relative.y * MOUSE_SENSITIVITY, -1.15, -0.1)
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			_distance = clampf(_distance - 0.5, CAMERA_MIN, CAMERA_MAX)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_distance = clampf(_distance + 0.5, CAMERA_MIN, CAMERA_MAX)

func _physics_process(delta: float) -> void:
	_time += delta
	var direction := Vector3.ZERO
	var jump := false
	if _demo:
		var phase := int(_time / DEMO_LEG_SECONDS) % 4
		direction = [Vector3.FORWARD, Vector3.RIGHT, Vector3.BACK, Vector3.LEFT][phase]
		if _time >= 2.65 and not _demo_jumped and _hero.is_on_floor():
			jump = true
			_demo_jumped = true
		_yaw += delta * 0.32
	else:
		var input := Vector2(float(Input.is_key_pressed(KEY_D)) - float(Input.is_key_pressed(KEY_A)), float(Input.is_key_pressed(KEY_S)) - float(Input.is_key_pressed(KEY_W)))
		direction = (Basis(Vector3.UP, _yaw) * Vector3(input.x, 0, input.y)).normalized()
		var down := Input.is_key_pressed(KEY_SPACE)
		jump = down and not _jump_was_down
		_jump_was_down = down
	_hero.velocity.x = direction.x * MOVE_SPEED
	_hero.velocity.z = direction.z * MOVE_SPEED
	if not _hero.is_on_floor():
		_hero.velocity.y -= GRAVITY * delta
	elif jump:
		_hero.velocity.y = JUMP_SPEED
	_hero.move_and_slide()
	_hero.position.x = clampf(_hero.position.x, -ARENA_HALF + 0.75, ARENA_HALF - 0.75)
	_hero.position.z = clampf(_hero.position.z, -ARENA_HALF + 0.75, ARENA_HALF - 0.75)
	if direction.length_squared() > 0.001:
		_visual.rotation.y = lerp_angle(_visual.rotation.y, atan2(direction.x, direction.z), minf(TURN_SPEED * delta, 1.0))
	_update_camera()

func _update_camera() -> void:
	_rig.position = _hero.position + Vector3.UP * 1.25
	_rig.rotation = Vector3(_pitch, _yaw, 0)
	_arm.spring_length = _distance

func _process(_delta: float) -> void:
	if _capture and not _capturing and _shots < SHOT_TIMES.size() and _time >= SHOT_TIMES[_shots]:
		_capturing = true
		await RenderingServer.frame_post_draw
		var image := get_viewport().get_texture().get_image()
		var path := ProjectSettings.globalize_path("res://shot3d_%d.png" % (_shots + 1))
		var error := image.save_png(path)
		if error != OK:
			push_error("截帧失败：%s (%s)" % [path, error])
			get_tree().quit(1)
			return
		print("arena3d: saved ", path)
		_shots += 1
		_capturing = false
		if _shots == SHOT_TIMES.size():
			get_tree().quit()
