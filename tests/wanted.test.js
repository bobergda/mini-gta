import { describe, expect, it } from "vitest";
import {
  addWanted,
  advanceWanted,
  desiredPoliceCount,
  updatePursuitState,
  wantedDecayMultiplier,
} from "../src/game/systems/wanted.js";

describe("wanted system", () => {
  it("maps wanted stars to police count", () => {
    expect(desiredPoliceCount(0)).toBe(0);
    expect(desiredPoliceCount(1)).toBe(2);
    expect(desiredPoliceCount(5)).toBe(5);
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

  it("tracks police contact and search windows", () => {
    const target = { x: 0, z: 0 };
    const police = [{ x: 18, z: 0 }];
    const locked = updatePursuitState(null, 2, police, target, 0.1);
    expect(locked.status).toBe("locked");
    expect(locked.searchTimer).toBeGreaterThan(0);

    const searching = updatePursuitState(locked, 2, [], target, 1.5);
    expect(searching.status).toBe("search");
    expect(searching.lastKnownX).toBe(0);
  });

  it("slows wanted decay while police search the last known area", () => {
    expect(wantedDecayMultiplier("locked")).toBe(0);
    expect(wantedDecayMultiplier("search")).toBeLessThan(1);
    expect(wantedDecayMultiplier("cooling")).toBeGreaterThan(1);
  });
});
