import test from "node:test";
import assert from "node:assert/strict";
import { AudioBus, CUES, MIX, lengthOf, nodesOf } from "../src/audio.js";

// A stand-in for the browser's AudioContext (5.1 J1): it counts the nodes made and still
// connected, and ends a source when the clock passes its stop time.
class Param {
  constructor(value = 0) {
    this.value = value;
  }
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
  linearRampToValueAtTime() {}
  setTargetAtTime() {}
  cancelScheduledValues() {}
}
class Node {
  constructor(ctx, kind) {
    this.ctx = ctx;
    this.kind = kind;
    ctx.made.push(this);
    ctx.live.add(this);
  }
  connect() {}
  disconnect() {
    this.ctx.live.delete(this);
  }
}
class Source extends Node {
  start() {
    this.started = true;
  }
  stop(at = this.ctx.currentTime) {
    this.stopAt = at;
    this.ctx.playing.add(this);
  }
}
class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 8000;
    this.state = "running";
    this.made = [];
    this.live = new Set();
    this.playing = new Set();
    this.destination = {};
    this.calls = { suspend: 0, resume: 0 };
  }
  createGain() {
    return Object.assign(new Node(this, "gain"), { gain: new Param(1) });
  }
  createDynamicsCompressor() {
    return Object.assign(new Node(this, "compressor"), { threshold: new Param(), ratio: new Param() });
  }
  createStereoPanner() {
    return Object.assign(new Node(this, "panner"), { pan: new Param() });
  }
  createBiquadFilter() {
    return Object.assign(new Node(this, "filter"), { frequency: new Param() });
  }
  createOscillator() {
    return Object.assign(new Source(this, "oscillator"), { frequency: new Param(), detune: new Param() });
  }
  createBufferSource() {
    return new Source(this, "buffer");
  }
  createBuffer(channels, length) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  suspend() {
    this.calls.suspend++;
    this.state = "suspended";
    return Promise.resolve();
  }
  // Like a browser, the state changes only when the promise settles.
  resume() {
    this.calls.resume++;
    return Promise.resolve().then(() => (this.state = "running"));
  }
  // Time passes: sources whose stop time has come end.
  advance(seconds) {
    this.currentTime += seconds;
    for (const source of this.playing)
      if (source.stopAt <= this.currentTime) {
        this.playing.delete(source);
        source.onended?.();
      }
  }
}

const open = (muted = false) => {
  const bus = new AudioBus(muted, FakeAudioContext);
  bus.unlock();
  return { bus, ctx: bus.context, fixed: bus.context.made.length };
};
const FRESH = Object.keys(CUES).filter((kind) => CUES[kind].fresh);
const ONE_SHOTS = Object.keys(CUES).filter((kind) => CUES[kind].layers);

test("the cue table: every new cue is listed, data only, and a stinger lasts 2.5 s at most", () => {
  for (const kind of ["enemyLaunch", "lockBeep", "rocketWhoosh", "laserHum", "shellWhistle", "bargeClang", "enemyShot", "comboTick", "glassTinkle", "thump", "intercept", "missionStart", "objectiveMet", "win", "fail"])
    assert.ok(CUES[kind]?.fresh, `${kind} is a new cue`);
  for (const [kind, cue] of Object.entries(CUES)) {
    assert.ok(cue.label, `${kind} has a label for the listen panel`);
    assert.ok(cue.layers || cue.hum, kind);
    if (cue.stinger) assert.ok(lengthOf(cue) <= 2.5, `${kind} lasts ${lengthOf(cue)} s`);
  }
  assert.equal(CUES.shellWhistle.layers[0].from, 1800);
  assert.equal(CUES.shellWhistle.layers[0].to, 400);
  assert.equal(CUES.shellWhistle.layers[0].time, 0.9);
});

test("every new cue makes at most 8 nodes and disconnects them all when it is done", () => {
  for (const kind of FRESH.filter((k) => CUES[k].layers)) {
    const { bus, ctx, fixed } = open();
    if (kind === "lockBeep") bus.lock(5);
    else bus.play(kind, 3, 2);
    const made = ctx.made.slice(fixed);
    assert.equal(made.length, nodesOf(CUES[kind]), kind);
    assert.ok(made.length > 0 && made.length <= 8, `${kind} makes ${made.length} nodes`);
    ctx.advance(3);
    assert.ok(made.every((node) => !ctx.live.has(node)), `${kind} left nodes connected`);
    assert.equal(bus.voices.length, 0);
    assert.equal(bus.liveNodes, 0);
  }
});

test("the old cues still sound, and only the flock's flutter goes past 8 nodes", () => {
  for (const kind of ONE_SHOTS) {
    const { bus, ctx, fixed } = open();
    bus.play(kind);
    const made = ctx.made.length - fixed;
    assert.ok(made > 0, kind);
    if (kind !== "flutter") assert.ok(made <= 8, `${kind} makes ${made}`);
  }
});

test("the laser hum held for 3 s makes its oscillators once, and fades out when let go", () => {
  const { bus, ctx, fixed } = open();
  for (let i = 0; i < 360; i++) {
    bus.hum(true, i / 360);
    ctx.advance(1 / 120);
  }
  bus.hum(false);
  for (let i = 0; i < 120; i++) bus.hum(false);
  bus.hum(true, 0.2);
  const made = ctx.made.slice(fixed);
  assert.equal(made.filter((n) => n.kind === "oscillator").length, 2);
  assert.equal(made.length, 4, "two oscillators, a filter and a gain");
  assert.equal(bus.humming, true);
});

test("muted, nothing is made", () => {
  const { bus, ctx, fixed } = open(true);
  for (const kind of ONE_SHOTS) bus.play(kind);
  bus.lock(3);
  bus.hum(true, 0.5);
  assert.equal(ctx.made.length, fixed);
});

test("ten minutes at the peak event rate stay within 24 one-shots and 120 live nodes", () => {
  const { bus, ctx } = open();
  const burst = ["blast", "bigblast", "thump", "shot", "enemyShot", "enemyLaunch", "hit", "bargeClang", "glassTinkle", "comboTick", "pop", "flak", "rocketWhoosh", "crunch", "shellWhistle", "intercept"];
  let voices = 0,
    nodes = 0;
  for (let frame = 0; frame < 60 * 600; frame++) {
    for (const kind of burst) bus.play(kind, frame % 13, frame % 3);
    bus.lock(4 + (frame % 20));
    bus.hum(frame % 300 < 200, (frame % 300) / 300);
    if (frame % 90 === 0) bus.play(["missionStart", "objectiveMet", "win", "fail"][(frame / 90) % 4]);
    voices = Math.max(voices, bus.voices.length);
    nodes = Math.max(nodes, ctx.live.size);
    ctx.advance(1 / 60);
  }
  assert.ok(voices <= MIX.voices, `${voices} one-shots at once`);
  assert.ok(nodes <= 120, `${nodes} live nodes`);
  assert.equal(bus.liveNodes, bus.voices.reduce((n, v) => n + v.nodes.length, 0), "the node count adds up");
  ctx.advance(5);
  assert.equal(bus.voices.length, 0);
  assert.equal(ctx.live.size, 6 + 4, "only the mix and the hum stay");
});

test("the lock tone keeps its rate: 2 to 8 Hz by distance, never closer than 0.12 s", () => {
  const { bus, ctx } = open();
  const range = CUES.lockBeep.rate.range;
  for (const [distance, hz] of [
    [range, 2],
    [range / 2, 5],
    [0, 8],
  ]) {
    const beeps = [];
    const play = bus.sound.bind(bus);
    bus.sound = (cue) => {
      beeps.push(ctx.currentTime);
      play(cue);
    };
    const start = ctx.currentTime;
    for (let i = 0; i < 2000; i++) {
      bus.lock(distance);
      ctx.advance(0.001);
    }
    bus.sound = play;
    const gaps = beeps.slice(1).map((t, i) => t - beeps[i]);
    assert.ok(gaps.every((g) => g >= Math.max(1 / hz, 0.12) - 1e-9), `${distance} m: gaps ${Math.min(...gaps)}`);
    assert.ok(Math.abs(beeps.length - 2 * hz) <= 1, `${distance} m: ${beeps.length} beeps in 2 s`);
    assert.ok(beeps[0] - start < 1e-9, "the first beep is at once");
    ctx.advance(1);
  }
  const before = ctx.made.length;
  bus.lock(range + 1);
  assert.equal(ctx.made.length, before, "no beep outside the range");
});

test("a stinger ducks the one-shot buses by 6 dB and plays past them", () => {
  assert.ok(Math.abs(20 * Math.log10(MIX.duck) + 6) < 0.1);
  const { bus, ctx } = open();
  const ramps = [];
  bus.duck.gain.linearRampToValueAtTime = (value, at) => ramps.push([value, at]);
  bus.play("win");
  assert.deepEqual(ramps[0], [MIX.duck, 0.04]);
  assert.equal(ramps[1][0], 1);
  assert.ok(Math.abs(ramps[1][1] - (lengthOf(CUES.win) + 0.2)) < 1e-9);
  ctx.advance(3);
});

test("the context rests when the tab hides, or after 2 s paused with no dialog, and wakes for any cue", async () => {
  const { bus, ctx } = open();
  // Hidden: at once.
  bus.idle(0, true, false, false);
  assert.equal(ctx.state, "suspended");
  bus.idle(0, false, false, false);
  const made = ctx.made.length;
  bus.play("pickup");
  assert.equal(ctx.calls.resume, 1, "a menu sound resumes it first");
  assert.ok(ctx.made.length > made, "and plays in the same tick, while it wakes");
  await new Promise((done) => setTimeout(done, 0));
  assert.equal(ctx.state, "running");
  assert.equal(bus.waking, false);
  // Paused with the result dialog open: it keeps running, and the star cue plays.
  for (let i = 0; i < 40; i++) bus.idle(0.08, false, true, true);
  assert.equal(ctx.state, "running");
  const stars = ctx.made.length;
  bus.play("star", 2);
  assert.ok(ctx.made.length > stars);
  // Paused with no dialog: it rests after 2 s, not before.
  for (let i = 0; i < 24; i++) bus.idle(0.08, false, true, false);
  assert.equal(ctx.state, "running", "1.92 s");
  for (let i = 0; i < 2; i++) bus.idle(0.08, false, true, false);
  assert.equal(ctx.state, "suspended", "2.08 s");
  ctx.advance(1);
  const woke = ctx.made.length;
  bus.play("star", 0);
  assert.ok(ctx.made.length > woke);
  await new Promise((done) => setTimeout(done, 0));
  assert.equal(ctx.state, "running");
  // A context the rule did not suspend (iOS before its unlock) is left alone.
  ctx.state = "suspended";
  const resumes = ctx.calls.resume,
    count = ctx.made.length;
  ctx.advance(1);
  bus.play("hit");
  assert.equal(ctx.calls.resume, resumes);
  assert.equal(ctx.made.length, count);
});

test("unlock after a rest (Launch) wakes the context and the stinger in the same tick plays", async () => {
  const { bus, ctx } = open();
  bus.idle(0, true, false, false);
  assert.equal(ctx.state, "suspended");
  const before = ctx.made.length;
  bus.unlock();
  bus.play("missionStart");
  assert.equal(ctx.calls.resume, 1, "resumed inside the gesture");
  assert.equal(ctx.made.length - before, nodesOf(CUES.missionStart), "scheduled while waking");
  assert.ok(bus.live);
  await new Promise((done) => setTimeout(done, 0));
  assert.equal(bus.waking, false);
  assert.equal(ctx.state, "running");
});

test("muting fades a running laser hum out", () => {
  const { bus, ctx, fixed } = open();
  const levels = [];
  bus.hum(true, 0.5);
  const gain = ctx.made.slice(fixed).find((n) => n.kind === "gain");
  gain.gain.setTargetAtTime = (value) => levels.push(value);
  bus.muted = true;
  bus.hum(true, 0.6);
  assert.equal(bus.humming, false);
  assert.deepEqual(levels, [0]);
  bus.hum(false);
  assert.deepEqual(levels, [0], "faded once");
});
