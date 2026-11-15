// Every sound is synthesised with WebAudio: noise bursts for gunfire, a filtered
// sweep for explosions, sine blips for the bomb. No audio files, no network.
// Sounds are quiet with distance; the master gain and the M key mute everything.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    const len = ctx.sampleRate * 0.5;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function noise(dur, filterFreq, gain, when = 0) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  function tone(freq, dur, gain, type = 'sine', slideTo = 0, when = 0) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Distance attenuation: 1 at the ear, ~0.15 at 30 m.
  function atten(dist) {
    return 1 / (1 + dist * 0.14);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    get muted() { return muted; },
    shoot(kind, dist = 0) {
      const a = atten(dist);
      if (kind === 'rifle') { noise(0.09, 3200, 0.5 * a); tone(160, 0.07, 0.3 * a, 'square', 60); }
      else if (kind === 'smg') { noise(0.06, 3800, 0.4 * a); tone(200, 0.05, 0.22 * a, 'square', 80); }
      else if (kind === 'pistol') { noise(0.08, 2600, 0.45 * a); tone(140, 0.06, 0.28 * a, 'square', 55); }
      else { noise(0.12, 1800, 0.5 * a); tone(120, 0.1, 0.3 * a, 'square', 50); }
    },
    dryFire() { tone(1200, 0.03, 0.12, 'square'); },
    reload() { tone(900, 0.04, 0.15, 'square'); tone(600, 0.04, 0.15, 'square', 0, 0.12); },
    hitmarker(killed) { tone(killed ? 1500 : 1100, 0.05, 0.2, 'sine'); },
    hurt() { noise(0.15, 500, 0.4); tone(90, 0.18, 0.3, 'sawtooth', 50); },
    explosion(dist = 0) {
      const a = atten(dist);
      noise(0.9, 900, 0.9 * a);
      tone(70, 0.8, 0.7 * a, 'sine', 28);
      noise(0.3, 4000, 0.3 * a, 0.05);
    },
    beep() { tone(1250, 0.07, 0.22, 'sine'); },
    plant() { tone(700, 0.08, 0.2, 'sine'); tone(1050, 0.08, 0.2, 'sine', 0, 0.1); },
    defuseTick() { tone(950, 0.05, 0.15, 'sine'); },
    buy() { tone(880, 0.06, 0.18, 'sine'); tone(1320, 0.08, 0.18, 'sine', 0, 0.07); },
    denied() { tone(220, 0.12, 0.2, 'square', 160); },
    roundWin() { tone(523, 0.14, 0.25, 'sine'); tone(784, 0.22, 0.25, 'sine', 0, 0.14); },
    roundLose() { tone(392, 0.16, 0.25, 'sine'); tone(262, 0.28, 0.25, 'sine', 0, 0.16); },
    step() { noise(0.05, 700, 0.06); },
  };
}
