// 背景音乐：实时生成（程序化作曲），没有任何音频文件
//
// 结构：
//   和弦进行 Dm → B♭ → F → C（i–VI–III–VII，阴郁但有推进感），每个和弦两小节
//   ├─ 铺底（pad）：锯齿波 + 低通滤波，慢起慢收，一直在
//   ├─ 低音：和弦根音
//   ├─ 拨弦旋律：从 D 小调五声音阶里随机挑音，经过延迟和混响，像在空旷的墓穴里回响
//   ├─ 战斗鼓组：底鼓、太鼓、镲 —— 只在有敌人时淡入
//   └─ 首领层：更密的太鼓 + 和弦重音
//
// 调度：Web Audio 的时间非常精确，但 setInterval 不准。标准做法是每 25ms 检查一次，
// 把接下来 0.15 秒内要响的音符提前「预约」到精确时间点上（look-ahead scheduling）。

import { getAudio } from './audio.js';
import { settings, onSettings } from './settings.js';

const LEVEL = () => 0.28 * settings.music; // 设置：音乐音量

const BPM = 84;
const STEP = 60 / BPM / 2; // 八分音符
const CHORDS = [
  { root: 38, tones: [50, 53, 57] }, // Dm
  { root: 34, tones: [46, 50, 53] }, // B♭
  { root: 41, tones: [53, 57, 60] }, // F
  { root: 36, tones: [48, 52, 55] }, // C
];
const SCALE = [62, 65, 67, 69, 72, 74, 77, 79, 81]; // D 小调五声音阶
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const MODES = {
  title: { pad: 1, pluck: 0.25, drums: 0, boss: 0 },
  hub: { pad: 0.9, pluck: 0.4, drums: 0, boss: 0 },
  calm: { pad: 1, pluck: 0.35, drums: 0, boss: 0 },
  battle: { pad: 0.8, pluck: 0.5, drums: 1, boss: 0 },
  boss: { pad: 0.9, pluck: 0.3, drums: 1, boss: 1 },
};

class Music {
  constructor() {
    this.started = false;
    this.mode = 'title';
    try { this.muted = localStorage.getItem('afterglow-music') === 'off'; } catch { this.muted = false; }
  }

  start() {
    const A = getAudio();
    if (!A || this.started) return;
    this.started = true;
    const ac = (this.ac = A.ac);
    this.noise = A.noiseBuf;
    this.out = ac.createGain();
    this.out.gain.value = this.muted ? 0 : 0.0001;
    this.out.connect(ac.destination);
    if (!this.muted) this.out.gain.setTargetAtTime(LEVEL(), ac.currentTime, 1.5);

    // 混响：用衰减的噪声当「房间的回声」
    const len = ac.sampleRate * 3;
    const ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.reverb = ac.createConvolver();
    this.reverb.buffer = ir;
    const wet = ac.createGain();
    wet.gain.value = 0.5;
    this.reverb.connect(wet).connect(this.out);
    // 延迟（拨弦用）
    this.delay = ac.createDelay(2);
    this.delay.delayTime.value = STEP * 3;
    const fb = ac.createGain();
    fb.gain.value = 0.32;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(this.reverb);

    // 每一层一个音量旋钮，切换模式时平滑淡入淡出
    this.layers = {};
    for (const k of ['pad', 'pluck', 'drums', 'boss']) {
      const g = ac.createGain();
      g.gain.value = MODES[this.mode][k];
      g.connect(this.out);
      g.connect(this.reverb);
      this.layers[k] = g;
    }
    this.layers.pluck.connect(this.delay);

    this.step = 0;
    this.next = ac.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  setMode(m) {
    if (m === this.mode) return;
    this.mode = m;
    if (!this.started) return;
    const now = this.ac.currentTime;
    for (const [k, g] of Object.entries(this.layers)) g.gain.setTargetAtTime(MODES[m][k], now, k === 'drums' || k === 'boss' ? 0.6 : 1.5);
  }

  setDuck(on) {
    if (!this.started || this.muted) return;
    this.out.gain.setTargetAtTime(on ? LEVEL() * 0.3 : LEVEL(), this.ac.currentTime, 0.3);
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem('afterglow-music', this.muted ? 'off' : 'on'); } catch { /* 忽略 */ }
    if (this.started) this.out.gain.setTargetAtTime(this.muted ? 0 : LEVEL(), this.ac.currentTime, 0.2);
    return this.muted;
  }

  schedule() {
    while (this.next < this.ac.currentTime + 0.15) {
      this.playStep(this.step, this.next);
      this.step++;
      this.next += STEP;
    }
  }

  playStep(s, t) {
    const bar = Math.floor(s / 8), beat = s % 8;
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
    const mode = MODES[this.mode];
    // 和弦切换：铺底 + 低音
    if (s % 16 === 0) {
      for (const n of chord.tones) this.pad(hz(n), t, STEP * 16);
      this.bass(hz(chord.root), t, STEP * 16);
      if (mode.boss) this.stab(chord, t);
    }
    // 拨弦旋律
    const pChance = 0.18 + mode.pluck * 0.35;
    if (Math.random() < pChance && (beat % 2 === 0 || Math.random() < 0.4)) {
      const n = SCALE[Math.floor(Math.random() * SCALE.length)];
      this.pluck(hz(n), t);
    }
    // 鼓组
    if (beat === 0 || beat === 4) this.kick(t);
    if (beat === 3 || beat === 7) this.taiko(t, 1);
    if (beat % 2 === 1) this.hat(t);
    // 首领：额外的太鼓滚奏
    if (beat === 5 || beat === 6 || (bar % 2 === 1 && beat === 7)) this.taiko(t, 0.7, true);
  }

  // ---------- 乐器 ----------
  env(t, a, d, peak, dest) {
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    g.connect(dest);
    return g;
  }
  pad(f, t, dur) {
    const ac = this.ac;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 650;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.035, t + 1.6);
    g.gain.setValueAtTime(0.035, t + dur - 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.8);
    lp.connect(g).connect(this.layers.pad);
    for (const det of [-8, 7]) {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 2);
    }
  }
  bass(f, t, dur) {
    const o = this.ac.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.5);
    o.connect(g).connect(this.layers.pad);
    o.start(t);
    o.stop(t + dur + 0.6);
  }
  pluck(f, t) {
    const o = this.ac.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    o.connect(this.env(t, 0.005, 0.7, 0.07, this.layers.pluck));
    o.start(t);
    o.stop(t + 0.8);
  }
  kick(t) {
    const o = this.ac.createOscillator();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.22);
    o.connect(this.env(t, 0.003, 0.3, 0.5, this.layers.drums));
    o.start(t);
    o.stop(t + 0.35);
  }
  taiko(t, vol, boss = false) {
    const dest = boss ? this.layers.boss : this.layers.drums;
    const o = this.ac.createOscillator();
    o.frequency.setValueAtTime(boss ? 140 : 95, t);
    o.frequency.exponentialRampToValueAtTime(boss ? 70 : 55, t + 0.3);
    o.connect(this.env(t, 0.003, 0.35, 0.32 * vol, dest));
    o.start(t);
    o.stop(t + 0.4);
    const n = this.ac.createBufferSource();
    n.buffer = this.noise;
    const lp = this.ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    n.connect(lp).connect(this.env(t, 0.002, 0.12, 0.18 * vol, dest));
    n.start(t);
    n.stop(t + 0.2);
  }
  hat(t) {
    const n = this.ac.createBufferSource();
    n.buffer = this.noise;
    const hp = this.ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    n.connect(hp).connect(this.env(t, 0.002, 0.05, 0.05, this.layers.drums));
    n.start(t, Math.random() * 0.5);
    n.stop(t + 0.08);
  }
  stab(chord, t) {
    const lp = this.ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400, t);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.8);
    lp.connect(this.env(t, 0.01, 0.9, 0.09, this.layers.boss));
    for (const n of [chord.root + 12, chord.tones[0], chord.tones[2]]) {
      const o = this.ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz(n);
      o.connect(lp);
      o.start(t);
      o.stop(t + 1);
    }
  }
}

export const music = new Music();
// 设置：音乐音量随时生效
onSettings((S) => { if (music.started && !music.muted) music.out.gain.setTargetAtTime(0.28 * S.music, music.ac.currentTime, 0.2); });
