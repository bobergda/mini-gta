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
      enableSecondaryDetail: false,
      enableGrime: false,
      enableVehicleLayers: false,
      enableCharacterLayers: false,
    });
    expect(getQualityPreset("medium")).toMatchObject({
      materialMode: "standard",
      fxaa: true,
      bloom: true,
      shadows: true,
      enableSecondaryDetail: true,
      enableGrime: false,
      enableVehicleLayers: true,
      enableCharacterLayers: true,
    });
    expect(getQualityPreset("high")).toMatchObject({
      materialMode: "pbr",
      fxaa: true,
      bloom: true,
      ssao: true,
      shadows: true,
      enableSecondaryDetail: true,
      enableGrime: true,
      enableVehicleLayers: true,
      enableCharacterLayers: true,
    });
  });

  it("keeps texture asset paths inside the visual theme", () => {
    expect(WORLD_THEME.textures).toEqual({
      asphaltBase: "/textures/asphalt-base.svg",
      asphaltNormal: "/textures/asphalt-normal.svg",
      concreteBase: "/textures/concrete-base.svg",
      concreteNormal: "/textures/concrete-normal.svg",
      facadeA: "/textures/facade-a.svg",
      facadeB: "/textures/facade-b.svg",
      roofBase: "/textures/roof-base.svg",
      roofNormal: "/textures/roof-normal.svg",
      glassBase: "/textures/glass-base.svg",
      metalDetail: "/textures/metal-detail.svg",
      paintDetail: "/textures/paint-detail.svg",
      foliageDetail: "/textures/foliage-detail.svg",
      grimeMask: "/textures/grime-mask.svg",
    });
  });

  it("applies impact cooldown windows", () => {
    expect(canTriggerImpactPulse(null, 1)).toBe(true);
    expect(canTriggerImpactPulse(1, 1.1)).toBe(false);
    expect(canTriggerImpactPulse(1, 1.25)).toBe(true);
  });
});
