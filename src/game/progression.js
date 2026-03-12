export const RUN_CONFIG = {
  duration: 240,
  targetCash: 2400,
  heatBonusRate: 18,
  highValueBonus: 180,
  courierBonus: 240,
  heatSprintBonus: 210,
  courierSpeedThreshold: 22,
  courierDuration: 12,
  heatSprintDuration: 14,
  eventDuration: 42,
  eventCooldown: 8,
};

export function calculateHeatBonus(wantedLevel, dt, rate = RUN_CONFIG.heatBonusRate) {
  if (wantedLevel <= 0 || dt <= 0) return 0;
  return wantedLevel * rate * dt;
}

export function formatRunClock(timeRemaining) {
  const safe = Math.max(0, Math.ceil(timeRemaining));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function createDistrictEvent(type, overrides = {}) {
  return {
    type,
    progress: 0,
    duration: RUN_CONFIG.eventDuration,
    reward: 0,
    completed: false,
    ...overrides,
  };
}

export function summarizeRun(run, playerCash) {
  const score = Math.round(playerCash + run.heatBonus + run.eventBonus);
  return {
    score,
    cash: Math.round(playerCash),
    heatBonus: Math.round(run.heatBonus),
    eventBonus: Math.round(run.eventBonus),
  };
}
