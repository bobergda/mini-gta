import { MAX_POLICE } from "../constants.js";
import { clamp } from "../math.js";

const PURSUIT_CLEAR_STATE = {
  status: "clear",
  searchTimer: 0,
  lastKnownX: 0,
  lastKnownZ: 0,
};

export function desiredPoliceCount(wantedLevel) {
  if (wantedLevel <= 0) return 0;
  return Math.min(1 + wantedLevel, MAX_POLICE);
}

export function getPursuitSightDistance(wantedLevel) {
  return 46 + wantedLevel * 12;
}

export function getSearchDuration(wantedLevel) {
  return 5 + wantedLevel * 2.2;
}

export function wantedDecayMultiplier(status) {
  if (status === "locked") return 0;
  if (status === "search") return 0.45;
  if (status === "cooling") return 1.2;
  return 1;
}

export function updatePursuitState(
  pursuit,
  wantedLevel,
  policeVehicles,
  target,
  dt,
) {
  if (wantedLevel <= 0) {
    return {
      ...PURSUIT_CLEAR_STATE,
      lastKnownX: target?.x ?? 0,
      lastKnownZ: target?.z ?? 0,
    };
  }

  const previous = pursuit ?? PURSUIT_CLEAR_STATE;
  const lastKnownX = previous.lastKnownX ?? target?.x ?? 0;
  const lastKnownZ = previous.lastKnownZ ?? target?.z ?? 0;
  const sightDistance = getPursuitSightDistance(wantedLevel);
  const hasContact = policeVehicles.some((police) => {
    const dx = police.x - target.x;
    const dz = police.z - target.z;
    return Math.hypot(dx, dz) <= sightDistance;
  });

  if (hasContact) {
    return {
      status: "locked",
      searchTimer: getSearchDuration(wantedLevel),
      lastKnownX: target.x,
      lastKnownZ: target.z,
    };
  }

  const hadTrail =
    previous.status === "locked" ||
    previous.status === "search" ||
    previous.searchTimer > 0;
  const searchTimer = Math.max(
    0,
    (hadTrail ? previous.searchTimer : getSearchDuration(wantedLevel) * 0.35) - dt,
  );

  if (hadTrail && searchTimer > 0) {
    return {
      status: "search",
      searchTimer,
      lastKnownX,
      lastKnownZ,
    };
  }

  return {
    status: "cooling",
    searchTimer: 0,
    lastKnownX,
    lastKnownZ,
  };
}

export function advanceWanted(player, dt) {
  if (player.wanted <= 0) {
    player.wantedTimer = 0;
    return;
  }

  player.wantedTimer = Math.max(0, player.wantedTimer - dt);
  if (player.wantedTimer === 0) {
    player.wanted = clamp(player.wanted - 1, 0, 5);
    player.wantedTimer = player.wanted > 0 ? 10 : 0;
  }
}

export function addWanted(player, amount, cooldown = 15) {
  player.wanted = clamp(player.wanted + amount, 0, 5);
  player.wantedTimer = Math.max(player.wantedTimer, cooldown);
}
