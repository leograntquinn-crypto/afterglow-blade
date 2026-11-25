extends SceneTree
## Field v5 dependency + geometry verifier. Does not manufacture substitute art assets.
## Required command: godot --headless --path . --script res://tools/verify_field_v5.gd
## Prints FIELDV5 PASS only when Muse source assets are present and numeric layout is valid.

const REQUIRED := [
	"res://data/field_v5_height.exr",
	"res://data/splat_v5.png",
	"res://env/afterglow_night.tres",
	"res://art/terrain/field_v5_pbr.tres"
]

func _init() -> void:
	call_deferred("_run")

func _run() -> void:
	var missing: Array[String] = []
	for path in REQUIRED:
		if not ResourceLoader.exists(path):
			missing.append(path)
	var shader_paths := ["res://shaders/terrain_v5.gdshader", "res://shaders/ground_mist.gdshader"]
	for path in shader_paths:
		if not ResourceLoader.exists(path):
			missing.append(path)
	if not missing.is_empty():
		print("FIELDV5 BLOCKED missing_assets=", missing)
		print("FIELDV5 FAIL")
		quit(1)
		return
	var field_script := load("res://scripts/field_v5.gd") as Script
	if field_script == null:
		print("FIELDV5 FAIL field_v5.gd load")
		quit(1)
		return
	var height := Image.load_from_file(ProjectSettings.globalize_path("res://data/field_v5_height.exr"))
	if height == null or height.get_width() != 1537 or height.get_height() != 1537:
		print("FIELDV5 FAIL heightmap must be 1537x1537 EXR")
		quit(1)
		return
	var splat := Image.load_from_file(ProjectSettings.globalize_path("res://data/splat_v5.png"))
	if splat == null or splat.get_width() != 1024 or splat.get_height() != 1024:
		print("FIELDV5 FAIL splat map must be 1024x1024")
		quit(1)
		return
	print("FIELDV5 PASS")
	quit(0)
