import { describe, expect, it } from "vitest";
import { addWanted, advanceWanted, desiredPoliceCount } from "../src/game/systems/wanted.js";

describe("wanted system", () => {
  it("maps wanted stars to police count", () => {
    expect(desiredPoliceCount(0)).toBe(0);
    expect(desiredPoliceCount(1)).toBe(2);
    expect(desiredPoliceCount(5)).toBe(4);
  });

  it("adds wanted level with cooldown", () => {
    const player = { wanted: 0, wantedTimer: 0 };
    addWanted(player, 2, 18);
    expect(player.wanted).toBe(2);
    expect(player.wantedTimer).toBe(18);
  });

  it("decays wanted level over time", () => {
    const player = { wanted: 2, wantedTimer: 0.5 };
    advanceWanted(player, 0.5);
    expect(player.wanted).toBe(1);
    expect(player.wantedTimer).toBe(10);
  });
});
