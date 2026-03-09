import {
  BLOCK_SIZE,
  LANE_OFFSET,
  PICKUP_COUNT,
  ROAD_WIDTH,
  SIDEWALK_WIDTH,
  STREET_EDGE,
  WORLD_SIZE,
} from "./constants.js";

export function createRoadCenters(size = WORLD_SIZE, blockSize = BLOCK_SIZE) {
  const centers = [];
  for (let value = -size / 2 + blockSize; value < size / 2; value += blockSize) {
    centers.push(value);
  }
  return centers;
}

export function nearestValue(values, value) {
  let best = values[0];
  let bestDistance = Infinity;
  for (const candidate of values) {
    const delta = Math.abs(candidate - value);
    if (delta < bestDistance) {
      best = candidate;
      bestDistance = delta;
    }
  }
  return best;
}

export function nextNode(values, value, dir, edge = STREET_EDGE) {
  const stops = [-edge, ...values, edge];
  if (dir > 0) {
    for (const stop of stops) {
      if (stop > value + 1) return stop;
    }
  } else {
    for (let index = stops.length - 1; index >= 0; index -= 1) {
      if (stops[index] < value - 1) return stops[index];
    }
  }
  return dir > 0 ? edge : -edge;
}

export function getLaneCoord(axis, roadCenter, dir, laneOffset = LANE_OFFSET) {
  if (axis === "x") {
    return roadCenter + (dir > 0 ? -laneOffset : laneOffset);
  }
  return roadCenter + (dir > 0 ? laneOffset : -laneOffset);
}

export function headingFromAxis(axis, dir) {
  if (axis === "x") return dir > 0 ? 0 : Math.PI;
  return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
}

export function randomItem(items, rng = Math.random) {
  return items[Math.floor(rng() * items.length)];
}

export function createSidewalkGuides(roadCenters) {
  const offset = ROAD_WIDTH / 2 + SIDEWALK_WIDTH / 2;
  return roadCenters
    .flatMap((center) => [center - offset, center + offset])
    .sort((a, b) => a - b);
}

export function randomSidewalkSpot(world, rng = Math.random) {
  const line = randomItem(world.sidewalkGuides, rng);
  if (rng() > 0.5) {
    return { x: line, z: -world.streetEdge + rng() * world.streetEdge * 2, axis: "z" };
  }
  return { x: -world.streetEdge + rng() * world.streetEdge * 2, z: line, axis: "x" };
}

export function createPedRoute(x, z, world, preferredAxis = null, rng = Math.random) {
  const nearestVertical = nearestValue(world.sidewalkGuides, x);
  const nearestHorizontal = nearestValue(world.sidewalkGuides, z);
  const axis =
    preferredAxis ||
    (Math.abs(x - nearestVertical) < Math.abs(z - nearestHorizontal) ? "z" : "x");
  const dir = rng() > 0.5 ? 1 : -1;

  if (axis === "x") {
    const line = nearestHorizontal;
    const targetX = nextNode(world.sidewalkGuides, x, dir, world.streetEdge);
    return {
      x,
      z: line,
      axis,
      line,
      dir: targetX >= x ? 1 : -1,
      targetX,
      targetZ: line,
      heading: targetX >= x ? 0 : Math.PI,
    };
  }

  const line = nearestVertical;
  const targetZ = nextNode(world.sidewalkGuides, z, dir, world.streetEdge);
  return {
    x: line,
    z,
    axis,
    line,
    dir: targetZ >= z ? 1 : -1,
    targetX: line,
    targetZ,
    heading: targetZ >= z ? Math.PI / 2 : -Math.PI / 2,
  };
}

export function chooseNextPedTarget(ped, world, allowTurn = true, rng = Math.random) {
  const shouldTurn = allowTurn && rng() < 0.25;

  if (ped.axis === "x") {
    if (shouldTurn) {
      const dir = rng() > 0.5 ? 1 : -1;
      const line = nearestValue(world.sidewalkGuides, ped.x);
      const targetZ = nextNode(world.sidewalkGuides, ped.z, dir, world.streetEdge);
      return {
        axis: "z",
        line,
        dir: targetZ >= ped.z ? 1 : -1,
        targetX: line,
        targetZ,
        heading: targetZ >= ped.z ? Math.PI / 2 : -Math.PI / 2,
      };
    }
    const targetX = nextNode(world.sidewalkGuides, ped.x, ped.dir, world.streetEdge);
    return {
      axis: "x",
      line: ped.line,
      dir: targetX >= ped.x ? 1 : -1,
      targetX,
      targetZ: ped.line,
      heading: targetX >= ped.x ? 0 : Math.PI,
    };
  }

  if (shouldTurn) {
    const dir = rng() > 0.5 ? 1 : -1;
    const line = nearestValue(world.sidewalkGuides, ped.z);
    const targetX = nextNode(world.sidewalkGuides, ped.x, dir, world.streetEdge);
    return {
      axis: "x",
      line,
      dir: targetX >= ped.x ? 1 : -1,
      targetX,
      targetZ: line,
      heading: targetX >= ped.x ? 0 : Math.PI,
    };
  }

  const targetZ = nextNode(world.sidewalkGuides, ped.z, ped.dir, world.streetEdge);
  return {
    axis: "z",
    line: ped.line,
    dir: targetZ >= ped.z ? 1 : -1,
    targetX: ped.line,
    targetZ,
    heading: targetZ >= ped.z ? Math.PI / 2 : -Math.PI / 2,
  };
}

export function chooseTrafficTurn(vehicle, world, chaseTarget = null, rng = Math.random) {
  const intersectionX = vehicle.axis === "x" ? vehicle.targetCoord : nearestValue(world.roadCenters, vehicle.lineCoord);
  const intersectionZ = vehicle.axis === "z" ? vehicle.targetCoord : nearestValue(world.roadCenters, vehicle.lineCoord);
  const options = [];

  const pushOption = (axis, dir) => {
    const roadCenter = axis === "x" ? intersectionZ : intersectionX;
    const lineCoord = getLaneCoord(axis, roadCenter, dir, world.laneOffset);
    const currentCoord = axis === "x" ? intersectionX : intersectionZ;
    const targetCoord = nextNode(world.roadCenters, currentCoord, dir, world.streetEdge);
    options.push({
      axis,
      dir,
      roadCenter,
      lineCoord,
      targetCoord,
      heading: headingFromAxis(axis, dir),
    });
  };

  pushOption(vehicle.axis, vehicle.dir);
  if (vehicle.axis === "x") {
    pushOption("z", vehicle.dir > 0 ? -1 : 1);
    pushOption("z", vehicle.dir > 0 ? 1 : -1);
  } else {
    pushOption("x", vehicle.dir > 0 ? 1 : -1);
    pushOption("x", vehicle.dir > 0 ? -1 : 1);
  }

  if (chaseTarget) {
    return options.reduce((best, option) => {
      const sampleX = option.axis === "x" ? option.targetCoord : option.lineCoord;
      const sampleZ = option.axis === "z" ? option.targetCoord : option.lineCoord;
      const bestDistance = best ? Math.hypot(best.sampleX - chaseTarget.x, best.sampleZ - chaseTarget.z) : Infinity;
      const optionDistance = Math.hypot(sampleX - chaseTarget.x, sampleZ - chaseTarget.z);
      return optionDistance < bestDistance ? { ...option, sampleX, sampleZ } : best;
    }, null);
  }

  const roll = rng();
  if (roll < 0.56) return options[0];
  if (roll < 0.78) return options[1];
  return options[2];
}

export function findPoliceSpawn(world, target, rng = Math.random) {
  const edgeOffset = 260 + rng() * 120;
  const edge = Math.floor(rng() * 4);
  let x = target.x;
  let z = target.z;

  if (edge === 0) z -= edgeOffset;
  if (edge === 1) x += edgeOffset;
  if (edge === 2) z += edgeOffset;
  if (edge === 3) x -= edgeOffset;

  x = Math.max(-world.streetEdge, Math.min(world.streetEdge, x));
  z = Math.max(-world.streetEdge, Math.min(world.streetEdge, z));

  const nearestRoadX = nearestValue(world.roadCenters, x);
  const nearestRoadZ = nearestValue(world.roadCenters, z);
  if (Math.abs(x - nearestRoadX) < Math.abs(z - nearestRoadZ)) {
    const dir = target.z > z ? 1 : -1;
    return {
      axis: "z",
      dir,
      roadCenter: nearestRoadX,
      lineCoord: getLaneCoord("z", nearestRoadX, dir, world.laneOffset),
      x: getLaneCoord("z", nearestRoadX, dir, world.laneOffset),
      z,
      targetCoord: nextNode(world.roadCenters, z, dir, world.streetEdge),
      heading: headingFromAxis("z", dir),
    };
  }

  const dir = target.x > x ? 1 : -1;
  return {
    axis: "x",
    dir,
    roadCenter: nearestRoadZ,
    lineCoord: getLaneCoord("x", nearestRoadZ, dir, world.laneOffset),
    x,
    z: getLaneCoord("x", nearestRoadZ, dir, world.laneOffset),
    targetCoord: nextNode(world.roadCenters, x, dir, world.streetEdge),
    heading: headingFromAxis("x", dir),
  };
}

function createPlayerSpawn(sidewalkGuides) {
  return {
    x: sidewalkGuides[3] ?? 0,
    z: sidewalkGuides[2] ?? 0,
    heading: 0,
  };
}

function createVehicleResetSpawn(roadCenters, streetEdge, laneOffset) {
  const axis = "x";
  const dir = 1;
  const roadCenter = roadCenters[1] ?? 0;
  const x = -streetEdge * 0.58;
  return {
    axis,
    dir,
    roadCenter,
    lineCoord: getLaneCoord(axis, roadCenter, dir, laneOffset),
    x,
    z: getLaneCoord(axis, roadCenter, dir, laneOffset),
    targetCoord: nextNode(roadCenters, x, dir, streetEdge),
    heading: headingFromAxis(axis, dir),
  };
}

export function createWorld(rng = Math.random) {
  const roadCenters = createRoadCenters();
  const sidewalkGuides = createSidewalkGuides(roadCenters);
  const playerSpawn = createPlayerSpawn(sidewalkGuides);
  const vehicleResetSpawn = createVehicleResetSpawn(roadCenters, STREET_EDGE, LANE_OFFSET);
  const buildings = [];
  const trees = [];
  const lamps = [];
  const colors = ["#d85f4e", "#d9a24c", "#6f84e8", "#4d908e", "#c8553d", "#d8d174"];

  for (let xi = 0; xi < roadCenters.length - 1; xi += 1) {
    for (let zi = 0; zi < roadCenters.length - 1; zi += 1) {
      const left = roadCenters[xi] + ROAD_WIDTH / 2 + SIDEWALK_WIDTH;
      const right = roadCenters[xi + 1] - ROAD_WIDTH / 2 - SIDEWALK_WIDTH;
      const top = roadCenters[zi] + ROAD_WIDTH / 2 + SIDEWALK_WIDTH;
      const bottom = roadCenters[zi + 1] - ROAD_WIDTH / 2 - SIDEWALK_WIDTH;
      const width = right - left;
      const depth = bottom - top;

      for (let bx = 0; bx < 2; bx += 1) {
        for (let bz = 0; bz < 2; bz += 1) {
          const w = width * (0.24 + rng() * 0.1);
          const d = depth * (0.24 + rng() * 0.1);
          const x = left + width * (0.28 + bx * 0.36);
          const z = top + depth * (0.28 + bz * 0.36);
          buildings.push({
            x,
            z,
            w,
            d,
            h: 50 + rng() * 120,
            color: randomItem(colors, rng),
          });
        }
      }

      trees.push({ x: left + 24, z: top + 26, scale: 1 + rng() * 0.4 });
      trees.push({ x: right - 26, z: bottom - 24, scale: 0.9 + rng() * 0.5 });
    }
  }

  for (const center of roadCenters) {
    for (let step = -2; step <= 2; step += 1) {
      const offset = step * BLOCK_SIZE * 0.5;
      lamps.push({ x: center - ROAD_WIDTH / 2 - SIDEWALK_WIDTH, z: offset });
      lamps.push({ x: center + ROAD_WIDTH / 2 + SIDEWALK_WIDTH, z: offset });
      lamps.push({ x: offset, z: center - ROAD_WIDTH / 2 - SIDEWALK_WIDTH });
      lamps.push({ x: offset, z: center + ROAD_WIDTH / 2 + SIDEWALK_WIDTH });
    }
  }

  return {
    districtName: "Harbor Heights",
    size: WORLD_SIZE,
    roadCenters,
    sidewalkGuides,
    buildings,
    trees,
    lamps,
    roadWidth: ROAD_WIDTH,
    sidewalkWidth: SIDEWALK_WIDTH,
    laneOffset: LANE_OFFSET,
    streetEdge: STREET_EDGE,
    pickupCount: PICKUP_COUNT,
    playerSpawn,
    vehicleResetSpawn,
  };
}
