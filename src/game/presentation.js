export const WORLD_THEME = {
  skyTop: "#f5b36a",
  skyMid: "#ef8d52",
  skyBottom: "#90bdd7",
  fogColor: "#9db7c6",
  fogStart: 150,
  fogEndFactor: 0.76,
  grassColor: "#61765b",
  groundShadowColor: "#263128",
  roadColor: "#30363d",
  roadEdgeColor: "#404954",
  laneColor: "#f7e7bf",
  sidewalkColor: "#bfb6a0",
  curbColor: "#8a8277",
  ringWallColor: "#394140",
  lampMetal: "#4b5563",
  lampGlow: "#ffd082",
  lampPool: "#f4b453",
  glassColor: "#c7d8ea",
  policeBlue: "#3b82f6",
  policeRed: "#ef4444",
  pickupGlow: "#fdd835",
  buildingPalette: ["#b46854", "#b7a264", "#6c7f98", "#6d877e", "#8e6154", "#c1b38d"],
  roofPalette: ["#4d5560", "#5c636d", "#6a5c53"],
  treeTrunk: "#6f4b2c",
  treeLeafDark: "#4b7157",
  treeLeafLight: "#76a26d",
  signAccent: "#f05c37",
  bollardColor: "#646d78",
  hydrantColor: "#d24a3c",
};

const QUALITY_PRESETS = {
  low: {
    hardwareScale: 1.35,
    glowIntensity: 0.18,
    shadowMapSize: 512,
    enableShadows: false,
  },
  medium: {
    hardwareScale: 1.1,
    glowIntensity: 0.32,
    shadowMapSize: 1024,
    enableShadows: true,
  },
  high: {
    hardwareScale: 0.9,
    glowIntensity: 0.45,
    shadowMapSize: 2048,
    enableShadows: true,
  },
};

export function getQualityPreset(name = "medium") {
  return QUALITY_PRESETS[name] ?? QUALITY_PRESETS.medium;
}

export function canTriggerImpactPulse(lastPulseAt, now, cooldown = 0.18) {
  return lastPulseAt == null || now - lastPulseAt >= cooldown;
}
