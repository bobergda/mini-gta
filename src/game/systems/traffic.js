import { composeVelocity, distance2D, lerp, projectLocalVelocity } from "../math.js";
import {
  chooseTrafficTurn,
  getLaneCoord,
  headingFromAxis,
  nextNode,
} from "../world.js";

const VEHICLE_COLORS = ["#ff7b54", "#e8b949", "#4db6ac", "#5874dc", "#ef5350", "#8e7dff"];

export function createTrafficVehicle(id, world, rng = Math.random) {
  const axis = rng() > 0.5 ? "x" : "z";
  const dir = rng() > 0.5 ? 1 : -1;
  const roadCenter = world.roadCenters[Math.floor(rng() * world.roadCenters.length)];
  const lineCoord = getLaneCoord(axis, roadCenter, dir, world.laneOffset);
  const startCoord = -world.streetEdge + rng() * world.streetEdge * 2;
  const targetCoord = nextNode(world.roadCenters, startCoord, dir, world.streetEdge);

  return {
    id,
    kind: "civilian",
    ai: "traffic",
    x: axis === "x" ? startCoord : lineCoord,
    y: 0,
    z: axis === "z" ? startCoord : lineCoord,
    vx: 0,
    vz: 0,
    speed: 0,
    heading: headingFromAxis(axis, dir),
    axis,
    dir,
    lineCoord,
    roadCenter,
    targetCoord,
    health: 100,
    color: VEHICLE_COLORS[Math.floor(rng() * VEHICLE_COLORS.length)],
    disabled: false,
    sirenPhase: 0,
  };
}

export function createParkedVehicle(id, world, rng = Math.random) {
  const axis = rng() > 0.5 ? "x" : "z";
  const dir = rng() > 0.5 ? 1 : -1;
  const roadCenter = world.roadCenters[Math.floor(rng() * world.roadCenters.length)];
  const curbOffset = world.roadWidth / 2 + world.sidewalkWidth + 6;
  const lineCoord = axis === "x" ? roadCenter + (dir > 0 ? -curbOffset : curbOffset) : roadCenter + (dir > 0 ? curbOffset : -curbOffset);
  const position = -world.streetEdge * 0.65 + rng() * world.streetEdge * 1.3;
  return {
    id,
    kind: "civilian",
    ai: "parked",
    x: axis === "x" ? position : lineCoord,
    y: 0,
    z: axis === "z" ? position : lineCoord,
    vx: 0,
    vz: 0,
    speed: 0,
    heading: headingFromAxis(axis, dir),
    axis,
    dir,
    lineCoord,
    roadCenter,
    targetCoord: position,
    health: 100,
    color: VEHICLE_COLORS[Math.floor(rng() * VEHICLE_COLORS.length)],
    disabled: false,
    sirenPhase: 0,
  };
}

export function createPoliceVehicle(id, world, spawn) {
  return {
    id,
    kind: "police",
    ai: "police",
    x: spawn.x,
    y: 0,
    z: spawn.z,
    vx: 0,
    vz: 0,
    speed: 0,
    heading: spawn.heading,
    axis: spawn.axis,
    dir: spawn.dir,
    lineCoord: spawn.lineCoord,
    roadCenter: spawn.roadCenter,
    targetCoord: spawn.targetCoord,
    health: 140,
    color: "#ffffff",
    disabled: false,
    sirenPhase: 0,
  };
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

export function updateTrafficVehicle(vehicle, world, dt, rng = Math.random) {
  if (vehicle.disabled) {
    vehicle.speed = lerp(vehicle.speed, 0, dt * 4);
    return;
  }

  const targetSpeed = vehicle.ai === "police" ? 19 : 13.5;
  vehicle.speed = lerp(vehicle.speed, targetSpeed, dt * (vehicle.ai === "police" ? 2.4 : 1.2));
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
  vehicle.speed = lerp(vehicle.speed, 19.5, dt * 2.2);
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
  const throttle = (input.isAnyDown(["w", "arrowup"]) ? 1 : 0) - (input.isAnyDown(["s", "arrowdown"]) ? 1 : 0);
  const steer = (input.isAnyDown(["d", "arrowright"]) ? 1 : 0) - (input.isAnyDown(["a", "arrowleft"]) ? 1 : 0);
  const braking = input.isDown(" ");
  const local = projectLocalVelocity(vehicle.heading, vehicle.vx, vehicle.vz);

  let forwardSpeed = local.forward;
  let lateralSpeed = local.lateral;
  const onRoad = Math.abs(vehicle.z - nearestValue(world.roadCenters, vehicle.z)) < world.roadWidth * 0.6 || Math.abs(vehicle.x - nearestValue(world.roadCenters, vehicle.x)) < world.roadWidth * 0.6;

  forwardSpeed += throttle * (throttle >= 0 ? 32 : 22) * dt;
  forwardSpeed = Math.max(-10, Math.min(onRoad ? 28 : 20, forwardSpeed));
  forwardSpeed = lerp(forwardSpeed, 0, dt * (braking ? 6.2 : onRoad ? 1.8 : 3.4));
  lateralSpeed = lerp(lateralSpeed, 0, dt * (onRoad ? 12 : 4));

  const turnRate = braking ? 2.4 : 1.8;
  vehicle.heading += steer * turnRate * dt * Math.min(1.4, Math.abs(forwardSpeed) / 7) * (forwardSpeed >= 0 ? 1 : -0.55);

  const velocity = composeVelocity(vehicle.heading, forwardSpeed, lateralSpeed * (onRoad ? 0.14 : 0.4));
  vehicle.vx = velocity.x;
  vehicle.vz = velocity.z;
  vehicle.speed = forwardSpeed;
  vehicle.x += vehicle.vx * dt;
  vehicle.z += vehicle.vz * dt;
  vehicle.x = Math.max(-world.streetEdge, Math.min(world.streetEdge, vehicle.x));
  vehicle.z = Math.max(-world.streetEdge, Math.min(world.streetEdge, vehicle.z));
}

export function collideVehicles(a, b) {
  const gap = distance2D(a.x, a.z, b.x, b.z);
  if (gap >= 5.1) return false;
  const bump = (a.speed - b.speed) * 0.4;
  a.speed = -bump;
  b.speed = bump;
  return true;
}
