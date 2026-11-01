extends Node
## 无界面回归测试（作为普通场景运行，单例都已加载）：
##   godot --headless --fixed-fps 60 --path godot res://tests/run_tests.tscn
## 机器人打 30 秒（游戏内时间），检查战斗系统各环节都在工作。

var main: Node
var bot := TestBot.new()
var frame := 0
var max_combo := 0
var saw_hitstop := false
var saw_air := false


func _ready() -> void:
	main = load("res://scenes/main.tscn").instantiate()
	add_child(main)
	bot.main = main


func _physics_process(_delta: float) -> void:
	frame += 1
	if frame < 5:
		return
	main.player.hp = main.player.max_hp  # 测试时不死
	bot.step()
	max_combo = maxi(max_combo, Game.combo)
	saw_hitstop = saw_hitstop or Game.hitstop > 0
	for e in get_tree().get_nodes_in_group(&"enemies"):
		if e.state == &"air":
			saw_air = true
	if frame == 1800:
		var checks := {
			"击杀敌人 >= 3": main.kills >= 3,
			"最高连击 >= 3": max_combo >= 3,
			"出现过顿帧": saw_hitstop,
			"敌人被打上天过": saw_air,
			"进入过第 2 波": main.wave >= 2,
		}
		var ok := true
		for k in checks:
			print(("  ✓ " if checks[k] else "  ✗ ") + k)
			ok = ok and checks[k]
		print("击杀 %d · 最高连击 %d · 波次 %d" % [main.kills, max_combo, main.wave])
		print("RESULT: " + ("PASS" if ok else "FAIL"))
		get_tree().quit(0 if ok else 1)
