// 地下城生成：每次出征随机生成一张房间地图
//
//   1. 主线：从起点出发，大多数时候向东走，偶尔向北或向南拐，最后一间是 Boss 房
//   2. 支线：从主线中间的房间旁边「长」出宝箱房、精英房、泉水房（可以不去）
//   3. 相邻且连通的房间之间开门
//
// 地图用网格坐标 (x, y) 表示，x 向东增大，y 向南增大。

const key = (x, y) => `${x},${y}`;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const DIRS = { e: [1, 0], w: [-1, 0], n: [0, -1], s: [0, 1] };
export const OPPOSITE = { e: 'w', w: 'e', n: 's', s: 'n' };

export const ROOM_INFO = {
  fight: { name: '', glyph: '' },
  elite: { name: '精英房间', glyph: '精' },
  treasure: { name: '宝箱', glyph: '宝' },
  rest: { name: '泉水', glyph: '泉' },
  boss: { name: '首领', glyph: '王' },
};

export function generateDungeon(stage) {
  const rooms = new Map();
  const add = (x, y, type) => {
    const r = { x, y, type, doors: {}, visited: false, cleared: false, waves: [] };
    rooms.set(key(x, y), r);
    return r;
  };
  const link = (a, b) => {
    for (const [d, [dx, dy]] of Object.entries(DIRS)) {
      if (a.x + dx === b.x && a.y + dy === b.y) {
        a.doors[d] = true;
        b.doors[OPPOSITE[d]] = true;
      }
    }
  };

  // 主线
  const path = [add(0, 0, 'fight')];
  while (path.length < stage.rooms) {
    const cur = path[path.length - 1];
    const opts = [[1, 0], [1, 0], [1, 0], [0, -1], [0, 1]]
      .map(([dx, dy]) => [cur.x + dx, cur.y + dy])
      .filter(([x, y]) => !rooms.has(key(x, y)) && Math.abs(y) <= 1);
    const [nx, ny] = opts.length ? pick(opts) : [cur.x + 1, cur.y];
    const r = add(nx, ny, path.length === stage.rooms - 1 ? 'boss' : 'fight');
    link(cur, r);
    path.push(r);
  }

  path.forEach((r, i) => (r.idx = i)); // 主线序号（关卡地形按它挑，见 stage_rules.js）

  // 支线：挂在主线中间的房间旁边（不挂在起点和 Boss 房）
  for (const type of stage.side) {
    for (let tries = 0; tries < 30; tries++) {
      const parent = path[1 + Math.floor(Math.random() * Math.max(1, path.length - 2))];
      const [dx, dy] = pick(Object.values(DIRS));
      const x = parent.x + dx, y = parent.y + dy;
      if (rooms.has(key(x, y)) || x < 0 || Math.abs(y) > 2) continue;
      link(parent, add(x, y, type));
      break;
    }
  }

  // 战斗内容
  for (const r of rooms.values()) {
    if (r.type === 'fight') {
      const n = r === path[0] ? 1 : stage.wavesPerRoom; // 第一个房间只有一波，热身
      for (let i = 0; i < n; i++) r.waves.push(pick(stage.pool));
    } else if (r.type === 'elite') {
      r.waves.push(pick(stage.elite));
    }
  }

  // 每个房间的宽度：战斗房间宽一些，可以横向卷轴
  for (const r of rooms.values()) {
    r.w = r.type === 'boss' ? 1400 : r.type === 'fight' || r.type === 'elite' ? 1200 + Math.floor(Math.random() * 3) * 200 : 960;
  }

  path[0].visited = true;
  return { rooms, start: path[0], mainLength: path.length, get: (x, y) => rooms.get(key(x, y)) };
}
