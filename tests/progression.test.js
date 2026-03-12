import { describe, expect, it } from "vitest";
import {
  calculateHeatBonus,
  formatRunClock,
  summarizeRun,
} from "../src/game/progression.js";

describe("run progression helpers", () => {
  it("only awards heat bonus while wanted is active", () => {
    expect(calculateHeatBonus(0, 1)).toBe(0);
    expect(calculateHeatBonus(3, 2)).toBe(108);
  });

  it("formats countdown clock for HUD output", () => {
    expect(formatRunClock(240)).toBe("4:00");
    expect(formatRunClock(9.1)).toBe("0:10");
  });

  it("summarizes run score from cash and bonuses", () => {
    const summary = summarizeRun({ heatBonus: 122.4, eventBonus: 210.4 }, 987.5);

    expect(summary).toEqual({
      score: 1320,
      cash: 988,
      heatBonus: 122,
      eventBonus: 210,
    });
  });
});
