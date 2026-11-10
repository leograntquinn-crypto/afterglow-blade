extends SceneTree
## C4 验收（docs/TICKET_c4_isoslice.md 的先行测试）：Codex 不改判定，语法问题报给 Claude。
## 运行：godot --headless --path . --script res://tools/verify_c4.gd
## 末行：C4VERIFY PASS / C4VERIFY FAIL n

var slice: Node
var fails: Array[String] = []

func _init() -> void:
	call_deferred("_run")

func ok(cond: bool, msg: String) -> void:
	print(("ok   " if cond else "FAIL ") + msg)
	if not cond:
		fails.append(msg)

func frames(n: int) -> void:
	for i in n:
		await physics_frame

func dir_vec(i: int) -> Vector2:
	return Vector2(cos(i * PI / 4.0), sin(i * PI / 4.0))

func press_attack(p: Node) -> void:
	p.inp["attack"] = true
	await frames(1)
	p.inp["attack"] = false

# 等到 cond 成立，最多 limit 帧；返回用了几帧（超时返回 -1）
func wait_until(cond: Callable, limit: int) -> int:
	for i in limit:
		if cond.call():
			return i
		await physics_frame
	return -1 if not cond.call() else limit

func _run() -> void:
	var scene: PackedScene = load("res://scenes/iso_slice.tscn")
	ok(scene != null, "scenes/iso_slice.tscn 可以载入")
	if scene == null:
		_finish()
		return
	slice = scene.instantiate()
	root.add_child(slice)
	await process_frame
	slice.set_test_mode(true)
	slice.clear_enemies()
	await frames(2)
	var P: Node = slice.player
	var M: float = slice.M
	var K: float = slice.ISO_K
	var home: Vector2 = P.ground_pos()

	# ---------- 1. 约定 ----------
	ok(absf(K - 0.6667) < 0.001 and is_equal_approx(M, 48.0), "投影常量 ISO_K = 0.6667、M = 48")
	ok(slice.actor_layer.y_sort_enabled and P.get_parent() == slice.actor_layer, "主角在 Y-sort 容器里，容器开了 y_sort_enabled")
	var pillars_ok := slice.pillars.size() >= 6
	for pl in slice.pillars:
		pillars_ok = pillars_ok and pl.get_parent() == slice.actor_layer
	ok(pillars_ok, "立柱 ≥ 6 根且都在同一个 Y-sort 容器里")

	# ---------- 2. 八方向移动：朝向、方向、速度（斜向不更快） ----------
	var speed_ok := true
	var dir_ok := true
	var report := []
	for i in 8:
		P.set_ground_pos(home)
		P.inp["move"] = dir_vec(i)
		await frames(30)
		var d: Vector2 = P.ground_pos() - home
		P.inp["move"] = Vector2.ZERO
		await frames(2)
		var spd := d.length() / 0.5 / M
		var ang := rad_to_deg(absf(d.angle_to(dir_vec(i))))
		report.append("%d:%.2fm/s,%.0f°,dir%d" % [i, spd, ang, P.dir])
		speed_ok = speed_ok and absf(spd - 4.2) <= 4.2 * 0.08
		dir_ok = dir_ok and P.dir == i and ang < 8.0
	ok(dir_ok, "八个方向朝向编号正确、位移方向偏差 < 8°  " + str(report))
	ok(speed_ok, "八个方向速度都是 4.2 米/秒 ±8%（斜向不更快）")
	var keep: int = P.dir
	await frames(5)
	ok(P.dir == keep, "没有移动输入时保持朝向")

	# ---------- 3. 精灵退回侧视图集：西翻转，正北保持上一次的翻转 ----------
	P.set_ground_pos(home)
	P.inp["move"] = dir_vec(4)
	await frames(8)
	var west_flip: bool = P.sprite.flip_h_now
	P.inp["move"] = dir_vec(6)
	await frames(8)
	var north_flip: bool = P.sprite.flip_h_now
	P.inp["move"] = dir_vec(0)
	await frames(8)
	var east_flip: bool = P.sprite.flip_h_now
	P.inp["move"] = Vector2.ZERO
	await frames(2)
	ok(west_flip and north_flip and not east_flip, "侧视图集退回：向西翻转、正北保持翻转、向东不翻转")

	# ---------- 4. 攻击扇形（地面坐标判定） ----------
	P.set_ground_pos(home)
	P.inp["move"] = dir_vec(0)
	await frames(1)
	P.inp["move"] = Vector2.ZERO
	await frames(1)
	var cases := [
		[Vector2(2.0, 0), true, "正前 2.0 米"],
		[Vector2(2.2, 0), false, "正前 2.2 米（超出 2.1）"],
		[Vector2(1.5, 0).rotated(deg_to_rad(60)), true, "偏 60° 1.5 米"],
		[Vector2(1.5, 0).rotated(deg_to_rad(80)), false, "偏 80° 1.5 米"],
		[Vector2(-1.5, 0), false, "正后 1.5 米"],
	]
	for c in cases:
		var e: Node = slice.spawn_enemy(home + c[0] * M)
		e.ai_enabled = false
		await frames(1)
		ok(P.can_hit(e) == c[1], "扇形判定：" + c[2])
		slice.clear_enemies()
		await frames(1)
	# 正北 2.0 米：屏幕上只差 2.0 × K 米，必须按地面距离打得到
	P.inp["move"] = dir_vec(6)
	await frames(1)
	P.inp["move"] = Vector2.ZERO
	var north: Node = slice.spawn_enemy(home + Vector2(0, -2.0) * M)
	north.ai_enabled = false
	await frames(1)
	ok(P.can_hit(north), "正北 2.0 米按地面距离判定，打得到")
	slice.clear_enemies()
	await frames(1)

	# ---------- 5. 辅助瞄准：±45° 内 2.4 米最近的敌人 ----------
	P.set_ground_pos(home)
	P.inp["move"] = dir_vec(0)
	await frames(1)
	P.inp["move"] = Vector2.ZERO
	var aim: Node = slice.spawn_enemy(home + Vector2(2.0, 0).rotated(deg_to_rad(40)) * M)
	aim.ai_enabled = false
	await frames(1)
	await press_attack(P)
	await frames(2)
	ok(P.dir == 1, "辅助瞄准：偏 40° 的敌人，出招朝向转到东南（1）")
	await frames(30)
	slice.clear_enemies()
	P.inp["move"] = dir_vec(0)
	await frames(1)
	P.inp["move"] = Vector2.ZERO
	var far: Node = slice.spawn_enemy(home + Vector2(2.0, 0).rotated(deg_to_rad(60)) * M)
	far.ai_enabled = false
	await frames(1)
	await press_attack(P)
	await frames(2)
	ok(P.dir == 0, "辅助瞄准：偏 60° 的敌人超出 ±45°，朝向不变")
	await frames(30)
	slice.clear_enemies()

	# ---------- 6. 三连斩：伤害 12/12/16、接触帧、顿帧 6/8 ----------
	P.set_ground_pos(home)
	P.inp["move"] = dir_vec(0)
	await frames(1)
	P.inp["move"] = Vector2.ZERO
	var dummy: Node = slice.spawn_enemy(home + Vector2(1.6, 0) * M)
	dummy.ai_enabled = false
	await frames(1)
	var hps := []
	var contact := []
	var stops := []
	for _seg in 3:
		var before: int = dummy.hp
		await press_attack(P)
		var used: int = await wait_until(func(): return dummy.hp != before, 30)
		contact.append(used + 1)
		hps.append(dummy.hp)
		var n := 0
		while slice.frozen and n < 30:
			n += 1
			await physics_frame
		stops.append(n)
		await frames(6)
	ok(hps == [48, 36, 20], "三连斩伤害 12 / 12 / 16（HP %s）" % str(hps))
	ok(contact[0] >= 5 and contact[0] <= 8, "第一段在约第 6 帧接触（实测 %s）" % str(contact))
	ok(absi(stops[0] - 6) <= 1 and absi(stops[2] - 8) <= 1, "顿帧：轻击 6 帧、终结 8 帧（实测 %s）" % str(stops))
	slice.clear_enemies()
	await frames(30)

	# ---------- 7. 防连晕（与 C1 一字不差） ----------
	var e2: Node = slice.spawn_enemy(home + Vector2(4.0, 0) * M)
	e2.ai_enabled = false
	await frames(1)
	var stuns := []
	for i in 3:
		e2.take_hit(1, Vector2.RIGHT, false)
		stuns.append(e2.stun_t)
		await frames(2)
	e2.take_hit(1, Vector2.RIGHT, false)
	var broke: bool = e2.break_t == 80 and e2.chain_n == 0
	e2.stun_t = 0
	e2.take_hit(1, Vector2.RIGHT, false)
	var light_in_break: int = e2.stun_t
	e2.take_hit(1, Vector2.RIGHT, true)
	var heavy_in_break: int = e2.stun_t
	ok(stuns == [20, 16, 12], "连续受击硬直 20 → 16 → 12（实测 %s）" % str(stuns))
	ok(broke and light_in_break == 0 and heavy_in_break == 20, "第 4 次连续轻击挣脱 80 帧；挣脱期间轻击不硬直、重击照常打断")
	slice.clear_enemies()
	await frames(2)

	# ---------- 8. 腐骨兵 AI：走近、蓄力 21 帧、挥砍 8 点 ----------
	P.set_ground_pos(home)
	P.hp = 100
	var g: Node = slice.spawn_enemy(home + Vector2(6.0, 0) * M)
	await frames(1)
	var d0: float = (g.ground_pos() - P.ground_pos()).length()
	await frames(60)
	var walked: float = (d0 - (g.ground_pos() - P.ground_pos()).length()) / M
	ok(absf(walked - 1.6) <= 0.4, "腐骨兵走速约 1.6 米/秒（实测 %.2f）" % walked)
	var w0: int = await wait_until(func(): return g.state == "windup", 240)
	ok(w0 >= 0, "腐骨兵进入 2.0 米后开始蓄力")
	var hp0: int = P.hp
	var wind: int = await wait_until(func(): return P.hp != hp0, 60)
	ok(absi(wind - 21) <= 2 and hp0 - P.hp == 8, "蓄力约 21 帧后挥砍，伤害 8（实测 %d 帧、%d 点）" % [wind, hp0 - P.hp])

	# ---------- 9. 死亡移除 ----------
	g.ai_enabled = false
	g.take_hit(999, Vector2.RIGHT, true)
	await frames(2)
	var down: bool = g.state == "down" and not P.can_hit(g)
	await frames(70)
	ok(down and (not is_instance_valid(g) or g.get_parent() != slice.actor_layer), "HP 归零进入倒地、不再可被命中，约 60 帧后移出 Y-sort 容器")

	# ---------- 10. 立柱挡路 ----------
	var pillar: Node2D = slice.pillars[0]
	var pg: Vector2 = Vector2(pillar.position.x, pillar.position.y / K)
	P.set_ground_pos(pg + Vector2(-1.5, 0) * M)
	P.inp["move"] = dir_vec(0)
	await frames(60)
	P.inp["move"] = Vector2.ZERO
	ok(P.ground_pos().x < pg.x - 0.2 * M, "立柱有碰撞，主角走不穿")
	_finish()

func _finish() -> void:
	print("C4VERIFY PASS" if fails.is_empty() else "C4VERIFY FAIL %d" % fails.size())
	quit(0 if fails.is_empty() else 1)
