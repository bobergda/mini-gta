import { updateCamera } from "./camera.js";
import { updateGameState } from "./simulation.js";

export function createFrameCounter() {
  return {
    accumulator: 0,
    frames: 0,
    fps: 0,
  };
}

export function advanceFrame(state, world, input, cameraController, frameCounter, dt) {
  if (state.paused) {
    return frameCounter.fps;
  }

  updateGameState(state, world, input, cameraController, dt);
  updateCamera(cameraController, input, state, dt);

  if (!state.running) {
    return frameCounter.fps;
  }

  frameCounter.accumulator += dt;
  frameCounter.frames += 1;
  if (frameCounter.accumulator >= 0.25) {
    frameCounter.fps = frameCounter.frames / frameCounter.accumulator;
    frameCounter.accumulator = 0;
    frameCounter.frames = 0;
  }

  return frameCounter.fps;
}
