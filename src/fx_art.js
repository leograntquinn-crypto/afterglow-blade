// 手绘特效素材（ART_V5：fx_textures_v1 / fx_hero_v1 / fx_boss_v1，由 tools/build_fx.py 处理成图集）
//
// 每套图集载入后切成一块块小画布（图集本身随后丢掉，内存不会翻倍）。每块记着：
//   cx, cy —— 锚点在这块画布里的位置（素材裁掉了透明边，锚点按原画布换算过来）
//   sc     —— 图集像素相对交付尺寸的比例（桌面贴图 1、手机 0.5；序列帧桌面 0.5、手机 0.25）
// 贴图（fx_tex）和主角 / 通用序列帧（fx_hero）一直载入；首领的两套只在自己那一关载入、离开就释放。
// 素材没载好时，特效系统照常用程序生成的占位贴图。
import { MOBILE } from './sprite.js';

const DIR = 'assets/fx/';

class FxPack {
  constructor(name) {
    this.name = name;
    this.ready = false;
    this.loading = null;
    this.items = {}; // 贴图：id → 画布；序列帧：id → { ...信息, frames: [画布 | null] }
  }
  load() {
    if (this.ready || this.loading || typeof Image === 'undefined') return this.loading;
    this.released = false;
    this.loading = (async () => {
      try {
        const v = MOBILE ? '_m' : '';
        const meta = await fetch(`${DIR}${this.name}${v}.json`).then((r) => (r.ok ? r.json() : null));
        if (!meta) return;
        const atlas = await new Promise((res) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = () => res(null);
          im.src = `${DIR}${this.name}${v}.webp`;
        });
        if (!atlas || this.released) return;
        const cut = (key) => {
          const [x, y] = meta.pos[key], [w, h] = meta.dims[key];
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          c.getContext('2d').drawImage(atlas, x, y, w, h, 0, 0, w, h);
          c.sc = meta.scale;
          return c;
        };
        const items = {};
        for (const [id, t] of Object.entries(meta.tex || {})) {
          const c = cut(id);
          c.cx = t.anchor[0] * t.full[0] - t.off[0];
          c.cy = t.anchor[1] * t.full[1] - t.off[1];
          c.add = t.blend === 'add';
          c.fw = t.full[0]; c.fh = t.full[1]; // 原画布尺寸（锚点之外的位置，比如尘爆的地面线，按它算）
          items[id] = c;
        }
        for (const [id, f] of Object.entries(meta.fb || {})) {
          const ax = f.anchor[0] * f.w, ay = f.anchor[1] * f.h;
          const frames = f.frames.map((fr) => {
            if (!fr) return null;
            const [key, ox, oy] = fr;
            const c = cut(key);
            c.cx = ax - ox;
            c.cy = ay - oy;
            return c;
          });
          items[id] = { id, frames, fps: f.fps, loop: f.loop, add: f.blend === 'add', sc: meta.scale, w: f.w, h: f.h };
        }
        this.items = items;
        this.ready = true;
      } catch {
        this.ready = false;
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }
  release() {
    this.released = true;
    this.ready = false;
    for (const it of Object.values(this.items)) {
      for (const c of it.frames || [it]) if (c) c.width = c.height = 0;
    }
    this.items = {};
  }
}

export const FX_ART = {
  tex: new FxPack('fx_tex'),
  hero: new FxPack('fx_hero'),
  bone: new FxPack('fx_bone'),
  warden: new FxPack('fx_warden'),
};
FX_ART.tex.load();
FX_ART.hero.load();

// 首领专属特效：只载入这一关首领的那套，释放其他的（和首领图集一样，见 enemy_sprites.js 的 prepareBossSprites）
const BOSS_FX = { boneLord: 'bone', warden: 'warden' };
export function prepareBossFx(key) {
  for (const [k, name] of Object.entries(BOSS_FX)) {
    if (k === key) FX_ART[name].load();
    else if (FX_ART[name].ready || FX_ART[name].loading) FX_ART[name].release();
  }
}

// 取一组序列帧（没载好返回 null）
export function flipbook(id) {
  for (const p of [FX_ART.hero, FX_ART.bone, FX_ART.warden]) if (p.ready && p.items[id]) return p.items[id];
  return null;
}
