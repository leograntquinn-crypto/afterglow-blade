// 第 9 项首领身份机制（src/boss_identity.js）：铁颚刑台、守护者借火 / 火焰失控、骸骨拼合、残影看穿。
// 推进真实招式和真实的 Boss.update，只在需要的地方直接设状态（阶段、霸体、技能计数）。
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765;
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };

async function exercise() {
  const g = __game;
  const { FX_ART } = await import('./src/fx_art.js');
  const { Boss, BOSSES } = await import('./src/boss.js');
  const { Brazier } = await import('./src/boss_moves.js');
  const { boneShards } = await import('./src/boss_fx.js');
  const { DEPTH, world } = await import('./src/config.js');
  const ID = await import('./src/boss_identity.js');
  const { BOSS_FX } = await import('./src/fx_data.js');
  const I = ID.IDENTITY, out = {};
  // 每次进关卡都会新建主角对象：pl 必须在 enter 之后重新取
  let pl = g.player;
  const enter = (n) => { g.story.clear(); g.startStage(n, 0, false); g.story.clear(); pl = g.player; };
  const wait = async (fn) => { for (let i = 0; i < 100 && !fn(); i++) await new Promise(r => setTimeout(r, 100)); return !!fn(); };
  const step = (n = 1) => { for (let i = 0; i < n; i++) { g.hitstop = 0; g.update(); } };
  const until = (find, limit, label) => {
    for (let i = 0; i <= limit; i++) { const f = find(); if (f) return f; if (i < limit) step(); }
    throw new Error(label + ' 未在 ' + limit + ' 帧内出现');
  };
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const check = (key, fn) => { try { out[key] = fn(); } catch (e) { out[key] = { ok: false, error: e.message }; } };
  function scene(key, move, { vulnerable = false, px = 600 } = {}) {
    g.bossDownAt = null; g.waveClearAt = null; g.room.cleared = false;
    g.spawnQueue = []; g.hazards = []; g.projectiles = []; g.loots = []; g.attackers.clear();
    g.terrain = null; g.banner = null; g.witch = 0; g.fx.live.length = 0;
    pl.setState('idle');
    Object.assign(pl, { x: px, y: 90, z: 0, vx: 0, vy: 0, vz: 0, hp: pl.maxHp, invuln: vulnerable ? 0 : 1e9 });
    const b = new Boss(key, 850, 90, g, g.stage.lv);
    b.setState('idle'); b.restT = 1e9; b.facing = -1;
    g.enemies = [b]; g.boss = b;
    if (move) b.startAct(move);
    return b;
  }
  const random = Math.random;
  let seed = 7;
  Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  try {
    // ---------- 铁颚 ----------
    enter(2); for (let i = 0; i < 20; i++) step();
    check('ijTable', () => {
      const combo = BOSSES.ironJaw.phases.filter((ph) => 'combo' in ph.attacks).length;
      return { ok: combo === 0, combo };
    });
    check('ijPlatform', () => {
      const b = scene('ironJaw'); step();
      const P = b.platform, placed = !!P && P.x === world.w / 2 && P.y === DEPTH / 2 && g.hazards.includes(P);
      g.hazards = []; step();
      const restored = g.hazards.includes(P);
      return { ok: placed && restored, placed, restored };
    });
    check('ijHook', () => {
      const b = scene('ironJaw', 'chainHook', { vulnerable: true });
      until(() => b.act?.d.pulled, 120, '锁链钩命中'); // 前摇约 36 帧 + 钩子飞行
      pl.invuln = 1e9;
      until(() => b.act?.d.pulledAt != null, 5, '开始拖拽');
      step(13);
      const P = b.platform, side = Math.sign(b.x - P.x);
      const onIt = ID.onPlatform(b, pl), edge = near(Math.abs(b.x - P.x), I.ironJaw.platform.edge, 4), faces = b.facing === -side;
      return { ok: onIt && edge && faces, onIt, edge, faces, player: [Math.round(pl.x), Math.round(pl.y)], boss: Math.round(b.x) };
    });
    check('ijMul', () => {
      const b = scene('ironJaw'); step();
      const keep = Math.random; Math.random = () => 0.5;
      try {
        Object.assign(pl, { x: b.platform.x, y: b.platform.y });
        const on = g.calcDamage(b, pl, { dmg: 40 }).dmg;
        Object.assign(pl, { x: b.platform.x + b.platform.rx + 60, y: b.platform.y });
        const off = g.calcDamage(b, pl, { dmg: 40 }).dmg;
        const ratio = on / off;
        return { ok: near(ratio, I.ironJaw.mul, 0.04), on, off };
      } finally { Math.random = keep; }
    });

    // ---------- 祭坛守护者 ----------
    enter(3); for (let i = 0; i < 20; i++) step();
    const brazier = (b, dx) => { const z = new Brazier(b.x + dx, b.y, b); g.enemies.push(z); return z; };
    check('wdFeed', () => {
      const rate = (phase, n) => {
        const b = scene('warden'); b.phase = phase; b.armor = b.maxArmor * 0.5;
        for (let i = 0; i < n; i++) brazier(b, -200 - i * 90);
        const a0 = b.armor; step(60);
        return (b.armor - a0) / b.maxArmor;
      };
      const two = rate(1, 2), none = rate(1, 0), early = rate(0, 2);
      return { ok: near(two, I.warden.feed * 2, 0.004) && near(none, 0, 1e-9) && near(early, 0, 1e-9), two, none, early };
    });
    check('wdShatter', () => {
      const b = scene('warden'); b.phase = 1; step();
      const z = brazier(b, -200); const a0 = b.armor;
      z.shatter(g);
      const drop = (a0 - b.armor) / b.maxArmor;
      b.armor = b.maxArmor * 0.05; const z2 = brazier(b, -260); z2.shatter(g);
      return { ok: near(drop, I.warden.shatter, 1e-6) && b.armor >= 1, drop, floor: b.armor };
    });
    check('wdBurn', () => {
      const b = scene('warden'); b.phase = 2; step();
      const h0 = b.hp; step(120);
      const lost = (h0 - b.hp) / b.maxHp;
      b.hp = b.maxHp * I.warden.burnFloor * 0.5; const low = b.hp; step(60);
      const p1 = scene('warden'); p1.phase = 1; step(); const h1 = p1.hp; step(60);
      return { ok: near(lost, I.warden.burn * 2, 0.001) && b.hp === low && b.alive && p1.hp === h1, lost, low: b.hp === low, phase1: p1.hp === h1 };
    });
    check('wdEmbers', () => {
      const embers = () => g.hazards.filter((h) => h.warden && h.life === I.warden.embers.life);
      const run = (phase) => {
        const b = scene('warden', 'judgment', { px: 640 }); b.phase = phase;
        until(() => !b.act, 200, '审判收招');
        return { b, n: embers().length };
      };
      const p1 = run(1).n;
      const { n: p2 } = run(2);
      // 烫人：新挂一道余火（招式里的余火此时已过半，可能正好错过伤害帧），每隔 every 帧烫一次；站在外面不烫
      const wb = scene('warden', null, { px: 640 }); wb.phase = 2; step();
      ID.wardenEmbers(g, wb, wb.x, wb.x - 460, 90);
      const lane = embers()[0];
      Object.assign(pl, { x: (lane.lo + lane.hi) / 2, y: lane.y, z: 0, invuln: 0, hp: pl.maxHp });
      const hp0 = pl.hp; step(I.warden.embers.every + 1); pl.invuln = 1e9;
      const burnt = pl.hp < hp0;
      const lane2 = embers()[0];
      Object.assign(pl, { x: lane2.x, y: lane2.y + 80, invuln: 0, hp: pl.maxHp });
      step(I.warden.embers.every + 1); const outside = pl.hp === pl.maxHp; pl.invuln = 1e9;
      step(I.warden.embers.life);
      const gone = embers().length === 0;
      return { ok: p1 === 0 && p2 === 2 && burnt && outside && gone, p1, p2, burnt, outside, gone };
    });

    // ---------- 骸骨统领 ----------
    enter(0);
    await wait(() => FX_ART.bonev2.ready);
    for (let i = 0; i < 20; i++) step();
    const shardsOf = () => g.hazards.filter((h) => h.rx === 16 && 'z' in h);
    check('bnReturn', () => {
      const b = scene('boneLord', null, { px: 300 }); step();
      b.armor = b.maxArmor * 0.5; const a0 = b.armor;
      boneShards(g, b); const n = shardsOf().length;
      until(() => !shardsOf().length, 200, '骨片飞回');
      const gain = (b.armor - a0) / b.maxArmor;
      return { ok: n >= 3 && n <= 5 && near(gain, n * I.boneLord.armor, 1e-6), n, gain };
    });
    check('bnTrample', () => {
      const b = scene('boneLord', null, { px: 300 }); step();
      b.armor = b.maxArmor * 0.5; const a0 = b.armor;
      boneShards(g, b); const n = shardsOf().length;
      step(BOSS_FX.boneLord.shard.scatter + 2); // 落地停留开始
      for (const s of shardsOf()) { Object.assign(pl, { x: s.x, y: s.y, z: 0 }); step(); }
      until(() => !shardsOf().length, 200, '骨片消失');
      return { ok: n >= 3 && b.armor === a0, n, unchanged: b.armor === a0 };
    });
    check('bnBroken', () => {
      const b = scene('boneLord', null, { px: 300 }); step();
      b.armor = 0; b.brokenT = 240; b.boneArmorPrev = 0; // 直接设成破防：不让 Boss.update 当成「刚破防」再撒一批
      boneShards(g, b); const n = shardsOf().length; let ticks = 0;
      while (shardsOf().length && ticks < 200) { step(); ticks++; }
      const expected = 240 - ticks - n * I.boneLord.broken;
      return { ok: n >= 3 && near(b.brokenT, expected, 2), n, brokenT: b.brokenT, expected };
    });

    // ---------- 残影 ----------
    enter(4); for (let i = 0; i < 20; i++) step();
    check('aiFavorite', () => {
      g.skillUse = { wave: 2, whirl: 4, quake: 4 }; g.lastSkill = 'quake';
      const tie = ID.favoriteSkill(g);
      g.skillUse = { wave: 5, whirl: 1 }; g.lastSkill = 'whirl';
      const most = ID.favoriteSkill(g);
      return { ok: tie === 'quake' && most === 'wave', tie, most };
    });
    check('aiMirror', () => {
      const b = scene('afterimage'); step();
      g.skillUse = { whirl: 4, wave: 1 }; g.lastSkill = 'wave';
      b.startAct('mirror'); step();
      return { ok: b.act?.d.skill === 'whirl', skill: b.act?.d.skill };
    });
    check('aiCounter', () => {
      // 放技能那一帧把主角摆回残影面前（等待的几帧里两边都可能挪开，超出看穿距离）
      const cast = (b, name) => { Object.assign(pl, { x: b.x - 250, y: b.y }); g.lastSkill = name; g.lastSkillAt = g.ticks; step(); return b.act?.name === 'teleport'; };
      let b = scene('afterimage'); b.phase = 1; step();
      g.skillUse = { flurry: I.afterimage.minUses };
      const first = cast(b, 'flurry'), cd = b.counterCd;
      b.act = null; b.setState('idle');
      const again = cast(b, 'flurry');
      b = scene('afterimage'); b.phase = 1; step(); g.skillUse = { flurry: 5, wave: 1 };
      const other = cast(b, 'wave');
      b = scene('afterimage'); b.phase = 0; step(); g.skillUse = { flurry: 5 };
      const early = cast(b, 'flurry');
      b = scene('afterimage'); b.phase = 1; step(); g.skillUse = { flurry: I.afterimage.minUses - 1 };
      const few = cast(b, 'flurry');
      return { ok: first && cd >= I.afterimage.cd - 2 && !again && !other && !early && !few, first, cd, again, other, early, few };
    });
  } finally { Math.random = random; }
  return out;
}

(async () => {
  const errs = []; let browser, r = {}, setupError;
  try {
    browser = await chromium.launch();
    const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    const res = await p.goto('http://localhost:' + PORT + '/index.html');
    if (!res?.ok()) throw new Error('index.html HTTP ' + (res?.status() ?? 'unknown'));
    await p.evaluate(() => localStorage.clear()); await p.reload();
    await p.waitForFunction(() => !!globalThis.__game);
    await p.waitForTimeout(1500);
    r = await p.evaluate(exercise);
  } catch (e) {
    setupError = e.message.split('\n')[0];
    console.error(e.stack || e);
  } finally { await browser?.close(); }
  console.log(JSON.stringify(r));
  const checks = [
    ['ijTable', '铁颚各阶段不再有三连斩'],
    ['ijPlatform', '铁颚刑台在场地正中，地面队列被清空后自动补回'],
    ['ijHook', '锁链钩中后主角被拖上刑台，铁颚落在台边、面朝台心'],
    ['ijMul', '站在刑台上挨铁颚的打按倍率加伤，台外不加'],
    ['wdFeed', '第二阶段起每座魂火炉按比例续霸体；没有炉子 / 第一阶段不续'],
    ['wdShatter', '打碎魂火炉削掉守护者一截霸体，不会替你破防'],
    ['wdBurn', '第三阶段守护者自烧，烧到下限停；第二阶段不烧'],
    ['wdEmbers', '第三阶段审判留下两道余火，站在里面会被烫、外面不会，到时熄灭；第二阶段没有'],
    ['bnReturn', '骨片飞回补霸体，每片按比例'],
    ['bnTrample', '落地停留时踩碎的骨片不补霸体'],
    ['bnBroken', '破防期间飞回的骨片缩短破防时间'],
    ['aiFavorite', '最常用技能：次数最多；并列时取最后用的'],
    ['aiMirror', '镜像照最常用的技能出，不是最后一招'],
    ['aiCounter', '第二阶段起再放最常用的技能会被看穿（瞬身）；冷却内、别的技能、第一阶段、次数不够都不会'],
  ];
  for (const [key, label] of checks) ok(r[key]?.ok, label + (r[key]?.error ? ' ' + r[key].error : setupError ? ' 未执行（' + setupError + '）' : ''));
  const real = errs.filter((e) => !/^(?:console: )?Failed to load resource: net::ERR_[A-Z_]+$/.test(e));
  ok(!setupError && !real.length, 'PAGE ERRORS ' + (real.join(' | ') || (setupError ? '未执行' : 'none')));
  console.log(bad ? 'BOSSIDTEST FAIL ' + bad : 'BOSSIDTEST ok');
  if (bad) process.exitCode = 1;
})();
