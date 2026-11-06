// 道具的逐帧素材（ART_V4 ENV-3：env_props_v1）
// 小道具（陶罐、碎片、宝箱、火把台、旗帜）和大道具（泉水、铁栅门）是两张图集，画布和锚点不同。
// scale：相对「2 倍素材的一半」（= 游戏逻辑像素）的缩放，按现有的碰撞体积挑的
import { SpriteSheet } from './sprite.js';
import { afterBoot } from './boot.js';

export const propsS = new SpriteSheet('assets/props/', 'props_s', {}, 128);
export const propsL = new SpriteSheet('assets/props/', 'props_l', {}, 256);
afterBoot(() => { propsS.load(); propsL.load(); }); // 大地图和主角先载（见 boot.js）

export const PROP_SCALE = { urn: 0.42, shards: 0.42, chest: 0.6, sconce: 0.45, banner: 0.75, shrine: 0.45, gate: 0.7 };

// 画一帧：anim 动画名，i 帧号；(sx, sy) 是道具底部中心的屏幕坐标
export function drawProp(ctx, sheet, anim, i, sx, sy, o = {}) {
  if (!sheet.ready) return false;
  sheet.draw(ctx, sheet.frame(anim, i), sx, sy, o.facing ?? 1, { scale: o.scale ?? 1, alpha: o.alpha, flash: o.flash, overlay: o.overlay, overlayAlpha: o.overlayAlpha });
  return true;
}
