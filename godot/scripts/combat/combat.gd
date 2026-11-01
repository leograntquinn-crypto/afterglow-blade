class_name Combat
extends RefCounted
## 2.5D 判定：左右重叠、纵深接近、高度区间相交，三个条件都满足才算打中。
##
## 为什么不直接用 Godot 的 Area2D？Area2D 只有两个维度，而横版 2.5D 有三个：
## 左右 x、纵深 y、离地高度 z。被打飞到空中的敌人和地上的敌人在屏幕上可能重叠，
## 但实际上不该互相碰到。所以判定我们自己算，几行代码，完全可控。

## 角色需要的属性：gx（地面 x）、gy（纵深）、z、w、h、facing


static func box_of(ent: Node, h: HitData) -> Dictionary:
	var base_z: float = 0.0 if h.abs_z else ent.z
	return {
		"cx": ent.gx + ent.facing * h.box_x,
		"hw": h.box_w / 2.0,
		"cy": ent.gy,
		"d": h.box_d,
		"z0": base_z + h.box_z0,
		"z1": base_z + h.box_z1,
	}


static func overlaps(box: Dictionary, t: Node) -> bool:
	return absf(t.gx - box.cx) <= box.hw + t.w / 2.0 \
		and absf(t.gy - box.cy) <= box.d \
		and t.z + t.h >= box.z0 \
		and t.z <= box.z1
