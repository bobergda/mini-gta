import {
  PARKED_COUNT,
  PEDESTRIAN_COUNT,
  PICKUP_COUNT,
  PICKUP_RADIUS,
  PLAYER_RADIUS,
  TRAFFIC_COUNT,
  VEHICLE_RADIUS,
} from "./constants.js";
import { addWanted, advanceWanted, desiredPoliceCount } from "./systems/wanted.js";
import { createPedestrian, resetPedestrianRoute, updatePedestrians } from "./systems/pedestrians.js";
import {
  collideVehicles,
  createParkedVehicle,
  createPoliceVehicle,
  createTrafficVehicle,
  setVehicleRoute,
  updatePlayerVehicle,
  updatePoliceVehicle,
  updateTrafficVehicle,
} from "./systems/traffic.js";
import { clamp, distance2D, lerp } from "./math.js";
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
    x: world.sidewalkGuides[3],
    y: 0,
    z: world.sidewalkGuides[2],
    vx: 0,
    vz: 0,
    heading: 0,
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
    objective: "Ukradnij auto i utrzymaj przewagę, zanim dopadną cię radiowozy.",
    gameOver: false,
    world,
    player: createPlayer(world),
    vehicles,
    pedestrians,
    pickups,
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

function updateOnFoot(player, input, cameraController, world, dt) {
  const moveX = (input.isAnyDown(["d", "arrowright"]) ? 1 : 0) - (input.isAnyDown(["a", "arrowleft"]) ? 1 : 0);
  const moveZ = (input.isAnyDown(["s", "arrowdown"]) ? 1 : 0) - (input.isAnyDown(["w", "arrowup"]) ? 1 : 0);
  const sprint = input.isDown("shift");

  if (moveX === 0 && moveZ === 0) {
    player.vx = lerp(player.vx, 0, dt * 8);
    player.vz = lerp(player.vz, 0, dt * 8);
    player.speed = Math.hypot(player.vx, player.vz);
    return;
  }

  const length = Math.hypot(moveX, moveZ) || 1;
  const localX = moveX / length;
  const localZ = moveZ / length;
  const yaw = cameraController.yaw;
  const worldX = localX * Math.cos(yaw) - localZ * Math.sin(yaw);
  const worldZ = localX * Math.sin(yaw) + localZ * Math.cos(yaw);
  const speed = sprint ? 12 : 7;

  player.vx = lerp(player.vx, worldX * speed, dt * 10);
  player.vz = lerp(player.vz, worldZ * speed, dt * 10);
  player.x += player.vx * dt;
  player.z += player.vz * dt;
  player.heading = Math.atan2(player.vz, player.vx);
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
    player.x = clamp(vehicle.x + Math.cos(vehicle.heading + Math.PI / 2) * 3.4, -state.world.streetEdge, state.world.streetEdge);
    player.z = clamp(vehicle.z + Math.sin(vehicle.heading + Math.PI / 2) * 3.4, -state.world.streetEdge, state.world.streetEdge);
    player.heading = vehicle.heading;
    vehicle.ai = "parked";
    vehicle.speed = 0;
    vehicle.vx = 0;
    vehicle.vz = 0;
    state.objective = "Na piechotę jesteś bardziej zwrotny, ale wolniej zgubisz pościg.";
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
    state.objective = "Masz furę. Zbieraj gotówkę i uważaj na policję.";
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
  state.player.speed = Math.abs(vehicle.speed);
}

function updateVehicles(state, world, input, dt, rng = Math.random) {
  for (const vehicle of state.vehicles) {
    if (vehicle.ai === "player") {
      updatePlayerVehicle(vehicle, world, input, dt);
      continue;
    }
    if (vehicle.ai === "traffic") {
      updateTrafficVehicle(vehicle, world, dt, rng);
      continue;
    }
    if (vehicle.ai === "police") {
      const anchor = getPlayerAnchor(state);
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
      state.objective = "Masz łup. Jeszcze kilka paczek albo szybka ucieczka przed policją.";
    }
  }
  refillPickups(state, world, rng);
}

function handleCollisions(state, dt) {
  const player = state.player;
  const playerVehicle = player.vehicleId != null ? getVehicleById(state, player.vehicleId) : null;

  if (!playerVehicle) {
    for (const vehicle of state.vehicles) {
      if (vehicle.ai === "parked") continue;
      if (distance2D(player.x, player.z, vehicle.x, vehicle.z) < PLAYER_RADIUS + VEHICLE_RADIUS && Math.abs(vehicle.speed) > 8 && player.invuln <= 0) {
        player.health -= 18;
        player.invuln = 1;
      }
    }
  }

  if (playerVehicle) {
    for (const ped of state.pedestrians) {
      if (!ped.alive) continue;
      if (distance2D(playerVehicle.x, playerVehicle.z, ped.x, ped.z) < 2.4 && Math.abs(playerVehicle.speed) > 7) {
        ped.alive = false;
        player.cash += 40;
        addWanted(player, 1, 18);
        state.objective = "Masz krew na zderzaku. Policja natychmiast weszła w pościg.";
      }
    }
  }

  for (let i = 0; i < state.vehicles.length; i += 1) {
    for (let j = i + 1; j < state.vehicles.length; j += 1) {
      const a = state.vehicles[i];
      const b = state.vehicles[j];
      if (a.ai === "parked" && b.ai === "parked") continue;
      if (collideVehicles(a, b)) {
        if (playerVehicle && (a.id === playerVehicle.id || b.id === playerVehicle.id) && player.invuln <= 0) {
          player.health -= 8;
          player.invuln = 0.35;
        }
      }
    }
  }

  for (const police of state.vehicles.filter((vehicle) => vehicle.ai === "police")) {
    if (distance2D(police.x, police.z, player.x, player.z) < 5.5) {
      if (player.invuln <= 0) {
        player.health -= playerVehicle ? 9 : 14;
        player.invuln = 0.35;
        player.wantedTimer = Math.max(player.wantedTimer, 12);
      }
    }
  }

  player.invuln = Math.max(0, player.invuln - dt);
  player.health = clamp(player.health, 0, 100);
  if (player.health === 0) {
    state.gameOver = true;
    state.objective = "Koniec gry. Odśwież stronę, aby wrócić do miasta.";
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
  if (state.gameOver) return;

  state.time += dt;
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
    state.objective = "Jesteś śledzony. Schowaj się albo dorwij auto, żeby zgubić radiowozy.";
  }
}
