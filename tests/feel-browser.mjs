// Hits that land and threats you can hear (5.1 J1): the qa Sound test lists the CUES table and
// each Play button starts its cue; the present is wired (&feel=1 sets hit-stops, ?qa alone does
// not); a shaken render leaves the camera, project(), screenDirection() and steerHeli() exactly
// as they were; score pops recycle 16 spans and follow the score; a Drill burst inside the Glass
// Tower blows fire out of its walls; the hurt edge names the side a hit came from; the new cues
// are called where they belong. Only wiring here: the feel contract itself is proven with fake
// timestamps in tests/loop.test.js, and the cues' nodes in tests/audio.test.js.
// Runs in the browser suite (tests/browser.mjs).
import { CUES } from "../src/audio.js";

const ready = (page) => page.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 90000 });

// In the page: a mission started with no dialog in the way and `steps` fixed steps run.
function enter(index, steps) {
  const { game: g, ui } = window.__TIDELOCK__;
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  ui.start(index);
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  g.paused = false;
  for (let i = 0; i < steps; i++) g.update(1 / 120);
}

export async function checkFeel(browser, url, check) {
  const errors = [];
  const open = async (query, viewport = { width: 1280, height: 800 }) => {
    const page = await browser.newPage({ viewport });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${url}?qa=1${query}`);
    await ready(page);
    await page.evaluate(`window.enter = ${enter}`);
    return page;
  };

  // ---------------------------------------------------------------- the listen gate
  const listen = await open("&listen=1");
  await listen.evaluate((laser) => {
    const { game: g, ui } = __TIDELOCK__;
    g.paused = true;
    // Sound on, and every cue that starts is noted by its label.
    ui.save.muted = g.audio.muted = false;
    window.started = new Set();
    const sound = g.audio.sound.bind(g.audio),
      hum = g.audio.hum.bind(g.audio);
    g.audio.sound = (cue, ...rest) => {
      window.started.add(cue.label);
      return sound(cue, ...rest);
    };
    g.audio.hum = (on, heat) => {
      if (on) window.started.add(laser);
      return hum(on, heat);
    };
    ui.menu();
  }, CUES.laserHum.label);
  const panel = await listen.evaluate(() => {
    const rows = [...document.querySelectorAll("#listen-list [data-cue]")];
    const small = [...document.querySelectorAll("#listen-details *")].filter((el) => el.offsetParent && el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim()) && parseFloat(getComputedStyle(el).fontSize) < 11);
    return {
      shown: !document.getElementById("listen-details").hidden && document.getElementById("listen-details").open,
      kinds: rows.map((b) => b.dataset.cue),
      taps: Math.min(...[...rows, document.getElementById("listen-all")].map((b) => Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height))),
      small: small.length,
    };
  });
  check(`listen panel lists exactly the CUES table (${panel.kinds.length} cues)`, panel.shown && JSON.stringify(panel.kinds) === JSON.stringify(Object.keys(CUES)));
  check(`listen panel: Play buttons are 44 px or more (${panel.taps.toFixed(0)}), no text under 11 px (${panel.small})`, panel.taps >= 44 && panel.small === 0);
  for (const kind of Object.keys(CUES)) await listen.click(`#listen-list [data-cue="${kind}"]`);
  await listen.waitForTimeout(2600);
  const heard = await listen.evaluate(() => ({ started: [...window.started], state: __TIDELOCK__.game.audio.context?.state }));
  const missing = Object.values(CUES)
    .map((cue) => cue.label)
    .filter((label) => !heard.started.includes(label));
  check(`each Play button starts its cue (${heard.started.length} of ${Object.keys(CUES).length}, context ${heard.state}${missing.length ? `; missing ${missing.join(", ")}` : ""})`, missing.length === 0 && heard.state === "running");
  await listen.close();

  // ---------------------------------------------------------------- feel
  const page = await open("&feel=1");
  const out = await page.evaluate(async () => {
    const { game: g, ui, view, loop } = __TIDELOCK__;
    const r = {};
    const frame = () => new Promise((done) => requestAnimationFrame(() => done()));
    // The present: a key kill asks for a stop; the loop grants it from the next frame.
    enter(9, 60);
    await frame();
    const e = g.entity("launcher", null, g.player.position.clone().add({ x: 4, y: 0, z: -14 }));
    g.kill(e);
    r.asked = g.impact.stop;
    await frame();
    await frame();
    r.granted = g.present.stopUntil > 0 && g.impact.stop === 0;

    // Score pops: 200 kills keep 16 spans, the layer never changes, the newest follow the score.
    const pops = document.getElementById("pops");
    let mutations = 0;
    const observer = new MutationObserver((list) => (mutations += list.length));
    observer.observe(pops, { childList: true });
    const deltas = [];
    for (let i = 0; i < 200; i++) {
      const before = g.score;
      const at = g.player.position.clone().add({ x: (i % 9) * 3 - 12, y: 0, z: -10 - (i % 5) * 4 });
      const target = i % 3 ? g.opponent(at) : g.entity("launcher", null, at);
      g.kill(target);
      deltas.push([g.score - before, target.type]);
    }
    ui.updateHUD();
    await frame();
    observer.disconnect();
    const newest = [...pops.children].sort((a, b) => b.dataset.order - a.dataset.order).slice(0, 3);
    r.pops = {
      children: pops.children.length,
      mutations: mutations + observer.takeRecords().length,
      texts: newest.map((el) => el.firstChild.nodeValue),
      expected: deltas.slice(-3).reverse().map(([d, type]) => `+${d}${type === "launcher" ? " LAUNCHER" : ""}`),
      text: newest[0].childNodes.length === 1 && newest[0].firstChild.nodeType === 3,
    };

    // The hurt edge: a hit from the left, cleared within 400 ms; the low-shield pulse at 3 of 9.
    enter(9, 30);
    g.shields = [3, 3, 3];
    const edge = document.getElementById("hurt-edge");
    g.hurtPlayer(g.player.position.clone().add({ x: -3, y: 0, z: 0.4 }), 1);
    r.dir = edge.dataset.dir;
    const hitAt = performance.now();
    while (edge.dataset.dir && performance.now() - hitAt < 1000) await frame();
    r.cleared = !edge.dataset.dir ? performance.now() - hitAt : Infinity;
    g.hurtPlayer(g.player.position.clone().add({ x: 0.2, y: 0, z: -3 }), 1);
    r.top = edge.dataset.dir;
    // A second hit 200 ms into the first one's fade starts the fade again.
    await new Promise((done) => setTimeout(done, 200));
    g.shields = [3, 3, 3];
    g.hurtPlayer(g.player.position.clone().add({ x: 0.2, y: 0, z: -3 }), 1);
    const fades = edge.getAnimations({ subtree: true }).filter((anim) => anim.animationName === "hurt-fade");
    r.restart = fades.length === 1 && fades[0].currentTime < 100;
    g.shields = [1, 1, 1];
    ui.updateHUD(true);
    r.low = edge.classList.contains("low-shield") && document.getElementById("toast").textContent.startsWith("SHIELDS LOW");
    g.shields = [3, 3, 3];
    ui.updateHUD(true);
    r.lowOff = !edge.classList.contains("low-shield");

    // The shake never leaks out of render(): trauma 1 and a kick change nothing outside it.
    enter(15, 120);
    g.paused = true;
    g.input.stickAim = { x: 0.6, z: -0.4 };
    const probe = () => {
      const p = view.project(g.player.position),
        d = view.screenDirection({ x: 0.5, z: -0.3 }),
        aim = g.steerHeli(0);
      return JSON.stringify([p.x, p.y, d.x, d.y, d.z, aim.x, aim.y, aim.z]);
    };
    g.shake = 0;
    loop.draw(1000);
    const calm = probe();
    const renders = [];
    const render = view.renderer.render.bind(view.renderer);
    view.renderer.render = (scene, camera) => {
      renders.push(camera.position.toArray().join());
      render(scene, camera);
    };
    const before = view.camera.position.toArray().join();
    g.shake = 1;
    Object.assign(g.impact, { kick: true, kickX: 1, kickZ: 0 });
    loop.settle(1040);
    loop.draw(1040);
    const after = view.camera.position.toArray().join();
    r.shake = { same: calm === probe(), camera: before === after, moved: renders[0] !== before };
    view.renderer.render = render;
    g.input.stickAim = null;
    return r;
  });
  check(`a key kill asks for a hit-stop (${out.asked} s) and &feel=1 grants it`, out.asked === 0.09 && out.granted);
  check(
    `after 200 kills #pops has ${out.pops.children} children and ${out.pops.mutations} child mutations; the newest read ${out.pops.texts.join(", ")}`,
    out.pops.children === 16 && out.pops.mutations === 0 && JSON.stringify(out.pops.texts) === JSON.stringify(out.pops.expected) && out.pops.text,
  );
  check(`a hit from the left sets #hurt-edge data-dir=left (${out.dir}), cleared in ${Math.round(out.cleared)} ms; one from ahead says top (${out.top}); a second hit restarts the flash (${out.restart})`, out.dir === "left" && out.cleared <= 400 && out.top === "top" && out.restart);
  check("3 shields or fewer set the low-shield pulse and say SHIELDS LOW; a refill clears it", out.low && out.lowOff);
  check("trauma 1 with a kick moves the rendered camera, yet project(), screenDirection(), steerHeli() and the camera after render() are unchanged", out.shake.same && out.shake.camera && out.shake.moved);
  await page.close();

  // ---------------------------------------------------------------- without &feel=1, and the cues
  const qa = await open("");
  const plain = await qa.evaluate(async () => {
    const { game: g, view } = __TIDELOCK__;
    const r = {};
    const frame = () => new Promise((done) => requestAnimationFrame(() => done()));
    enter(9, 60);
    await frame();
    g.kill(g.entity("launcher", null, g.player.position.clone().add({ x: 4, y: 0, z: -14 })));
    await frame();
    await frame();
    r.noStop = g.present.stopUntil === -Infinity && g.impact.stop === 0;

    // A Drill burst on the Glass Tower's sixth floor (1.6) throws fire out of its walls.
    const { storyY, DRILL_BURST } = __TIDELOCK_STRIKE__;
    enter(5, 10);
    const tower = g.op.buildings.find((b) => b.id === "GT");
    const spawned = [];
    const spawn = view.fx.glow.spawn.bind(view.fx.glow);
    view.fx.glow.spawn = (p, ...rest) => {
      spawned.push({ x: p.x, y: p.y, z: p.z });
      return spawn(p, ...rest);
    };
    const Vec = view.camera.position.constructor;
    const point = new Vec((tower.min[0] + tower.max[0]) / 2, storyY(5) + DRILL_BURST, (tower.min[2] + tower.max[2]) / 2);
    g.op.detonate({ kind: "drill", dead: false, mesh: g.view.sphere(point.clone(), new Vec(0.1, 0.1, 0.1), 0xffffff) }, point);
    view.fx.glow.spawn = spawn;
    const outside = (p) => p.x < tower.min[0] - 0.2 || p.x > tower.max[0] + 0.2 || p.z < tower.min[2] - 0.2 || p.z > tower.max[2] + 0.2;
    r.blowout = spawned.filter((p) => outside(p) && p.y >= storyY(5) && p.y <= storyY(6)).length;

    // The cues where they belong.
    const played = [];
    const play = g.audio.play.bind(g.audio);
    g.audio.play = (kind, ...rest) => {
      played.push(kind);
      return play(kind, ...rest);
    };
    g.radio({ who: "marrow", text: "Test." }, "intercept");
    g.radio({ who: "echo", text: "Test." }, "echo");
    enter(9, 30);
    g.op.rockets = 3;
    g.rocketCooldown = 0;
    g.op.fireRockets(g.player.position.clone().add({ x: 0, y: 1, z: -20 }));
    g.audio.play = play;
    r.played = played;
    return r;
  });
  check("?qa without &feel=1 grants no hit-stop", plain.noStop);
  check(`a Drill burst on Glass Tower F6 throws ${plain.blowout} glows 0.2 m or more outside its walls, inside the F6 band`, plain.blowout >= 6);
  check(`Marrow's intercept plays the intercept cue, other lines the chirp, Marlin's rockets their whoosh (${plain.played.join(", ")})`, plain.played[0] === "intercept" && plain.played[1] === "radio" && plain.played.includes("rocketWhoosh"));
  await qa.close();
  check(`feel pages raised no errors${errors.length ? `: ${errors.join(" | ")}` : ""}`, errors.length === 0);
}
