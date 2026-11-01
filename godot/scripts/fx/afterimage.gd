extends FighterView
## 残影：复制主角当前的姿势，用剑光色画一遍，然后淡出

func _ready() -> void:
	var mat := CanvasItemMaterial.new()
	mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	material = mat
	var tw := create_tween()
	tw.tween_property(self, "modulate:a", 0.0, 0.2)
	tw.tween_callback(queue_free)


func _process(_delta: float) -> void:
	scale.x = facing
