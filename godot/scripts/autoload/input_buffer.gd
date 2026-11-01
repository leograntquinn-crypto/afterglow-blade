extends Node
## 全局单例 Buffer：默认按键映射 + 输入缓冲。
##
## 输入缓冲：提前按下的键会被记住 BUFFER 帧，等角色能出招的那一刻再执行。
## 帧计数只在世界没被顿帧冻结时前进，所以顿帧期间按的键不会过期。
##
## 按键映射在这里用代码注册，你也可以在「项目设置 → 输入映射」里改，改过的会优先生效。

const BUFFER := 10

const KEYS := {
	"move_left": [KEY_A, KEY_LEFT],
	"move_right": [KEY_D, KEY_RIGHT],
	"move_up": [KEY_W, KEY_UP],
	"move_down": [KEY_S, KEY_DOWN],
	"attack": [KEY_J],
	"jump": [KEY_K, KEY_SPACE],
	"dash": [KEY_L, KEY_SHIFT],
	"skill1": [KEY_U],
	"skill2": [KEY_I],
	"skill3": [KEY_O],
	"skill4": [KEY_P],
	"pause": [KEY_ESCAPE],
	"debug_boxes": [KEY_F1],
}

# 手柄（Xbox 布局）：X 攻击、A 跳、B 闪避、Y/LB/RB/RT 技能
const PAD := {
	"attack": JOY_BUTTON_X, "jump": JOY_BUTTON_A, "dash": JOY_BUTTON_B,
	"skill1": JOY_BUTTON_Y, "skill2": JOY_BUTTON_LEFT_SHOULDER, "skill3": JOY_BUTTON_RIGHT_SHOULDER,
	"pause": JOY_BUTTON_START,
	"move_left": JOY_BUTTON_DPAD_LEFT, "move_right": JOY_BUTTON_DPAD_RIGHT,
	"move_up": JOY_BUTTON_DPAD_UP, "move_down": JOY_BUTTON_DPAD_DOWN,
}

var frame := 0
var _pressed := {}


func _ready() -> void:
	process_priority = -10  # 比角色更早处理，保证同一帧里先记录按键
	for action in KEYS:
		if InputMap.has_action(action):
			continue
		InputMap.add_action(action, 0.4)
		for k in KEYS[action]:
			var ev := InputEventKey.new()
			ev.physical_keycode = k
			InputMap.action_add_event(action, ev)
		if PAD.has(action):
			var jb := InputEventJoypadButton.new()
			jb.button_index = PAD[action]
			InputMap.action_add_event(action, jb)
	# 左摇杆
	for pair in [["move_left", JOY_AXIS_LEFT_X, -1.0], ["move_right", JOY_AXIS_LEFT_X, 1.0], ["move_up", JOY_AXIS_LEFT_Y, -1.0], ["move_down", JOY_AXIS_LEFT_Y, 1.0]]:
		var jm := InputEventJoypadMotion.new()
		jm.axis = pair[1]
		jm.axis_value = pair[2]
		InputMap.action_add_event(pair[0], jm)


func _physics_process(_delta: float) -> void:
	for action in KEYS:
		if Input.is_action_just_pressed(action):
			_pressed[action] = frame
	if not Game.frozen:
		frame += 1


## 这个动作是否在最近 win 帧内按下过（且还没被用掉）
func buffered(action: StringName, win: int = BUFFER) -> bool:
	return _pressed.has(action) and frame - _pressed[action] <= win


func consume(action: StringName) -> void:
	_pressed.erase(action)


func clear() -> void:
	_pressed.clear()


## 测试用：模拟按下一个动作
func inject(action: StringName) -> void:
	_pressed[action] = frame


func move_x() -> float:
	return Input.get_axis("move_left", "move_right")


func move_y() -> float:
	return Input.get_axis("move_up", "move_down")
