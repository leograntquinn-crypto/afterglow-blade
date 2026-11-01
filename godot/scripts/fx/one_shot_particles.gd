extends GPUParticles2D
## 一次性粒子：放进场景就立刻喷发，结束后自动删除。
## 粒子不受「顿帧」影响 —— 世界停住的那几帧火花照样飞，这正是打击感的来源之一。

func _ready() -> void:
	one_shot = true
	emitting = true
	finished.connect(queue_free)
