extends Node3D
## Field v5 snow-region code package. No generated stand-in assets are used:
## heightmap, splat map and four PBR texture sets are explicit external dependencies.
## This script builds reproducible 32m terrain tiles from imported source data at runtime.

const MAP_SIZE := 384.0
const TILE_SIZE := 32.0
const TILE_COUNT := 12
const WALKABLE_HALF := 110.0
const HEIGHT_PATH := "res://data/field_v5_height.exr"
const SPLAT_PATH := "res://data/splat_v5.png"
const ENV_PATH := "res://env/afterglow_night.tres"
const TERRAIN_SHADER_PATH := "res://shaders/terrain_v5.gdshader"
const HEIGHT_PIXELS := 1537
const HEIGHT_SCALE := 40.0
const HEIGHT_OFFSET := -4.0
const COLLISION_STEP := 1.0

var height_image: Image
var terrain_shader: Shader
var field_material: ShaderMaterial
var field_environment: Environment
var missing_assets: Array[String] = []

func _ready() -> void:
	_load_assets()
	if missing_assets.is_empty():
		_build_terrain()
		_build_environment()
	else:
		push_warning("Field v5 external asset dependencies missing: %s" % ", ".join(missing_assets))

func _load_assets() -> void:
	if not ResourceLoader.exists(HEIGHT_PATH):
		missing_assets.append(HEIGHT_PATH)
	else:
		height_image = Image.load_from_file(ProjectSettings.globalize_path(HEIGHT_PATH))
		if height_image == null or height_image.get_width() != HEIGHT_PIXELS or height_image.get_height() != HEIGHT_PIXELS:
			missing_assets.append("%s (expected %dx%d EXR)" % [HEIGHT_PATH, HEIGHT_PIXELS, HEIGHT_PIXELS])
	if not ResourceLoader.exists(SPLAT_PATH):
		missing_assets.append(SPLAT_PATH)
	var shader_res := load(TERRAIN_SHADER_PATH) as Shader
	if shader_res == null:
		missing_assets.append(TERRAIN_SHADER_PATH)
	else:
		terrain_shader = shader_res
	if ResourceLoader.exists(ENV_PATH):
		field_environment = load(ENV_PATH) as Environment
	else:
		missing_assets.append(ENV_PATH)

func _build_terrain() -> void:
	field_material = ShaderMaterial.new()
	field_material.shader = terrain_shader
	var splat := load(SPLAT_PATH) as Texture2D
	field_material.set_shader_parameter("splat_map", splat)
	var img := height_image
	for tz in TILE_COUNT:
		for tx in TILE_COUNT:
			var x0 := tx * int(TILE_SIZE / COLLISION_STEP)
			var z0 := tz * int(TILE_SIZE / COLLISION_STEP)
			var tile := _make_tile(x0, z0)
			tile.position = Vector3(-MAP_SIZE * 0.5 + tx * TILE_SIZE, 0.0, -MAP_SIZE * 0.5 + tz * TILE_SIZE)
			add_child(tile)
			var body := StaticBody3D.new()
			body.collision_layer = 1
			body.collision_mask = 0
			var collision := CollisionShape3D.new()
			var height_shape := HeightMapShape3D.new()
			height_shape.map_width = 33
			height_shape.map_depth = 33
			var data := PackedFloat32Array()
			data.resize(33 * 33)
			for z in 33:
				for x in 33:
					var ix := clampi(x0 + x, 0, img.get_width() - 1)
					var iz := clampi(z0 + z, 0, img.get_height() - 1)
					data[z * 33 + x] = img.get_pixel(ix, iz).r * HEIGHT_SCALE + HEIGHT_OFFSET
			height_shape.map_data = data
			collision.shape = height_shape
			collision.position = Vector3(TILE_SIZE * 0.5, 0.0, TILE_SIZE * 0.5)
			body.add_child(collision)
			tile.add_child(body)

func _make_tile(x0: int, z0: int) -> MeshInstance3D:
	var vertices := PackedVector3Array()
	var normals := PackedVector3Array()
	var uvs := PackedVector2Array()
	var indices := PackedInt32Array()
	for z in 33:
		for x in 33:
			var ix := clampi(x0 + x, 0, height_image.get_width() - 1)
			var iz := clampi(z0 + z, 0, height_image.get_height() - 1)
			var h := height_image.get_pixel(ix, iz).r * HEIGHT_SCALE + HEIGHT_OFFSET
			vertices.append(Vector3(x * COLLISION_STEP, h, z * COLLISION_STEP))
			normals.append(_height_normal(ix, iz))
			uvs.append(Vector2(float(ix) / float(HEIGHT_PIXELS - 1), float(iz) / float(HEIGHT_PIXELS - 1)))
	for z in 32:
		for x in 32:
			var i := z * 33 + x
			indices.append_array(PackedInt32Array([i, i + 33, i + 1, i + 1, i + 33, i + 34]))
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var instance := MeshInstance3D.new()
	instance.mesh = mesh
	instance.material_override = field_material
	return instance

func _height_normal(ix: int, iz: int) -> Vector3:
	var l := height_image.get_pixel(maxi(0, ix - 1), iz).r * HEIGHT_SCALE + HEIGHT_OFFSET
	var r := height_image.get_pixel(mini(height_image.get_width() - 1, ix + 1), iz).r * HEIGHT_SCALE + HEIGHT_OFFSET
	var b := height_image.get_pixel(ix, maxi(0, iz - 1)).r * HEIGHT_SCALE + HEIGHT_OFFSET
	var f := height_image.get_pixel(ix, mini(height_image.get_height() - 1, iz + 1)).r * HEIGHT_SCALE + HEIGHT_OFFSET
	return Vector3(l - r, 2.0 * COLLISION_STEP, b - f).normalized()

func _build_environment() -> void:
	var world := WorldEnvironment.new()
	world.environment = field_environment
	add_child(world)

func height_at(world_x: float, world_z: float) -> float:
	if height_image == null:
		return 0.0
	var px := clampf((world_x + MAP_SIZE * 0.5) / MAP_SIZE * (HEIGHT_PIXELS - 1), 0.0, HEIGHT_PIXELS - 1.0)
	var pz := clampf((world_z + MAP_SIZE * 0.5) / MAP_SIZE * (HEIGHT_PIXELS - 1), 0.0, HEIGHT_PIXELS - 1.0)
	return height_image.get_pixel(int(px), int(pz)).r * HEIGHT_SCALE + HEIGHT_OFFSET

func is_walkable(world_x: float, world_z: float) -> bool:
	return absf(world_x) <= WALKABLE_HALF and absf(world_z) <= WALKABLE_HALF
