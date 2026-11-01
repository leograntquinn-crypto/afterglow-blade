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
  lose: () => [392, 330, 262].forEach((f, i) => tone({ f, f2: f * 0.98, dur: 0.4, type: 'triangle', vol: 0.12, delay: i * 0.18 })),
};

export function sfx(name) {
  if (!ac || ac.state !== 'running') return;
  // 同一帧多个敌人被打中时，只播一次，避免爆音
  const now = performance.now();
  if (now - (lastPlayed[name] || 0) < 30) return;
  lastPlayed[name] = now;
  try { SOUNDS[name]?.(); } catch { /* 忽略 */ }
}
