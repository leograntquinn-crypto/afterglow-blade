extends Node
## 全局单例 Game：顿帧、震屏请求、连击计数、攻击令牌、常量。
##
## 所有战斗角色在 _physics_process 开头检查 Game.frozen —— 顿帧期间世界静止，
## 但粒子和镜头照常运动，这样「砍中的瞬间」看得清、又不会显得卡住。

signal shake_requested(strength: float, frames: int)
signal zoom_kick(amount: float)
signal combo_changed(count: int, damage: int)
signal flash_requested(color: Color, strength: float)

# ---- 2.5D 世界常量（单位与网页版一致：像素、帧）----
const GROUND_Y := 330.0   # 纵深 0 在屏幕上的 y
const DEPTH := 170.0      # 可走的纵深范围
const GRAVITY := 0.6      # 像素 / 帧²

var hitstop := 0
var combo := 0
var combo_damage := 0
var combo_timer := 0
var attackers: Array[Node] = []  # 正在出招的敌人（最多 2 个，保证公平）

var frozen: bool:
	get: return hitstop > 0


func _physics_process(_delta: float) -> void:
	if hitstop > 0:
		hitstop -= 1
		return
	if combo_timer > 0:
		combo_timer -= 1
		if combo_timer == 0:
			combo = 0
			combo_damage = 0
			combo_changed.emit(0, 0)


func add_hitstop(frames: int) -> void:
	hitstop = maxi(hitstop, frames)


func shake(strength: float, frames: int = 12) -> void:
	shake_requested.emit(strength, frames)


func flash(color: Color, strength: float) -> void:
	flash_requested.emit(color, strength)


func register_hit(dmg: int) -> void:
	combo += 1
	combo_damage += dmg
	combo_timer = 110
	combo_changed.emit(combo, combo_damage)


func reset() -> void:
	hitstop = 0
	combo = 0
	combo_damage = 0
	combo_timer = 0
	attackers.clear()
