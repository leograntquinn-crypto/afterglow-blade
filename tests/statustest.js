// 状态系统验收（docs/CODEX_TICKETS_STATUS.md；规则见 docs/DESIGN_EQUIPMENT.md 第三节、第十节）。先行写好，Codex 实现时不改这个文件。
// 约定的接口（src/status.js）：
//   STATUS / REACTIONS / RESIST / HIT_TIER / IMBUE_STRENGTH        数据表
//   statusOf(actor)                       → 该角色的状态对象（没有就建一个空的）
//   addStatus(game, target, id, amount, src) → 本次触发的反应 id 数组
//   updateStatuses(game, actor)           每帧推进（game.update 对主角和每个敌人调用）
//   isControlled(actor)                   冻结 / 麻痹中
//   damageTakenMul(actor)                 脆化 / 冻结的受伤倍率
//   healMul(actor)                        中毒时 0.5
//   onDisplaced(game, actor)              被击飞 / 撞墙 / 拖拽：流血额外结算一跳
//   playerHitStatus(game, target, h)      主角命中后按身上的状态词条积累
//   absorbShield(game, actor, dmg)        → 护盾吸收后剩下的伤害
//   ENEMY_SOURCES                         敌人施加状态的来源表
//   statusOf(a).lastTick                  最近一次跳伤各状态各掉了多少（{ burn, poison, bleed }）
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8765;
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };

async function exercise() {
  const g = __game;
  const S = await import('./src/status.js');
  const { Enemy } = await import('./src/enemy.js');
  const { Boss } = await import('./src/boss.js');
  const out = {};
  const check = (key, fn) => { try { out[key] = fn(); } catch (e) { out[key] = { ok: false, error: e.message }; } };
  const step = (n = 1) => { for (let i = 0; i < n; i++) { g.hitstop = 0; g.update(); } };
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  g.story.clear(); g.startStage(2, 0, false); g.story.clear();
  for (let i = 0; i < 20; i++) step();
  const random = Math.random; Math.random = () => 0.5;
  const pl = () => g.player;
  function foe(type = 'archer', opts = {}) { // 默认用没有抗性的弓手；抗性单独测
    g.spawnQueue = []; g.hazards = []; g.projectiles = []; g.attackers.clear();
    const e = new Enemy(type, 700, 90, g, { lv: 7, ...opts });
    e.setState('idle'); e.attackCd = 1e9; e.update = e.update.bind(e);
    g.enemies = [e];
    Object.assign(pl(), { x: 300, y: 90, invuln: 1e9 });
    return e;
  }
  const st = (a) => S.statusOf(a);
  try {
    check('burn', () => {
      const e = foe();
      for (let i = 0; i < 6; i++) S.addStatus(g, e, 'burn', 1, pl());
      const n = st(e).stacks.burn.n, hp0 = e.hp, state0 = e.state;
      step(S.STATUS.burn.every);
      const dmg = hp0 - e.hp;
      return { ok: n === S.STATUS.burn.max && dmg > 0 && e.state === state0, n, dmg, state: e.state };
    });
    check('poison', () => {
      const e = foe();
      for (let i = 0; i < 12; i++) S.addStatus(g, e, 'poison', 1, pl());
      return { ok: st(e).stacks.poison.n === S.STATUS.poison.max && S.healMul(e) === 0.5, n: st(e).stacks.poison.n, heal: S.healMul(e) };
    });
    check('bleedDisplace', () => {
      const e = foe('brute');
      S.addStatus(g, e, 'bleed', 3, pl());
      const hp0 = e.hp; S.onDisplaced(g, e);
      return { ok: e.hp < hp0, dmg: hp0 - e.hp };
    });
    check('freeze', () => {
      const e = foe();
      S.addStatus(g, e, 'chill', 60, pl());
      const before = S.isControlled(e);
      S.addStatus(g, e, 'chill', 40, pl());
      const frozen = S.isControlled(e), t = st(e).freeze;
      step(S.STATUS.freeze.normal + 2);
      const thawed = !S.isControlled(e);
      // 控制递减：8 秒内再冻要 150%
      S.addStatus(g, e, 'chill', 100, pl());
      const dr = !S.isControlled(e);
      S.addStatus(g, e, 'chill', 50, pl());
      const second = S.isControlled(e);
      return { ok: !before && frozen && near(t, S.STATUS.freeze.normal, 1) && thawed && dr && second, before, frozen, t, thawed, dr, second };
    });
    check('freezeElite', () => {
      const e = foe('brute', { elite: true });
      S.addStatus(g, e, 'chill', 100, pl());
      return { ok: near(st(e).freeze, S.STATUS.freeze.elite, 1), t: st(e).freeze };
    });
    check('bossNoHardCC', () => {
      g.enemies = []; const b = new Boss('ironJaw', 700, 90, g, 7); b.setState('idle'); b.restT = 1e9; g.enemies = [b];
      const a0 = b.armor;
      S.addStatus(g, b, 'chill', 100, pl());
      const frost = !S.isControlled(b) && near((a0 - b.armor) / b.maxArmor, S.STATUS.freeze.bossArmor, 0.001);
      b.startAct('channel'); step(3);
      const pts0 = b.channel?.pts ?? 0;
      S.addStatus(g, b, 'shock', 100, pl());
      const shock = !S.isControlled(b) && (b.channel?.pts ?? 0) - pts0 === S.STATUS.paralyze.bossChannel;
      return { ok: frost && shock, frost, shock };
    });
    check('paralyzeInterrupt', () => {
      const e = foe('grunt');
      e.startWindup(g, { ...e.T.atk, windup: 999 });
      const was = e.state;
      S.addStatus(g, e, 'shock', 100, pl());
      return { ok: was === 'windup' && e.state !== 'windup' && S.isControlled(e) && near(st(e).paralyze, S.STATUS.paralyze.normal, 1), was, now: e.state };
    });
    check('melt', () => {
      const e = foe(), near2 = new Enemy('brute', 740, 95, g, { lv: 7 }); near2.setState('idle'); g.enemies.push(near2);
      S.addStatus(g, e, 'burn', 3, pl());
      const hp0 = e.hp, hp1 = near2.hp;
      const r = S.addStatus(g, e, 'chill', 100, pl());
      return { ok: r.includes('melt') && !st(e).stacks.burn?.n && !S.isControlled(e) && !(st(e).build.chill > 0) && e.hp < hp0 && near2.hp < hp1, r };
    });
    check('toxicBlast', () => {
      const e = foe(), near2 = new Enemy('brute', 760, 95, g, { lv: 7 }); near2.setState('idle'); g.enemies.push(near2);
      S.addStatus(g, e, 'poison', 6, pl());
      const r = S.addStatus(g, e, 'burn', 1, pl());
      return { ok: r.includes('toxic_blast') && !st(e).stacks.poison?.n && st(e).stacks.burn.n === 1 && st(near2).stacks.poison?.n === 2, r, other: st(near2).stacks.poison?.n };
    });
    check('shatter', () => {
      const e = foe();
      S.addStatus(g, e, 'chill', 100, pl());
      step(Math.ceil(S.REACTIONS.cooldown) + 1);
      const r = S.addStatus(g, e, 'shock', 10, pl());
      const brittle = st(e).brittle > 0;
      S.addStatus(g, e, 'chill', 200, pl());
      return { ok: r.includes('shatter') && !st(e).freeze && brittle && !S.isControlled(e) && near(S.damageTakenMul(e), 1.2, 0.001), r, brittle };
    });
    check('cauterizeClot', () => {
      const e = foe();
      S.addStatus(g, e, 'bleed', 3, pl());
      const r = S.addStatus(g, e, 'burn', 1, pl());
      const caut = r.includes('cauterize') && !st(e).stacks.bleed?.n && st(e).stacks.burn.n === 4;
      const f = foe();
      S.addStatus(g, f, 'bleed', 3, pl()); S.addStatus(g, f, 'chill', 100, pl());
      const hp0 = f.hp, n0 = st(f).stacks.bleed.n, t0 = st(f).stacks.bleed.t;
      step(S.STATUS.bleed.every * 2);
      const clot = f.hp === hp0 && st(f).stacks.bleed.n === n0 && st(f).stacks.bleed.t === t0;
      return { ok: caut && clot, caut, clot };
    });
    check('bloodPoison', () => {
      const a = foe(); S.addStatus(g, a, 'bleed', 2, pl());
      let h = a.hp; step(S.STATUS.bleed.every); const plain = h - a.hp;
      const b = foe(); S.addStatus(g, b, 'bleed', 2, pl()); S.addStatus(g, b, 'poison', 1, pl());
      // 只看流血那一跳：减掉同一帧的中毒伤害
      h = b.hp; step(S.STATUS.bleed.every);
      const total = h - b.hp, poisonPart = st(b).lastTick?.poison ?? 0;
      return { ok: near((total - poisonPart) / plain, 1.3, 0.05), plain, total, poisonPart };
    });
    check('reactionCooldown', () => {
      const e = foe();
      S.addStatus(g, e, 'poison', 4, pl());
      const r1 = S.addStatus(g, e, 'burn', 1, pl());
      S.addStatus(g, e, 'poison', 4, pl());
      const r2 = S.addStatus(g, e, 'burn', 1, pl());
      return { ok: r1.includes('toxic_blast') && !r2.length, r1, r2 };
    });
    check('noHitstun', () => {
      const e = foe(); g.combo = 0;
      const style0 = g.style.pts;
      S.addStatus(g, e, 'burn', 5, pl()); S.addStatus(g, e, 'bleed', 5, pl());
      step(S.STATUS.burn.every * 2 + 1);
      return { ok: g.combo === 0 && g.style.pts === style0 && e.state === 'idle', combo: g.combo, state: e.state };
    });
    check('resist', () => {
      const bone = foe('grunt'); S.addStatus(g, bone, 'bleed', 3, pl());
      const wing = foe('wing'); S.addStatus(g, wing, 'burn', 3, pl());
      const brute = foe('brute'); S.addStatus(g, brute, 'chill', 40, pl());
      return { ok: !st(bone).stacks.bleed?.n && !st(wing).stacks.burn?.n && near(st(brute).build.chill, 40 * (1 - (S.RESIST.brute?.chill ?? 0)), 0.01) };
    });
    check('playerHit', () => {
      // 武器带 2 档寒意：普攻一下 +9%，技能 +27%
      const e = foe();
      g.stats.imbues = { chill: [{ slot: 'weapon', lv: 2 }] };
      S.playerHitStatus(g, e, { dmg: 1 });
      const light = st(e).build.chill;
      S.playerHitStatus(g, e, { dmg: 1, skill: 'skill1' });
      const both = st(e).build.chill;
      // 同元素多件：强度按 √ 递减，上限 1 档的 3 倍
      const f = foe();
      g.stats.imbues = { chill: Array.from({ length: 6 }, (_, i) => ({ slot: 's' + i, lv: 3 })) };
      S.playerHitStatus(g, f, { dmg: 1 });
      const capped = st(f).build.chill;
      g.stats.imbues = {};
      return { ok: near(light, 9, 0.01) && near(both - light, 27, 0.01) && capped <= 3 * S.IMBUE_STRENGTH[1] * S.HIT_TIER.light + 1e-9, light, both, capped };
    });
    check('blocked', () => {
      const e = foe('grunt', { affixes: ['shield'] }); e.facing = -1;
      g.stats.imbues = { burn: [{ slot: 'weapon', lv: 3 }] };
      const landed = g.applyHit(pl(), e, { dmg: 1, kb: 0, stun: 1, stop: 0 }, 1);
      const n = st(e).stacks.burn?.n ?? 0;
      g.stats.imbues = {};
      return { ok: !landed && n === 0, landed, n };
    });
    check('playerShield', () => {
      const p = pl(); p.hp = p.maxHp;
      S.addStatus(g, p, 'shield', 50, null);
      S.addStatus(g, p, 'burn', 2, { team: 'enemy', atk: 200 });
      const hp0 = p.hp; step(S.STATUS.burn.every);
      const absorbed = p.hp === hp0 && st(p).shield < 50;
      const sh = st(p).shield, left = S.absorbShield(g, p, 1000);
      return { ok: absorbed && near(left, 1000 - sh, 1e-6) && st(p).shield === 0, absorbed, sh, left };
    });
    check('cleanse', () => {
      const p = pl();
      S.addStatus(g, p, 'poison', 3, { team: 'enemy', atk: 100 }); S.addStatus(g, p, 'bleed', 2, { team: 'enemy', atk: 100 });
      const sh0 = st(p).shield ?? 0;
      S.addStatus(g, p, 'cleanse', 1, null);
      const gained = (st(p).shield ?? 0) - sh0;
      return { ok: !st(p).stacks.poison?.n && !st(p).stacks.bleed?.n && near(gained, 5 * p.maxHp * S.STATUS.cleanse.shieldPerStack, 1), gained };
    });
    check('enemySources', () => {
      // 祭坛火（关卡机制火焰）→ 灼烧；司祭诅咒 → 中毒；屠夫斧伤 → 流血（只这三类）
      const src = S.ENEMY_SOURCES;
      return { ok: src?.altarFire === 'burn' && src?.priest === 'poison' && src?.brute === 'bleed' && src?.ironJaw === 'bleed' && Object.keys(src).length === 4, src };
    });
  } finally { Math.random = random; }
  return out;
}

(async () => {
  const errs = []; let browser, r = {}, setupError;
  try {
    browser = await chromium.launch();
    const p = await browser.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    const res = await p.goto('http://localhost:' + PORT + '/index.html');
    if (!res?.ok()) throw new Error('index.html HTTP ' + (res?.status() ?? 'unknown'));
    await p.evaluate(() => localStorage.clear()); await p.reload();
    await p.waitForFunction(() => !!globalThis.__game);
    await p.waitForTimeout(1500);
    r = await p.evaluate(exercise);
  } catch (e) { setupError = e.message.split('\n')[0]; } finally { await browser?.close(); }
  console.log(JSON.stringify(r));
  const checks = [
    ['burn', '灼烧叠到上限 5 层，每 30 帧跳伤，跳伤不改变敌人状态'],
    ['poison', '中毒上限 10 层；中毒者受治疗减半'],
    ['bleedDisplace', '流血目标被击飞 / 撞墙 / 拖拽时额外结算一跳'],
    ['freeze', '寒意满 100% 冻结 1.2 秒；8 秒内再冻要 150%（控制递减）'],
    ['freezeElite', '精英冻结 0.6 秒'],
    ['bossNoHardCC', '首领不冻结不麻痹：寒意满削霸体 15%，感电满加读条打断值 3'],
    ['paralyzeInterrupt', '麻痹打断正在前摇的出招'],
    ['melt', '融化：灼烧 + 寒意同时清除，目标和周围敌人受伤'],
    ['toxicBlast', '毒爆：消耗全部中毒层，周围敌人各挂 2 层中毒，灼烧保留'],
    ['shatter', '碎冰：冻结中感电 → 立即解冻、脆化（受伤 ×1.2），脆化期间不能再冻'],
    ['cauterizeClot', '灼口：灼烧烧掉流血并转成灼烧层；凝血：冻结期间流血暂停'],
    ['bloodPoison', '毒血：同时中毒时流血每跳 +30%'],
    ['reactionCooldown', '同一目标 1.5 秒内只触发一次反应'],
    ['noHitstun', '持续伤害不加连击、不加风格分、不造成硬直'],
    ['resist', '抗性：骨兵不流血、烬翼不灼烧、屠夫按表减半寒意'],
    ['playerHit', '主角命中按招式级别 × 词条强度积累；同元素多件 √ 递减、上限 3 倍'],
    ['blocked', '被坚盾挡住的攻击不积累状态'],
    ['playerShield', '护盾先吸收持续伤害，再吸收直接伤害'],
    ['cleanse', '净化清掉全部负面状态，每层转最大生命 2% 的护盾'],
    ['enemySources', '敌人施加状态只开四个来源：祭坛火、司祭、屠夫、铁颚'],
  ];
  for (const [key, label] of checks) ok(r[key]?.ok, label + (r[key]?.error ? ' ' + r[key].error : setupError ? ' 未执行（' + setupError + '）' : ''));
  ok(!setupError && !errs.length, 'PAGE ERRORS ' + (errs.join(' | ') || (setupError ? '未执行' : 'none')));
  console.log(bad ? 'STATUSTEST FAIL ' + bad : 'STATUSTEST ok');
  if (bad) process.exitCode = 1;
})();
