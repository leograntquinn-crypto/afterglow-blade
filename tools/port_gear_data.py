#!/usr/bin/env python3
"""Export web module truth with Node; convert the web's status design tables.

python3 tools/port_gear_data.py [--source ~/workspace/afterglow-blade] [--check]
--check independently exports again, reconciles all IDs/definitions, and checks bytes.
No source files are modified. Node >= 22 is required for automatic ES module syntax detection.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
NODE = r"""
import {pathToFileURL} from 'node:url';
const root = process.argv[1];
const load = p => import(pathToFileURL(`${root}/src/${p}`).href);
const {CATALOG} = await load('gear/catalog.js');
const rules = await load('gear/rules.js');
const {KINDS} = await load('gear/kinds.js');
const {SERIES} = await load('gear/series.js');
const {STATUS_RATING, SYNERGY_RATING} = await load('gear/rating.js');
const {WTYPES, STAT_INFO, MARKS, SLOT_KEYS, itemBase} = await load('items.js');
const {readFileSync} = await import('node:fs');
const BAG_MAX = +readFileSync(`${root}/src/progression.js`,'utf8').match(/export const BAG_MAX = (\d+);/)[1];
const bases = Object.fromEntries(Object.values(CATALOG).map(d => [d.id,
  [1,10,30].map(ilvl => itemBase({def:d.id, ilvl}))]));

console.log(JSON.stringify({catalog:CATALOG,rules,KINDS,SERIES,statusIds:Object.keys(STATUS_RATING),synergyIds:Object.keys(SYNERGY_RATING),
 WTYPES,STAT_INFO,MARKS,SLOT_KEYS,BAG_MAX,bases}));
"""


def table_rows(section):
    return [[c.strip() for c in line.strip().strip('|').split('|')]
            for line in section.splitlines() if line.startswith('|')
            and not re.match(r'^\|[-: ]+\|', line)]


def status_data(source, truth):
    doc = (source / 'docs/DESIGN_EQUIPMENT.md').read_text()
    section = doc.split('## 三、Buff 系统与相互作用', 1)[1].split('### 3. 怎么进战斗结算', 1)[0]
    statuses = {}
    for row in table_rows(section.split('### 2.', 1)[0]):
        if len(row) == 5 and re.fullmatch(r'`[a-z]+`', row[0]):
            key = row[0].strip('`')
            statuses[key] = dict(id=key, name=row[1], type_or_trigger=row[2], rule=row[3], stacking=row[4],
                                 target='enemy' if len(statuses) < 9 else 'self')
    assert set(statuses) == set(truth['statusIds']) and len(statuses) == 14
    reaction_ids = ['frostfire', 'toxic_blast', 'shatter', 'bloodpoison', 'cauterize', 'clot', 'numb']
    reaction_rows = table_rows(section.split('**反应的定义**：', 1)[1].split('**你自己身上的相互作用**', 1)[0])[1:]
    assert len(reaction_rows) == 7 and set(reaction_ids) <= set(truth['synergyIds'])
    reactions = {key: dict(id=key, name=row[0].replace('**', ''), condition=row[1], effect=row[2])
                 for key, row in zip(reaction_ids, reaction_rows)}
    # Numeric parameters come from the source text, with named meanings attached here.
    # The full text stays alongside these parameters to retain qualifications/exceptions.
    def numbers(text):
        return [float(n) for n in re.findall(r'(?<![A-Za-z])\d+(?:\.\d+)?', text)]

    def params(text, keys):
        values = numbers(text)
        assert len(values) == len(keys), (text, keys, values)
        return dict(zip(keys, values))

    status_keys = {
        'burn': ['tick_seconds', 'attack_percent', 'duration_seconds', 'max_stacks', 'stacks_per_apply'],
        'poison': ['tick_seconds', 'attack_percent', 'duration_seconds', 'healing_reduction_percent', 'max_stacks', 'stacks_per_apply'],
        'bleed': ['tick_seconds', 'attack_percent', 'duration_seconds', 'max_stacks', 'stacks_per_apply'],
        'chill': ['accumulation_min_percent', 'accumulation_max_percent', 'movement_reduction_percent', 'decay_delay_seconds'],
        'freeze': ['normal_seconds', 'elite_seconds', 'damage_taken_percent', 'boss_armor_reduction_percent', 'diminishing_seconds', 'threshold_multiplier'],
        'shock': ['accumulation_min_percent', 'accumulation_max_percent'],
        'paralyze': ['duration_seconds', 'boss_interrupt_value', 'boss_windup_slow_percent'],
        'slow': ['speed_reduction_percent', 'duration_seconds'],
        'brittle': ['damage_taken_percent', 'duration_seconds'],
        'fury': ['attack_percent_per_stack', 'duration_seconds', 'max_stacks', 'stacks_per_apply'],
        'shield': ['recovery_delay_seconds', 'max_hp_percent'],
        'lifesteal': ['heal_per_second_max_hp_percent', 'max_lifesteal_percent'],
        'thorns': ['max_reflection_percent'], 'cleanse': [],
    }
    for key, row in statuses.items():
        row['parameters'] = params(row['rule'] + ' ' + row['stacking'], status_keys[key])
        if key == 'cleanse':
            row['trigger_parameters'] = params(row['type_or_trigger'], ['equipment_interval_seconds'])
        elif key == 'fury':
            row['trigger_parameters'] = params(row['type_or_trigger'], ['combo_hits'])
    reaction_keys = {
        'frostfire': ['remaining_burn_multiplier', 'chill_attack_percent', 'radius', 'splash_percent'],
        'toxic_blast': ['remaining_poison_multiplier', 'radius', 'spread_poison_stacks'],
        'shatter': ['attack_percent', 'brittle_seconds'],
        'bloodpoison': ['bleed_bonus_percent'], 'cauterize': ['bleed_stacks_consumed', 'burn_stacks_added'],
        'clot': [], 'numb': ['chill_accumulation_multiplier'],
    }
    for key, row in reactions.items():
        row['parameters'] = params(row['effect'], reaction_keys[key])
    matrix_rows = table_rows(section.split('### 2.', 1)[1].split('**反应的定义**', 1)[0])
    groups = ['burn', 'poison', 'bleed', 'chill_freeze', 'shock_paralyze', 'slow']
    assert len(matrix_rows) == 7
    names = {v['name']: k for k, v in reactions.items()}
    matrix = {key: {} for key in groups}
    for key, row in zip(groups, matrix_rows[1:]):
        assert len(row) == 7
        for other, cell in zip(groups, row[1:]):
            clean = cell.replace('**', '')
            assert clean in ('叠层', '积累', '取最高', '') or any(n in clean for n in names), clean
            matrix[key][other] = next((v for n, v in names.items() if n in clean),
                                      {'叠层': 'stack', '积累': 'accumulate', '取最高': 'maximum', '': None}.get(clean))
    for a in groups:
        for b in groups:
            if matrix[a][b] is None:
                matrix[a][b] = matrix[b][a]
            assert matrix[a][b] == matrix[b][a], (a, b)
    self_rows = table_rows(section.split('**你自己身上的相互作用**：', 1)[1].split('**防滥用', 1)[0])[1:]
    return dict(schema_version=1, source='docs/DESIGN_EQUIPMENT.md §三 (design; web status engine absent)',
                statuses=statuses, reactions=reactions, interaction_matrix=matrix,
                matrix_groups={'chill_freeze': ['chill', 'freeze'], 'shock_paralyze': ['shock', 'paralyze']},
                self_interactions=[dict(combination=r[0], effect=r[1]) for r in self_rows],
                application_model=doc.split('**积累模型（不掷骰子）**：', 1)[1].split('**敌人抗性', 1)[0].strip(),
                safeguards=[line[2:] for line in section.split('**防滥用（写死）**：')[1].splitlines() if line.startswith('- ')])


def build(source):
    result = subprocess.run(['node', '--input-type=module', '-e', NODE, str(source)],
                            check=False, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError("Node web export failed:\n" + result.stderr)
    truth = json.loads(result.stdout)
    rules = truth['rules']
    catalog = {}
    for key, raw in truth['catalog'].items():
        d = dict(raw)
        cosmetic = d['kind'] in ('wings', 'veil')
        if cosmetic:
            assert d['fixed'] == {'atk': 10} and not d['imbue'] and not d['set'] and not d['effects']
            for field in ('imbue', 'set', 'effects'):
                del d[field]
        d['base'] = d.get('fixed', {})
        d['base_budget'] = {} if cosmetic else rules['BUDGET'][d['slot']]
        d['affix_pool'] = [] if cosmetic else list(rules['AFFIX_MAX'])
        d['affix_share'] = 0 if cosmetic else rules['AFFIX_SHARE'][d['slot']]
        d['base_samples'] = {str(level): base for level, base in zip([1, 10, 30], truth['bases'][key])}
        catalog[key] = d
    ids = sorted(catalog)
    assert len(ids) == 346 and sum(d['rar'] == 4 for d in catalog.values()) == 36
    assert set(ids) == set(truth['catalog'])
    # Guard the imperative web policies before exporting their declarative representation.
    items = (source / 'src/items.js').read_text()
    main = (source / 'src/main.js').read_text()
    for fragment in ["source==='boss' && Math.random() < 0.3", 'save && rar >= 3', 'if (fresh.length) pool = fresh',
                     '(pity[key] || 0)>=DROP_RULES.pityMisses']:
        assert fragment in items, f'Web policy changed: {fragment}'
    for fragment in ['r.w * (1 + L * 0.05 + luck) * (i === 4 ? 1 + L * 0.06 : 1)',
                     'Math.max(1,L+Math.floor(rand(-1,2)))']:
        assert fragment in items, f'Web numeric policy changed: {fragment}'
    for fragment in ['cand.locked || cand.rar >= it.rar', 'cand.rar < this.save.bag[worst].rar',
                     'cand.ilvl < this.save.bag[worst].ilvl', 'else if (it.rar >= 4)']:
        assert fragment in main, f'Web bag policy changed: {fragment}'
    drops = dict(schema_version=1, **rules['DROP_RULES'], rarity_weights=[r['w'] for r in rules['RARITY']],
        rarity_scaling=dict(non_common_level=0.05, legend_extra_level=0.06, common_unscaled=True,
                            formula='i=0: w; i>0: w*(1+L*0.05+luck)*(i=4 ? 1+L*0.06 : 1)',
                            clamp_order=['maxRar masks weights', 'minRar floor', 'maxRar ceiling']),
        legend_sources=dict(boss='matching drop.boss', trial='drop.boss is null', clear='diff >= 1 and drop.boss is null', normal='none',
                            boss_full_pool_chance=0.3, boss_full_pool_respects_cosmetic_unlock=True),
        pity=dict(counter_keys=['boss:{boss}', 'clear:{stage}:{diff}', '{source}'],
                  increment='once per non-legend draw with eligible legends', reset_on_legend=True,
                  force='next eligible draw when misses >= pityMisses'),
        unseen_priority=dict(min_rar=3, history='gearSeen', record='only after bag acquisition',
                             restrict_before_series_and_kind=True, fallback='full eligible pool when all seen'),
        cosmetic_unlock=dict(any_of=['gearCosmeticsUnlocked', 'cleared.s2', 'stage > cosmeticStage',
                                     'source == boss and stage >= cosmeticStage'], persistent=True),
        selection_order=['cosmetic availability', 'legend source and boss mixing', 'rarity and pity', 'unseen priority',
                         'weighted series', 'weighted kind (slot weight divided by kind count)', 'uniform definition'],
        item_level=dict(formula='max(1, L + floor(rand(-1,2)))', offsets=[-1,0,1]),
        bag_full=dict(capacity=truth['BAG_MAX'], candidate='existing bag item', exclude_locked=True,
                      strictly_lower_rarity=True, never_auto_sell_rar=4, sort=['rar ascending','ilvl ascending','bag index ascending'],
                      sell_count=1, if_no_candidate='sell incoming unless legendary', legend_overflow=True),
        sell=dict(cost_tier=rules['COST_TIER'], multipliers=rules['SELL_MULT'],
                  formula='round((5 + ilvl * 3) * multipliers[cost_tier[rar]] * (1 + enh * 0.25))'))
    gear = dict(schema_version=1, items=catalog, kinds=truth['KINDS'], series=truth['SERIES'], rarity=rules['RARITY'],
                weapon_types=truth['WTYPES'], stat_info=truth['STAT_INFO'], marks=truth['MARKS'],
                base_rules=dict(formula='(a + b * ilvl) * rarity.mul; crit skips rarity.mul; weapon atk *= atkMul; katana adds crit',
                                sample_levels=[1,10,30], fixed_ignores_level_rarity_enhancement=True,
                                legacy_base='per-stat maximum after weapon modifiers', enhancement_per=rules['ITEM_RULES']['enhPer']),
                affix_rules=dict(maximum=rules['AFFIX_MAX'], minimum_roll=rules['ITEM_RULES']['affixMin'],
                                 formula='(a + b * ilvl) * uniform(minimum_roll,1) * affix_share * rarity.quality',
                                 distinct=True, count='rarity.affixes', percent_round_decimals=3, flat_round='Math.round',
                                 mark_chance='rarity.mark', imbue_levels='rarity.imbue', fixed_has_no_affixes_or_mark=True))
    assert len(catalog) - sum(d['rar'] == 4 for d in catalog.values()) == 310
    return {'gear_catalog.json': gear, 'statuses.json': status_data(source, truth), 'drop_rules.json': drops}, truth


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path.home() / 'workspace/afterglow-blade')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    outputs, truth = build(args.source.expanduser().resolve())
    for filename, data in outputs.items():
        payload = (json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True, allow_nan=False) + '\n').encode()
        path = ROOT / 'data' / filename
        if args.check:
            assert path.read_bytes() == payload, f'Stale or modified output: {path}'
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(payload)
    actual = json.loads((ROOT / 'data/gear_catalog.json').read_text())['items']
    expected = truth['catalog']
    missing, extra = sorted(set(expected)-set(actual)), sorted(set(actual)-set(expected))
    assert not missing and not extra
    for key, definition in expected.items():
        for field, value in definition.items():
            if definition['kind'] in ('wings','veil') and field in ('imbue','set','effects'):
                assert field not in actual[key]
            else:
                assert actual[key][field] == value, (key, field)
    digest = hashlib.sha256(('\n'.join(sorted(expected))+'\n').encode()).hexdigest()
    print(f'GEAR RECONCILIATION PASS: {len(actual)} IDs = 310 ordinary + 36 legendary; missing={missing}; extra={extra}')
    print(f'ID SHA256 (sorted UTF-8 IDs, newline terminated): {digest}')
    print('STATUS CHECK PASS: 14 statuses + 7 reactions; matrix 6 x 6; 5 self interactions')
    print('CONVERTER CHECK PASS: byte-identical outputs' if args.check else 'CONVERTER WRITE PASS: 3 JSON files')

if __name__ == '__main__':
    main()
