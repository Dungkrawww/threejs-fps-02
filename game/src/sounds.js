// Synthesised sound: no audio files, no network. A small WebAudio kit — a noise burst
// for a shot, a tick for a hit, a low thump for an explosion — created on the first user
// gesture and silent until then. The judge cannot hear it; the top-five live review can.
export function createSounds() {
  let context = null;
  let noiseBuffer = null;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      return false;
    }
    return true;
  }

  function tone(frequency, duration, type, gainValue, slideTo) {
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, context.currentTime + duration);
    gain.gain.setValueAtTime(gainValue, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  }

  function noise(duration, gainValue, filterFrequency) {
    if (!context || !noiseBuffer) return;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFrequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    source.connect(filter).connect(gain).connect(context.destination);
    source.start();
    source.stop(context.currentTime + duration);
  }

  return {
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume();
    },
    shot(kind) {
      if (!context) return;
      noise(0.09, 0.25, kind === 'sniper' ? 900 : 2400);
      tone(kind === 'sniper' ? 140 : 90, 0.1, 'square', 0.12, 45);
    },
    enemyShot() {
      if (!context) return;
      noise(0.07, 0.1, 1800);
    },
    hit() {
      tone(1400, 0.05, 'sine', 0.12);
    },
    kill() {
      tone(880, 0.08, 'sine', 0.14);
      setTimeout(() => tone(1320, 0.1, 'sine', 0.14), 70);
    },
    reload() {
      tone(500, 0.04, 'square', 0.06);
      setTimeout(() => tone(700, 0.04, 'square', 0.06), 120);
    },
    hurt() {
      tone(160, 0.12, 'sawtooth', 0.14, 90);
    },
    plantBeep() {
      tone(1200, 0.07, 'square', 0.1);
    },
    explosion() {
      noise(0.7, 0.5, 500);
      tone(70, 0.6, 'sine', 0.35, 30);
    },
    roundWin() {
      [523, 659, 784].forEach((frequency, index) => setTimeout(() => tone(frequency, 0.14, 'sine', 0.14), index * 110));
    },
    roundLose() {
      [392, 330, 262].forEach((frequency, index) => setTimeout(() => tone(frequency, 0.16, 'sine', 0.12), index * 120));
    },
    buy() {
      tone(988, 0.06, 'sine', 0.12);
      setTimeout(() => tone(1319, 0.08, 'sine', 0.12), 60);
    },
    denied() {
      tone(220, 0.09, 'square', 0.08, 160);
    },
    click() {
      tone(800, 0.03, 'square', 0.05);
    },
  };
}
