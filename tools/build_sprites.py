"""把素材包处理成游戏用的图集。

python3 -I tools/build_sprites.py <素材包根目录> <角色>      角色：hero（绯隼）/ grunt（腐骨兵）/ brute（铁甲屠夫）/ archer（影弓手）

素材包都是同一种格式（512×512 单帧、锚点 (220,448)、animations.json），已经是原地动画，不再做对齐修正。
处理内容：
1. 512 → 256 缩小（游戏里角色 80～100px 高，256 已经够 2 倍屏用）
2. 打成 8 列的 WebP 图集 + 一个 JSON（每帧的格子、时长、动画的接触帧和预警帧）
3. 刀身检测（只有主角需要）：在每帧里找出刀（细长的钢灰色连通区域），记下刀柄和刀尖的位置。
   游戏用它画「贴着真实刀身」的刀光拖尾。检测不到的帧（刀被身体挡住、刀身太短）记为 null。
4. 走路稳身（敌人）：素材按骨盆对齐，但走路时上身前后晃得厉害（腐骨兵 37px），在游戏里看起来一抽一抽的。
   量出每帧上身（头肩到腰）的水平重心，用帧偏移 dx 把它往平均位置拉回 STEADY 比例。只改偏移，不动像素
5. 立绘、头像的缩小版
"""
import json, os, sys
from collections import deque
import numpy as np
from PIL import Image

SRC, WHO = sys.argv[1], sys.argv[2]
ROOT = os.path.join(os.path.dirname(__file__), "..", "assets")
TARGETS = {
    "hero": {
        "out": "hero", "name": "feisun",
        # 只有这些动画需要刀光（其他动画不做检测，省时间也避免误检）
        "blade": {"attack_01", "attack_02", "attack_03", "launcher", "air_slash_01", "air_slash_02",
                  "starfall_air", "starfall_land", "thrust", "low_sweep", "cast", "charge"},
        "art": {"hero_fullbody.png": ("fullbody", (512, 768)), "avatar_128.png": ("avatar", None)},
    },
    "grunt": {"out": "enemies", "name": "grunt", "blade": set(), "steady": {"walk": 0.75}, "art": {"avatar_128.png": ("avatar", None)}},
    "brute": {"out": "enemies", "name": "brute", "blade": set(), "steady": {"walk": 0.75}, "art": {"avatar_128.png": ("avatar", None)}},
    "archer": {"out": "enemies", "name": "archer", "blade": set(), "steady": {"walk": 0.75}, "art": {"avatar_128.png": ("avatar", None)}},
}
T = TARGETS[WHO]
OUT = os.path.join(ROOT, T["out"])
CELL, SCALE = 256, 0.5
meta = json.load(open(f"{SRC}/animations.json"))
PX, PY = meta["pivot"]["x"], meta["pivot"]["y"]
BLADE_ANIMS = T["blade"]

# 自动检测漏掉、但刀光需要的帧：手工标注（256 格子坐标：刀柄 x, y, 刀尖 x, y）
BLADE_FIX = {
    "attack_01_02": [70, 45, 34, 66], "air_slash_01_01": [72, 80, 181, 110], "air_slash_02_04": [138, 98, 62, 45],
    "launcher_04": [82, 60, 185, 72], "thrust_01": [72, 78, 152, 133], "thrust_03": [152, 95, 193, 97],
    "thrust_04": [122, 118, 186, 119],
} if WHO == "hero" else {}


def torso_x(im):
    """上身（头顶往下 12%～45% 身高：头肩到腰）不透明像素的水平重心，不含腿和低垂的武器"""
    a = np.asarray(im)[..., 3] > 128
    top = int(np.nonzero(a.any(axis=1))[0][0])
    h = PY - top
    band = a[int(top + h * 0.12):int(top + h * 0.45)]
    return float(np.nonzero(band)[1].mean())


def components(m):
    seen = np.zeros_like(m)
    H, W = m.shape
    for y0, x0 in zip(*np.nonzero(m)):
        if seen[y0, x0]:
            continue
        q, pts = deque([(y0, x0)]), []
        seen[y0, x0] = 1
        while q:
            y, x = q.popleft()
            pts.append((x, y))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < H and 0 <= xx < W and m[yy, xx] and not seen[yy, xx]:
                        seen[yy, xx] = 1
                        q.append((yy, xx))
        yield np.array(pts, float)


def blade(small):
    """返回 [刀柄x, 刀柄y, 刀尖x, 刀尖y]（256 格子坐标），找不到返回 None"""
    a = np.asarray(small).astype(int)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
    steel = (al > 100) & (mn > 78) & (mx - mn < 50)
    solid = al > 100
    best = None
    for p in components(steel):
        if len(p) < 15:
            continue
        c = p.mean(0)
        _, _, vt = np.linalg.svd(p - c, full_matrices=False)
        proj = (p - c) @ vt[0]
        L = proj.max() - proj.min()
        if L < 40 or len(p) / L > 6.5:  # 刀：够长、够细
            continue
        if best is None or L > best[0]:
            best = (L, p[proj.argmax()], p[proj.argmin()], vt[0])
    if best is None:
        return None
    _, e1, e2, _ = best

    # 刀柄那头有手（不透明、非钢色的像素多），刀尖那头周围是空的
    def crowd(e):
        x, y = int(e[0]), int(e[1])
        win = (slice(max(0, y - 7), y + 8), slice(max(0, x - 7), x + 8))
        return int((solid[win] & ~steel[win]).sum())

    hilt, tip = (e1, e2) if crowd(e1) > crowd(e2) else (e2, e1)
    d = tip - hilt
    tip = tip + d / max(1, np.hypot(*d)) * 3  # 检测到的端点略缩在刀尖里面
    return [round(float(v), 1) for v in (*hilt, *tip)]


os.makedirs(OUT, exist_ok=True)
names = [fn for anim in meta["animations"].values() for fn in anim["frame_names"]]
cols, rows = 8, (len(names) + 7) // 8
atlas = Image.new("RGBA", (cols * CELL, rows * CELL), (0, 0, 0, 0))
out = {"cell": CELL, "cols": cols, "pivot": [PX * SCALE, PY * SCALE], "anims": {}, "frames": {}}
found = total = 0
for aname, anim in meta["animations"].items():
    steady = T.get("steady", {}).get(aname, 0)
    shifts = {}
    if steady:
        tx = {fn: torso_x(Image.open(f"{SRC}/{meta['frames'][fn]['file']}").convert("RGBA")) for fn in anim["frame_names"]}
        mean = sum(tx.values()) / len(tx)
        shifts = {fn: (mean - x) * steady for fn, x in tx.items()}
        after = [x + shifts[fn] for fn, x in tx.items()]
        print(f"{aname} 上身晃动 {max(tx.values()) - min(tx.values()):.0f}px → {max(after) - min(after):.0f}px（512 尺度）")
    for fn in anim["frame_names"]:
        im = Image.open(f"{SRC}/{meta['frames'][fn]['file']}").convert("RGBA")
        small = im.resize((CELL, CELL), Image.LANCZOS)
        i = names.index(fn)
        atlas.paste(small, ((i % cols) * CELL, (i // cols) * CELL))
        fr = {"i": i, "dx": round(shifts.get(fn, 0) * SCALE, 1), "dy": 0, "ms": meta["frames"][fn].get("duration_ms", 1000 / anim["fps"])}
        if aname in BLADE_ANIMS:
            bl = BLADE_FIX.get(fn) or blade(small)
            total += 1
            if bl:
                found += 1
                # 存成相对锚点（脚底）的坐标
                fr["blade"] = [round(bl[0] - PX * SCALE, 1), round(bl[1] - PY * SCALE, 1), round(bl[2] - PX * SCALE, 1), round(bl[3] - PY * SCALE, 1)]
        out["frames"][fn] = fr
    out["anims"][aname] = {"frames": anim["frame_names"], "loop": anim["loop"], "contact": anim.get("suggested_contact_frame_indices", []),
                           "windup": anim.get("suggested_windup_frame_indices", [])}
N = T["name"]
atlas.save(f"{OUT}/{N}_atlas.webp", "WEBP", quality=88, method=6)
json.dump(out, open(f"{OUT}/{N}.json", "w"), ensure_ascii=False, separators=(",", ":"))

for src_name, (kind, size) in T["art"].items():
    im = Image.open(f"{SRC}/artwork/{src_name}").convert("RGBA")
    if size:
        im = im.resize(size, Image.LANCZOS)
    im.save(f"{OUT}/{N}_{kind}.webp", "WEBP", quality=90 if size else 92, method=6)
for f in sorted(x for x in os.listdir(OUT) if x.startswith(N)):
    print(f"{os.path.getsize(os.path.join(OUT, f)) / 1024:8.1f} KB  {f}")
print(f"{len(names)} 帧，{len(out['anims'])} 组动画" + (f"；刀身检测 {found}/{total}" if total else ""))
