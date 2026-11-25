extends SceneTree
## 弹簧骨资产依赖探针：检查引擎 API、角色骨架、候选链与运行时配置。
## 无 Muse 链骨资产时以 SPRINGBONE BLOCKED 如实报告，不伪造飘动物理结果。
## 用法：godot --headless --path . --script res://tools/verify_spring_bone.gd

func _init() -> void:
	call_deferred("_run")

func _run() -> void:
	var packed := load("res://art/models/feisun_s1.glb") as PackedScene
	if packed == null:
		print("SPRINGBONE BLOCKED: feisun_s1.glb unavailable")
		quit(1)
		return
	var model := packed.instantiate()
	root.add_child(model)
	var skeletons := model.find_children("*", "Skeleton3D", true, false)
	if skeletons.is_empty():
		print("SPRINGBONE BLOCKED: no Skeleton3D")
		quit(1)
		return
	var skeleton := skeletons[0] as Skeleton3D
	var candidates := ["HairRoot", "Hair_01", "PonytailRoot", "WaistClothL_01", "WaistClothR_01", "WaistL_01", "WaistR_01"]
	var missing: Array[String] = []
	for bone in candidates:
		if skeleton.find_bone(bone) < 0:
			missing.append(bone)
	var runtime_script := load("res://scripts/spring_bone_runtime.gd") as Script
	var runtime: Node = runtime_script.new()
	root.add_child(runtime)
	var configured: int = runtime.setup(model, skeleton)
	print("SPRINGBONE ENGINE SpringBoneSimulator3D=", ClassDB.class_exists("SpringBoneSimulator3D"))
	print("SPRINGBONE BONES=", skeleton.get_bone_count(), " CONFIGURED_CHAINS=", configured)
	print("SPRINGBONE MISSING_CHAIN_BONES=", missing)
	if configured == 0:
		print("SPRINGBONE BLOCKED: current S1 58-bone rig has no dedicated ponytail/waist-cloth chain; Muse must supply final hair/cloth GLB with named chain bones and collision bind points")
		quit(0)
		return
	print("SPRINGBONE PASS: configured native SpringBoneSimulator3D; visual trajectory/penetration suite still requires final chain asset")
	quit(0)
