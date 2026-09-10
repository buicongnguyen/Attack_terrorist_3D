# Assets and Dependencies

All seventeen game models are original procedural Blender assets authored for this project. No borrowed game models, commercial asset packs, background photographs, or externally hosted textures are used. `tools/build_assets.py` and `art/tidelock-assets.blend` are the editable source of the committed GLBs.

Runtime water, terrain, architecture, targeting indicators, and effects are original Three.js geometry/shaders. Pickup badges are original canvas-drawn game symbols cached as camera-facing sprite textures. Sound effects are synthesized with WebAudio.

- [Three.js](https://threejs.org/), MIT license: renderer, scene graph, geometry, and GLTFLoader.
- [cannon-es](https://github.com/pmndrs/cannon-es), MIT license: rigid-body physics.
- [Lucide](https://lucide.dev/), ISC license: interface icons.
- [Vite](https://vite.dev/), MIT license: development server and production bundler.
- [Playwright](https://playwright.dev/), Apache-2.0 license: browser verification.
- [Blender](https://www.blender.org/), GNU GPL: offline asset-authoring/export tool, not bundled into the runtime.

Dependency versions are pinned in `package.json` and `package-lock.json`. Upstream license notices remain in their npm packages and production license comments where emitted by the bundler.
