class_name SkinnedWing
extends Node2D
## 可复用的骨骼蒙皮翼（M1 样例的组件版）：5 骨链 + Polygon2D 权重蒙皮。
## 构建细节与三个 Godot 坑见 wing_proof.gd 的注释。state_amp 由宿主按状态调（待机/奔跑/冲刺）。

var _bones: Array[Bone2D] = []
var _t := 0.0
var amp := 0.17
var speed := 2.2
var _tex: Texture2D
var _wing_w := 300.0
var _root_frac := 0.55

func _init(tex: Texture2D, wing_w: float = 300.0, root_frac: float = 0.55) -> void:
	# 只存参数，节点构建必须等 _ready（入树后）：在 _init 里建骨骼，Skeleton2D 不处理，翼面会塌掉
	_tex = tex
	_wing_w = wing_w
	_root_frac = root_frac

func _ready() -> void:
	var tex := _tex
	var wing_w := _wing_w
	var root_frac := _root_frac
	var wing_h := wing_w * tex.get_height() / tex.get_width()
	var root_above := root_frac * wing_h
	var seg := wing_w / 5.0
	var skeleton := Skeleton2D.new()
	add_child(skeleton)
	var parent: Node2D = skeleton
	var chain: Array[Bone2D] = []
	for i in 6:
		var bone := Bone2D.new()
		bone.name = "Bone%d" % i
		bone.position = Vector2(0, 0) if i == 0 else Vector2(-seg, 0)
		parent.add_child(bone)
		chain.append(bone)
		parent = bone
	for i in range(chain.size() - 1, -1, -1):
		chain[i].rest = chain[i].transform
	_bones = chain.slice(0, 5)

	var poly := Polygon2D.new()
	poly.texture = tex
	poly.skeleton = NodePath("..")
	var verts := PackedVector2Array()
	var uvs := PackedVector2Array()
	var cols := 16
	var rows := 4
	var ts := tex.get_size()
	for r in rows + 1:
		for c in cols + 1:
			var x := -wing_w + c * (wing_w / cols)
			var y := -root_above + r * (wing_h / rows)
			verts.append(Vector2(x, y))
			uvs.append(Vector2((x + wing_w) / wing_w * ts.x, (y + root_above) / wing_h * ts.y))
	poly.polygon = verts
	poly.uv = uvs
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
	for i in 5:
		var weights := PackedFloat32Array()
		weights.resize(verts.size())
		var centre := (i + 0.5) * seg
		for v in verts.size():
			weights[v] = clampf(1.0 - absf(-verts[v].x - centre) / seg, 0.0, 1.0)
		var parts: Array = []
		for k in i + 1:
			parts.append("Bone%d" % k)
		poly.add_bone(NodePath("/".join(parts)), weights)
	skeleton.add_child(poly)

func _process(delta: float) -> void:
	_t += delta
	for i in _bones.size():
		var f := float(i) / 4.0
		_bones[i].rotation = sin(_t * speed - i * 0.55) * amp * (0.35 + 0.65 * f)
