import { HUD_CONFIG, UI_TEXT } from "./config.js";

function readTextPath(source, path) {
  return path.split(".").reduce((value, part) => value?.[part], source);
}

export function createHud(documentRef) {
  return {
    startOverlay: documentRef.getElementById("startOverlay"),
    startButton: documentRef.getElementById("startButton"),
    districtName: documentRef.querySelector("[data-district-name]"),
    objective: documentRef.getElementById("objective"),
    statusLine: documentRef.getElementById("statusLine"),
    cashLine: documentRef.getElementById("cashLine"),
    wantedLine: documentRef.getElementById("wantedLine"),
    healthLine: documentRef.getElementById("healthLine"),
    districtLine: documentRef.querySelector("[data-district-line]"),
    speedLine: documentRef.querySelector("[data-speed-line]"),
    trafficLine: documentRef.querySelector("[data-traffic-line]"),
    fpsLine: documentRef.querySelector("[data-fps-line]"),
    damageFlash: documentRef.getElementById("damageFlash"),
    staticText: [...documentRef.querySelectorAll("[data-ui]")],
    controlRows: [...documentRef.querySelectorAll("[data-control-row]")],
    startControlRows: [...documentRef.querySelectorAll("[data-start-control]")],
  };
}

export function hideStartOverlay(hud) {
  hud.startOverlay?.classList.add("is-hidden");
}

export function applyHudText(hud, text = UI_TEXT) {
  for (const node of hud.staticText) {
    const value = readTextPath(text, node.dataset.ui ?? "");
    if (typeof value === "string") {
      node.textContent = value;
    }
  }

  hud.controlRows.forEach((node, index) => {
    node.textContent = text.hud.controls[index] ?? "";
  });

  hud.startControlRows.forEach((node, index) => {
    const pair = text.startControls[index];
    if (!pair) return;
    node.textContent = node.dataset.startControl === "key" ? pair[0] : pair[1];
  });
}

export function syncHud(hud, state, telemetry = {}, text = UI_TEXT) {
  const stars = `${"*".repeat(state.player.wanted)}${"-".repeat(HUD_CONFIG.maxWantedStars - state.player.wanted)}`;
  const movingTraffic = state.vehicles.filter((vehicle) => vehicle.ai !== "parked").length;
  const speedKmh = Math.round(state.player.speed * 3.6);
  const fps = Math.round(telemetry.fps || 0);
  const damageSource = text.hud.damageSources[state.feedback.damageSource] ?? text.hud.damageHit;

  if (hud.districtName) {
    hud.districtName.textContent = state.world.districtName;
  }

  hud.objective.textContent = state.objective;
  hud.statusLine.textContent = !state.running
    ? text.hud.statusReady
    : state.gameOver
      ? text.hud.statusGameOver
      : state.player.mode === "vehicle"
        ? `${text.hud.statusVehicle} | ${Math.round(state.player.x)}, ${Math.round(state.player.z)}`
        : `${text.hud.statusOnFoot} | ${Math.round(state.player.x)}, ${Math.round(state.player.z)}`;
  if (state.feedback.damageNotice > 0 && !state.gameOver) {
    hud.statusLine.textContent += ` | ${text.hud.damageHit}: ${damageSource}`;
  }

  hud.cashLine.textContent = `${text.hud.cashLabel}: $${state.player.cash}`;
  hud.wantedLine.textContent = `${text.hud.wantedLabel}: ${stars}`;
  hud.healthLine.textContent = `${text.hud.healthLabel}: ${Math.round(state.player.health)}`;
  hud.districtLine.textContent = `${text.hud.districtTitle}: ${state.world.districtName}`;
  hud.speedLine.textContent = `${text.hud.speedLabel}: ${speedKmh} km/h`;
  hud.trafficLine.textContent = `${text.hud.trafficLabel}: ${movingTraffic}`;
  hud.fpsLine.textContent = `${text.hud.fpsLabel}: ${fps}`;

  if (hud.damageFlash) {
    hud.damageFlash.style.setProperty("--damage-alpha", state.feedback.damageFlash.toFixed(3));
  }

  hud.statusLine.classList.toggle("dead", state.gameOver);
  hud.healthLine.classList.toggle("dead", state.player.health <= 25);
  hud.healthLine.classList.toggle("alert", state.feedback.damageNotice > 0 && !state.gameOver);
}
