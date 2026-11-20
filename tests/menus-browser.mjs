// Menu layout checks (2.8): the briefing, Mission Control and the result screens on phones,
// tablets and desktop. Every tap target is at least 44 px (43 with rounding), text is 11 px or
// more, nothing scrolls sideways, and no button sticks out of its dialog.
import { FAILURE_RADIO, INTERCEPTS, MISSION_STORY } from "../src/story.js";
import { STORY, minimumFor, priorityOf } from "../src/radio-queue.js";

export async function checkMenus(browser, url, check) {
  const sizes = [
    [390, 844],
    [360, 740],
    [320, 568],
    [844, 390],
    [667, 375],
    [768, 1024],
    [1440, 900],
  ];
  for (const [width, height] of sizes) {
    const page = await browser.newPage({ viewport: { width, height }, isMobile: width < 800, hasTouch: width < 800 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${url}?qa=1&brief=1&prologue=1`);
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 60000 });
    const screens = {
      // (The first start also opens the prologue: close it to reach the briefing itself.)
      briefing: () => {
        const { ui } = __TIDELOCK__;
        document.querySelectorAll("dialog[open]").forEach((d) => d.close());
        ui.start(9);
        if (document.getElementById("prologue-dialog").open) ui.closePrologue();
      },
      "mission control": () => {
        document.querySelectorAll("dialog[open]").forEach((d) => d.close());
        __TIDELOCK__.ui.menu();
        document.querySelectorAll("#menu-dialog details").forEach((d) => (d.open = true));
      },
      victory: () => {
        const { ui, game } = __TIDELOCK__;
        document.querySelectorAll("dialog[open]").forEach((d) => d.close());
        ui.start(3);
        document.querySelectorAll("dialog[open]").forEach((d) => d.close());
        game.paused = false;
        ui.showResult({ success: true, score: 12345, stars: 3, index: 3, kills: 14, reason: null, accuracy: 72 });
      },
      // 4.0: the finale's question, and a result screen with a recovered file.
      finale: () => {
        const { ui } = __TIDELOCK__;
        document.querySelectorAll("dialog[open]").forEach((d) => d.close());
        ui.start(18);
        document.querySelectorAll("dialog[open]").forEach((d) => d.close());
        ui.showResult({ success: true, score: 9000, stars: 2, index: 18, kills: 40, reason: null, accuracy: 60 });
      },
      "file found": () => {
        const { ui } = __TIDELOCK__;
        document.querySelectorAll("dialog[open]").forEach((d) => d.close());
        ui.start(5);
        document.querySelectorAll("dialog[open]").forEach((d) => d.close());
        ui.showResult({ success: true, score: 5000, stars: 3, index: 5, kills: 9, reason: null, accuracy: 70 });
      },
      // 5.1 H1: a chapter tab clicked mid-mission asks before it leaves.
      leave: () => {
        const { ui, game } = __TIDELOCK__;
        document.querySelectorAll("dialog[open]").forEach((d) => d.close());
        ui.start(3);
        document.querySelectorAll("dialog[open]").forEach((d) => d.close());
        game.paused = false;
        ui.askChapter(1);
      },
      defeat: () => {
        const { ui } = __TIDELOCK__;
        document.querySelectorAll("dialog[open]").forEach((d) => d.close());
        ui.showResult({ success: false, score: 900, stars: 0, index: 3, kills: 4, reason: "hull", accuracy: 40 });
      },
    };
    for (const [name, show] of Object.entries(screens)) {
      await page.evaluate(show);
      await page.waitForTimeout(300);
      // Medallions may still be decoding on a busy machine: give them a moment before judging.
      await page
        .waitForFunction(() => [...document.querySelectorAll("dialog[open] img.emblem, dialog[open] .result-emblem img")].every((img) => img.hidden || img.complete), null, { timeout: 5000 })
        .catch(() => {});
      const expected = { briefing: "brief-dialog", "mission control": "menu-dialog", victory: "result-dialog", finale: "result-dialog", "file found": "result-dialog", leave: "leave-dialog", defeat: "result-dialog" }[name];
      const problems = await page.evaluate((expected) => {
        const out = [];
        const expectDialog = (d) => (d.id === expected ? [] : [`wrong dialog open: ${d.id}`]);
        const dialog = document.querySelector("dialog[open]");
        if (!dialog) return ["no dialog open"];
        out.push(...expectDialog(dialog));
        const visible = (el) => {
          const r = el.getBoundingClientRect(),
            s = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
        };
        for (const el of dialog.querySelectorAll("button, summary, label")) {
          if (!visible(el)) continue;
          const r = el.getBoundingClientRect();
          if (Math.min(r.width, r.height) < 43) out.push(`target ${el.id || el.textContent.trim().slice(0, 12)} ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
        for (const el of dialog.querySelectorAll("*")) {
          if (!visible(el) || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
          const size = parseFloat(getComputedStyle(el).fontSize);
          if (size < 11) out.push(`text ${el.tagName.toLowerCase()} ${size}px`);
        }
        if (document.documentElement.scrollWidth > innerWidth + 1) out.push("page scrolls sideways");
        const box = dialog.getBoundingClientRect();
        if (box.left < -1 || box.right > innerWidth + 1) out.push("dialog off-screen");
        if (dialog.scrollWidth > dialog.clientWidth + 1) out.push("dialog content too wide");
        for (const b of dialog.querySelectorAll("button")) {
          if (!visible(b)) continue;
          const r = b.getBoundingClientRect();
          if (r.right > box.right + 1 || r.left < box.left - 1) {
            out.push(`button outside dialog ${b.id}`);
            break;
          }
        }
        // The full-screen button (the shared helper's) reads at 4.5:1 or better (5.1 H1).
        const luminance = (color) => {
          const [r, g, b] = color.match(/[\d.]+/g).slice(0, 3).map((v) => {
            const c = v / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        for (const b of dialog.querySelectorAll("[data-mobile-display]")) {
          if (!visible(b)) continue;
          const css = getComputedStyle(b),
            [hi, lo] = [luminance(css.color), luminance(css.backgroundColor)].sort((x, y) => y - x);
          const ratio = (hi + 0.05) / (lo + 0.05);
          if (css.backgroundColor === "rgba(0, 0, 0, 0)" || ratio < 4.5) out.push(`full screen contrast ${ratio.toFixed(2)}:1`);
        }
        // The medallions load (menu headings, briefing, victory).
        for (const img of dialog.querySelectorAll("img.emblem, .result-emblem img"))
          if (visible(img) && !(img.complete && img.naturalWidth > 0)) out.push("emblem did not load");
        return out;
      }, expected);
      check(`menus ${name} ${width}x${height}${problems.length ? ": " + problems.slice(0, 3).join("; ") : ""}`, problems.length === 0);
    }
    // A desktop chapter tab clicked mid-mission asks first; nothing changes until Leave (5.1 H1).
    if (width > 900) {
      await page.evaluate(() => {
        const { ui, game } = __TIDELOCK__;
        document.querySelectorAll("dialog[open]").forEach((d) => d.close());
        ui.start(3);
        document.querySelectorAll("dialog[open]").forEach((d) => d.close());
        game.paused = false;
      });
      await page.click('[data-chapter="1"]');
      const asked = await page.evaluate(() => ({ open: document.getElementById("leave-dialog").open, index: __TIDELOCK__.game.index, paused: __TIDELOCK__.game.paused }));
      await page.click("#leave-stay");
      const stayed = await page.evaluate(() => ({ open: document.getElementById("leave-dialog").open, index: __TIDELOCK__.game.index, paused: __TIDELOCK__.game.paused, tabFocused: Boolean(document.activeElement?.closest(".chapter-tab")) }));
      // Escape stays too, and Enter afterwards does not ask again (focus left the tab).
      await page.click('[data-chapter="1"]');
      await page.keyboard.press("Escape");
      await page.keyboard.press("Enter");
      const escaped = await page.evaluate(() => ({ open: document.getElementById("leave-dialog").open, index: __TIDELOCK__.game.index }));
      await page.click('[data-chapter="1"]');
      await page.click("#leave-go");
      const left = await page.evaluate(() => __TIDELOCK__.game.index);
      check(`menus a chapter tab mid-mission asks, Stay keeps mission 1.4 and Leave starts 2.1 (${JSON.stringify({ asked, stayed, escaped, left })})`, asked.open && asked.index === 3 && asked.paused && !stayed.open && stayed.index === 3 && !stayed.paused && !stayed.tabFocused && !escaped.open && escaped.index === 3 && left === 9);
    }
    check(`menus page errors ${width}x${height}${errors.length ? ": " + errors[0].slice(0, 60) : ""}`, errors.length === 0);
    await page.close();
  }
  await checkDebrief(browser, url, check);
}

// 5.1 N1: the closing-line card, its hold, the debrief and the radio ticker, in fresh pages
// (an empty save, so the requisition numbers are known).
const CINDER = MISSION_STORY[8].radio.success.text;

async function checkDebrief(browser, url, check) {
  // ---- the hold, on a desktop with ?qa&hold=1
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${url}?qa=1&hold=1`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 60000 });
  // A win of 1.9: the closing line is said, the mission ends, the result opens 1.4 s later.
  const win = (index) =>
    page.evaluate((index) => {
      const { game: g, ui } = __TIDELOCK__;
      ui.start(index);
      g.paused = false;
      g.op.say("success");
      g.finish(true);
      for (let i = 0; i < 240 && !document.getElementById("result-dialog").open; i++) g.update(1 / 120);
      window.__opened = performance.now();
      return { open: document.getElementById("result-dialog").open, stars: g.result().stars };
    }, index);
  const actionsShown = () => getComputedStyle(document.querySelector("#result-dialog .result-actions")).visibility === "visible";
  await win(8);
  const during = await page.evaluate((shown) => {
    const { game: g, ui } = __TIDELOCK__;
    ui.menu();
    return {
      shown: eval(`(${shown})`)(),
      menu: document.getElementById("menu-dialog").open,
      paused: g.paused,
      quote: document.querySelector("#result-quote p").textContent,
      name: document.querySelector("#result-quote b").textContent,
      hold: ui.holdFor,
    };
  }, actionsShown.toString());
  await page.waitForFunction(`(${actionsShown})()`, null, { timeout: 10000 });
  const waited = await page.evaluate(() => (performance.now() - window.__opened) / 1000);
  check(
    `debrief: after a 1.9 win the actions wait for the closing line (${waited.toFixed(2)} s of ${during.hold.toFixed(2)} s), the quote is Ines's success line, and a menu asked for meanwhile leaves the game paused`,
    !during.shown && waited >= during.hold - 0.05 && during.hold > 4 && during.name === "Ines Duarte" && during.quote === CINDER && !during.menu && during.paused,
  );
  // Enter skips the wait; a held, repeating Enter does not.
  await win(8);
  const repeat = await page.evaluate((shown) => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", repeat: true, cancelable: true }));
    return eval(`(${shown})`)();
  }, actionsShown.toString());
  await page.keyboard.press("Enter");
  const skipped = await page.evaluate((shown) => ({ shown: eval(`(${shown})`)(), after: (performance.now() - window.__opened) / 1000, focus: document.activeElement?.id }), actionsShown.toString());
  check(`debrief: Enter skips the hold (${skipped.after.toFixed(2)} s) and a repeating Enter does not`, !repeat && skipped.shown && skipped.after < 3 && skipped.focus === "result-next");

  // ---- stars, points and Requisition on a first win (an empty save: 0 points before)
  const stars = await page.evaluate(() => {
    const times = [];
    const observer = new MutationObserver(() => {
      const n = document.querySelectorAll("#result-stars .earned").length;
      if (n > times.length) times.push(performance.now());
    });
    observer.observe(document.getElementById("result-stars"), { subtree: true, attributes: true, childList: true });
    window.__starTimes = times;
    return true;
  });
  const first = await win(0);
  // Wait for the reveal rather than a fixed time: CI's SwiftShader page runs its timers late.
  await page
    .waitForFunction((n) => document.querySelectorAll("#result-stars .earned").length >= n, first.stars, { timeout: 10000 })
    .catch(() => {});
  await page.waitForTimeout(700);
  const debrief = await page.evaluate(() => {
    const { ui } = __TIDELOCK__;
    const t = window.__starTimes;
    return {
      gaps: t.slice(1).map((x, i) => x - t[i]),
      earned: document.querySelectorAll("#result-stars .earned").length,
      points: document.getElementById("result-points").textContent,
      spend: Object.values(ui.save.records).reduce((s, r) => s + r.stars, 0),
      req: !document.getElementById("result-req").hidden,
      score: document.getElementById("result-score").textContent,
      dot: document.getElementById("pause").classList.contains("points"),
    };
  });
  check(
    `debrief: ${debrief.earned} stars revealed one at a time (gaps ${debrief.gaps.map((g) => g.toFixed(0)).join(", ")} ms), and the score counted up to ${debrief.score}`,
    stars && debrief.earned === first.stars && debrief.gaps.length === first.stars - 1 && debrief.gaps.every((g) => g >= 295) && debrief.score !== "0",
  );
  check(
    `debrief: '${debrief.points}' is the change in requisition points, and Requisition shows when they buy an upgrade`,
    debrief.points === `+${first.stars} requisition point${first.stars === 1 ? "" : "s"} · ${debrief.spend} to spend` && debrief.req === first.stars >= 2 && debrief.dot === debrief.req,
  );
  await page.evaluate(() => document.getElementById("result-req").click());
  const opened = await page.evaluate(() => ({ menu: document.getElementById("menu-dialog").open, req: document.getElementById("req-details").open, result: document.getElementById("result-dialog").open }));
  await page.evaluate(() => document.getElementById("resume").click());
  const back = await page.evaluate(() => ({ result: document.getElementById("result-dialog").open, paused: __TIDELOCK__.game.paused }));
  check(`debrief: Requisition opens the panel and closing it comes back to the result (${JSON.stringify({ opened, back })})`, opened.menu && opened.req && !opened.result && back.result && back.paused);

  // A purchase made from the result is reflected when Mission control hands back (5.1 review).
  const bought = await page.evaluate(() => {
    const { ui } = __TIDELOCK__;
    const before = document.getElementById("result-points").textContent;
    ui.menuFromResult(true);
    const button = document.querySelector("#req-list button:not([disabled])");
    const cost = Number(button.textContent.replace(/\D/g, ""));
    button.click();
    document.getElementById("resume").click();
    return { before, after: document.getElementById("result-points").textContent, cost, req: !document.getElementById("result-req").hidden, open: document.getElementById("result-dialog").open };
  });
  const spendOf = (text) => Number(/· (\d+) to spend/.exec(text)[1]);
  const affordableNow = await page.evaluate(() => document.getElementById("pause").classList.contains("points"));
  check(
    `debrief: after a purchase the result's points and Requisition button are current (${JSON.stringify(bought)})`,
    bought.open && spendOf(bought.after) === spendOf(bought.before) - bought.cost && bought.req === affordableNow,
  );
  // Mission control > Story > Back to the mission over a result comes back to the result.
  const story = await page.evaluate(() => {
    const { ui, game: g } = __TIDELOCK__;
    ui.menuFromResult();
    document.getElementById("story").click();
    const prologue = document.getElementById("prologue-dialog").open;
    document.getElementById("prologue-start").click();
    return { prologue, result: document.getElementById("result-dialog").open, paused: g.paused, status: g.status };
  });
  check(`debrief: Story from Mission control over a result goes back to the result, still paused (${JSON.stringify(story)})`, story.prologue && story.result && story.paused && story.status === "success");
  // A win that brings no new points shows no points line.
  await win(0);
  const repeatWin = await page.evaluate(() => document.getElementById("result-points").hidden);
  check("debrief: a win that brings no new points shows no points line", repeatWin);

  // ---- reduced motion: every star at once
  const still = await page.evaluate(() => {
    const { game: g, ui } = __TIDELOCK__;
    g.reducedMotion = true;
    ui.start(1);
    g.paused = false;
    g.op.say("success");
    g.finish(true);
    for (let i = 0; i < 240 && !document.getElementById("result-dialog").open; i++) g.update(1 / 120);
    const n = document.querySelectorAll("#result-stars .earned").length;
    g.reducedMotion = false;
    return { n, stars: g.result().stars, score: document.getElementById("result-score").textContent };
  });
  check(`debrief: under reduced motion all ${still.stars} stars and the score show at once`, still.n === still.stars && still.score !== "0");

  // ---- a loss: a warning, no second Retry, and Easy after two
  const lose = () =>
    page.evaluate(() => {
      const { game: g, ui } = __TIDELOCK__;
      ui.setDifficulty("normal");
      ui.start(3);
      g.paused = false;
      g.finish(false, "flight");
      for (let i = 0; i < 240 && !document.getElementById("result-dialog").open; i++) g.update(1 / 120);
      const hold = ui.holdFor;
      ui.revealResult();
      const visible = (id) => !document.getElementById(id).hidden;
      return {
        hold,
        badge: Boolean(document.querySelector("#result-dialog .lucide-badge-check")),
        warning: Boolean(document.querySelector("#result-dialog .lucide-triangle-alert")),
        retry: visible("result-retry"),
        menu: visible("result-menu"),
        easy: visible("result-easy"),
        quote: document.querySelector("#result-quote p").textContent,
      };
    });
  const once = await lose();
  const twice = await lose();
  check(
    `debrief: a loss shows a warning, Mission control instead of a second Retry, and 'Try it on Easy' after two (${JSON.stringify({ once, twice })})`,
    !once.badge && once.warning && !once.retry && once.menu && !once.easy && twice.easy && once.quote === FAILURE_RADIO.flight.text,
  );
  // A failure line never said on the radio is held for its whole minimum, from when the result opens.
  check(`debrief: an unsaid failure line holds its full minimum (${once.hold.toFixed(2)} s)`, Math.abs(once.hold - minimumFor(FAILURE_RADIO.flight.text)) < 1e-6);
  const easy = await page.evaluate(() => {
    document.getElementById("result-easy").click();
    const { game: g } = __TIDELOCK__;
    return { mode: g.difficulty, index: g.index, open: document.getElementById("result-dialog").open };
  });
  check(`debrief: 'Try it on Easy' sets Easy and starts the mission again (${JSON.stringify(easy)})`, easy.mode === "easy" && easy.index === 3 && !easy.open);

  // ---- the finale's file panel counts the files in the save
  const finale = await page.evaluate(() => {
    const { ui } = __TIDELOCK__;
    ui.start(18);
    ui.showResult({ success: true, score: 9000, stars: 2, index: 18, kills: 40, reason: null, accuracy: 60 });
    const found = [5, 8, 10, 14, 16, 17].filter((i) => ui.save.records[i]).length;
    return {
      text: document.getElementById("finale-files-count").textContent,
      found,
      rows: document.querySelectorAll("#finale-files-list li").length,
      missing: [...document.querySelectorAll("#finale-files-list li")].filter((li) => li.textContent === "Not recovered").length,
    };
  });
  check(`debrief: the finale's choice card reads '${finale.text}'`, finale.text === `You have read ${finale.found} of 6 files` && finale.rows === 6 && finale.missing === 6 - finale.found);
  check(`debrief page errors${errors.length ? ": " + errors[0].slice(0, 80) : ""}`, errors.length === 0);
  await page.close();

  // ---- the phones' ticker and Marrow's intercept frame
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phone.goto(`${url}?qa=1`);
  await phone.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 60000 });
  const ticker = await phone.evaluate(() => {
    const { game: g, ui } = __TIDELOCK__;
    ui.start(2);
    g.paused = false;
    for (let i = 0; i < 120 * 12.5; i++) {
      g.update(1 / 120);
      ui.director.tick(1 / 120);
    }
    ui.updateHUD(true);
    const shown = () => [...document.querySelectorAll("#comms .radio-line")].filter((el) => getComputedStyle(el).display !== "none");
    const closed = shown().length;
    const intercept = document.querySelector("#comms .radio-line.intercept");
    const frame = intercept && {
      tag: intercept.querySelector(".intercept-tag")?.textContent,
      emblem: Boolean(intercept.querySelector(".portrait svg.ashen")),
      lines: Math.round(intercept.querySelector("div").getBoundingClientRect().height / parseFloat(getComputedStyle(intercept.querySelector("div")).lineHeight)),
    };
    document.getElementById("comms").click();
    ui.updateHUD(true);
    const open = shown().length;
    return { slots: ui.director.slots, closed, open, said: ui.director.log.length, frame };
  });
  check(
    `debrief: the phone ticker shows one line (at most two lines of text) and a tap lists the last three; Marrow's 1.3 intercept is framed (${JSON.stringify(ticker)})`,
    ticker.slots === 1 && ticker.closed === 1 && ticker.open === Math.min(3, ticker.said) && ticker.open > 1 && ticker.frame?.tag === "INTERCEPT" && ticker.frame.emblem && ticker.frame.lines <= 2,
  );
  // 1.6: the meeting is the mission's only gathering, so 'gatheringStruck' is the meeting struck.
  const meeting = await phone.evaluate(() => {
    const { ui, game: g } = __TIDELOCK__;
    ui.start(5);
    return g.op.events.length;
  });
  check(`debrief: 1.6's only gathering is the lieutenants' meeting (${meeting})`, meeting === 1);
  // Every story-priority line reads in full in the phone ticker, without a tap (5.1 review).
  const stories = [
    ...MISSION_STORY.flatMap((story) => Object.entries(story.radio).filter(([key]) => priorityOf(key) === STORY)),
    ...INTERCEPTS.map((i) => ["intercept", i.line]),
  ];
  const clipped = await phone.evaluate((stories) => {
    const { ui } = __TIDELOCK__;
    const out = [];
    for (const [key, line] of stories) {
      ui.director.clear();
      ui.director.say(line, key);
      ui.updateHUD(true);
      const el = document.querySelector("#comms .radio-line");
      const text = el?.querySelector("div");
      if (!el || getComputedStyle(el).display === "none" || text.scrollHeight > text.clientHeight + 1) out.push(line.text.slice(0, 40));
    }
    return out;
  }, stories);
  check(`debrief: none of the ${stories.length} story lines is clipped in the phone ticker at 390x844${clipped.length ? ": " + clipped.join(" | ") : ""}`, clipped.length === 0);
  await phone.close();
}
