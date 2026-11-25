extends Node3D
## 跟镜头走的雪/风/贴地雾系统（代码侧天气层）。粒子与雾为程序化氛围，不冒充 PBR 场景资产。
## 规范：GPU 粒子雪 + 贴地雾片 + 风线；跟随镜头焦点，避免固定在世界原点。

const FOLLOW_RADIUS := 60.0
const MIST_COUNT := 24
const WIND_LINES := 40

var follow: Node3D
var snow: GPUParticles3D
var mist: MultiMeshInstance3D
var wind: GPUParticles3D
var _mist_shader: Shader
var _last_focus := Vector3(1e9, 0, 0)
var _time := 0.0

func _ready() -> void:
	_build_snow()
	_build_mist()
	_build_wind()
	set_process(true)

func _build_snow() -> void:
	snow = GPUParticles3D.new()
	snow.amount = 2200
	snow.lifetime = 9.0
	snow.preprocess = 5.0
	snow.explosiveness = 0.0
	snow.visibility_aabb = AABB(Vector3(-70, -20, -70), Vector3(140, 60, 140))
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(FOLLOW_RADIUS, 20.0, FOLLOW_RADIUS)
	pm.direction = Vector3(0.2, -1.0, 0.1)
	pm.spread = 25.0
	pm.initial_velocity_min = 0.6
	pm.initial_velocity_max = 1.8
	pm.gravity = Vector3(0.4, -1.6, 0.2)
	pm.scale_min = 0.6
	pm.scale_max = 1.4
	pm.turbulence_enabled = true
	pm.turbulence_noise_strength = 0.6
	pm.turbulence_influence_min = 0.02
	pm.turbulence_influence_max = 0.08
	var ramp := GradientTexture1D.new()
	var grad := Gradient.new()
	grad.set_color(0, Color(0.92, 0.95, 1.0, 0.0))
	grad.set_color(1, Color(0.92, 0.95, 1.0, 0.95))
	ramp.gradient = grad
	pm.color_ramp = ramp
	var quad := QuadMesh.new()
	quad.size = Vector2(0.06, 0.06)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	mat.albedo_color = Color(0.95, 0.97, 1.0, 0.9)
	quad.material = mat
	snow.draw_pass_1 = quad
	snow.process_material = pm
	add_child(snow)

func _build_mist() -> void:
	_mist_shader = load("res://shaders/ground_mist.gdshader") as Shader
	if _mist_shader == null:
		return
	mist = MultiMeshInstance3D.new()
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.instance_count = MIST_COUNT
	var quad := QuadMesh.new()
	quad.size = Vector2(26.0, 26.0)
	var mat := ShaderMaterial.new()
	mat.shader = _mist_shader
	var noise := FastNoiseLite.new()
	noise.frequency = 0.008
	noise.fractal_octaves = 4
	var tex := NoiseTexture2D.new()
	tex.noise = noise
	tex.width = 256
	tex.height = 256
	mat.set_shader_parameter("noise_texture", tex)
	quad.material = mat
	mm.mesh = quad
	var rng := RandomNumberGenerator.new()
	rng.seed = 20261125
	for i in MIST_COUNT:
		var angle := TAU * float(i) / float(MIST_COUNT)
		var radius := rng.randf_range(18.0, FOLLOW_RADIUS)
		var pos := Vector3(cos(angle) * radius, rng.randf_range(0.4, 2.2), sin(angle) * radius)
		var basis := Basis(Vector3.RIGHT, -PI * 0.5)
		mm.set_instance_transform(i, Transform3D(basis, pos))
	mist.multimesh = mm
	add_child(mist)

func _build_wind() -> void:
	wind = GPUParticles3D.new()
	wind.amount = WIND_LINES
	wind.lifetime = 2.2
	wind.visibility_aabb = AABB(Vector3(-70, -10, -70), Vector3(140, 40, 140))
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(FOLLOW_RADIUS, 12.0, FOLLOW_RADIUS)
	pm.direction = Vector3(1, 0, 0.3)
	pm.spread = 8.0
	pm.initial_velocity_min = 6.0
	pm.initial_velocity_max = 9.0
	pm.gravity = Vector3(0, 0, 0)
	pm.scale_min = 0.5
	pm.scale_max = 1.2
	var quad := QuadMesh.new()
	quad.size = Vector2(0.03, 1.6)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	mat.albedo_color = Color(0.85, 0.9, 1.0, 0.25)
	quad.material = mat
	wind.draw_pass_1 = quad
	wind.process_material = pm
	add_child(wind)

func set_follow(node: Node3D) -> void:
	follow = node

func _process(delta: float) -> void:
	_time += delta
	var focus := follow.global_position if (follow != null and is_instance_valid(follow)) else Vector3.ZERO
	if focus.distance_to(_last_focus) > 0.01:
		_last_focus = focus
		global_position = focus
		if snow != null:
			snow.global_position = focus
		if wind != null:
			wind.global_position = focus
		if mist != null:
			mist.global_position = Vector3(focus.x, 0.0, focus.z)
	if _mist_shader != null and mist != null:
		var mat := (mist.multimesh.mesh as QuadMesh).material as ShaderMaterial
		if mat != null:
			mat.set_shader_parameter("time_seconds", _time)
