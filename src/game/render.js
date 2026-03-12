import { Engine } from "@babylonjs/core/Engines/engine";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Scene } from "@babylonjs/core/scene";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import "@babylonjs/core/Meshes/Builders/boxBuilder";
import "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import "@babylonjs/core/Meshes/Builders/sphereBuilder";
import "@babylonjs/core/Shaders/default.vertex";
import "@babylonjs/core/Shaders/default.fragment";
import { WORLD_THEME } from "./presentation.js";

const TEMP_TARGET = new Vector3();
const CHARACTER_HEADING_OFFSET = -Math.PI / 2;
const DEFAULT_QUALITY = {
  hardwareScale: 1,
  glowIntensity: 0.32,
  enableShadows: true,
};

function hash2(x, z) {
  const seed = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453123;
  return seed - Math.floor(seed);
}

function createMaterial(scene, color, options = {}) {
  const material = new StandardMaterial(`mat-${Math.random().toString(36).slice(2, 9)}`, scene);
  material.diffuseColor = Color3.FromHexString(color);
  material.specularColor = options.specularColor
    ? Color3.FromHexString(options.specularColor)
    : new Color3(0.1, 0.1, 0.1);
  material.specularPower = options.specularPower ?? 40;
  material.backFaceCulling = false;

  if (options.emissiveColor) {
    const emissive = Color3.FromHexString(options.emissiveColor);
    material.emissiveColor =
      typeof options.emissiveIntensity === "number"
        ? emissive.scale(options.emissiveIntensity)
        : emissive;
  }

  if (typeof options.alpha === "number") {
    material.alpha = options.alpha;
  }

  if (typeof options.disableLighting === "boolean") {
    material.disableLighting = options.disableLighting;
  }

  return material;
}

function createShadowMaterial(scene, alpha = 0.32) {
  return createMaterial(scene, "#05070d", {
    emissiveColor: "#000000",
    emissiveIntensity: 0.08,
    alpha,
    specularPower: 1,
  });
}

function addBlobShadow(root, scene, diameter, alpha = 0.32) {
  const shadow = MeshBuilder.CreateCylinder(
    "blob-shadow",
    { diameterTop: diameter, diameterBottom: diameter * 0.92, height: 0.05, tessellation: 20 },
    scene,
  );
  shadow.material = createShadowMaterial(scene, alpha);
  shadow.position.y = 0.03;
  shadow.parent = root;
  return shadow;
}

function disposeNode(node) {
  const materials = new Set();
  for (const mesh of node.getChildMeshes(false)) {
    if (mesh.material) {
      materials.add(mesh.material);
    }
  }
  node.dispose(false);
  for (const material of materials) {
    material.dispose(false, true);
  }
}

function setupAtmosphere(scene, world, quality) {
  const tone = WORLD_THEME.skyTop;
  const clearColor = Color4.FromHexString(tone);
  scene.clearColor = new Color4(clearColor.r, clearColor.g, clearColor.b, 1);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = Color3.FromHexString(WORLD_THEME.fogColor);
  scene.fogStart = WORLD_THEME.fogStart;
  scene.fogEnd = world.size * (WORLD_THEME.fogEndFactor ?? 0.75);
  scene.environmentIntensity = 0.9;
  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.exposure = 1.05;
  scene.imageProcessingConfiguration.contrast = 1.08;
  if (quality?.enableShadows) {
    scene.autoClear = true;
  }
}

function createPropMaterial(scene, color, options = {}) {
  return createMaterial(scene, color, { emissiveColor: color, emissiveIntensity: 0.6, disableLighting: true, ...options });
}

function createHydrant(scene, position) {
  const material = createPropMaterial(scene, WORLD_THEME.hydrantColor);
  const body = MeshBuilder.CreateCylinder("hydrant-body", { diameterTop: 0.18, diameterBottom: 0.22, height: 1.1, tessellation: 12 }, scene);
  body.material = material;
  body.position.set(position.x, 0.55, position.z);
  const cap = MeshBuilder.CreateBox("hydrant-cap", { width: 0.35, height: 0.15, depth: 0.35 }, scene);
  cap.material = material;
  cap.position.set(position.x, 1.1, position.z);
}

function createBollard(scene, position) {
  const material = createPropMaterial(scene, WORLD_THEME.bollardColor);
  const pole = MeshBuilder.CreateCylinder("bollard", { diameterTop: 0.22, diameterBottom: 0.22, height: 0.9, tessellation: 6 }, scene);
  pole.material = material;
  pole.position.set(position.x, 0.45, position.z);
  const cap = MeshBuilder.CreateBox("bollard-cap", { width: 0.3, height: 0.08, depth: 0.3 }, scene);
  cap.material = material;
  cap.position.set(position.x, 0.9, position.z);
}

function createSign(scene, position) {
  const mat = createPropMaterial(scene, WORLD_THEME.signAccent);
  const board = MeshBuilder.CreateBox("sign-board", { width: 0.36, height: 0.22, depth: 0.04 }, scene);
  board.material = mat;
  board.position.set(position.x, 1.75, position.z);
  const pole = MeshBuilder.CreateBox("sign-pole", { width: 0.08, height: 1.6, depth: 0.08 }, scene);
  pole.material = createPropMaterial(scene, WORLD_THEME.bollardColor);
  pole.position.set(position.x, 0.8, position.z);
  if (position.axis === "z") {
    board.rotation.y = Math.PI / 2;
  }
}

function createCharacterMesh(scene, tone, shirt, armed = false) {
  const root = new TransformNode("character", scene);

  addBlobShadow(root, scene, 1.2, 0.28);

  const torso = MeshBuilder.CreateBox("character-torso", { width: 0.86, height: 1.08, depth: 0.48 }, scene);
  torso.material = createMaterial(scene, shirt, { specularPower: 24 });
  torso.position.y = 1.28;
  torso.parent = root;

  const belt = MeshBuilder.CreateBox("character-belt", { width: 0.88, height: 0.16, depth: 0.5 }, scene);
  belt.material = createMaterial(scene, "#252a37", { specularPower: 14 });
  belt.position.y = 0.76;
  belt.parent = root;

  const legMaterial = createMaterial(scene, "#334155", { specularPower: 20 });
  const leftLeg = MeshBuilder.CreateBox("character-leg-left", { width: 0.28, height: 0.78, depth: 0.3 }, scene);
  leftLeg.material = legMaterial;
  leftLeg.position.set(-0.18, 0.4, 0);
  leftLeg.parent = root;

  const rightLeg = MeshBuilder.CreateBox("character-leg-right", { width: 0.28, height: 0.78, depth: 0.3 }, scene);
  rightLeg.material = legMaterial;
  rightLeg.position.set(0.18, 0.4, 0);
  rightLeg.parent = root;

  const shoeMaterial = createMaterial(scene, "#0f172a", { specularPower: 10 });
  const leftShoe = MeshBuilder.CreateBox("character-shoe-left", { width: 0.3, height: 0.16, depth: 0.36 }, scene);
  leftShoe.material = shoeMaterial;
  leftShoe.position.set(-0.18, 0.06, 0.05);
  leftShoe.parent = root;

  const rightShoe = MeshBuilder.CreateBox("character-shoe-right", { width: 0.3, height: 0.16, depth: 0.36 }, scene);
  rightShoe.material = shoeMaterial;
  rightShoe.position.set(0.18, 0.06, 0.05);
  rightShoe.parent = root;

  const armMaterial = createMaterial(scene, shirt, { specularPower: 18 });
  const leftArm = MeshBuilder.CreateBox("character-arm-left", { width: 0.2, height: 0.74, depth: 0.22 }, scene);
  leftArm.material = armMaterial;
  leftArm.position.set(-0.54, 1.3, 0);
  leftArm.parent = root;

  const rightArm = MeshBuilder.CreateBox("character-arm-right", { width: 0.2, height: 0.74, depth: 0.22 }, scene);
  rightArm.material = armMaterial;
  rightArm.position.set(0.54, 1.3, 0);
  rightArm.parent = root;

  if (armed) {
    const weapon = MeshBuilder.CreateBox("character-weapon", { width: 0.12, height: 0.12, depth: 0.5 }, scene);
    weapon.material = createMaterial(scene, "#1f2937", { specularPower: 24 });
    weapon.position.set(0.72, 1.08, 0.16);
    weapon.rotation.x = Math.PI * 0.48;
    weapon.parent = root;
  }

  const head = MeshBuilder.CreateSphere("character-head", { diameter: 0.68, segments: 14 }, scene);
  head.material = createMaterial(scene, tone, { specularPower: 22 });
  head.position.set(0, 2.04, 0.02);
  head.parent = root;

  const hair = MeshBuilder.CreateBox("character-hair", { width: 0.58, height: 0.2, depth: 0.52 }, scene);
  hair.material = createMaterial(scene, "#2b1f1a", { specularPower: 12 });
  hair.position.set(0, 2.3, 0.02);
  hair.parent = root;

  return root;
}

function createVehicleMesh(scene, color, police = false) {
  const root = new TransformNode("vehicle", scene);

  addBlobShadow(root, scene, 3.8, 0.34);

  const bodyMaterial = createMaterial(scene, police ? "#111827" : color, {
    specularColor: "#1f2937",
    specularPower: 34,
  });
  const trimMaterial = createMaterial(scene, "#202531", { specularPower: 20 });
  const glassMaterial = createMaterial(scene, "#d9e6f5", {
    emissiveColor: "#8cb7ff",
    emissiveIntensity: 0.08,
    alpha: 0.85,
    specularPower: 80,
  });

  const chassis = MeshBuilder.CreateBox("vehicle-chassis", { width: 4.2, height: 0.72, depth: 2.2 }, scene);
  chassis.material = bodyMaterial;
  chassis.position.y = 0.9;
  chassis.parent = root;

  const upperBody = MeshBuilder.CreateBox("vehicle-upper", { width: 3.3, height: 0.62, depth: 2.02 }, scene);
  upperBody.material = bodyMaterial;
  upperBody.position.y = 1.43;
  upperBody.parent = root;

  const hood = MeshBuilder.CreateBox("vehicle-hood", { width: 1.2, height: 0.2, depth: 2.04 }, scene);
  hood.material = bodyMaterial;
  hood.position.set(1.28, 1.18, 0);
  hood.parent = root;

  const trunk = MeshBuilder.CreateBox("vehicle-trunk", { width: 0.9, height: 0.22, depth: 2 }, scene);
  trunk.material = bodyMaterial;
  trunk.position.set(-1.45, 1.16, 0);
  trunk.parent = root;

  const windshield = MeshBuilder.CreateBox("vehicle-windshield", { width: 1.04, height: 0.56, depth: 1.85 }, scene);
  windshield.material = glassMaterial;
  windshield.position.set(0.36, 1.74, 0);
  windshield.parent = root;

  const rearGlass = MeshBuilder.CreateBox("vehicle-rear-glass", { width: 0.64, height: 0.5, depth: 1.75 }, scene);
  rearGlass.material = glassMaterial;
  rearGlass.position.set(-0.9, 1.68, 0);
  rearGlass.parent = root;

  const frontBumper = MeshBuilder.CreateBox("vehicle-front-bumper", { width: 0.28, height: 0.24, depth: 2.06 }, scene);
  frontBumper.material = trimMaterial;
  frontBumper.position.set(2.1, 0.62, 0);
  frontBumper.parent = root;

  const rearBumper = MeshBuilder.CreateBox("vehicle-rear-bumper", { width: 0.28, height: 0.24, depth: 2.06 }, scene);
  rearBumper.material = trimMaterial;
  rearBumper.position.set(-2.1, 0.62, 0);
  rearBumper.parent = root;

  const headlightMaterial = createMaterial(scene, "#fff4cc", {
    emissiveColor: "#ffe9a3",
    emissiveIntensity: 0.65,
    specularPower: 120,
  });
  const leftHeadlight = MeshBuilder.CreateSphere("vehicle-headlight-left", { diameter: 0.22, segments: 10 }, scene);
  leftHeadlight.material = headlightMaterial;
  leftHeadlight.position.set(2.08, 0.94, 0.65);
  leftHeadlight.parent = root;

  const rightHeadlight = MeshBuilder.CreateSphere("vehicle-headlight-right", { diameter: 0.22, segments: 10 }, scene);
  rightHeadlight.material = headlightMaterial;
  rightHeadlight.position.set(2.08, 0.94, -0.65);
  rightHeadlight.parent = root;

  const tailLightMaterial = createMaterial(scene, "#fca5a5", {
    emissiveColor: "#ef4444",
    emissiveIntensity: 0.35,
    specularPower: 40,
  });
  const leftTail = MeshBuilder.CreateSphere("vehicle-tail-left", { diameter: 0.2, segments: 10 }, scene);
  leftTail.material = tailLightMaterial;
  leftTail.position.set(-2.08, 0.92, 0.68);
  leftTail.parent = root;

  const rightTail = MeshBuilder.CreateSphere("vehicle-tail-right", { diameter: 0.2, segments: 10 }, scene);
  rightTail.material = tailLightMaterial;
  rightTail.position.set(-2.08, 0.92, -0.68);
  rightTail.parent = root;

  const wheelMaterial = createMaterial(scene, "#111827", { specularPower: 10 });
  const rimMaterial = createMaterial(scene, "#94a3b8", { specularPower: 56 });
  const wheelPositions = [
    [1.35, 0.42, 1.03],
    [1.35, 0.42, -1.03],
    [-1.3, 0.42, 1.03],
    [-1.3, 0.42, -1.03],
  ];
  const wheels = [];

  for (const [x, y, z] of wheelPositions) {
    const wheel = MeshBuilder.CreateCylinder(
      "vehicle-wheel",
      { diameterTop: 0.86, diameterBottom: 0.86, height: 0.38, tessellation: 12 },
      scene,
    );
    wheel.material = wheelMaterial;
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, y, z);
    wheel.parent = root;
    wheels.push(wheel);

    const rim = MeshBuilder.CreateCylinder(
      "vehicle-rim",
      { diameterTop: 0.38, diameterBottom: 0.38, height: 0.4, tessellation: 10 },
      scene,
    );
    rim.material = rimMaterial;
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x, y, z);
    rim.parent = root;
  }

  if (police) {
    const barBase = MeshBuilder.CreateBox("vehicle-siren-base", { width: 1.12, height: 0.18, depth: 0.46 }, scene);
    barBase.material = createMaterial(scene, "#f8fafc", { specularPower: 70 });
    barBase.position.set(0, 2.35, 0);
    barBase.parent = root;

    const blueMat = createMaterial(scene, "#93c5fd", {
      emissiveColor: WORLD_THEME.policeBlue,
      emissiveIntensity: 0.6,
      specularPower: 100,
    });
    const redMat = createMaterial(scene, "#fca5a5", {
      emissiveColor: WORLD_THEME.policeRed,
      emissiveIntensity: 0.6,
      specularPower: 100,
    });

    const leftPod = MeshBuilder.CreateBox("vehicle-siren-blue", { width: 0.42, height: 0.14, depth: 0.36 }, scene);
    leftPod.material = blueMat;
    leftPod.position.set(0.26, 2.45, 0);
    leftPod.parent = root;

    const rightPod = MeshBuilder.CreateBox("vehicle-siren-red", { width: 0.42, height: 0.14, depth: 0.36 }, scene);
    rightPod.material = redMat;
    rightPod.position.set(-0.26, 2.45, 0);
    rightPod.parent = root;

    const glowMat = createMaterial(scene, WORLD_THEME.policeBlue, {
      emissiveColor: WORLD_THEME.policeBlue,
      emissiveIntensity: 0.25,
      specularPower: 2,
      disableLighting: true,
    });
    const glow = MeshBuilder.CreateCylinder("siren-glow", { diameterTop: 3.4, diameterBottom: 2.6, height: 0.03, tessellation: 26 }, scene);
    glow.material = glowMat;
    glow.position.set(0, 0.05, 0);
    glow.rotation.x = Math.PI / 2;
    glow.parent = root;

    root.metadata = { sirenMaterials: [blueMat, redMat], wheels, sirenGlow: glow };
  } else {
    root.metadata = { wheels };
  }

  return root;
}

function createPickupMesh(scene) {
  const root = new TransformNode("pickup", scene);

  const ring = MeshBuilder.CreateCylinder(
    "pickup-ring",
    { diameterTop: 1.08, diameterBottom: 1.08, height: 0.18, tessellation: 20 },
    scene,
  );
  ring.material = createMaterial(scene, WORLD_THEME.pickupGlow, {
    emissiveColor: WORLD_THEME.pickupGlow,
    emissiveIntensity: 0.42,
    specularPower: 80,
  });
  ring.rotation.z = Math.PI / 2;
  ring.parent = root;

  const coreMaterial = createMaterial(scene, "#fde68a", {
    emissiveColor: WORLD_THEME.pickupGlow,
    emissiveIntensity: 0.55,
    specularPower: 120,
  });
  const core = MeshBuilder.CreateSphere("pickup-core", { diameter: 0.38, segments: 12 }, scene);
  core.material = coreMaterial;
  core.parent = root;

  root.metadata = { coreMaterial, ringMaterial: ring.material };
  return root;
}

function createProjectileMesh(scene, projectile) {
  const root = new TransformNode("projectile", scene);
  const tint = projectile.color || (projectile.owner === "player" ? "#fde047" : "#fb7185");
  const core = MeshBuilder.CreateSphere("projectile-core", { diameter: 0.18, segments: 8 }, scene);
  core.material = createMaterial(scene, tint, {
    emissiveColor: tint,
    emissiveIntensity: projectile.owner === "player" ? 0.8 : 0.7,
    specularPower: 120,
  });
  core.parent = root;
  return root;
}

function createRoadMarkings(scene, center, worldSize, vertical) {
  const markMaterial = createMaterial(scene, WORLD_THEME.laneColor, {
    emissiveColor: WORLD_THEME.laneColor,
    emissiveIntensity: 0.08,
    specularPower: 8,
  });

  for (let offset = -worldSize / 2 + 28; offset < worldSize / 2 - 28; offset += 52) {
    const mark = MeshBuilder.CreateBox(
      vertical ? "lane-mark-v" : "lane-mark-h",
      vertical ? { width: 1.1, height: 0.06, depth: 18 } : { width: 18, height: 0.06, depth: 1.1 },
      scene,
    );
    mark.material = markMaterial;
    if (vertical) {
      mark.position.set(center, 0.14, offset);
    } else {
      mark.position.set(offset, 0.14, center);
    }
  }
}

function addBuildingWindows(scene, building) {
  const warm = createMaterial(scene, "#fef3c7", {
    emissiveColor: "#f59e0b",
    emissiveIntensity: 0.38,
    specularPower: 2,
  });
  const cool = createMaterial(scene, "#bfdbfe", {
    emissiveColor: "#60a5fa",
    emissiveIntensity: 0.24,
    specularPower: 2,
  });
  const off = createMaterial(scene, "#1f2937", { specularPower: 8 });

  const floors = Math.max(2, Math.min(5, Math.floor((building.h - 16) / 14)));
  const colsX = Math.max(2, Math.min(4, Math.floor(building.w / 14)));
  const colsZ = Math.max(2, Math.min(4, Math.floor(building.d / 14)));

  const windowH = 2.6;
  const windowW = 2.2;

  const pickWindowMaterial = (fx, fz, floor) => {
    const n = hash2(fx + floor * 1.73, fz + floor * 0.91);
    if (n < 0.22) return off;
    return n < 0.62 ? warm : cool;
  };

  for (let floor = 0; floor < floors; floor += 1) {
    const y = 5 + floor * 11;
    if (y > building.h - 7) break;

    for (let index = 0; index < colsZ; index += 1) {
      const z = building.z - building.d / 2 + ((index + 0.5) * building.d) / colsZ;

      const left = MeshBuilder.CreateBox("window-left", { width: 0.12, height: windowH, depth: windowW }, scene);
      left.material = pickWindowMaterial(building.x - building.w / 2, z, floor);
      left.position.set(building.x - building.w / 2 - 0.08, y, z);

      const right = MeshBuilder.CreateBox("window-right", { width: 0.12, height: windowH, depth: windowW }, scene);
      right.material = pickWindowMaterial(building.x + building.w / 2, z, floor);
      right.position.set(building.x + building.w / 2 + 0.08, y, z);
    }

    for (let index = 0; index < colsX; index += 1) {
      const x = building.x - building.w / 2 + ((index + 0.5) * building.w) / colsX;

      const front = MeshBuilder.CreateBox("window-front", { width: windowW, height: windowH, depth: 0.12 }, scene);
      front.material = pickWindowMaterial(x, building.z + building.d / 2, floor);
      front.position.set(x, y, building.z + building.d / 2 + 0.08);

      const back = MeshBuilder.CreateBox("window-back", { width: windowW, height: windowH, depth: 0.12 }, scene);
      back.material = pickWindowMaterial(x, building.z - building.d / 2, floor);
      back.position.set(x, y, building.z - building.d / 2 - 0.08);
    }
  }
}

function buildStaticWorld(scene, world, quality) {
  setupAtmosphere(scene, world, quality);

  const grassMaterial = createMaterial(scene, WORLD_THEME.grassColor, {
    specularColor: WORLD_THEME.groundShadowColor,
    specularPower: 12,
  });
  const ground = MeshBuilder.CreateBox("ground", { width: world.size, height: 2, depth: world.size }, scene);
  ground.material = grassMaterial;
  ground.position.y = -1;

  const ringMaterial = createMaterial(scene, WORLD_THEME.ringWallColor, { specularPower: 8 });
  const wallThickness = 10;
  const wallHeight = 8;
  const half = world.size / 2;
  const north = MeshBuilder.CreateBox("ring-n", { width: world.size, height: wallHeight, depth: wallThickness }, scene);
  north.material = ringMaterial;
  north.position.set(0, wallHeight / 2 - 1, -half);
  const south = MeshBuilder.CreateBox("ring-s", { width: world.size, height: wallHeight, depth: wallThickness }, scene);
  south.material = ringMaterial;
  south.position.set(0, wallHeight / 2 - 1, half);
  const east = MeshBuilder.CreateBox("ring-e", { width: wallThickness, height: wallHeight, depth: world.size }, scene);
  east.material = ringMaterial;
  east.position.set(half, wallHeight / 2 - 1, 0);
  const west = MeshBuilder.CreateBox("ring-w", { width: wallThickness, height: wallHeight, depth: world.size }, scene);
  west.material = ringMaterial;
  west.position.set(-half, wallHeight / 2 - 1, 0);

  const roadMaterial = createMaterial(scene, WORLD_THEME.roadColor, {
    specularColor: WORLD_THEME.roadEdgeColor,
    specularPower: 18,
  });
  const sidewalkMaterial = createMaterial(scene, WORLD_THEME.sidewalkColor, {
    specularColor: WORLD_THEME.curbColor,
    specularPower: 20,
  });
  const curbMaterial = createMaterial(scene, WORLD_THEME.curbColor, { specularPower: 10 });

  for (const center of world.roadCenters) {
    const vertical = MeshBuilder.CreateBox(
      "road-vertical",
      { width: world.roadWidth, height: 0.2, depth: world.size },
      scene,
    );
    vertical.material = roadMaterial;
    vertical.position.set(center, 0.01, 0);

    const horizontal = MeshBuilder.CreateBox(
      "road-horizontal",
      { width: world.size, height: 0.2, depth: world.roadWidth },
      scene,
    );
    horizontal.material = roadMaterial;
    horizontal.position.set(0, 0.02, center);

    createRoadMarkings(scene, center, world.size, true);
    createRoadMarkings(scene, center, world.size, false);

    const leftWalk = MeshBuilder.CreateBox(
      "sidewalk-left",
      { width: world.sidewalkWidth, height: 0.24, depth: world.size },
      scene,
    );
    leftWalk.material = sidewalkMaterial;
    leftWalk.position.set(center - world.roadWidth / 2 - world.sidewalkWidth / 2, 0.04, 0);

    const rightWalk = MeshBuilder.CreateBox(
      "sidewalk-right",
      { width: world.sidewalkWidth, height: 0.24, depth: world.size },
      scene,
    );
    rightWalk.material = sidewalkMaterial;
    rightWalk.position.set(center + world.roadWidth / 2 + world.sidewalkWidth / 2, 0.04, 0);

    const topWalk = MeshBuilder.CreateBox(
      "sidewalk-top",
      { width: world.size, height: 0.24, depth: world.sidewalkWidth },
      scene,
    );
    topWalk.material = sidewalkMaterial;
    topWalk.position.set(0, 0.04, center - world.roadWidth / 2 - world.sidewalkWidth / 2);

    const bottomWalk = MeshBuilder.CreateBox(
      "sidewalk-bottom",
      { width: world.size, height: 0.24, depth: world.sidewalkWidth },
      scene,
    );
    bottomWalk.material = sidewalkMaterial;
    bottomWalk.position.set(0, 0.04, center + world.roadWidth / 2 + world.sidewalkWidth / 2);

    const leftCurb = MeshBuilder.CreateBox("curb-left", { width: 0.5, height: 0.22, depth: world.size }, scene);
    leftCurb.material = curbMaterial;
    leftCurb.position.set(center - world.roadWidth / 2, 0.13, 0);

    const rightCurb = MeshBuilder.CreateBox("curb-right", { width: 0.5, height: 0.22, depth: world.size }, scene);
    rightCurb.material = curbMaterial;
    rightCurb.position.set(center + world.roadWidth / 2, 0.13, 0);

    const topCurb = MeshBuilder.CreateBox("curb-top", { width: world.size, height: 0.22, depth: 0.5 }, scene);
    topCurb.material = curbMaterial;
    topCurb.position.set(0, 0.13, center - world.roadWidth / 2);

    const bottomCurb = MeshBuilder.CreateBox("curb-bottom", { width: world.size, height: 0.22, depth: 0.5 }, scene);
    bottomCurb.material = curbMaterial;
    bottomCurb.position.set(0, 0.13, center + world.roadWidth / 2);
  }

  for (const building of world.buildings) {
    const shell = MeshBuilder.CreateBox(
      "building-shell",
      { width: building.w, height: building.h, depth: building.d },
      scene,
    );
    shell.material = createMaterial(scene, building.color, {
      specularColor: "#1f2937",
      specularPower: 16,
    });
    shell.position.set(building.x, building.h / 2, building.z);

    const roof = MeshBuilder.CreateBox(
      "building-roof",
      { width: building.w * 0.92, height: 1.2, depth: building.d * 0.92 },
      scene,
    );
    roof.material = createMaterial(scene, building.roofColor ?? WORLD_THEME.roofPalette[0], { specularPower: 10 });
    roof.position.set(building.x, building.h + 0.6, building.z);

    if (hash2(building.x, building.z) > 0.66) {
      const tower = MeshBuilder.CreateBox(
        "building-tower",
        { width: building.w * 0.26, height: 6 + hash2(building.z, building.x) * 8, depth: building.d * 0.26 },
        scene,
      );
      tower.material = createMaterial(scene, "#4b5563", { specularPower: 18 });
      tower.position.set(building.x, building.h + 4.6, building.z);
    }

    addBuildingWindows(scene, building);
  }

  for (const tree of world.trees) {
    const trunk = MeshBuilder.CreateCylinder(
      "tree-trunk",
      { diameterTop: 0.42, diameterBottom: 0.62, height: 2.8, tessellation: 8 },
      scene,
    );
    trunk.material = createMaterial(scene, WORLD_THEME.treeTrunk, { specularPower: 10 });
    trunk.position.set(tree.x, 1.4, tree.z);

    const lower = MeshBuilder.CreateSphere(
      "tree-crown-lower",
      { diameter: 2.8 * tree.scale, segments: 10 },
      scene,
    );
    lower.material = createMaterial(scene, WORLD_THEME.treeLeafDark, { specularPower: 8 });
    lower.position.set(tree.x, 3, tree.z);

    const upper = MeshBuilder.CreateSphere(
      "tree-crown-upper",
      { diameter: 2.15 * tree.scale, segments: 9 },
      scene,
    );
    upper.material = createMaterial(scene, WORLD_THEME.treeLeafLight, { specularPower: 8 });
    upper.position.set(tree.x, 4.2, tree.z + 0.1);
  }

  for (const lamp of world.lamps) {
    const pole = MeshBuilder.CreateCylinder(
      "lamp-pole",
      { diameterTop: 0.12, diameterBottom: 0.18, height: 5.6, tessellation: 6 },
      scene,
    );
    pole.material = createMaterial(scene, WORLD_THEME.lampMetal, { specularPower: 16 });
    pole.position.set(lamp.x, 2.8, lamp.z);

    const arm = MeshBuilder.CreateBox("lamp-arm", { width: 0.14, height: 0.14, depth: 1.1 }, scene);
    arm.material = createMaterial(scene, WORLD_THEME.lampMetal, { specularPower: 16 });
    arm.position.set(lamp.x, 5.25, lamp.z + 0.42);

    const bulbMaterial = createMaterial(scene, "#fff7d6", {
      emissiveColor: WORLD_THEME.lampGlow,
      emissiveIntensity: 0.95,
      specularPower: 120,
    });
    const bulb = MeshBuilder.CreateSphere("lamp-bulb", { diameter: 0.3, segments: 10 }, scene);
    bulb.material = bulbMaterial;
    bulb.position.set(lamp.x, 5.18, lamp.z + 0.95);

    const pool = MeshBuilder.CreateCylinder(
      "lamp-pool",
      { diameterTop: 3.8, diameterBottom: 3.2, height: 0.04, tessellation: 22 },
      scene,
    );
    pool.material = createMaterial(scene, WORLD_THEME.lampPool, {
      emissiveColor: WORLD_THEME.lampGlow,
      emissiveIntensity: 0.38,
      alpha: 0.18,
      specularPower: 1,
    });
    pool.position.set(lamp.x, 0.04, lamp.z + 0.9);
  }

  (world.hydrants ?? []).forEach((hydrant) => createHydrant(scene, hydrant));
  (world.bollards ?? []).forEach((bollard) => createBollard(scene, bollard));
  (world.signs ?? []).forEach((sign) => createSign(scene, sign));
}

function syncEntityMap(collection, map, factory) {
  const ids = new Set(collection.map((item) => item.id));

  for (const item of collection) {
    if (map.has(item.id)) continue;
    map.set(item.id, factory(item));
  }

  for (const [id, node] of map.entries()) {
    if (ids.has(id)) continue;
    disposeNode(node);
    map.delete(id);
  }
}

function createRendererFacade(root, quality = DEFAULT_QUALITY) {
  const canvas = document.createElement("canvas");
  canvas.className = "game-canvas";
  canvas.tabIndex = 0;
  root.append(canvas);

  const engine = new Engine(canvas, true, undefined, true);
  const maxPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const scaling = Math.max(0.5, Math.min(2, quality.hardwareScale ?? DEFAULT_QUALITY.hardwareScale));
  engine.setHardwareScalingLevel(1 / (maxPixelRatio * scaling));

  return {
    engine,
    renderer: {
      domElement: canvas,
      setSize(width, height) {
        engine.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
      },
    },
  };
}

function createCameraProxy(aspect) {
  return {
    position: { x: 0, y: 20, z: 26 },
    target: { x: 0, y: 0, z: 0 },
    aspect,
    lookAt(x, y, z) {
      this.target.x = x;
      this.target.y = y;
      this.target.z = z;
    },
    updateProjectionMatrix() {},
  };
}

export function createSceneView(root, world, state, quality = DEFAULT_QUALITY) {
  const resolvedQuality = { ...DEFAULT_QUALITY, ...quality };
  const { engine, renderer } = createRendererFacade(root, resolvedQuality);
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;

  const camera = createCameraProxy(16 / 9);
  const nativeCamera = new FreeCamera("main-camera", new Vector3(0, 20, 26), scene);
  scene.activeCamera = nativeCamera;
  nativeCamera.fov = (56 * Math.PI) / 180;
  nativeCamera.minZ = 0.1;
  nativeCamera.maxZ = 4000;

  const hemi = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
  hemi.diffuse = Color3.FromHexString("#d7f0ff");
  hemi.groundColor = Color3.FromHexString("#3f5d3d");
  hemi.intensity = 1.18;

  const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, -0.35), scene);
  sun.position = new Vector3(170, 220, 110);
  sun.diffuse = Color3.FromHexString("#ffe8bf");
  sun.intensity = 1.24;

  const rim = new DirectionalLight("rim", new Vector3(0.35, -0.7, 0.45), scene);
  rim.position = new Vector3(-120, 140, -160);
  rim.diffuse = Color3.FromHexString("#c6e6ff");
  rim.intensity = 0.38;

  buildStaticWorld(scene, world, resolvedQuality);
  const glow = resolvedQuality.enableShadows ? new GlowLayer("scene-glow", scene) : null;
  if (glow) {
    glow.intensity = resolvedQuality.glowIntensity;
  }

  const dynamic = {
    player: createCharacterMesh(scene, "#f8e5c1", "#9f7aea", true),
    vehicles: new Map(),
    pedestrians: new Map(),
    pickups: new Map(),
    projectiles: new Map(),
  };

  for (const vehicle of state.vehicles) {
    dynamic.vehicles.set(vehicle.id, createVehicleMesh(scene, vehicle.color, vehicle.kind === "police"));
  }
  for (const ped of state.pedestrians) {
    dynamic.pedestrians.set(ped.id, createCharacterMesh(scene, ped.tone, ped.shirt, ped.hostile));
  }
  for (const pickup of state.pickups) {
    dynamic.pickups.set(pickup.id, createPickupMesh(scene));
  }
  for (const projectile of state.projectiles ?? []) {
    dynamic.projectiles.set(projectile.id, createProjectileMesh(scene, projectile));
  }

  const skidMaterial = createMaterial(scene, "#dcd2b3", {
    emissiveColor: "#f7e7c1",
    emissiveIntensity: 0.45,
    disableLighting: true,
    alpha: 0.42,
  });
  const skidDust = MeshBuilder.CreateCylinder("skid-dust", { diameterTop: 1.4, diameterBottom: 0.5, height: 0.02, tessellation: 18 }, scene);
  skidDust.material = skidMaterial;
  skidDust.position.y = 0.02;
  skidDust.rotation.x = Math.PI / 2;
  skidDust.isVisible = false;
  skidDust.renderingGroupId = 2;
  skidDust.isPickable = false;

  dynamic.skidDust = skidDust;

  return { scene, camera, nativeCamera, renderer, dynamic, glowLayer: glow };
}

export function renderFrame(view, state, dt) {
  const { scene, camera, nativeCamera, dynamic } = view;
  const playerVehicle =
    state.player.vehicleId != null
      ? state.vehicles.find((vehicle) => vehicle.id === state.player.vehicleId)
      : null;

  syncEntityMap(state.vehicles, dynamic.vehicles, (vehicle) =>
    createVehicleMesh(scene, vehicle.color, vehicle.kind === "police"),
  );
  syncEntityMap(state.pedestrians, dynamic.pedestrians, (ped) =>
    createCharacterMesh(scene, ped.tone, ped.shirt, ped.hostile),
  );
  syncEntityMap(state.pickups, dynamic.pickups, () => createPickupMesh(scene));
  syncEntityMap(state.projectiles ?? [], dynamic.projectiles, (projectile) =>
    createProjectileMesh(scene, projectile),
  );

  dynamic.player.setEnabled(state.player.mode === "onfoot" && !state.gameOver);
  dynamic.player.position.copyFromFloats(state.player.x, 0, state.player.z);
  dynamic.player.rotation.y = -state.player.heading + CHARACTER_HEADING_OFFSET;

  for (const vehicle of state.vehicles) {
    const mesh = dynamic.vehicles.get(vehicle.id);
    if (!mesh) continue;

    mesh.position.copyFromFloats(vehicle.x, 0, vehicle.z);
    mesh.rotation.y = -vehicle.heading;

    const wheelSpin = vehicle.speed * dt * 0.55;
    for (const wheel of mesh.metadata?.wheels ?? []) {
      wheel.rotation.z += wheelSpin;
    }

    if (vehicle.kind === "police" && mesh.metadata?.sirenMaterials) {
      const [blueMat, redMat] = mesh.metadata.sirenMaterials;
      const phase = Math.sin(vehicle.sirenPhase);
      blueMat.emissiveColor = Color3.FromHexString("#3b82f6").scale(phase > 0 ? 1.8 : 0.3);
      redMat.emissiveColor = Color3.FromHexString("#ef4444").scale(phase <= 0 ? 1.8 : 0.3);
      const glow = mesh.metadata?.sirenGlow;
      if (glow?.material) {
        const pulse = Math.max(0.4, 0.6 + Math.abs(Math.sin(vehicle.sirenPhase)) * 0.8);
        glow.scaling.x = 0.8 + pulse;
        glow.scaling.z = 0.8 + pulse;
        const mix = Math.sin(vehicle.sirenPhase * 0.9);
        const color = Color3.FromHexString(mix > 0 ? WORLD_THEME.policeBlue : WORLD_THEME.policeRed).scale(0.5 + Math.abs(mix) * 0.5);
        glow.material.emissiveColor = color;
      }
    }
  }

  for (const ped of state.pedestrians) {
    const mesh = dynamic.pedestrians.get(ped.id);
    if (!mesh) continue;
    mesh.setEnabled(ped.alive);
    mesh.position.copyFromFloats(ped.x, 0, ped.z);
    mesh.rotation.y = -ped.heading + CHARACTER_HEADING_OFFSET;
  }

  for (const pickup of state.pickups) {
    const mesh = dynamic.pickups.get(pickup.id);
    if (!mesh) continue;

    const bobY = pickup.y + Math.sin(pickup.bob) * 0.45;
    mesh.position.copyFromFloats(pickup.x, bobY, pickup.z);
    mesh.rotation.y += dt * 1.35;
    const highlight = pickup.bonusTag ? 1.24 : 1;
    mesh.scaling.set(highlight, highlight, highlight);
    if (mesh.metadata?.ringMaterial) {
      mesh.metadata.ringMaterial.emissiveColor = Color3.FromHexString(WORLD_THEME.pickupGlow).scale(
        pickup.bonusTag ? 1.9 : 0.95,
      );
    }

    if (mesh.metadata?.coreMaterial) {
      const glow = 0.4 + (Math.sin(pickup.bob * 1.3) + 1) * 0.32;
      mesh.metadata.coreMaterial.emissiveColor = Color3.FromHexString(WORLD_THEME.pickupGlow).scale(glow);
      if (pickup.bonusTag) {
        mesh.metadata.coreMaterial.emissiveColor = Color3.FromHexString(WORLD_THEME.pickupGlow).scale(
          glow * 1.45,
        );
      }
    }
  }

  if (dynamic.skidDust) {
    const skid = dynamic.skidDust;
    const brake = Math.abs(playerVehicle?.brakeInput ?? 0);
    const slip = Math.max(0, playerVehicle?.slip ?? 0);
    const shouldShow = playerVehicle && (brake > 0.22 || slip > 0.25);
    if (shouldShow) {
      skid.position.x = playerVehicle.x;
      skid.position.z = playerVehicle.z;
      skid.rotation.y = -playerVehicle.heading;
      skid.scaling.x = 1 + slip * 1.8;
      skid.scaling.z = 1 + brake * 1.4;
      skid.isVisible = true;
    } else {
      skid.isVisible = false;
    }
  }

  for (const projectile of state.projectiles ?? []) {
    const mesh = dynamic.projectiles.get(projectile.id);
    if (!mesh) continue;
    mesh.position.copyFromFloats(projectile.x, projectile.y, projectile.z);
  }

  nativeCamera.position.copyFromFloats(camera.position.x, camera.position.y, camera.position.z);
  TEMP_TARGET.copyFromFloats(camera.target.x, camera.target.y, camera.target.z);
  nativeCamera.setTarget(TEMP_TARGET);

  scene.render();
}
