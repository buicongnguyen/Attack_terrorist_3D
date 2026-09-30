// Menu layout checks (2.8): the briefing, Mission Control and the result screens on phones,
// tablets and desktop. Every tap target is at least 44 px (43 with rounding), text is 11 px or
// more, nothing scrolls sideways, and no button sticks out of its dialog.
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
        document.querySelector("#menu-dialog details").open = true;
      },
      victory: () => {
        const { ui, game } = __TIDELOCK__;
        document.querySelectorAll("dialog[open]").forEach((d) => d.close());
        ui.start(3);
        document.querySelectorAll("dialog[open]").forEach((d) => d.close());
        game.paused = false;
        ui.showResult({ success: true, score: 12345, stars: 3, index: 3, kills: 14, reason: null, accuracy: 72 });
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
      const expected = { briefing: "brief-dialog", "mission control": "menu-dialog", victory: "result-dialog", defeat: "result-dialog" }[name];
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
        // The medallions load (menu headings, briefing, victory).
        for (const img of dialog.querySelectorAll("img.emblem, .result-emblem img"))
          if (visible(img) && !(img.complete && img.naturalWidth > 0)) out.push("emblem did not load");
        return out;
      }, expected);
      check(`menus ${name} ${width}x${height}${problems.length ? ": " + problems.slice(0, 3).join("; ") : ""}`, problems.length === 0);
    }
    check(`menus page errors ${width}x${height}${errors.length ? ": " + errors[0].slice(0, 60) : ""}`, errors.length === 0);
    await page.close();
  }
}
