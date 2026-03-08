import { distance2D, lerp } from "../math.js";
import { chooseNextPedTarget, createPedRoute, randomSidewalkSpot } from "../world.js";

export function createPedestrian(id, world, rng = Math.random) {
  const spot = randomSidewalkSpot(world, rng);
  const route = createPedRoute(spot.x, spot.z, world, spot.axis, rng);
  return {
    id,
    x: route.x,
    y: 0,
    z: route.z,
    vx: 0,
    vz: 0,
    heading: route.heading,
    axis: route.axis,
    line: route.line,
    dir: route.dir,
    targetX: route.targetX,
    targetZ: route.targetZ,
    baseSpeed: 3.2 + rng() * 2,
    panic: 0,
    panicHeading: route.heading,
    alive: true,
    tone: `hsl(${Math.floor(rng() * 40) + 20} 75% 78%)`,
    shirt: `hsl(${Math.floor(rng() * 360)} 68% 56%)`,
  };
}

export function resetPedestrianRoute(ped, world, preferredAxis = null, rng = Math.random) {
  const route = createPedRoute(ped.x, ped.z, world, preferredAxis, rng);
  ped.x = route.x;
  ped.z = route.z;
  ped.axis = route.axis;
  ped.line = route.line;
  ped.dir = route.dir;
  ped.targetX = route.targetX;
  ped.targetZ = route.targetZ;
  ped.heading = route.heading;
  ped.vx = 0;
  ped.vz = 0;
}

export function updatePedestrians(state, world, dt, rng = Math.random) {
  const threats = [...state.vehicles.filter((vehicle) => vehicle.ai !== "parked"), state.player];

  for (const ped of state.pedestrians) {
    if (!ped.alive) continue;
    const wasPanicking = ped.panic > 0;
    const closeThreat = threats.find((entity) => distance2D(ped.x, ped.z, entity.x, entity.z) < 10 && Math.abs(entity.speed || 0) > 8);

    if (closeThreat) {
      ped.panic = 1.2;
      ped.panicHeading = Math.atan2(ped.z - closeThreat.z, ped.x - closeThreat.x);
    }

    ped.panic = Math.max(0, ped.panic - dt);

    if (ped.panic > 0) {
      const jitter = Math.sin((ped.x + ped.z) * 0.03 + ped.panic * 7) * 0.25;
      ped.heading = ped.panicHeading + jitter;
      ped.vx = Math.cos(ped.heading) * 6.5;
      ped.vz = Math.sin(ped.heading) * 6.5;
      ped.x += ped.vx * dt;
      ped.z += ped.vz * dt;
    } else {
      if (ped.axis === "x") {
        ped.z = lerp(ped.z, ped.line, dt * 9);
      } else {
        ped.x = lerp(ped.x, ped.line, dt * 9);
      }

      if (distance2D(ped.x, ped.z, ped.targetX, ped.targetZ) < 1.4) {
        ped.x = ped.targetX;
        ped.z = ped.targetZ;
        Object.assign(ped, chooseNextPedTarget(ped, world, true, rng));
      }

      const desiredX = ped.targetX - ped.x;
      const desiredZ = ped.targetZ - ped.z;
      if (Math.abs(desiredX) > 0.01 || Math.abs(desiredZ) > 0.01) {
        ped.heading = Math.atan2(desiredZ, desiredX);
      }

      let avoidX = 0;
      let avoidZ = 0;
      for (const other of state.pedestrians) {
        if (other === ped || !other.alive) continue;
        const gap = distance2D(ped.x, ped.z, other.x, other.z);
        if (gap > 0 && gap < 2.2) {
          avoidX += (ped.x - other.x) / gap;
          avoidZ += (ped.z - other.z) / gap;
        }
      }

      const blendX = desiredX + avoidX * 2;
      const blendZ = desiredZ + avoidZ * 2;
      if (Math.abs(blendX) > 0.01 || Math.abs(blendZ) > 0.01) {
        ped.heading = Math.atan2(blendZ, blendX);
      }
      ped.vx = lerp(ped.vx, Math.cos(ped.heading) * ped.baseSpeed, dt * 6);
      ped.vz = lerp(ped.vz, Math.sin(ped.heading) * ped.baseSpeed, dt * 6);
      ped.x += ped.vx * dt;
      ped.z += ped.vz * dt;
    }

    ped.x = Math.max(-world.streetEdge, Math.min(world.streetEdge, ped.x));
    ped.z = Math.max(-world.streetEdge, Math.min(world.streetEdge, ped.z));

    if (wasPanicking && ped.panic === 0) {
      resetPedestrianRoute(ped, world, ped.axis, rng);
    }
  }
}
