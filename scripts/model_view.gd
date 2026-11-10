extends Node3D
# 模型转台质检工具：加载 --model 指定的 GLB，归一到 1.7m，从四个角度截帧。
# 用法：godot --path . res://scenes/model_view.tscn -- --model res://art/models/feisun3d.glb --prefix feisun
var _pivot: Node3D
var _prefix := "model"

func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	var model_path := "res://art/models/feisun3d.glb"
	for i in args.size():
		if args[i] == "--model" and i + 1 < args.size():
			model_path = args[i + 1]
		if args[i] == "--prefix" and i + 1 < args.size():
			_prefix = args[i + 1]
	var we := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.16, 0.16, 0.19)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.75, 0.78, 0.85)
	env.ambient_light_energy = 0.9
	we.environment = env
	add_child(we)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-38, -28, 0)
	sun.light_energy = 1.6
	add_child(sun)
	var ground := MeshInstance3D.new()
	var disc := CylinderMesh.new()
	disc.top_radius = 1.6
	disc.bottom_radius = 1.6
	disc.height = 0.05
	ground.mesh = disc
	var gm := StandardMaterial3D.new()
	gm.albedo_color = Color(0.28, 0.28, 0.33)
	ground.material_override = gm
	ground.position.y = -0.026
	add_child(ground)
	_pivot = Node3D.new()
	add_child(_pivot)
	var ps := load(model_path) as PackedScene
	if ps == null:
		push_error("MODEL LOAD FAILED: " + model_path)
		get_tree().quit()
		return
	var model := ps.instantiate()
	_pivot.add_child(model)
	var aabb := AABB()
	var first := true
	var stack: Array = [model]
	var counts := {}
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		counts[n.get_class()] = int(counts.get(n.get_class(), 0)) + 1
		if n is MeshInstance3D and (n as MeshInstance3D).mesh:
			var b: AABB = (n as MeshInstance3D).mesh.get_aabb()
			aabb = b if first else aabb.merge(b)
			first = false
		for c in n.get_children():
			stack.append(c)
	var s := 1.7 / aabb.size.y
	model.scale = Vector3.ONE * s
	model.position = Vector3(-(aabb.position.x + aabb.size.x * 0.5) * s, -aabb.position.y * s, -(aabb.position.z + aabb.size.z * 0.5) * s)
	print("MODEL VIEW: ", model_path, " nodes=", counts, " aabb=", aabb, " scale=", s)
	var cam := Camera3D.new()
	cam.position = Vector3(0, 1.05, 3.4)
	add_child(cam)
	cam.look_at(Vector3(0, 0.9, 0), Vector3.UP)
	_run_captures()

func _run_captures() -> void:
	var angles := [0.0, 90.0, 180.0, 270.0]
	for i in 4:
		_pivot.rotation_degrees.y = angles[i]
		await get_tree().create_timer(0.45).timeout
		await RenderingServer.frame_post_draw
		var img := get_viewport().get_texture().get_image()
		img.save_png(ProjectSettings.globalize_path("res://") + "modelview_" + _prefix + "_" + str(i + 1) + ".png")
		print("SHOT ", i + 1, " done")
	get_tree().quit()
