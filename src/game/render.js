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
import "@babylonjs/core/Meshes/Builders/boxBuilder";
import "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import "@babylonjs/core/Meshes/Builders/sphereBuilder";
import "@babylonjs/core/Shaders/default.vertex";
import "@babylonjs/core/Shaders/default.fragment";

const TEMP_TARGET = new Vector3();

function createMaterial(scene, color, options = {}) {
  const material = new StandardMaterial(`mat-${Math.random().toString(36).slice(2, 9)}`, scene);
  material.diffuseColor = Color3.FromHexString(color);
  material.specularColor = new Color3(0.1, 0.1, 0.1);
  material.backFaceCulling = false;
  if (options.emissiveColor) {
    material.emissiveColor = Color3.FromHexString(options.emissiveColor);
  }
  if (typeof options.emissiveIntensity === "number") {
    material.disableLighting = false;
    material.emissiveColor = (material.emissiveColor || new Color3(0, 0, 0)).scale(options.emissiveIntensity);
  }
  return material;
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

function createCharacterMesh(scene, tone, shirt) {
  const root = new TransformNode("character", scene);

  const body = MeshBuilder.CreateBox("character-body", { width: 0.8, height: 1.2, depth: 0.5 }, scene);
  body.material = createMaterial(scene, shirt);
  body.position.y = 1.2;
  body.parent = root;

  const head = MeshBuilder.CreateSphere("character-head", { diameter: 0.68, segments: 12 }, scene);
  head.material = createMaterial(scene, tone);
  head.position.set(0.25, 2.05, 0);
  head.parent = root;

  return root;
}

function createVehicleMesh(scene, color, police = false) {
  const root = new TransformNode("vehicle", scene);

  const body = MeshBuilder.CreateBox("vehicle-body", { width: 4.2, height: 1.2, depth: 2.15 }, scene);
  body.material = createMaterial(scene, police ? "#101827" : color);
  body.position.y = 1.1;
  body.parent = root;

  const cabin = MeshBuilder.CreateBox("vehicle-cabin", { width: 2.2, height: 0.9, depth: 1.8 }, scene);
  cabin.material = createMaterial(scene, "#d8e4f0");
  cabin.position.set(-0.1, 1.85, 0);
  cabin.parent = root;

  const wheelPositions = [
    [1.3, 0.42, 1.02],
    [1.3, 0.42, -1.02],
    [-1.25, 0.42, 1.02],
    [-1.25, 0.42, -1.02],
  ];

  for (const [x, y, z] of wheelPositions) {
    const wheel = MeshBuilder.CreateCylinder(
      "vehicle-wheel",
      { diameterTop: 0.84, diameterBottom: 0.84, height: 0.36, tessellation: 10 },
      scene,
    );
    wheel.material = createMaterial(scene, "#13151d");
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    wheel.parent = root;
  }

  if (police) {
    const sirenMaterial = createMaterial(scene, "#f4f8ff", {
      emissiveColor: "#1d3d73",
      emissiveIntensity: 0.5,
    });
    const bar = MeshBuilder.CreateBox("vehicle-siren", { width: 1.1, height: 0.22, depth: 0.42 }, scene);
    bar.material = sirenMaterial;
    bar.position.set(0, 2.45, 0);
    bar.parent = root;
    root.metadata = { sirenMaterial };
  }

  return root;
}

function createPickupMesh(scene) {
  const root = new TransformNode("pickup", scene);
  const coin = MeshBuilder.CreateCylinder(
    "pickup-coin",
    { diameterTop: 1, diameterBottom: 1, height: 0.22, tessellation: 18 },
    scene,
  );
  coin.material = createMaterial(scene, "#ffd166");
  coin.rotation.z = Math.PI / 2;
  coin.parent = root;
  return root;
}

function buildStaticWorld(scene, world) {
  const background = Color3.FromHexString("#91d6ff");
  scene.clearColor = new Color4(background.r, background.g, background.b, 1);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = Color3.FromHexString("#b7e2f6");
  scene.fogStart = 120;
  scene.fogEnd = world.size * 0.75;

  const ground = MeshBuilder.CreateBox("ground", { width: world.size, height: 2, depth: world.size }, scene);
  ground.material = createMaterial(scene, "#64874f");
  ground.position.y = -1;

  const roadMaterial = createMaterial(scene, "#31353d");
  const sidewalkMaterial = createMaterial(scene, "#c7bfac");

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
  }

  for (const building of world.buildings) {
    const mesh = MeshBuilder.CreateBox(
      "building",
      { width: building.w, height: building.h, depth: building.d },
      scene,
    );
    mesh.material = createMaterial(scene, building.color);
    mesh.position.set(building.x, building.h / 2, building.z);
  }

  for (const tree of world.trees) {
    const trunk = MeshBuilder.CreateCylinder(
      "tree-trunk",
      { diameterTop: 0.56, diameterBottom: 0.68, height: 2.5, tessellation: 7 },
      scene,
    );
    trunk.material = createMaterial(scene, "#7a5131");
    trunk.position.set(tree.x, 1.25, tree.z);

    const crown = MeshBuilder.CreateSphere(
      "tree-crown",
      { diameter: 3.4 * tree.scale, segments: 8 },
      scene,
    );
    crown.material = createMaterial(scene, "#3f8d5d");
    crown.position.set(tree.x, 3.5, tree.z);
  }

  for (const lamp of world.lamps) {
    const pole = MeshBuilder.CreateCylinder(
      "lamp-pole",
      { diameterTop: 0.16, diameterBottom: 0.24, height: 5.5, tessellation: 6 },
      scene,
    );
    pole.material = createMaterial(scene, "#4f5667");
    pole.position.set(lamp.x, 2.75, lamp.z);

    const lightMaterial = createMaterial(scene, "#fff1b3", {
      emissiveColor: "#ffd166",
      emissiveIntensity: 0.9,
    });
    const light = MeshBuilder.CreateSphere("lamp-light", { diameter: 0.44, segments: 8 }, scene);
    light.material = lightMaterial;
    light.position.set(lamp.x, 5.5, lamp.z);
  }
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

function createRendererFacade(root) {
  const canvas = document.createElement("canvas");
  canvas.className = "game-canvas";
  canvas.tabIndex = 0;
  root.append(canvas);

  const engine = new Engine(canvas, true, undefined, true);
  const maxPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  engine.setHardwareScalingLevel(1 / maxPixelRatio);

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

export function createSceneView(root, world, state) {
  const { engine, renderer } = createRendererFacade(root);
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;

  const camera = createCameraProxy(16 / 9);
  const nativeCamera = new FreeCamera("main-camera", new Vector3(0, 20, 26), scene);
  scene.activeCamera = nativeCamera;
  nativeCamera.fov = (56 * Math.PI) / 180;
  nativeCamera.minZ = 0.1;
  nativeCamera.maxZ = 4000;

  const hemi = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
  hemi.diffuse = Color3.FromHexString("#d7efff");
  hemi.groundColor = Color3.FromHexString("#476044");
  hemi.intensity = 1.35;

  const dir = new DirectionalLight("sun", new Vector3(-0.6, -1, -0.4), scene);
  dir.position = new Vector3(120, 180, 80);
  dir.diffuse = Color3.FromHexString("#fff2d8");
  dir.intensity = 1.2;

  buildStaticWorld(scene, world);

  const dynamic = {
    player: createCharacterMesh(scene, "#f8e5c1", "#9f7aea"),
    vehicles: new Map(),
    pedestrians: new Map(),
    pickups: new Map(),
  };

  for (const vehicle of state.vehicles) {
    dynamic.vehicles.set(vehicle.id, createVehicleMesh(scene, vehicle.color, vehicle.kind === "police"));
  }
  for (const ped of state.pedestrians) {
    dynamic.pedestrians.set(ped.id, createCharacterMesh(scene, ped.tone, ped.shirt));
  }
  for (const pickup of state.pickups) {
    dynamic.pickups.set(pickup.id, createPickupMesh(scene));
  }

  return { scene, camera, nativeCamera, renderer, dynamic };
}

export function renderFrame(view, state, dt) {
  const { scene, camera, nativeCamera, dynamic } = view;

  syncEntityMap(state.vehicles, dynamic.vehicles, (vehicle) =>
    createVehicleMesh(scene, vehicle.color, vehicle.kind === "police"),
  );
  syncEntityMap(state.pedestrians, dynamic.pedestrians, (ped) =>
    createCharacterMesh(scene, ped.tone, ped.shirt),
  );
  syncEntityMap(state.pickups, dynamic.pickups, () => createPickupMesh(scene));

  dynamic.player.setEnabled(state.player.mode === "onfoot" && !state.gameOver);
  dynamic.player.position.copyFromFloats(state.player.x, 0, state.player.z);
  dynamic.player.rotation.y = -state.player.heading;

  for (const vehicle of state.vehicles) {
    const mesh = dynamic.vehicles.get(vehicle.id);
    if (!mesh) continue;
    mesh.position.copyFromFloats(vehicle.x, 0, vehicle.z);
    mesh.rotation.y = -vehicle.heading;
    if (vehicle.kind === "police" && mesh.metadata?.sirenMaterial) {
      const sirenOn = Math.sin(vehicle.sirenPhase) > 0;
      mesh.metadata.sirenMaterial.emissiveColor = Color3.FromHexString(
        sirenOn ? "#3b82f6" : "#ef4444",
      ).scale(sirenOn ? 1.6 : 0.35);
    }
  }

  for (const ped of state.pedestrians) {
    const mesh = dynamic.pedestrians.get(ped.id);
    if (!mesh) continue;
    mesh.setEnabled(ped.alive);
    mesh.position.copyFromFloats(ped.x, 0, ped.z);
    mesh.rotation.y = -ped.heading;
  }

  for (const pickup of state.pickups) {
    const mesh = dynamic.pickups.get(pickup.id);
    if (!mesh) continue;
    mesh.position.copyFromFloats(pickup.x, pickup.y + Math.sin(pickup.bob) * 0.45, pickup.z);
    mesh.rotation.y += dt * 1.2;
  }

  nativeCamera.position.copyFromFloats(camera.position.x, camera.position.y, camera.position.z);
  TEMP_TARGET.copyFromFloats(camera.target.x, camera.target.y, camera.target.z);
  nativeCamera.setTarget(TEMP_TARGET);

  scene.render();
}
