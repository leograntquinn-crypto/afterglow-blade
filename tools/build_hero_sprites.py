"""把「绯隼」素材包处理成游戏用的图集。

python3 -I tools/build_hero_sprites.py <素材包根目录>

处理内容：
1. 跑动：用「头 + 上半身」的轮廓和第一帧做模板匹配，逐帧对齐，消除原地跑时身体前后游动
   （待机和受击不处理：待机的脚本来就稳；受击的后仰是动作本身）
2. 跳跃：按脚底对齐，去掉画进图里的上升高度（游戏自己算跳跃高度）
3. 512 → 256 缩小（游戏里角色约 95px 高，256 已经够 2 倍屏用）
4. 打成 8×7 的 WebP 图集 + 一个 JSON（每帧的格子、偏移、时长）
另外导出立绘和头像的缩小版。
"""
import json, os, sys, statistics as st
from PIL import Image

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "hero")
CELL, SCALE = 256, 0.5
meta = json.load(open(f"{SRC}/animations.json"))
PX, PY = meta["pivot"]["x"], meta["pivot"]["y"]
STABILIZE = {"run"}


def measure(im):
    a = im.getchannel("A")
    px, (w, h) = a.load(), im.size
    foot = next(y for y in range(h - 1, -1, -1) if sum(1 for x in range(0, w, 2) if px[x, y] > 128) >= 2)
    top = a.point(lambda v: 255 if v > 24 else 0).getbbox()[1]
    hgt = foot - top
    cs = []
    # 躯干带（脚底往上 62%~78% 身高）：最宽的一段不透明像素的中心，避开刀身和腿
    for y in range(int(foot - hgt * 0.78), int(foot - hgt * 0.62), 2):
        segs, s0 = [], None
        for x in range(w):
            on = px[x, y] > 128
            if on and s0 is None: s0 = x
            if not on and s0 is not None: segs.append((s0, x)); s0 = None
        if segs:
            a0, a1 = max(segs, key=lambda s: s[1] - s[0])
            if a1 - a0 > 14: cs.append((a0 + a1) / 2)
    return foot, (st.median(cs) if cs else PX)


def upper_mask(im, foot):
    """脚底往上 55% 身高以上的轮廓（头、躯干），缩到 1/4 加速匹配"""
    a = im.getchannel("A").resize((128, 128))
    px = a.load()
    cut = int(foot / 4 - (foot / 4 - a.point(lambda v: 255 if v > 24 else 0).getbbox()[1]) * 0.55)
    return [[1 if (y < cut and px[x, y] > 128) else 0 for x in range(128)] for y in range(128)]


def best_shift(ref, cur, r=12):
    """在 ±r（1/4 尺度）范围内找让 cur 和 ref 重合最多的水平偏移"""
    best, bs = -1, 0
    for s in range(-r, r + 1):
        score = 0
        for yr, yc in zip(ref, cur):
            for x in range(max(0, s), min(128, 128 + s)):
                score += yr[x] & yc[x - s]
        if score > best: best, bs = score, s
    return bs * 4


os.makedirs(OUT, exist_ok=True)
names = [fn for anim in meta["animations"].values() for fn in anim["frame_names"]]
cols, rows = 8, (len(names) + 7) // 8
atlas = Image.new("RGBA", (cols * CELL, rows * CELL), (0, 0, 0, 0))
out = {"cell": CELL, "cols": cols, "pivot": [PX * SCALE, PY * SCALE], "anims": {}, "frames": {}}
for aname, anim in meta["animations"].items():
    ims = [Image.open(f"{SRC}/{meta['frames'][fn]['file']}").convert("RGBA") for fn in anim["frame_names"]]
    ms = [measure(im) for im in ims]
    shifts = [0] * len(ims)
    if aname in STABILIZE:
        masks = [upper_mask(im, m[0]) for im, m in zip(ims, ms)]
        shifts = [best_shift(masks[0], mk) for mk in masks]
        mean = st.mean(shifts)
        shifts = [s - mean for s in shifts]
    for fn, im, (foot, cx), sh in zip(anim["frame_names"], ims, ms, shifts):
        dx = sh
        dy = (PY - foot) if aname == "jump" else 0.0
        i = names.index(fn)
        small = im.resize((CELL, CELL), Image.LANCZOS)
        atlas.paste(small, ((i % cols) * CELL, (i // cols) * CELL))
        out["frames"][fn] = {"i": i, "dx": round(dx * SCALE, 2), "dy": round(dy * SCALE, 2), "ms": meta["frames"][fn].get("duration_ms", 1000 / anim["fps"])}
    out["anims"][aname] = {"frames": anim["frame_names"], "loop": anim["loop"], "contact": anim.get("suggested_contact_frame_indices", [])}
atlas.save(f"{OUT}/feisun_atlas.webp", "WEBP", quality=90, method=6)
json.dump(out, open(f"{OUT}/feisun.json", "w"), ensure_ascii=False, indent=1)

art = Image.open(f"{SRC}/artwork/hero_fullbody.png").convert("RGBA")
art.resize((512, 768), Image.LANCZOS).save(f"{OUT}/feisun_fullbody.webp", "WEBP", quality=90, method=6)
Image.open(f"{SRC}/artwork/avatar_128.png").convert("RGBA").save(f"{OUT}/feisun_avatar.webp", "WEBP", quality=92, method=6)
for f in sorted(os.listdir(OUT)):
    print(f"{os.path.getsize(os.path.join(OUT, f)) / 1024:8.1f} KB  {f}")
for a in ("idle", "run", "hurt", "jump"):
    print(a, [(out["frames"][fn]["dx"], out["frames"][fn]["dy"]) for fn in out["anims"][a]["frames"]])
