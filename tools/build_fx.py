"""把特效素材包（afterglow.fxpack.v1）处理成游戏用的图集。

python3 -I tools/build_fx.py <fx_textures_v1 目录> <fx_hero_v1 目录> <fx_boss_v1 目录> [fx_blade_v1 目录] [fx_light_v1 目录]
python3 -I tools/build_fx.py --enemy <fx_enemy_v1_common 目录> [fx_enemy_v1_types 目录]   （只打敌人特效包，不动别的图集）
python3 -I tools/build_fx.py --boss <raven|ironjaw|afterimage> <包目录>   （只打指定首领特效包，不动别的图集）
python3 -I tools/build_fx.py --scene <fx_scene_v1 目录>   （只打场景特效包，不动别的图集）

输出到 assets/fx/（每套两份：桌面 <名字>.webp/json，手机 <名字>_m.webp/json）：
  fx_tex     FX-1 单张贴图。桌面原尺寸，手机 50%，裁掉透明边（记下原画布尺寸和偏移）。碎片图按 docs/chip_regions.json 切成 16 块单独的碎片
  fx_hero    FX-2 绯隼与通用序列帧（一直载入）
  fx_bone    FX-3 里骸骨统领的两组（骨刺、骨裂斩痕），只在第 1 关载入
  fx_warden  FX-3 里祭坛守护者的两组（魂火、召唤法阵），只在第 4 关载入
  fx_blade_tex / fx_blade  刀光包 fx_blade_v1（docs/ART_FX_BLADE_V1.md）：条带贴图（不裁边，引擎按整条铺）和序列帧。
             它里面的序列帧和 fx_hero 同名的（五组刀光）覆盖旧的：fx_hero 里就不再打包这几组
  fx_light_tex / fx_light  光照包 fx_light_v1（docs/ART_FX_LIGHT_V1.md）：19 张贴图（光晕、火花、光照 cookie、屏幕层、门 / 宝箱光）
             和 2 组序列帧（火光 cookie、掉落光柱）。屏幕层（vignette、dim_hole、grain）不裁边：引擎按整张铺满屏幕 / 平铺
  fx_enemy_tex / fx_enemy  敌人特效包第 1 批 fx_enemy_v1_common（docs/ART_FX_ENEMY_V1.md）：7 张贴图（瞄准线、箭、地面光带……；
             可平铺的 aim_line、lane_band 不裁边）和 16 组序列帧（状态光、地面预警、词缀、司祭）。一直载入
  fx_enemy_<敌人>  敌人特效包第 2 批 fx_enemy_v1_types：五种杂兵各自的预警 / 出招 / 命中 / 死亡序列帧，每种敌人一套
             （grunt、brute、archer、priest、wing），按关卡里出现的敌人载入。第 2 批唯一的贴图 ember_trail 并进 fx_enemy_tex（一直载入）
             第 2 批的 zip 多一层顶层目录 fx_enemy_v1_types/，传那一层；fx.json 只列了单帧，没写总图路径，所以直接用单帧（不读 sheets/）
  fx_boss_raven / fx_boss_ironjaw / fx_boss_afterimage  首领专属贴图与序列帧共用图集，按首领载入。
             night_veil、chain_glow、rev_ribbon、streak_line 保留整张画布
  fx_scene   场景贴图与火把序列帧共用图集；stairs_down、stairs_glow 保留整张画布以便对齐。一直载入
序列帧：桌面存交付尺寸的 50%、手机 25%（docs/ART_FX.md 第二节）；每帧裁掉透明边再打包，记下裁切偏移，锚点不变。
JSON 里的坐标都是「图集像素」：pos 每块的左上角，dims 每块的宽高；scale 是图集像素相对交付尺寸的比例，引擎用它换算成游戏里的大小。
"""
import json, os, sys
from pathlib import Path
import numpy as np
from PIL import Image

# 敌人特效的序列帧：地面预警圈在游戏里画得比交付尺寸的一半大（rx 115 → 宽约 240 逻辑像素），按 50% 存会被放大发糊，
# 所以桌面存 60%、手机 30%（只多约 40% 像素）
ENEMY_FB_SCALE = (0.6, 0.3)
ENEMY_TYPES = {
    "grunt": ["grunt_glint", "grunt_slash", "bone_chips", "bone_collapse"],
    "brute": ["brute_heat", "brute_cleave", "metal_spark", "armor_fall"],
    "archer": ["shadow_fade"],
    "priest": ["lantern_flare", "rune_shatter", "candle_smoke"],
    "wing": ["ember_crack", "ember_pop", "ash_fall"],
}
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "fx")
os.makedirs(OUT, exist_ok=True)
GROUPS = {"fx_hero": None, "fx_bone": ["bone_spikes", "bone_rend"], "fx_warden": ["soul_fire", "summon_circle"]}


def trim(im, pad=2):
    a = np.asarray(im)[..., 3] > 2
    if not a.any():
        return None, (0, 0)
    ys, xs = np.nonzero(a)
    x0, y0 = max(0, int(xs.min()) - pad), max(0, int(ys.min()) - pad)
    x1, y1 = min(im.width, int(xs.max()) + pad + 1), min(im.height, int(ys.max()) + pad + 1)
    return im.crop((x0, y0, x1, y1)), (x0, y0)


def pack(items, width):
    """货架装箱：按高度从高到低一行行排。items: [(key, image)]，返回 {key: (x, y)} 和总高度"""
    pos, x, y, row = {}, 0, 0, 0
    for key, im in sorted(items, key=lambda kv: -kv[1].height):
        if x + im.width > width:
            x, y, row = 0, y + row + 1, 0
        pos[key] = (x, y)
        x += im.width + 1
        row = max(row, im.height)
    return pos, y + row


def save_atlas(name, items, width, meta):
    pos, h = pack(items, width)
    atlas = Image.new("RGBA", (width, max(1, h)), (0, 0, 0, 0))
    for key, im in items:
        atlas.paste(im, pos[key])
    # 透明像素的颜色清零，压缩更好、放大取样时边缘也不会渗出杂色
    arr = np.asarray(atlas).copy()
    arr[arr[..., 3] == 0] = 0
    Image.fromarray(arr).save(f"{OUT}/{name}.webp", "WEBP", quality=88, method=6, alpha_quality=100)
    dims = {k: [im.width, im.height] for k, im in items}
    json.dump({**meta, "w": width, "h": h, "pos": {k: list(v) for k, v in pos.items()}, "dims": dims}, open(f"{OUT}/{name}.json", "w"), separators=(",", ":"))
    kb = os.path.getsize(f"{OUT}/{name}.webp") / 1024
    print(f"{name}: {width}×{h}，解码 {width * h * 4 / 2**20:.1f}MB，文件 {kb:.0f}KB，{len(items)} 块")


def collect_textures(root, m, sc, keep_full=(), opaque=()):
    """root 可以是目录或 {贴图 id: 目录}。keep_full 保留整张，opaque 里的常数 alpha 单独记下。"""
    items, tex = [], {}
    for t in m["textures"]:
        im = Image.open(f"{root[t['id']] if isinstance(root, dict) else root}/{t['file']}").convert("RGBA")
        extra = {}
        if t["id"] in opaque:
            a = np.asarray(im)[..., 3]
            assert a.min() == a.max(), f"{t['id']} 的 alpha 不是常数"
            extra["alpha"] = int(a[0, 0])
            # 画布的预乘 alpha 会压掉暗部灰度，存成不透明才能保留颗粒的细节
            im = Image.fromarray(np.dstack([np.asarray(im)[..., :3], np.full(a.shape, 255, np.uint8)]))
        if sc != 1:
            im = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS)
        cut, (ox, oy) = (im, (0, 0)) if t["id"] in keep_full else trim(im)
        items.append((t["id"], cut))
        tex[t["id"]] = {"blend": t["blend"], "anchor": t["anchor"], "full": [im.width, im.height], "off": [ox, oy], **extra}
    return items, tex


def build_textures(name, root, m, keep_full=(), opaque=()):
    """单张贴图：桌面原尺寸、手机 50%。"""
    for suffix, sc in (("", 1.0), ("_m", 0.5)):
        items, tex = collect_textures(root, m, sc, keep_full, opaque)
        save_atlas(f"{name}{suffix}", items, 2048 if not suffix else 1024, {"scale": sc, "tex": tex})


def collect_flipbooks(ids, fbs, sc):
    items, meta = [], {}
    for fid in ids:
        root, f = fbs[fid]
        W, H = round(f["w"] * sc), round(f["h"] * sc)
        frames = []
        for i, fn in enumerate(f["frames"]):
            im = Image.open(f"{root}/{fn}").convert("RGBA").resize((W, H), Image.LANCZOS)
            cut, (ox, oy) = trim(im)
            if cut is None:
                frames.append(None)  # 完全透明的帧：引擎照常计时，不画
                continue
            key = f"{fid}_{i:02d}"
            items.append((key, cut))
            frames.append([key, ox, oy, cut.width, cut.height])
        meta[fid] = {"w": W, "h": H, "anchor": f["anchor"], "fps": f.get("fps", 30), "loop": bool(f.get("loop")), "blend": f["blend"], "frames": frames}
    return items, meta


def build_flipbooks(name, ids, fbs, scales=(0.5, 0.25)):
    """序列帧：默认桌面交付尺寸 50%、手机 25%，每帧裁透明边"""
    for suffix, sc in (("", scales[0]), ("_m", scales[1])):
        items, meta = collect_flipbooks(ids, fbs, sc)
        save_atlas(f"{name}{suffix}", items, 2048 if not suffix else 1024, {"scale": sc, "fb": meta})


# 各包的交付画布和帧数见对应的 docs/ART_FX_BOSS_*_V1.md 第三节
BOSS_PACKS = {
    "raven": {
        "out": "fx_boss_raven",
        "textures": {
            "feather_trail": (256, 64), "raven_arrow": (128, 32),
            "raven_sigil": (512, 256), "night_veil": (1024, 512),
        },
        "flipbooks": {
            "feather_blade_spin": (128, 128, 8), "feather_burst": (256, 256, 8),
            "raven_appear": (256, 384, 8), "split_wisps": (256, 384, 8),
            "feather_drift": (64, 64, 8), "bow_glint": (128, 128, 6),
            "arrow_rain": (128, 384, 6), "rain_impact": (192, 96, 6),
            "channel_gather": (256, 384, 8), "raven_death": (384, 384, 10),
        },
        "keep_full": {"night_veil"},
    },
    "ironjaw": {
        "out": "fx_boss_ironjaw",
        "textures": {
            "chain_glow": (256, 32), "execution_mark": (512, 256),
        },
        "flipbooks": {
            "hook_spark": (128, 128, 6), "chain_drag": (256, 128, 6),
            "heavy_cleave": (384, 384, 8), "stomp_quake": (512, 256, 8),
            "stomp_wave": (512, 256, 8), "charge_sparks": (256, 128, 6),
            "headsman_glint": (256, 256, 6), "execution_drop": (384, 512, 8),
            "chain_break": (384, 384, 10), "ironjaw_death": (384, 384, 10),
        },
        "keep_full": {"chain_glow"},
    },
    "afterimage": {
        "out": "fx_boss_afterimage",
        "textures": {
            "rev_ribbon": (1024, 128), "streak_line": (512, 64), "mirror_sigil": (256, 256),
        },
        "flipbooks": {
            "rev_slash": (256, 256, 6), "rev_wave": (256, 256, 6),
            "shadow_step_out": (256, 384, 6), "shadow_step_in": (256, 384, 6),
            "exec_dash": (384, 192, 6), "exec_mark": (192, 96, 8),
            "habit_read": (128, 128, 8), "reversal_gather": (256, 384, 8),
            "reversal_burst": (512, 512, 8), "afterimage_death": (256, 384, 10),
        },
        "keep_full": {"rev_ribbon", "streak_line"},
    },
}


# 场景包的画布和帧数见 docs/ART_FX_SCENE_V1.md 第三节
SCENE_PACK = {
    "out": "fx_scene",
    "textures": {
        "stairs_down": (256, 128), "stairs_glow": (256, 128),
        "trial_runes": (128, 128), "torch_glow_base": (64, 64),
    },
    "flipbooks": {"torch_flame": (64, 128, 8)},
    "keep_full": {"stairs_down", "stairs_glow"},
}


def validate_mixed_pack(name, root, m, spec):
    if m.get("schema") != "afterglow.fxpack.v1":
        raise ValueError("fx.json 的 schema 应为 afterglow.fxpack.v1")
    for group in ("textures", "flipbooks"):
        expected = spec[group]
        entries = m[group]
        ids = [t["id"] for t in entries]
        found = set(ids)
        missing, extra = sorted(expected.keys() - found), sorted(found - expected.keys())
        repeats = len(ids) - len(found)
        if missing or extra or repeats:
            raise ValueError(f"{group} 的 id 与 {name} 规格不符（缺少 {missing}，多出 {extra}，重复 {repeats} 项）")
        for item in entries:
            ident = item["id"]
            w, h, *count = expected[ident]
            if (item["w"], item["h"]) != (w, h):
                raise ValueError(f"{ident}: fx.json 画布 {item['w']}×{item['h']}，规格应为 {w}×{h}")
            files = item["frames"] if count else [item["file"]]
            if count and (not isinstance(files, list) or len(files) != count[0]):
                actual = len(files) if isinstance(files, list) else "不是列表"
                raise ValueError(f"{ident}: fx.json 帧数 {actual}，规格应为 {count[0]}")
            for file in files:
                with Image.open(root / file) as im:
                    if im.size != (w, h):
                        raise ValueError(f"{ident}: {file} 画布 {im.width}×{im.height}，fx.json 应为 {w}×{h}")
                    im.verify()


def build_mixed_pack(name, root, spec):
    # 兼容解压后平铺的包，以及工具自动加了一层顶层目录的包
    root = Path(root)
    if not (root / "fx.json").is_file():
        choices = sorted(p.parent for p in root.glob("*/fx.json") if p.is_file())
        if len(choices) != 1:
            raise ValueError(f"{root}: 根目录没有 fx.json，一级子目录中找到 {len(choices)} 份（需要恰好 1 份）")
        root = choices[0]
    with (root / "fx.json").open(encoding="utf-8") as manifest:
        m = json.load(manifest)
    validate_mixed_pack(name, root, m, spec)
    fbs = {f["id"]: (root, f) for f in m["flipbooks"]}
    for suffix, sc, width in (("", 0.5, 2048), ("_m", 0.25, 1024)):
        tex_scale = sc * 2
        textures, tex = collect_textures(root, m, tex_scale, keep_full=spec["keep_full"])
        frames, fb = collect_flipbooks(fbs, fbs, sc)
        # 混合图集里 scale 仍表示序列帧的比例，贴图用 texScale
        save_atlas(spec["out"] + suffix, textures + frames, width,
                   {"scale": sc, "texScale": tex_scale, "tex": tex, "fb": fb})


# ---------- 首领特效包（单独打，不需要别的包）----------
if sys.argv[1:2] == ["--boss"]:
    choices = "|".join(BOSS_PACKS)
    if len(sys.argv) > 2 and sys.argv[2] not in BOSS_PACKS:
        sys.exit(f"未知首领包 {sys.argv[2]!r}，可用：{choices}")
    if len(sys.argv) != 4:
        sys.exit(f"用法：python3 -I tools/build_fx.py --boss <{choices}> <包目录>")
    name = sys.argv[2]
    try:
        build_mixed_pack(name, sys.argv[3], BOSS_PACKS[name])
    except (KeyError, TypeError, ValueError, OSError, SyntaxError) as exc:
        sys.exit(f"{name} 特效包构建失败：{exc}")
    sys.exit(0)


# ---------- 场景特效包 fx_scene_v1（单独打，不需要别的包）----------
if sys.argv[1:2] == ["--scene"]:
    if len(sys.argv) != 3:
        sys.exit("用法：python3 -I tools/build_fx.py --scene <fx_scene_v1 目录>")
    try:
        build_mixed_pack("fx_scene", sys.argv[2], SCENE_PACK)
    except (KeyError, TypeError, ValueError, OSError, SyntaxError) as exc:
        sys.exit(f"场景特效包构建失败：{exc}")
    sys.exit(0)


# ---------- 敌人特效包 fx_enemy_v1（单独打，不需要别的包）----------
if sys.argv[1:2] == ["--enemy"]:
    COMMON, TYPES = sys.argv[2], (sys.argv[3] if len(sys.argv) > 3 else None)
    em = json.load(open(f"{COMMON}/fx.json"))
    tm = json.load(open(f"{TYPES}/fx.json")) if TYPES else {"textures": [], "flipbooks": []}
    roots = {**{t["id"]: COMMON for t in em["textures"]}, **{t["id"]: TYPES for t in tm["textures"]}}
    build_textures("fx_enemy_tex", roots, {"textures": em["textures"] + tm["textures"]}, keep_full={"aim_line", "lane_band"})
    efbs = {f["id"]: (COMMON, f) for f in em["flipbooks"]}
    build_flipbooks("fx_enemy", list(efbs), efbs, ENEMY_FB_SCALE)
    # 第 2 批：每种敌人一套（id 见 docs/ART_FX_ENEMY_V1.md 第三节 E）
    tfbs = {f["id"]: (TYPES, f) for f in tm["flipbooks"]}
    for rig, ids in ENEMY_TYPES.items():
        if TYPES:
            missing = [i for i in ids if i not in tfbs]
            assert not missing, f"{rig} 缺 {missing}"
            build_flipbooks(f"fx_enemy_{rig}", ids, tfbs)
    sys.exit(0)

# ---------- FX-1 单张贴图 ----------
TEX, HERO, BOSS = sys.argv[1:4]
BLADE = sys.argv[4] if len(sys.argv) > 4 else None
LIGHT = sys.argv[5] if len(sys.argv) > 5 else None
m = json.load(open(f"{TEX}/fx.json"))
chips = json.load(open(f"{TEX}/docs/chip_regions.json"))
for suffix, sc in (("", 1.0), ("_m", 0.5)):
    items, tex = [], {}
    for t in m["textures"]:
        im = Image.open(f"{TEX}/{t['file']}").convert("RGBA")
        if sc != 1:
            im = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS)
        if t["id"].startswith("chip_"):
            for i, r in enumerate(chips[t["id"]]):
                key = f"{t['id']}_{i}"
                items.append((key, im.crop(tuple(round(v * sc) for v in (r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"])))))
                tex[key] = {"blend": t["blend"], "anchor": [0.5, 0.5], "full": [items[-1][1].width, items[-1][1].height], "off": [0, 0]}
            continue
        cut, (ox, oy) = trim(im)
        items.append((t["id"], cut))
        # full：原画布尺寸（图集像素），off：裁切后的左上角在原画布里的位置 —— 锚点按原画布算
        tex[t["id"]] = {"blend": t["blend"], "anchor": t["anchor"], "full": [im.width, im.height], "off": [ox, oy]}
    save_atlas(f"fx_tex{suffix}", items, 2048 if not suffix else 1024, {"scale": sc, "tex": tex})

# ---------- FX-2 / FX-3 序列帧 ----------
fbs = {}
for root in (HERO, BOSS):
    for f in json.load(open(f"{root}/fx.json"))["flipbooks"]:
        fbs[f["id"]] = (root, f)
blade = json.load(open(f"{BLADE}/fx.json")) if BLADE else None
override = {f["id"] for f in blade["flipbooks"]} if blade else set()
for name, ids in GROUPS.items():
    ids = ids or [k for k, (r, _) in fbs.items() if r == HERO and k not in override]
    build_flipbooks(name, ids, fbs)

# ---------- 刀光包 fx_blade_v1 ----------
if blade:
    build_textures("fx_blade_tex", BLADE, blade, keep_full={t["id"] for t in blade["textures"] if t["id"].startswith("blade_ribbon")})
    bfbs = {f["id"]: (BLADE, f) for f in blade["flipbooks"]}
    build_flipbooks("fx_blade", list(bfbs), bfbs)
# ---------- 光照包 fx_light_v1 ----------
if LIGHT:
    light = json.load(open(f"{LIGHT}/fx.json"))
    build_textures("fx_light_tex", LIGHT, light, keep_full={"vignette", "dim_hole", "grain"}, opaque={"grain"})
    lfbs = {f["id"]: (LIGHT, f) for f in light["flipbooks"]}
    build_flipbooks("fx_light", list(lfbs), lfbs)
tot = sum(os.path.getsize(f"{OUT}/{f}") for f in os.listdir(OUT) if f.endswith(".webp"))
print(f"合计 {tot / 1024:.0f}KB")
