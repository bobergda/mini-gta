import { describe, expect, it } from "vitest";
import { WORLD_THEME, canTriggerImpactPulse, getQualityPreset } from "../src/game/presentation.js";

describe("presentation helpers", () => {
  it("falls back to medium quality", () => {
    expect(getQualityPreset("unknown")).toEqual(getQualityPreset("medium"));
  });

  it("exposes richer quality feature flags for the render pipeline", () => {
    expect(getQualityPreset("low")).toMatchObject({
      materialMode: "standard",
      fxaa: false,
      bloom: false,
      ssao: false,
      shadows: false,
    });
    expect(getQualityPreset("medium")).toMatchObject({
      materialMode: "standard",
      fxaa: true,
      bloom: true,
      shadows: true,
    });
    expect(getQualityPreset("high")).toMatchObject({
      materialMode: "pbr",
      fxaa: true,
      bloom: true,
      ssao: true,
      shadows: true,
    });
  });

  it("keeps texture asset paths inside the visual theme", () => {
    expect(WORLD_THEME.textures).toEqual({
      asphalt: "/textures/asphalt.svg",
      sidewalk: "/textures/sidewalk.svg",
      facade: "/textures/facade.svg",
      roof: "/textures/roof.svg",
      glass: "/textures/glass.svg",
      detailMask: "/textures/detail-mask.svg",
    });
  });

  it("applies impact cooldown windows", () => {
    expect(canTriggerImpactPulse(null, 1)).toBe(true);
    expect(canTriggerImpactPulse(1, 1.1)).toBe(false);
    expect(canTriggerImpactPulse(1, 1.25)).toBe(true);
  });
});
