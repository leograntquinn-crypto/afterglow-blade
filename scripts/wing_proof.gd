extends Node2D
## M1 翅膀样例：Skeleton2D + Polygon2D 蒙皮（权重混合）做骨骼挥翅。
## 网页端做不到的平滑变形在这里是原生能力——本场景只验证这一件事。
## 骨骼/网格/权重全部在 _ready 里程序化构建，方便对照参数与自动验证。

const WING_TEX: Texture2D = preload("res://art/wings/wings_side_dawn.webp")
const WING_W := 560.0          # 显示宽（源图 1024×512，根在右、尖在左）
const WING_H := 280.0
const ROOT_ABOVE := 154.0      # 根线以上高度（rootY≈0.55，与网页版侧翼锚点一致）
const BONES := 5
const SEG_LEN := WING_W / BONES

var _bones: Array[Bone2D] = []
var _t := 0.0
var _capture := false
var _shots := 0
var _shot_times: Array[float] = [0.8, 1.5, 2.2]

func _ready() -> void:
	_capture = "--capture" in OS.get_cmdline_user_args()
	var bg := ColorRect.new()
	bg.color = Color(0.05, 0.05, 0.08)
	bg.size = Vector2(960, 540)
	add_child(bg)

	var skeleton := Skeleton2D.new()
	skeleton.name = "Skeleton"
	skeleton.position = Vector2(640, 270)
	add_child(skeleton)

	var parent: Node2D = skeleton
	var chain: Array[Bone2D] = []
	for i in BONES + 1:  # 多一根尖端骨收尾，让每根承重骨都有子骨可算长度
		var bone := Bone2D.new()
		bone.name = "Bone%d" % i
		bone.position = Vector2(0, 0) if i == 0 else Vector2(-SEG_LEN, 0)
		parent.add_child(bone)
		chain.append(bone)
		parent = bone
	for i in range(chain.size() - 1, -1, -1):  # 链建完后自尖向根设定 rest，避免长度计算警告
		chain[i].rest = chain[i].transform
	_bones = chain.slice(0, BONES)

	var poly := Polygon2D.new()
	poly.name = "Wing"
	poly.texture = WING_TEX
	var noskin := "--noskin" in OS.get_cmdline_user_args()
	if not noskin:
		poly.skeleton = NodePath("..")  # 多边形挂在 Skeleton2D 之下，与骨骼共享坐标系

	# 网格：17 列 × 5 行，覆盖 x∈[-560,0]、y∈[-ROOT_ABOVE, WING_H-ROOT_ABOVE]
	var verts := PackedVector2Array()
	var uvs := PackedVector2Array()
	var cols := 16
	var rows := 4
	for r in rows + 1:
		for c in cols + 1:
			var x := -WING_W + c * (WING_W / cols)
			var y := -ROOT_ABOVE + r * (WING_H / rows)
			verts.append(Vector2(x, y))
			# 注意：Polygon2D 的 UV 是纹理像素坐标，不是 0..1 归一化（踩过：归一化只会采样到左上角透明像素，整翼隐形）
			var ts := WING_TEX.get_size()
			uvs.append(Vector2((x + WING_W) / WING_W * ts.x, (y + ROOT_ABOVE) / WING_H * ts.y))
	poly.polygon = verts
	poly.uv = uvs
	# 注意：polygons 的每个元素是一个简单多边形（这里逐三角形一条），
	# 把全部三角形塞进一个 PackedInt32Array 会被当成一条自交轮廓，三角化成乱片（踩过）
	var polys: Array[PackedInt32Array] = []
	for r in rows:
		for c in cols:
			var a := r * (cols + 1) + c
			var b := a + 1
			var d := a + cols + 1
			var e := d + 1
			polys.append(PackedInt32Array([a, b, e]))
			polys.append(PackedInt32Array([a, e, d]))
	poly.polygons = polys

	# 权重：每根骨骼对顶点的影响按沿翼距离平滑衰减，相邻骨骼交叠混合——变形连续、无硬折点
	for i in BONES:
		var weights := PackedFloat32Array()
		weights.resize(verts.size())
		var centre := (i + 0.5) * SEG_LEN
		for v in verts.size():
			var dist := -verts[v].x
			weights[v] = clampf(1.0 - absf(dist - centre) / SEG_LEN, 0.0, 1.0)
		# 注意：add_bone 的路径是相对骨骼（Skeleton2D）节点的，不是相对本多边形
		if not noskin:
			poly.add_bone(NodePath("/".join(_bone_path(i))), weights)
	skeleton.add_child(poly)

	# 权重归一化由引擎处理（蒙皮时按总权重缩放）；根点标记
	var anchor := Polygon2D.new()
	anchor.polygon = PackedVector2Array([Vector2(-5, -5), Vector2(5, -5), Vector2(5, 5), Vector2(-5, 5)])
	anchor.color = Color(1, 0.85, 0.4)
	anchor.position = skeleton.position
	add_child(anchor)

func _bone_path(i: int) -> Array:
	var parts: Array = []
	for k in i + 1:
		parts.append("Bone%d" % k)
	return parts

func _process(delta: float) -> void:
	_t += delta
	# 行波挥翅：相位沿骨骼链滞后、振幅向翼尖递增——与网页版同一套节奏参数，蒙皮负责平滑
	for i in _bones.size():
		var f := float(i) / float(BONES - 1)
		_bones[i].rotation = sin(_t * 2.2 - i * 0.55) * 0.17 * (0.35 + 0.65 * f)
	if _capture:
		if _shots < _shot_times.size() and _t >= _shot_times[_shots]:
			_shots += 1
			await RenderingServer.frame_post_draw
			var img := get_viewport().get_texture().get_image()
			img.save_png(ProjectSettings.globalize_path("res://") + "capture_%d.png" % _shots)
			if _shots >= _shot_times.size():
				get_tree().quit()
