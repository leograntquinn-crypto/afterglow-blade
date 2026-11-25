extends SceneTree
## CameraRig3D 验收：默认参数 / 一键回正（C6.4 断言）/ 缩放 / 遮挡淡出。
## 用法：godot --headless --path . --script res://tools/verify_camera3d.gd
## 末行：CAMERAV3 PASS / CAMERAV3 FAIL n

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
	var rig_script := load("res://scripts/camera_rig3d.gd") as GDScript
	if rig_script == null:
		print("CAMERAV3 FAIL load rig")
		quit(1)
		return
	var rig: Node3D = rig_script.new()
	root.add_child(rig)
	var target := Node3D.new()
	root.add_child(target)
	var face := Node3D.new()
	target.add_child(face)
	face.rotation.y = deg_to_rad(150.0)
	rig.setup(target, face)

	# 默认参数
	await _frames(3)
	var cam: Camera3D = rig.camera as Camera3D
	ok(absf(rad_to_deg(absf(rig.pitch)) - 45.0) < 0.001, "默认俯角 45°")
	ok(absf(rig.zoom - 1.0) < 0.001, "默认缩放 1（距离 16m）")
	ok(absf(cam.fov - 38.0) < 0.001, "FOV 38°")
	var dist: float = cam.global_position.distance_to(target.global_position + Vector3.UP * 1.0)
	ok(absf(dist - 16.0) < 0.01, "默认镜头到焦点 16m（实测 %.2f）" % dist)

	# 一键回正：yaw=0，模型朝向 150°，期望 T = round(10 + 14 * 150/180) = 22 帧
	rig.yaw = 0.0
	rig.start_recenter()
	ok(rig.is_recentering(), "回正已开始")
	var t := 0
	while rig.is_recentering() and t < 60:
		await _frames(1)
		t += 1
	var yaw_deg := rad_to_deg(wrapf(rig.yaw - (deg_to_rad(150.0) - PI), -PI, PI))
	ok(absf(yaw_deg) <= 0.5, "回正后偏航 = 主角朝向 ±0.5°（实测 %.2f，帧数 %d）" % [yaw_deg, t])
	ok(absf(rad_to_deg(absf(rig.pitch)) - 45.0) <= 0.2, "回正后俯角 = 45° ±0.2°")

	# 中途注入旋转输入当帧中止
	rig.yaw = 0.0
	rig.start_recenter()
	await _frames(8)
	var yaw_before: float = rig.yaw
	var active_before: bool = rig.is_recentering()
	rig.rotate_by(Vector2(0.5, 0.0))
	await _frames(10)
	var interrupted: bool = not rig.is_recentering() or absf(rig.yaw - yaw_before) > 0.001
	ok(active_before and interrupted, "旋转输入中止回正")

	# 回正期间移动参考系锁定在按下那一帧
	rig.yaw = 0.0
	rig.start_recenter()
	await _frames(4)
	var locked: float = rig.move_yaw()
	ok(absf(locked - 0.0) < 0.0001, "回正期间移动参考系锁定按下帧偏航（实测 %.4f）" % locked)
	while rig.is_recentering():
		await _frames(1)
	ok(absf(wrapf(rig.move_yaw() - rig.yaw, -PI, PI)) < 0.0001, "松开输入后切换回当前镜头参考系")

	# 缩放倍率锁 0.95–1.3
	for i in 10:
		rig.apply_zoom(1)
	ok(absf(rig._zoom_target - 1.3) < 0.001, "滚轮缩放锁 1.3 上限")
	for i in 20:
		rig.apply_zoom(-1)
	ok(absf(rig._zoom_target - 0.95) < 0.001, "滚轮缩放锁 0.95 下限")

	# 遮挡淡出：遮挡物放在焦点与镜头连线上
	var box := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3.ONE * 0.6
	box.mesh = bm
	var box_mat := StandardMaterial3D.new()
	box.material_override = box_mat
	root.add_child(box)
	rig.set_occluders([box])
	rig.mark_occluder(box, 0.4)
	var cam_pos: Vector3 = rig.camera.global_position
	var focus := target.global_position + Vector3.UP * 1.0
	box.global_position = focus + (cam_pos - focus) * 0.5
	await _frames(2)
	rig._fade_occluders(0.2)
	var trans: float = float(box.transparency)
	ok(trans >= 0.70, "遮挡物在连线上时几何体 transparency ≥ 0.70（实测 %.2f）" % trans)
	# 移开连线：沿水平法向量移出
	var dir: Vector3 = (cam_pos - focus).normalized()
	var side: Vector3 = Vector3(-dir.z, 0.0, dir.x).normalized()
	box.global_position = focus + side * 20.0
	await _frames(2)
	rig._fade_occluders(0.35)
	var trans2: float = float(box.transparency)
	ok(trans2 <= 0.05, "离开连线后恢复到 ~0（实测 %.2f）" % trans2)

	print("CAMERAV3 PASS" if fails.is_empty() else "CAMERAV3 FAIL %d" % fails.size())
	quit(0 if fails.is_empty() else 1)
