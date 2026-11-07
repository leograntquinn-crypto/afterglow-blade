"""把特效素材包（afterglow.fxpack.v1）处理成游戏用的图集。

python3 -I tools/build_fx.py <fx_textures_v1 目录> <fx_hero_v1 目录> <fx_boss_v1 目录> [fx_blade_v1 目录] [fx_light_v1 目录]
python3 -I tools/build_fx.py --enemy <fx_enemy_v1_common 目录>      （只打敌人特效包，不动别的图集）

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
序列帧：桌面存交付尺寸的 50%、手机 25%（docs/ART_FX.md 第二节）；每帧裁掉透明边再打包，记下裁切偏移，锚点不变。
JSON 里的坐标都是「图集像素」：pos 每块的左上角，dims 每块的宽高；scale 是图集像素相对交付尺寸的比例，引擎用它换算成游戏里的大小。
"""
import json, os, sys
import numpy as np
from PIL import Image

TEX, HERO, BOSS = sys.argv[1:4] if sys.argv[1] != "--enemy" else (None,) * 3
# 敌人特效的序列帧：地面预警圈在游戏里画得比交付尺寸的一半大（rx 115 → 宽约 240 逻辑像素），按 50% 存会被放大发糊，
# 所以桌面存 60%、手机 30%（只多约 40% 像素）
ENEMY_FB_SCALE = (0.6, 0.3)
BLADE = sys.argv[4] if len(sys.argv) > 4 else None
LIGHT = sys.argv[5] if len(sys.argv) > 5 else None
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


def build_textures(name, root, m, keep_full=(), opaque=()):
    """单张贴图：桌面原尺寸、手机 50%；keep_full 里的不裁透明边（刀光条带：引擎按整条的 UV 铺）。
    opaque 里的（整张 alpha 是同一个值的，比如颗粒 grain）存成不透明、JSON 里记下原来的 alpha：
    浏览器的画布按「预乘 alpha」存像素，alpha 24 的灰度起伏会被压成三四档，存成不透明才不丢细节"""
    for suffix, sc in (("", 1.0), ("_m", 0.5)):
        items, tex = [], {}
        for t in m["textures"]:
            im = Image.open(f"{root}/{t['file']}").convert("RGBA")
            extra = {}
            if t["id"] in opaque:
                a = np.asarray(im)[..., 3]
                assert a.min() == a.max(), f"{t['id']} 的 alpha 不是常数"
                extra["alpha"] = int(a[0, 0])
                im = Image.fromarray(np.dstack([np.asarray(im)[..., :3], np.full(a.shape, 255, np.uint8)]))
            if sc != 1:
                im = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS)
            if t["id"] in keep_full:
                cut, (ox, oy) = im, (0, 0)
            else:
                cut, (ox, oy) = trim(im)
            items.append((t["id"], cut))
            tex[t["id"]] = {"blend": t["blend"], "anchor": t["anchor"], "full": [im.width, im.height], "off": [ox, oy], **extra}
        save_atlas(f"{name}{suffix}", items, 2048 if not suffix else 1024, {"scale": sc, "tex": tex})


def build_flipbooks(name, ids, fbs, scales=(0.5, 0.25)):
    """序列帧：默认桌面交付尺寸 50%、手机 25%，每帧裁透明边"""
    for suffix, sc in (("", scales[0]), ("_m", scales[1])):
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
        save_atlas(f"{name}{suffix}", items, 2048 if not suffix else 1024, {"scale": sc, "fb": meta})


# ---------- 敌人特效包 fx_enemy_v1（单独打，不需要别的包）----------
if sys.argv[1] == "--enemy":
    COMMON = sys.argv[2]
    em = json.load(open(f"{COMMON}/fx.json"))
    build_textures("fx_enemy_tex", COMMON, em, keep_full={"aim_line", "lane_band"})
    efbs = {f["id"]: (COMMON, f) for f in em["flipbooks"]}
    build_flipbooks("fx_enemy", list(efbs), efbs, ENEMY_FB_SCALE)
    sys.exit(0)

# ---------- FX-1 单张贴图 ----------
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
