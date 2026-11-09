#!/usr/bin/env python3
"""校验 E1 清单后，在临时目录完整生成图集；校验失败不触碰已有产物。"""
import argparse
import json
import math
import re
import shutil
import tempfile
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
KINDS = {k: ('weapon' if k in ('sword', 'katana', 'great') else 'trinket' if k in ('ring', 'amulet') else k)
         for k in ('sword', 'katana', 'great', 'helm', 'chest', 'legs', 'boots', 'bracers', 'ring', 'amulet', 'wings', 'veil')}
SERIES = ('wayfarer', 'frost', 'ember', 'storm', 'blight', 'thorn', 'dawn')
CELL = 128
COLUMNS = 16


def require(ok, message):
    if not ok:
        raise ValueError(message)


def picture(path):
    with Image.open(path) as image:
        require(image.size == (256, 256), f'{path}: 必须为256×256')
        require('A' in image.getbands(), f'{path}: 缺少alpha通道')
        result = image.convert('RGBA')
        require(result.getchannel('A').getextrema()[0] == 0, f'{path}: 缺少透明像素')
        return result.copy()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--icons', nargs='+', type=Path, required=True)
    parser.add_argument('--legend', type=Path, help='传说素材目录（gear.json 与 icons/）')
    args = parser.parse_args()
    rows, frames = {}, {}
    for directory in args.icons:
        pack = json.loads((directory / 'gear.json').read_text())
        require(pack.get('schema') == 'afterglow.gearpack.v1' and isinstance(pack.get('items'), list), f'{directory}: 无效schema/items')
        for row in pack['items']:
            require(isinstance(row, dict), f'{directory}: 清单条目必须是对象')
            require(all(k in row for k in ('id', 'slot', 'kind', 'series', 'rar', 'name', 'icon', 'portrait', 'battle')), f'{directory}: 缺少接口字段')
            ident = row['id']
            require(isinstance(ident, str) and re.fullmatch('[a-z0-9_]+', ident), f'无效id: {ident}')
            require(ident not in rows, f'重复id: {ident}')
            require(row['kind'] in KINDS and row['slot'] == KINDS[row['kind']], f'{ident}: kind/slot不匹配')
            require(row['series'] in SERIES and type(row['rar']) is int and 0 <= row['rar'] <= 4, f'{ident}: series/rar无效')
            require(isinstance(row['name'], str) and row['name'].strip(), f'{ident}: 缺少名字')
            require(set(row) <= {'id', 'slot', 'kind', 'series', 'rar', 'name', 'lore', 'icon', 'portrait', 'battle', 'variantOf'}, f'{ident}: 出现接口以外字段（素材包不能写数值/效果/套装）')
            require('lore' not in row or isinstance(row['lore'], str), f'{ident}: lore必须是文字')
            base = f"{row['kind']}_{row['series']}_r{row['rar']}"
            if 'variantOf' in row:
                require(row['variantOf'] == base and re.fullmatch(re.escape(base) + r'_v([2-9]|[1-9][0-9]+)', ident), f'{ident}: 变体命名/指向无效')
            else:
                if ident.startswith(('lg_', 'set_')):
                    require(row['rar'] == 4, f'{ident}: 传说/定制套装件必须为传说档')
                else:
                    require(row['rar'] < (2 if row['series'] == 'wayfarer' else 4) and not (row['series'] == 'wayfarer' and row['kind'] in ('wings', 'veil')), f'{ident}: 无效保底格子')
                require(ident == base or re.fullmatch(r'set_[a-z0-9_]+_' + row['kind'], ident) or re.fullmatch(r'lg_[a-z0-9_]+', ident), f'{ident}: 不符合id规则')
            require(row['icon'] == f'icons/{ident}.png', f'{ident}: icon路径不匹配')
            for field, prefix in (('portrait', 'portrait/'), ('battle', 'battle/')):
                value = row[field]
                if value is not None:
                    if field == 'portrait':
                        require(value == f'portrait/{ident}.png', f'{ident}: portrait路径不匹配')
                    else:
                        require(isinstance(value, str) and value.startswith(f'battle/{ident}/'), f'{ident}: battle路径不匹配')
                    require(isinstance(value, str) and value.startswith(prefix) and '..' not in Path(value).parts and (directory / value).exists(), f'{ident}: {field}引用不存在或路径越界')
            if row.get('variantOf') and row['slot'] not in ('wings', 'veil', 'trinket'):
                require(row['portrait'] is not None, f'{ident}: 身体/武器变体须带立绘层')
            rows[ident] = (row, picture(directory / row['icon']))
        for rar in range(5):
            path = directory / f'frame/r{rar}.png'
            if path.exists():
                image = picture(path)
                require(rar not in frames or frames[rar].tobytes() == image.tobytes(), f'底板r{rar}冲突')
                frames[rar] = image
    require(len(frames) == 5, '缺少稀有度底板（须有r0～r4）')
    for row, _ in rows.values():
        if row.get('variantOf'):
            require(row['variantOf'] in rows, f"{row['id']}: 变体保底件不存在")
    expected = {f'{kind}_{series}_r{rar}' for series in SERIES for kind in KINDS
                if series != 'wayfarer' or kind not in ('wings', 'veil')
                for rar in range(2 if series == 'wayfarer' else 4)}
    require(expected <= rows.keys(), f'缺少保底件: {sorted(expected - rows.keys())}')
    if args.legend:
        pack = json.loads((args.legend / 'gear.json').read_text())
        require(isinstance(pack, list) and len(pack) == 36, '传说清单必须包含36项')
        legends = set()
        for row in pack:
            require(isinstance(row, dict) and set(row) == {'id', 'name'}, '传说条目须为id/name对象')
            ident = row['id']
            require(isinstance(ident, str) and re.fullmatch(r'lg_[a-z0-9_]+', ident), f'无效传说id: {ident}')
            require(ident not in rows and ident not in legends, f'重复id: {ident}')
            require(isinstance(row['name'], str) and row['name'].strip(), f'{ident}: 缺少名字')
            legends.add(ident)
            rows[ident] = ({'series': 'legend'}, picture(args.legend / f'icons/{ident}.png'))
        require({p.name for p in (args.legend / 'icons').glob('*.png')} ==
                {f'{key}.png' for key in legends}, '传说PNG与清单不一致')
    output = ROOT / 'assets/fx'
    with tempfile.TemporaryDirectory(prefix='gear-build-') as temporary:
        stage = Path(temporary)
        for mobile in (False, True):
            cell = CELL // (2 if mobile else 1)
            suffix = '_m' if mobile else ''
            meta = {'schema': 'afterglow.gearatlas.v1', 'cell': cell, 'pages': [], 'items': {}, 'frames': {}}
            for series in (*SERIES, 'legend'):
                group = sorted((key for key, (row, _) in rows.items() if row['series'] == series))
                for offset in range(0, len(group), COLUMNS * COLUMNS):
                    keys = group[offset:offset + COLUMNS * COLUMNS]
                    width, height = min(COLUMNS, len(keys)) * cell, math.ceil(len(keys) / COLUMNS) * cell
                    page = f'gear_icons_{series}_{offset // (COLUMNS * COLUMNS)}{suffix}.webp'
                    atlas = Image.new('RGBA', (width, height))
                    for i, key in enumerate(keys):
                        x, y = i % COLUMNS * cell, i // COLUMNS * cell
                        atlas.paste(rows[key][1].resize((cell, cell), Image.Resampling.LANCZOS), (x, y))
                        meta['items'][key] = [len(meta['pages']), x, y]
                    atlas.save(stage / page, 'WEBP', lossless=True)
                    meta['pages'].append({'file': page, 'width': width, 'height': height})
                    print(f'{page}: {len(keys)} icons, {width}x{height}')
            for rar, image in sorted(frames.items()):
                name = f'gear_frame_r{rar}{suffix}.webp'
                image.resize((cell, cell), Image.Resampling.LANCZOS).save(stage / name, 'WEBP', lossless=True)
                meta['frames'][str(rar)] = name
            (stage / f'gear_icons{suffix}.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n')
        # 全部校验和编码完成后才发布，坏素材不会覆盖已有图集。
        output.mkdir(parents=True, exist_ok=True)
        for path in stage.iterdir():
            shutil.copyfile(path, output / path.name)
    print(f'GEAR BUILD ok: {len(rows)} icons, {len(frames)} frames; desktop={CELL}, mobile={CELL // 2}')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, TypeError) as error:
        raise SystemExit(f'GEAR BUILD ERROR: {error}')
