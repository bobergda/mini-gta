# Mini GTA 3D

A browser-based low-poly 3D sandbox built with `Three.js` and `Vite`.

The project currently combines on-foot exploration, car stealing, AI traffic,
pedestrians, cash pickups, a wanted system, and police pursuit inside a
procedurally generated city district.

## Run locally

```bash
npm install
npm run dev
```

Default dev URL:

```text
http://localhost:5173
```

## Build

```bash
npm run build
```

## Test

```bash
npm run test
```

## Controls

- `WASD` or arrow keys: move on foot / drive
- `Shift`: sprint on foot
- `E`: enter or exit a car
- `Space`: handbrake
- `R`: reset player or active vehicle position
- mouse drag: rotate camera
- mouse wheel: zoom camera

## Current gameplay

- third-person camera for both on-foot and driving modes
- procedural low-poly city layout
- on-foot movement and vehicle hijacking
- AI traffic moving through intersections
- pedestrians walking on sidewalks
- cash pickups around the district
- wanted level and police spawning
- basic collisions, damage, and game over state
- start overlay with in-game HUD telemetry
