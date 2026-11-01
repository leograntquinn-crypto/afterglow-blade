extends Node2D
## 裂空斩的剑气：向前飞行，穿透敌人（每个敌人只打一次）

var gx := 0.0
var gy := 0.0
var z := 0.0
var vx := 10.5
var facing := 1
var life := 46
var color := Color("7ff3ff")
var hit: HitData
var hit_set := {}
var main: Node
var w := 56.0
var h := 100.0


func _ready() -> void:
	hit = HitData.new()
	hit.box_x = 0.0
	hit.box_w = 56.0
	hit.box_d = 30.0
	hit.box_z1 = 100.0
	hit.dmg = 26.0
	hit.kb = 3.0
	hit.launch = 8.0
	hit.stop = 6
	hit.shake = 5.0
	hit.heavy = true
	var mat := CanvasItemMaterial.new()
	mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	material = mat
	# 粒子材质是所有剑气共用的，先复制一份再改方向，避免互相影响
	$Trail.process_material = $Trail.process_material.duplicate()
	$Trail.process_material.direction = Vector3(-facing, -0.3, 0)


func _physics_process(_delta: float) -> void:
	if Game.frozen:
		return
	gx += vx
	life -= 1
	position = Vector2(gx, Game.GROUND_Y + gy)
	if life <= 0 or gx < -50 or gx > main.room_width + 50:
		$Trail.emitting = false
		set_physics_process(false)
		var tw := create_tween()
		tw.tween_property(self, "modulate:a", 0.0, 0.25)
		tw.tween_callback(queue_free)
		return
	var box := {"cx": gx, "hw": hit.box_w / 2.0, "cy": gy, "d": hit.box_d, "z0": z, "z1": z + hit.box_z1}
	for e in get_tree().get_nodes_in_group(&"enemies"):
		if hit_set.has(e) or not Combat.overlaps(box, e):
			continue
		if main.apply_hit(self, e, hit, facing):
			hit_set[e] = true
	queue_redraw()


func _draw() -> void:
	var a := minf(1.0, life / 10.0)
	for i in 3:
		var col := Color.WHITE if i == 0 else color
		col.a = a * (0.9 - i * 0.25)
		var pts := PackedVector2Array()
		for s in 13:
			var ang := -PI / 2 + PI * s / 12.0
			pts.append(Vector2(-i * 14.0 * facing + cos(ang) * 18.0 * facing, -50.0 + sin(ang) * 52.0))
		draw_polyline(pts, col, 10.0 - i * 2.5, true)
