"""把环境素材包（afterglow.envpack.v1）处理成游戏用的文件。

python3 -I tools/build_env.py <env_kit_v1 目录> <env_backdrops_v1 目录>

输出到 assets/env/：
  每张图两份：<id>.webp（2 倍尺寸，桌面）和 <id>_1x.webp（1 倍尺寸，手机，内存是 2 倍的 25%）
  贴花和前景按内容裁掉透明边再存（这两类图大部分是透明的），锚点换算到裁切后的坐标
  env.json：游戏读的清单（尺寸、锚点、视差、挂接方式、属于哪一关）
"""
import json, os, sys
import numpy as np
from PIL import Image

KIT, BD = sys.argv[1], sys.argv[2]
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "env")
os.makedirs(OUT, exist_ok=True)


def save(im, name, q):
    im.save(f"{OUT}/{name}.webp", "WEBP", quality=q, method=6)
    im.resize((im.width // 2, im.height // 2), Image.LANCZOS).save(f"{OUT}/{name}_1x.webp", "WEBP", quality=q, method=6)


def trimmed(path, anchor):
    """裁掉透明边；返回裁切后的图和锚点（2 倍像素，相对裁切后的左上角）"""
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im)[..., 3] > 8
    ys, xs = np.nonzero(a)
    x0, y0, x1, y1 = int(max(0, xs.min() - 2)), int(max(0, ys.min() - 2)), int(min(im.width, xs.max() + 3)), int(min(im.height, ys.max() + 3))
    # 尺寸取偶数，1 倍版本才不会丢半个像素
    x1 += (x1 - x0) % 2
    y1 += (y1 - y0) % 2
    ax, ay = anchor[0] * im.width - x0, anchor[1] * im.height - y0
    return im.crop((x0, y0, x1, y1)), round(ax, 1), round(ay, 1)


manifest = {"schema": "afterglow.env.runtime.v1", "scale": 2, "ground": 636, "walls": [], "floor": None, "backdrops": {}, "decals": [], "fg": []}
for src, root in ((json.load(open(f"{KIT}/env.json")), KIT), (json.load(open(f"{BD}/env.json")), BD)):
    for L in src["layers"]:
        im = Image.open(f"{root}/{L['file']}").convert("RGBA")
        opaque = L["role"] in ("floor", "backdrop")
        save(im.convert("RGB") if opaque else im, L["id"], 82 if opaque else 85)
        e = {"id": L["id"], "w": im.width, "h": im.height, "parallax": L["parallax"], "y": L.get("y", 0)}
        if L["role"] == "wall":
            manifest["walls"].append(e)
        elif L["role"] == "floor":
            manifest["floor"] = e
        else:
            manifest["backdrops"][L["stage"]] = e
    for D in src["decals"]:
        im, ax, ay = trimmed(f"{root}/{D['file']}", D["anchor"])
        save(im, D["id"], 85)
        manifest["decals"].append({"id": D["id"], "w": im.width, "h": im.height, "ax": ax, "ay": ay, "stage": D.get("stage")})
    for F in src.get("foreground", []):
        im, ax, ay = trimmed(f"{root}/{F['file']}", F["anchor"])
        save(im, F["id"], 85)
        manifest["fg"].append({"id": F["id"], "w": im.width, "h": im.height, "ax": ax, "ay": ay, "attach": F["attach"], "parallax": F["parallax"]})

json.dump(manifest, open(f"{OUT}/env.json", "w"), ensure_ascii=False, separators=(",", ":"))
tot2 = tot1 = 0
for f in sorted(os.listdir(OUT)):
    n = os.path.getsize(f"{OUT}/{f}")
    if f.endswith("_1x.webp"):
        tot1 += n
    elif f.endswith(".webp"):
        tot2 += n
print(f"{len(manifest['walls'])} 面后墙、{len(manifest['backdrops'])} 张远景、{len(manifest['decals'])} 张贴花、{len(manifest['fg'])} 件前景")
print(f"2 倍文件合计 {tot2 / 1024:.0f}KB，1 倍文件合计 {tot1 / 1024:.0f}KB")
