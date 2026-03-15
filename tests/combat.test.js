import { describe, expect, it } from "vitest";
import { createGameState, updateGameState } from "../src/game/simulation.js";
import { createPedestrian } from "../src/game/systems/pedestrians.js";
import { createWorld } from "../src/game/world.js";

function createFakeInput(fireFrames = []) {
  const fireSet = new Set(fireFrames);
  let frame = 0;
  return {
    nextFrame() {
      frame += 1;
    },
    isDown() {
      return false;
    },
    isAnyDown() {
      return false;
    },
    consumeAnyPress() {
      return false;
    },
    consumeFire() {
      return fireSet.delete(frame);
    },
  };
}

describe("combat systems", () => {
  it("lets player shoot pedestrians on foot", () => {
    const world = createWorld(() => 0.5);
    const state = createGameState(world, () => 0.5);
    const cameraController = { yaw: 0 };
    const input = createFakeInput([0]);
    const ped = createPedestrian(999, world, () => 0.5);

    Object.assign(ped, {
      x: 12,
      z: 0,
      axis: "x",
      line: 0,
      targetX: 22,
      targetZ: 0,
      baseSpeed: 0,
      hostile: false,
      fireCooldown: 0,
    });

    state.running = true;
    state.player.mode = "onfoot";
    state.player.x = 0;
    state.player.z = 0;
    state.player.heading = 0;
    state.player.moveHeading = 0;
    state.vehicles = [];
    state.pickups = [];
    state.pedestrians = [ped];

    for (let index = 0; index < 24; index += 1) {
      updateGameState(state, world, input, cameraController, 0.05, () => 0.5);
      input.nextFrame();
    }

    expect(state.player.cash).toBeGreaterThanOrEqual(55);
    expect(state.player.wanted).toBeGreaterThan(0);
  });

  it("applies gunfire damage from hostile npcs", () => {
    const world = createWorld(() => 0.5);
    const state = createGameState(world, () => 0.5);
    const cameraController = { yaw: 0 };
    const input = createFakeInput();
    const hostilePed = createPedestrian(1001, world, () => 0.5);

    Object.assign(hostilePed, {
      x: 18,
      z: 0,
      axis: "x",
      line: 0,
      targetX: 24,
      targetZ: 0,
      baseSpeed: 0,
      hostile: true,
      fireCooldown: 0,
    });

    state.running = true;
    state.player.mode = "onfoot";
    state.player.x = 0;
    state.player.z = 0;
    state.player.health = 100;
    state.vehicles = [];
    state.pickups = [];
    state.pedestrians = [hostilePed];

    for (let index = 0; index < 80; index += 1) {
      updateGameState(state, world, input, cameraController, 0.05, () => 0.5);
      input.nextFrame();
    }

    expect(state.player.health).toBeLessThan(100);
    expect(state.feedback.damageSource).toBe("gunfire");
  });
});
