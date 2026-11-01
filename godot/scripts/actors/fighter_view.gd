class_name FighterView
extends Node2D
## 占位角色模型：从网页版移植的「2D 骨骼 + IK」程序化画法。
##
## 等素材到了，这个节点会换成 AnimatedSprite2D（逐帧动画）。
## 角色脚本只负责设置 pose（姿势参数）和 flash，不关心具体怎么画 —— 换素材时角色逻辑不用改。

const OUT := Color("120a16")

@export var look := {}            ## 外观：颜色、武器、体型
var pose := {}                    ## 姿势：lean 前倾、crouch 下蹲、walk 步伐相位、angle 武器角度、lie 倒地
var flash := false
var ghost := Color(0, 0, 0, 0)    ## 残影：所有部件画成这个颜色、不描边
var facing := 1
var t := 0.0


func _process(delta: float) -> void:
	t += delta * 60.0
	scale.x = facing
	queue_redraw()


# ---------- 小工具 ----------
func c(key: String, f := 1.0) -> Color:
	if ghost.a > 0.0:
		return ghost
	if flash:
		return Color.WHITE
	var col: Color = Color(look.get(key, "#ff00ff"))
	# 注意：Color * f 会连透明度一起乘，这里只调 RGB
	return Color(col.r * f, col.g * f, col.b * f, col.a) if f != 1.0 else col


func seg(pts: PackedVector2Array, w: float, col: Color) -> void:
	# 粗线段 + 圆头：先画深色描边，再画颜色
	for pass_i in 2:
		if pass_i == 0 and ghost.a > 0.0:
			continue
		var cw := w + 2.4 if pass_i == 0 else w
		var cc := (Color.WHITE if flash else OUT) if pass_i == 0 else col
		for i in pts.size() - 1:
			draw_line(pts[i], pts[i + 1], cc, cw, true)
		for p in pts:
			draw_circle(p, cw / 2.0, cc)


func poly(pts: PackedVector2Array, col: Color) -> void:
	if ghost.a == 0.0:
		var closed := pts.duplicate()
		closed.append(pts[0])
		draw_polyline(closed, Color.WHITE if flash else OUT, 2.6, true)
	draw_colored_polygon(pts, col)


func ik(a: Vector2, target: Vector2, l1: float, l2: float, bend: float) -> Array:
	var d := minf(maxf(a.distance_to(target), 0.001), l1 + l2 - 0.01)
	var cosv := clampf((l1 * l1 + d * d - l2 * l2) / (2.0 * l1 * d), -1.0, 1.0)
	var ang := (target - a).angle() - bend * acos(cosv)
	var mid := a + Vector2.from_angle(ang) * l1
	var end := mid + (target - mid).normalized() * l2
	return [mid, end]


# ---------- 绘制 ----------
func _draw() -> void:
	if look.is_empty():
		return
	var k: float = look.get("h", 86.0) / 86.0
	var bulk: float = look.get("bulk", 1.0)
	var sb := sqrt(bulk)
	var lie: float = pose.get("lie", 0.0)
	if lie > 0.0:
		draw_set_transform(Vector2(0, -8 * k * lie), -PI / 2 * lie, Vector2.ONE)
	var cr: float = pose.get("crouch", 0.0)
	var lean: float = pose.get("lean", 0.0) * k
	var walk: float = pose.get("walk", 0.0)
	var lift: float = pose.get("lift", 0.0)
	var hip := Vector2(lean * 0.3, -40 * k + cr * 12 * k)
	var chest := Vector2(lean, -68 * k + cr * 18 * k)
	var stride := sin(walk) * 11 * k
	var foot_f := Vector2(8 * k * sb + stride, -maxf(0.0, cos(walk)) * 6 * k * lift)
	var foot_b := Vector2(-7 * k * sb - stride, -maxf(0.0, -cos(walk)) * 6 * k * lift)
	var leg_f := ik(hip + Vector2(3 * k, 0), foot_f, 21 * k, 21 * k, 1.0)
	var leg_b := ik(hip + Vector2(-3 * k, 0), foot_b, 21 * k, 21 * k, 1.0)
	var sh_f := chest + Vector2(3 * k, 4 * k)
	var sh_b := chest + Vector2(-4 * k, 4 * k)
	var a: float = pose.get("angle", 0.6)
	var dir := Vector2.from_angle(a)
	var arm_f := ik(sh_f, sh_f + dir * 24 * k * sb, 14 * k * sb, 14 * k * sb, -1.0)
	var ba: float = pose.get("back_angle", 1.35 - sin(walk) * 0.5 * lift)
	var arm_b := ik(sh_b, sh_b + Vector2.from_angle(ba) * 22 * k * sb, 14 * k * sb, 14 * k * sb, -1.0)
	var tw := 11 * k * bulk
	var head := chest + Vector2(2 * k, -13 * k)
	var hr := 9 * k * sb
	var is_hero: bool = look.get("rig", "") == "hero"
	var limb_w := 8 * k * bulk * (1.0 if is_hero else 0.55)

	# 后侧肢体（更暗）
	seg([sh_b, arm_b[0], arm_b[1]], 7 * k * (1.0 if is_hero else 0.6), c("limb", 0.7))
	seg([hip + Vector2(-3 * k, 0), leg_b[0], leg_b[1]], limb_w, c("limb", 0.7))
	# 主角的长衣后摆
	if is_hero:
		var sway := sin(t * 0.17) * 3 * k
		poly([hip + Vector2(-tw * 0.9, -5 * k), hip + Vector2(tw * 0.2, -3 * k), hip + Vector2(-3 * k, 26 * k + sway * 0.4), hip + Vector2(-16 * k, 21 * k - sway)], c("body", 0.62))
	seg([hip + Vector2(3 * k, 0), leg_f[0], leg_f[1]], limb_w, c("limb"))
	# 躯干
	poly([hip + Vector2(-tw * 0.85, 3 * k), hip + Vector2(tw * 0.85, 3 * k), chest + Vector2(tw, 0), chest + Vector2(-tw, -k)], c("body"))
	poly([hip + Vector2(k, k), hip + Vector2(tw * 0.75, k), chest + Vector2(tw * 0.85, 1.5 * k), chest + Vector2(2 * k, 1.5 * k)], c("body", 1.22))
	if is_hero:
		seg([chest + Vector2(tw * 0.55, k), hip + Vector2(tw * 0.5, 2 * k)], 1.6 * k, c("trim"))
		seg([hip + Vector2(-tw * 0.9, 0), hip + Vector2(tw * 0.9, 0)], 4 * k, c("belt"))
	# 头
	if ghost.a == 0.0:
		draw_circle(head, hr + 1.3, Color.WHITE if flash else OUT)
	draw_circle(head, hr, c("head"))
	if is_hero:
		var hp := func(x: float, y: float) -> Vector2: return head + Vector2(x * hr, y * hr)
		poly([hp.call(-0.6, 0.55), hp.call(-1.15, 0.25), hp.call(-1.7, -0.05), hp.call(-1.05, -0.45), hp.call(-1.45, -0.95), hp.call(-0.45, -1.05), hp.call(-0.3, -1.55), hp.call(0.35, -1.08), hp.call(1.05, -0.62), hp.call(0.95, -0.12), hp.call(0.55, -0.42), hp.call(0.15, -0.25), hp.call(-0.25, -0.35), hp.call(-0.35, 0.2)], c("hair"))
		var sway2 := sin(t * 0.17) * 3 * k
		seg([hp.call(-0.7, -0.35), head + Vector2(-15 * k - lean * 0.7, k + sway2), head + Vector2(-27 * k - lean, 6 * k - sway2)], 3 * k, c("ribbon"))
	draw_rect(Rect2(head + Vector2(0.42 * hr, -0.18 * hr), Vector2(0.4 * hr, 0.16 * hr)), c("eye"))

	# 前臂 + 武器 + 手
	seg([sh_f, arm_f[0], arm_f[1]], 7 * k * (1.0 if is_hero else 0.6), c("limb"))
	_draw_sword(arm_f[1], dir, k)
	draw_circle(arm_f[1], 3.8 * k + 1.2, Color.WHITE if flash else OUT)
	draw_circle(arm_f[1], 3.8 * k, c("limb"))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _draw_sword(hand: Vector2, dir: Vector2, k: float) -> void:
	var L: float = look.get("blade_len", 64.0) * k
	var bw := 4.6 * k
	var n := Vector2(-dir.y, dir.x)
	var at := func(d: float, o: float = 0.0) -> Vector2: return hand + dir * d + n * o
	var glow_col: Color = Color(look.get("glow", "#00000000"))
	if glow_col.a > 0.0 and not flash and ghost.a == 0.0:
		var gc := glow_col
		gc.a = 0.3
		draw_line(at.call(6.0), at.call(L * 0.97), gc, bw * 3.0, true)
	seg([at.call(-8.0), at.call(2.0)], 3.2 * k, Color("2a1d18") if not flash else Color.WHITE)
	poly([at.call(4.0, -bw / 2), at.call(L * 0.8, -bw * 0.45), at.call(L), at.call(L * 0.8, bw * 0.45), at.call(4.0, bw / 2)], c("blade"))
	seg([at.call(3.0, -7 * k), at.call(3.0, 7 * k)], 3 * k, Color("c9a45c") if not flash else Color.WHITE)
