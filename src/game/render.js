import { Engine } from "@babylonjs/core/Engines/engine";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Scene } from "@babylonjs/core/scene";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { SSAORenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssaoRenderingPipeline";
import { FxaaPostProcess } from "@babylonjs/core/PostProcesses/fxaaPostProcess";
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
  glowIntensity: 0.24,
  bloomThreshold: 0.88,
  bloomWeight: 0.18,
  fxaa: true,
  bloom: true,
  ssao: false,
  shadows: true,
  shadowMapSize: 1024,
  shadowDarkness: 0.22,
  materialMode: "standard",
  textureDetail: 1,
  buildingDetail: 1,
  vehicleDetail: 1,
  postExposure: 1.05,
  postContrast: 1.08,
};

function hash2(x, z) {
  const seed = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453123;
  return seed - Math.floor(seed);
}

function createTexture(scene, path, scale = 1) {
  scene.metadata ??= {};
  scene.metadata.textureCache ??= new Map();
  const key = `${path}:${scale.toFixed(3)}`;
  if (scene.metadata.textureCache.has(key)) {
    return scene.metadata.textureCache.get(key);
  }

  const texture = new Texture(path, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.uScale = scale;
  texture.vScale = scale;
  scene.metadata.textureCache.set(key, texture);
  return texture;
}

function applySharedMaterialProps(material, options) {
  material.backFaceCulling = false;

  if (typeof options.alpha === "number") {
    material.alpha = options.alpha;
  }
}

function createStandard(scene, color, quality, options = {}) {
  const material = new StandardMaterial(`mat-${Math.random().toString(36).slice(2, 9)}`, scene);
  material.diffuseColor = Color3.FromHexString(color);
  material.specularColor = options.specularColor
    ? Color3.FromHexString(options.specularColor)
    : new Color3(0.12, 0.12, 0.12);
  material.specularPower = options.specularPower ?? 32;

  if (options.texture) {
    material.diffuseTexture = createTexture(
      scene,
      options.texture,
      (options.textureScale ?? 1) * (quality.textureDetail ?? 1),
    );
  }

  if (options.bumpTexture) {
    material.bumpTexture = createTexture(
      scene,
      options.bumpTexture,
      (options.textureScale ?? 1) * (quality.textureDetail ?? 1),
    );
    material.bumpTexture.level = options.bumpLevel ?? 0.25;
  }

  if (options.emissiveColor) {
    const emissive = Color3.FromHexString(options.emissiveColor);
    material.emissiveColor =
      typeof options.emissiveIntensity === "number"
        ? emissive.scale(options.emissiveIntensity)
        : emissive;
  }

  if (typeof options.disableLighting === "boolean") {
    material.disableLighting = options.disableLighting;
  }

  applySharedMaterialProps(material, options);
  return material;
}

function createPbr(scene, color, quality, options = {}) {
  const material = new PBRMaterial(`mat-${Math.random().toString(36).slice(2, 9)}`, scene);
  material.albedoColor = Color3.FromHexString(color);
  material.metallic = options.metallic ?? 0;
  material.roughness = options.roughness ?? 0.78;
  material.environmentIntensity = options.environmentIntensity ?? 0.75;

  if (options.texture) {
    material.albedoTexture = createTexture(
      scene,
      options.texture,
      (options.textureScale ?? 1) * (quality.textureDetail ?? 1),
    );
  }

  if (options.bumpTexture) {
    material.bumpTexture = createTexture(
      scene,
      options.bumpTexture,
      (options.textureScale ?? 1) * (quality.textureDetail ?? 1),
    );
    material.bumpTexture.level = options.bumpLevel ?? 0.18;
  }

  if (options.emissiveColor) {
    const emissive = Color3.FromHexString(options.emissiveColor);
    material.emissiveColor =
      typeof options.emissiveIntensity === "number"
        ? emissive.scale(options.emissiveIntensity)
        : emissive;
  }

  applySharedMaterialProps(material, options);
  return material;
}

function createMaterial(scene, color, quality, options = {}) {
  if (options.disableLighting || quality.materialMode !== "pbr") {
    return createStandard(scene, color, quality, options);
  }
  return createPbr(scene, color, quality, options);
}

function createShadowMaterial(scene, quality, alpha = 0.3) {
  return createStandard(scene, "#11151b", quality, {
    emissiveColor: "#000000",
    emissiveIntensity: 0.05,
    alpha,
    specularPower: 1,
    disableLighting: true,
  });
}

function listNodeMeshes(node) {
  const meshes = [];
  if (node && typeof node.getClassName === "function" && node.getClassName().includes("Mesh")) {
    meshes.push(node);
  }
  if (node && typeof node.getChildMeshes === "function") {
    meshes.push(...node.getChildMeshes(false));
  }
  return [...new Set(meshes)];
}

function applyShadowSetup(node, shadowGenerator, receiveShadows = false) {
  for (const mesh of listNodeMeshes(node)) {
    mesh.receiveShadows = receiveShadows;
    mesh.isPickable = false;
    shadowGenerator?.addShadowCaster(mesh);
  }
}

function disposeNode(node) {
  const materials = new Set();
  for (const mesh of listNodeMeshes(node)) {
    if (mesh.material) {
      materials.add(mesh.material);
    }
  }
  node.dispose(false);
  for (const material of materials) {
    material.dispose(false, false);
  }
}

function setupAtmosphere(scene, world, quality) {
  const clearColor = Color4.FromHexString(WORLD_THEME.skyTop);
  scene.clearColor = new Color4(clearColor.r, clearColor.g, clearColor.b, 1);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = Color3.FromHexString(WORLD_THEME.fogColor);
  scene.fogStart = WORLD_THEME.fogStart;
  scene.fogEnd = world.size * (WORLD_THEME.fogEndFactor ?? 0.8);
  scene.environmentIntensity = quality.materialMode === "pbr" ? 1.05 : 0.82;
  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.exposure = quality.postExposure ?? 1.05;
  scene.imageProcessingConfiguration.contrast = quality.postContrast ?? 1.08;
}

function addBlobShadow(root, scene, quality, diameter, alpha = 0.28) {
  const shadow = MeshBuilder.CreateCylinder(
    "blob-shadow",
    { diameterTop: diameter, diameterBottom: diameter * 0.88, height: 0.04, tessellation: 24 },
    scene,
  );
  shadow.material = createShadowMaterial(scene, quality, alpha);
  shadow.position.y = 0.03;
  shadow.parent = root;
  shadow.isPickable = false;
  return shadow;
}

function createRoundedLimb(scene, root, name, position, dimensions, material) {
  const jointA = MeshBuilder.CreateSphere(`${name}-joint-a`, { diameter: dimensions.radius * 2, segments: 10 }, scene);
  jointA.material = material;
  jointA.position.set(position.x, position.y + dimensions.height / 2, position.z);
  jointA.parent = root;

  const limb = MeshBuilder.CreateCylinder(
    `${name}-shaft`,
    { diameterTop: dimensions.radius * 1.8, diameterBottom: dimensions.radius * 2, height: dimensions.height, tessellation: 10 },
    scene,
  );
  limb.material = material;
  limb.position.copyFromFloats(position.x, position.y, position.z);
  limb.parent = root;

  const jointB = MeshBuilder.CreateSphere(`${name}-joint-b`, { diameter: dimensions.radius * 2, segments: 10 }, scene);
  jointB.material = material;
  jointB.position.set(position.x, position.y - dimensions.height / 2, position.z);
  jointB.parent = root;
}

function createCharacterMesh(scene, quality, tone, shirt, armed = false) {
  const root = new TransformNode("character", scene);

  addBlobShadow(root, scene, quality, 1.15, 0.26);

  const jacketMaterial = createMaterial(scene, shirt, quality, {
    texture: WORLD_THEME.textures.detailMask,
    textureScale: 2.2,
    bumpTexture: WORLD_THEME.textures.detailMask,
    bumpLevel: 0.08,
    specularPower: 18,
    roughness: 0.86,
  });
  const trouserMaterial = createMaterial(scene, "#364152", quality, {
    texture: WORLD_THEME.textures.detailMask,
    textureScale: 2.8,
    bumpTexture: WORLD_THEME.textures.detailMask,
    bumpLevel: 0.06,
    specularPower: 12,
    roughness: 0.92,
  });
  const shoeMaterial = createMaterial(scene, "#1a1f27", quality, {
    specularPower: 10,
    roughness: 0.95,
  });
  const skinMaterial = createMaterial(scene, tone, quality, {
    specularPower: 18,
    roughness: 0.72,
  });

  const torso = MeshBuilder.CreateCylinder(
    "character-torso",
    { diameterTop: 0.78, diameterBottom: 0.96, height: 1.02, tessellation: 12 },
    scene,
  );
  torso.material = jacketMaterial;
  torso.position.y = 1.26;
  torso.parent = root;

  const shoulders = MeshBuilder.CreateSphere("character-shoulders", { diameterX: 0.96, diameterY: 0.46, diameterZ: 0.52, segments: 12 }, scene);
  shoulders.material = jacketMaterial;
  shoulders.position.set(0, 1.72, 0.02);
  shoulders.parent = root;

  const belt = MeshBuilder.CreateCylinder(
    "character-belt",
    { diameterTop: 0.88, diameterBottom: 0.94, height: 0.14, tessellation: 12 },
    scene,
  );
  belt.material = createMaterial(scene, "#252a37", quality, { specularPower: 10, roughness: 0.9 });
  belt.position.y = 0.77;
  belt.parent = root;

  createRoundedLimb(scene, root, "left-leg", { x: -0.2, y: 0.45, z: 0 }, { radius: 0.12, height: 0.74 }, trouserMaterial);
  createRoundedLimb(scene, root, "right-leg", { x: 0.2, y: 0.45, z: 0 }, { radius: 0.12, height: 0.74 }, trouserMaterial);
  createRoundedLimb(scene, root, "left-arm", { x: -0.54, y: 1.3, z: 0 }, { radius: 0.09, height: 0.68 }, jacketMaterial);
  createRoundedLimb(scene, root, "right-arm", { x: 0.54, y: 1.3, z: 0 }, { radius: 0.09, height: 0.68 }, jacketMaterial);

  const leftShoe = MeshBuilder.CreateBox("character-shoe-left", { width: 0.28, height: 0.16, depth: 0.44 }, scene);
  leftShoe.material = shoeMaterial;
  leftShoe.position.set(-0.2, 0.08, 0.08);
  leftShoe.parent = root;

  const rightShoe = MeshBuilder.CreateBox("character-shoe-right", { width: 0.28, height: 0.16, depth: 0.44 }, scene);
  rightShoe.material = shoeMaterial;
  rightShoe.position.set(0.2, 0.08, 0.08);
  rightShoe.parent = root;

  const head = MeshBuilder.CreateSphere("character-head", { diameter: 0.64, segments: 14 }, scene);
  head.material = skinMaterial;
  head.position.set(0, 2.1, 0.02);
  head.parent = root;

  const hair = MeshBuilder.CreateSphere("character-hair", { diameterX: 0.62, diameterY: 0.28, diameterZ: 0.56, segments: 12 }, scene);
  hair.material = createMaterial(scene, "#2c241e", quality, { specularPower: 8, roughness: 0.96 });
  hair.position.set(0, 2.32, 0.01);
  hair.parent = root;

  const collar = MeshBuilder.CreateBox("character-collar", { width: 0.22, height: 0.14, depth: 0.12 }, scene);
  collar.material = createMaterial(scene, "#f6eddc", quality, { specularPower: 12, roughness: 0.84 });
  collar.position.set(0, 1.72, 0.22);
  collar.parent = root;

  if (armed) {
    const weapon = MeshBuilder.CreateBox("character-weapon", { width: 0.12, height: 0.14, depth: 0.62 }, scene);
    weapon.material = createMaterial(scene, "#1c232d", quality, { metallic: 0.15, roughness: 0.45, specularPower: 42 });
    weapon.position.set(0.72, 1.1, 0.16);
    weapon.rotation.x = Math.PI * 0.48;
    weapon.parent = root;
  }

  return root;
}

function createVehicleMesh(scene, quality, color, police = false) {
  const root = new TransformNode("vehicle", scene);
  addBlobShadow(root, scene, quality, 4.3, 0.3);

  const paint = police ? "#131924" : color;
  const bodyMaterial = createMaterial(scene, paint, quality, {
    texture: WORLD_THEME.textures.detailMask,
    textureScale: 3.4,
    bumpTexture: WORLD_THEME.textures.detailMask,
    bumpLevel: 0.06,
    specularColor: "#2b313c",
    specularPower: 46,
    metallic: police ? 0.24 : 0.16,
    roughness: police ? 0.44 : 0.38,
  });
  const trimMaterial = createMaterial(scene, "#20242b", quality, {
    metallic: 0.2,
    roughness: 0.54,
    specularPower: 32,
  });
  const chromeMaterial = createMaterial(scene, "#a7b3c2", quality, {
    metallic: 0.65,
    roughness: 0.24,
    specularPower: 70,
  });
  const glassMaterial = createMaterial(scene, WORLD_THEME.glassColor, quality, {
    texture: WORLD_THEME.textures.glass,
    textureScale: 1.2,
    alpha: 0.88,
    emissiveColor: WORLD_THEME.glassEdge,
    emissiveIntensity: 0.06,
    metallic: 0,
    roughness: 0.18,
    specularPower: 100,
  });

  const chassis = MeshBuilder.CreateBox("vehicle-chassis", { width: 4.46, height: 0.5, depth: 2.18 }, scene);
  chassis.material = bodyMaterial;
  chassis.position.y = 0.76;
  chassis.parent = root;

  const cabin = MeshBuilder.CreateBox("vehicle-cabin", { width: 2.66, height: 0.84, depth: 1.94 }, scene);
  cabin.material = bodyMaterial;
  cabin.position.set(-0.1, 1.34, 0);
  cabin.parent = root;

  const hood = MeshBuilder.CreateBox("vehicle-hood", { width: 1.28, height: 0.18, depth: 2.02 }, scene);
  hood.material = bodyMaterial;
  hood.position.set(1.44, 1.02, 0);
  hood.rotation.z = 0.06;
  hood.parent = root;

  const nose = MeshBuilder.CreateBox("vehicle-nose", { width: 0.52, height: 0.18, depth: 1.98 }, scene);
  nose.material = bodyMaterial;
  nose.position.set(1.94, 0.92, 0);
  nose.rotation.z = 0.12;
  nose.parent = root;

  const trunk = MeshBuilder.CreateBox("vehicle-trunk", { width: 1.08, height: 0.16, depth: 1.96 }, scene);
  trunk.material = bodyMaterial;
  trunk.position.set(-1.56, 1, 0);
  trunk.rotation.z = -0.05;
  trunk.parent = root;

  const windshield = MeshBuilder.CreateBox("vehicle-windshield", { width: 0.72, height: 0.5, depth: 1.8 }, scene);
  windshield.material = glassMaterial;
  windshield.position.set(0.58, 1.62, 0);
  windshield.rotation.z = 0.28;
  windshield.parent = root;

  const sideGlass = MeshBuilder.CreateBox("vehicle-side-glass", { width: 1.28, height: 0.42, depth: 1.84 }, scene);
  sideGlass.material = glassMaterial;
  sideGlass.position.set(-0.28, 1.62, 0);
  sideGlass.parent = root;

  const rearGlass = MeshBuilder.CreateBox("vehicle-rear-glass", { width: 0.64, height: 0.42, depth: 1.72 }, scene);
  rearGlass.material = glassMaterial;
  rearGlass.position.set(-1.08, 1.53, 0);
  rearGlass.rotation.z = -0.22;
  rearGlass.parent = root;

  const roof = MeshBuilder.CreateBox("vehicle-roof", { width: 1.46, height: 0.14, depth: 1.62 }, scene);
  roof.material = bodyMaterial;
  roof.position.set(-0.22, 1.98, 0);
  roof.parent = root;

  const frontBumper = MeshBuilder.CreateBox("vehicle-front-bumper", { width: 0.28, height: 0.24, depth: 2.1 }, scene);
  frontBumper.material = trimMaterial;
  frontBumper.position.set(2.2, 0.64, 0);
  frontBumper.parent = root;

  const rearBumper = MeshBuilder.CreateBox("vehicle-rear-bumper", { width: 0.28, height: 0.24, depth: 2.04 }, scene);
  rearBumper.material = trimMaterial;
  rearBumper.position.set(-2.18, 0.62, 0);
  rearBumper.parent = root;

  const grille = MeshBuilder.CreateBox("vehicle-grille", { width: 0.1, height: 0.24, depth: 1.28 }, scene);
  grille.material = chromeMaterial;
  grille.position.set(2.07, 0.82, 0);
  grille.parent = root;

  const rockerLeft = MeshBuilder.CreateBox("vehicle-rocker-left", { width: 3.7, height: 0.16, depth: 0.12 }, scene);
  rockerLeft.material = trimMaterial;
  rockerLeft.position.set(-0.04, 0.46, 1.02);
  rockerLeft.parent = root;

  const rockerRight = MeshBuilder.CreateBox("vehicle-rocker-right", { width: 3.7, height: 0.16, depth: 0.12 }, scene);
  rockerRight.material = trimMaterial;
  rockerRight.position.set(-0.04, 0.46, -1.02);
  rockerRight.parent = root;

  const doorLineLeft = MeshBuilder.CreateBox("vehicle-door-line-left", { width: 0.04, height: 0.58, depth: 0.06 }, scene);
  doorLineLeft.material = chromeMaterial;
  doorLineLeft.position.set(-0.08, 1.12, 1.05);
  doorLineLeft.parent = root;

  const doorLineRight = MeshBuilder.CreateBox("vehicle-door-line-right", { width: 0.04, height: 0.58, depth: 0.06 }, scene);
  doorLineRight.material = chromeMaterial;
  doorLineRight.position.set(-0.08, 1.12, -1.05);
  doorLineRight.parent = root;

  const headlightMaterial = createMaterial(scene, "#fff2d2", quality, {
    emissiveColor: "#ffdf8d",
    emissiveIntensity: 0.8,
    metallic: 0.12,
    roughness: 0.28,
    specularPower: 120,
  });
  const tailLightMaterial = createMaterial(scene, "#f6adad", quality, {
    emissiveColor: "#f34b4b",
    emissiveIntensity: 0.38,
    metallic: 0.08,
    roughness: 0.42,
    specularPower: 64,
  });

  const leftHeadlight = MeshBuilder.CreateSphere("vehicle-headlight-left", { diameter: 0.22, segments: 12 }, scene);
  leftHeadlight.material = headlightMaterial;
  leftHeadlight.position.set(2.08, 0.9, 0.66);
  leftHeadlight.parent = root;

  const rightHeadlight = MeshBuilder.CreateSphere("vehicle-headlight-right", { diameter: 0.22, segments: 12 }, scene);
  rightHeadlight.material = headlightMaterial;
  rightHeadlight.position.set(2.08, 0.9, -0.66);
  rightHeadlight.parent = root;

  const leftTail = MeshBuilder.CreateSphere("vehicle-tail-left", { diameter: 0.18, segments: 12 }, scene);
  leftTail.material = tailLightMaterial;
  leftTail.position.set(-2.08, 0.9, 0.66);
  leftTail.parent = root;

  const rightTail = MeshBuilder.CreateSphere("vehicle-tail-right", { diameter: 0.18, segments: 12 }, scene);
  rightTail.material = tailLightMaterial;
  rightTail.position.set(-2.08, 0.9, -0.66);
  rightTail.parent = root;

  const wheelMaterial = createMaterial(scene, "#11151b", quality, { roughness: 0.96, specularPower: 8 });
  const rimMaterial = createMaterial(scene, "#b5c0cb", quality, { metallic: 0.55, roughness: 0.26, specularPower: 84 });
  const wheelPositions = [
    [1.38, 0.42, 1.08],
    [1.38, 0.42, -1.08],
    [-1.32, 0.42, 1.08],
    [-1.32, 0.42, -1.08],
  ];
  const wheels = [];

  for (const [x, y, z] of wheelPositions) {
    const wheel = MeshBuilder.CreateCylinder(
      "vehicle-wheel",
      { diameterTop: 0.9, diameterBottom: 0.9, height: 0.42, tessellation: 18 },
      scene,
    );
    wheel.material = wheelMaterial;
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, y, z);
    wheel.parent = root;
    wheels.push(wheel);

    const rim = MeshBuilder.CreateCylinder(
      "vehicle-rim",
      { diameterTop: 0.42, diameterBottom: 0.42, height: 0.43, tessellation: 14 },
      scene,
    );
    rim.material = rimMaterial;
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x, y, z);
    rim.parent = root;
  }

  const mirrors = [
    [0.44, 1.52, 1.08],
    [0.44, 1.52, -1.08],
  ];
  for (const [x, y, z] of mirrors) {
    const mirror = MeshBuilder.CreateBox("vehicle-mirror", { width: 0.18, height: 0.12, depth: 0.18 }, scene);
    mirror.material = trimMaterial;
    mirror.position.set(x, y, z);
    mirror.parent = root;
  }

  if (police) {
    const doorStripe = createMaterial(scene, "#f3f4f6", quality, {
      texture: WORLD_THEME.textures.detailMask,
      textureScale: 4.2,
      metallic: 0.04,
      roughness: 0.56,
    });
    const leftStripe = MeshBuilder.CreateBox("police-stripe-left", { width: 2.52, height: 0.28, depth: 0.06 }, scene);
    leftStripe.material = doorStripe;
    leftStripe.position.set(-0.08, 1.04, 1.08);
    leftStripe.parent = root;

    const rightStripe = MeshBuilder.CreateBox("police-stripe-right", { width: 2.52, height: 0.28, depth: 0.06 }, scene);
    rightStripe.material = doorStripe;
    rightStripe.position.set(-0.08, 1.04, -1.08);
    rightStripe.parent = root;

    const barBase = MeshBuilder.CreateBox("vehicle-siren-base", { width: 1.16, height: 0.16, depth: 0.48 }, scene);
    barBase.material = chromeMaterial;
    barBase.position.set(0, 2.28, 0);
    barBase.parent = root;

    const blueMat = createMaterial(scene, "#93c5fd", quality, {
      emissiveColor: WORLD_THEME.policeBlue,
      emissiveIntensity: 0.6,
      metallic: 0.1,
      roughness: 0.22,
      specularPower: 120,
    });
    const redMat = createMaterial(scene, "#fca5a5", quality, {
      emissiveColor: WORLD_THEME.policeRed,
      emissiveIntensity: 0.6,
      metallic: 0.1,
      roughness: 0.22,
      specularPower: 120,
    });
    const leftPod = MeshBuilder.CreateBox("vehicle-siren-blue", { width: 0.42, height: 0.14, depth: 0.34 }, scene);
    leftPod.material = blueMat;
    leftPod.position.set(0.24, 2.4, 0);
    leftPod.parent = root;

    const rightPod = MeshBuilder.CreateBox("vehicle-siren-red", { width: 0.42, height: 0.14, depth: 0.34 }, scene);
    rightPod.material = redMat;
    rightPod.position.set(-0.24, 2.4, 0);
    rightPod.parent = root;

    const glowMat = createMaterial(scene, WORLD_THEME.policeBlue, quality, {
      emissiveColor: WORLD_THEME.policeBlue,
      emissiveIntensity: 0.24,
      alpha: 0.56,
      disableLighting: true,
      specularPower: 2,
    });
    const glow = MeshBuilder.CreateCylinder("siren-glow", { diameterTop: 4.2, diameterBottom: 3.4, height: 0.03, tessellation: 28 }, scene);
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

function createPickupMesh(scene, quality) {
  const root = new TransformNode("pickup", scene);

  const ring = MeshBuilder.CreateCylinder(
    "pickup-ring",
    { diameterTop: 1.12, diameterBottom: 1.12, height: 0.16, tessellation: 24 },
    scene,
  );
  ring.material = createMaterial(scene, WORLD_THEME.pickupGlow, quality, {
    emissiveColor: WORLD_THEME.pickupGlow,
    emissiveIntensity: 0.48,
    metallic: 0.18,
    roughness: 0.28,
    specularPower: 90,
  });
  ring.rotation.z = Math.PI / 2;
  ring.parent = root;

  const coreMaterial = createMaterial(scene, "#fde68a", quality, {
    emissiveColor: WORLD_THEME.pickupGlow,
    emissiveIntensity: 0.62,
    metallic: 0.08,
    roughness: 0.34,
    specularPower: 120,
  });
  const core = MeshBuilder.CreateSphere("pickup-core", { diameter: 0.42, segments: 14 }, scene);
  core.material = coreMaterial;
  core.parent = root;

  root.metadata = { coreMaterial, ringMaterial: ring.material };
  return root;
}

function createProjectileMesh(scene, quality, projectile) {
  const root = new TransformNode("projectile", scene);
  const tint = projectile.color || (projectile.owner === "player" ? "#fde047" : "#fb7185");
  const core = MeshBuilder.CreateSphere("projectile-core", { diameter: 0.18, segments: 10 }, scene);
  core.material = createMaterial(scene, tint, quality, {
    emissiveColor: tint,
    emissiveIntensity: projectile.owner === "player" ? 0.88 : 0.74,
    metallic: 0.08,
    roughness: 0.18,
    specularPower: 120,
  });
  core.parent = root;
  return root;
}

function createRoadMarkings(scene, quality, center, worldSize, vertical) {
  const markMaterial = createMaterial(scene, WORLD_THEME.laneColor, quality, {
    emissiveColor: WORLD_THEME.laneColor,
    emissiveIntensity: 0.08,
    roughness: 0.76,
    specularPower: 10,
  });

  for (let offset = -worldSize / 2 + 28; offset < worldSize / 2 - 28; offset += 52) {
    const mark = MeshBuilder.CreateBox(
      vertical ? "lane-mark-v" : "lane-mark-h",
      vertical ? { width: 1.2, height: 0.05, depth: 18 } : { width: 18, height: 0.05, depth: 1.2 },
      scene,
    );
    mark.material = markMaterial;
    if (vertical) {
      mark.position.set(center, 0.13, offset);
    } else {
      mark.position.set(offset, 0.13, center);
    }
    mark.isPickable = false;
  }
}

function addBuildingWindows(scene, quality, building) {
  const warm = createMaterial(scene, "#fef1cd", quality, {
    texture: WORLD_THEME.textures.glass,
    textureScale: 0.8,
    emissiveColor: "#f3a94d",
    emissiveIntensity: 0.3,
    alpha: 0.88,
    metallic: 0,
    roughness: 0.24,
    specularPower: 40,
  });
  const cool = createMaterial(scene, "#d3e6f5", quality, {
    texture: WORLD_THEME.textures.glass,
    textureScale: 0.8,
    emissiveColor: "#80b5df",
    emissiveIntensity: 0.18,
    alpha: 0.88,
    metallic: 0,
    roughness: 0.18,
    specularPower: 46,
  });
  const off = createMaterial(scene, "#243142", quality, {
    texture: WORLD_THEME.textures.glass,
    textureScale: 0.8,
    alpha: 0.92,
    metallic: 0,
    roughness: 0.36,
    specularPower: 28,
  });
  const frameMaterial = createMaterial(scene, "#61584f", quality, {
    metallic: 0.1,
    roughness: 0.72,
    specularPower: 16,
  });

  const detail = quality.buildingDetail ?? 1;
  const floors = Math.max(3, Math.min(6, Math.floor(((building.h - 16) / 11) * detail)));
  const colsX = Math.max(2, Math.min(5, Math.floor((building.w / 11) * detail)));
  const colsZ = Math.max(2, Math.min(5, Math.floor((building.d / 11) * detail)));
  const windowH = 2.7;
  const windowW = 2.3;
  const inset = 0.24;

  const pickWindowMaterial = (fx, fz, floor) => {
    const n = hash2(fx + floor * 1.73, fz + floor * 0.91);
    if (n < 0.18) return off;
    return n < 0.58 ? warm : cool;
  };

  function addWindow(x, y, z, width, height, depth, rotationY, pickKeyX, pickKeyZ, floor) {
    const frame = MeshBuilder.CreateBox("window-frame", { width: width + 0.3, height: height + 0.28, depth: depth + 0.16 }, scene);
    frame.material = frameMaterial;
    frame.position.set(x, y, z);
    frame.rotation.y = rotationY;
    frame.isPickable = false;

    const glass = MeshBuilder.CreateBox("window-glass", { width, height, depth }, scene);
    glass.material = pickWindowMaterial(pickKeyX, pickKeyZ, floor);
    glass.position.set(x, y, z + (Math.abs(depth) < 0.2 ? 0 : 0));
    glass.rotation.y = rotationY;
    glass.isPickable = false;
  }

  for (let floor = 0; floor < floors; floor += 1) {
    const y = 4.8 + floor * 8.5;
    if (y > building.h - 6) break;

    for (let index = 0; index < colsZ; index += 1) {
      const z = building.z - building.d / 2 + ((index + 0.5) * building.d) / colsZ;
      addWindow(building.x - building.w / 2 + inset, y, z, 0.26, windowH, windowW, 0, building.x, z, floor);
      addWindow(building.x + building.w / 2 - inset, y, z, 0.26, windowH, windowW, 0, building.x + 1, z, floor);
    }

    for (let index = 0; index < colsX; index += 1) {
      const x = building.x - building.w / 2 + ((index + 0.5) * building.w) / colsX;
      addWindow(x, y, building.z + building.d / 2 - inset, windowW, windowH, 0.26, 0, x, building.z, floor);
      addWindow(x, y, building.z - building.d / 2 + inset, windowW, windowH, 0.26, 0, x, building.z + 1, floor);
    }
  }
}

function buildStaticWorld(scene, world, quality, shadowGenerator) {
  setupAtmosphere(scene, world, quality);

  const groundMaterial = createMaterial(scene, WORLD_THEME.groundTint, quality, {
    texture: WORLD_THEME.textures.detailMask,
    textureScale: 26,
    bumpTexture: WORLD_THEME.textures.detailMask,
    bumpLevel: 0.08,
    roughness: 0.92,
    specularColor: WORLD_THEME.groundShadowColor,
    specularPower: 10,
  });
  const ground = MeshBuilder.CreateBox("ground", { width: world.size, height: 2, depth: world.size }, scene);
  ground.material = groundMaterial;
  ground.position.y = -1;
  applyShadowSetup(ground, null, true);

  const ringMaterial = createMaterial(scene, WORLD_THEME.ringWallColor, quality, {
    texture: WORLD_THEME.textures.facade,
    textureScale: 6,
    bumpTexture: WORLD_THEME.textures.detailMask,
    bumpLevel: 0.08,
    roughness: 0.84,
    specularPower: 12,
  });
  const wallThickness = 10;
  const wallHeight = 10;
  const half = world.size / 2;
  const north = MeshBuilder.CreateBox("ring-n", { width: world.size, height: wallHeight, depth: wallThickness }, scene);
  north.material = ringMaterial;
  north.position.set(0, wallHeight / 2 - 1, -half);
  applyShadowSetup(north, shadowGenerator, true);

  const south = MeshBuilder.CreateBox("ring-s", { width: world.size, height: wallHeight, depth: wallThickness }, scene);
  south.material = ringMaterial;
  south.position.set(0, wallHeight / 2 - 1, half);
  applyShadowSetup(south, shadowGenerator, true);

  const east = MeshBuilder.CreateBox("ring-e", { width: wallThickness, height: wallHeight, depth: world.size }, scene);
  east.material = ringMaterial;
  east.position.set(half, wallHeight / 2 - 1, 0);
  applyShadowSetup(east, shadowGenerator, true);

  const west = MeshBuilder.CreateBox("ring-w", { width: wallThickness, height: wallHeight, depth: world.size }, scene);
  west.material = ringMaterial;
  west.position.set(-half, wallHeight / 2 - 1, 0);
  applyShadowSetup(west, shadowGenerator, true);

  const roadMaterial = createMaterial(scene, WORLD_THEME.roadColor, quality, {
    texture: WORLD_THEME.textures.asphalt,
    textureScale: 16,
    bumpTexture: WORLD_THEME.textures.detailMask,
    bumpLevel: 0.06,
    roughness: 0.9,
    specularColor: WORLD_THEME.roadEdgeColor,
    specularPower: 18,
  });
  const shoulderMaterial = createMaterial(scene, WORLD_THEME.shoulderColor, quality, {
    texture: WORLD_THEME.textures.asphalt,
    textureScale: 12,
    bumpTexture: WORLD_THEME.textures.detailMask,
    bumpLevel: 0.04,
    roughness: 0.94,
    specularPower: 8,
  });
  const sidewalkMaterial = createMaterial(scene, WORLD_THEME.sidewalkColor, quality, {
    texture: WORLD_THEME.textures.sidewalk,
    textureScale: 7,
    bumpTexture: WORLD_THEME.textures.detailMask,
    bumpLevel: 0.04,
    roughness: 0.86,
    specularColor: WORLD_THEME.curbColor,
    specularPower: 18,
  });
  const curbMaterial = createMaterial(scene, WORLD_THEME.curbColor, quality, {
    texture: WORLD_THEME.textures.sidewalk,
    textureScale: 9,
    roughness: 0.82,
    specularPower: 10,
  });

  for (const center of world.roadCenters) {
    const verticalShoulder = MeshBuilder.CreateBox(
      "road-shoulder-v",
      { width: world.roadWidth + world.sidewalkWidth * 0.45, height: 0.12, depth: world.size },
      scene,
    );
    verticalShoulder.material = shoulderMaterial;
    verticalShoulder.position.set(center, 0.03, 0);
    applyShadowSetup(verticalShoulder, null, true);

    const horizontalShoulder = MeshBuilder.CreateBox(
      "road-shoulder-h",
      { width: world.size, height: 0.12, depth: world.roadWidth + world.sidewalkWidth * 0.45 },
      scene,
    );
    horizontalShoulder.material = shoulderMaterial;
    horizontalShoulder.position.set(0, 0.03, center);
    applyShadowSetup(horizontalShoulder, null, true);

    const vertical = MeshBuilder.CreateBox(
      "road-vertical",
      { width: world.roadWidth, height: 0.18, depth: world.size },
      scene,
    );
    vertical.material = roadMaterial;
    vertical.position.set(center, 0.08, 0);
    applyShadowSetup(vertical, null, true);

    const horizontal = MeshBuilder.CreateBox(
      "road-horizontal",
      { width: world.size, height: 0.18, depth: world.roadWidth },
      scene,
    );
    horizontal.material = roadMaterial;
    horizontal.position.set(0, 0.08, center);
    applyShadowSetup(horizontal, null, true);

    createRoadMarkings(scene, quality, center, world.size, true);
    createRoadMarkings(scene, quality, center, world.size, false);

    const leftWalk = MeshBuilder.CreateBox(
      "sidewalk-left",
      { width: world.sidewalkWidth, height: 0.3, depth: world.size },
      scene,
    );
    leftWalk.material = sidewalkMaterial;
    leftWalk.position.set(center - world.roadWidth / 2 - world.sidewalkWidth / 2, 0.14, 0);
    applyShadowSetup(leftWalk, null, true);

    const rightWalk = MeshBuilder.CreateBox(
      "sidewalk-right",
      { width: world.sidewalkWidth, height: 0.3, depth: world.size },
      scene,
    );
    rightWalk.material = sidewalkMaterial;
    rightWalk.position.set(center + world.roadWidth / 2 + world.sidewalkWidth / 2, 0.14, 0);
    applyShadowSetup(rightWalk, null, true);

    const topWalk = MeshBuilder.CreateBox(
      "sidewalk-top",
      { width: world.size, height: 0.3, depth: world.sidewalkWidth },
      scene,
    );
    topWalk.material = sidewalkMaterial;
    topWalk.position.set(0, 0.14, center - world.roadWidth / 2 - world.sidewalkWidth / 2);
    applyShadowSetup(topWalk, null, true);

    const bottomWalk = MeshBuilder.CreateBox(
      "sidewalk-bottom",
      { width: world.size, height: 0.3, depth: world.sidewalkWidth },
      scene,
    );
    bottomWalk.material = sidewalkMaterial;
    bottomWalk.position.set(0, 0.14, center + world.roadWidth / 2 + world.sidewalkWidth / 2);
    applyShadowSetup(bottomWalk, null, true);

    const leftCurb = MeshBuilder.CreateBox("curb-left", { width: 0.5, height: 0.24, depth: world.size }, scene);
    leftCurb.material = curbMaterial;
    leftCurb.position.set(center - world.roadWidth / 2, 0.2, 0);
    applyShadowSetup(leftCurb, null, true);

    const rightCurb = MeshBuilder.CreateBox("curb-right", { width: 0.5, height: 0.24, depth: world.size }, scene);
    rightCurb.material = curbMaterial;
    rightCurb.position.set(center + world.roadWidth / 2, 0.2, 0);
    applyShadowSetup(rightCurb, null, true);

    const topCurb = MeshBuilder.CreateBox("curb-top", { width: world.size, height: 0.24, depth: 0.5 }, scene);
    topCurb.material = curbMaterial;
    topCurb.position.set(0, 0.2, center - world.roadWidth / 2);
    applyShadowSetup(topCurb, null, true);

    const bottomCurb = MeshBuilder.CreateBox("curb-bottom", { width: world.size, height: 0.24, depth: 0.5 }, scene);
    bottomCurb.material = curbMaterial;
    bottomCurb.position.set(0, 0.2, center + world.roadWidth / 2);
    applyShadowSetup(bottomCurb, null, true);
  }

  for (const building of world.buildings) {
    const shellMaterial = createMaterial(scene, building.color, quality, {
      texture: WORLD_THEME.textures.facade,
      textureScale: 3.6,
      bumpTexture: WORLD_THEME.textures.detailMask,
      bumpLevel: 0.05,
      roughness: 0.82,
      specularColor: WORLD_THEME.buildingShadow,
      specularPower: 16,
    });
    const shell = MeshBuilder.CreateBox(
      "building-shell",
      { width: building.w, height: building.h, depth: building.d },
      scene,
    );
    shell.material = shellMaterial;
    shell.position.set(building.x, building.h / 2, building.z);
    applyShadowSetup(shell, shadowGenerator, true);

    const podium = MeshBuilder.CreateBox(
      "building-podium",
      { width: building.w * 1.02, height: 1.8, depth: building.d * 1.02 },
      scene,
    );
    podium.material = createMaterial(scene, WORLD_THEME.facadeAccent, quality, {
      texture: WORLD_THEME.textures.sidewalk,
      textureScale: 2,
      roughness: 0.76,
      specularPower: 12,
    });
    podium.position.set(building.x, 0.9, building.z);
    applyShadowSetup(podium, shadowGenerator, true);

    const cornice = MeshBuilder.CreateBox(
      "building-cornice",
      { width: building.w * 1.04, height: 1.1, depth: building.d * 1.04 },
      scene,
    );
    cornice.material = createMaterial(scene, WORLD_THEME.facadeAccent, quality, {
      texture: WORLD_THEME.textures.sidewalk,
      textureScale: 2.4,
      roughness: 0.74,
      specularPower: 14,
    });
    cornice.position.set(building.x, building.h - 0.55, building.z);
    applyShadowSetup(cornice, shadowGenerator, true);

    const roof = MeshBuilder.CreateBox(
      "building-roof",
      { width: building.w * 0.94, height: 1.2, depth: building.d * 0.94 },
      scene,
    );
    roof.material = createMaterial(scene, building.roofColor ?? WORLD_THEME.roofPalette[0], quality, {
      texture: WORLD_THEME.textures.roof,
      textureScale: 2.2,
      bumpTexture: WORLD_THEME.textures.detailMask,
      bumpLevel: 0.04,
      roughness: 0.68,
      metallic: 0.08,
      specularPower: 18,
    });
    roof.position.set(building.x, building.h + 0.62, building.z);
    applyShadowSetup(roof, shadowGenerator, true);

    if (hash2(building.x, building.z) > 0.52) {
      const tower = MeshBuilder.CreateBox(
        "building-tower",
        { width: building.w * 0.24, height: 5 + hash2(building.z, building.x) * 10, depth: building.d * 0.24 },
        scene,
      );
      tower.material = createMaterial(scene, WORLD_THEME.roofTrim, quality, {
        texture: WORLD_THEME.textures.roof,
        textureScale: 1.8,
        roughness: 0.62,
        metallic: 0.18,
        specularPower: 22,
      });
      tower.position.set(building.x, building.h + 3.8, building.z);
      applyShadowSetup(tower, shadowGenerator, true);
    }

    if (hash2(building.z, building.x) > 0.4) {
      const lobby = MeshBuilder.CreateBox(
        "building-lobby",
        { width: Math.min(12, building.w * 0.28), height: 4.2, depth: 1.8 },
        scene,
      );
      lobby.material = createMaterial(scene, WORLD_THEME.glassColor, quality, {
        texture: WORLD_THEME.textures.glass,
        textureScale: 1.1,
        alpha: 0.92,
        emissiveColor: WORLD_THEME.glassEdge,
        emissiveIntensity: 0.05,
        roughness: 0.2,
        metallic: 0,
      });
      lobby.position.set(building.x, 2.1, building.z + building.d / 2 - 1.1);
      applyShadowSetup(lobby, shadowGenerator, true);
    }

    addBuildingWindows(scene, quality, building);
  }

  for (const tree of world.trees) {
    const trunk = MeshBuilder.CreateCylinder(
      "tree-trunk",
      { diameterTop: 0.4, diameterBottom: 0.62, height: 3.1, tessellation: 10 },
      scene,
    );
    trunk.material = createMaterial(scene, WORLD_THEME.treeTrunk, quality, {
      texture: WORLD_THEME.textures.detailMask,
      textureScale: 4,
      roughness: 0.96,
      specularPower: 8,
    });
    trunk.position.set(tree.x, 1.55, tree.z);
    applyShadowSetup(trunk, shadowGenerator, true);

    const crownMaterialA = createMaterial(scene, WORLD_THEME.treeLeafDark, quality, {
      texture: WORLD_THEME.textures.detailMask,
      textureScale: 3,
      bumpTexture: WORLD_THEME.textures.detailMask,
      bumpLevel: 0.03,
      roughness: 0.92,
      specularPower: 8,
    });
    const crownMaterialB = createMaterial(scene, WORLD_THEME.treeLeafLight, quality, {
      texture: WORLD_THEME.textures.detailMask,
      textureScale: 3.2,
      bumpTexture: WORLD_THEME.textures.detailMask,
      bumpLevel: 0.03,
      roughness: 0.9,
      specularPower: 8,
    });

    const lower = MeshBuilder.CreateSphere("tree-crown-lower", { diameter: 2.9 * tree.scale, segments: 12 }, scene);
    lower.material = crownMaterialA;
    lower.position.set(tree.x - 0.18, 3.2, tree.z + 0.12);
    applyShadowSetup(lower, shadowGenerator, true);

    const middle = MeshBuilder.CreateSphere("tree-crown-middle", { diameter: 2.3 * tree.scale, segments: 12 }, scene);
    middle.material = crownMaterialB;
    middle.position.set(tree.x + 0.32, 3.8, tree.z - 0.18);
    applyShadowSetup(middle, shadowGenerator, true);

    const upper = MeshBuilder.CreateSphere("tree-crown-upper", { diameter: 1.86 * tree.scale, segments: 12 }, scene);
    upper.material = crownMaterialA;
    upper.position.set(tree.x, 4.6, tree.z + 0.05);
    applyShadowSetup(upper, shadowGenerator, true);
  }

  for (const lamp of world.lamps) {
    const pole = MeshBuilder.CreateCylinder(
      "lamp-pole",
      { diameterTop: 0.12, diameterBottom: 0.18, height: 5.8, tessellation: 8 },
      scene,
    );
    pole.material = createMaterial(scene, WORLD_THEME.lampMetal, quality, {
      metallic: 0.32,
      roughness: 0.58,
      specularPower: 24,
    });
    pole.position.set(lamp.x, 2.9, lamp.z);
    applyShadowSetup(pole, shadowGenerator, true);

    const arm = MeshBuilder.CreateBox("lamp-arm", { width: 0.14, height: 0.14, depth: 1.26 }, scene);
    arm.material = createMaterial(scene, WORLD_THEME.lampMetal, quality, {
      metallic: 0.32,
      roughness: 0.58,
      specularPower: 24,
    });
    arm.position.set(lamp.x, 5.36, lamp.z + 0.56);
    applyShadowSetup(arm, shadowGenerator, true);

    const bulbMaterial = createMaterial(scene, "#fff7d6", quality, {
      emissiveColor: WORLD_THEME.lampGlow,
      emissiveIntensity: 0.98,
      metallic: 0.1,
      roughness: 0.18,
      specularPower: 120,
    });
    const bulb = MeshBuilder.CreateSphere("lamp-bulb", { diameter: 0.28, segments: 12 }, scene);
    bulb.material = bulbMaterial;
    bulb.position.set(lamp.x, 5.18, lamp.z + 1.1);
    applyShadowSetup(bulb, shadowGenerator, true);

    const pool = MeshBuilder.CreateCylinder(
      "lamp-pool",
      { diameterTop: 4.1, diameterBottom: 3.5, height: 0.04, tessellation: 24 },
      scene,
    );
    pool.material = createMaterial(scene, WORLD_THEME.lampPool, quality, {
      emissiveColor: WORLD_THEME.lampGlow,
      emissiveIntensity: 0.36,
      alpha: 0.2,
      disableLighting: true,
      specularPower: 1,
    });
    pool.position.set(lamp.x, 0.04, lamp.z + 1.02);
    pool.isPickable = false;
  }

  (world.hydrants ?? []).forEach((hydrant) => createHydrant(scene, quality, shadowGenerator, hydrant));
  (world.bollards ?? []).forEach((bollard) => createBollard(scene, quality, shadowGenerator, bollard));
  (world.signs ?? []).forEach((sign) => createSign(scene, quality, shadowGenerator, sign));
}

function createHydrant(scene, quality, shadowGenerator, position) {
  const root = new TransformNode("hydrant", scene);
  const material = createMaterial(scene, WORLD_THEME.hydrantColor, quality, {
    metallic: 0.18,
    roughness: 0.54,
    specularPower: 36,
  });
  const body = MeshBuilder.CreateCylinder("hydrant-body", { diameterTop: 0.24, diameterBottom: 0.28, height: 1, tessellation: 14 }, scene);
  body.material = material;
  body.position.set(position.x, 0.54, position.z);
  body.parent = root;

  const cap = MeshBuilder.CreateSphere("hydrant-cap", { diameterX: 0.42, diameterY: 0.28, diameterZ: 0.42, segments: 12 }, scene);
  cap.material = material;
  cap.position.set(position.x, 1.05, position.z);
  cap.parent = root;

  const nozzleA = MeshBuilder.CreateCylinder("hydrant-nozzle-a", { diameterTop: 0.14, diameterBottom: 0.14, height: 0.32, tessellation: 10 }, scene);
  nozzleA.material = material;
  nozzleA.rotation.z = Math.PI / 2;
  nozzleA.position.set(position.x + 0.22, 0.7, position.z);
  nozzleA.parent = root;

  const nozzleB = MeshBuilder.CreateCylinder("hydrant-nozzle-b", { diameterTop: 0.14, diameterBottom: 0.14, height: 0.32, tessellation: 10 }, scene);
  nozzleB.material = material;
  nozzleB.rotation.x = Math.PI / 2;
  nozzleB.position.set(position.x, 0.7, position.z + 0.22);
  nozzleB.parent = root;

  applyShadowSetup(root, shadowGenerator, true);
}

function createBollard(scene, quality, shadowGenerator, position) {
  const root = new TransformNode("bollard", scene);
  const material = createMaterial(scene, WORLD_THEME.bollardColor, quality, {
    metallic: 0.26,
    roughness: 0.52,
    specularPower: 34,
  });
  const pole = MeshBuilder.CreateCylinder("bollard-body", { diameterTop: 0.22, diameterBottom: 0.26, height: 0.94, tessellation: 10 }, scene);
  pole.material = material;
  pole.position.set(position.x, 0.48, position.z);
  pole.parent = root;

  const cap = MeshBuilder.CreateSphere("bollard-cap", { diameterX: 0.28, diameterY: 0.18, diameterZ: 0.28, segments: 10 }, scene);
  cap.material = createMaterial(scene, "#c4ccd5", quality, { metallic: 0.4, roughness: 0.38, specularPower: 48 });
  cap.position.set(position.x, 0.94, position.z);
  cap.parent = root;

  applyShadowSetup(root, shadowGenerator, true);
}

function createSign(scene, quality, shadowGenerator, position) {
  const root = new TransformNode("sign", scene);
  const board = MeshBuilder.CreateBox("sign-board", { width: 0.42, height: 0.28, depth: 0.04 }, scene);
  board.material = createMaterial(scene, WORLD_THEME.signAccent, quality, {
    emissiveColor: WORLD_THEME.signAccent,
    emissiveIntensity: 0.12,
    roughness: 0.62,
    metallic: 0.08,
  });
  board.position.set(position.x, 1.78, position.z);
  if (position.axis === "z") {
    board.rotation.y = Math.PI / 2;
  }
  board.parent = root;

  const stripe = MeshBuilder.CreateBox("sign-stripe", { width: 0.12, height: 0.22, depth: 0.045 }, scene);
  stripe.material = createMaterial(scene, "#f8fafc", quality, { roughness: 0.54, metallic: 0.06 });
  stripe.position.copyFrom(board.position);
  stripe.position.y += 0.01;
  stripe.position.x += position.axis === "z" ? 0 : -0.1;
  stripe.position.z += position.axis === "z" ? -0.1 : 0;
  stripe.rotation.y = board.rotation.y;
  stripe.parent = root;

  const pole = MeshBuilder.CreateCylinder("sign-pole", { diameterTop: 0.08, diameterBottom: 0.08, height: 1.6, tessellation: 8 }, scene);
  pole.material = createMaterial(scene, WORLD_THEME.bollardColor, quality, { metallic: 0.24, roughness: 0.54, specularPower: 28 });
  pole.position.set(position.x, 0.8, position.z);
  pole.parent = root;

  applyShadowSetup(root, shadowGenerator, true);
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

function createPostProcessing(scene, nativeCamera, quality) {
  const resources = {};

  if (quality.fxaa) {
    resources.fxaa = new FxaaPostProcess("scene-fxaa", 1, nativeCamera);
  }

  if (quality.bloom) {
    const pipeline = new DefaultRenderingPipeline("scene-pipeline", true, scene, [nativeCamera]);
    pipeline.samples = 1;
    pipeline.fxaaEnabled = false;
    pipeline.imageProcessingEnabled = false;
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = quality.bloomThreshold ?? 0.88;
    pipeline.bloomWeight = quality.bloomWeight ?? 0.18;
    pipeline.bloomKernel = 52;
    resources.pipeline = pipeline;
  }

  if (quality.ssao) {
    const ssao = new SSAORenderingPipeline("scene-ssao", scene, 0.6, [nativeCamera]);
    ssao.totalStrength = 0.58;
    ssao.radius = 1.2;
    ssao.area = 0.028;
    ssao.fallOff = 0.00008;
    ssao.base = 0.42;
    resources.ssao = ssao;
  }

  return resources;
}

function updateDynamicShadowCasters(node, shadowGenerator) {
  if (!shadowGenerator) return;
  for (const mesh of listNodeMeshes(node)) {
    shadowGenerator.addShadowCaster(mesh);
  }
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
  hemi.diffuse = Color3.FromHexString(WORLD_THEME.ambientSky);
  hemi.groundColor = Color3.FromHexString(WORLD_THEME.ambientGround);
  hemi.intensity = resolvedQuality.materialMode === "pbr" ? 1.08 : 0.96;

  const sun = new DirectionalLight("sun", new Vector3(-0.44, -1, -0.26), scene);
  sun.position = new Vector3(190, 220, 110);
  sun.diffuse = Color3.FromHexString(WORLD_THEME.sunColor);
  sun.intensity = resolvedQuality.materialMode === "pbr" ? 1.38 : 1.24;

  const rim = new DirectionalLight("rim", new Vector3(0.3, -0.66, 0.48), scene);
  rim.position = new Vector3(-160, 140, -170);
  rim.diffuse = Color3.FromHexString(WORLD_THEME.rimColor);
  rim.intensity = resolvedQuality.materialMode === "pbr" ? 0.52 : 0.36;

  let shadowGenerator = null;
  if (resolvedQuality.shadows && resolvedQuality.shadowMapSize > 0) {
    shadowGenerator = new ShadowGenerator(resolvedQuality.shadowMapSize, sun);
    shadowGenerator.useBlurExponentialShadowMap = true;
    shadowGenerator.blurKernel = 24;
    shadowGenerator.depthScale = 120;
    shadowGenerator.setDarkness(resolvedQuality.shadowDarkness ?? 0.22);
  }

  buildStaticWorld(scene, world, resolvedQuality, shadowGenerator);
  const glow = new GlowLayer("scene-glow", scene);
  glow.intensity = resolvedQuality.glowIntensity ?? 0.24;
  const post = createPostProcessing(scene, nativeCamera, resolvedQuality);

  const dynamic = {
    player: createCharacterMesh(scene, resolvedQuality, "#f0d7bd", "#4f6b8d", true),
    vehicles: new Map(),
    pedestrians: new Map(),
    pickups: new Map(),
    projectiles: new Map(),
  };

  updateDynamicShadowCasters(dynamic.player, shadowGenerator);

  for (const vehicle of state.vehicles) {
    const mesh = createVehicleMesh(scene, resolvedQuality, vehicle.color, vehicle.kind === "police");
    updateDynamicShadowCasters(mesh, shadowGenerator);
    dynamic.vehicles.set(vehicle.id, mesh);
  }
  for (const ped of state.pedestrians) {
    const mesh = createCharacterMesh(
      scene,
      resolvedQuality,
      ped.tone,
      ped.shirt || WORLD_THEME.shirtPalette[Math.floor(hash2(ped.x, ped.z) * WORLD_THEME.shirtPalette.length)],
      ped.hostile,
    );
    updateDynamicShadowCasters(mesh, shadowGenerator);
    dynamic.pedestrians.set(ped.id, mesh);
  }
  for (const pickup of state.pickups) {
    dynamic.pickups.set(pickup.id, createPickupMesh(scene, resolvedQuality));
  }
  for (const projectile of state.projectiles ?? []) {
    dynamic.projectiles.set(projectile.id, createProjectileMesh(scene, resolvedQuality, projectile));
  }

  const skidMaterial = createMaterial(scene, "#d8c79b", resolvedQuality, {
    emissiveColor: "#f4d9aa",
    emissiveIntensity: 0.36,
    disableLighting: true,
    alpha: 0.42,
  });
  const skidDust = MeshBuilder.CreateCylinder("skid-dust", { diameterTop: 1.56, diameterBottom: 0.72, height: 0.02, tessellation: 22 }, scene);
  skidDust.material = skidMaterial;
  skidDust.position.y = 0.02;
  skidDust.rotation.x = Math.PI / 2;
  skidDust.isVisible = false;
  skidDust.renderingGroupId = 2;
  skidDust.isPickable = false;
  dynamic.skidDust = skidDust;

  return {
    engine,
    scene,
    camera,
    nativeCamera,
    renderer,
    dynamic,
    glowLayer: glow,
    shadowGenerator,
    postEffects: post,
    quality: resolvedQuality,
  };
}

export function renderFrame(view, state, dt) {
  const { scene, camera, nativeCamera, dynamic, shadowGenerator, quality } = view;
  const playerVehicle =
    state.player.vehicleId != null
      ? state.vehicles.find((vehicle) => vehicle.id === state.player.vehicleId)
      : null;

  syncEntityMap(state.vehicles, dynamic.vehicles, (vehicle) => {
    const mesh = createVehicleMesh(scene, quality, vehicle.color, vehicle.kind === "police");
    updateDynamicShadowCasters(mesh, shadowGenerator);
    return mesh;
  });
  syncEntityMap(state.pedestrians, dynamic.pedestrians, (ped) => {
    const mesh = createCharacterMesh(scene, quality, ped.tone, ped.shirt, ped.hostile);
    updateDynamicShadowCasters(mesh, shadowGenerator);
    return mesh;
  });
  syncEntityMap(state.pickups, dynamic.pickups, () => createPickupMesh(scene, quality));
  syncEntityMap(state.projectiles ?? [], dynamic.projectiles, (projectile) =>
    createProjectileMesh(scene, quality, projectile),
  );

  dynamic.player.setEnabled(state.player.mode === "onfoot" && !state.gameOver);
  dynamic.player.position.copyFromFloats(state.player.x, 0, state.player.z);
  dynamic.player.rotation.y = -state.player.heading + CHARACTER_HEADING_OFFSET;

  for (const vehicle of state.vehicles) {
    const mesh = dynamic.vehicles.get(vehicle.id);
    if (!mesh) continue;

    mesh.position.copyFromFloats(vehicle.x, 0, vehicle.z);
    mesh.rotation.y = -vehicle.heading;

    const wheelSpin = vehicle.speed * dt * 0.58;
    for (const wheel of mesh.metadata?.wheels ?? []) {
      wheel.rotation.z += wheelSpin;
    }

    if (vehicle.kind === "police" && mesh.metadata?.sirenMaterials) {
      const [blueMat, redMat] = mesh.metadata.sirenMaterials;
      const phase = Math.sin(vehicle.sirenPhase);
      blueMat.emissiveColor = Color3.FromHexString(WORLD_THEME.policeBlue).scale(phase > 0 ? 1.95 : 0.25);
      redMat.emissiveColor = Color3.FromHexString(WORLD_THEME.policeRed).scale(phase <= 0 ? 1.95 : 0.25);
      const glow = mesh.metadata?.sirenGlow;
      if (glow?.material) {
        const pulse = Math.max(0.45, 0.65 + Math.abs(Math.sin(vehicle.sirenPhase)) * 0.9);
        glow.scaling.x = 0.85 + pulse;
        glow.scaling.z = 0.85 + pulse;
        const mix = Math.sin(vehicle.sirenPhase * 0.9);
        glow.material.emissiveColor = Color3.FromHexString(
          mix > 0 ? WORLD_THEME.policeBlue : WORLD_THEME.policeRed,
        ).scale(0.48 + Math.abs(mix) * 0.55);
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
        pickup.bonusTag ? 2 : 1,
      );
    }

    if (mesh.metadata?.coreMaterial) {
      const glow = 0.44 + (Math.sin(pickup.bob * 1.3) + 1) * 0.34;
      mesh.metadata.coreMaterial.emissiveColor = Color3.FromHexString(WORLD_THEME.pickupGlow).scale(
        pickup.bonusTag ? glow * 1.5 : glow,
      );
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
      skid.scaling.x = 1 + slip * 1.9;
      skid.scaling.z = 1 + brake * 1.5;
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

export function disposeSceneView(view) {
  view.postEffects?.ssao?.dispose?.();
  view.postEffects?.pipeline?.dispose?.();
  view.postEffects?.fxaa?.dispose?.();
  view.glowLayer?.dispose?.();
  view.shadowGenerator?.dispose?.();
  view.scene?.dispose?.();
  view.engine?.dispose?.();
  view.renderer?.domElement?.remove?.();
}
