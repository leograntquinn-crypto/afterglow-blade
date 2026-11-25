extends Node
## 运行时弹簧骨接入层：优先使用 Godot 4.x 原生 SpringBoneSimulator3D。
## 真实骨链由 Muse 资产提供；缺链时不创建伪骨、不生成程序外观。
## 求解器由引擎在 SkeletonModifier3D 阶段执行，代码侧只负责配置与顿帧开关。

const HAIR_CHAINS := [
	["HairRoot", "HairTip"], ["Hair_01", "Hair_05"], ["PonytailRoot", "PonytailTip"]
]
const CLOTH_CHAINS := [
	["WaistClothL_01", "WaistClothL_03"], ["WaistClothR_01", "WaistClothR_03"],
	["WaistL_01", "WaistL_03"], ["WaistR_01", "WaistR_03"]
]

var modifiers: Array[SkeletonModifier3D] = []
var skeleton: Skeleton3D

func setup(root: Node, owner_skeleton: Skeleton3D = null) -> int:
	skeleton = owner_skeleton
	if skeleton == null:
		var found := root.find_children("*", "Skeleton3D", true, false)
		if found.is_empty():
			return 0
		skeleton = found[0] as Skeleton3D
	if not ClassDB.class_exists("SpringBoneSimulator3D"):
		return 0
	for chain in HAIR_CHAINS:
		_add_chain(chain, 0.6, 0.35, 0.4)
	for chain in CLOTH_CHAINS:
		_add_chain(chain, 0.9, 0.5, 0.6)
	return modifiers.size()

func _add_chain(chain: Array, stiffness: float, drag: float, gravity: float) -> void:
	if skeleton.find_bone(chain[0]) < 0 or skeleton.find_bone(chain[1]) < 0:
		return
	var modifier := SpringBoneSimulator3D.new()
	modifier.set_setting_count(1)
	modifier.set_root_bone_name(0, chain[0])
	modifier.set_end_bone_name(0, chain[1])
	modifier.set_stiffness(0, stiffness)
	modifier.set_drag(0, drag)
	modifier.set_gravity(0, gravity)
	modifier.set_gravity_direction(0, Vector3.DOWN)
	modifier.set_radius(0, 0.025)
	modifier.name = "SpringBone_%s" % chain[0]
	skeleton.add_child(modifier)
	modifiers.append(modifier)

func set_frozen(frozen: bool) -> void:
	for modifier in modifiers:
		modifier.active = not frozen

func count() -> int:
	return modifiers.size()
