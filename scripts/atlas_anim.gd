class_name AtlasAnim
extends RefCounted
## 把网页版的图集 JSON（cell/cols/pivot/anims/frames，与 src/sprite.js 同一格式）
## 构建成 Godot 的 SpriteFrames：帧时长取 JSON 的 ms，contact/windup 元数据一并返回。
## 网页版与 Godot 版共用同一份美术与帧数据，不另做一套。

static func build(atlas_path: String, json_path: String) -> Dictionary:
	var tex := load(atlas_path) as Texture2D
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(json_path))
	var cell := int(data.get("cell", 256))
	var cols := int(data.get("cols", 8))
	var frames: Dictionary = data.get("frames", {})
	var anims: Dictionary = data.get("anims", {})
	var sf := SpriteFrames.new()
	sf.remove_animation("default")
	for anim_name in anims:
		var a: Dictionary = anims[anim_name]
		var names: Array = a.get("frames", [])
		if names.is_empty():
			continue
		sf.add_animation(anim_name)
		sf.set_animation_loop(anim_name, bool(a.get("loop", false)))
		var total_ms := 0.0
		for n in names:
			total_ms += float(frames.get(n, {}).get("ms", 100))
		var avg := total_ms / names.size()
		sf.set_animation_speed(anim_name, 1000.0 / avg)
		for n in names:
			var fi := int(frames.get(n, {}).get("i", 0))
			var at := AtlasTexture.new()
			at.atlas = tex
			at.region = Rect2((fi % cols) * cell, (fi / cols) * cell, cell, cell)
			sf.add_frame(anim_name, at, float(frames.get(n, {}).get("ms", 100)) / avg)
	return {"frames": sf, "anims": anims, "pivot": data.get("pivot", [110, 224]), "cell": cell}
