extends Node
## 截图（需要能渲染的环境）：
##   SHOT_DIR=/某个目录 xvfb-run godot --path godot --rendering-driver opengl3 res://tests/capture.tscn

var main: Node
var bot := TestBot.new()
var frame := 0
var shots := [90, 300, 460, 620]


func _ready() -> void:
	main = load("res://scenes/main.tscn").instantiate()
	add_child(main)
	bot.main = main


func _process(_delta: float) -> void:
	frame += 1
	if frame > 3:
		main.player.hp = main.player.max_hp * 0.8
		bot.step()
	if frame in shots:
		var img := get_viewport().get_texture().get_image()
		var path := OS.get_environment("SHOT_DIR").path_join("g%d.png" % frame)
		img.save_png(path)
		print("saved ", path)
	if frame >= shots.back():
		get_tree().quit()
