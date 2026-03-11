import {
  clamp,
  composeVelocity,
  distance2D,
  lerp,
  projectLocalVelocity,
} from "../math.js";
import {
  chooseTrafficTurn,
  getLaneCoord,
  headingFromAxis,
  nearestValue,
  nextNode,
} from "../world.js";

const VEHICLE_COLORS = ["#ff7b54", "#e8b949", "#4db6ac", "#5874dc", "#ef5350", "#8e7dff"];
const VEHICLE_HALF_LENGTH = 2.1;
const VEHICLE_HALF_WIDTH = 1.08;

function createVehicleBase(id, kind, ai, data) {
  return {
    id,
    kind,
    ai,
    vx: 0,
    vz: 0,
    speed: 0,
    health: kind === "police" ? 140 : 100,
    disabled: false,
    sirenPhase: 0,
    throttleInput: 0,
    steerInput: 0,
    stuckTimer: 0,
    recoveryCooldown: 0,
    ...data,
  };
}

export function createTrafficVehicle(id, world, rng = Math.random) {
  const axis = rng() > 0.5 ? "x" : "z";
  const dir = rng() > 0.5 ? 1 : -1;
  const roadCenter = world.roadCenters[Math.floor(rng() * world.roadCenters.length)];
  const lineCoord = getLaneCoord(axis, roadCenter, dir, world.laneOffset);
  const startCoord = -world.streetEdge + rng() * world.streetEdge * 2;
  const targetCoord = nextNode(world.roadCenters, startCoord, dir, world.streetEdge);

  return createVehicleBase(id, "civilian", "traffic", {
    x: axis === "x" ? startCoord : lineCoord,
    y: 0,
    z: axis === "z" ? startCoord : lineCoord,
    heading: headingFromAxis(axis, dir),
    axis,
    dir,
    lineCoord,
    roadCenter,
    targetCoord,
    color: VEHICLE_COLORS[Math.floor(rng() * VEHICLE_COLORS.length)],
    cruiseSpeed: 11.5 + rng() * 3.5,
  });
}

export function createParkedVehicle(id, world, rng = Math.random) {
  const axis = rng() > 0.5 ? "x" : "z";
  const dir = rng() > 0.5 ? 1 : -1;
  const roadCenter = world.roadCenters[Math.floor(rng() * world.roadCenters.length)];
  const curbOffset = world.roadWidth / 2 + world.sidewalkWidth + 6;
  const lineCoord =
    axis === "x"
      ? roadCenter + (dir > 0 ? -curbOffset : curbOffset)
      : roadCenter + (dir > 0 ? curbOffset : -curbOffset);
  const position = -world.streetEdge * 0.65 + rng() * world.streetEdge * 1.3;

  return createVehicleBase(id, "civilian", "parked", {
    x: axis === "x" ? position : lineCoord,
    y: 0,
    z: axis === "z" ? position : lineCoord,
    heading: headingFromAxis(axis, dir),
    axis,
    dir,
    lineCoord,
    roadCenter,
    targetCoord: position,
    color: VEHICLE_COLORS[Math.floor(rng() * VEHICLE_COLORS.length)],
    cruiseSpeed: 0,
  });
}

export function createPoliceVehicle(id, world, spawn) {
  return createVehicleBase(id, "police", "police", {
    x: spawn.x,
    y: 0,
    z: spawn.z,
    heading: spawn.heading,
    axis: spawn.axis,
    dir: spawn.dir,
    lineCoord: spawn.lineCoord,
    roadCenter: spawn.roadCenter,
    targetCoord: spawn.targetCoord,
    color: "#ffffff",
    cruiseSpeed: 19.5,
  });
}

export function setVehicleRoute(vehicle, route) {
  vehicle.axis = route.axis;
  vehicle.dir = route.dir;
  vehicle.lineCoord = route.lineCoord;
  vehicle.roadCenter = route.roadCenter;
  vehicle.targetCoord = route.targetCoord;
  vehicle.heading = route.heading;
  if (vehicle.axis === "x") {
    vehicle.z = route.lineCoord;
  } else {
    vehicle.x = route.lineCoord;
  }
}

function computeObstacleFactor(vehicle, target, maxDistance, laneWidth, minFactor, allowRearBuffer = false) {
  const dx = target.x - vehicle.x;
  const dz = target.z - vehicle.z;
  const distance = Math.hypot(dx, dz);
  if (distance === 0 || distance > maxDistance) {
    return 1;
  }

  const forwardX = Math.cos(vehicle.heading);
  const forwardZ = Math.sin(vehicle.heading);
  const rightX = -forwardZ;
  const rightZ = forwardX;
  const ahead = dx * forwardX + dz * forwardZ;
  const lateral = Math.abs(dx * rightX + dz * rightZ);
  const minAhead = allowRearBuffer ? -4 : 0;

  if (ahead <= minAhead || lateral > laneWidth) {
    return 1;
  }

  return clamp((distance - 7) / maxDistance, minFactor, 1);
}

function computeTrafficFactor(vehicle, trafficState) {
  let factor = 1;

  for (const other of trafficState.vehicles) {
    if (other.id === vehicle.id || other.ai === "parked") continue;
    factor = Math.min(factor, computeObstacleFactor(vehicle, other, 28, 7, 0.22));
  }

  const playerAnchor = trafficState.playerAnchor;
  if (playerAnchor && playerAnchor.id !== vehicle.id) {
    factor = Math.min(
      factor,
      computeObstacleFactor(vehicle, playerAnchor, 24, 9, 0.12, true),
    );
  }

  return factor;
}

function getVehicleBasis(vehicle) {
  return {
    forward: { x: Math.cos(vehicle.heading), z: Math.sin(vehicle.heading) },
    right: { x: -Math.sin(vehicle.heading), z: Math.cos(vehicle.heading) },
  };
}

function getProjectionRadius(vehicle, axis, basis) {
  return (
    Math.abs(axis.x * basis.forward.x + axis.z * basis.forward.z) * VEHICLE_HALF_LENGTH +
    Math.abs(axis.x * basis.right.x + axis.z * basis.right.z) * VEHICLE_HALF_WIDTH
  );
}

export function detectVehicleContact(a, b) {
  const gap = distance2D(a.x, a.z, b.x, b.z);
  if (gap >= VEHICLE_HALF_LENGTH * 2.8) return null;

  const basisA = getVehicleBasis(a);
  const basisB = getVehicleBasis(b);
  const center = { x: b.x - a.x, z: b.z - a.z };
  const axes = [basisA.forward, basisA.right, basisB.forward, basisB.right];
  let smallestOverlap = Infinity;
  let normal = null;

  for (const axis of axes) {
    const centerDistance = center.x * axis.x + center.z * axis.z;
    const overlap =
      getProjectionRadius(a, axis, basisA) +
      getProjectionRadius(b, axis, basisB) -
      Math.abs(centerDistance);

    if (overlap <= 0) {
      return null;
    }

    if (overlap < smallestOverlap) {
      smallestOverlap = overlap;
      normal =
        centerDistance < 0
          ? { x: -axis.x, z: -axis.z }
          : { x: axis.x, z: axis.z };
    }
  }

  return {
    overlap: smallestOverlap,
    normal: normal ?? { x: 1, z: 0 },
  };
}

export function updateTrafficVehicle(vehicle, world, trafficState, dt, rng = Math.random) {
  if (vehicle.disabled) {
    vehicle.speed = lerp(vehicle.speed, 0, dt * 4);
    return;
  }

  const trafficFactor = computeTrafficFactor(vehicle, trafficState);
  const targetSpeed = (vehicle.cruiseSpeed ?? 13.5) * trafficFactor;
  vehicle.speed = lerp(vehicle.speed, targetSpeed, dt * (trafficFactor < 0.98 ? 3.1 : 1.2));
  vehicle.heading = headingFromAxis(vehicle.axis, vehicle.dir);
  const velocity = composeVelocity(vehicle.heading, vehicle.speed);
  vehicle.vx = velocity.x;
  vehicle.vz = velocity.z;

  if (vehicle.axis === "x") {
    vehicle.z = lerp(vehicle.z, vehicle.lineCoord, dt * 7);
    vehicle.x += vehicle.dir * vehicle.speed * dt;
    const remaining = (vehicle.targetCoord - vehicle.x) * vehicle.dir;
    if (remaining <= 0) {
      vehicle.x = vehicle.targetCoord;
      const route = chooseTrafficTurn(vehicle, world, null, rng);
      setVehicleRoute(vehicle, route);
    }
  } else {
    vehicle.x = lerp(vehicle.x, vehicle.lineCoord, dt * 7);
    vehicle.z += vehicle.dir * vehicle.speed * dt;
    const remaining = (vehicle.targetCoord - vehicle.z) * vehicle.dir;
    if (remaining <= 0) {
      vehicle.z = vehicle.targetCoord;
      const route = chooseTrafficTurn(vehicle, world, null, rng);
      setVehicleRoute(vehicle, route);
    }
  }
}

export function updatePoliceVehicle(vehicle, world, target, dt, rng = Math.random) {
  if (vehicle.disabled) return;

  vehicle.sirenPhase += dt * 12;
  vehicle.speed = lerp(vehicle.speed, vehicle.cruiseSpeed ?? 19.5, dt * 2.2);
  vehicle.heading = headingFromAxis(vehicle.axis, vehicle.dir);
  if (vehicle.axis === "x") {
    vehicle.z = lerp(vehicle.z, vehicle.lineCoord, dt * 9);
    vehicle.x += vehicle.dir * vehicle.speed * dt;
    const remaining = (vehicle.targetCoord - vehicle.x) * vehicle.dir;
    if (remaining <= 0) {
      vehicle.x = vehicle.targetCoord;
      const route = chooseTrafficTurn(vehicle, world, target, rng);
      setVehicleRoute(vehicle, route);
    }
  } else {
    vehicle.x = lerp(vehicle.x, vehicle.lineCoord, dt * 9);
    vehicle.z += vehicle.dir * vehicle.speed * dt;
    const remaining = (vehicle.targetCoord - vehicle.z) * vehicle.dir;
    if (remaining <= 0) {
      vehicle.z = vehicle.targetCoord;
      const route = chooseTrafficTurn(vehicle, world, target, rng);
      setVehicleRoute(vehicle, route);
    }
  }
}

export function updatePlayerVehicle(vehicle, world, input, dt) {
  const throttle =
    (input.isAnyDown(["w", "arrowup"]) ? 1 : 0) -
    (input.isAnyDown(["s", "arrowdown"]) ? 1 : 0);
  const steer =
    (input.isAnyDown(["d", "arrowright"]) ? 1 : 0) -
    (input.isAnyDown(["a", "arrowleft"]) ? 1 : 0);
  const braking = input.isDown(" ");
  const local = projectLocalVelocity(vehicle.heading, vehicle.vx, vehicle.vz);

  let forwardSpeed = local.forward;
  let lateralSpeed = local.lateral;
  const onRoad =
    Math.abs(vehicle.z - nearestValue(world.roadCenters, vehicle.z)) < world.roadWidth * 0.6 ||
    Math.abs(vehicle.x - nearestValue(world.roadCenters, vehicle.x)) < world.roadWidth * 0.6;
  const maxForwardSpeed = onRoad ? 42 : 28;
  const speedRatio = clamp(Math.abs(forwardSpeed) / maxForwardSpeed, 0, 1);
  const driveForce = throttle >= 0 ? 46 : 28;
  const drag = braking ? 7.6 : onRoad ? 1.7 : 3.1;
  const lowSpeedBoost = throttle !== 0 ? 1 - speedRatio * 0.55 : 0.42;

  forwardSpeed += throttle * driveForce * dt * lowSpeedBoost;
  forwardSpeed = clamp(forwardSpeed, -14, maxForwardSpeed);
  forwardSpeed = lerp(forwardSpeed, 0, dt * drag);
  lateralSpeed = lerp(lateralSpeed, 0, dt * (onRoad ? 15 : 5.5));

  const steeringGrip = braking ? 3.25 : lerp(3.4, 1.15, speedRatio);
  const steeringAuthority = Math.max(0.42, 1 - speedRatio * 0.48);
  const steeringScale = Math.max(0.3, Math.abs(forwardSpeed) / 5);
  vehicle.heading +=
    steer *
    steeringGrip *
    steeringAuthority *
    steeringScale *
    dt *
    (forwardSpeed >= 0 ? 1 : -0.52);

  const sideSlip = braking ? 0.22 : onRoad ? lerp(0.08, 0.16, speedRatio) : 0.34;
  const velocity = composeVelocity(vehicle.heading, forwardSpeed, lateralSpeed * sideSlip);
  vehicle.vx = velocity.x;
  vehicle.vz = velocity.z;
  vehicle.speed = forwardSpeed;
  vehicle.throttleInput = throttle;
  vehicle.steerInput = steer;
  vehicle.x += vehicle.vx * dt;
  vehicle.z += vehicle.vz * dt;
  vehicle.x = Math.max(-world.streetEdge, Math.min(world.streetEdge, vehicle.x));
  vehicle.z = Math.max(-world.streetEdge, Math.min(world.streetEdge, vehicle.z));
}

export function collideVehicles(a, b) {
  const contact = detectVehicleContact(a, b);
  if (!contact) return false;

  const massA = a.ai === "parked" ? 4 : 1;
  const massB = b.ai === "parked" ? 4 : 1;
  const pushA = massB / (massA + massB);
  const pushB = massA / (massA + massB);
  const separation = contact.overlap + 0.04;

  a.x -= contact.normal.x * separation * pushA;
  a.z -= contact.normal.z * separation * pushA;
  b.x += contact.normal.x * separation * pushB;
  b.z += contact.normal.z * separation * pushB;

  const velocityAlongNormalA = a.vx * contact.normal.x + a.vz * contact.normal.z;
  const velocityAlongNormalB = b.vx * contact.normal.x + b.vz * contact.normal.z;
  const exchange = (velocityAlongNormalA - velocityAlongNormalB) * 0.48;

  a.vx -= contact.normal.x * exchange * pushA;
  a.vz -= contact.normal.z * exchange * pushA;
  b.vx += contact.normal.x * exchange * pushB;
  b.vz += contact.normal.z * exchange * pushB;
  a.speed = projectLocalVelocity(a.heading, a.vx, a.vz).forward;
  b.speed = projectLocalVelocity(b.heading, b.vx, b.vz).forward;
  return true;
}
