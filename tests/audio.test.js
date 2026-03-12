import { describe, expect, it } from "vitest";
import { getEngineAudioProfile, getSkidAudioLevel } from "../src/game/audio.js";

describe("audio helpers", () => {
  it("raises engine pitch and gain with speed", () => {
    const idle = getEngineAudioProfile(0, 0);
    const fast = getEngineAudioProfile(24, 0.8);

    expect(fast.frequency).toBeGreaterThan(idle.frequency);
    expect(fast.gain).toBeGreaterThan(idle.gain);
    expect(fast.filterFrequency).toBeGreaterThan(idle.filterFrequency);
  });

  it("derives skid mix from braking, slip, and speed", () => {
    const quiet = getSkidAudioLevel({ brakeInput: 0, slip: 0, speed: 0 });
    const loud = getSkidAudioLevel({ brakeInput: 1, slip: 0.8, speed: 32 });

    expect(quiet).toBe(0);
    expect(loud).toBeGreaterThan(quiet);
  });
});
