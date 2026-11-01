"""离线生成音效 WAV（配方和网页版一致：滤波噪声 + 下滑的正弦「咚」）。

运行：python3 tools/gen_sfx.py
以后有了专业音效素材，直接替换 assets/sfx/ 里同名的文件即可，代码不用改。
"""
import math, random, struct, wave, os

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sfx')
random.seed(3)


def env(n, attack, decay):
    a, d = int(attack * SR), int(decay * SR)
    out = []
    for i in range(n):
        if i < a:
            out.append(i / max(1, a))
        else:
            out.append(math.exp(-6.0 * (i - a) / max(1, d)))
    return out


def biquad(xs, kind, f0, f1=None, q=0.8):
    """二阶滤波器，截止频率可以从 f0 指数滑到 f1"""
    y = []
    x1 = x2 = y1 = y2 = 0.0
    n = len(xs)
    for i, x in enumerate(xs):
        f = f0 if f1 is None else f0 * (f1 / f0) ** (i / n)
        w = 2 * math.pi * f / SR
        alpha = math.sin(w) / (2 * q)
        cw = math.cos(w)
        if kind == 'low':
            b0, b1, b2 = (1 - cw) / 2, 1 - cw, (1 - cw) / 2
        elif kind == 'high':
            b0, b1, b2 = (1 + cw) / 2, -(1 + cw), (1 + cw) / 2
        else:  # band
            b0, b1, b2 = alpha, 0, -alpha
        a0, a1, a2 = 1 + alpha, -2 * cw, 1 - alpha
        out = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
        x2, x1, y2, y1 = x1, x, y1, out
        y.append(out)
    return y


def noise(dur, kind='band', f0=1500, f1=None, q=0.8, vol=0.3, attack=0.004):
    n = int(dur * SR)
    xs = biquad([random.uniform(-1, 1) for _ in range(n)], kind, f0, f1, q)
    e = env(n, attack, dur)
    return [x * v * vol for x, v in zip(xs, e)]


def tone(dur, f0=200, f1=60, vol=0.4, shape='sine', attack=0.004):
    n = int(dur * SR)
    e = env(n, attack, dur)
    out, ph = [], 0.0
    for i in range(n):
        f = f0 * (f1 / f0) ** (i / n)
        ph += 2 * math.pi * f / SR
        s = math.sin(ph) if shape == 'sine' else (2 * ((ph / (2 * math.pi)) % 1) - 1 if shape == 'saw' else (1 if math.sin(ph) > 0 else -1))
        out.append(s * e[i] * vol)
    return out


def mix(*parts):
    n = max(len(p) for p in parts)
    return [sum(p[i] for p in parts if i < len(p)) for i in range(n)]


def save(name, xs):
    peak = max(1e-6, max(abs(x) for x in xs))
    g = min(1.0, 0.9 / peak)
    with wave.open(os.path.join(OUT, name + '.wav'), 'w') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, x * g)) * 32767)) for x in xs))
    print('wrote', name)


os.makedirs(OUT, exist_ok=True)
save('swing', noise(0.12, 'band', 900, 3200, 0.8, 0.5))
save('hit', mix(noise(0.09, 'band', 2200, None, 0.7, 0.6), tone(0.12, 180, 60, 0.7)))
save('heavy', mix(noise(0.2, 'low', 1800, 300, 0.7, 0.8), tone(0.26, 120, 35, 1.0)))
save('jump', tone(0.09, 300, 520, 0.3, 'saw'))
save('land', noise(0.08, 'low', 600, None, 0.7, 0.6))
save('dash', noise(0.16, 'high', 1200, 4000, 0.7, 0.5))
save('hurt', mix(tone(0.2, 220, 90, 0.35, 'saw'), noise(0.12, 'band', 800, None, 0.7, 0.5)))
save('skill', mix(tone(0.2, 440, 880, 0.3, 'saw'), noise(0.28, 'high', 2000, 6000, 0.7, 0.25)))
save('kill', tone(0.16, 660, 1320, 0.3, 'saw'))
save('deny', tone(0.08, 160, 150, 0.2, 'square'))
