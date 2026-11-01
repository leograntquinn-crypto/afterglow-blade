extends Node2D
## 主场景：生成角色、命中结算（打击感集中在 apply_hit）、特效工厂、音效、波次。
##
## 场景结构（在编辑器里打开 scenes/main.tscn 可以看到）：
##   Main
##   ├─ Backdrop          场景美术（后墙 Parallax 0.5 倍速、地面 6 行透视视差）
##   ├─ CanvasModulate    整体压暗 —— 只有光源照到的地方才亮（Godot 自带的 2D 光照）
##   ├─ World             角色们（y_sort 自动按纵深排序）
##   ├─ Camera2D
##   ├─ FXLayer           特效层：不受压暗影响，所以火花、刀光是「自发光」的
##   ├─ PostLayer         后期着色器：泛光、调色、暗角、颗粒
##   └─ HUD

const PLAYER := preload("res://scenes/actors/player.tscn")
const GRUNT := preload("res://scenes/actors/grunt.tscn")
const HIT_SPARK := preload("res://scenes/fx/hit_spark.tscn")
const DUST := preload("res://scenes/fx/dust.tscn")
const LIGHT_TEX := preload("res://assets/gen/light_radial.tres")
const SLASH := preload("res://scripts/fx/slash_arc.gd")
const NUMBER := preload("res://scripts/fx/damage_number.gd")
const AFTERIMAGE := preload("res://scripts/fx/afterimage.gd")

@export var room_width := 1600.0

var player: Player
var wave := 0
var kills := 0
var dead_t := 0
var _sfx := {}
var _sfx_last := {}
var _players: Array[AudioStreamPlayer] = []
var _player_i := 0

@onready var world: Node2D = $World
@onready var fx_layer: Node2D = $FXLayer/Root
@onready var camera: Camera2D = $Camera2D
@onready var hud: Control = $HUD/HUDRoot
@onready var debug: Node2D = $FXLayer/Root/Debug


func _ready() -> void:
	Game.reset()
	for n in ["swing", "hit", "heavy", "jump", "land", "dash", "hurt", "skill", "kill", "deny"]:
		_sfx[n] = load("res://assets/sfx/%s.wav" % n)
	for i in 10:
		var p := AudioStreamPlayer.new()
		add_child(p)
		_players.append(p)
	_spawn_player()
	_next_wave()


func _spawn_player() -> void:
	player = PLAYER.instantiate()
	player.main = self
	player.room_width = room_width
	world.add_child(player)
	player.place(320, Game.DEPTH / 2)
	camera.target = player
	camera.room_width = room_width
	camera.position = Vector2(480, 270)
	hud.player = player


func _next_wave() -> void:
	wave += 1
	var n := mini(2 + wave, 6)
	for i in n:
		var e: Enemy = GRUNT.instantiate()
		e.main = self
		e.room_width = room_width
		world.add_child(e)
		var side := -1 if i % 2 == 0 else 1
		e.place(clampf(camera.position.x + side * 420, 60, room_width - 60), randf_range(20, Game.DEPTH - 20))
		e.facing = -side
		spawn_dust(Vector2(e.gx, Game.GROUND_Y + e.gy), 10)
	hud.show_banner("第 %d 波" % wave)


func _physics_process(_delta: float) -> void:
	if Game.frozen:
		return
	if get_tree().get_nodes_in_group(&"enemies").is_empty() and player.state != &"dead":
		_next_wave()
	if player.state == &"dead":
		dead_t += 1
		if dead_t > 90 and Buffer.buffered(&"attack"):
			get_tree().reload_current_scene()
	if Input.is_action_just_pressed(&"debug_boxes"):
		debug.visible = not debug.visible


# ---------------- 命中结算：打击感集中在这里 ----------------
func apply_hit(src: Node, target: Actor, h: HitData, dir: int) -> bool:
	if target is Enemy and not target.can_be_hit():
		return false
	var from_player: bool = src.get(&"team") != &"enemy"
	var dmg := h.dmg * randf_range(0.92, 1.08)
	var crit := false
	if from_player:
		crit = randf() < 0.15
		if crit:
			dmg *= 1.6
	var idmg := maxi(1, roundi(dmg))
	if target is Enemy:
		var r: Dictionary = target.take_hit(h, dir, idmg)
		if r.is_empty():
			return false
		if r.has("killed"):
			_on_kill(target)
	elif not target.take_hit(h, dir, idmg):
		return false

	var p := target.body_point()
	p.x -= dir * target.w * 0.25
	# 1. 火花 + 命中闪光（一个瞬间亮起又熄灭的点光源）
	var spark: GPUParticles2D = HIT_SPARK.instantiate()
	spark.position = p
	spark.rotation = 0.0 if dir > 0 else PI
	spark.amount = 24 if h.heavy else 14
	if not from_player:
		spark.modulate = Color(1.0, 0.5, 0.45)
	fx_layer.add_child(spark)
	_flash_light(p, Color(1.0, 0.9, 0.7) if from_player else Color(1, 0.3, 0.3), 2.2 if h.heavy else 1.4)
	# 2. 伤害数字
	spawn_number(target.body_point(1.15), str(idmg), crit, Color("ffd65a") if crit else (Color.WHITE if from_player else Color("ff6a78")))
	# 3. 顿帧：整个世界停住几帧，让「砍中」的瞬间被看清
	Game.add_hitstop(h.stop + (2 if crit else 0))
	# 4. 震屏 + 重击镜头推近
	if h.shake > 0.0:
		Game.shake(h.shake, int(10 + h.shake))
	if from_player and (h.heavy or crit):
		Game.zoom_kick.emit(0.045 if h.heavy else 0.025)
	# 5. 音效
	play_sfx(&"heavy" if h.heavy or crit else &"hit")
	if from_player:
		Game.register_hit(idmg)
	else:
		play_sfx(&"hurt")
		hud.flash_damage()
	return true


func _on_kill(e: Enemy) -> void:
	kills += 1
	play_sfx(&"kill")
	if get_tree().get_nodes_in_group(&"enemies").is_empty():
		# 清场的最后一击：更长的顿帧 + 震屏
		Game.add_hitstop(12)
		Game.shake(10.0, 24)


# ---------------- 特效工厂 ----------------
func spawn_dust(at: Vector2, n: int) -> void:
	var d: GPUParticles2D = DUST.instantiate()
	d.position = at
	d.amount = n
	fx_layer.add_child(d)


func spawn_slash(owner_actor: Actor, m: MoveData) -> void:
	var s := Node2D.new()
	s.set_script(SLASH)
	s.position = owner_actor.body_point(0.65) + Vector2(owner_actor.facing * 6, 0)
	s.facing = owner_actor.facing
	if m:
		s.radius = 80.0 if m.heavy else 64.0
		s.a0 = m.swing_from
		s.a1 = m.swing_to
		s.width = 18.0 if m.heavy else 13.0
		s.color = player.glow
	else:
		s.radius = 56.0
		s.color = Color("ff6a5a")
		s.width = 10.0
	fx_layer.add_child(s)
	play_sfx(&"swing")


func spawn_afterimage(p: Player) -> void:
	var g := Node2D.new()
	g.set_script(AFTERIMAGE)
	g.look = p.view.look
	g.pose = p.view.pose.duplicate()
	g.facing = p.facing
	g.ghost = Color(p.glow, 0.5)
	g.position = Vector2(p.gx, Game.GROUND_Y + p.gy - p.z)
	world.add_child(g)


func spawn_number(at: Vector2, text: String, crit: bool, col: Color) -> void:
	var l := Label.new()
	l.set_script(NUMBER)
	l.setup(text, crit, col)
	l.position = at + Vector2(randf_range(-14, 14), 0)
	fx_layer.add_child(l)


func spawn_label(at: Vector2, text: String, col: Color, size: int) -> void:
	var l := Label.new()
	l.set_script(NUMBER)
	l.setup(text, false, col, true, size)
	l.position = at
	fx_layer.add_child(l)


func add_projectile(node: Node2D, owner_actor: Player) -> void:
	node.main = self
	node.facing = owner_actor.facing
	node.vx = owner_actor.facing * 10.5
	node.gx = owner_actor.gx + owner_actor.facing * 40
	node.gy = owner_actor.gy
	node.color = owner_actor.glow
	node.position = Vector2(node.gx, Game.GROUND_Y + node.gy)
	world.add_child(node)
	play_sfx(&"skill")


func _flash_light(at: Vector2, col: Color, energy: float) -> void:
	var l := PointLight2D.new()
	l.texture = LIGHT_TEX
	l.texture_scale = 2.2
	l.color = col
	l.energy = energy
	l.position = at
	world.add_child(l)
	var tw := l.create_tween()
	tw.tween_property(l, "energy", 0.0, 0.18)
	tw.tween_callback(l.queue_free)


# ---------------- 音效：一个小的播放器池，同一个音效 30ms 内只播一次 ----------------
func play_sfx(name: StringName) -> void:
	var now := Time.get_ticks_msec()
	if now - int(_sfx_last.get(name, 0)) < 30:
		return
	_sfx_last[name] = now
	var p := _players[_player_i]
	_player_i = (_player_i + 1) % _players.size()
	p.stream = _sfx[name]
	p.volume_db = -6.0
	p.pitch_scale = randf_range(0.95, 1.05)
	p.play()
