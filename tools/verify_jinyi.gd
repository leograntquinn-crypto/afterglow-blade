extends SceneTree
## 烬翼飞行 AI 验收：hover / move / atk / hit / fall 状态与动画片段。
## 用法：godot --headless --path . --script res://tools/verify_jinyi.gd
## 末行：JINYI PASS / JINYI FAIL n

var fails: Array[String] = []

func ok(cond: bool, msg: String) -> void:
	print(("ok   " if cond else "FAIL ") + msg)
	if not cond:
		fails.append(msg)

func _init() -> void:
	call_deferred("_run")

func _frames(n: int) -> void:
	for i in n:
		await physics_frame

func _run() -> void:
	var ps := load("res://scenes/combat3d.tscn") as PackedScene
	var s = ps.instantiate()
	root.add_child(s)
	await process_frame
	s.set_physics_process(false)
	s.verify_mode = false
	# 移走地面杂兵，避免干扰
	for e in s.enemies:
		e.global_position = Vector3(200, 0.05, 200)
		e.freeze_t = 999999
	var f = s.fighter
	f.global_position = Vector3.ZERO
	var Enemy := load("res://scripts/enemy3d.gd") as GDScript
	var j = Enemy.new()
	s.add_child(j)
	j.global_position = Vector3(0, 3.0, -8.0)
	j.setup(s, f, true)
	await _frames(2)
	ok(j.is_flying, "烬翼进入飞行分支（使用 jinyi.glb）")
	ok(j.model_path.ends_with("jinyi.glb"), "模型路径指向 art/models/jinyi.glb")
	ok(j.anim_player != null, "烬翼模型自带 AnimationPlayer")
	if j.anim_player != null:
		var clips: Array = j.anim_player.get_animation_list()
		var want := ["hover", "fly", "dive", "hit", "fall"]
		var have := true
		for w in want:
			have = have and clips.has(w)
		ok(have, "5 段飞行动画齐全（实测 %s）" % str(clips))

	# move：远处目标应进入 move 并靠近
	j.global_position = Vector3(0, 3.0, -8.0)
	var d0 := Vector2(j.global_position.x - f.global_position.x, j.global_position.z - f.global_position.z).length()
	await _frames(40)
	var d1 := Vector2(j.global_position.x - f.global_position.x, j.global_position.z - f.global_position.z).length()
	ok(j.state == "move" or j.state == "hover" or j.state == "atk", "远距离接近目标（状态 %s）" % j.state)
	ok(d1 < d0, "向目标靠近（%.2f → %.2f）" % [d0, d1])
	ok(j.global_position.y >= 0.5, "飞行时保持在空中（y=%.2f）" % j.global_position.y)

	# atk：靠近后能造成伤害
	f.hp = 100
	j.global_position = Vector3(0, 3.0, -1.0)
	await _frames(120)
	ok(f.hp < 100 or j.state == "atk", "近身进入 atk 或已命中（玩家 HP=%d，状态=%s）" % [f.hp, j.state])

	# hit：受击进入 hit 状态
	j.take_hit(5, Vector3.FORWARD, false)
	ok(j.state == "hurt", "受击进入 hurt/hit 状态（实测 %s）" % j.state)
	j.freeze_t = 0

	# fall：致命伤后下坠到地面进入 down
	j.take_hit(999, Vector3.FORWARD, true)
	await _frames(2)
	ok(j.state == "fall" or j.state == "down", "致命伤后进入 fall/down（实测 %s）" % j.state)
	await _frames(240)
	ok(not is_instance_valid(j) or j.state == "down", "下坠后可落地进入 down 或已被回收（实测有效=%s）" % is_instance_valid(j))

	print("JINYI PASS" if fails.is_empty() else "JINYI FAIL %d" % fails.size())
	quit(0 if fails.is_empty() else 1)
