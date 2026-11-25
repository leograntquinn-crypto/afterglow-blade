extends SceneTree
## attack1 资产探针：检查角色 GLB 是否含真实 attack1（劈砍）片段。
## 代码侧不做 attack2 别名冒充；缺段时如实输出 ATTACK1 MISSING。
## 用法：godot --headless --path . --script res://tools/verify_attack1.gd

func _init() -> void:
	call_deferred("_run")

func _check(path: String) -> bool:
	var packed := load(path) as PackedScene
	if packed == null:
		print("ATTACK1 ", path, " LOAD FAILED")
		return false
	var model := packed.instantiate()
	root.add_child(model)
	var players := model.find_children("*", "AnimationPlayer", true, false)
	var found := false
	if not players.is_empty():
		var list: Array = (players[0] as AnimationPlayer).get_animation_list()
		found = list.has("attack1")
		print("ATTACK1 ", path, " CLIPS=", list, " HAS_ATTACK1=", found)
	else:
		print("ATTACK1 ", path, " NO_ANIMPLAYER")
	model.free()
	return found

func _run() -> void:
	var paths := ["res://art/models/feisun_s1.glb", "res://art/models/feisun_gen4.glb"]
	var any := false
	for p in paths:
		if ResourceLoader.exists(p):
			any = _check(p) or any
	if any:
		print("ATTACK1 READY")
	else:
		print("ATTACK1 MISSING: 需 Muse 按管线生成 slash→attack1 片段并迁入重涂骨架；代码侧 _play_anim 已就绪，动画到位即播放，不用 attack2 冒充")
	quit(0)
