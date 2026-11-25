extends SceneTree
## Build env/afterglow_night.tres from GUIZANG C6 spec. Environment is configuration, not art.
## usage: godot --headless --path . --script res://tools/gen_env_v5.gd

func _init() -> void:
	call_deferred("_run")

func _has_prop(obj: Object, name: String) -> bool:
	for p in obj.get_property_list():
		if p.name == name:
			return true
	return false

func _setp(obj: Object, name: String, value) -> void:
	if _has_prop(obj, name):
		obj.set(name, value)

func _run() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://env"))
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.10, 0.10, 0.16)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.42, 0.47, 0.66)
	env.ambient_light_energy = 0.45
	if ClassDB.class_has_integer_constant("Environment", "TONE_MAPPER_AGX"):
		env.tonemap_mode = ClassDB.class_get_integer_constant("Environment", "TONE_MAPPER_AGX")
	elif ClassDB.class_has_integer_constant("Environment", "TONE_MAPPER_ACES"):
		env.tonemap_mode = ClassDB.class_get_integer_constant("Environment", "TONE_MAPPER_ACES")
	env.tonemap_exposure = 1.0
	env.glow_enabled = true
	for i in 7:
		env.set_glow_level(i, [0.0, 0.4, 0.8, 1.0, 0.6, 0.3, 0.0][i])
	_setp(env, "glow_intensity", 0.6)
	_setp(env, "glow_bloom", 0.04)
	_setp(env, "glow_hdr_threshold", 1.0)
	env.ssao_enabled = true
	_setp(env, "ssao_radius", 1.2)
	_setp(env, "ssao_intensity", 1.6)
	_setp(env, "ssao_power", 1.5)
	env.fog_enabled = true
	_setp(env, "fog_mode", Environment.FOG_MODE_EXPONENTIAL if ClassDB.class_has_integer_constant("Environment", "FOG_MODE_EXPONENTIAL") else 0)
	env.fog_light_color = Color(0.46, 0.50, 0.68)
	env.fog_light_energy = 1.0
	_setp(env, "fog_density", 0.006)
	_setp(env, "fog_aerial_perspective", 0.4)
	_setp(env, "fog_sky_affect", 0.8)
	_setp(env, "fog_height", 2.0)
	_setp(env, "fog_height_density", 0.18)
	_setp(env, "volumetric_fog_enabled", true)
	_setp(env, "volumetric_fog_density", 0.010)
	_setp(env, "volumetric_fog_albedo", Color(0.72, 0.76, 0.92))
	_setp(env, "volumetric_fog_emission", Color(0.02, 0.02, 0.05))
	_setp(env, "volumetric_fog_anisotropy", 0.35)
	_setp(env, "volumetric_fog_length", 72.0)
	_setp(env, "volumetric_fog_detail_spread", 2.0)
	_setp(env, "volumetric_fog_ambient_inject", 0.3)
	_setp(env, "adjustment_enabled", true)
	_setp(env, "adjustment_contrast", 1.06)
	_setp(env, "adjustment_saturation", 0.88)
	var err := ResourceSaver.save(env, "res://env/afterglow_night.tres")
	print("ENV V5 save=", err)
	quit(0 if err == OK else 1)
