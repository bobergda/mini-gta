# AGENTS.md

Guidelines for coding agents working in this repository.

## Project Snapshot

- Stack: `Three.js` + `Vite` + `Vitest` (ES modules).
- Entry point: `src/main.js`.
- Core game logic: `src/game/`.
- Unit tests: `tests/`.

## Local Commands

- Install dependencies: `npm install`
- Run dev server: `npm run dev`
- Build production bundle: `npm run build`
- Run tests: `npm run test`

## File Map

- `src/main.js`: app bootstrap, frame loop wiring, start flow.
- `src/game/simulation.js`: gameplay state and update logic.
- `src/game/world.js`: procedural world and spawn helpers.
- `src/game/systems/traffic.js`: traffic, police, and vehicle collision behavior.
- `src/game/systems/pedestrians.js`: pedestrian behavior.
- `src/game/systems/wanted.js`: wanted-level logic.
- `src/game/config.js`: HUD text, overlay copy, gameplay-facing text constants.
- `src/game/constants.js`: tuning constants and counts.

## Agent Rules

- Keep changes small and focused; do not refactor unrelated modules.
- Preserve deterministic behavior in testable helpers by supporting injected RNG where already used.
- When changing gameplay logic, update or add tests in `tests/` for regressions.
- Keep browser-facing behavior compatible with keyboard controls documented in `README.md`.
- If changing in-game text, update `src/game/config.js` instead of hardcoding strings in systems/render code.
- Do not edit `dist/` manually; treat it as build output.

## Code Style

- Use modern ES module syntax consistent with existing code.
- Follow existing naming patterns (`createX`, `updateX`, small pure helpers).
- Prefer pure helper functions for math/decision logic that can be unit-tested.
- Avoid adding new dependencies unless clearly necessary.

## Validation Checklist

Before finishing work, run:

1. `npm run test`
2. `npm run build` (for changes touching runtime/render/UI)

If a command cannot be run, explicitly report that in the final handoff.
