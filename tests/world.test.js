import { describe, expect, it } from "vitest";
import {
  chooseNextPedTarget,
  chooseTrafficTurn,
  createPedRoute,
  createRoadCenters,
  createWorld,
  findPoliceSpawn,
  getLaneCoord,
} from "../src/game/world.js";

describe("world helpers", () => {
  it("creates evenly spaced road centers", () => {
    expect(createRoadCenters(1800, 360)).toEqual([-540, -180, 180, 540]);
  });

  it("creates pedestrian routes on sidewalk guides", () => {
    const world = createWorld(() => 0.8);
    const route = createPedRoute(14, 181, world, null, () => 0.9);
    expect(world.sidewalkGuides).toContain(route.line);
    expect(["x", "z"]).toContain(route.axis);
  });

  it("keeps pedestrian target on same graph", () => {
    const world = createWorld(() => 0.2);
    const ped = createPedRoute(0, 0, world, "x", () => 0.7);
    const next = chooseNextPedTarget({ ...ped }, world, true, () => 0.1);
    expect(world.sidewalkGuides).toContain(next.line);
  });

  it("chooses traffic lane for straight movement", () => {
    const world = createWorld(() => 0.4);
    const option = chooseTrafficTurn(
      {
        axis: "x",
        dir: 1,
        lineCoord: getLaneCoord("x", world.roadCenters[1], 1),
        targetCoord: world.roadCenters[2],
      },
      world,
      null,
      () => 0.2,
    );
    expect(option.axis).toBe("x");
    expect(option.lineCoord).toBe(getLaneCoord("x", world.roadCenters[1], 1));
  });

  it("spawns police on a valid road lane", () => {
    const world = createWorld(() => 0.5);
    const spawn = findPoliceSpawn(world, { x: 0, z: 0 }, () => 0.75);
    expect(["x", "z"]).toContain(spawn.axis);
    expect(Math.abs(spawn.x) <= world.streetEdge).toBe(true);
    expect(Math.abs(spawn.z) <= world.streetEdge).toBe(true);
  });
});
