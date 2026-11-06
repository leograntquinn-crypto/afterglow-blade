// 开机载入顺序：封面就在大地图上，所以大地图素材和主角先载；只在关卡里用的素材（敌人、特效、道具、地宫场景）
// 等它们载好（或者失败）以后再开始载，不和它们抢带宽 —— 网速慢的时候封面不会一直是空的。
// 玩家在那之前就进关了（startStage 等调用 releaseBoot），就马上开始载。
const queue = [];
let released = false;

// 关卡素材的载入函数：先排队，releaseBoot 以后执行（已经放行了就马上执行）
export function afterBoot(fn) {
  if (released) fn();
  else queue.push(fn);
}

export function releaseBoot() {
  if (released) return;
  released = true;
  for (const fn of queue.splice(0)) fn();
}

export const bootReleased = () => released;
