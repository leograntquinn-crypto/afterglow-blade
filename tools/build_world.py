"""把大地图素材包（afterglow.worldpack.v1，docs/ART_V7.md）处理成游戏用的图集。

python3 -I tools/build_world.py <world_terrain_v1 目录> <world_landmarks_v1 目录> <world_props_v1 目录>

输出到 assets/world/（每套两份：桌面原尺寸 = 2 倍图，手机 _m = 一半）：
  terrain_<id>.webp     四张无缝地面贴图（单独存，引擎当平铺图案用）
  world_land.webp/json  地标 + 烽灯 + 封印
  world_props.webp/json 散件 + 地图边缘 + 地面贴花
每块裁掉透明边再打包，记下裁切偏移，锚点不变。
JSON 坐标都是「图集像素」：pos 左上角、dims 宽高、off 裁切后的左上角在原画布里的位置、anchor / entrance 原画布里的锚点和入口；
scale 是图集像素相对素材原尺寸（2 倍图）的比例，引擎用它换算成逻辑像素（原尺寸 2 像素 = 1 逻辑像素）。
"""
import json, os, sys
import numpy as np
from PIL import Image

TER, LAND, PROPS = sys.argv[1:4]
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "world")
os.makedirs(OUT, exist_ok=True)


def trim(im, pad=2):
    a = np.asarray(im)[..., 3] > 2
    ys, xs = np.nonzero(a)
    x0, y0 = max(0, int(xs.min()) - pad), max(0, int(ys.min()) - pad)
    x1, y1 = min(im.width, int(xs.max()) + pad + 1), min(im.height, int(ys.max()) + pad + 1)
    return im.crop((x0, y0, x1, y1)), (x0, y0)


def pack(items, width):
    """货架装箱：按高度从高到低一行行排"""
    pos, x, y, row = {}, 0, 0, 0
    for key, im in sorted(items, key=lambda kv: -kv[1].height):
        if x + im.width > width:
            x, y, row = 0, y + row + 1, 0
        pos[key] = (x, y)
        x += im.width + 1
        row = max(row, im.height)
    return pos, y + row


def atlas(name, entries, width, sc):
    """entries: [(id, 图片路径, 条目信息)]"""
    items, meta = [], {}
    for iid, path, it in entries:
        im = Image.open(path).convert("RGBA")
        if sc != 1:
            im = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS)
        cut, (ox, oy) = trim(im)
        items.append((iid, cut))
        m = {"off": [ox, oy], "full": [im.width, im.height], "anchor": [round(v * sc, 1) for v in it["anchor"]], "kind": it["kind"]}
        if "entrance" in it:
            m["entrance"] = [round(v * sc, 1) for v in it["entrance"]]
        meta[iid] = m
    pos, h = pack(items, width)
    img = Image.new("RGBA", (width, h), (0, 0, 0, 0))
    for k, im in items:
        img.paste(im, pos[k])
    arr = np.asarray(img).copy()
    arr[arr[..., 3] == 0] = 0  # 透明像素颜色清零：压缩更好，缩放取样时边缘不渗色
    Image.fromarray(arr).save(f"{OUT}/{name}.webp", "WEBP", quality=88, method=6, alpha_quality=100)
    for k, im in items:
        meta[k]["pos"] = list(pos[k])
        meta[k]["dims"] = [im.width, im.height]
    json.dump({"scale": sc, "w": width, "h": h, "items": meta}, open(f"{OUT}/{name}.json", "w"), separators=(",", ":"))
    kb = os.path.getsize(f"{OUT}/{name}.webp") / 1024
    print(f"{name}: {width}×{h}，解码 {width * h * 4 / 2**20:.1f}MB，文件 {kb:.0f}KB，{len(items)} 块")


load = lambda d: json.load(open(f"{d}/world.json"))["items"]
ter, land, props = load(TER), load(LAND), load(PROPS)

# 地面贴图：桌面原尺寸，手机一半
for it in (i for i in ter if i["kind"] == "terrain"):
    im = Image.open(f"{TER}/{it['file']}").convert("RGB")
    im.save(f"{OUT}/terrain_{it['id']}.webp", "WEBP", quality=86, method=6)
    im.resize((im.width // 2, im.height // 2), Image.LANCZOS).save(f"{OUT}/terrain_{it['id']}_m.webp", "WEBP", quality=86, method=6)

for suffix, sc, w in (("", 1.0, 2048), ("_m", 0.5, 1024)):
    atlas(f"world_land{suffix}", [(i["id"], f"{LAND}/{i['file']}", i) for i in land], w, sc)
    small = [(i["id"], f"{PROPS}/{i['file']}", i) for i in props] + [(i["id"], f"{TER}/{i['file']}", i) for i in ter if i["kind"] in ("edge", "decal")]
    atlas(f"world_props{suffix}", small, w, sc)

tot = sum(os.path.getsize(f"{OUT}/{f}") for f in os.listdir(OUT) if f.endswith(".webp"))
print(f"合计 {tot / 1024:.0f}KB")
