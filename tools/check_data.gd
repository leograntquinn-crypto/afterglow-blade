extends SceneTree
## godot --headless --path . -s tools/check_data.gd -- --check-data
const SaveModule = preload("res://scripts/save_game.gd")
var failures := 0

func require(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func equal_json(a: Variant, b: Variant) -> bool:
	if a is Dictionary and b is Dictionary:
		if a.size() != b.size():
			return false
		for key in a:
			if not b.has(key) or not equal_json(a[key], b[key]):
				return false
		return true
	if a is Array and b is Array:
		if a.size() != b.size():
			return false
		for i in a.size():
			if not equal_json(a[i], b[i]):
				return false
		return true
	return a == b

func read_json(path: String) -> Dictionary:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		require(false, "Cannot open " + path)
		return {}
	var parser := JSON.new()
	var error := parser.parse(file.get_as_text())
	require(error == OK and parser.data is Dictionary, "Invalid JSON: " + path)
	return parser.data if error == OK and parser.data is Dictionary else {}

func _initialize() -> void:
	if not OS.get_cmdline_user_args().has("--check-data"):
		push_error("Expected -- --check-data")
		quit(2)
		return
	check_data()
	check_save()
	quit(0 if failures == 0 else 1)

func check_data() -> void:
	var before := failures
	var gear := read_json("res://data/gear_catalog.json")
	var status := read_json("res://data/statuses.json")
	var drop := read_json("res://data/drop_rules.json")
	if gear.is_empty() or status.is_empty() or drop.is_empty():
		return
	require(gear.items.size() == 346, "346 gear definitions required")
	var legends := 0
	var cosmetics := 0
	for id in gear.items:
		var d: Dictionary = gear.items[id]
		require(d.id == id and gear.kinds.has(d.kind) and gear.series.has(d.series), "Invalid definition: " + id)
		for field in ["slot", "rar", "name", "base", "base_budget", "affix_pool", "drop", "base_samples"]:
			require(d.has(field), "Missing " + field + ": " + id)
		if d.rar == 4:
			legends += 1
		if d.kind in ["wings", "veil"]:
			cosmetics += 1
			require(equal_json(d.fixed, {"atk": 10}) and equal_json(d.base, {"atk": 10}), "Cosmetic fixed atk: " + id)
			require(not d.has("imbue") and not d.has("set") and not d.has("effects"), "Cosmetic prohibited fields: " + id)
			require(d.affix_pool.is_empty() and d.base_budget.is_empty(), "Cosmetic affix/budget: " + id)
		else:
			require(d.affix_pool.size() == 10 and not d.base_budget.is_empty(), "Equipment budget/affixes: " + id)
	require(legends == 36 and gear.items.size() - legends == 310, "Rarity counts")
	require(status.statuses.size() == 14 and status.reactions.size() == 7, "Status/reaction counts")
	require(status.interaction_matrix.size() == 6 and status.self_interactions.size() == 5, "Interaction counts")
	for a in status.interaction_matrix:
		require(status.interaction_matrix[a].size() == 6, "Matrix row width")
		for b in status.interaction_matrix[a]:
			require(status.interaction_matrix[a][b] == status.interaction_matrix[b][a], "Matrix symmetry")
	require(status.statuses.burn.parameters.tick_seconds == 0.5 and status.statuses.burn.parameters.attack_percent == 2, "Burn parameters")
	require(status.reactions.shatter.parameters.attack_percent == 60 and status.reactions.shatter.parameters.brittle_seconds == 4, "Shatter parameters")
	require(status.statuses.cleanse.trigger_parameters.equipment_interval_seconds == 12, "Cleanse trigger")
	require(is_equal_approx(gear.items.sword_wayfarer_r0.base_samples["1"].atk, 11.2), "Sword base sample")
	require(gear.items.katana_wayfarer_r0.base_samples["1"].crit == 0.04, "Katana fixed crit")
	require(status.interaction_matrix.burn.chill_freeze == "frostfire", "Melt reaction")
	require(equal_json(drop.rarity_weights, [58,27,10,4,1]) and drop.pityMisses == 8, "Rarity/pity rules")
	require(drop.legend_sources.boss_full_pool_chance == 0.3 and drop.unseen_priority.min_rar == 3, "Legend/unseen rules")
	require(drop.bag_full.capacity == 60 and drop.bag_full.strictly_lower_rarity and drop.bag_full.exclude_locked, "Bag sale rules")
	require(drop.bag_full.never_auto_sell_rar == 4 and drop.bag_full.legend_overflow, "Legend protection")
	if failures == before:
		print("DATA CHECK PASS: 346 gear (310 + 36), %s cosmetics, 14 statuses, 7 reactions" % cosmetics)

func check_save() -> void:
	var before := failures
	# Separate unique directory; never touch an actual player's default save.
	var directory := "user://c2-save-check-%s" % Time.get_ticks_usec()
	require(DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(directory)) == OK, "Test directory")
	var store = SaveModule.new(directory + "/save.json")
	var value: Dictionary = SaveModule.default_save()
	require(equal_json(store.load_save(), value), "Missing file defaults")
	value.lv = 17
	value.xp = 123
	value.gold = 9876
	value.ult = 73
	value.stones = 4
	value.stats.str = 9
	value.skills.skill2 = 3
	value.savedAt = 123456789
	value.bag.append(value.equip.weapon.duplicate(true))
	value.bag[0].uid = "bag_test"
	value.bag[0].affix = [{"k": "crit", "v": 0.034}]
	value.bag[0].locked = true
	value.legendPity = {"boss:boneLord": 8}
	value.cleared = {"s2": true}
	value.best = {"s2": {"score": 100, "letter": "S"}}
	value.gearSeen.append("lg_duanyue")
	value.contracts = {"day": "2026-11-10", "list": [], "rerolls": 1}
	require(store.write_save(value, false) == OK, "Write save")
	require(equal_json(store.load_save(), value), "Full-field round trip")
	require(store.write_save(value) == OK and store.load_save().savedAt > value.savedAt, "Timestamp milliseconds")
	for broken in ["{broken JSON", "[]", '{"bag":42}', '{"equip":{"weapon":7}}', '{"version":999}']:
		var file := FileAccess.open(store.path, FileAccess.WRITE)
		if file == null:
			require(false, "Cannot create corrupt fixture")
			return
		file.store_string(broken)
		file.close()
		require(equal_json(store.load_save(), SaveModule.default_save()), "Invalid save falls back")
		require(not store.last_backup_path.is_empty(), "Invalid save backup exists")
		require(FileAccess.get_file_as_string(store.last_backup_path) == broken, "Backup preserves exact bytes")
	var old_web := value.duplicate(true)
	old_web.erase("version")
	old_web.erase("gearSeen")
	require(store.write_save(old_web, false) == OK, "Web v2 save accepted")
	var migrated: Dictionary = store.load_save()
	require(migrated.version == 1 and migrated.gearSeen == ["sword_wayfarer_r0", "chest_wayfarer_r0"], "Seed seen from held gear")
	require(store.write_save({"bag": 42}) == ERR_INVALID_DATA, "Reject invalid writes")
	require(equal_json(store.load_save(), migrated), "Rejected write preserves prior save")
	for filename in DirAccess.get_files_at(directory):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(directory.path_join(filename)))
	DirAccess.remove_absolute(ProjectSettings.globalize_path(directory))
	if failures == before:
		print("SAVE CHECK PASS: round trip, timestamp, corrupt backup/defaults, web v2, invalid-write protection")
