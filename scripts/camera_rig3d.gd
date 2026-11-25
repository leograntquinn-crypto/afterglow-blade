extends Node3D
## CameraRig3D — 定版斜俯视跟随镜头（GUIZANG 吸收规格 C6.3 / C6.4）。
## 45° 俯角 / 16m 距离 / FOV 38 / 焦点缰绳 3.5m / 遮挡淡出 / 一键回正。
## 帧数按 60Hz 物理帧定义；回正过渡按实时秒数走，不受 time_scale 与角色顿帧影响。

const DEFAULT_PITCH_DEG := 45.0
const PITCH_MIN_DEG := 38.0
const PITCH_MAX_DEG := 55.0
const BASE_DISTANCE := 16.0
const FOV_DEG := 38.0
const ZOOM_MIN := 0.95
const ZOOM_MAX := 1.3
const ZOOM_STEP := 0.05
const ZOOM_SMOOTH := 0.2
const FOCUS_HEIGHT := 1.0
const LEASH := 3.5
const FOLLOW_SMOOTH := 0.18
const OCC_FADE_IN := 0.15
const OCC_FADE_OUT := 0.3
const OCC_ALPHA := 0.75
const OCC_PAD := 0.6
const MOUSE_SENSITIVITY := 0.006
const STICK_SENSITIVITY := 2.4
const RECENTER_BASE_FRAMES := 10
const RECENTER_ARC_FRAMES := 14
const RECENTER_DONE_ANGLE := 2.0
const RECENTER_DONE_PITCH := 1.0

var target: Node3D
var facing_source: Node3D
var boss_target: Node3D
var ground_mask := 1
var yaw := 0.0
var pitch := -deg_to_rad(DEFAULT_PITCH_DEG)
var zoom := 1.0
var camera: Camera3D

var _zoom_target := 1.0
var _focus := Vector3.ZERO
var _focus_ready := false
var _occluders: Array = []
var _occ_state := {}
var _recenter_active := false
var _recenter_t := 0.0
var _recenter_total := 0.0
var _recenter_from_yaw := 0.0
var _recenter_to_yaw := 0.0
var _recenter_from_pitch := 0.0
var _recenter_to_pitch := -deg_to_rad(DEFAULT_PITCH_DEG)
var _move_lock_active := false
var _move_lock_yaw := 0.0
var _move_lock_input := Vector2.ZERO
var _post_lock_yaw := 0.0
var _dragging := false
var input_enabled := true

func _ready() -> void:
	camera = Camera3D.new()
	camera.fov = FOV_DEG
	camera.far = 500.0
	add_child(camera)
	camera.current = true
	_ensure_input()

func _ensure_input() -> void:
	if not InputMap.has_action("camera_recenter"):
		InputMap.add_action("camera_recenter")
		var key := InputEventKey.new()
		key.physical_keycode = KEY_C
		InputMap.action_add_event("camera_recenter", key)
		var mouse := InputEventMouseButton.new()
		mouse.button_index = MOUSE_BUTTON_MIDDLE
		InputMap.action_add_event("camera_recenter", mouse)
		var pad := InputEventJoypadButton.new()
		pad.button_index = JOY_BUTTON_RIGHT_STICK
		InputMap.action_add_event("camera_recenter", pad)

func setup(hero: Node3D, face: Node3D = null) -> void:
	target = hero
	facing_source = face if face != null else hero
	_focus = _desired_focus()
	_focus_ready = true
	_apply_transform()

func set_occluders(nodes: Array) -> void:
	_occluders.clear()
	_occ_state.clear()
	for node in nodes:
		if node is Node3D:
			_occluders.append(node)
			_occ_state[node.get_instance_id()] = 0.0

func mark_occluder(node: Node3D, radius: float, height: float = 1.5) -> void:
	if node == null:
		return
	node.add_to_group("occluder")
	node.set_meta("fade_radius", radius)
	node.set_meta("fade_height", height)
	_occluders.append(node)
	_occ_state[node.get_instance_id()] = 0.0

func is_recentering() -> bool:
	return _recenter_active

## 移动参考系：回正期间锁定在按下那一帧的镜头偏航。
func move_yaw() -> float:
	if _move_lock_active:
		return _move_lock_yaw
	return yaw

## 回正结束后处理"按住方向不变则沿用旧参考系"（≤30°）。
func post_recenter_input(input: Vector2) -> void:
	if not _recenter_active and _post_lock_yaw != 0.0:
		var old := _move_lock_input
		if input.length() > 0.05 and old.length() > 0.05:
			if old.angle_to(input) <= deg_to_rad(30.0):
				_move_lock_active = true
				_move_lock_yaw = _post_lock_yaw
			else:
				_post_lock_yaw = 0.0
		elif input.length() <= 0.05:
			_post_lock_yaw = 0.0

func start_recenter() -> void:
	var from_yaw := _effective_yaw()
	var to_yaw := _recenter_target_yaw()
	var from_pitch := pitch
	var to_pitch := -deg_to_rad(DEFAULT_PITCH_DEG)
	var d_yaw := wrapf(to_yaw - from_yaw, -PI, PI)
	var d_yaw_deg := rad_to_deg(absf(d_yaw))
	var d_pitch_deg := rad_to_deg(absf(wrapf(to_pitch - from_pitch, -PI, PI)))
	if d_yaw_deg < RECENTER_DONE_ANGLE and d_pitch_deg < RECENTER_DONE_PITCH:
		yaw = to_yaw
		pitch = to_pitch
		_move_lock_active = false
		_post_lock_yaw = 0.0
		return
	_move_lock_yaw = yaw
	_move_lock_input = _move_input_vector()
	_move_lock_active = true
	_post_lock_yaw = 0.0
	_recenter_active = true
	_recenter_t = 0.0
	_recenter_total = float(roundi(RECENTER_BASE_FRAMES + RECENTER_ARC_FRAMES * d_yaw_deg / 180.0)) / 60.0
	_recenter_from_yaw = from_yaw
	_recenter_to_yaw = from_yaw + d_yaw
	_recenter_from_pitch = from_pitch
	_recenter_to_pitch = to_pitch

func cancel_recenter(keep_yaw: bool = true) -> void:
	if not _recenter_active:
		return
	if keep_yaw:
		yaw = _current_recenter_yaw()
	_recenter_active = false
	_move_lock_active = false
	_post_lock_yaw = 0.0

func _recenter_target_yaw() -> float:
	if boss_target != null and is_instance_valid(boss_target) and target != null:
		var d := boss_target.global_position - target.global_position
		d.y = 0.0
		if d.length() > 0.05:
			return atan2(-d.x, -d.z)
	var face := facing_source if facing_source != null else target
	if face == null:
		return yaw
	# 模型朝向 θ = rotation.y；镜头在角色背后时，镜头偏航 = θ - π（镜头在角色正后方，视线与模型朝向相同）。
	return face.global_rotation.y - PI

func _effective_yaw() -> float:
	return _current_recenter_yaw() if _recenter_active else yaw

func _current_recenter_yaw() -> float:
	if not _recenter_active:
		return yaw
	var t := clampf(_recenter_t / maxf(_recenter_total, 0.001), 0.0, 1.0)
	var e := 1.0 - pow(1.0 - t, 3.0)
	return lerp_angle(_recenter_from_yaw, _recenter_to_yaw, e)

func _desired_focus() -> Vector3:
	if target == null:
		return global_position
	return target.global_position + Vector3.UP * FOCUS_HEIGHT

func _process(delta: float) -> void:
	if target == null or not is_instance_valid(target):
		return
	# 回正按实时时间推进。
	if _recenter_active:
		_recenter_t += delta
		var t := clampf(_recenter_t / maxf(_recenter_total, 0.001), 0.0, 1.0)
		var e := 1.0 - pow(1.0 - t, 3.0)
		yaw = lerp_angle(_recenter_from_yaw, _recenter_to_yaw, e)
		pitch = lerpf(_recenter_from_pitch, _recenter_to_pitch, e)
		if t >= 1.0:
			yaw = _recenter_to_yaw
			pitch = _recenter_to_pitch
			_recenter_active = false
			_post_lock_yaw = _move_lock_yaw
			_move_lock_active = false
	var wanted := _desired_focus()
	if not _focus_ready:
		_focus = wanted
		_focus_ready = true
	else:
		_focus = _focus.lerp(wanted, 1.0 - exp(-delta / FOLLOW_SMOOTH))
	var anchor := target.global_position + Vector3.UP * FOCUS_HEIGHT
	var flat := Vector3(_focus.x - anchor.x, 0.0, _focus.z - anchor.z)
	if flat.length() > LEASH:
		flat = flat.normalized() * LEASH
		_focus.x = anchor.x + flat.x
		_focus.z = anchor.z + flat.z
	_zoom_target = clampf(_zoom_target, ZOOM_MIN, ZOOM_MAX)
	zoom = lerpf(zoom, _zoom_target, 1.0 - exp(-delta / ZOOM_SMOOTH))
	_apply_transform()
	_fade_occluders(delta)

func _apply_transform() -> void:
	if camera == null:
		return
	var distance := BASE_DISTANCE * zoom
	var basis := Basis(Vector3.UP, yaw) * Basis(Vector3.RIGHT, pitch)
	var offset := basis * Vector3(0.0, 0.0, 1.0) * distance
	var pos := _focus + offset
	var ground := _ground_height(pos.x, pos.z)
	if ground > -1000.0:
		pos.y = maxf(pos.y, ground + 1.5)
	camera.global_position = pos
	var look_from := camera.global_position
	var dir := _focus - look_from
	if dir.length_squared() > 0.0001:
		camera.look_at(look_from + dir, Vector3.UP)

func _ground_height(x: float, z: float) -> float:
	if get_world_3d() == null:
		return global_position.y - 1.0
	var space := get_world_3d().direct_space_state
	var query := PhysicsRayQueryParameters3D.create(Vector3(x, 200.0, z), Vector3(x, -200.0, z), ground_mask)
	if target is CollisionObject3D:
		query.exclude = [target.get_rid()]
	var hit := space.intersect_ray(query)
	if hit.is_empty():
		return -1001.0
	return hit.position.y

func _fade_occluders(delta: float) -> void:
	if camera == null or target == null:
		return
	var cam := camera.global_position
	var goal := target.global_position + Vector3.UP * FOCUS_HEIGHT
	var seg := goal - cam
	var seg_flat := Vector3(seg.x, 0.0, seg.z)
	var seg_len2 := maxf(seg_flat.length_squared(), 0.0001)
	for node in _occluders:
		if not is_instance_valid(node) or not (node is Node3D):
			continue
		var p := (node as Node3D).global_position
		var to_p := Vector3(p.x - cam.x, 0.0, p.z - cam.z)
		var t := clampf(to_p.dot(seg_flat) / seg_len2, 0.0, 1.0)
		var closest := Vector3(cam.x + seg_flat.x * t, 0.0, cam.z + seg_flat.z * t)
		var radius := float(node.get_meta("fade_radius", 0.8))
		var dist := Vector2(p.x - closest.x, p.z - closest.z).length()
		var blocking := dist < radius + OCC_PAD and t > 0.02 and t < 0.98
		var id: int = node.get_instance_id()
		var cur := float(_occ_state.get(id, 0.0))
		var goal_alpha := OCC_ALPHA if blocking else 0.0
		var fade_time := OCC_FADE_IN if blocking else OCC_FADE_OUT
		var speed := absf(goal_alpha - cur) / maxf(fade_time, 0.0001)
		var next := move_toward(cur, goal_alpha, speed * delta)
		_occ_state[id] = next
		_set_transparency(node, next)

func _set_transparency(node: Node, value: float) -> void:
	if node is GeometryInstance3D:
		(node as GeometryInstance3D).transparency = value
	for child in node.get_children():
		_set_transparency(child, value)

func _move_input_vector() -> Vector2:
	return Vector2(float(Input.is_key_pressed(KEY_D)) - float(Input.is_key_pressed(KEY_A)), float(Input.is_key_pressed(KEY_S)) - float(Input.is_key_pressed(KEY_W)))

func apply_zoom(steps: int) -> void:
	_zoom_target = clampf(_zoom_target + ZOOM_STEP * steps, ZOOM_MIN, ZOOM_MAX)

func rotate_by(relative: Vector2) -> void:
	yaw = wrapf(yaw - relative.x * MOUSE_SENSITIVITY, -PI, PI)
	pitch = clampf(pitch - relative.y * MOUSE_SENSITIVITY, -deg_to_rad(PITCH_MAX_DEG), -deg_to_rad(PITCH_MIN_DEG))

func _unhandled_input(event: InputEvent) -> void:
	if not input_enabled or target == null:
		return
	if event.is_action_pressed("camera_recenter"):
		start_recenter()
		get_viewport().set_input_as_handled()
		return
	if event is InputEventMouseButton:
		if event.button_index in [MOUSE_BUTTON_LEFT, MOUSE_BUTTON_RIGHT]:
			_dragging = event.pressed
			if event.pressed and _recenter_active:
				cancel_recenter()
		elif event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_UP:
			apply_zoom(-1)
		elif event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			apply_zoom(1)
	elif event is InputEventMouseMotion and _dragging and event.relative.length() > 0.0:
		if _recenter_active:
			cancel_recenter()
		rotate_by(event.relative)
	elif event is InputEventJoypadMotion:
		var stick := Vector2(Input.get_joy_axis(0, JOY_AXIS_RIGHT_X), Input.get_joy_axis(0, JOY_AXIS_RIGHT_Y))
		if stick.length() > 0.2:
			if _recenter_active:
				cancel_recenter()
			rotate_by(stick * get_process_delta_time() * STICK_SENSITIVITY / maxf(get_process_delta_time(), 0.0001) * 0.016)
