"""把素材包处理成游戏用的图集。

python3 -I tools/build_sprites.py <素材包根目录> <目标> [追加的素材包 ...]

目标：hero（绯隼，追加 feisun_skills_v3 合进同一张图集）/ grunt / brute / archer（杂兵）/
      bone_lord / altar_warden（首领）/ props_s / props_l（小道具、大道具，来自同一个 env_props_v1 包）

素材包都是 feisun.spritepack.v1 格式（单帧 PNG + animations.json），已经是原地动画，不再做对齐修正。
每个目标输出两套图集：
  桌面：<名字>.json + <名字>_atlas.webp（角色 256 格子）
  手机：<名字>_m.json + <名字>_m_atlas.webp（格子是桌面的 75%，内存约 56%；手机上角色只有 85～245px 高，看不出区别）
处理内容：
1. 缩小、打成 8 列的 WebP 图集 + JSON（每帧的格子、时长、动画的接触帧和预警帧）
2. 刀身检测（只有主角需要）：在每帧里找出刀（细长的钢灰色连通区域），记下刀柄和刀尖的位置。
   游戏用它画「贴着真实刀身」的刀光拖尾。检测不到的帧（刀被身体挡住、刀身太短）记为 null
3. 走路稳身（杂兵）：量出每帧上身的水平重心，用帧偏移 dx 把它往平均位置拉回 STEADY 比例。只改偏移，不动像素
4. 立绘、头像的缩小版
"""
import json, os, sys
from collections import deque
import numpy as np
from PIL import Image

SRC, WHO, EXTRA = sys.argv[1], sys.argv[2], sys.argv[3:]
ROOT = os.path.join(os.path.dirname(__file__), "..", "assets")
AVATAR = {"avatar_128.png": ("avatar", None)}
TARGETS = {
    "hero": {
        "out": "hero", "name": "feisun", "cell": 256,
        # 只有这些动画需要刀光（其他动画不做检测，省时间也避免误检）
        "blade": {"attack_01", "attack_02", "attack_03", "launcher", "air_slash_01", "air_slash_02", "starfall_air", "starfall_land",
                  "thrust", "low_sweep", "cast", "charge", "whirl", "parry", "quake", "dash_slash", "air_dash"},
        "art": {"hero_fullbody.png": ("fullbody", (512, 768)), **AVATAR},
    },
    "grunt": {"out": "enemies", "name": "grunt", "cell": 256, "steady": {"walk": 0.75}, "art": AVATAR},
    "brute": {"out": "enemies", "name": "brute", "cell": 256, "steady": {"walk": 0.75}, "art": AVATAR},
    "archer": {"out": "enemies", "name": "archer", "cell": 256, "steady": {"walk": 0.75}, "art": AVATAR},
    "bone_lord": {"out": "bosses", "name": "bone_lord", "cell": 256, "art": AVATAR},
    "altar_warden": {"out": "bosses", "name": "altar_warden", "cell": 256, "art": AVATAR},
    # 道具包里两种画布：小道具 256（锚点 128,232），大道具 512（锚点 256,448），分成两张图集
    "props_s": {"out": "props", "name": "props_s", "cell": 128, "only": ["urn_a", "urn_b", "shards", "chest", "sconce", "banner"]},
    "props_l": {"out": "props", "name": "props_l", "cell": 256, "only": ["shrine", "shrine_dry", "gate"]},
}
T = TARGETS[WHO]
OUT = os.path.join(ROOT, T["out"])
BLADE_ANIMS = T.get("blade", set())

# 自动检测漏掉、但刀光需要的帧：手工标注（256 格子坐标：刀柄 x, y, 刀尖 x, y）
BLADE_FIX = {
    "attack_01_02": [70, 45, 34, 66], "air_slash_01_01": [72, 80, 181, 110], "air_slash_02_04": [138, 98, 62, 45],
    "launcher_04": [82, 60, 185, 72], "thrust_01": [72, 78, 152, 133], "thrust_03": [152, 95, 193, 97],
    "thrust_04": [122, 118, 186, 119],
    # 回风斩转到背面时刀指向左后方，钢色被衣服挡住一段，自动检测不到
    "whirl_04": [87, 125, 31, 127], "whirl_05": [77, 126, 33, 129],
} if WHO == "hero" else {}


def torso_x(im, py):
    """上身（头顶往下 12%～45% 身高：头肩到腰）不透明像素的水平重心，不含腿和低垂的武器"""
    a = np.asarray(im)[..., 3] > 128
    top = int(np.nonzero(a.any(axis=1))[0][0])
    h = py - top
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


# ---------- 读入所有素材包，按顺序合并动画 ----------
entries = []  # (动画名, 动画, 素材包目录, 画布宽, 锚点 x, 锚点 y, 素材包的 frames 表)
for pack in [SRC, *EXTRA]:
    meta = json.load(open(f"{pack}/animations.json"))
    for aname, anim in meta["animations"].items():
        if "only" in T and aname not in T["only"]:
            continue
        cv = anim.get("canvas", meta["canvas"])
        pv = anim.get("pivot", meta["pivot"])
        entries.append((aname, anim, pack, cv["width"], pv["x"], pv["y"], meta["frames"]))
canvas = entries[0][3]
assert all(e[3] == canvas and e[4] == entries[0][4] and e[5] == entries[0][5] for e in entries), "同一目标里的画布和锚点必须一致"
PX, PY = entries[0][4], entries[0][5]
names = [fn for e in entries for fn in e[1]["frame_names"]]
cols, rows = 8, (len(names) + 7) // 8

# 先按原尺寸算每帧的稳身偏移和刀身（刀身在 256 格子上检测，再按比例换算）
shift, blades, found, total = {}, {}, 0, 0
for aname, anim, pack, *_ , frames in entries:
    steady = T.get("steady", {}).get(aname, 0)
    if steady:
        tx = {fn: torso_x(Image.open(f"{pack}/{frames[fn]['file']}").convert("RGBA"), PY) for fn in anim["frame_names"]}
        mean = sum(tx.values()) / len(tx)
        shift.update({fn: (mean - x) * steady for fn, x in tx.items()})
        after = [x + shift[fn] for fn, x in tx.items()]
        print(f"{aname} 上身晃动 {max(tx.values()) - min(tx.values()):.0f}px → {max(after) - min(after):.0f}px（原尺寸）")
    if aname in BLADE_ANIMS:
        for fn in anim["frame_names"]:
            small = Image.open(f"{pack}/{frames[fn]['file']}").convert("RGBA").resize((256, 256), Image.LANCZOS)
            bl = BLADE_FIX.get(fn) or blade(small)
            total += 1
            if bl:
                found += 1
                k = canvas / 256  # 256 格子坐标 → 原尺寸
                blades[fn] = [v * k for v in bl]

os.makedirs(OUT, exist_ok=True)
N = T["name"]
for suffix, cell in (("", T["cell"]), ("_m", round(T["cell"] * 0.75))):
    S = cell / canvas
    atlas = Image.new("RGBA", (cols * cell, rows * cell), (0, 0, 0, 0))
    out = {"cell": cell, "cols": cols, "pivot": [PX * S, PY * S], "anims": {}, "frames": {}}
    for aname, anim, pack, *_, frames in entries:
        for fn in anim["frame_names"]:
            i = names.index(fn)
            im = Image.open(f"{pack}/{frames[fn]['file']}").convert("RGBA").resize((cell, cell), Image.LANCZOS)
            atlas.paste(im, ((i % cols) * cell, (i // cols) * cell))
            fr = {"i": i, "dx": round(shift.get(fn, 0) * S, 1), "dy": 0, "ms": frames[fn].get("duration_ms", 1000 / anim["fps"])}
            if fn in blades:
                b = blades[fn]  # 存成相对锚点（脚底）的坐标
                fr["blade"] = [round((b[0] - PX) * S, 1), round((b[1] - PY) * S, 1), round((b[2] - PX) * S, 1), round((b[3] - PY) * S, 1)]
            out["frames"][fn] = fr
        out["anims"][aname] = {"frames": anim["frame_names"], "loop": anim["loop"], "contact": anim.get("suggested_contact_frame_indices", []),
                               "windup": anim.get("suggested_windup_frame_indices", [])}
    atlas.save(f"{OUT}/{N}{suffix}_atlas.webp", "WEBP", quality=88, method=6)
    json.dump(out, open(f"{OUT}/{N}{suffix}.json", "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"{N}{suffix}: 格子 {cell}，图集 {cols * cell}×{rows * cell}，解码约 {cols * cell * rows * cell * 4 / 2**20:.1f}MB")

for src_name, (kind, size) in T.get("art", {}).items():
    p = f"{SRC}/artwork/{src_name}"
    if not os.path.exists(p):
        continue
    im = Image.open(p).convert("RGBA")
    if size:
        im = im.resize(size, Image.LANCZOS)
    im.save(f"{OUT}/{N}_{kind}.webp", "WEBP", quality=90 if size else 92, method=6)
for f in sorted(x for x in os.listdir(OUT) if x.startswith(N)):
    print(f"{os.path.getsize(os.path.join(OUT, f)) / 1024:8.1f} KB  {f}")
print(f"{len(names)} 帧，{len(entries)} 组动画" + (f"；刀身检测 {found}/{total}" if total else ""))
