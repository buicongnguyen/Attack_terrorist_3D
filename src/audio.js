// Synthesized effects: layered tones, filtered noise and ring-modulated static, no audio files to
// download. Every cue is data in CUES (5.1 J1), so a change after a listen is a data change.

// The debrief's star cue (5.1): C5, E5 and G5.
export const STAR_NOTES = [523.25, 659.25, 783.99];

// Layers. A tone is an oscillator swept from `from` to `to` Hz; noise runs through a filter swept
// the same way; static is filtered noise through a gain swung by a `hz` oscillator (ring
// modulation). Times are seconds; `delay` starts a layer late.
const tone = (wave, from, to, time, volume, delay = 0) => ({ tone: wave, from, to, time, volume, delay });
const noise = (filter, from, to, time, volume, delay = 0) => ({ noise: filter, from, to, time, volume, delay });
const ring = (filter, from, to, time, volume, hz, delay = 0) => ({ static: filter, from, to, time, volume, hz, delay });

// The cue table: all that play() knows, and exactly what the Sound test panel lists
// (?qa&listen=1, in Mission control).
// - gap: the shortest time between two plays of the cue (salvos and chain reactions stay pleasant);
// - steps: a pitch per step, either `ratios` (one per step) or `semitone` a step up to `max`;
// - stinger: plays past the three one-shot buses and ducks them for its length;
// - rate (lockBeep): beeps a second from `far` to `near` as a missile closes inside `range` m;
// - hum (laserHum): one persistent oscillator pair, its pitch `rise` Hz higher at full heat;
// - fresh: new in 5.1 (the listen gate), listed first.
export const CUES = {
  // ---- new in 5.1
  enemyLaunch: { label: "Enemy launch", note: "a rising noise sweep as a hostile missile leaves its rail", fresh: true, gap: 0.12, layers: [noise("bandpass", 300, 2400, 0.45, 0.07), tone("sawtooth", 90, 260, 0.35, 0.018)] },
  lockBeep: {
    label: "Missile lock",
    note: "2 to 8 beeps a second as a hostile missile closes",
    fresh: true,
    gap: 0.12,
    rate: { far: 2, near: 8, range: 28 },
    layers: [tone("square", 1250, 1250, 0.05, 0.018), tone("sine", 2500, 2500, 0.04, 0.01)],
  },
  rocketWhoosh: { label: "Rocket salvo", note: "Marlin's and Lantern's rockets", fresh: true, gap: 0.08, layers: [noise("bandpass", 600, 2800, 0.35, 0.09), noise("lowpass", 500, 150, 0.25, 0.06), tone("triangle", 220, 120, 0.12, 0.03)] },
  laserHum: {
    label: "Laser hum",
    note: "held while the beam fires, rising with heat",
    fresh: true,
    hum: { waves: ["sawtooth", "square"], base: 140, rise: 160, detune: 7, filter: 1800, volume: 0.03 },
  },
  shellWhistle: { label: "Shell whistle", note: "flak volleys, 1800 to 400 Hz over 0.9 s", fresh: true, gap: 0.2, layers: [tone("sine", 1800, 400, 0.9, 0.035), tone("triangle", 1810, 405, 0.9, 0.012)] },
  bargeClang: { label: "Barge hit", note: "a struck steel hull, not Marlin's hit", fresh: true, gap: 0.08, layers: [tone("square", 420, 380, 0.25, 0.035), tone("triangle", 1130, 1080, 0.35, 0.03), noise("bandpass", 2400, 1200, 0.12, 0.05)] },
  enemyShot: { label: "Enemy shot", note: "lower than the player's gun", fresh: true, gap: 0.05, layers: [tone("square", 160, 60, 0.08, 0.022), noise("lowpass", 1400, 500, 0.06, 0.03)] },
  comboTick: { label: "Combo tick", note: "a semitone higher per kill in a chain, up to +12", fresh: true, gap: 0.05, steps: { semitone: 1, max: 12 }, layers: [tone("triangle", 880, 880, 0.09, 0.045), tone("sine", 1760, 1760, 0.06, 0.012)] },
  glassTinkle: { label: "Glass", note: "curtain-wall glass breaking", fresh: true, gap: 0.08, layers: [tone("sine", 2637, 2600, 0.25, 0.02), tone("sine", 3520, 3480, 0.2, 0.015, 0.04), noise("highpass", 6000, 4000, 0.18, 0.03)] },
  thump: { label: "Low thump", note: "under every big blast", fresh: true, gap: 0.1, layers: [tone("sine", 58, 32, 0.5, 0.24), noise("lowpass", 240, 60, 0.35, 0.12)] },
  intercept: { label: "Marrow intercept", note: "ring-modulated static as Marrow breaks in", fresh: true, gap: 0.5, layers: [ring("bandpass", 1800, 900, 0.45, 0.09, 37), tone("square", 620, 610, 0.06, 0.012, 0.38)] },
  missionStart: {
    label: "Mission start",
    note: "stinger at launch",
    fresh: true,
    stinger: true,
    layers: [tone("triangle", 392, 392, 0.16, 0.05), tone("triangle", 523.25, 523.25, 0.16, 0.05, 0.14), tone("triangle", 659.25, 659.25, 0.16, 0.05, 0.28), tone("triangle", 783.99, 783.99, 0.9, 0.06, 0.42)],
  },
  objectiveMet: {
    label: "Objective met",
    note: "stinger when a canal stretch is cleared or a goal reached",
    fresh: true,
    stinger: true,
    layers: [tone("triangle", 659.25, 659.25, 0.18, 0.05), tone("triangle", 987.77, 987.77, 0.5, 0.055, 0.12), tone("sine", 1975.5, 1975.5, 0.3, 0.012, 0.16)],
  },
  win: {
    label: "Win",
    note: "stinger on a mission won",
    fresh: true,
    stinger: true,
    layers: [tone("triangle", 523.25, 523.25, 0.22, 0.06), tone("triangle", 659.25, 659.25, 0.22, 0.06, 0.12), tone("triangle", 783.99, 783.99, 0.22, 0.06, 0.24), tone("triangle", 1046.5, 1046.5, 1.2, 0.065, 0.36)],
  },
  fail: {
    label: "Fail",
    note: "stinger on a mission lost",
    fresh: true,
    stinger: true,
    layers: [tone("triangle", 392, 388, 0.26, 0.05), tone("triangle", 311.13, 308, 0.26, 0.05, 0.16), tone("triangle", 261.63, 258, 0.26, 0.05, 0.32), tone("sine", 196, 180, 1.3, 0.06, 0.48)],
  },
  // ---- kept from earlier releases
  shot: { label: "Gun", note: "the player's guns", gap: 0.04, layers: [tone("triangle", 300, 90, 0.06, 0.03), noise("highpass", 3000, 1500, 0.04, 0.015)] },
  release: { label: "Bomb release", gap: 0.06, layers: [noise("bandpass", 1400, 350, 0.4, 0.08), tone("sine", 180, 90, 0.2, 0.05)] },
  crunch: { label: "Drill crunch", gap: 0.06, layers: [noise("lowpass", 900, 200, 0.14, 0.12), tone("square", 120, 60, 0.09, 0.03)] },
  // A flock taking off: quick soft wing claps.
  flutter: { label: "Birds take off", gap: 0.06, layers: [0, 0.062, 0.1, 0.162, 0.2, 0.262].map((delay) => noise("bandpass", 2400, 1300, 0.035, 0.022, delay)) },
  pop: { label: "Cluster pop", gap: 0.06, layers: [tone("sine", 700, 220, 0.1, 0.06), noise("highpass", 2000, 800, 0.1, 0.05)] },
  flak: { label: "Flak burst", gap: 0.06, layers: [noise("bandpass", 500, 180, 0.2, 0.12), tone("triangle", 140, 60, 0.12, 0.04)] },
  blast: { label: "Blast", gap: 0.06, layers: [noise("lowpass", 1800, 120, 0.6, 0.22), tone("sine", 95, 30, 0.45, 0.14)] },
  bigblast: { label: "Big blast", gap: 0.06, layers: [noise("lowpass", 2200, 80, 1.1, 0.3), tone("sine", 70, 22, 0.9, 0.22), noise("highpass", 3000, 1200, 0.25, 0.08, 0.02)] },
  hit: { label: "Player hit", gap: 0.06, layers: [tone("triangle", 170, 50, 0.16, 0.08), noise("bandpass", 900, 300, 0.12, 0.07)] },
  pickup: { label: "Pickup", gap: 0.06, layers: [660, 880, 1320].map((f, i) => tone("sine", f, f * 1.01, 0.14, 0.05, i * 0.06)) },
  radio: { label: "Radio chirp", gap: 0.06, layers: [tone("square", 1400, 1400, 0.04, 0.015), tone("square", 1850, 1850, 0.05, 0.015, 0.06)] },
  // The debrief's stars (5.1): C5, E5, G5, one note a star, with a soft sparkle above.
  star: {
    label: "Debrief star",
    gap: 0.06,
    steps: { ratios: STAR_NOTES.map((f) => f / STAR_NOTES[0]) },
    layers: [tone("triangle", STAR_NOTES[0], STAR_NOTES[0], 0.28, 0.07), tone("sine", STAR_NOTES[0] * 2, STAR_NOTES[0] * 2, 0.18, 0.02, 0.03)],
  },
};

// The mix: three one-shot buses by screen third (left, middle, right), a stinger's 6 dB duck, the
// voice and node caps (the oldest one-shot is dropped first) and the rest rule: the context
// suspends while the tab is hidden, or after `rest` s paused with no dialog open.
export const MIX = { pan: [-0.6, 0, 0.6], duck: 0.5, voices: 24, nodes: 100, rest: 2 };

const NODES = { tone: 2, noise: 3, static: 5 };
// The nodes a cue's one-shot creates, and how long it rings.
export const nodesOf = (cue) => cue.layers.reduce((n, layer) => n + (layer.tone ? NODES.tone : layer.noise ? NODES.noise : NODES.static), 0);
export const lengthOf = (cue) => Math.max(...cue.layers.map((layer) => layer.delay + layer.time));

export class AudioBus {
  // `Context` stands in for the browser's AudioContext (tests pass a fake).
  constructor(muted = false, Context = null) {
    this.muted = muted;
    this.Context = Context;
    this.last = new Map();
    // Live one-shots, oldest first: { nodes, sources, ended }.
    this.voices = [];
    this.liveNodes = 0;
    this.lockAt = -Infinity;
    this.humming = false;
    this.humHeat = -1;
    this.pausedFor = 0;
    this.resting = false;
    // A resume asked for and not yet settled: cues count as live and are scheduled meanwhile.
    this.waking = false;
  }

  unlock() {
    if (!this.context) {
      const Context = this.Context || globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) return;
      this.context = new Context();
      this.master = this.context.createDynamicsCompressor();
      this.master.threshold.value = -14;
      this.master.ratio.value = 6;
      const gain = this.context.createGain();
      gain.gain.value = 0.8;
      this.master.connect(gain);
      gain.connect(this.context.destination);
      // One-shots: three panned buses into the duck a stinger pulls down (plain gains where the
      // browser has no StereoPanner: Safari before 14.1).
      this.duck = this.context.createGain();
      this.duck.connect(this.master);
      this.buses = MIX.pan.map((pan) => {
        const bus = this.context.createStereoPanner ? this.context.createStereoPanner() : this.context.createGain();
        if (bus.pan) bus.pan.value = pan;
        bus.connect(this.duck);
        return bus;
      });
      const length = this.context.sampleRate;
      this.noiseBuffer = this.context.createBuffer(1, length, this.context.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    // Inside the gesture, so iOS lets it resume.
    if (this.context.state === "suspended") this.wake();
  }

  // Resume is asynchronous: until it settles the context is waking, and cues played meanwhile
  // (Launch's stinger, the first frame after a rest) are scheduled, not dropped.
  wake() {
    this.resting = false;
    this.pausedFor = 0;
    this.waking = true;
    const settle = () => (this.waking = false);
    Promise.resolve(this.context.resume()).then(settle, settle);
  }

  // Whether a cue would sound now: callers skip placing one (its screen third) when not.
  get live() {
    return !this.muted && Boolean(this.context) && (this.context.state === "running" || this.waking || this.resting);
  }

  // The rest rule, from the UI every few frames, and at once when the tab hides.
  idle(dt, hidden, paused, dialog) {
    if (!this.context) return;
    this.pausedFor = paused && !dialog ? this.pausedFor + dt : 0;
    if ((hidden || this.pausedFor >= MIX.rest) && this.context.state === "running") {
      this.context.suspend();
      this.resting = true;
    }
  }

  // A context the rest rule suspended wakes before any cue, so the debrief and menus always sound.
  ready() {
    if (this.muted || !this.context) return false;
    if (this.context.state === "running" || this.waking) return true;
    if (!this.resting) return false;
    this.wake();
    return true;
  }

  // A one-shot is a voice; past the voice or node cap the oldest is dropped first.
  voice(cue) {
    const need = nodesOf(cue);
    while (this.voices.length && (this.voices.length >= MIX.voices || this.liveNodes + need > MIX.nodes)) this.drop(this.voices[0], true);
    const voice = { nodes: [], sources: [], ended: 0 };
    this.voices.push(voice);
    return voice;
  }

  // A voice leaves the mix: when its last source ends, or cut short by a newer one.
  drop(voice, cut = false) {
    const index = this.voices.indexOf(voice);
    if (index < 0) return;
    this.voices.splice(index, 1);
    this.liveNodes -= voice.nodes.length;
    for (const source of voice.sources) {
      source.onended = null;
      if (cut) source.stop();
    }
    for (const node of voice.nodes) node.disconnect();
  }

  // A layer's nodes join its voice; the voice is released when its last source ends.
  own(voice, nodes, ...sources) {
    voice.nodes.push(...nodes);
    this.liveNodes += nodes.length;
    const ended = () => {
      if (++voice.ended === voice.sources.length) this.drop(voice);
    };
    for (const source of sources) {
      voice.sources.push(source);
      source.onended = ended;
    }
  }

  envelope(gain, start, volume, attack, time) {
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + time);
  }

  layer(voice, layer, pitch, out) {
    const ctx = this.context,
      start = ctx.currentTime + layer.delay,
      end = start + layer.time,
      gain = ctx.createGain();
    gain.connect(out);
    if (layer.tone) {
      const osc = ctx.createOscillator();
      osc.type = layer.tone;
      osc.frequency.setValueAtTime(layer.from * pitch, start);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, layer.to * pitch), end);
      this.envelope(gain, start, layer.volume, 0.01, layer.time);
      osc.connect(gain);
      osc.start(start);
      osc.stop(end + 0.02);
      this.own(voice, [osc, gain], osc);
      return;
    }
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = layer.noise || layer.static;
    filter.frequency.setValueAtTime(layer.from * pitch, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, layer.to * pitch), end);
    source.connect(filter);
    this.envelope(gain, start, layer.volume, 0.015, layer.time);
    source.start(start, Math.random() * 0.5);
    source.stop(end + 0.05);
    if (layer.noise) {
      filter.connect(gain);
      this.own(voice, [source, filter, gain], source);
      return;
    }
    // Static: the filtered noise passes a gain whose level an oscillator swings through zero.
    const swing = ctx.createGain(),
      osc = ctx.createOscillator();
    swing.gain.value = 0;
    osc.frequency.value = layer.hz;
    osc.connect(swing.gain);
    filter.connect(swing);
    swing.connect(gain);
    osc.start(start);
    osc.stop(end + 0.05);
    this.own(voice, [source, filter, swing, osc, gain], source, osc);
  }

  // `step` picks the cue's pitch step; `bus` the screen third it comes from (0 left, 2 right).
  play(kind, step = 0, bus = 1) {
    const cue = CUES[kind];
    if (!this.ready()) return;
    const now = this.context.currentTime;
    if (now - (this.last.get(kind) ?? -1) < cue.gap) return;
    this.last.set(kind, now);
    this.sound(cue, step, bus);
  }

  sound(cue, step = 0, bus = 1) {
    const steps = cue.steps,
      pitch = !steps ? 1 : steps.ratios ? steps.ratios[Math.min(step, steps.ratios.length - 1)] : 2 ** ((Math.min(step, steps.max) * steps.semitone) / 12);
    const voice = this.voice(cue),
      out = cue.stinger ? this.master : this.buses[bus];
    for (const layer of cue.layers) this.layer(voice, layer, pitch, out);
    if (cue.stinger) {
      const now = this.context.currentTime,
        until = now + lengthOf(cue),
        duck = this.duck.gain;
      duck.cancelScheduledValues(now);
      duck.setValueAtTime(duck.value, now);
      duck.linearRampToValueAtTime(MIX.duck, now + 0.04);
      duck.setValueAtTime(MIX.duck, until);
      duck.linearRampToValueAtTime(1, until + 0.2);
    }
  }

  // Missile lock: beeps faster as the nearest hostile missile closes; none outside the range.
  lock(distance) {
    const cue = CUES.lockBeep,
      rate = cue.rate;
    if (distance > rate.range || !this.ready()) return;
    const hz = rate.far + (rate.near - rate.far) * (1 - distance / rate.range),
      now = this.context.currentTime;
    if (now - this.lockAt < Math.max(1 / hz, cue.gap)) return;
    this.lockAt = now;
    this.sound(cue);
  }

  // The laser's hum: one oscillator pair made on first use and kept, faded in and out.
  hum(on, heat = 0) {
    // Muted, a running hum fades out.
    if (this.muted) on = false;
    if (on === this.humming && (!on || Math.abs(heat - this.humHeat) <= 0.02)) return;
    if (on && !this.ready()) return;
    if (!this.context) return;
    const spec = CUES.laserHum.hum,
      ctx = this.context;
    if (!this.humNodes) {
      const gain = ctx.createGain(),
        filter = ctx.createBiquadFilter();
      gain.gain.value = 0;
      filter.type = "lowpass";
      filter.frequency.value = spec.filter;
      filter.connect(gain);
      gain.connect(this.buses[1]);
      const oscs = spec.waves.map((wave, i) => {
        const osc = ctx.createOscillator();
        osc.type = wave;
        osc.detune.value = i * spec.detune;
        osc.connect(filter);
        osc.start();
        return osc;
      });
      this.humNodes = { gain, filter, oscs };
    }
    const now = ctx.currentTime,
      nodes = this.humNodes;
    if (on !== this.humming) nodes.gain.gain.setTargetAtTime(on ? spec.volume : 0, now, on ? 0.03 : 0.06);
    this.humming = on;
    if (on) {
      this.humHeat = heat;
      for (const osc of nodes.oscs) osc.frequency.setTargetAtTime(spec.base + spec.rise * heat, now, 0.05);
    }
  }

  // The Sound test panel (?qa&listen=1): a cue as it sounds in a mission, past its gap. Returns
  // how long it lasts in seconds (0 while sound is off).
  preview(kind, later = (work, ms) => setTimeout(work, ms)) {
    this.unlock();
    if (this.muted || !this.context) return 0;
    const cue = CUES[kind];
    if (cue.hum) {
      // The beam held for 1.5 s from cold to hot.
      for (let i = 0; i <= 10; i++) later(() => this.hum(i < 10, i / 10), i * 150);
      return 1.8;
    }
    if (cue.rate) {
      // A missile closing from the edge of the range to impact over 2 s.
      for (let ms = 0; ms < 2000; ms += 60) later(() => this.lock(cue.rate.range * (1 - ms / 2000)), ms);
      return 2.2;
    }
    const steps = cue.steps ? (cue.steps.ratios?.length ?? 6) : 1;
    for (let i = 0; i < steps; i++) later(() => this.sound(cue, i), i * 300);
    return (steps - 1) * 0.3 + lengthOf(cue);
  }
}
