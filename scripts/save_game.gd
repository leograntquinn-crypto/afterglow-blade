class_name SaveGame
extends RefCounted
## Local JSON persistence. No scene/autoload dependency; paths are injectable for tests.
## v mirrors the web schema; version is the native file format version.
const VERSION := 1
const SAVE_PATH := "user://afterglow_save.json"
const SLOT_KEYS := ["weapon", "helm", "chest", "legs", "boots", "bracers", "wings", "veil", "trinket1", "trinket2"]
var path: String
var last_backup_path := ""
var last_error: Error = OK

func _init(save_path: String = SAVE_PATH) -> void:
	path = save_path

static func _starter(definition: String) -> Dictionary:
	return {"uid": "starter_" + definition, "def": definition, "ilvl": 1, "enh": 0,
		"affix": [], "mark": null, "imbueLv": 0, "reforged": 0, "locked": false, "skin": null}

static func default_save() -> Dictionary:
	var equip := {}
	for slot in SLOT_KEYS:
		equip[slot] = null
	equip.weapon = _starter("sword_wayfarer_r0")
	equip.chest = _starter("chest_wayfarer_r0")
	return {"version": VERSION, "v": 2, "savedAt": 0,
		"lv": 1, "xp": 0, "gold": 0, "statPts": 0,
		"stats": {"str": 0, "vit": 0, "int": 0, "agi": 0},
		"sp": 0, "skills": {"skill1": 1, "skill2": 0, "skill3": 0, "skill4": 0, "mastery": 0, "focus": 0, "flow": 0},
		"equip": equip, "bag": [], "gearSeen": ["sword_wayfarer_r0", "chest_wayfarer_r0"],
		"cleared": {}, "best": {}, "runs": 0, "legendPity": {},
		"gearCosmeticsUnlocked": false, "stones": 0, "ult": 0}

static func _number(value: Variant) -> bool:
	return (value is int or value is float) and is_finite(float(value)) and value >= 0

static func _item_valid(item: Variant) -> bool:
	if item == null:
		return true
	if not item is Dictionary:
		return false
	for key in ["uid", "def"]:
		if not item.get(key) is String or item[key].is_empty():
			return false
	for key in ["ilvl", "enh", "imbueLv", "reforged"]:
		if not _number(item.get(key)):
			return false
	return item.get("affix") is Array and item.get("locked") is bool

static func _valid(value: Variant) -> bool:
	if not value is Dictionary:
		return false
	if value.get("version", VERSION) != VERSION or value.get("v", 2) != 2:
		return false
	var defaults := default_save()
	for key in defaults:
		if not value.has(key):
			continue
		var base: Variant = defaults[key]
		if base is Dictionary and not value[key] is Dictionary:
			return false
		if base is Array and not value[key] is Array:
			return false
		if base is bool and not value[key] is bool:
			return false
		if (base is int or base is float) and not _number(value[key]):
			return false
	for key in ["stats", "skills", "legendPity"]:
		for n in value.get(key, {}).values():
			if not _number(n):
				return false
	for item in value.get("equip", {}).values():
		if not _item_valid(item):
			return false
	for item in value.get("bag", []):
		if item == null or not _item_valid(item):
			return false
	for id in value.get("gearSeen", []):
		if not id is String:
			return false
	return true

static func _normalize(value: Dictionary) -> Dictionary:
	var result := default_save()
	# Unknown web fields (contracts, trialBest, tutorial flags, etc.) survive round trips.
	for key in value:
		if result.get(key) is Dictionary and value[key] is Dictionary:
			result[key].merge(value[key].duplicate(true), true)
		else:
			result[key] = value[key].duplicate(true) if value[key] is Array else value[key]
	if not value.has("gearSeen"):
		result.gearSeen = []
		for item in result.equip.values() + result.bag:
			if item != null and not result.gearSeen.has(item.def):
				result.gearSeen.append(item.def)
	return result

func _backup_bad_file() -> void:
	last_backup_path = path + ".corrupt-%s-%s.bak" % [str(Time.get_unix_time_from_system()).replace(".", "_"), Time.get_ticks_usec()]
	last_error = DirAccess.copy_absolute(ProjectSettings.globalize_path(path), ProjectSettings.globalize_path(last_backup_path))
	if last_error != OK:
		last_backup_path = ""
		push_warning("SaveGame: could not back up invalid save (error %s); original retained" % last_error)

func load_save() -> Dictionary:
	last_error = OK
	last_backup_path = ""
	if not FileAccess.file_exists(path):
		return default_save()
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		last_error = FileAccess.get_open_error()
		return default_save()
	var contents := file.get_as_text()
	file.close()
	var parser := JSON.new()
	if parser.parse(contents) != OK or not _valid(parser.data):
		_backup_bad_file()
		return default_save()
	return _normalize(parser.data)

func write_save(value: Dictionary, update_timestamp: bool = true) -> Error:
	if not _valid(value):
		last_error = ERR_INVALID_DATA
		return last_error
	var payload := _normalize(value)
	if update_timestamp:
		payload.savedAt = int(Time.get_unix_time_from_system() * 1000)
	var temp_path := path + ".tmp"
	var file := FileAccess.open(temp_path, FileAccess.WRITE)
	if file == null:
		last_error = FileAccess.get_open_error()
		return last_error
	file.store_string(JSON.stringify(payload, "\t", true, true) + "\n")
	file.flush()
	last_error = file.get_error()
	file.close()
	if last_error == OK:
		last_error = DirAccess.rename_absolute(ProjectSettings.globalize_path(temp_path), ProjectSettings.globalize_path(path))
	return last_error
