import { describe, expect, it } from "vitest";
import { createCameraController } from "../src/game/camera.js";
import { advanceFrame, createFrameCounter } from "../src/game/loop.js";
import { createGameState } from "../src/game/simulation.js";
import { createWorld } from "../src/game/world.js";

function createFakeInput(keys = []) {
  const down = new Set(keys);
  return {
    isDown(key) {
      return down.has(key);
    },
    isAnyDown(list) {
      return list.some((key) => down.has(key));
    },
    consumePress() {
      return false;
    },
    consumeAnyPress() {
      return false;
    },
    consumeLook() {
      return { x: 0, y: 0 };
    },
    consumeWheel() {
      return 0;
    },
  };
}

function createFakeCamera() {
  return {
    position: { x: 0, y: 20, z: 26 },
    lastLookAt: null,
    lookAt(x, y, z) {
      this.lastLookAt = { x, y, z };
    },
  };
}

describe("frame loop", () => {
  it("advances gameplay and camera without DOM dependencies", () => {
    const world = createWorld(() => 0.5);
    const state = createGameState(world, () => 0.5);
    const input = createFakeInput(["w"]);
    const camera = createFakeCamera();
    const controller = createCameraController(camera);
    const frameCounter = createFrameCounter();

    state.running = true;

    for (let frame = 0; frame < 12; frame += 1) {
      advanceFrame(state, world, input, controller, frameCounter, 0.03);
    }

    expect(state.time).toBeCloseTo(0.36, 5);
    expect(state.player.speed).toBeGreaterThan(0.5);
    expect(camera.position.x).not.toBe(0);
    expect(camera.lastLookAt).not.toBeNull();
    expect(frameCounter.fps).toBeGreaterThan(0);
  });
});
