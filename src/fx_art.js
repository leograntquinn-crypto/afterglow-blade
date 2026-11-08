// 手绘特效素材（ART_V5：fx_textures_v1 / fx_hero_v1 / fx_boss_v1，由 tools/build_fx.py 处理成图集）
//
// 每套图集载入后切成一块块小画布（图集本身随后丢掉，内存不会翻倍）。每块记着：
//   cx, cy —— 锚点在这块画布里的位置（素材裁掉了透明边，锚点按原画布换算过来）
//   sc     —— 图集像素相对交付尺寸的比例（桌面贴图 1、手机 0.5；序列帧桌面 0.5、手机 0.25）
// 贴图（fx_tex）和主角 / 通用序列帧（fx_hero）一直载入；首领的特效只在自己那一关载入、离开就释放。
// 素材没载好时：烟、碎片、地裂、冲击环、星芒照常用程序生成的占位贴图；光照包里的东西（光晕、火花、光照、暗角……）不画。
import { afterBoot } from './boot.js';
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
        const cut = (key, sc = meta.scale) => {
          const [x, y] = meta.pos[key], [w, h] = meta.dims[key];
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          c.getContext('2d').drawImage(atlas, x, y, w, h, 0, 0, w, h);
          c.sc = sc;
          return c;
        };
        const items = {};
        for (const [id, t] of Object.entries(meta.tex || {})) {
          const c = cut(id, meta.texScale ?? meta.scale);
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
  raven: new FxPack('fx_boss_raven'),
  ironjaw: new FxPack('fx_boss_ironjaw'),
  afterimage: new FxPack('fx_boss_afterimage'),
  // 刀光包 fx_blade_v1（docs/ART_FX_BLADE_V1.md）：条带贴图（拖尾、新月刀光）+ 重画的五组刀光序列帧和剑气。一直载入
  bladeTex: new FxPack('fx_blade_tex'),
  blade: new FxPack('fx_blade'),
  // 光照包 fx_light_v1（docs/ART_FX_LIGHT_V1.md）：光晕 / 火花 / 斩痕 / 光点、光照 cookie、暗角 / 压暗 / 颗粒 / 暗雾、门 / 宝箱 / 泉水光，
  // 和两组序列帧（火光 cookie、掉落光柱）。大地图也要用（光照、光点、封印暗雾），所以一启动就载（两套合计约 180KB）
  light: new FxPack('fx_light_tex'),
  lightFb: new FxPack('fx_light'),
  // 敌人特效包第 1 批 fx_enemy_v1_common（docs/ART_FX_ENEMY_V1.md）：瞄准线、箭、地面光带等 7 张贴图 + 状态光、地面预警、词缀、司祭 16 组序列帧。
  // 每一关都用得到，一直载入（第 2 批 fx_enemy_v1_types 到了以后按关卡里有的敌人载入）
  enemyTex: new FxPack('fx_enemy_tex'),
  enemy: new FxPack('fx_enemy'),
  // 第 2 批 fx_enemy_v1_types：五种杂兵各自的预警 / 出招 / 命中 / 死亡，每种一套，按关卡里出现的敌人载入（prepareEnemyFx）。
  // 第 2 批唯一的贴图 ember_trail（烬翼俯冲拖尾）在 fx_enemy_tex 里
  enemyType: Object.fromEntries(['grunt', 'brute', 'archer', 'priest', 'wing'].map((k) => [k, new FxPack(`fx_enemy_${k}`)])),
};
FX_ART.light.load();
FX_ART.lightFb.load();
// 光照包的一张贴图 / 一组序列帧（没载好返回 null：这时不画，不用代码画的替身）
export const lightTex = (id) => (FX_ART.light.ready && FX_ART.light.items[id]) || null;
export const lightFb = (id) => (FX_ART.lightFb.ready && FX_ART.lightFb.items[id]) || null;
// 敌人特效包的一张贴图 / 一组序列帧（没载好返回 null）
export const enemyTex = (id) => (FX_ART.enemyTex.ready && FX_ART.enemyTex.items[id]) || null;
export const enemyFb = (id) => (FX_ART.enemy.ready && FX_ART.enemy.items[id]) || null;
afterBoot(() => { FX_ART.tex.load(); FX_ART.hero.load(); FX_ART.bladeTex.load(); FX_ART.blade.load(); FX_ART.enemyTex.load(); FX_ART.enemy.load(); }); // 大地图和主角先载（见 boot.js）

// 首领专属特效：只载入这一关首领的那套，释放其他的（和首领图集一样，见 enemy_sprites.js 的 prepareBossSprites）
const BOSS_FX = { boneLord: 'bone', nightRaven: 'raven', ironJaw: 'ironjaw', warden: 'warden', afterimage: 'afterimage' };
export function prepareBossFx(key) {
  for (const [k, name] of Object.entries(BOSS_FX)) {
    if (k === key) FX_ART[name].load();
    else if (FX_ART[name].ready || FX_ART[name].loading) FX_ART[name].release();
  }
}

// 首领特效包的一张贴图（混合图集里的序列帧用 flipbook 取）
export function bossTex(packName, id) {
  const pack = FX_ART[packName];
  if (!pack?.ready || !Object.hasOwn(pack.items, id)) return null;
  const item = pack.items[id];
  return item.frames ? null : item;
}

// 敌人各自的特效：只载入这一关出现的敌人那几套，释放其他的（和 enemy_sprites.js 的 prepareEnemySprites 同一时机）。types 用敌人类型名
export function prepareEnemyFx(types) {
  const need = new Set(types);
  for (const [k, pack] of Object.entries(FX_ART.enemyType)) {
    if (need.has(k)) pack.load();
    else if (pack.ready || pack.loading) pack.release();
  }
}
// 某种敌人自己的一组序列帧（没载好返回 null）
export const enemyTypeFb = (rig, id) => (FX_ART.enemyType[rig]?.ready && FX_ART.enemyType[rig].items[id]) || null;

// 取一组序列帧（没载好返回 null）
export function flipbook(id) {
  // 刀光包排在最前：它的五组刀光覆盖 fx_hero 里的旧组（fx_hero 打包时已经不含这几组）
  for (const p of [FX_ART.blade, FX_ART.hero, FX_ART.bone, FX_ART.warden, FX_ART.raven, FX_ART.ironjaw, FX_ART.afterimage, FX_ART.enemy, ...Object.values(FX_ART.enemyType)]) if (p.ready && p.items[id]?.frames) return p.items[id];
  return null;
}
