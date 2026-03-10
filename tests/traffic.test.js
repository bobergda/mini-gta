import { describe, expect, it } from "vitest";
import {
  collideVehicles,
  detectVehicleContact,
} from "../src/game/systems/traffic.js";

function createVehicle(overrides = {}) {
  return {
    id: overrides.id ?? 1,
    ai: overrides.ai ?? "traffic",
    kind: overrides.kind ?? "civilian",
    x: overrides.x ?? 0,
    y: 0,
    z: overrides.z ?? 0,
    vx: overrides.vx ?? 0,
    vz: overrides.vz ?? 0,
    speed: overrides.speed ?? 0,
    heading: overrides.heading ?? 0,
    axis: "x",
    dir: 1,
    lineCoord: 0,
    roadCenter: 0,
    targetCoord: 0,
    health: 100,
    color: "#fff",
    disabled: false,
    sirenPhase: 0,
    throttleInput: 0,
    steerInput: 0,
    stuckTimer: 0,
    recoveryCooldown: 0,
  };
}

describe("vehicle collisions", () => {
  it("does not report contact when narrow sides miss", () => {
    const a = createVehicle({ id: 1, x: 0, z: 0, heading: 0 });
    const b = createVehicle({ id: 2, x: 0, z: 2.45, heading: 0 });

    expect(detectVehicleContact(a, b)).toBeNull();
  });

  it("detects angled overlap and separates the vehicles", () => {
    const a = createVehicle({ id: 1, x: 0, z: 0, heading: 0, vx: 6, speed: 6 });
    const b = createVehicle({
      id: 2,
      x: 2.2,
      z: 0.7,
      heading: Math.PI / 2,
      vx: -3,
      speed: 3,
    });

    expect(detectVehicleContact(a, b)).not.toBeNull();
    expect(collideVehicles(a, b)).toBe(true);
    expect(a.x).toBeLessThan(0);
    expect(b.x).toBeGreaterThan(2.2);
  });
});
