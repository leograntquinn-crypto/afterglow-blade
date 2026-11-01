// 音效：全部用 Web Audio 实时合成，不需要任何音频文件。
// 打击感 = 画面（顿帧、震屏、火花）+ 声音（短促的噪声 + 低频「咚」）。

let ac = null, master = null, noiseBuf = null;
const lastPlayed = {};

export function initAudio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ac = new AC(); } catch { return; }
    master = ac.createGain();
    master.gain.value = 0.45;
    master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
}

function envGain(t, attack, decay, peak) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(master);
  return g;
}

function noise({ dur = 0.12, type = 'bandpass', f = 1500, f2 = null, q = 1, vol = 0.3, delay = 0 }) {
  const t = ac.currentTime + delay;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const fl = ac.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  fl.Q.value = q;
  src.connect(fl).connect(envGain(t, 0.004, dur, vol));
  src.start(t);
  src.stop(t + dur + 0.05);
}

function tone({ f = 200, f2 = 60, dur = 0.15, type = 'sine', vol = 0.4, delay = 0 }) {
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  o.connect(envGain(t, 0.004, dur, vol));
  o.start(t);
  o.stop(t + dur + 0.05);
}

const SOUNDS = {
  swing: () => noise({ dur: 0.09, f: 900, f2: 3200, q: 0.8, vol: 0.16 }),
  hit: () => { noise({ dur: 0.08, f: 2200, q: 0.7, vol: 0.35 }); tone({ f: 180, f2: 60, dur: 0.1, vol: 0.45 }); },
  heavy: () => { noise({ dur: 0.16, type: 'lowpass', f: 1800, f2: 300, vol: 0.5 }); tone({ f: 120, f2: 35, dur: 0.22, vol: 0.7 }); },
  jump: () => tone({ f: 300, f2: 520, dur: 0.08, type: 'triangle', vol: 0.1 }),
  land: () => noise({ dur: 0.06, type: 'lowpass', f: 600, vol: 0.18 }),
  dash: () => noise({ dur: 0.14, type: 'highpass', f: 1200, f2: 4000, vol: 0.14 }),
  hurt: () => { tone({ f: 220, f2: 90, dur: 0.18, type: 'sawtooth', vol: 0.16 }); noise({ dur: 0.1, f: 800, vol: 0.3 }); },
  skill: () => { tone({ f: 440, f2: 880, dur: 0.18, type: 'triangle', vol: 0.14 }); noise({ dur: 0.25, type: 'highpass', f: 2000, f2: 6000, vol: 0.1 }); },
  quake: () => { tone({ f: 90, f2: 28, dur: 0.6, vol: 0.9 }); noise({ dur: 0.5, type: 'lowpass', f: 900, f2: 120, vol: 0.6 }); },
  break: () => { tone({ f: 900, f2: 300, dur: 0.25, type: 'square', vol: 0.1 }); noise({ dur: 0.2, f: 4000, q: 2, vol: 0.3 }); },
  deny: () => tone({ f: 160, f2: 150, dur: 0.08, type: 'square', vol: 0.07 }),
  shoot: () => noise({ dur: 0.1, f: 2500, f2: 900, q: 3, vol: 0.12 }),
  warn: () => tone({ f: 520, f2: 500, dur: 0.12, type: 'square', vol: 0.06 }),
  kill: () => tone({ f: 660, f2: 1320, dur: 0.15, type: 'triangle', vol: 0.1, delay: 0.02 }),
  wave: () => { tone({ f: 330, f2: 330, dur: 0.3, type: 'triangle', vol: 0.12 }); tone({ f: 495, f2: 495, dur: 0.4, type: 'triangle', vol: 0.1, delay: 0.12 }); },
  clear: () => [523, 659, 784, 1046].forEach((f, i) => tone({ f, f2: f, dur: 0.35, type: 'triangle', vol: 0.12, delay: i * 0.1 })),
  coin: () => { tone({ f: 1320, f2: 1320, dur: 0.05, type: 'square', vol: 0.05 }); tone({ f: 1760, f2: 1760, dur: 0.08, type: 'square', vol: 0.05, delay: 0.05 }); },
  pickup: () => tone({ f: 600, f2: 900, dur: 0.08, type: 'triangle', vol: 0.1 }),
  rare: () => [784, 988, 1175].forEach((f, i) => tone({ f, f2: f, dur: 0.25, type: 'triangle', vol: 0.1, delay: i * 0.07 })),
  legend: () => {
    tone({ f: 110, f2: 55, dur: 0.6, vol: 0.5 });
    [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ f, f2: f, dur: 0.5, type: 'triangle', vol: 0.12, delay: 0.1 + i * 0.08 }));
  },
  levelup: () => [392, 523, 659, 784, 1046].forEach((f, i) => tone({ f, f2: f, dur: 0.3, type: 'triangle', vol: 0.13, delay: i * 0.07 })),
  enhance: () => { noise({ dur: 0.08, f: 3000, q: 4, vol: 0.25 }); [880, 1320].forEach((f, i) => tone({ f, f2: f, dur: 0.3, type: 'triangle', vol: 0.12, delay: 0.08 + i * 0.1 })); },
  enhFail: () => { noise({ dur: 0.08, f: 3000, q: 4, vol: 0.25 }); tone({ f: 300, f2: 120, dur: 0.35, type: 'sawtooth', vol: 0.08, delay: 0.08 }); },
  click: () => tone({ f: 900, f2: 700, dur: 0.04, type: 'triangle', vol: 0.06 }),
  door: () => { noise({ dur: 0.3, type: 'lowpass', f: 400, f2: 120, vol: 0.25 }); tone({ f: 220, f2: 330, dur: 0.25, type: 'triangle', vol: 0.08, delay: 0.1 }); },
  chest: () => [659, 784, 988, 1318].forEach((f, i) => tone({ f, f2: f, dur: 0.22, type: 'triangle', vol: 0.11, delay: i * 0.06 })),
  heal: () => [523, 784, 1046].forEach((f, i) => tone({ f, f2: f * 1.01, dur: 0.4, type: 'sine', vol: 0.12, delay: i * 0.1 })),
  roar: () => { tone({ f: 140, f2: 50, dur: 0.9, type: 'sawtooth', vol: 0.18 }); noise({ dur: 0.8, type: 'lowpass', f: 700, f2: 150, vol: 0.4 }); },
  bossIntro: () => { tone({ f: 55, f2: 55, dur: 1.4, vol: 0.5 }); [220, 208, 196].forEach((f, i) => tone({ f, f2: f, dur: 0.5, type: 'sawtooth', vol: 0.05, delay: 0.3 + i * 0.35 })); },
  lose: () => [392, 330, 262].forEach((f, i) => tone({ f, f2: f * 0.98, dur: 0.4, type: 'triangle', vol: 0.12, delay: i * 0.18 })),
};

// 给背景音乐模块用：拿到同一个 AudioContext 和噪声样本
export const getAudio = () => (ac ? { ac, noiseBuf } : null);

export function sfx(name) {
  if (!ac || ac.state !== 'running') return;
  // 同一帧多个敌人被打中时，只播一次，避免爆音
  const now = performance.now();
  if (now - (lastPlayed[name] || 0) < 30) return;
  lastPlayed[name] = now;
  try { SOUNDS[name]?.(); } catch { /* 忽略 */ }
}
