import { describe, expect, it } from "vitest";
import { cameraRelativeVector } from "../src/game/math.js";

describe("camera relative movement", () => {
  it("maps forward input to the camera facing direction", () => {
    const result = cameraRelativeVector(0, 1, 0);
    expect(result.x).toBeCloseTo(1, 5);
    expect(result.z).toBeCloseTo(0, 5);
  });

  it("maps right input to the camera right direction", () => {
    const result = cameraRelativeVector(1, 0, 0);
    expect(result.x).toBeCloseTo(0, 5);
    expect(result.z).toBeCloseTo(1, 5);
  });

  it("keeps forward aligned with an angled camera yaw", () => {
    const yaw = -0.75;
    const result = cameraRelativeVector(0, 1, yaw);
    expect(result.x).toBeCloseTo(Math.cos(yaw), 5);
    expect(result.z).toBeCloseTo(Math.sin(yaw), 5);
  });
});
