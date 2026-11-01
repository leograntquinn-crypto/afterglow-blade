class_name TestBot
extends RefCounted
## 测试机器人：自动走向最近的敌人并连招，用来做无人值守的回归测试

var main: Node
var f := 0


func step() -> void:
	f += 1
	var p: Player = main.player
	for a in ["move_left", "move_right", "move_up", "move_down"]:
		Input.action_release(a)
	var target: Actor = null
	var best := 1e9
	for e in main.get_tree().get_nodes_in_group(&"enemies"):
		var d: float = absf(e.gx - p.gx) + absf(e.gy - p.gy) * 2.0
		if d < best:
			best = d
			target = e
	if target == null:
		return
	var dx := target.gx - p.gx
	var dy := target.gy - p.gy
	if absf(dy) > 8.0:
		Input.action_press("move_down" if dy > 0 else "move_up")
	if absf(dx) > 70.0:
		Input.action_press("move_right" if dx > 0 else "move_left")
	elif f % 9 == 0:
		if f % 180 == 0:
			Buffer.inject(&"skill1")
		elif f % 120 < 9:
			Input.action_press("move_up")
			Buffer.inject(&"attack")
		else:
			if absf(dx) > 4.0:
				Input.action_press("move_right" if dx > 0 else "move_left")
			Buffer.inject(&"attack")
		if f % 120 == 18:
			Buffer.inject(&"jump")
