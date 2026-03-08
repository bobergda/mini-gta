export function createHud(documentRef) {
  return {
    objective: documentRef.getElementById("objective"),
    statusLine: documentRef.getElementById("statusLine"),
    cashLine: documentRef.getElementById("cashLine"),
    wantedLine: documentRef.getElementById("wantedLine"),
    healthLine: documentRef.getElementById("healthLine"),
  };
}

export function syncHud(hud, state) {
  const stars = `${"★".repeat(state.player.wanted)}${"☆".repeat(5 - state.player.wanted)}`;
  hud.objective.textContent = state.objective;
  hud.statusLine.textContent = state.gameOver
    ? "Koniec gry"
    : state.player.mode === "vehicle"
      ? `W aucie | ${Math.round(state.player.x)}, ${Math.round(state.player.z)}`
      : `Na piechotę | ${Math.round(state.player.x)}, ${Math.round(state.player.z)}`;
  hud.cashLine.textContent = `Gotówka: $${state.player.cash}`;
  hud.wantedLine.textContent = `Pościg: ${stars}`;
  hud.healthLine.textContent = `Zdrowie: ${Math.round(state.player.health)}`;

  hud.statusLine.classList.toggle("dead", state.gameOver);
  hud.healthLine.classList.toggle("dead", state.player.health <= 25);
}
