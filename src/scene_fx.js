// 场景特效包 fx_scene_v1（docs/ART_FX_SCENE_V1.md）：参数集中在这里，调用方只传位置和状态。
import { flipbook, sceneTex } from './fx_art.js';
import { tinted } from './fx_tex.js';

const SCENE_FX = {
  torch: {
    base: 'torch_glow_base', flame: 'torch_flame', baseSize: 24, flameWidth: 24,
    baseAlpha: 0.72, flameAlpha: 0.92, phaseStep: 3,
  },
  stairs: {
    tex: 'stairs_down', glow: 'stairs_glow', width: 210, // 画布宽；台阶本身约占 0.6，和原来梯形开口差不多
    lockedColor: '#ff4d5e', openColor: '#7ff3ff', alpha: 0.6, pulse: 0.5, glowPasses: 2, // 封着 / 可走是玩法信息：沿口光要一眼看得出红 / 青
  },
  runes: { tex: 'trial_runes', color: '#7ff3ff', alpha: 0.8, breathSpeed: 0.024, breathDepth: 0.1 },
};

// 裁掉的透明边已经算进 cx / cy。sx / sy 是图集像素换到逻辑像素的比例。
function put(ctx, img, x, y, sx, sy, alpha, color = null) {
  ctx.save();
  ctx.globalCompositeOperation = color ? 'lighter' : 'source-over';
  ctx.globalAlpha *= alpha;
  ctx.drawImage(color ? tinted(img, color) : img,
    x - img.cx * sx, y - img.cy * sy, img.width * sx, img.height * sy);
  ctx.restore();
}

export function drawSceneTorch(ctx, x, y, t, phase, fl, color) {
  const T = SCENE_FX.torch, base = sceneTex(T.base), fb = flipbook(T.flame);
  if (!base || !fb?.frames.length) return false;
  // t 是 60 帧/秒的游戏时钟，phase 是固定的火把序号（墙砖左侧也可以为负）。
  const n = fb.frames.length, frame = Math.floor(t * fb.fps / 60) + phase * T.phaseStep;
  const flame = fb.frames[((frame % n) + n) % n];
  if (!flame) return false;
  const d = T.baseSize * fl, k = T.flameWidth * fl / fb.w;
  put(ctx, base, x, y, d / base.fw, d / base.fh, T.baseAlpha, color);
  put(ctx, flame, x, y, k, k, T.flameAlpha, color);
  return true;
}

export function drawSceneStairs(ctx, x, y, open, pulse) {
  const S = SCENE_FX.stairs, stairs = sceneTex(S.tex), glow = sceneTex(S.glow);
  if (!stairs || !glow) return false;
  // 两张原画布一样大，使用同一个比例和顶边中点，台阶沿口的光不会移位。
  const k = S.width / stairs.fw;
  put(ctx, stairs, x, y, k, k, 1);
  const a = Math.min(1, S.alpha + S.pulse * pulse), c = open ? S.openColor : S.lockedColor;
  for (let i = 0; i < S.glowPasses; i++) put(ctx, glow, x, y, k, k, a, c);
  return true;
}

export function drawSceneRunes(ctx, x, y, t, [r0, step, w], alpha) {
  const R = SCENE_FX.runes, img = sceneTex(R.tex);
  if (!img) return false;
  const breath = 1 - R.breathDepth * (0.5 + 0.5 * Math.sin(t * R.breathSpeed));
  put(ctx, img, x, y + r0 + 1.5 * step, 2 * w / img.fw, (4 * step + 8) / img.fh,
    alpha * R.alpha * breath, R.color);
  return true;
}
