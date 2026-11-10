// ★ 特效数据表：调特效就改这里（和 moves.js 一样，代码只负责「按表执行」）
//
// 曲线：粒子一生（0 = 出生，1 = 消失）里某个量的变化，用关键帧描述，启动时预先采样成查找表。
// 发射器：一次喷出多少个、什么类型、寿命、速度、方向、阻力、重力、大小、颜色渐变、混合方式……

// ---------- 曲线 ----------
const N = 32;
function bake(keys) {
  const lut = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    let k = 1;
    while (k < keys.length - 1 && keys[k][0] < t) k++;
    const [t0, v0] = keys[k - 1], [t1, v1] = keys[k];
    const u = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 1;
    lut[i] = v0 + (v1 - v0) * (u * u * (3 - 2 * u)); // 平滑插值，没有折角
  }
  return lut;
}
export const CURVES = {
  one: bake([[0, 1], [1, 1]]),
  fade: bake([[0, 1], [1, 0]]),
  fadeLate: bake([[0, 1], [0.55, 0.9], [1, 0]]), // 前半段保持亮度，后半段才淡出
  pop: bake([[0, 0], [0.08, 1], [0.35, 0.85], [1, 0]]), // 一下子出现，慢慢淡出（烟、光晕）
  flash: bake([[0, 1], [0.15, 0.7], [1, 0]]),
  flicker: bake([[0, 0], [0.1, 1], [0.7, 0.8], [1, 0]]),
  grow: bake([[0, 0.55], [0.4, 0.9], [1, 1.25]]),
  shrink: bake([[0, 1], [0.6, 0.7], [1, 0.15]]),
  burst: bake([[0, 0.3], [0.25, 1.1], [1, 1.35]]), // 迅速撑开再缓慢变大
  swell: bake([[0, 0.4], [0.3, 1], [1, 1.9]]), // 烟：越散越大
};
export const curve = (lut, t) => lut[Math.max(0, Math.min(N, (t * N + 0.5) | 0))];

// ---------- 发射器 ----------
// type：粒子类型（决定怎么动、怎么画）
//   spark 拉长火花（沿速度方向）、ember 余烬（飘、闪烁）、smoke 烟、chip 碎片（重力 + 弹跳）、glow 光团、flare 星芒
// n：个数范围；调用时传入的 n 会覆盖；手机和低画质按比例减少
// speed / spread / angle：速度大小、扩散角（弧度）、基准角（0 = 朝 dir 方向水平，负数 = 向上）
// drag：每帧速度乘数；grav：每帧向下的加速度（负数 = 上飘）
// size：大小（像素）；sizeC / alphaC：大小和透明度随一生的曲线
// ramp：颜色渐变（hot = 白热 → 本色 → 变暗，cool = 偏白 → 本色，flat = 不变）
// blend：add = 叠加发光，normal = 普通遮挡
export const EMIT = {
  // 命中火花：快、短、白热，沿速度拉长
  spark: { type: 'spark', n: [8, 8], life: [8, 16], speed: [6, 14], angle: -0.15, spread: 1.15, drag: 0.8, grav: 0.32, size: [1.6, 3.2], stretch: 2.2, sizeC: 'shrink', alphaC: 'fadeLate', ramp: 'hot', blend: 'add' },
  // 余烬：火花里有一部分不马上熄灭，慢慢飘起、闪烁（这是「质感」的关键：命中后画面里留着一点余韵）
  ember: { type: 'ember', n: [3, 3], life: [22, 42], speed: [1.5, 4.5], angle: -0.6, spread: 1.4, drag: 0.92, grav: -0.04, size: [1.4, 2.6], sizeC: 'shrink', alphaC: 'flicker', ramp: 'hot', blend: 'add', sway: 0.25 },
  // 命中点的一团闪光
  hitGlow: { type: 'glow', n: [1, 1], life: [6, 6], speed: [0, 0], size: [15, 15], sizeC: 'burst', alphaC: 'flash', ramp: 'cool', blend: 'add', alpha: 0.5 },
  // 尘土：烟团贴图，普通混合，上飘、扩散、慢慢转
  dust: { type: 'smoke', n: [6, 6], life: [18, 30], speed: [0.8, 2.8], angle: -0.5, spread: 1.6, drag: 0.9, grav: -0.03, size: [8, 13], sizeC: 'swell', alphaC: 'pop', ramp: 'flat', color: '#b8aa9a', blend: 'normal', alpha: 0.42, spin: 0.03 },
  // 碎片：受重力、落地弹跳翻滚
  chip: { type: 'chip', n: [4, 4], life: [40, 70], speed: [2, 7], angle: -0.9, spread: 0.9, drag: 0.985, grav: 0.45, size: [5, 9], sizeC: 'one', alphaC: 'fadeLate', ramp: 'flat', blend: 'normal', spin: 0.5, bounce: 0.35 },
  // 碎片落地时溅起的一点灰
  puff: { type: 'smoke', n: [1, 1], life: [14, 20], speed: [0.3, 0.8], angle: -1.57, spread: 1, drag: 0.9, grav: -0.02, size: [5, 8], sizeC: 'swell', alphaC: 'pop', ramp: 'flat', color: '#a89a8c', blend: 'normal', alpha: 0.35, spin: 0.02 },
  // 蓄力汇聚的光点（往中心加速吸入，带拖尾）
  mote: { type: 'mote', n: [10, 10], life: [18, 18], size: [2.4, 3.6], sizeC: 'grow', alphaC: 'pop', ramp: 'cool', blend: 'add' },
};

// 命中的余波：击杀时魂火往上散（比余烬大、慢、偏冷色）
EMIT.soul = { type: 'ember', n: [12, 12], life: [40, 70], speed: [0.8, 2.6], angle: -1.57, spread: 0.7, drag: 0.96, grav: -0.06, size: [2, 3.6], sizeC: 'shrink', alphaC: 'flicker', ramp: 'cool', blend: 'add', sway: 0.35 };
// 刀光挥动时从刀尖甩出的细碎光点
EMIT.trailMote = { type: 'ember', n: [1, 1], life: [14, 26], speed: [0.4, 1.6], angle: -0.4, spread: 1.6, drag: 0.9, grav: -0.03, size: [1.2, 2.2], sizeC: 'shrink', alphaC: 'flicker', ramp: 'hot', blend: 'add', sway: 0.15 };

// ---------- 受击分级 ----------
// 同一个命中处理，按这一击的分量挑一档表现：轻击 < 暴击 < 重击 < 破招 / 破防 < 击杀
// spark 火花数、ember 余烬比例、ringGrow / ringW 冲击环、cut / cutW 斩痕长度和粗细、flare 星芒大小、
// lines 冲击线条数、chips 碎片数、light 命中光半径、stop 额外顿帧、kick 镜头后坐、soul 击杀魂火
export const HIT_TIERS = {
  light: { shock: 0, chroma: 0, spark: 8, ringGrow: 4, ringW: 3, cut: 110, cutW: 1, flare: 0, lines: 0, chips: 4, light: 180, stop: 0, kick: 0 },
  crit: { shock: 0, chroma: 0.004, spark: 11, ringGrow: 6, ringW: 4, cut: 140, cutW: 1.2, flare: 0.55, lines: 6, chips: 6, light: 240, stop: 0, kick: 4, accent: '#ffd65a' },
  heavy: { shock: 0.012, chroma: 0.005, spark: 14, ringGrow: 7, ringW: 5, cut: 170, cutW: 1.35, flare: 0.75, lines: 8, chips: 9, light: 280, stop: 0, kick: 9 },
  break: { shock: 0.02, chroma: 0.009, spark: 18, ringGrow: 9, ringW: 6, cut: 200, cutW: 1.6, flare: 1.1, lines: 14, chips: 12, light: 340, stop: 2, kick: 12, accent: '#ffb347' },
  kill: { shock: 0.012, chroma: 0.005, spark: 16, ringGrow: 8, ringW: 5, cut: 190, cutW: 1.5, flare: 0.9, lines: 10, chips: 12, light: 320, stop: 3, kick: 10, soul: true },
};

// ---------- 技能演出与首领 ----------
// 余韵：技能打完后，残光慢慢从地面升起、飘散（「残光」这个名字的由来）
EMIT.afterglow = { type: 'ember', n: [6, 6], life: [60, 110], speed: [0.3, 1.2], angle: -1.57, spread: 1.2, drag: 0.97, grav: -0.035, size: [1.6, 3], sizeC: 'shrink', alphaC: 'flicker', ramp: 'cool', blend: 'add', sway: 0.4 };
// 首领身上不断往上飘的气（阶段越高越密）
EMIT.aura = { type: 'ember', n: [1, 1], life: [30, 50], speed: [0.4, 1.2], angle: -1.57, spread: 0.5, drag: 0.97, grav: -0.05, size: [1.6, 3], sizeC: 'shrink', alphaC: 'flicker', ramp: 'cool', blend: 'add', sway: 0.3 };
// 倒下的敌人化成光点消散
EMIT.dissolve = { type: 'ember', n: [2, 2], life: [24, 44], speed: [0.3, 1.4], angle: -1.57, spread: 1, drag: 0.95, grav: -0.06, size: [1.4, 2.8], sizeC: 'shrink', alphaC: 'flicker', ramp: 'cool', blend: 'add', sway: 0.3 };

// ---------- 手绘序列帧（FX-2 / FX-3）----------
// 每组在游戏里画多大：游戏逻辑像素 / 交付像素（交付尺寸见 docs/ART_FX.md 第六、七节）
export const FB_SCALE = {
  slash_sweep: 0.42, slash_rise: 0.4, slash_down: 0.42, slash_spin: 0.44, slash_cross: 0.48,
  hit_light: 0.45, hit_heavy: 0.55, hit_break: 0.5, impact_ground: 0.75, burst_energy: 0.6, smoke_roll: 0.5, afterglow_burst: 1.0,
  bone_spikes: 0.62, bone_rend: 0.5, soul_fire: 0.22, summon_circle: 0.75,
};
// 普攻和技能出刀时叠在程序刀光带上的手绘刀光：[序列帧, 上下翻转, 大小倍数]
export const SLASH_FX = {
  slash1: ['slash_sweep', 1, 1], slash2: ['slash_sweep', -1, 1], slash3: ['slash_down', 1, 1.15],
  upper: ['slash_rise', 1, 1], airSlash: ['slash_sweep', 1, 0.95], airSlash2: ['slash_sweep', -1, 0.95], airSlash3: ['slash_down', 1, 1.1],
  sweep: ['slash_sweep', -1, 1], chargeSlash1: ['slash_down', 1, 1.15], chargeSlash2: ['slash_down', 1, 1.3],
  wave: ['slash_down', 1, 1.1], quake: ['slash_down', 1, 1.25],
};
// 受击分级用哪组命中爆点
export const HIT_FB = { light: ['hit_light', 1], crit: ['hit_light', 1.35], heavy: ['hit_heavy', 1], break: ['hit_break', 1], kill: ['hit_heavy', 1.15] };

// ---------- 敌人特效（fx_enemy_v1，docs/ART_FX_ENEMY_V1.md）----------
// 第 1 批（共用）：状态光、弓手的瞄准线和箭、地面预警、词缀、司祭。怎么画见 enemy_fx.js。
// 素材没载好（载入失败）时这些地方退回原来代码画的样子：预警是玩法信息，不能因为素材没到就不画。
// passes：叠画几遍（素材本身偏淡、又是重要的玩法提示时加亮）。
// 大小：身上的东西按「素材 ÷ 身高 260 的人」× 敌人身高缩放（size 是再乘的倍数）；地面 / 箭这类按游戏逻辑像素给（k = 逻辑像素 / 交付像素）
export const ENEMY_FX = {
  // 状态光（画在敌人身后，锚点对脚底）。三种形状 = 三种意思：threat 要出手 / feint 假动作 / guard 在防或有霸体
  aura: {
    threat: { fb: 'aura_threat', color: '#ff2a2a', alpha: 0.95, size: 1.05 }, // 出招预警
    feint: { fb: 'aura_feint', color: '#ffb347', alpha: 1, size: 1.1, passes: 2 }, // 佯攻露出破绽
    guard: { fb: 'aura_guard', color: '#9fd0ff', alpha: 1, size: 1.15, passes: 2 }, // 屠夫举斧格挡
    armor: { fb: 'aura_guard', color: '#ffb347', alpha: 0.7 }, // 霸体（余烬橙）
    blink: { fb: 'aura_guard', color: '#c48bff', alpha: 1, size: 1.15, passes: 2 }, // 迅影闪现后
    frenzy: { fb: 'aura_threat', color: '#ff5a3c', alpha: 0.55 }, // 狂暴
    elite: { fb: 'aura_guard', color: '#ffd65a', alpha: 0.55 }, // 精英（另外叠冠光 crown）
    bossThreat: { fb: 'aura_threat', color: '#ff2a2a', alpha: 0.95 }, // 首领出招
    bossIdle: { fb: 'aura_guard', color: null, alpha: 0.4, phase: 0.15 }, // 首领平时（color null = 首领自己的颜色 / 余烬橙）；每个阶段亮 phase
  },
  crown: { fb: 'elite_crown', color: '#ffd65a', alpha: 1 }, // 精英：肩头往上的冠光，叠在身体前面
  blink: { fb: 'blink_flash', color: '#c48bff' }, // 迅影瞬移：离开和出现的地方各播一次
  volatile: { fb: 'volatile_core', color: '#ffb347', size: 0.36, z: 0.55, alpha: 0.85 }, // 爆裂：胸口的不稳定核（size × 身高 = 画多大）
  shield: { fb: 'shield_arc', color: '#8fc4ff', size: 0.8, x: 0.5, alpha: 0.7 }, // 坚盾：按剩余格挡次数选帧（第 0 帧完整）
  ward: { fb: 'ward_shell', brk: 'ward_break', color: '#cfc8ff', size: 1.3, alpha: 0.85 }, // 司祭的咒盾（灰白偏冷）：size × 身高 = 壳多高
  trap: { draw: 'trap_draw', rune: 'trap_rune', size: 2.3, alpha: 1, passes: 2 }, // 陷阱符：先画出来再循环；size × rx = 符阵宽
  // 地面预警圈：环（越临近爆发播得越快）+ 从中心往外放大的填充光 + 爆发闪光。屠夫佯攻露出破绽后换成断开的环（琥珀）
  warn: { ring: 'warn_ring', fake: 'warn_ring_fake', fill: 'warn_fill', flash: 'warn_flash', color: '#ff4636', fakeColor: '#ffb347', fillColor: '#ff3a2e', speedUp: 1.5, fakePasses: 3, fakeFill: 0.6, ringR: [210, 98], fillR: [189, 87] }, // ringR / fillR：素材里环 / 填充光的半径（交付像素）
  meteor: { fb: 'meteor', k: 0.5 },
  lane: { tex: 'lane_band', h: 1.3, scroll: 3, alpha: 1.6 }, // 冲锋 / 齐射路线光带：光带可见的高 = half × h；scroll 每帧往前滚多少逻辑像素
  aim: { tex: 'aim_line', mark: 'aim_mark', color: '#ff4a3a', k: 0.7, markK: 0.5, scroll: 4 }, // 弓手瞄准线：沿路线平铺、往前流
  threatBack: { tex: 'threat_back', color: '#ff3b3b', k: 0.5 }, // 背后来袭
  // 烬翼俯冲的火星拖尾（第 2 批唯一的贴图）：len × 身高 = 多长，thick 粗细倍数；假冲琥珀色
  emberTrail: { tex: 'ember_trail', len: 3.4, thick: 1, alpha: 0.95, color: '#ff7a3a', fakeColor: '#ffb347' },
  arrow: { tex: 'arrow', trail: 'arrow_trail', brk: 'arrow_break', k: 0.5, trailColor: '#ff5a7a', trailAt: -12, brkColor: '#e6dccb', brkK: 0.42 },
};

// 第 2 批（各敌人自己的出招 / 命中 / 死亡，fx_enemy_v1_types）：按敌人（look.rig）查 tele 预警 / attack 出招 / hit 挨打 / death 死亡 →
//   fb 素材 id、color 染色（带颜色的实物给 null）、size（× 身高 / 260）、x 往前偏移（× 身高）、z 高度（× 身高）、
//   follow 跟着敌人走、attached 跟着状态每帧画（预警期间一直在，佯攻露出破绽换 feintColor）、hold 一次性的播完在最后一帧停多久再淡出
// 用在：tele 出招预警开始；attack 出手那一下（替代通用的新月刀光）；hit 挨打的那一点（替代通用的材质碎片）；
//   death 尸体落地（替代通用的消散光点和碎片）。没有这一项、或素材没载好时，照旧用通用的
// 弓手的预警 / 出招就是瞄准线和箭（第 1 批）；烬翼的出招是俯冲拖尾 ember_trail（ENEMY_FX.emberTrail）
export const ENEMY_TYPE_FX = {
  grunt: {
    tele: { fb: 'grunt_glint', color: '#ff6a4a', size: 0.8, x: 0.35, z: 0.62, follow: true },
    attack: { fb: 'grunt_slash', color: '#d8794a', size: 1.3, x: 0.3, z: 0.5, follow: true },
    hit: { fb: 'bone_chips', color: null, size: 0.9, z: 0.55 },
    death: { fb: 'bone_collapse', color: null, size: 1.1, hold: 50 },
  },
  brute: {
    tele: { fb: 'brute_heat', color: '#ff5a2a', feintColor: '#ffb347', size: 0.6, x: 0.4, z: 1.1, attached: true },
    attack: { fb: 'brute_cleave', color: '#ffb070', size: 0.95, x: 0.35, z: 0.5, follow: true },
    hit: { fb: 'metal_spark', color: '#ffe0a0', size: 0.9, z: 0.6 },
    death: { fb: 'armor_fall', color: null, size: 1, hold: 50 },
  },
  archer: { death: { fb: 'shadow_fade', color: '#8a5cff', size: 1 } },
  priest: {
    tele: { fb: 'lantern_flare', color: '#ece6d8', size: 0.8, x: 0.3, z: 1.0, follow: true },
    hit: { fb: 'rune_shatter', color: '#cfc8ff', size: 0.9, z: 0.6 },
    death: { fb: 'candle_smoke', color: '#bfc4cc', size: 1 },
  },
  wing: {
    tele: { fb: 'ember_crack', color: '#ff3a2e', feintColor: '#ffb347', size: 2.4, z: 0.5, attached: true },
    hit: { fb: 'ember_pop', color: '#ffb347', size: 2.4, z: 0.5 },
    death: { fb: 'ash_fall', color: '#8a8580', size: 3.2 },
  },
};

// ---------- 首领专属特效（画法见 boss_fx.js）----------
export const BOSS_FX = {
  warden: {
    colors: ['#ffb347', '#6fe38a', '#d6ffe0'],
    flame: { fb: 'warden_flame', size: 1, speed: 1.6, jumpInterval: [20, 40], jumpAlpha: 1.8, alpha: 0.75 },
    brazier: { fb: 'brazier', k: 0.42, mouth: 38, shake: 4 },
    brazierFlame: { fb: 'brazier_flame', k: 0.42 },
    break: { fb: 'brazier_break', k: 0.42 },
    lane: { tex: 'fire_lane', height: 2, scroll: 3, alpha: 1 },
    sweep: { fb: 'judgment_sweep', size: 1, width: 512, anchorX: 0.15 },
    ignite: { fb: 'phase_ignite', size: 1.2 },
    gather: { fb: 'inferno_gather', size: 1 },
    burst: { fb: 'inferno_burst', size: 1.4 },
    groundDeath: { fb: 'warden_death', size: 1.2 },
  },
  boneLord: {
    cage: { fb: 'cage_tighten', color: '#ff5a3c', width: 512, shrink: 0.6 },
    tether: { tex: 'marrow_tether', color: '#ff5a3c', height: 6, scroll: 1.5 },
    drag: { fb: 'drag_sparks', color: '#ff5a3c', size: 1, x: 0.55, rendTail: 40 },
    shard: { fb: 'shard_return', size: 0.45, count: [3, 5], scatter: 18, pause: 45, back: 24, // pause：落地停留，可以踩碎（身份机制，boss_identity.js）
      chest: 0.6, land: 95, hop: 40, arc: 45, trail: 0.2, light: 16 }, // land：落点离首领多远；hop：飞散时抛起的高度 // light：每枚骨片的补光半径 rx（光照按 rx × 1.5 画）
    reform: { fb: 'bone_reform', size: 1 },
    sigil: { tex: 'bone_sigil', color: '#ff5a3c', spin: 0.004 },
    glow: { fb: 'marrow_glow', color: '#ff5a3c', size: 1 },
    burst: { fb: 'bone_call_burst', color: '#ff5a3c', size: 1.4 },
    rise: { fb: 'summon_rise', size: 0.8 },
    groundDeath: { fb: 'bonelord_death', color: '#ffffff', size: 1.2, hold: 120 },
  },
  afterimage: {
    slash: { fb: 'rev_slash', size: 1, z: 0.62 },
    spin: { fb: 'rev_slash', size: 1.3, z: 0.54, turn: Math.PI / 40 },
    wave: { fb: 'rev_wave', k: 0.57, x: -40, z: 50 },
    out: { fb: 'shadow_step_out', size: 1 },
    appear: { fb: 'shadow_step_in', size: 1 },
    sigil: { tex: 'mirror_sigil', size: 0.6, z: 1.35 },
    route: { tex: 'streak_line', height: 14, scroll: 3, alpha: 0.8, fallback: { color: '#ff4d5e', alpha: 0.9 } }, // fallback：残影包没载好时借敌人路线光带 lane_band（可见高约 64 里的 33）
    vertex: { fb: 'exec_mark', k: 0.35 },
    dash: { fb: 'exec_dash', k: 0.5, width: 384, z: 50 },
    read: { fb: 'habit_read', size: 1, z: 0.8 },
    gather: { fb: 'reversal_gather', size: 1 },
    burst: { fb: 'reversal_burst', size: 1.4, z: 0.5 },
    groundDeath: { fb: 'afterimage_death', color: '#b46bff', size: 1.2, towardHero: true },
  },
  nightRaven: {
    feather: { fb: 'feather_blade_spin', trail: 'feather_trail', k: 0.42, trailColor: '#ff4dd2' },   // 回旋羽：k = 逻辑像素 / 交付像素
    burst: { fb: 'feather_burst', color: '#ff4dd2', size: 1 },      // 化作黑羽（size × 身高 / 260）
    appear: { fb: 'raven_appear', color: '#ff4dd2', size: 1 },      // 浮现
    wisps: { fb: 'split_wisps', color: '#c070ff', size: 1, alpha: 0.8 },
    arrow: { tex: 'raven_arrow', k: 0.5, trailColor: '#ff4dd2' },
    glint: { fb: 'bow_glint', color: '#ff4dd2', size: 0.6, x: 0.35, z: 0.62 }, // 弓上闪光的位置（× 身高）
    rain: { fb: 'arrow_rain', impact: 'rain_impact', color: '#ff4dd2', k: 0.45 },
    sigil: { tex: 'raven_sigil', color: '#ff4dd2', spin: 0.004 },
    gather: { fb: 'channel_gather', color: '#ff4dd2', size: 1 },
    veil: { tex: 'night_veil' },                                     // H-2 只做读条结束的一闪；第二阶段常驻压暗是机制，我来做
    death: { fb: 'raven_death', color: '#ff4dd2', size: 1.2 },
  },
  ironJaw: {
    chain: { tex: 'chain_glow', color: '#ff7a2e', height: 10, alpha: 0.82 },
    hook: { fb: 'hook_spark', color: '#ff7a2e', k: 0.5 },
    drag: { fb: 'chain_drag', color: '#ff7a2e', k: 0.55 },
    cleave: { fb: 'heavy_cleave', color: '#ff7a2e', k: 0.58, x: 0.12, z: 0.62 },
    quake: { fb: 'stomp_quake', color: '#ff7a2e', k: 0.52 }, // 素材已按地面透视压扁（2:1），不要 ground（粒子的 ground 会再压到 0.32）
    wave: { fb: 'stomp_wave', color: '#ff7a2e', k: 0.48 },
    stompScales: [1, 1.2, 1.5],
    charge: { fb: 'charge_sparks', color: '#ff7a2e', k: 0.56 },
    mark: { tex: 'execution_mark', color: '#ff7a2e', rise: 0.3, alpha: 0.6 },
    platform: { color: '#ff7a2e', alpha: 0.45, pulse: 0.2, speed: 0.05 }, // 刑台（身份机制）：借处刑印记常驻地面，偏暗、慢呼吸
    glint: { fb: 'headsman_glint', color: '#e1eeff', k: 0.43, x: 0.28, z: 1.03 },
    drop: { fb: 'execution_drop', color: '#ff7a2e', k: 0.80, alpha: 0.72 },
    chainBreak: { fb: 'chain_break', color: '#ff7a2e', k: 0.64 },
    groundDeath: { fb: 'ironjaw_death', color: '#ff7a2e', size: 1.2 },
  },
};
