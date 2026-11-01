extends Control
## 战斗界面：血条、魔力条、技能、连击、横幅、操作提示（全部用 _draw 画，等 UI 素材到了再换成贴图）

const NUM := preload("res://assets/fonts/Teko-SemiBold.ttf")
const TITLE := preload("res://assets/fonts/MaShanZheng-Regular.ttf")
const GOLD := Color("e9cf8e")
var UI_FONT := SystemFont.new()  # 正文用系统字体：Mac 上是苹方，Windows 上是微软雅黑

var player: Player
var combo := 0
var combo_dmg := 0
var combo_pop := 0.0
var banner := ""
var banner_t := 999.0
var hurt_flash := 0.0
var t := 0.0


func _ready() -> void:
	UI_FONT.font_names = PackedStringArray(["PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "WenQuanYi Zen Hei", "sans-serif"])
	Game.combo_changed.connect(func(c: int, d: int) -> void:
		combo = c
		combo_dmg = d
		combo_pop = 1.0)


func show_banner(text: String) -> void:
	banner = text
	banner_t = 0.0


func flash_damage() -> void:
	hurt_flash = 0.35


func _process(delta: float) -> void:
	t += delta * 60.0
	banner_t += delta * 60.0
	combo_pop = maxf(0.0, combo_pop - delta * 7.0)
	hurt_flash = maxf(0.0, hurt_flash - delta * 1.5)
	queue_redraw()


func _slant(x: float, y: float, w: float, h: float, s: float) -> PackedVector2Array:
	return PackedVector2Array([Vector2(x + s, y), Vector2(x + w, y), Vector2(x + w - s, y + h), Vector2(x, y + h)])


func _bar(x: float, y: float, w: float, h: float, r: float, trail: float, top: Color, bot: Color) -> void:
	var s := h * 0.6
	draw_colored_polygon(_slant(x, y, w, h, s), Color(0.02, 0.01, 0.04, 0.88))
	if trail > r:
		draw_colored_polygon(_slant(x, y, w * trail, h, s), Color(1, 0.93, 0.84, 0.75))
	if r > 0.0:
		var pts := _slant(x, y, w * r, h, s)
		draw_polygon(pts, PackedColorArray([top, top, bot, bot]))
		draw_colored_polygon(_slant(x, y, w * r, h * 0.32, s * 0.32), Color(1, 1, 1, 0.2))
	var outline := _slant(x - 0.5, y - 0.5, w + 1, h + 1, s)
	outline.append(outline[0])
	draw_polyline(outline, Color(GOLD, 0.45), 1.0, true)


func _text(font: Font, pos: Vector2, s: String, size: int, col: Color, align := HORIZONTAL_ALIGNMENT_LEFT, width := -1.0) -> void:
	draw_string_outline(font, pos, s, align, width, size, 6, Color(0.03, 0.01, 0.04, 0.9))
	draw_string(font, pos, s, align, width, size, col)


func _draw() -> void:
	if player == null:
		return
	# 受伤时屏幕边缘泛红
	if hurt_flash > 0.0:
		draw_rect(Rect2(0, 0, 960, 540), Color(1, 0.1, 0.2, hurt_flash * 0.35))
	# 左上：名字 + 状态条
	_text(TITLE, Vector2(24, 34), "残光剑士", 24, Color("e9e2d6"))
	_bar(24, 44, 250, 16, player.hp / player.max_hp, player.hp_trail / player.max_hp, Color("ff6a78"), Color("9a1028"))
	_bar(24, 64, 205, 9, player.mp / player.max_mp, 0.0, Color("7ac0ff"), Color("1d4fa8"))
	_text(NUM, Vector2(24, 58), "%d / %d" % [ceili(player.hp), int(player.max_hp)], 17, Color.WHITE, HORIZONTAL_ALIGNMENT_RIGHT, 240)

	# 右下：技能槽（第 1 步只有裂空斩）
	var sx := 960.0 - 24 - 56
	var sy := 540.0 - 24 - 56
	var ready := player.skill_cd <= 0 and player.mp >= 15.0
	draw_rect(Rect2(sx, sy, 56, 56), Color(0.04, 0.03, 0.06, 0.9))
	if ready:
		draw_rect(Rect2(sx, sy, 56, 56), Color(player.glow, 0.12))
	_text(TITLE, Vector2(sx, sy + 40), "裂", 34, player.glow if ready else Color("5c5466"), HORIZONTAL_ALIGNMENT_CENTER, 56)
	if player.skill_cd > 0:
		var frac := player.skill_cd / 150.0
		draw_rect(Rect2(sx, sy + 56 * (1.0 - frac), 56, 56 * frac), Color(0, 0, 0, 0.6))
		_text(NUM, Vector2(sx, sy + 38), str(ceili(player.skill_cd / 60.0)), 24, Color.WHITE, HORIZONTAL_ALIGNMENT_CENTER, 56)
	draw_rect(Rect2(sx, sy, 56, 56), GOLD if ready else Color(1, 1, 1, 0.15), false, 1.5)
	_text(NUM, Vector2(sx + 4, sy + 14), "U", 15, Color("e9e2d6"))

	# 右侧：连击
	if combo >= 2:
		var pop := 1.0 + combo_pop * 0.3
		var col := Color("b6f9ff") if combo >= 30 else (Color("ffd65a") if combo >= 12 else Color.WHITE)
		draw_set_transform(Vector2(960 - 100, 150), 0.0, Vector2(pop, pop))
		_text(NUM, Vector2(-160, 0), str(combo), 72, col, HORIZONTAL_ALIGNMENT_RIGHT, 160)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		_text(TITLE, Vector2(960 - 96, 146), "连击", 26, Color("e9e2d6"))
		_text(UI_FONT, Vector2(760, 176), "总伤害 %d" % combo_dmg, 15, Color("ffd65a"), HORIZONTAL_ALIGNMENT_RIGHT, 176)

	# 横幅
	if banner_t < 130.0:
		var a := minf(1.0, banner_t / 15.0) if banner_t < 100.0 else maxf(0.0, 1.0 - (banner_t - 100.0) / 30.0)
		draw_rect(Rect2(0, 190, 960, 72), Color(0.02, 0.01, 0.04, 0.7 * a))
		draw_rect(Rect2(180, 190, 600, 1), Color(GOLD, 0.6 * a))
		draw_rect(Rect2(180, 261, 600, 1), Color(GOLD, 0.6 * a))
		_text(TITLE, Vector2(0, 242), banner, 44, Color(1, 1, 1, a), HORIZONTAL_ALIGNMENT_CENTER, 960)

	# 死亡
	if player.state == &"dead":
		draw_rect(Rect2(0, 0, 960, 540), Color(0.02, 0.01, 0.04, 0.6))
		_text(TITLE, Vector2(0, 260), "力 竭", 96, Color("ff4d5e"), HORIZONTAL_ALIGNMENT_CENTER, 960)
		_text(UI_FONT, Vector2(0, 330), "按 J 重新开始", 18, Color("e9e2d6"), HORIZONTAL_ALIGNMENT_CENTER, 960)

	# 操作提示
	_text(UI_FONT, Vector2(24, 540 - 22), "WASD 移动   J 攻击   K 跳跃   L 闪避   W+J 上挑   U 裂空斩   F1 显示判定框   （支持手柄）", 13, Color(0.91, 0.89, 0.84, 0.55))
