# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A 3D arcade highway racing game (React 19 + Vite + Tailwind CSS 4 + Three.js). Drive 5 km in 110 seconds, dodge traffic, use nitro. All graphics and sound are generated locally — no external asset requests, no backend, no API keys.

## Commands

```bash
npm run dev       # vite dev server on 0.0.0.0:4173
npm run build     # production build to dist/
npm run preview   # preview the production build on 0.0.0.0:4173
npm test          # node --test tests/*.test.js
```

To run a single test file: `node --test tests/simulation.test.js`. There's no test filter flag wired up beyond Node's built-in `--test-name-pattern`.

## Architecture

The game is split into a pure simulation layer and two independent presentation layers driven off it — this separation is the main thing to preserve when making changes.

- **`src/game/simulation.js`** — `RaceSimulation` class: all game rules (physics, collisions, scoring, traffic, phases) as a plain JS class with no DOM/React/Three.js/frame-rate dependency. Units are metres and seconds. `CONFIG` (top of file) holds all tunable constants — distance, time limit, speeds, lane positions, road edges — change these to rebalance the game. `step(dt, input)` advances state by a fixed timestep; `snapshot()` returns a plain-object view for rendering; `drainEvents()` pops one-shot events (crash, near-miss, finish, etc.) for the audio layer to consume.
- **`src/game/scene.js`** — `RaceScene`: Three.js renderer, camera, procedural car/highway/building geometry, instancing, effects. Reads simulation snapshots each frame; never mutates simulation state.
- **`src/game/audio.js`** — `RaceAudio`: Web Audio synthesis for ambient engine sound and one-shot event effects (crash, near-miss, countdown, etc.). Driven by `drainEvents()` and `update(sim)`.
- **`src/App.jsx`** — owns the animation loop (`renderer.setAnimationLoop`), keyboard/touch input handling, React UI/HUD, and lifecycle (pause on blur/tab-hide, fullscreen, sound toggle, best-score persistence via `localStorage`). The loop runs simulation physics at a fixed 120 Hz via an accumulator (`while (accumulator >= 1/120) sim.step(...)`), decoupled from the render/UI update rate — React state (`setRace`) is only pushed at a throttled rate (~13/s, plus immediately on phase changes) specifically to avoid re-rendering React on every animation frame.
- Optional **WebMCP** integration (`document.modelContext.registerTool`) exposes `read_race_status` and `control_race_session` tools that operate on the exact same simulation instance as keyboard/UI controls. It's feature-detected and a no-op in browsers without WebMCP — don't assume it's present.

### Data flow per frame

`App.jsx` loop → reads held keys → `sim.step(dt, input)` (1+ times to catch up at 120 Hz) → `sim.drainEvents()` → `audio.effect(event)` per event → `audio.update(sim)` → `visual.render(sim, dt, time)` → occasionally `sim.snapshot()` → `setRace(...)`.

### Testing

`tests/simulation.test.js` tests `RaceSimulation` in isolation (no React/Three/Audio) using Node's built-in test runner. It seeds a deterministic `random` function and an `advance(sim, seconds, input, rate)` helper to fast-forward by repeated fixed-step calls. Covers countdown/pause/resume, acceleration/braking limits, steering bounds, nitro, collisions/invulnerability, near-miss scoring, win/loss conditions, restart, and step-rate consistency. New gameplay rules belong in `simulation.js` and should get a corresponding test here — this is the only automated test coverage in the repo.

## Notable behavior to be aware of

- `dt` is clamped (`step`: max 0.05s per call; `App.jsx` loop: max 0.1s) to avoid physics blowing up after a stalled/backgrounded tab.
- Traffic cars recycle themselves (`makeTraffic`) once they pass far behind or ahead of the player, respawning behind the farthest existing car — there's a fixed pool of 16, not a growing array.
- Score, combo, and nitro rules live entirely in `simulation.js`; the HUD in `App.jsx` only formats/display values from `snapshot()`.
- Best score is stored only in `localStorage` (`redline.night-run.best.v1`); there's no backend or leaderboard.
- `vite.config.js` uses a relative base (`base: './'`) so the build can be hosted under a subdirectory; don't switch this to an absolute base without checking deployment docs in README.md.
