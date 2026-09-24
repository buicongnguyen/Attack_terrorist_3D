// Synthesized effects: layered tones and filtered noise, no audio files to download.
export class AudioBus {
  constructor(muted = false) {
    this.muted = muted;
    this.last = new Map();
  }

  unlock() {
    if (!this.context) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      this.context = new Context();
      this.master = this.context.createDynamicsCompressor();
      this.master.threshold.value = -14;
      this.master.ratio.value = 6;
      const gain = this.context.createGain();
      gain.gain.value = 0.8;
      this.master.connect(gain);
      gain.connect(this.context.destination);
      const length = this.context.sampleRate;
      this.noiseBuffer = this.context.createBuffer(1, length, this.context.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.context.state === "suspended") this.context.resume();
  }

  tone(type, from, to, duration, volume, delay = 0) {
    const ctx = this.context,
      start = ctx.currentTime + delay;
    const osc = ctx.createOscillator(),
      gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  noise(duration, filter, from, to, volume, delay = 0) {
    const ctx = this.context,
      start = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const biquad = ctx.createBiquadFilter();
    biquad.type = filter;
    biquad.frequency.setValueAtTime(from, start);
    biquad.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(biquad);
    biquad.connect(gain);
    gain.connect(this.master);
    source.start(start, Math.random() * 0.5);
    source.stop(start + duration + 0.05);
    source.onended = () => {
      source.disconnect();
      biquad.disconnect();
      gain.disconnect();
    };
  }

  play(kind) {
    if (this.muted || !this.context || this.context.state !== "running") return;
    // Rate-limit identical sounds so salvos and chain reactions stay pleasant.
    const now = this.context.currentTime;
    if (now - (this.last.get(kind) ?? -1) < (kind === "shot" ? 0.04 : 0.06)) return;
    this.last.set(kind, now);
    switch (kind) {
      case "shot":
        this.tone("triangle", 300, 90, 0.06, 0.03);
        this.noise(0.04, "highpass", 3000, 1500, 0.015);
        break;
      case "release":
        this.noise(0.4, "bandpass", 1400, 350, 0.08);
        this.tone("sine", 180, 90, 0.2, 0.05);
        break;
      case "crunch":
        this.noise(0.14, "lowpass", 900, 200, 0.12);
        this.tone("square", 120, 60, 0.09, 0.03);
        break;
      case "pop":
        this.tone("sine", 700, 220, 0.1, 0.06);
        this.noise(0.1, "highpass", 2000, 800, 0.05);
        break;
      case "flak":
        this.noise(0.2, "bandpass", 500, 180, 0.12);
        this.tone("triangle", 140, 60, 0.12, 0.04);
        break;
      case "blast":
        this.noise(0.6, "lowpass", 1800, 120, 0.22);
        this.tone("sine", 95, 30, 0.45, 0.14);
        break;
      case "bigblast":
        this.noise(1.1, "lowpass", 2200, 80, 0.3);
        this.tone("sine", 70, 22, 0.9, 0.22);
        this.noise(0.25, "highpass", 3000, 1200, 0.08, 0.02);
        break;
      case "hit":
        this.tone("triangle", 170, 50, 0.16, 0.08);
        this.noise(0.12, "bandpass", 900, 300, 0.07);
        break;
      case "pickup":
        [660, 880, 1320].forEach((f, i) => this.tone("sine", f, f * 1.01, 0.14, 0.05, i * 0.06));
        break;
      case "radio":
        this.tone("square", 1400, 1400, 0.04, 0.015);
        this.tone("square", 1850, 1850, 0.05, 0.015, 0.06);
        break;
      case "win":
        [523, 659, 784, 1046].forEach((f, i) => this.tone("triangle", f, f, 0.22, 0.06, i * 0.12));
        break;
      case "fail":
        [392, 311, 262].forEach((f, i) => this.tone("triangle", f, f * 0.98, 0.26, 0.05, i * 0.16));
        break;
      default:
        this.tone("sine", 300, 150, 0.08, 0.03);
    }
  }
}
