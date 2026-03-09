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
  };
}

export function hideStartOverlay(hud) {
  hud.startOverlay?.classList.add("is-hidden");
}

export function syncHud(hud, state, telemetry = {}) {
  const stars = `${"*".repeat(state.player.wanted)}${"-".repeat(5 - state.player.wanted)}`;
  const movingTraffic = state.vehicles.filter((vehicle) => vehicle.ai !== "parked").length;
  const speedKmh = Math.round(state.player.speed * 3.6);
  const fps = Math.round(telemetry.fps || 0);

  if (hud.districtName) {
    hud.districtName.textContent = state.world.districtName;
  }

  hud.objective.textContent = state.objective;
  hud.statusLine.textContent = !state.running
    ? "Gotowy do wjazdu"
    : state.gameOver
      ? "Koniec gry"
      : state.player.mode === "vehicle"
        ? `W aucie | ${Math.round(state.player.x)}, ${Math.round(state.player.z)}`
        : `Na piechote | ${Math.round(state.player.x)}, ${Math.round(state.player.z)}`;
  hud.cashLine.textContent = `Gotowka: $${state.player.cash}`;
  hud.wantedLine.textContent = `Poscig: ${stars}`;
  hud.healthLine.textContent = `Zdrowie: ${Math.round(state.player.health)}`;
  hud.districtLine.textContent = `Dzielnica: ${state.world.districtName}`;
  hud.speedLine.textContent = `Predkosc: ${speedKmh} km/h`;
  hud.trafficLine.textContent = `Ruch: ${movingTraffic}`;
  hud.fpsLine.textContent = `FPS: ${fps}`;

  hud.statusLine.classList.toggle("dead", state.gameOver);
  hud.healthLine.classList.toggle("dead", state.player.health <= 25);
}
