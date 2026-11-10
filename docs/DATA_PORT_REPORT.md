# C2 data port report

Validated 2026-11-10 against `~/workspace/afterglow-blade`. All deliverables are new files; existing scene scripts are unchanged. No git commands were used.

## Counts and reconciliation

| Output | Entries |
|---|---:|
| `data/gear_catalog.json` → `items` | 346 |
| Ordinary definitions (`rar` 0–3) | 310 |
| Legendary definitions (`rar` 4) | 36 |
| Wings / veil definitions | 30 / 26 |
| `data/statuses.json` → `statuses` / `reactions` | 14 / 7 |
| Interaction matrix / self interactions | 6 × 6 / 5 |
| `data/drop_rules.json` | 1 rule document; 5 rarity weights |

Rarity counts are **83 / 83 / 72 / 72 / 36** for rarities 0–4. Catalog metadata also includes 12 kinds, 7 series, 5 rarity tiers, 10 affix types and 8 marks. Each definition has base-stat samples at item levels 1, 10 and 30 (1,038 samples total).

`tools/port_gear_data.py` invokes Node on the actual ES modules. Importing `gear/catalog.js` executes its generation loops and awaits `gear_variants.json`. It exports `CATALOG`, kind/series tables, rules, item stat metadata, weapon modifiers, marks, and `itemBase()` results. Nothing is inferred from item names. The source is read-only; Python 3 and Node 22+ with ES-module syntax detection are required.

The converter compares the emitted ID set against that fresh Node export, checks every original definition field against source values, and asserts 346 total / 36 legendary / 310 ordinary. The only normalized fields are the empty cosmetic fields described below. `--check` additionally compares all three complete serialized files byte for byte against a fresh export.

**Result: 346 matched IDs, 0 missing, 0 extra, 0 mismatched source definition fields.** Appendix A lists every ID, source rarity and exported rarity individually. Sorted IDs joined with newlines, including a final newline, have SHA-256:

`40f71afc6e6243fce3196a1d6d2d83fdf60b1a354ef1c8c2d40dd3b512f3edd2`

## Field mapping

| Web source | JSON / native field | Mapping |
|---|---|---|
| `CATALOG[id]` | `gear_catalog.items[id]` | Same ID, slot, kind, series, rar, name, art, classReq, pvp, drop and variantOf when present |
| `definition.fixed` | `items[id].fixed`, `.base` | Wings/veil always `{ "atk": 10 }`; independent of level, rarity and enhancement |
| Cosmetic `imbue:null`, `set:null`, `effects:[]` | Fields omitted | Ticket requires field absence; converter first asserts the source values are empty |
| Other `imbue`, `set`, `effects` | Same fields | Preserved, including legendary effect references |
| `BUDGET[slot]` | `items[id].base_budget` | Stat → `[a,b]`: `(a+b*ilvl)*rarity.mul`; crit skips rarity multiplier |
| `WTYPES` / `itemBase` | `weapon_types`, `base_rules`, `base_samples` | Weapon atk multiplier and katana crit preserved; `legacyBase` is a per-stat maximum |
| `AFFIX_MAX`, `AFFIX_SHARE`, `ITEM_RULES`, `RARITY` | `affix_rules`, `affix_pool`, `affix_share`, `rarity` | Distinct affixes; count/quality/mark/imbue tiers from rarity; percent values round to 3 decimals, flat values use JS rounding |
| `KINDS`, `SERIES`, `STAT_INFO`, `MARKS` | `kinds`, `series`, `stat_info`, `marks` | Module values preserved |
| `STATUS_RATING` keys | `statuses` keys | Exact 14-ID set checked against Node export |
| Equipment design §三 status tables | `statuses[id]` | Name, type/trigger, exact rule/stacking text and numeric parameters parsed from those texts; percent values retain percent units |
| Design §三 reactions; `SYNERGY_RATING` IDs | `reactions[id]` | Seven IDs checked against web rating IDs; conditions, full effect text, numeric parameters |
| Design interaction table | `interaction_matrix`, `matrix_groups` | Six source groups; symmetric cells expanded, independent combinations `null`; grouped chill/freeze and shock/paralyze retained |
| Design self interactions / safeguards / application model | `self_interactions`, `safeguards`, `application_model` | Exact text retains qualifications, boss/control exceptions, snapshot timing and proc restrictions |
| `DROP_RULES` / `RARITY[].w` | `drop_rules` top-level values | Weights 58/27/10/4/1, pityMisses 8, series/slot weights and cosmetic gates |
| `randomDrop`, `rollRarity` | `legend_sources`, `pity`, `unseen_priority`, `rarity_scaling`, `selection_order`, `item_level` | Declarative representation of imperative policies, guarded by source-code assertions for critical branches/constants |
| `progression.BAG_MAX`, `main.pickup`, `sellPrice` | `bag_full`, `sell` | Capacity 60; sell one unlocked existing item strictly below incoming rarity, lowest rarity then lowest ilvl, stable bag order for ties |
| `progression.newSave()` | `SaveGame.default_save()` | `v:2`, savedAt, lv, xp, gold, statPts, stats, sp, skills, equip, bag, cleared, best, runs, legendPity |
| Item save instances | `equip` / `bag` | uid, def, ilvl, enh, affix, mark, imbueLv, reforged, locked, skin and optional legacyBase survive JSON round trips |
| Migration history / lazy web fields | `gearSeen`, `gearCosmeticsUnlocked`, `stones` | Defaults supplied; absent gearSeen seeded from held equipment and bag |
| Other web fields | Same keys | Unknown fields such as contracts, trialBest and tutorial flags are preserved |
| Native file format | `version:1` | Separate from web `v:2`; future unsupported versions rejected with backup/default recovery |
| Runtime `Game.ult` (残光) | `ult:0` native extension | Web resets this 0–100 meter on a run; it is not a web save field. Native persistence adds it explicitly for the ticket |

`base` on scaling equipment is empty because its value depends on instance `ilvl`. Use `base_budget` with `base_rules` and `weapon_types`; the samples are reference values, not a level-independent stat replacement. Cosmetics have an empty affix pool/budget and no mark or imbue rolls.

Pity is per eligible draw and per source key. Eight misses force the next eligible draw, not the eighth draw. Boss legendary mixing uses a 30% chance to replace the boss-specific legendary pool with all available legends; it does not imply a 30% legendary drop rate. Availability still respects the cosmetic unlock gate. For rar ≥3, unseen definitions restrict the eligible pool before series/kind selection, falling back only when that pool is exhausted. `gearSeen` records items actually acquired, including items later sold.

When no lower-rarity unlocked bag item can be sold, nonlegend incoming gear is sold. Incoming legends overflow the capacity instead. A legendary bag item cannot be strictly lower than any incoming rarity, so it is never selected for automatic sale. Locked items are also excluded.

## Save module and headless entry

`SaveGame.new()` targets `user://afterglow_save.json`; a different path can be passed to the constructor. Call `load_save()` and `write_save(data)`. Writes return a Godot `Error`, update savedAt in milliseconds in the stored copy, flush a sibling temporary file, then rename it into place. `write_save(data, false)` preserves savedAt for deterministic checks/imports. Inputs are not mutated.

Missing saves return fresh defaults. Invalid JSON, invalid known field/container types, malformed items, and unsupported versions are copied byte for byte to a unique `.corrupt-…bak` path, then return defaults. The original file is retained until a later successful write. `last_backup_path` identifies the backup; `last_error` reports I/O errors. If a backup cannot be written, the original remains and a warning is issued. Invalid writes are rejected before replacing an existing save. Optional missing fields are filled from defaults; web-v2 saves without native version are accepted. No scene/autoload integration is needed.

New defaults include the same common level-1 sword and chest as the web. Their UIDs use deterministic `starter_<definition>` identifiers rather than web clock/random IDs; common starters have no random affixes. Each default dictionary is newly allocated.

Run from the repository root:

```sh
python3 tools/port_gear_data.py
python3 tools/port_gear_data.py --check
# Optional alternate web checkout:
python3 tools/port_gear_data.py --source ~/workspace/afterglow-blade --check
# On an unrestricted local install:
godot --headless --path . -s tools/check_data.gd -- --check-data
# Exact engine invocation used in this sandbox (writable user data):
XDG_DATA_HOME=/tmp/c2-godot-user /home/hatch/workspace/tools/godot/Godot_v4.7.2-stable_linux.x86_64 --headless --path . -s tools/check_data.gd -- --check-data
```

Recorded outputs (exit 0):

```text
GEAR RECONCILIATION PASS: 346 IDs = 310 ordinary + 36 legendary; missing=[]; extra=[]
STATUS CHECK PASS: 14 statuses + 7 reactions; matrix 6 x 6; 5 self interactions
CONVERTER CHECK PASS: byte-identical outputs
IDEMPOTENCE PASS: all 3 files byte-identical after actual converter rerun
DATA CHECK PASS: 346 gear (310 + 36), 56 cosmetics, 14 statuses, 7 reactions
SAVE CHECK PASS: round trip, timestamp, corrupt backup/defaults, web v2, invalid-write protection
```

The idempotence check captured each JSON's bytes, actually reran the converter in write mode, and compared all three outputs to the captured bytes (no git/diff commands). Godot 4.7.2 checks all definitions, cosmetic exclusions, base/affix fields, reference stat samples, numeric status/reaction parameters, matrix symmetry and key drop policies. Save checks cover nested fields, fractional affixes, optional fields, timestamps, missing files, malformed JSON, wrong root/container/item types, future versions, exact backup contents, web-v2 normalization, and invalid-write preservation. They use and clean a unique test directory beneath user://, leaving a real player's default save alone.

## Deviations and unported scope

- The web checkout has **no `src/status.js` or running status engine**. `gear/rating.js` supplies 14 IDs with zero rating placeholders. The authoritative definitions, seven reactions and matrix are in `docs/DESIGN_EQUIPMENT.md` §三. The converter parses those tables rather than inventing runtime exports. The obsolete “12 种” heading is not used as a count; the actual tables contain 14 entries. Status JSON labels its design provenance explicitly.
- Drop policies embedded in web functions are represented as declarative parameters and formulas. Critical code assertions stop conversion if guarded policies change; this is not an executable Godot loot engine. BAG_MAX is read from its exported numeric constant without importing progression's browser-dependent module graph.
- Cosmetic empty fields are omitted to satisfy the ticket; source catalog objects do carry empty null/array placeholders. All 56 cosmetics are checked before normalization.
- `ult` and native `version` are explicit native additions. Web newSave's lazily initialized gear history/cosmetic/stones fields are initialized up front. Deterministic starter UIDs differ from web random UIDs.
- UI, combat/status execution, legendary effect implementations, item generation, loot execution, rendering/assets, enhancement/reforge execution, comparison/rating execution, cloud/localStorage synchronization and account conflict resolution are outside this data-only ticket. Their identifiers/text/parameters are retained where relevant.
- Browser v1 item-name migration is not implemented. Web v2 instances are supported; unsupported v1 saves follow backup/default protection. Existing optional v2 fields are preserved, but their gameplay systems are not implemented here.

## Artifact fingerprints

SHA-256 values below describe this validated snapshot. Reconcile again after updating the web source.

| JSON | SHA-256 |
|---|---|
| `drop_rules.json` | `396ab97422ebb8767b5f32e44adf129d723be6ee06d7d5b118f97a05b42e1614` |
| `gear_catalog.json` | `3cac78fb426d8b273e82661d420f9e2b42467a37a8edae0fb4f0faf9177ffd6d` |
| `statuses.json` | `13dcc17c19f170a912b550b7ab2bcdf4e4586ff91e76941db5599cce7ad35b55` |

| Web source | SHA-256 |
|---|---|
| `src/gear/catalog.js` | `d0911c3e06efabef27fc8a84dd14bd4a7857d7075a5ee9cd88cf20f53eebc4c6` |
| `src/gear/gear_variants.json` | `db46633e695c06dde9b83faa95c45a20021a1371a42181f72c7d7f3c3b421522` |
| `src/gear/kinds.js` | `9daeea326d9ea3b2b8cf8857c8c6f7dbff7a4447124ed698229733f26b74a20a` |
| `src/gear/series.js` | `7d3c61706860c1c43fd83941f8f1705916ada0fe6e3bce357bcd59fdb4578c5e` |
| `src/gear/rules.js` | `e9a774af51f2c81326c58cc6f9d4fd21e464fbd682d932fbcef7ef342365cd8b` |
| `src/gear/rating.js` | `9d5a9dd67bffe93db680711f12e1ce63e4508ce5941e9e0438f436a781caa1bf` |
| `src/items.js` | `2f51ca0013f949723d0e1463dd1bafe5c96f818df595763788a51b2fa47ad043` |
| `src/progression.js` | `0dc21c7579401b87b131e797f2ce49a1413717a3cc5158d430abdd869969b0e4` |
| `src/save.js` | `ba5f389c5c7c8fe61726b192ee21aeba778f6f4e2416893118f098440a835820` |
| `src/gear/migrate.js` | `305e44f4c32f53caba5d7de74c61e7d3d2d6ee82987467afef73ebe52ad1d27f` |
| `src/main.js` | `6ed61b7d8598831a0920b00e6ccc7e7ffabde08f7cd0fbffdf0622b70ae06b7e` |
| `docs/DESIGN_EQUIPMENT.md` | `3ab66fa4ea7b2379d94e30aedb73ac9d6df84a237fedefc750ef0cf324650ce7` |

## Appendix A: all 346 IDs reconciled

Each row compares a fresh Node-exported source definition to the written JSON. All source fields are also checked by the converter, subject only to cosmetic normalization.

| ID | Web rar | JSON rar | Result |
|---|---:|---:|---|
| `amulet_blight_r0` | 0 | 0 | MATCH |
| `amulet_blight_r1` | 1 | 1 | MATCH |
| `amulet_blight_r2` | 2 | 2 | MATCH |
| `amulet_blight_r3` | 3 | 3 | MATCH |
| `amulet_dawn_r0` | 0 | 0 | MATCH |
| `amulet_dawn_r1` | 1 | 1 | MATCH |
| `amulet_dawn_r2` | 2 | 2 | MATCH |
| `amulet_dawn_r3` | 3 | 3 | MATCH |
| `amulet_ember_r0` | 0 | 0 | MATCH |
| `amulet_ember_r1` | 1 | 1 | MATCH |
| `amulet_ember_r2` | 2 | 2 | MATCH |
| `amulet_ember_r3` | 3 | 3 | MATCH |
| `amulet_frost_r0` | 0 | 0 | MATCH |
| `amulet_frost_r1` | 1 | 1 | MATCH |
| `amulet_frost_r2` | 2 | 2 | MATCH |
| `amulet_frost_r3` | 3 | 3 | MATCH |
| `amulet_storm_r0` | 0 | 0 | MATCH |
| `amulet_storm_r1` | 1 | 1 | MATCH |
| `amulet_storm_r2` | 2 | 2 | MATCH |
| `amulet_storm_r3` | 3 | 3 | MATCH |
| `amulet_thorn_r0` | 0 | 0 | MATCH |
| `amulet_thorn_r1` | 1 | 1 | MATCH |
| `amulet_thorn_r2` | 2 | 2 | MATCH |
| `amulet_thorn_r3` | 3 | 3 | MATCH |
| `amulet_wayfarer_r0` | 0 | 0 | MATCH |
| `amulet_wayfarer_r1` | 1 | 1 | MATCH |
| `boots_blight_r0` | 0 | 0 | MATCH |
| `boots_blight_r1` | 1 | 1 | MATCH |
| `boots_blight_r2` | 2 | 2 | MATCH |
| `boots_blight_r3` | 3 | 3 | MATCH |
| `boots_dawn_r0` | 0 | 0 | MATCH |
| `boots_dawn_r1` | 1 | 1 | MATCH |
| `boots_dawn_r2` | 2 | 2 | MATCH |
| `boots_dawn_r3` | 3 | 3 | MATCH |
| `boots_ember_r0` | 0 | 0 | MATCH |
| `boots_ember_r1` | 1 | 1 | MATCH |
| `boots_ember_r2` | 2 | 2 | MATCH |
| `boots_ember_r3` | 3 | 3 | MATCH |
| `boots_frost_r0` | 0 | 0 | MATCH |
| `boots_frost_r1` | 1 | 1 | MATCH |
| `boots_frost_r2` | 2 | 2 | MATCH |
| `boots_frost_r3` | 3 | 3 | MATCH |
| `boots_storm_r0` | 0 | 0 | MATCH |
| `boots_storm_r1` | 1 | 1 | MATCH |
| `boots_storm_r2` | 2 | 2 | MATCH |
| `boots_storm_r3` | 3 | 3 | MATCH |
| `boots_thorn_r0` | 0 | 0 | MATCH |
| `boots_thorn_r1` | 1 | 1 | MATCH |
| `boots_thorn_r2` | 2 | 2 | MATCH |
| `boots_thorn_r3` | 3 | 3 | MATCH |
| `boots_wayfarer_r0` | 0 | 0 | MATCH |
| `boots_wayfarer_r1` | 1 | 1 | MATCH |
| `bracers_blight_r0` | 0 | 0 | MATCH |
| `bracers_blight_r1` | 1 | 1 | MATCH |
| `bracers_blight_r2` | 2 | 2 | MATCH |
| `bracers_blight_r3` | 3 | 3 | MATCH |
| `bracers_dawn_r0` | 0 | 0 | MATCH |
| `bracers_dawn_r1` | 1 | 1 | MATCH |
| `bracers_dawn_r2` | 2 | 2 | MATCH |
| `bracers_dawn_r3` | 3 | 3 | MATCH |
| `bracers_ember_r0` | 0 | 0 | MATCH |
| `bracers_ember_r1` | 1 | 1 | MATCH |
| `bracers_ember_r2` | 2 | 2 | MATCH |
| `bracers_ember_r3` | 3 | 3 | MATCH |
| `bracers_frost_r0` | 0 | 0 | MATCH |
| `bracers_frost_r1` | 1 | 1 | MATCH |
| `bracers_frost_r2` | 2 | 2 | MATCH |
| `bracers_frost_r3` | 3 | 3 | MATCH |
| `bracers_storm_r0` | 0 | 0 | MATCH |
| `bracers_storm_r1` | 1 | 1 | MATCH |
| `bracers_storm_r2` | 2 | 2 | MATCH |
| `bracers_storm_r3` | 3 | 3 | MATCH |
| `bracers_thorn_r0` | 0 | 0 | MATCH |
| `bracers_thorn_r1` | 1 | 1 | MATCH |
| `bracers_thorn_r2` | 2 | 2 | MATCH |
| `bracers_thorn_r3` | 3 | 3 | MATCH |
| `bracers_wayfarer_r0` | 0 | 0 | MATCH |
| `bracers_wayfarer_r1` | 1 | 1 | MATCH |
| `chest_blight_r0` | 0 | 0 | MATCH |
| `chest_blight_r1` | 1 | 1 | MATCH |
| `chest_blight_r2` | 2 | 2 | MATCH |
| `chest_blight_r3` | 3 | 3 | MATCH |
| `chest_dawn_r0` | 0 | 0 | MATCH |
| `chest_dawn_r1` | 1 | 1 | MATCH |
| `chest_dawn_r2` | 2 | 2 | MATCH |
| `chest_dawn_r3` | 3 | 3 | MATCH |
| `chest_ember_r0` | 0 | 0 | MATCH |
| `chest_ember_r1` | 1 | 1 | MATCH |
| `chest_ember_r2` | 2 | 2 | MATCH |
| `chest_ember_r3` | 3 | 3 | MATCH |
| `chest_frost_r0` | 0 | 0 | MATCH |
| `chest_frost_r1` | 1 | 1 | MATCH |
| `chest_frost_r2` | 2 | 2 | MATCH |
| `chest_frost_r3` | 3 | 3 | MATCH |
| `chest_storm_r0` | 0 | 0 | MATCH |
| `chest_storm_r1` | 1 | 1 | MATCH |
| `chest_storm_r2` | 2 | 2 | MATCH |
| `chest_storm_r3` | 3 | 3 | MATCH |
| `chest_thorn_r0` | 0 | 0 | MATCH |
| `chest_thorn_r1` | 1 | 1 | MATCH |
| `chest_thorn_r2` | 2 | 2 | MATCH |
| `chest_thorn_r3` | 3 | 3 | MATCH |
| `chest_wayfarer_r0` | 0 | 0 | MATCH |
| `chest_wayfarer_r1` | 1 | 1 | MATCH |
| `great_blight_r0` | 0 | 0 | MATCH |
| `great_blight_r1` | 1 | 1 | MATCH |
| `great_blight_r2` | 2 | 2 | MATCH |
| `great_blight_r3` | 3 | 3 | MATCH |
| `great_dawn_r0` | 0 | 0 | MATCH |
| `great_dawn_r1` | 1 | 1 | MATCH |
| `great_dawn_r2` | 2 | 2 | MATCH |
| `great_dawn_r3` | 3 | 3 | MATCH |
| `great_ember_r0` | 0 | 0 | MATCH |
| `great_ember_r1` | 1 | 1 | MATCH |
| `great_ember_r2` | 2 | 2 | MATCH |
| `great_ember_r3` | 3 | 3 | MATCH |
| `great_frost_r0` | 0 | 0 | MATCH |
| `great_frost_r1` | 1 | 1 | MATCH |
| `great_frost_r2` | 2 | 2 | MATCH |
| `great_frost_r3` | 3 | 3 | MATCH |
| `great_storm_r0` | 0 | 0 | MATCH |
| `great_storm_r1` | 1 | 1 | MATCH |
| `great_storm_r2` | 2 | 2 | MATCH |
| `great_storm_r3` | 3 | 3 | MATCH |
| `great_thorn_r0` | 0 | 0 | MATCH |
| `great_thorn_r1` | 1 | 1 | MATCH |
| `great_thorn_r2` | 2 | 2 | MATCH |
| `great_thorn_r3` | 3 | 3 | MATCH |
| `great_wayfarer_r0` | 0 | 0 | MATCH |
| `great_wayfarer_r1` | 1 | 1 | MATCH |
| `helm_blight_r0` | 0 | 0 | MATCH |
| `helm_blight_r1` | 1 | 1 | MATCH |
| `helm_blight_r2` | 2 | 2 | MATCH |
| `helm_blight_r3` | 3 | 3 | MATCH |
| `helm_dawn_r0` | 0 | 0 | MATCH |
| `helm_dawn_r1` | 1 | 1 | MATCH |
| `helm_dawn_r2` | 2 | 2 | MATCH |
| `helm_dawn_r3` | 3 | 3 | MATCH |
| `helm_ember_r0` | 0 | 0 | MATCH |
| `helm_ember_r1` | 1 | 1 | MATCH |
| `helm_ember_r2` | 2 | 2 | MATCH |
| `helm_ember_r3` | 3 | 3 | MATCH |
| `helm_frost_r0` | 0 | 0 | MATCH |
| `helm_frost_r1` | 1 | 1 | MATCH |
| `helm_frost_r2` | 2 | 2 | MATCH |
| `helm_frost_r3` | 3 | 3 | MATCH |
| `helm_storm_r0` | 0 | 0 | MATCH |
| `helm_storm_r1` | 1 | 1 | MATCH |
| `helm_storm_r2` | 2 | 2 | MATCH |
| `helm_storm_r3` | 3 | 3 | MATCH |
| `helm_thorn_r0` | 0 | 0 | MATCH |
| `helm_thorn_r1` | 1 | 1 | MATCH |
| `helm_thorn_r2` | 2 | 2 | MATCH |
| `helm_thorn_r3` | 3 | 3 | MATCH |
| `helm_wayfarer_r0` | 0 | 0 | MATCH |
| `helm_wayfarer_r1` | 1 | 1 | MATCH |
| `katana_blight_r0` | 0 | 0 | MATCH |
| `katana_blight_r1` | 1 | 1 | MATCH |
| `katana_blight_r2` | 2 | 2 | MATCH |
| `katana_blight_r3` | 3 | 3 | MATCH |
| `katana_dawn_r0` | 0 | 0 | MATCH |
| `katana_dawn_r1` | 1 | 1 | MATCH |
| `katana_dawn_r2` | 2 | 2 | MATCH |
| `katana_dawn_r3` | 3 | 3 | MATCH |
| `katana_ember_r0` | 0 | 0 | MATCH |
| `katana_ember_r1` | 1 | 1 | MATCH |
| `katana_ember_r2` | 2 | 2 | MATCH |
| `katana_ember_r3` | 3 | 3 | MATCH |
| `katana_frost_r0` | 0 | 0 | MATCH |
| `katana_frost_r1` | 1 | 1 | MATCH |
| `katana_frost_r2` | 2 | 2 | MATCH |
| `katana_frost_r3` | 3 | 3 | MATCH |
| `katana_storm_r0` | 0 | 0 | MATCH |
| `katana_storm_r1` | 1 | 1 | MATCH |
| `katana_storm_r2` | 2 | 2 | MATCH |
| `katana_storm_r3` | 3 | 3 | MATCH |
| `katana_thorn_r0` | 0 | 0 | MATCH |
| `katana_thorn_r1` | 1 | 1 | MATCH |
| `katana_thorn_r2` | 2 | 2 | MATCH |
| `katana_thorn_r3` | 3 | 3 | MATCH |
| `katana_wayfarer_r0` | 0 | 0 | MATCH |
| `katana_wayfarer_r1` | 1 | 1 | MATCH |
| `legs_blight_r0` | 0 | 0 | MATCH |
| `legs_blight_r1` | 1 | 1 | MATCH |
| `legs_blight_r2` | 2 | 2 | MATCH |
| `legs_blight_r3` | 3 | 3 | MATCH |
| `legs_dawn_r0` | 0 | 0 | MATCH |
| `legs_dawn_r1` | 1 | 1 | MATCH |
| `legs_dawn_r2` | 2 | 2 | MATCH |
| `legs_dawn_r3` | 3 | 3 | MATCH |
| `legs_ember_r0` | 0 | 0 | MATCH |
| `legs_ember_r1` | 1 | 1 | MATCH |
| `legs_ember_r2` | 2 | 2 | MATCH |
| `legs_ember_r3` | 3 | 3 | MATCH |
| `legs_frost_r0` | 0 | 0 | MATCH |
| `legs_frost_r1` | 1 | 1 | MATCH |
| `legs_frost_r2` | 2 | 2 | MATCH |
| `legs_frost_r3` | 3 | 3 | MATCH |
| `legs_storm_r0` | 0 | 0 | MATCH |
| `legs_storm_r1` | 1 | 1 | MATCH |
| `legs_storm_r2` | 2 | 2 | MATCH |
| `legs_storm_r3` | 3 | 3 | MATCH |
| `legs_thorn_r0` | 0 | 0 | MATCH |
| `legs_thorn_r1` | 1 | 1 | MATCH |
| `legs_thorn_r2` | 2 | 2 | MATCH |
| `legs_thorn_r3` | 3 | 3 | MATCH |
| `legs_wayfarer_r0` | 0 | 0 | MATCH |
| `legs_wayfarer_r1` | 1 | 1 | MATCH |
| `lg_afterimage_boots` | 4 | 4 | MATCH |
| `lg_afterimage_chest` | 4 | 4 | MATCH |
| `lg_afterimage_ring` | 4 | 4 | MATCH |
| `lg_afterimage_sword` | 4 | 4 | MATCH |
| `lg_binglingyu` | 4 | 4 | MATCH |
| `lg_boneking_chest` | 4 | 4 | MATCH |
| `lg_boneking_great` | 4 | 4 | MATCH |
| `lg_boneking_helm` | 4 | 4 | MATCH |
| `lg_boneking_ring` | 4 | 4 | MATCH |
| `lg_bumianzhezhiguan` | 4 | 4 | MATCH |
| `lg_canguangzhanyi` | 4 | 4 | MATCH |
| `lg_chenxiyu` | 4 | 4 | MATCH |
| `lg_duanyue` | 4 | 4 | MATCH |
| `lg_gravekeeper_amulet` | 4 | 4 | MATCH |
| `lg_gravekeeper_helm` | 4 | 4 | MATCH |
| `lg_gravekeeper_legs` | 4 | 4 | MATCH |
| `lg_gravekeeper_sword` | 4 | 4 | MATCH |
| `lg_ironjaw_bracers` | 4 | 4 | MATCH |
| `lg_ironjaw_chest` | 4 | 4 | MATCH |
| `lg_ironjaw_great` | 4 | 4 | MATCH |
| `lg_ironjaw_legs` | 4 | 4 | MATCH |
| `lg_jinhuoyi` | 4 | 4 | MATCH |
| `lg_jinmietouguan` | 4 | 4 | MATCH |
| `lg_leitingyi` | 4 | 4 | MATCH |
| `lg_limingmu` | 4 | 4 | MATCH |
| `lg_raven_amulet` | 4 | 4 | MATCH |
| `lg_raven_boots` | 4 | 4 | MATCH |
| `lg_raven_helm` | 4 | 4 | MATCH |
| `lg_raven_katana` | 4 | 4 | MATCH |
| `lg_shizhihuan` | 4 | 4 | MATCH |
| `lg_shuangjin` | 4 | 4 | MATCH |
| `lg_wugui` | 4 | 4 | MATCH |
| `lg_yongyemu` | 4 | 4 | MATCH |
| `lg_yongyezhishi` | 4 | 4 | MATCH |
| `lg_yuanhailinjia` | 4 | 4 | MATCH |
| `lg_zhulongzhiya` | 4 | 4 | MATCH |
| `ring_blight_r0` | 0 | 0 | MATCH |
| `ring_blight_r1` | 1 | 1 | MATCH |
| `ring_blight_r2` | 2 | 2 | MATCH |
| `ring_blight_r3` | 3 | 3 | MATCH |
| `ring_dawn_r0` | 0 | 0 | MATCH |
| `ring_dawn_r1` | 1 | 1 | MATCH |
| `ring_dawn_r2` | 2 | 2 | MATCH |
| `ring_dawn_r3` | 3 | 3 | MATCH |
| `ring_ember_r0` | 0 | 0 | MATCH |
| `ring_ember_r1` | 1 | 1 | MATCH |
| `ring_ember_r2` | 2 | 2 | MATCH |
| `ring_ember_r3` | 3 | 3 | MATCH |
| `ring_frost_r0` | 0 | 0 | MATCH |
| `ring_frost_r1` | 1 | 1 | MATCH |
| `ring_frost_r2` | 2 | 2 | MATCH |
| `ring_frost_r3` | 3 | 3 | MATCH |
| `ring_storm_r0` | 0 | 0 | MATCH |
| `ring_storm_r1` | 1 | 1 | MATCH |
| `ring_storm_r2` | 2 | 2 | MATCH |
| `ring_storm_r3` | 3 | 3 | MATCH |
| `ring_thorn_r0` | 0 | 0 | MATCH |
| `ring_thorn_r1` | 1 | 1 | MATCH |
| `ring_thorn_r2` | 2 | 2 | MATCH |
| `ring_thorn_r3` | 3 | 3 | MATCH |
| `ring_wayfarer_r0` | 0 | 0 | MATCH |
| `ring_wayfarer_r1` | 1 | 1 | MATCH |
| `sword_blight_r0` | 0 | 0 | MATCH |
| `sword_blight_r1` | 1 | 1 | MATCH |
| `sword_blight_r2` | 2 | 2 | MATCH |
| `sword_blight_r3` | 3 | 3 | MATCH |
| `sword_dawn_r0` | 0 | 0 | MATCH |
| `sword_dawn_r1` | 1 | 1 | MATCH |
| `sword_dawn_r2` | 2 | 2 | MATCH |
| `sword_dawn_r3` | 3 | 3 | MATCH |
| `sword_ember_r0` | 0 | 0 | MATCH |
| `sword_ember_r1` | 1 | 1 | MATCH |
| `sword_ember_r2` | 2 | 2 | MATCH |
| `sword_ember_r3` | 3 | 3 | MATCH |
| `sword_frost_r0` | 0 | 0 | MATCH |
| `sword_frost_r1` | 1 | 1 | MATCH |
| `sword_frost_r2` | 2 | 2 | MATCH |
| `sword_frost_r3` | 3 | 3 | MATCH |
| `sword_storm_r0` | 0 | 0 | MATCH |
| `sword_storm_r1` | 1 | 1 | MATCH |
| `sword_storm_r2` | 2 | 2 | MATCH |
| `sword_storm_r3` | 3 | 3 | MATCH |
| `sword_thorn_r0` | 0 | 0 | MATCH |
| `sword_thorn_r1` | 1 | 1 | MATCH |
| `sword_thorn_r2` | 2 | 2 | MATCH |
| `sword_thorn_r3` | 3 | 3 | MATCH |
| `sword_wayfarer_r0` | 0 | 0 | MATCH |
| `sword_wayfarer_r1` | 1 | 1 | MATCH |
| `veil_blight_r0` | 0 | 0 | MATCH |
| `veil_blight_r1` | 1 | 1 | MATCH |
| `veil_blight_r2` | 2 | 2 | MATCH |
| `veil_blight_r3` | 3 | 3 | MATCH |
| `veil_dawn_r0` | 0 | 0 | MATCH |
| `veil_dawn_r1` | 1 | 1 | MATCH |
| `veil_dawn_r2` | 2 | 2 | MATCH |
| `veil_dawn_r3` | 3 | 3 | MATCH |
| `veil_ember_r0` | 0 | 0 | MATCH |
| `veil_ember_r1` | 1 | 1 | MATCH |
| `veil_ember_r2` | 2 | 2 | MATCH |
| `veil_ember_r3` | 3 | 3 | MATCH |
| `veil_frost_r0` | 0 | 0 | MATCH |
| `veil_frost_r1` | 1 | 1 | MATCH |
| `veil_frost_r2` | 2 | 2 | MATCH |
| `veil_frost_r3` | 3 | 3 | MATCH |
| `veil_storm_r0` | 0 | 0 | MATCH |
| `veil_storm_r1` | 1 | 1 | MATCH |
| `veil_storm_r2` | 2 | 2 | MATCH |
| `veil_storm_r3` | 3 | 3 | MATCH |
| `veil_thorn_r0` | 0 | 0 | MATCH |
| `veil_thorn_r1` | 1 | 1 | MATCH |
| `veil_thorn_r2` | 2 | 2 | MATCH |
| `veil_thorn_r3` | 3 | 3 | MATCH |
| `wings_blight_r0` | 0 | 0 | MATCH |
| `wings_blight_r1` | 1 | 1 | MATCH |
| `wings_blight_r2` | 2 | 2 | MATCH |
| `wings_blight_r3` | 3 | 3 | MATCH |
| `wings_dawn_r0` | 0 | 0 | MATCH |
| `wings_dawn_r1` | 1 | 1 | MATCH |
| `wings_dawn_r2` | 2 | 2 | MATCH |
| `wings_dawn_r3` | 3 | 3 | MATCH |
| `wings_ember_r0` | 0 | 0 | MATCH |
| `wings_ember_r1` | 1 | 1 | MATCH |
| `wings_ember_r2` | 2 | 2 | MATCH |
| `wings_ember_r3` | 3 | 3 | MATCH |
| `wings_frost_r0` | 0 | 0 | MATCH |
| `wings_frost_r1` | 1 | 1 | MATCH |
| `wings_frost_r2` | 2 | 2 | MATCH |
| `wings_frost_r3` | 3 | 3 | MATCH |
| `wings_storm_r0` | 0 | 0 | MATCH |
| `wings_storm_r1` | 1 | 1 | MATCH |
| `wings_storm_r2` | 2 | 2 | MATCH |
| `wings_storm_r3` | 3 | 3 | MATCH |
| `wings_thorn_r0` | 0 | 0 | MATCH |
| `wings_thorn_r1` | 1 | 1 | MATCH |
| `wings_thorn_r2` | 2 | 2 | MATCH |
| `wings_thorn_r3` | 3 | 3 | MATCH |
| `wings_wayfarer_r0` | 0 | 0 | MATCH |
| `wings_wayfarer_r1` | 1 | 1 | MATCH |
