# Redline — Night Run

A 3D arcade highway racing game built with **React, Vite, Tailwind CSS, and Three.js**. Drive 5 km in 110 seconds, dodge traffic, and use nitro to beat the clock. All graphics and sound are generated locally at runtime — no external asset requests, no backend services, no API keys.

## Requirements

- Node.js 20.19+ or 22.12+ (Node.js 22 or 24 recommended)
- A modern browser with WebGL 2 and hardware acceleration for actually playing the game (see [Browser support](#browser-support-and-validation))

## Run locally

```bash
npm ci
npm run dev
```

Open the URL printed by Vite, usually `http://localhost:4173`. The dev server binds to `0.0.0.0:4173` (see `vite.config.js`), so it's also reachable from other devices on your network at your machine's LAN IP.

## Keyboard controls

| Action | Keys |
| --- | --- |
| Accelerate | W or ↑ |
| Steer | A / D or ← / → |
| Brake | S or ↓ |
| Nitro | Space or Shift |
| Start / race again | Enter |
| Pause / resume | P or Esc |
| Restart the run | R |
| Toggle sound | M |

Click **Start Engine**, then hold W or ↑ as the countdown ends. This is manual acceleration: releasing the accelerator gradually slows the car (coasting), and tapping the brake slows it faster. Touch controls (steer, brake, accelerate, nitro buttons) also appear automatically on devices with a coarse pointer (phones/tablets).

Control keys are only captured while a race is running or counting down; letters typed into any `<input>`, `<textarea>`, or `<select>` elsewhere on the page are never intercepted.

## Race rules

- Reach the finish line (5,000 m) before the 110-second timer expires.
- A collision costs one of three lives, cuts your speed sharply, and grants ~2.3 seconds of collision immunity (with a screen flash) so you can recover.
- Leaving the road (beyond the marked edge) slows you down until you steer back.
- Nitro drains while boosting and recharges over time while idle. A close pass (near miss) refills an extra 10% instantly on top of the passive regen.
- **Scoring:**
  - 2 points per metre travelled.
  - 100 points per clean overtake (passing a car without hitting it).
  - 250 points per near miss (an overtake within a tight lateral margin of the other car).
  - All overtake/near-miss points are multiplied by your current **combo**.
  - Combo starts at 1× and increases by 1× per overtake, up to a maximum of 5×, as long as overtakes happen within 6 seconds of each other. A collision or a 6-second gap resets it to 1×.
- Finishing the race awards a time bonus of 100 points per second remaining on the clock.
- The best score is stored only in this browser via `localStorage`. There is no online leaderboard or account system.
- Switching browser tabs or losing window focus automatically pauses the race so you don't get blindsided.
- Sound starts muted (autoplay policies). Use the sound button in the header/HUD, or press M, to enable synthesized engine and event audio.
- Full screen is available via the header/HUD button; if the browser denies the request, an in-app notice explains it (e.g. open the game in its own tab rather than an embedded frame).

## Production and hosting

```bash
npm test
npm run build
npm run preview
```

- `npm test` runs the gameplay logic test suite (`tests/*.test.js`) with Node's built-in test runner — no separate test framework is installed. Run a single file with `node --test tests/simulation.test.js`, or filter by name with `node --test --test-name-pattern="pause"`.
- `npm run build` produces a static production bundle in `dist/`.
- `npm run preview` serves that build locally (also on `0.0.0.0:4173`) so you can sanity-check the production output before deploying.

Deploy the generated `dist/` folder to any static host. Serve it over HTTP/HTTPS; opening `dist/index.html` directly via a `file://` URL does not reliably support the ES module bundle in most browsers.

- **Vercel:** import the project, use the Vite preset, set the build command to `npm run build`, and the output directory to `dist`.
- **Netlify:** same build command (`npm run build`) and publish directory (`dist`).
- The Vite config uses a relative base (`base: './'` in `vite.config.js`), so the built app also works when hosted under a subdirectory rather than domain root.
- No environment variables, API keys, or backend services are required at build or run time.

## Project layout

```text
src/
  App.jsx              React interface, keyboard/touch input, lifecycle, race HUD, WebMCP tools
  index.css            Tailwind import, responsive game styling
  main.jsx             React entry point
  game/
    simulation.js       Pure game rules, physics, scoring, and collision simulation
    scene.js            Three.js scene, cars, highway, camera, and visual effects
    audio.js            Web Audio synthesis engine and one-shot event effects
tests/
  simulation.test.js    Gameplay logic tests using Node's built-in test runner
public/
  favicon.svg
vite.config.js          Vite + React + Tailwind plugin config, relative base, dev server settings
```

### Architecture

The codebase separates game rules from presentation, so the simulation can be tested and tuned without touching graphics or audio:

- **`src/game/simulation.js`** exports `RaceSimulation`, a plain JavaScript class with no DOM, React, Three.js, or frame-rate dependency. It owns every game rule — physics, steering, traffic, collisions, scoring, combo, nitro, and race phases (`ready` → `countdown` → `racing` → `paused`/`finished`/`gameover`). All units are metres and seconds.
  - `CONFIG` at the top of the file holds every tunable constant: race distance, time limit, top/boost speed, acceleration, braking, road edges, and lane positions. Change values here to rebalance the game.
  - `step(dt, input)` advances the simulation by one fixed timestep given the current input (accelerate/brake/steer/boost booleans).
  - `snapshot()` returns a plain-object view of current state for rendering and the HUD.
  - `drainEvents()` pops one-shot events (e.g. `crash`, `near`, `finish`, `gameover`, `go`, `countdown`) for the audio layer to react to.
- **`src/game/scene.js`** exports `RaceScene`, the Three.js renderer: camera, procedural highway/building/car geometry (instanced for performance), lighting, and visual effects. It reads simulation snapshots every frame and never mutates simulation state.
- **`src/game/audio.js`** exports `RaceAudio`, a small Web Audio synthesis engine for the ambient engine sound and one-shot event effects, driven by `drainEvents()` and a continuous `update(sim)` call.
- **`src/App.jsx`** owns the render loop, input handling, and React UI:
  - The animation loop (via `renderer.setAnimationLoop`) advances simulation physics at a fixed 120 Hz using a time accumulator, decoupled from however fast the browser renders frames.
  - React state updates (the HUD) are throttled to roughly 13 updates per second — plus immediately on any race-phase change — specifically to avoid re-rendering React on every animation frame.
  - Handles keyboard and touch/pointer input, pause-on-blur/tab-hide, fullscreen requests, sound toggling, and persisting the best score to `localStorage`.
  - Registers two optional **WebMCP** tools (`read_race_status`, `control_race_session`) via `document.modelContext.registerTool` when that experimental browser API is present. They operate on the exact same simulation instance as the keyboard/UI controls; the feature is a no-op in ordinary browsers.

## Browser support and validation

Requires a modern browser with WebGL 2 and hardware acceleration. Chrome, Edge, or Firefox on desktop with a keyboard is the intended experience. The renderer caps device pixel ratio to limit GPU load; buildings and road markings use instancing to keep the scene lightweight. If WebGL is unavailable or the graphics context is lost mid-session, the app shows recovery instructions instead of crashing. Audio playback and fullscreen support both depend on the host browser's autoplay and fullscreen policies.

The automated test suite (`tests/simulation.test.js`) exercises `RaceSimulation` in isolation — no React, Three.js, or Web Audio involved — using a deterministic seeded random function and a frame-advance helper. It covers countdown/pause/resume, acceleration and braking limits, steering boundaries, nitro drain/regen, collisions and post-collision invulnerability, near-miss scoring and combo, win/loss conditions, restart, and consistency across different step rates. This is the only automated coverage in the repo; interactive browser playtesting (graphics, keyboard feel, audio, fullscreen) should still be done manually on your target devices before a public release.

Optional WebMCP session controls are feature-detected and inert in browsers that don't support the API; its experimental integration has not been validated in a supported browser context.

## Implementation references

- [Three.js renderer documentation](https://threejs.org/docs/pages/WebGLRenderer.html)
- [Tailwind CSS with Vite](https://tailwindcss.com/docs/installation/using-vite)
- [Vite guide](https://vite.dev/guide/)

## Assets and dependencies

The cars and environment are procedural Three.js geometry — there are no 3D model or texture files. Sound is synthesized with the Web Audio API — there are no audio files. Interface icons come from [Lucide](https://lucide.dev/). Dependency notices are included in `THIRD_PARTY_NOTICES.md` (with upstream license texts under `licenses/`); their upstream licenses continue to apply.
