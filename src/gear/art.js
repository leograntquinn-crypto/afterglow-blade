// E1 与特效图集同目录、同手机判定；只由角色页发起载入，进战斗清空引用。
import { MOBILE } from '../sprite.js';
import { CATALOG } from './catalog.js';
const DIR = 'assets/fx/';
const loadImage = (file) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`装备图集载入失败：${file}`));
  image.src = DIR + file;
});
export const GEAR_ART = {
  ready: false, loading: null, generation: 0, pages: [], frames: {}, meta: null,
  load() {
    if (this.ready) return Promise.resolve(true);
    if (this.loading) return this.loading;
    const generation = this.generation;
    const task = (async () => {
      try {
        const response = await fetch(`${DIR}gear_icons${MOBILE ? '_m' : ''}.json`);
        if (!response.ok) return false;
        const meta = await response.json();
        const [pages, frames] = await Promise.all([
          Promise.all(meta.pages.map(page => loadImage(page.file))),
          Promise.all(Object.values(meta.frames).map(loadImage)),
        ]);
        if (generation !== this.generation) return false;
        Object.assign(this, {meta, pages, frames: Object.fromEntries(Object.keys(meta.frames).map((key, i) => [key, frames[i]])), ready: true});
        return true;
      } catch { return false; }
      finally { if (generation === this.generation) this.loading = null; }
    })();
    this.loading = task;
    return task;
  },
  release() {
    this.generation++;
    // 隐藏的角色页仍持有CSS图集引用，进入关卡时一并清空图标，允许解码图像释放。
    for (const node of document.querySelectorAll('[data-gear-icon]')) node.replaceWith(document.createTextNode(''));
    Object.assign(this, {ready: false, loading: null, pages: [], frames: {}, meta: null});
  },
  entry(it) {
    const key = CATALOG[it?.def]?.art?.icon;
    const pos = this.ready && this.meta.items[key];
    return pos && this.frames[it.rar] ? pos : null;
  },
};
// 图标与底板都铺满 glyph：图集每个 cell 映射为完整格子（100%，不留缩小边距）。
export function gearGlyph(it) {
  const pos = GEAR_ART.entry(it);
  if (!pos) {
    if (!it) return '';
    // 未就绪时保持空白；图集已就绪的缺图装备只显示稀有度框。
    if (!GEAR_ART.ready) return '';
    const frame = GEAR_ART.frames[it.rar] && GEAR_ART.meta.frames[it.rar];
    return frame ? `<span data-gear-icon data-gear-frame data-gear-glyph="" aria-hidden="true" style="display:inline-block;width:100%;height:100%;background-image:url('${DIR}${frame}');background-size:100% 100%;background-position:center;background-repeat:no-repeat"></span>` : '';
  }
  const [page, x, y] = pos, meta = GEAR_ART.meta, cell = meta.cell;
  const {file, width, height} = meta.pages[page];
  const px = width === cell ? 0 : x / (width - cell) * 100;
  const py = height === cell ? 0 : y / (height - cell) * 100;
  return `<span data-gear-icon data-gear-glyph="" aria-hidden="true" style="display:inline-block;width:100%;height:100%;background-image:url('${DIR}${file}'),url('${DIR}${meta.frames[it.rar]}');background-size:${width / cell * 100}% ${height / cell * 100}%,100% 100%;background-position:${px}% ${py}%,center;background-repeat:no-repeat"></span>`;
}
export function drawGearIcon(ctx, it, x, y, size) {
  const pos = GEAR_ART.entry(it);
  if (!pos) return false;
  const [page, sx, sy] = pos, cell = GEAR_ART.meta.cell;
  ctx.drawImage(GEAR_ART.frames[it.rar], x, y, size, size);
  ctx.drawImage(GEAR_ART.pages[page], sx, sy, cell, cell, x, y, size, size);
  return true;
}
