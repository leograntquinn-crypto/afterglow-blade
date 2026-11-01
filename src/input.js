// 输入系统：键盘 + 触屏，统一成「动作」（attack / jump / dash ...）
//
// 关键概念：输入缓冲（Input Buffer）
//   玩家在上一招还没结束时就按下攻击键，我们把这次按键「记住」几帧，
//   等能出招的那一刻再执行。没有缓冲，连招会感觉「吃键」，手感很差。

const KEYMAP = {
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyJ: 'attack',
  KeyK: 'jump', Space: 'jump',
  KeyL: 'dash', ShiftLeft: 'dash',
  KeyU: 'skill1', KeyI: 'skill2', KeyO: 'skill3', KeyP: 'skill4',
  Escape: 'pause',
  Enter: 'start',
};

const BUFFER_FRAMES = 10;

export class Input {
  constructor() {
    this.held = new Set(); // 当前按住的动作
    this.pressed = new Map(); // 动作 -> 按下时的帧号
    this.frame = 0;
    this.stick = { x: 0, y: 0 }; // 触屏摇杆
    this.listeners = [];

    addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      e.preventDefault();
      if (!e.repeat) this.press(a);
    });
    addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (a) this.release(a);
    });
    addEventListener('blur', () => this.held.clear());
  }

  press(a) {
    this.held.add(a);
    this.pressed.set(a, this.frame);
    for (const fn of this.listeners) fn(a);
  }
  release(a) {
    this.held.delete(a);
  }
  onPress(fn) {
    this.listeners.push(fn);
  }
  isHeld(a) {
    return this.held.has(a);
  }
  // 这个动作是否在最近 win 帧内被按下过（且还没被用掉）
  buffered(a, win = BUFFER_FRAMES) {
    const f = this.pressed.get(a);
    return f !== undefined && this.frame - f <= win;
  }
  consume(a) {
    this.pressed.delete(a);
  }
  clearBuffer() {
    this.pressed.clear();
  }
  get dx() {
    const v = (this.isHeld('right') ? 1 : 0) - (this.isHeld('left') ? 1 : 0) + this.stick.x;
    return Math.max(-1, Math.min(1, v));
  }
  get dy() {
    const v = (this.isHeld('down') ? 1 : 0) - (this.isHeld('up') ? 1 : 0) + this.stick.y;
    return Math.max(-1, Math.min(1, v));
  }
  // 只在游戏逻辑真正前进时调用（顿帧期间不走），这样顿帧中按的键不会过期
  tick() {
    this.frame++;
  }

  bindTouch(root) {
    root.querySelectorAll('[data-action]').forEach((btn) => {
      const a = btn.dataset.action;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.setPointerCapture?.(e.pointerId);
        btn.classList.add('on');
        this.press(a);
      });
      const up = () => {
        btn.classList.remove('on');
        this.release(a);
      };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('lostpointercapture', up);
    });

    const pad = root.querySelector('#stick');
    const knob = pad.querySelector('.knob');
    let id = null, cx = 0, cy = 0;
    const move = (e) => {
      if (e.pointerId !== id) return;
      const R = pad.clientWidth / 2;
      let dx = (e.clientX - cx) / R, dy = (e.clientY - cy) / R;
      const m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }
      this.stick.x = Math.abs(dx) < 0.25 ? 0 : dx;
      this.stick.y = Math.abs(dy) < 0.25 ? 0 : dy;
      knob.style.transform = `translate(${dx * R * 0.6}px, ${dy * R * 0.6}px)`;
    };
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      this.stick.x = this.stick.y = 0;
      knob.style.transform = '';
    };
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      id = e.pointerId;
      pad.setPointerCapture?.(id);
      const r = pad.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      move(e);
    });
    pad.addEventListener('pointermove', move);
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
  }
}
