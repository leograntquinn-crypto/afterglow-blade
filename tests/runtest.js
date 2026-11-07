// 跑步标定回归：战斗、地图满速一圈 0.45～0.55 秒，横跑着地脚漂移小于一帧的走动距离
const { execFileSync } = require('child_process');
const t = execFileSync('node', [__dirname + '/runcal.js'], { env: { ...process.env, PORT: process.env.PORT || 8765 } }).toString();
const j = JSON.parse(t.slice(0, t.lastIndexOf('}') + 1)); let bad = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
ok(Math.abs(j.cycle - 126) < 1, `一圈距离 ${j.cycle}`);
for (const k of ['battle_right', 'battle_left', 'battle_diag', 'battle_stickdiag', 'map_right', 'map_left', 'map_diag', 'map_up', 'map_down']) ok(j[k].seconds >= 0.45 && j[k].seconds <= 0.55, `${k} 一圈 ${j[k].seconds} 秒`);
for (const k of ['battle_right', 'battle_left']) ok(j[k].footDriftMax <= 8, `${k} 着地脚漂移 ${j[k].footDriftMax}`);
for (const k of ['map_right', 'map_left']) ok(j[k].footDriftMax <= 3, `${k} 着地脚漂移 ${j[k].footDriftMax}`);
ok(j.map_half.seconds > 0.9, `地图半推摇杆一圈 ${j.map_half.seconds} 秒（跟着变慢）`);
ok(/ERR none/.test(t), '无页面错误');
console.log(bad ? `RUNTEST FAIL ${bad}` : 'RUNTEST ok');
