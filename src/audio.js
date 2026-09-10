export class AudioBus {
  constructor(muted = false) {
    this.muted = muted;
  }
  unlock() {
    if (!this.context)
      this.context = new (window.AudioContext || window.webkitAudioContext)();
    if (this.context.state === "suspended") this.context.resume();
  }
  play(kind) {
    if (this.muted || !this.context || this.context.state !== "running") return;
    const ctx = this.context,
      now = ctx.currentTime;
    const osc = ctx.createOscillator(),
      gain = ctx.createGain();
    const tones = {
      shot: [270, 90, 0.055],
      blast: [95, 28, 0.3],
      pickup: [580, 1150, 0.2],
      hit: [160, 50, 0.16],
      win: [480, 960, 0.6],
    };
    const [from, to, duration] = tones[kind] || tones.shot;
    osc.type = kind === "shot" || kind === "blast" ? "triangle" : "sine";
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(to, now + duration);
    gain.gain.setValueAtTime(kind === "shot" ? 0.025 : 0.065, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(now + duration);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
}
