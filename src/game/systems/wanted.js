import { MAX_POLICE } from "../constants.js";
import { clamp } from "../math.js";

export function desiredPoliceCount(wantedLevel) {
  if (wantedLevel <= 0) return 0;
  return Math.min(1 + wantedLevel, MAX_POLICE);
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
