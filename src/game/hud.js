import { HUD_CONFIG, UI_TEXT } from "./config.js";
import { formatRunClock } from "./progression.js";

function readTextPath(source, path) {
  return path.split(".").reduce((value, part) => value?.[part], source);
}

function readEventLabel(state, text) {
  const activeEvent = state.run?.districtEvent;
  if (!activeEvent) {
    return text.hud.eventIdle;
  }

  if (activeEvent.type === "highValuePickup") {
    return `High value pickup | ${Math.ceil(activeEvent.duration)} s`;
  }
  if (activeEvent.type === "courierRun") {
    return `Kurier | ${activeEvent.progress.toFixed(1)} / ${activeEvent.required}s`;
  }
  return `Hot zone | ${activeEvent.progress.toFixed(1)} / ${activeEvent.required}s`;
}

export function createHud(documentRef) {
  return {
    startOverlay: documentRef.getElementById("startOverlay"),
    endOverlay: documentRef.getElementById("endOverlay"),
    startButton: documentRef.getElementById("startButton"),
    restartButton: documentRef.getElementById("restartButton"),
    muteButton: documentRef.getElementById("muteButton"),
    districtName: documentRef.querySelector("[data-district-name]"),
    objective: documentRef.getElementById("objective"),
    eventLine: documentRef.getElementById("eventLine"),
    statusLine: documentRef.getElementById("statusLine"),
    cashLine: documentRef.getElementById("cashLine"),
    wantedLine: documentRef.getElementById("wantedLine"),
    healthLine: documentRef.getElementById("healthLine"),
    recentLine: documentRef.getElementById("recentLine"),
    districtLine: documentRef.querySelector("[data-district-line]"),
    speedLine: documentRef.querySelector("[data-speed-line]"),
    trafficLine: documentRef.querySelector("[data-traffic-line]"),
    fpsLine: documentRef.querySelector("[data-fps-line]"),
    timerLine: documentRef.querySelector("[data-timer-line]"),
    scoreLine: documentRef.querySelector("[data-score-line]"),
    targetLine: documentRef.querySelector("[data-target-line]"),
    bonusLine: documentRef.querySelector("[data-bonus-line]"),
    audioLine: documentRef.getElementById("audioLine"),
    restartHint: documentRef.getElementById("restartHint"),
    endTitle: documentRef.getElementById("endTitle"),
    endLead: documentRef.getElementById("endLead"),
    endScore: documentRef.getElementById("endScore"),
    endCash: documentRef.getElementById("endCash"),
    endHeat: documentRef.getElementById("endHeat"),
    endEvent: documentRef.getElementById("endEvent"),
    damageFlash: documentRef.getElementById("damageFlash"),
    staticText: [...documentRef.querySelectorAll("[data-ui]")],
    controlRows: [...documentRef.querySelectorAll("[data-control-row]")],
    startControlRows: [...documentRef.querySelectorAll("[data-start-control]")],
  };
}

export function hideStartOverlay(hud) {
  hud.startOverlay?.classList.add("is-hidden");
}

export function hideEndOverlay(hud) {
  hud.endOverlay?.classList.add("is-hidden");
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

export function syncHud(hud, state, telemetry = {}, text = UI_TEXT, options = {}) {
  const stars = `${"*".repeat(state.player.wanted)}${"-".repeat(HUD_CONFIG.maxWantedStars - state.player.wanted)}`;
  const movingTraffic = state.vehicles.filter((vehicle) => vehicle.ai !== "parked").length;
  const speedKmh = Math.round(state.player.speed * 3.6);
  const fps = Math.round(telemetry.fps || 0);
  const damageSource = text.hud.damageSources[state.feedback.damageSource] ?? text.hud.damageHit;
  const summary = state.run.summary ?? {
    score: state.run.score,
    cash: state.player.cash,
    heatBonus: state.run.heatBonus,
    eventBonus: state.run.eventBonus,
  };

  if (hud.districtName) {
    hud.districtName.textContent = state.world.districtName;
  }

  hud.objective.textContent = state.objective;
  hud.eventLine.textContent = `${text.hud.eventLabel}: ${readEventLabel(state, text)}`;
  hud.statusLine.textContent = !state.running
    ? state.gameOver
      ? text.hud.statusGameOver
      : text.hud.statusReady
    : state.player.mode === "vehicle"
      ? `${text.hud.statusVehicle} | ${Math.round(state.player.x)}, ${Math.round(state.player.z)}`
      : `${text.hud.statusOnFoot} | ${Math.round(state.player.x)}, ${Math.round(state.player.z)}`;
  if (state.feedback.damageNotice > 0 && !state.gameOver) {
    hud.statusLine.textContent += ` | ${text.hud.damageHit}: ${damageSource}`;
  }

  hud.cashLine.textContent = `${text.hud.cashLabel}: $${Math.round(state.player.cash)}`;
  hud.wantedLine.textContent = `${text.hud.wantedLabel}: ${stars}`;
  hud.healthLine.textContent = `${text.hud.healthLabel}: ${Math.round(state.player.health)}`;
  hud.recentLine.textContent = `${text.hud.recentLabel}: ${state.feedback.recentEvent || "---"}`;
  hud.districtLine.textContent = `${text.hud.districtTitle}: ${state.world.districtName}`;
  hud.speedLine.textContent = `${text.hud.speedLabel}: ${speedKmh} km/h`;
  hud.trafficLine.textContent = `${text.hud.trafficLabel}: ${movingTraffic}`;
  hud.fpsLine.textContent = `${text.hud.fpsLabel}: ${fps}`;
  hud.timerLine.textContent = `${text.hud.timerLabel}: ${formatRunClock(state.run.timeRemaining)}`;
  hud.scoreLine.textContent = `${text.hud.scoreLabel}: ${state.run.score}`;
  hud.targetLine.textContent = `${text.hud.targetLabel}: ${state.run.targetCash}`;
  hud.bonusLine.textContent = `${text.hud.bonusLabel}: ${Math.round(state.run.heatBonus)}`;
  hud.audioLine.textContent = options.muted ? text.hud.audioOff : text.hud.audioOn;
  hud.muteButton.textContent = options.muted ? text.hud.unmuteButton : text.hud.muteButton;
  hud.restartHint.textContent = text.hud.restartHint;

  if (hud.damageFlash) {
    hud.damageFlash.style.setProperty("--damage-alpha", state.feedback.damageFlash.toFixed(3));
  }

  hud.statusLine.classList.toggle("dead", state.gameOver);
  hud.healthLine.classList.toggle("dead", state.player.health <= 25);
  hud.healthLine.classList.toggle("alert", state.feedback.damageNotice > 0 && !state.gameOver);
  hud.eventLine.classList.toggle("pulse", state.feedback.eventPulse > 0.01);

  if (state.gameOver && hud.endOverlay) {
    hud.endOverlay.classList.remove("is-hidden");
    hud.endTitle.textContent =
      state.run.result === "time_up"
        ? text.endOverlay.timeoutTitle
        : state.run.targetReached
          ? text.endOverlay.survivedTitle
          : text.endOverlay.failedTitle;
    hud.endLead.textContent = text.endOverlay.summaryLead;
    hud.endScore.textContent = `${summary.score}`;
    hud.endCash.textContent = `$${summary.cash}`;
    hud.endHeat.textContent = `$${summary.heatBonus}`;
    hud.endEvent.textContent = `$${summary.eventBonus}`;
  } else {
    hud.endOverlay?.classList.add("is-hidden");
  }
}
