// 大地图素材（ART_V7，tools/build_world.py 处理）：载入 / 释放、按锚点画、地面按区块缓存。
//
// 素材按 2 倍画：原图 2 像素 = 1 逻辑像素。桌面图集是原尺寸（scale 1），手机是一半（scale 0.5），
// 画的时候统一换算成逻辑像素：逻辑像素 / 图集像素 = 0.5 / scale。
// 地图打开时载入，进关时释放（关卡里用不到），回到地图再载入。
// 地面：四张无缝贴图当平铺图案，按区域混合，再画道路和贴花。整张地图 2 倍清晰度太大（2400×1500 → 57MB），
// 所以切成 480×480 的区块，只画镜头附近的，最多缓存 12 块（最久没用的先丢）。
// 画一块要几十毫秒：每帧最多画一块，还没画好的先用荒原贴图临时铺上；空闲的帧按镜头要去的方向提前画下一块。
import { MOBILE, SpriteSheet } from './sprite.js';

const BASE = 'assets/world/';
const TERRAINS = ['moor', 'ash', 'road', 'grave'];
const CHUNK = 480, CHUNK_MAX = 12;

function loadImage(src) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
}
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

class Atlas {
  constructor(name) { this.name = name; }
  async load() {
    const v = MOBILE ? '_m' : '';
    const [meta, img] = await Promise.all([fetch(`${BASE}${this.name}${v}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null), loadImage(`${BASE}${this.name}${v}.webp`)]);
    if (!meta || !img) return false;
    Object.assign(this, { meta, img, k: 0.5 / meta.scale });
    return true;
  }
  has(id) { return !!this.meta?.items[id]; }
  // 锚点画在逻辑坐标 (x, y)；s：在 2 倍图标准大小上再乘的倍数（烽灯、封印画小一些）
  draw(ctx, id, x, y, s = 1, flip = 1) {
    const it = this.meta.items[id], k = this.k * s;
    const dx = (it.off[0] - it.anchor[0]) * k, dy = (it.off[1] - it.anchor[1]) * k;
    if (flip < 0) {
      ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1);
      ctx.drawImage(this.img, it.pos[0], it.pos[1], it.dims[0], it.dims[1], dx, dy, it.dims[0] * k, it.dims[1] * k);
      ctx.restore();
      return;
    }
    ctx.drawImage(this.img, it.pos[0], it.pos[1], it.dims[0], it.dims[1], x + dx, y + dy, it.dims[0] * k, it.dims[1] * k);
  }
  // 入口相对锚点的位置（逻辑像素）
  entrance(id, s = 1) {
    const it = this.meta.items[id];
    return it.entrance ? [(it.entrance[0] - it.anchor[0]) * this.k * s, (it.entrance[1] - it.anchor[1]) * this.k * s] : [0, 0];
  }
}

export const WORLD_ART = {
  ready: false,
  loading: null,
  land: new Atlas('world_land'),
  props: new Atlas('world_props'),
  terrain: {},
  npcs: Object.fromEntries(['zhupo', 'moheng', 'ali'].map((n) => [n, new SpriteSheet(BASE, `npc_${n}`, { avatar: 'avatar', portrait: 'portrait' })])),
  chunks: new Map(),

  load() {
    if (this.ready) return Promise.resolve();
    if (this.loading) return this.loading;
    this.released = false;
    this.loading = (async () => {
      try {
        const v = MOBILE ? '_m' : '';
        for (const n of Object.values(this.npcs)) n.load(); // NPC 单独载入，好了就换（不挡地图）
        const [a, b, ...tex] = await Promise.all([this.land.load(), this.props.load(), ...TERRAINS.map((t) => loadImage(`${BASE}terrain_${t}${v}.webp`))]);
        if (!a || !b || tex.some((t) => !t) || this.released) return;
        TERRAINS.forEach((t, i) => (this.terrain[t] = tex[i]));
        this.tk = MOBILE ? 1 : 0.5; // 地面贴图：逻辑像素 / 贴图像素
        this.ready = true;
      } catch {
        this.ready = false; // 载入失败：地图继续用程序画的占位
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  },

  // 进关时释放：图集、地面区块缓存都丢掉
  release() {
    this.released = true;
    this.ready = false;
    this.land.img = this.props.img = null;
    this.terrain = {};
    for (const c of this.chunks.values()) c.width = c.height = 0;
    this.chunks.clear();
    for (const n of Object.values(this.npcs)) if (n.ready || n.loading) n.release();
  },

  // ---------- 地面区块 ----------
  // paint(g, x0, y0, size)：在逻辑坐标里画地面（只会画到这一块的范围里）；key 变了（道路打通）就全部重画。
  // ahead：镜头接下来要去的位置 [x, y]（走路的方向 / 事件里镜头要移过去的地方），空闲时提前画那里的区块
  ground(ctx, camX, camY, viewW, viewH, k, key, paint, ahead = null) {
    if (this.groundKey !== key || this.chunkK !== k) {
      for (const c of this.chunks.values()) c.width = c.height = 0;
      this.chunks.clear();
      this.groundKey = key;
      this.chunkK = k;
    }
    const range = (x, y) => [Math.floor(x / CHUNK), Math.floor((x + viewW - 1) / CHUNK), Math.floor(y / CHUNK), Math.floor((y + viewH - 1) / CHUNK)];
    const make = (cx, cy) => {
      const c = mk(CHUNK * k, CHUNK * k), g = c.getContext('2d');
      g.setTransform(k, 0, 0, k, -cx * CHUNK * k, -cy * CHUNK * k);
      paint(g, cx * CHUNK, cy * CHUNK, CHUNK);
      this.chunks.set(`${cx},${cy}`, c);
      while (this.chunks.size > CHUNK_MAX) {
        const [old, oc] = this.chunks.entries().next().value;
        this.chunks.delete(old);
        oc.width = oc.height = 0;
      }
      return c;
    };
    let painted = 0, fallback = null;
    const [x0, x1, y0, y1] = range(camX, camY);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const id = `${cx},${cy}`;
        let c = this.chunks.get(id);
        if (c) { this.chunks.delete(id); this.chunks.set(id, c); } // 挪到最新
        else if (!painted++) c = make(cx, cy);
        if (c) { ctx.drawImage(c, cx * CHUNK - camX, cy * CHUNK - camY, CHUNK, CHUNK); continue; }
        // 这一帧来不及画：先铺荒原（下一帧补上细节）
        if (!fallback) { fallback = ctx.createPattern(this.terrain.moor, 'repeat'); fallback.setTransform(new DOMMatrix().translate(-camX, -camY).scale(this.tk)); }
        ctx.fillStyle = fallback;
        ctx.fillRect(cx * CHUNK - camX, cy * CHUNK - camY, CHUNK, CHUNK);
      }
    }
    // 空闲：提前画镜头要去的地方（离那里最近的一块）
    if (!painted && ahead) {
      const [a0, a1, b0, b1] = range(ahead[0], ahead[1]);
      let best = null, bd = 1e9;
      for (let cy = b0; cy <= b1; cy++) for (let cx = a0; cx <= a1; cx++) {
        if (this.chunks.has(`${cx},${cy}`) || cx < 0 || cy < 0) continue;
        const d = Math.hypot(cx * CHUNK + CHUNK / 2 - (ahead[0] + viewW / 2), cy * CHUNK + CHUNK / 2 - (ahead[1] + viewH / 2));
        if (d < bd) { bd = d; best = [cx, cy]; }
      }
      if (best) make(...best);
    }
    return painted;
  },

  // 地面贴图做成平铺图案（逻辑坐标下的大小）
  pattern(g, t) {
    const p = g.createPattern(this.terrain[t], 'repeat');
    p.setTransform(new DOMMatrix().scale(this.tk));
    return p;
  },
};
