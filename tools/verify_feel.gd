extends SceneTree
## 战斗手感增量验收（D2 攻击磁吸 / D3 身体推挤 / D5 按角色顿帧 / D1 输入缓冲）。
## 用法：godot --headless --path . --script res://tools/verify_feel.gd
## 末行：FEELVERIFY PASS / FEELVERIFY FAIL n

var fails: Array[String] = []

func ok(cond: bool, msg: String) -> void:
	print(("ok   " if cond else "FAIL ") + msg)
	if not cond:
		fails.append(msg)

func hdist(a: Node3D, b: Node3D) -> float:
	var off := b.global_position - a.global_position
	off.y = 0.0
	return off.length()

func _init() -> void:
	call_deferred("_run")

func _frames(n: int) -> void:
	for i in n:
		await physics_frame

func make_stage():
	var ps := load("res://scenes/combat3d.tscn") as PackedScene
	var s = ps.instantiate()
	root.add_child(s)
	s.set_physics_process(false)
	s.verify_mode = true
	for e in s.enemies:
		e.global_position = Vector3(100, 0.05, 100)
		e.state_t = 0
		e.freeze_t = 0
	return s

func _run() -> void:
	# ---------- D2 攻击磁吸 ----------
	var deg40 := deg_to_rad(40.0)
	var s = make_stage()
	await process_frame
	var f = s.fighter
	var e = s.enemies[0]
	f.global_position = Vector3.ZERO
	f.visual.rotation.y = PI
	e.global_position = Vector3(sin(deg40) * 3.5, 0.05, -cos(deg40) * 3.5)
	f.start_attack(0)
	await _frames(7)
	var d := hdist(f, e)
	var off: Vector3 = e.global_position - f.global_position
	off.y = 0.0
	var ang: float = rad_to_deg(absf(wrapf(atan2(off.x, off.z) - atan2(f.forward().x, f.forward().z), -PI, PI)))
	ok(d >= 1.45 and d <= 1.60, "敌人 3.5m/偏 40° → 第 6 帧距离 ∈ [1.45,1.60]m（实测 %.2f）" % d)
	ok(ang < 3.0, "第 6 帧朝向误差 <3°（实测 %.2f°）" % ang)
	ok(e.hp == 48, "磁吸命中轻击伤害 12（实测 HP %d）" % e.hp)

	# 5m 处不吸附，只前冲 0.35m
	var s2 = make_stage()
	await process_frame
	var f2 = s2.fighter
	var e2 = s2.enemies[0]
	f2.global_position = Vector3.ZERO
	f2.visual.rotation.y = PI
	e2.global_position = Vector3(0, 0.05, -5.0)
	f2.start_attack(0)
	await _frames(7)
	var d2 := hdist(f2, e2)
	ok(d2 >= 4.60 and d2 <= 4.75, "5m 处不吸附，仅前冲约 0.35m（实际物理位移受 60Hz CharacterBody3D 限制，距离 %.2f）" % d2)

	# ---------- D3 身体推挤（软分离帧后检查） ----------
	var s3 = make_stage()
	await process_frame
	var f3 = s3.fighter
	var e3 = s3.enemies[0]
	f3.global_position = Vector3.ZERO
	f3.visual.rotation.y = PI
	e3.global_position = Vector3(0, 0.05, 0.5)
	f3.direction = Vector3.FORWARD
	var dmin := 1e9
	for i in 60:
		await physics_frame
		s3._resolve_body_collisions()
		if i > 0:
			dmin = minf(dmin, hdist(f3, e3))
	ok(dmin >= 0.58, "玩家顶敌人走 60 帧，软分离后水平距离始终 ≥ 0.58m（最小实测 %.2f）" % dmin)

	# ---------- D5 按角色顿帧 ----------
	var s4 = make_stage()
	await process_frame
	var f4 = s4.fighter
	var a = s4.enemies[0]
	var b = s4.enemies[1]
	f4.global_position = Vector3.ZERO
	f4.visual.rotation.y = PI
	a.global_position = Vector3(0, 0.05, -1.5)
	b.global_position = Vector3(-3, 0.05, -1.5)
	f4.start_attack(0)
	await _frames(7)
	var a_freeze: int = a.freeze_t
	var f4_freeze: int = f4.freeze_t
	var b_t0: int = b.state_t
	await _frames(3)
	var a_t_mid: int = a.state_t
	var b_t1: int = b.state_t
	ok(a_freeze > 0 and f4_freeze > 0, "命中后攻击方与受击方均进入顿帧（攻击方 %d，受击方 %d）" % [f4_freeze, a_freeze])
	ok(a_t_mid == 0 and a.freeze_t > 0, "受击方冻结期间 state_t 停在 0（实测 %d，剩余冻结 %d）" % [a_t_mid, a.freeze_t])
	ok(b_t1 > b_t0, "同挥击的其他敌人 B state_t 继续推进（%d → %d）" % [b_t0, b_t1])

	# ---------- D1 输入缓冲：顿帧第 2 帧按攻击并松开 → 取消帧自动接下一段 ----------
	var s5 = make_stage()
	await process_frame
	var f5 = s5.fighter
	var a5 = s5.enemies[0]
	f5.global_position = Vector3.ZERO
	f5.visual.rotation.y = PI
	a5.global_position = Vector3(0, 0.05, -1.5)
	f5.start_attack(0)
	await _frames(6)
	f5.attack = true
	await physics_frame
	f5.attack = false
	for i in 30:
		await physics_frame
		if f5.atk_idx == 1:
			break
	ok(f5.atk_idx == 1, "顿帧期间按攻击并松开 → 取消帧自动进入下一段（实测 atk_idx=%d）" % f5.atk_idx)

	print("FEELVERIFY PASS" if fails.is_empty() else "FEELVERIFY FAIL %d" % fails.size())
	quit(0 if fails.is_empty() else 1)
