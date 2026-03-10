import {
  PARKED_COUNT,
  PEDESTRIAN_COUNT,
  PICKUP_COUNT,
  PICKUP_RADIUS,
  PLAYER_RADIUS,
  TRAFFIC_COUNT,
  VEHICLE_RADIUS,
} from "./constants.js";
import { HUD_CONFIG, OBJECTIVE_TEXT } from "./config.js";
import {
  angleLerp,
  cameraRelativeVector,
  clamp,
  distance2D,
  lerp,
  projectLocalVelocity,
} from "./math.js";
import { createPedestrian, updatePedestrians } from "./systems/pedestrians.js";
import {
  collideVehicles,
  createParkedVehicle,
  createPoliceVehicle,
  createTrafficVehicle,
  detectVehicleContact,
  setVehicleRoute,
  updatePlayerVehicle,
  updatePoliceVehicle,
  updateTrafficVehicle,
} from "./systems/traffic.js";
import { addWanted, advanceWanted, desiredPoliceCount } from "./systems/wanted.js";
import { findPoliceSpawn, randomSidewalkSpot } from "./world.js";

function createPickup(id, world, rng = Math.random) {
  const spot = randomSidewalkSpot(world, rng);
  return {
    id,
    x: spot.x,
    y: 0.8,
    z: spot.z,
    value: 60 + Math.floor(rng() * 220),
    bob: rng() * Math.PI * 2,
  };
}

function createPlayer(world) {
  return {
    id: 1,
    x: world.playerSpawn.x,
    y: 0,
    z: world.playerSpawn.z,
    vx: 0,
    vz: 0,
    heading: world.playerSpawn.heading,
    moveHeading: world.playerSpawn.heading,
    speed: 0,
    health: 100,
    cash: 0,
    wanted: 0,
    wantedTimer: 0,
    invuln: 0,
    mode: "onfoot",
    vehicleId: null,
  };
}

export function createGameState(world, rng = Math.random) {
  let nextId = 2;
  const vehicles = [];
  const pedestrians = [];
  const pickups = [];

  for (let index = 0; index < TRAFFIC_COUNT; index += 1) {
    vehicles.push(createTrafficVehicle(nextId++, world, rng));
  }
  for (let index = 0; index < PARKED_COUNT; index += 1) {
    vehicles.push(createParkedVehicle(nextId++, world, rng));
  }
  for (let index = 0; index < PEDESTRIAN_COUNT; index += 1) {
    pedestrians.push(createPedestrian(nextId++, world, rng));
  }
  for (let index = 0; index < PICKUP_COUNT; index += 1) {
    pickups.push(createPickup(nextId++, world, rng));
  }

  return {
    nextId,
    time: 0,
    running: false,
    objective: OBJECTIVE_TEXT.intro,
    gameOver: false,
    world,
    player: createPlayer(world),
    vehicles,
    pedestrians,
    pickups,
    feedback: {
      damageFlash: 0,
      damageNotice: 0,
      damageShake: 0,
      damageSource: "collision",
    },
  };
}

function getVehicleById(state, id) {
  return state.vehicles.find((vehicle) => vehicle.id === id) || null;
}

function getPlayerAnchor(state) {
  if (state.player.mode === "vehicle" && state.player.vehicleId != null) {
    return getVehicleById(state, state.player.vehicleId) || state.player;
  }
  return state.player;
}

function refillPickups(state, world, rng = Math.random) {
  while (state.pickups.length < world.pickupCount) {
    state.pickups.push(createPickup(state.nextId++, world, rng));
  }
}

function resetPlayerToSpawn(player, world) {
  player.x = world.playerSpawn.x;
  player.z = world.playerSpawn.z;
  player.vx = 0;
  player.vz = 0;
  player.heading = world.playerSpawn.heading;
  player.moveHeading = world.playerSpawn.heading;
  player.speed = 0;
}

function updateOnFoot(player, input, cameraController, world, dt) {
  const moveX =
    (input.isAnyDown(["d", "arrowright"]) ? 1 : 0) -
    (input.isAnyDown(["a", "arrowleft"]) ? 1 : 0);
  const moveForward =
    (input.isAnyDown(["w", "arrowup"]) ? 1 : 0) -
    (input.isAnyDown(["s", "arrowdown"]) ? 1 : 0);
  const sprint = input.isDown("shift");

  if (moveX === 0 && moveForward === 0) {
    player.vx = lerp(player.vx, 0, dt * 8);
    player.vz = lerp(player.vz, 0, dt * 8);
    player.speed = Math.hypot(player.vx, player.vz);
    if (player.speed > 0.08) {
      player.heading = angleLerp(player.heading, player.moveHeading, dt * 8);
    }
    return;
  }

  const length = Math.hypot(moveX, moveForward) || 1;
  const localX = moveX / length;
  const localForward = moveForward / length;
  const worldMove = cameraRelativeVector(localX, localForward, cameraController.yaw);
  const speed = sprint ? 12 : 7;
  const desiredHeading = Math.atan2(worldMove.z, worldMove.x);

  player.vx = lerp(player.vx, worldMove.x * speed, dt * 10);
  player.vz = lerp(player.vz, worldMove.z * speed, dt * 10);
  player.x += player.vx * dt;
  player.z += player.vz * dt;
  player.moveHeading = angleLerp(player.moveHeading, desiredHeading, dt * 12);
  player.heading = angleLerp(player.heading, player.moveHeading, dt * 14);
  player.speed = Math.hypot(player.vx, player.vz);
  player.x = clamp(player.x, -world.streetEdge, world.streetEdge);
  player.z = clamp(player.z, -world.streetEdge, world.streetEdge);
}

function tryToggleVehicle(state) {
  const player = state.player;
  if (player.mode === "vehicle" && player.vehicleId != null) {
    const vehicle = getVehicleById(state, player.vehicleId);
    if (!vehicle) return;
    player.mode = "onfoot";
    player.vehicleId = null;
    player.x = clamp(
      vehicle.x + Math.cos(vehicle.heading + Math.PI / 2) * 3.4,
      -state.world.streetEdge,
      state.world.streetEdge,
    );
    player.z = clamp(
      vehicle.z + Math.sin(vehicle.heading + Math.PI / 2) * 3.4,
      -state.world.streetEdge,
      state.world.streetEdge,
    );
    player.heading = vehicle.heading;
    player.moveHeading = vehicle.heading;
    vehicle.ai = "parked";
    vehicle.speed = 0;
    vehicle.vx = 0;
    vehicle.vz = 0;
    state.objective = OBJECTIVE_TEXT.onFootHint;
    return;
  }

  let best = null;
  let bestDistance = Infinity;
  for (const vehicle of state.vehicles) {
    if (vehicle.kind === "police" || vehicle.disabled) continue;
    const gap = distance2D(player.x, player.z, vehicle.x, vehicle.z);
    if (gap < 4.6 && Math.abs(vehicle.speed) < 6 && gap < bestDistance) {
      best = vehicle;
      bestDistance = gap;
    }
  }

  if (best) {
    player.mode = "vehicle";
    player.vehicleId = best.id;
    best.ai = "player";
    best.speed = Math.max(best.speed, 0);
    state.objective = OBJECTIVE_TEXT.vehicleHint;
  }
}

function updatePlayerFromVehicle(state) {
  const vehicle = getVehicleById(state, state.player.vehicleId);
  if (!vehicle) {
    state.player.mode = "onfoot";
    state.player.vehicleId = null;
    return;
  }
  state.player.x = vehicle.x;
  state.player.z = vehicle.z;
  state.player.heading = vehicle.heading;
  state.player.moveHeading = vehicle.heading;
  state.player.speed = Math.abs(vehicle.speed);
}

function resetActiveEntity(state) {
  const player = state.player;

  if (player.mode === "vehicle" && player.vehicleId != null) {
    const vehicle = getVehicleById(state, player.vehicleId);
    if (!vehicle) return;
    const spawn = state.world.vehicleResetSpawn;
    setVehicleRoute(vehicle, spawn);
    vehicle.x = spawn.x;
    vehicle.z = spawn.z;
    vehicle.vx = 0;
    vehicle.vz = 0;
    vehicle.speed = 0;
    vehicle.disabled = false;
    player.invuln = Math.max(player.invuln, 0.6);
    updatePlayerFromVehicle(state);
    state.objective = OBJECTIVE_TEXT.vehicleReset;
    return;
  }

  resetPlayerToSpawn(player, state.world);
  player.invuln = Math.max(player.invuln, 0.45);
  state.objective = OBJECTIVE_TEXT.playerReset;
}

function registerPlayerDamage(state, amount, source, invuln = 0.35) {
  const player = state.player;
  if (player.invuln > 0) return false;

  player.health -= amount;
  player.invuln = invuln;
  state.feedback.damageFlash = Math.min(1, state.feedback.damageFlash + amount / 28);
  state.feedback.damageNotice = Math.max(state.feedback.damageNotice, 0.38);
  state.feedback.damageShake = Math.max(state.feedback.damageShake, 0.35 + amount / 48);
  state.feedback.damageSource = source;
  return true;
}

function decayFeedback(state, dt) {
  state.feedback.damageFlash = Math.max(0, state.feedback.damageFlash - dt * HUD_CONFIG.damageFlashFade);
  state.feedback.damageNotice = Math.max(0, state.feedback.damageNotice - dt * HUD_CONFIG.damageNoticeFade);
  state.feedback.damageShake = Math.max(0, state.feedback.damageShake - dt * 4.6);
}

function findVehicleBlocker(vehicle, state) {
  if (Math.abs(vehicle.x) > state.world.streetEdge - 1.4) {
    return { x: -Math.sign(vehicle.x), z: 0 };
  }
  if (Math.abs(vehicle.z) > state.world.streetEdge - 1.4) {
    return { x: 0, z: -Math.sign(vehicle.z) };
  }

  for (const other of state.vehicles) {
    if (other.id === vehicle.id) continue;
    const contact = detectVehicleContact(vehicle, other);
    if (!contact) continue;
    return { x: -contact.normal.x, z: -contact.normal.z };
  }

  return null;
}

function recoverPlayerVehicleIfStuck(state, dt) {
  const player = state.player;
  if (player.mode !== "vehicle" || player.vehicleId == null) return;

  const vehicle = getVehicleById(state, player.vehicleId);
  if (!vehicle) return;

  vehicle.recoveryCooldown = Math.max(0, (vehicle.recoveryCooldown ?? 0) - dt);
  const blocker = findVehicleBlocker(vehicle, state);
  const driverTryingToMove = Math.abs(vehicle.throttleInput ?? 0) > 0.6;
  const jammed = blocker && driverTryingToMove && Math.abs(vehicle.speed) < 2.2;

  vehicle.stuckTimer = jammed ? (vehicle.stuckTimer ?? 0) + dt : 0;
  if (vehicle.stuckTimer < 0.7 || vehicle.recoveryCooldown > 0) return;

  const nudge = 3 + Math.abs(vehicle.steerInput ?? 0) * 0.9;
  vehicle.x = clamp(vehicle.x + blocker.x * nudge, -state.world.streetEdge, state.world.streetEdge);
  vehicle.z = clamp(vehicle.z + blocker.z * nudge, -state.world.streetEdge, state.world.streetEdge);
  vehicle.vx = blocker.x * 4.5;
  vehicle.vz = blocker.z * 4.5;
  vehicle.speed = projectLocalVelocity(vehicle.heading, vehicle.vx, vehicle.vz).forward;
  vehicle.stuckTimer = 0;
  vehicle.recoveryCooldown = 1.1;
  player.invuln = Math.max(player.invuln, 0.2);
  state.objective = OBJECTIVE_TEXT.recovery;
}

function updateVehicles(state, world, input, dt, rng = Math.random) {
  const anchor = getPlayerAnchor(state);
  const trafficState = {
    vehicles: state.vehicles,
    playerAnchor: anchor,
  };

  for (const vehicle of state.vehicles) {
    if (vehicle.ai === "player") {
      updatePlayerVehicle(vehicle, world, input, dt);
      continue;
    }
    if (vehicle.ai === "traffic") {
      updateTrafficVehicle(vehicle, world, trafficState, dt, rng);
      continue;
    }
    if (vehicle.ai === "police") {
      updatePoliceVehicle(vehicle, world, anchor, dt, rng);
    }
  }
}

function updatePickups(state, world, dt, rng = Math.random) {
  const anchor = getPlayerAnchor(state);
  for (let index = state.pickups.length - 1; index >= 0; index -= 1) {
    const pickup = state.pickups[index];
    pickup.bob += dt * 2.2;
    if (distance2D(anchor.x, anchor.z, pickup.x, pickup.z) < PICKUP_RADIUS + 1.4) {
      state.player.cash += pickup.value;
      state.pickups.splice(index, 1);
      state.objective = OBJECTIVE_TEXT.pickup;
    }
  }
  refillPickups(state, world, rng);
}

function handleCollisions(state, dt) {
  const player = state.player;
  const playerVehicle =
    player.vehicleId != null ? getVehicleById(state, player.vehicleId) : null;

  if (!playerVehicle) {
    for (const vehicle of state.vehicles) {
      if (vehicle.ai === "parked") continue;
      if (
        distance2D(player.x, player.z, vehicle.x, vehicle.z) <
          PLAYER_RADIUS + VEHICLE_RADIUS &&
        Math.abs(vehicle.speed) > 8
      ) {
        registerPlayerDamage(state, 18, "traffic", 1);
      }
    }
  }

  if (playerVehicle) {
    for (const ped of state.pedestrians) {
      if (!ped.alive) continue;
      if (
        distance2D(playerVehicle.x, playerVehicle.z, ped.x, ped.z) < 2.4 &&
        Math.abs(playerVehicle.speed) > 7
      ) {
        ped.alive = false;
        player.cash += 40;
        addWanted(player, 1, 18);
        state.objective = OBJECTIVE_TEXT.pedHit;
      }
    }
  }

  for (let i = 0; i < state.vehicles.length; i += 1) {
    for (let j = i + 1; j < state.vehicles.length; j += 1) {
      const a = state.vehicles[i];
      const b = state.vehicles[j];
      if (a.ai === "parked" && b.ai === "parked") continue;
      if (collideVehicles(a, b)) {
        if (playerVehicle && (a.id === playerVehicle.id || b.id === playerVehicle.id)) {
          registerPlayerDamage(state, 8, "collision");
        }
      }
    }
  }

  for (const police of state.vehicles.filter((vehicle) => vehicle.ai === "police")) {
    if (distance2D(police.x, police.z, player.x, player.z) < 5.5) {
      if (registerPlayerDamage(state, playerVehicle ? 9 : 14, "police")) {
        player.wantedTimer = Math.max(player.wantedTimer, 12);
      }
    }
  }

  player.invuln = Math.max(0, player.invuln - dt);
  player.health = clamp(player.health, 0, 100);
  if (player.health === 0) {
    state.gameOver = true;
    state.objective = OBJECTIVE_TEXT.gameOver;
  }
}

function updatePolicePresence(state, world, dt, rng = Math.random) {
  advanceWanted(state.player, dt);
  const desired = desiredPoliceCount(state.player.wanted);
  const police = state.vehicles.filter((vehicle) => vehicle.ai === "police");

  while (police.length < desired) {
    const spawn = findPoliceSpawn(world, getPlayerAnchor(state), rng);
    const vehicle = createPoliceVehicle(state.nextId++, world, spawn);
    state.vehicles.push(vehicle);
    police.push(vehicle);
  }

  while (police.length > desired) {
    const toRemove = police.pop();
    const index = state.vehicles.findIndex((vehicle) => vehicle.id === toRemove.id);
    if (index >= 0) state.vehicles.splice(index, 1);
  }
}

function refreshDeadPeds(state, world, rng = Math.random) {
  for (let index = state.pedestrians.length - 1; index >= 0; index -= 1) {
    const ped = state.pedestrians[index];
    if (ped.alive) continue;
    state.pedestrians.splice(index, 1);
    state.pedestrians.push(createPedestrian(state.nextId++, world, rng));
  }
}

export function updateGameState(state, world, input, cameraController, dt, rng = Math.random) {
  if (!state.running || state.gameOver) return;

  state.time += dt;
  decayFeedback(state, dt);

  if (input.consumeAnyPress(["r"])) {
    resetActiveEntity(state);
  }

  if (input.consumeAnyPress(["e"])) {
    tryToggleVehicle(state);
  }

  if (state.player.mode === "vehicle" && state.player.vehicleId != null) {
    updateVehicles(state, world, input, dt, rng);
    updatePlayerFromVehicle(state);
  } else {
    updateOnFoot(state.player, input, cameraController, world, dt);
    updateVehicles(state, world, input, dt, rng);
  }

  updatePedestrians(state, world, dt, rng);
  updatePickups(state, world, dt, rng);
  handleCollisions(state, dt);
  recoverPlayerVehicleIfStuck(state, dt);
  refreshDeadPeds(state, world, rng);
  updatePolicePresence(state, world, dt, rng);

  if (state.player.mode === "vehicle" && state.player.vehicleId != null) {
    const vehicle = getVehicleById(state, state.player.vehicleId);
    if (vehicle) {
      vehicle.ai = "player";
      updatePlayerFromVehicle(state);
    }
  }

  if (state.player.wanted > 0 && state.player.mode === "onfoot") {
    state.objective = OBJECTIVE_TEXT.onFootWanted;
  }
}
