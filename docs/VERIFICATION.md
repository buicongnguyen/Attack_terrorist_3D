# Release Verification

## Rescue Update

[Chapter 3 search and rescue](CHAPTER3-RESCUE.md) replaces the fixed helicopter defense with a larger following-camera map and three extraction sorties. Coverage now includes 15 Node tests and 95 browser assertions, 20 Blender assets, limited ordnance, flare countermeasures, friendly-fire protection, interrupted winches, base return, and all three complete rescue routes. Touch tests include real two-finger Chrome input and narrow landscape/tablet layouts. Screenshots and canvas-pixel checks verify the helicopter chapter at several map locations. Browser emulation is not real-device testing.

The historical sections below describe earlier releases, including the helicopter defense missions that this update replaces.

## Detail Update

The subsequent [3D detail and pickup review](REVIEW-DETAILS.md) expands coverage to 11 Node tests and 54 browser assertions, 17 GLBs, independent bonus timers, authored gun muzzles, and HUD-safe pickup badges. It adds 320x740 mobile emulation alongside the original desktop and phone orientations. The sections below preserve the initial release's verification history.

## Automated Checks

Eight Node tests cover render-rate-independent stepping, catch-up limits, fast swept collisions, analog movement, speed limits, damping, cannon-es bounce energy, forecast agreement before contact, shield absorption, and best-score persistence.

The browser suite exercises:

- Loading every one of the thirteen GLB models.
- A nonblank WebGL canvas with more than 10,000 triangles and varied sampled pixel colors.
- Completing the first mission using a timed keyboard release.
- Boat movement on both axes, manual fire by default, common cooldown gating, and projectiles damaging a moving cannon after travel.
- Scrolling river enemies, repair/twin/guided/medal pickups, and guided support shots.
- Armor absorbing a multi-point mine hit across remaining boat protection.
- Gradually opening caves on dry terrain, missile interception, and localized helicopter shield breach.
- Fresh retry state, failure taking priority over simultaneous completion, and paused simulation.
- All chapters at 1440x900 desktop, 390x844 portrait, and 844x390 landscape.
- Mission selection and joystick movement at both mobile viewport sizes.
- Browser exceptions and resource errors.

The initial suite passed 28 browser assertions with zero runtime/resource errors. The captured desktop canvas contained 152 quantized colors and approximately 31,000 rendered triangles in Chapter 1. Counts vary with mission and effects.

## Additional Playability Checks

All six Chapter 1 missions were simulated to success with actual falling/drilling pods and their configured ammo budgets: 1/1, 1/1, 1/1, 3/3, 6/6, and 10/10 opponents. These tests selected release positions programmatically but used ordinary projectile physics and damage. A separate browser test uses the actual Space key release for the first mission.

Full-length automated play also reached the objectives in all three river missions and all three helicopter defenses using ordinary movement, weapon cooldowns, pickups, interception, and rockets. The harder missions required prioritizing launchers, collecting repair supplies, and using rocket suppression. These controlled runs show that the campaign is completable; they do not replace human difficulty playtests.

Additional pixel checks covered every chapter at both 390x844 and 844x390. Each scene contained 88-142 quantized sampled colors and different canvas hashes at different water-animation times, confirming nonblank animated rendering in both phone orientations.

The first Linux CI run exposed a fixed-wall-clock assumption in the joystick test on software WebGL. The test now waits for observed movement with a bounded timeout. Paused missions also stop unnecessary GPU rendering while still redrawing on resize. The corrected [GitHub Actions run](https://github.com/buicongnguyen/Attack_terrorist_3D/actions/runs/34484150202) passed both jobs and deployed commit `de1689d` to [the public game](https://buicongnguyen.github.io/Attack_terrorist_3D/).

The public URL returned HTTP 200 with the expected release asset `index-_Qx5-d9A.js`. The complete 28-assertion browser suite also passed against the deployed GitHub Pages URL, including all thirteen model loads and both mobile orientations, with zero runtime or resource errors.

Visual review found and corrected washed-out Blender materials, overly dense water highlights, near-plane clipping on tall portrait viewports, and decorative rocks/palms covering cave entrances. The models now have explicit linear-space colors; terrain and vehicles remain separate from the animated water.

Logic review found and corrected duplicate drill-layer counts at adjacent tile edges, damage leaking past remaining boat armor, and mismatch between visible shield arcs and sector indexing. Friendly and enemy projectiles use distinct colors and shapes; hit detection follows their travel.

## Practical Limits

- This is a first playable arcade release with authored low-poly assets, not a finished commercial art pass.
- Touch layouts and pointer capture are browser-emulated. Real iOS Safari and low-end Android hardware still require device testing.
- Desktop screenshots were captured in headless Chrome with software WebGL. They verify rendering and layout, not a real-device 60 FPS performance guarantee.
- Chapters 1 and 2 use fixed cameras; Chapter 3 follows the helicopter through the valley. Precision bombing intentionally keeps its easy-to-read side-plane control scheme.
- Drilling removes local slab tiles. Full structural support/collapse simulation is a future improvement.
- Bomb trajectory previews end at first geometry contact. Post-impact travel depends on the physics engine and selected fuse.
- Cave geometry is simplified and repeatedly suppressible. Character poses are node animations, not motion-captured skeletal clips.
- Progress is local to the current browser; there is no account, multiplayer, or online leaderboard.
- Browser tests inspect all chapter types, but human difficulty balancing across all river and helicopter missions is still a follow-on playtest task.

## Reproduction

```sh
npm ci
npm test
npm run build
npm run preview -- --port 5183
npm run test:browser
```

The QA object is exposed only when the URL includes `?qa=1`, allowing deterministic test scenarios. Normal play does not expose that test handle.
