extends SceneTree
## 一次性工具：把网页版的招式表生成为 data/moves/*.tres。
## 之后招式数据就以 .tres 为准，在编辑器里直接改。
##
## 运行：godot --headless --path godot -s res://tools/build_moves.gd

const MELEE := {"box_x": 48.0, "box_w": 92.0, "box_d": 30.0, "box_z0": 0.0, "box_z1": 100.0}

var MOVES := {
	"slash1": {"total": 22, "cancel": 10, "next_move": &"slash2", "lunge": [2, 7, 2.2], "swing": [-2.0, 0.9],
		"hits": [_h(5, 4, MELEE, {"dmg": 10.0, "kb": 2.5, "stun": 20, "stop": 4, "shake": 2.0})]},
	"slash2": {"total": 22, "cancel": 10, "next_move": &"slash3", "lunge": [2, 7, 2.6], "swing": [1.0, -1.6],
		"hits": [_h(5, 4, MELEE, {"dmg": 12.0, "kb": 2.8, "stun": 20, "stop": 4, "shake": 2.0})]},
	"slash3": {"total": 34, "cancel": 20, "lunge": [3, 10, 4.5], "swing": [-2.4, 1.2], "heavy": true,
		"hits": [_h(8, 5, {"box_x": 55.0, "box_w": 112.0, "box_d": 34.0, "box_z0": 0.0, "box_z1": 110.0}, {"dmg": 22.0, "kb": 8.0, "stun": 26, "stop": 8, "shake": 7.0, "heavy": true})]},
	"upper": {"total": 30, "cancel": 13, "jump_cancel": true, "lunge": [2, 6, 2.0], "swing": [1.3, -2.0],
		"hits": [_h(6, 5, {"box_x": 42.0, "box_w": 84.0, "box_d": 30.0, "box_z0": 0.0, "box_z1": 130.0}, {"dmg": 14.0, "kb": 1.2, "launch": 12.0, "stop": 6, "shake": 4.0})]},
	"air_slash": {"air": true, "total": 20, "cancel": 9, "next_move": &"air_slash2", "swing": [-1.8, 0.8], "hang": 2.5,
		"hits": [_h(4, 5, {"box_x": 44.0, "box_w": 94.0, "box_d": 32.0, "box_z0": -50.0, "box_z1": 80.0}, {"dmg": 11.0, "kb": 1.5, "launch": 5.0, "stop": 5, "shake": 2.0})]},
	"air_slash2": {"air": true, "total": 24, "cancel": 14, "swing": [-2.4, 1.6], "hang": 1.0, "heavy": true,
		"hits": [_h(5, 5, {"box_x": 40.0, "box_w": 98.0, "box_d": 34.0, "box_z0": -70.0, "box_z1": 70.0}, {"dmg": 16.0, "kb": 2.0, "spike": true, "stop": 8, "shake": 6.0, "heavy": true})]},
	"dash_attack": {"total": 28, "cancel": 18, "lunge": [0, 10, 9.0], "swing": [0.05, 0.05], "thrust": true,
		"hits": [_h(3, 8, {"box_x": 50.0, "box_w": 100.0, "box_d": 30.0, "box_z0": 0.0, "box_z1": 100.0}, {"dmg": 16.0, "kb": 7.0, "stun": 24, "stop": 6, "shake": 4.0})]},
}


func _h(at: int, dur: int, box: Dictionary, fx: Dictionary) -> Dictionary:
	var d := {"at": at, "dur": dur}
	d.merge(box)
	d.merge(fx)
	return d


func _init() -> void:
	DirAccess.make_dir_recursive_absolute("res://data/moves")
	for id in MOVES:
		var src: Dictionary = MOVES[id]
		var m := MoveData.new()
		m.id = id
		m.anim = id
		for k in src:
			match k:
				"lunge":
					m.lunge_from = src.lunge[0]
					m.lunge_to = src.lunge[1]
					m.lunge_speed = src.lunge[2]
				"swing":
					m.swing_from = src.swing[0]
					m.swing_to = src.swing[1]
				"hits":
					for hd in src.hits:
						var h := HitData.new()
						for hk in hd:
							h.set(hk, hd[hk])
						m.hits.append(h)
				_:
					m.set(k, src[k])
		var path := "res://data/moves/%s.tres" % id
		var err := ResourceSaver.save(m, path)
		print("saved ", path, " err=", err)
	quit()
