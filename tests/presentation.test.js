import { describe, expect, it } from "vitest";
import { canTriggerImpactPulse, getQualityPreset } from "../src/game/presentation.js";

describe("presentation helpers", () => {
  it("falls back to medium quality", () => {
    expect(getQualityPreset("unknown")).toEqual(getQualityPreset("medium"));
  });

  it("applies impact cooldown windows", () => {
    expect(canTriggerImpactPulse(null, 1)).toBe(true);
    expect(canTriggerImpactPulse(1, 1.1)).toBe(false);
    expect(canTriggerImpactPulse(1, 1.25)).toBe(true);
  });
});
