// ===== Procedural WebAudio engine =====
// Zero-asset sound: every SFX is synthesized at runtime.
// Includes: UI clicks, footsteps, item SFX, oni attack, capture sting,
// DbD-style terror-radius heartbeat, ambient night loop, chase music layer.

let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let muted = false;

function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 1.0;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.65;
    musicBus.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function initAudio() { ac(); }
export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.85;
  try { localStorage.setItem('wtag_mute', m ? '1' : '0'); } catch (e) {}
}
export function isMuted() { return muted; }
export function loadMutePref() {
  try { if (localStorage.getItem('wtag_mute') === '1') setMuted(true); } catch (e) {}
}

// ---------- primitive builders ----------
function env(g, t0, a, d, peak = 1, sustain = 0) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t0 + a + d);
}

function osc(type, freq, t0, dur, gainVal = 0.3, dest = null, detune = 0) {
  const c = ac();
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  o.detune.value = detune;
  const g = c.createGain();
  env(g, t0, 0.005, dur, gainVal);
  o.connect(g).connect(dest || sfxBus);
  o.start(t0);
  o.stop(t0 + dur + 0.1);
  return o;
}

let noiseBuf = null;
function getNoise() {
  const c = ac();
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 1.2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function noise(t0, dur, gainVal = 0.25, filterFreq = 2000, type = 'lowpass', dest = null) {
  const c = ac();
  const src = c.createBufferSource();
  src.buffer = getNoise();
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = filterFreq;
  const g = c.createGain();
  env(g, t0, 0.004, dur, gainVal);
  src.connect(f).connect(g).connect(dest || sfxBus);
  src.start(t0);
  src.stop(t0 + dur + 0.1);
  return { src, filter: f, gain: g };
}

// ---------- UI ----------
export function sfxClick() {
  const c = ac(), t = c.currentTime;
  osc('square', 660, t, 0.06, 0.12);
  osc('square', 990, t + 0.04, 0.05, 0.08);
}
export function sfxBack() {
  const c = ac(), t = c.currentTime;
  osc('square', 440, t, 0.07, 0.1);
  osc('square', 330, t + 0.05, 0.07, 0.08);
}
export function sfxJoin() {
  const c = ac(), t = c.currentTime;
  [523, 659, 784].forEach((f, i) => osc('triangle', f, t + i * 0.07, 0.16, 0.14));
}
export function sfxCountTick() {
  const c = ac(), t = c.currentTime;
  osc('sine', 880, t, 0.08, 0.18);
}
export function sfxGameStart() {
  const c = ac(), t = c.currentTime;
  [392, 523, 659, 784].forEach((f, i) => osc('sawtooth', f, t + i * 0.09, 0.25, 0.12));
  noise(t, 0.5, 0.06, 1200, 'highpass');
}

// ---------- movement ----------
let stepAlt = false;
export function sfxFootstep(speedNorm = 0.5, isOni = false) {
  const c = ac(), t = c.currentTime;
  stepAlt = !stepAlt;
  const base = isOni ? 70 : 110;
  const f = base + (stepAlt ? 14 : 0) + Math.random() * 12;
  const g = (0.05 + speedNorm * 0.09) * (isOni ? 1.5 : 1);
  // thump
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(f * 2, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
  const og = c.createGain();
  env(og, t, 0.002, 0.09, g);
  o.connect(og).connect(sfxBus);
  o.start(t); o.stop(t + 0.15);
  // grass rustle
  noise(t, 0.05, g * 0.5, isOni ? 900 : 1600, 'bandpass');
}

export function sfxVault() {
  const c = ac(), t = c.currentTime;
  noise(t, 0.18, 0.18, 1100, 'bandpass');
  osc('triangle', 240, t + 0.05, 0.12, 0.1);
  osc('sine', 130, t + 0.16, 0.1, 0.16);
}

export function sfxDashStart() {
  const c = ac(), t = c.currentTime;
  const n = noise(t, 0.25, 0.1, 600, 'highpass');
  n.filter.frequency.linearRampToValueAtTime(2800, t + 0.22);
}

// ---------- combat ----------
export function sfxSwing() {
  const c = ac(), t = c.currentTime;
  const n = noise(t, 0.22, 0.3, 400, 'bandpass');
  n.filter.frequency.setValueAtTime(300, t);
  n.filter.frequency.exponentialRampToValueAtTime(3200, t + 0.16);
  n.filter.Q.value = 1.2;
}
export function sfxHit() {
  const c = ac(), t = c.currentTime;
  // meaty impact
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(180, t);
  o.frequency.exponentialRampToValueAtTime(50, t + 0.18);
  const g = c.createGain();
  env(g, t, 0.002, 0.25, 0.55);
  o.connect(g).connect(sfxBus);
  o.start(t); o.stop(t + 0.3);
  noise(t, 0.12, 0.3, 800, 'lowpass');
  // sting
  osc('sawtooth', 110, t + 0.02, 0.3, 0.18);
  osc('sawtooth', 116, t + 0.02, 0.3, 0.14);
}
export function sfxWhiff() {
  const c = ac(), t = c.currentTime;
  const n = noise(t, 0.18, 0.14, 500, 'bandpass');
  n.filter.frequency.exponentialRampToValueAtTime(180, t + 0.16);
}
export function sfxCaptured() {
  const c = ac(), t = c.currentTime;
  // dramatic descending sting
  [440, 415, 392, 370].forEach((f, i) => {
    osc('sawtooth', f, t + i * 0.12, 0.3, 0.14);
    osc('sawtooth', f / 2, t + i * 0.12, 0.3, 0.12);
  });
  noise(t, 0.5, 0.08, 300, 'lowpass');
}
export function sfxRescue() {
  const c = ac(), t = c.currentTime;
  [523, 659, 784, 1047].forEach((f, i) => osc('triangle', f, t + i * 0.08, 0.22, 0.16));
}

// ---------- items ----------
export function sfxPickup() {
  const c = ac(), t = c.currentTime;
  osc('sine', 740, t, 0.08, 0.16);
  osc('sine', 988, t + 0.07, 0.12, 0.16);
}
export function sfxBoost() {
  const c = ac(), t = c.currentTime;
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(220, t);
  o.frequency.exponentialRampToValueAtTime(880, t + 0.3);
  const g = c.createGain();
  env(g, t, 0.01, 0.35, 0.14);
  o.connect(g).connect(sfxBus);
  o.start(t); o.stop(t + 0.4);
}
export function sfxFlash() {
  const c = ac(), t = c.currentTime;
  noise(t, 0.4, 0.35, 6000, 'highpass');
  osc('sine', 2400, t, 0.5, 0.18);
  osc('sine', 3600, t, 0.35, 0.1);
}
export function sfxWallPlace() {
  const c = ac(), t = c.currentTime;
  osc('square', 160, t, 0.18, 0.2);
  osc('sine', 320, t + 0.04, 0.22, 0.14);
  noise(t, 0.1, 0.1, 500, 'lowpass');
}
export function sfxSmoke() {
  const c = ac(), t = c.currentTime;
  const n = noise(t, 0.9, 0.18, 700, 'lowpass');
  n.filter.frequency.exponentialRampToValueAtTime(250, t + 0.8);
}
export function sfxDecoy() {
  const c = ac(), t = c.currentTime;
  [392, 494, 587].forEach((f, i) => osc('triangle', f, t + i * 0.06, 0.18, 0.12, null, 8));
  osc('sine', 1175, t + 0.18, 0.25, 0.08);
}
export function sfxDrink() {
  const c = ac(), t = c.currentTime;
  for (let i = 0; i < 4; i++) {
    osc('sine', 300 + i * 110 + Math.random() * 40, t + i * 0.09, 0.07, 0.1);
  }
  osc('triangle', 880, t + 0.4, 0.2, 0.12);
}
export function sfxDetector() {
  const c = ac(), t = c.currentTime;
  for (let i = 0; i < 3; i++) {
    osc('sine', 1200, t + i * 0.16, 0.08, 0.14);
    osc('sine', 1800, t + i * 0.16 + 0.05, 0.06, 0.08);
  }
}
export function sfxTrapPlace() {
  const c = ac(), t = c.currentTime;
  osc('square', 200, t, 0.07, 0.14);
  osc('square', 140, t + 0.08, 0.09, 0.14);
}
export function sfxTrapSnap() {
  const c = ac(), t = c.currentTime;
  noise(t, 0.08, 0.4, 3000, 'highpass');
  osc('square', 90, t, 0.16, 0.3);
  osc('sawtooth', 130, t + 0.02, 0.2, 0.18);
}
export function sfxHaste() {
  const c = ac(), t = c.currentTime;
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(80, t);
  o.frequency.exponentialRampToValueAtTime(420, t + 0.45);
  const g = c.createGain();
  env(g, t, 0.02, 0.5, 0.2);
  o.connect(g).connect(sfxBus);
  o.start(t); o.stop(t + 0.55);
  noise(t, 0.45, 0.1, 900, 'bandpass');
}
export function sfxSignal() {
  const c = ac(), t = c.currentTime;
  osc('sine', 1567, t, 0.1, 0.12);
  osc('sine', 1318, t + 0.12, 0.1, 0.12);
  osc('sine', 1567, t + 0.24, 0.14, 0.12);
}
export function sfxUnfreeze() {
  const c = ac(), t = c.currentTime;
  // glass-shatter freedom
  noise(t, 0.3, 0.25, 4000, 'highpass');
  [880, 1100, 1320].forEach((f, i) => osc('triangle', f, t + i * 0.05, 0.2, 0.1));
  osc('sawtooth', 60, t, 0.5, 0.25);
}
export function sfxExplosion() {
  const c = ac(), t = c.currentTime;
  noise(t, 0.6, 0.5, 400, 'lowpass');
  osc('sine', 60, t, 0.5, 0.6);
  osc('sawtooth', 40, t, 0.4, 0.3);
}

// ---------- win / lose ----------
export function sfxWin() {
  const c = ac(), t = c.currentTime;
  const seq = [523, 659, 784, 1047, 784, 1047];
  seq.forEach((f, i) => {
    osc('triangle', f, t + i * 0.13, 0.3, 0.16);
    osc('sine', f / 2, t + i * 0.13, 0.3, 0.1);
  });
}
export function sfxLose() {
  const c = ac(), t = c.currentTime;
  const seq = [392, 370, 330, 262];
  seq.forEach((f, i) => {
    osc('sawtooth', f, t + i * 0.22, 0.4, 0.13);
    osc('sawtooth', f * 0.5, t + i * 0.22, 0.4, 0.1);
  });
}

// ---------- Heartbeat (terror radius) ----------
// continuous system: call setHeartbeat(intensity 0..1) each frame
let hb = null;
export function startHeartbeat() {
  if (hb) return;
  const c = ac();
  hb = {
    intensity: 0,
    nextBeat: c.currentTime + 0.5,
    gain: c.createGain(),
  };
  hb.gain.gain.value = 0;
  hb.gain.connect(master);
  hb.timer = setInterval(() => {
    if (!hb) return;
    const t = c.currentTime;
    if (hb.intensity <= 0.02) return;
    if (t >= hb.nextBeat) {
      const bpm = 55 + hb.intensity * 95;        // 55..150 bpm
      const period = 60 / bpm;
      hb.nextBeat = t + period;
      const vol = 0.25 + hb.intensity * 0.5;
      beat(t, vol);
      beat(t + period * 0.28, vol * 0.7);        // lub-dub
    }
  }, 30);
  function beat(t0, vol) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(58, t0);
    o.frequency.exponentialRampToValueAtTime(38, t0 + 0.12);
    const g = c.createGain();
    env(g, t0, 0.004, 0.16, vol);
    o.connect(g).connect(master);
    o.start(t0); o.stop(t0 + 0.25);
  }
}
export function setHeartbeat(intensity) {
  if (!hb) startHeartbeat();
  hb.intensity = Math.max(0, Math.min(1, intensity));
}
export function stopHeartbeat() {
  if (hb) { clearInterval(hb.timer); try { hb.gain.disconnect(); } catch (e) {} hb = null; }
}

// ---------- Ambient night loop ----------
let ambient = null;
export function startAmbient() {
  if (ambient) return;
  const c = ac();
  ambient = { nodes: [], crickets: null };
  // low wind
  const src = c.createBufferSource();
  src.buffer = getNoise();
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 220;
  const g = c.createGain();
  g.gain.value = 0.05;
  src.connect(f).connect(g).connect(musicBus);
  src.start();
  ambient.nodes.push(src, g);
  // slow LFO on wind
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoG = c.createGain();
  lfoG.gain.value = 0.03;
  lfo.connect(lfoG).connect(g.gain);
  lfo.start();
  ambient.nodes.push(lfo);
  // crickets: random chirps
  ambient.crickets = setInterval(() => {
    if (!ambient || muted) return;
    if (Math.random() < 0.5) {
      const t = c.currentTime + Math.random() * 0.4;
      const n = 2 + (Math.random() * 4 | 0);
      const fr = 3800 + Math.random() * 900;
      for (let i = 0; i < n; i++) {
        osc('sine', fr, t + i * 0.07, 0.03, 0.012, musicBus);
      }
    }
  }, 900);
}
export function stopAmbient() {
  if (!ambient) return;
  clearInterval(ambient.crickets);
  for (const nd of ambient.nodes) { try { nd.stop ? nd.stop() : nd.disconnect(); } catch (e) {} }
  ambient = null;
}

// ---------- Chase music layer ----------
// driving pulse that fades in when chased / chasing
let chase = null;
export function startChaseLayer() {
  if (chase) return;
  const c = ac();
  chase = { level: 0, gain: c.createGain(), seq: 0 };
  chase.gain.gain.value = 0;
  chase.gain.connect(musicBus);
  const NOTES = [55, 55, 58.27, 55, 65.41, 55, 61.74, 58.27]; // A1 minor-ish riff
  chase.timer = setInterval(() => {
    if (!chase || chase.level < 0.04 || muted) return;
    const t = c.currentTime;
    const f0 = NOTES[chase.seq % NOTES.length];
    chase.seq++;
    // bass pulse
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f0;
    const g = c.createGain();
    env(g, t, 0.01, 0.16, 0.22);
    o.connect(g).connect(chase.gain);
    o.start(t); o.stop(t + 0.22);
    const o2 = c.createOscillator();
    o2.type = 'square';
    o2.frequency.value = f0 * 2;
    const g2 = c.createGain();
    env(g2, t, 0.01, 0.1, 0.06);
    o2.connect(g2).connect(chase.gain);
    o2.start(t); o2.stop(t + 0.15);
    // hat
    if (chase.seq % 2 === 0) noise(t, 0.03, 0.05, 8000, 'highpass', chase.gain);
  }, 170);
}
export function setChaseLevel(v) {
  if (!chase) startChaseLayer();
  chase.level = Math.max(0, Math.min(1, v));
  const c = ac();
  chase.gain.gain.linearRampToValueAtTime(chase.level * 0.8, c.currentTime + 0.4);
}
export function stopChaseLayer() {
  if (chase) { clearInterval(chase.timer); try { chase.gain.disconnect(); } catch (e) {} chase = null; }
}

// stop all continuous audio (call on game end)
export function stopGameAudio() {
  stopHeartbeat();
  stopChaseLayer();
  stopAmbient();
}
