extends SceneTree
## Dev tool: print skeleton bones and animation clips of a GLB.
## usage: godot --headless --path . --script res://tools/inspect_model.gd -- --model res://art/models/feisun_s1.glb

func _init() -> void:
	call_deferred("_run")

func _run() -> void:
	var model_path := "res://art/models/feisun_s1.glb"
	var args := OS.get_cmdline_user_args()
	for i in args.size():
		if args[i] == "--model" and i + 1 < args.size():
			model_path = args[i + 1]
	print("CLASS SpringBoneSimulator3D=", ClassDB.class_exists("SpringBoneSimulator3D"), " SkeletonModifier3D=", ClassDB.class_exists("SkeletonModifier3D"))
	var packed := load(model_path) as PackedScene
	if packed == null:
		print("LOAD FAILED ", model_path)
		quit(1)
		return
	var model := packed.instantiate()
	root.add_child(model)
	var skeletons := model.find_children("*", "Skeleton3D", true, false)
	for sk in skeletons:
		var skeleton := sk as Skeleton3D
		print("SKELETON ", skeleton.name, " bones=", skeleton.get_bone_count())
		for b in skeleton.get_bone_count():
			print("BONE ", b, " name=", skeleton.get_bone_name(b), " parent=", skeleton.get_bone_parent(b))
	var players := model.find_children("*", "AnimationPlayer", true, false)
	for ap in players:
		var player := ap as AnimationPlayer
		print("ANIMPLAYER ", player.name, " clips=", player.get_animation_list())
		for clip in player.get_animation_list():
			var anim := player.get_animation(clip)
			print("CLIP ", clip, " len=", anim.length, " tracks=", anim.get_track_count())
	quit(0)
