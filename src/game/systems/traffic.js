import { composeVelocity, distance2D, lerp, projectLocalVelocity } from "../math.js";
import {
  chooseTrafficTurn,
  getLaneCoord,
  headingFromAxis,
  nearestValue,
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
  vehicle.speed = lerp(vehicle.speed, 21.5, dt * 2.7);
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

  const desiredHeading = Math.atan2(target.z - vehicle.z, target.x - vehicle.x);
  vehicle.heading = lerp(vehicle.heading, desiredHeading, dt * 1.1);
  const snappedAxis = Math.abs(Math.cos(vehicle.heading)) > Math.abs(Math.sin(vehicle.heading)) ? "x" : "z";
  if (snappedAxis !== vehicle.axis) {
    vehicle.axis = snappedAxis;
    vehicle.dir = snappedAxis === "x" ? (Math.cos(vehicle.heading) >= 0 ? 1 : -1) : Math.sin(vehicle.heading) >= 0 ? 1 : -1;
    vehicle.roadCenter = snappedAxis === "x" ? nearestValue(world.roadCenters, vehicle.z) : nearestValue(world.roadCenters, vehicle.x);
    vehicle.lineCoord = getLaneCoord(vehicle.axis, vehicle.roadCenter, vehicle.dir, world.laneOffset);
    vehicle.targetCoord = nextNode(world.roadCenters, vehicle.axis === "x" ? vehicle.x : vehicle.z, vehicle.dir, world.streetEdge);
  }
}

export function updatePlayerVehicle(vehicle, world, input, dt) {
  const throttle = (input.isDown("w") ? 1 : 0) - (input.isDown("s") ? 1 : 0);
  const steer = (input.isDown("d") ? 1 : 0) - (input.isDown("a") ? 1 : 0);
  const braking = input.isDown(" ");
  const local = projectLocalVelocity(vehicle.heading, vehicle.vx, vehicle.vz);

  let forwardSpeed = local.forward;
  let lateralSpeed = local.lateral;
  const onRoad = Math.abs(vehicle.z - nearestValue(world.roadCenters, vehicle.z)) < world.roadWidth * 0.6 || Math.abs(vehicle.x - nearestValue(world.roadCenters, vehicle.x)) < world.roadWidth * 0.6;

  forwardSpeed += throttle * (throttle >= 0 ? 36 : 26) * dt;
  forwardSpeed = Math.max(-12, Math.min(onRoad ? 32 : 24, forwardSpeed));
  forwardSpeed = lerp(forwardSpeed, 0, dt * (braking ? 5.6 : onRoad ? 1.35 : 2.8));
  lateralSpeed = lerp(lateralSpeed, 0, dt * (onRoad ? 10 : 3));

  const turnRate = braking ? 2.8 : 2.1;
  vehicle.heading += steer * turnRate * dt * Math.min(1.7, Math.abs(forwardSpeed) / 6) * (forwardSpeed >= 0 ? 1 : -0.65);

  const velocity = composeVelocity(vehicle.heading, forwardSpeed, lateralSpeed * (onRoad ? 0.22 : 0.72));
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
