import * as THREE from "three";

function createCharacterMesh(tone, shirt) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.2, 0.5),
    new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 }),
  );
  body.position.y = 1.2;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 12, 10),
    new THREE.MeshStandardMaterial({ color: tone, roughness: 0.95 }),
  );
  head.position.set(0.25, 2.05, 0);
  group.add(head);

  return group;
}

function createVehicleMesh(color, police = false) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 1.2, 2.15),
    new THREE.MeshStandardMaterial({ color: police ? "#101827" : color, roughness: 0.75 }),
  );
  body.position.y = 1.1;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.9, 1.8),
    new THREE.MeshStandardMaterial({ color: "#d8e4f0", roughness: 0.18 }),
  );
  cabin.position.set(-0.1, 1.85, 0);
  group.add(cabin);

  const wheelGeometry = new THREE.CylinderGeometry(0.42, 0.42, 0.36, 10);
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: "#13151d", roughness: 1 });
  const wheelPositions = [
    [1.3, 0.42, 1.02],
    [1.3, 0.42, -1.02],
    [-1.25, 0.42, 1.02],
    [-1.25, 0.42, -1.02],
  ];
  for (const [x, y, z] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    group.add(wheel);
  }

  if (police) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.22, 0.42),
      new THREE.MeshStandardMaterial({ color: "#f4f8ff", emissive: "#1d3d73", emissiveIntensity: 0.5 }),
    );
    bar.position.set(0, 2.45, 0);
    group.add(bar);
  }

  return group;
}

function createPickupMesh() {
  const group = new THREE.Group();
  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 0.22, 18),
    new THREE.MeshStandardMaterial({ color: "#ffd166", metalness: 0.35, roughness: 0.35 }),
  );
  coin.rotation.z = Math.PI / 2;
  group.add(coin);
  return group;
}

function buildStaticWorld(scene, world) {
  scene.background = new THREE.Color("#91d6ff");
  scene.fog = new THREE.Fog("#b7e2f6", 120, world.size * 0.75);

  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(world.size, 2, world.size),
    new THREE.MeshStandardMaterial({ color: "#64874f", roughness: 1 }),
  );
  ground.position.y = -1;
  scene.add(ground);

  const roadMaterial = new THREE.MeshStandardMaterial({ color: "#31353d", roughness: 0.95 });
  const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: "#c7bfac", roughness: 1 });

  for (const center of world.roadCenters) {
    const vertical = new THREE.Mesh(
      new THREE.BoxGeometry(world.roadWidth, 0.2, world.size),
      roadMaterial,
    );
    vertical.position.set(center, 0.01, 0);
    scene.add(vertical);

    const horizontal = new THREE.Mesh(
      new THREE.BoxGeometry(world.size, 0.2, world.roadWidth),
      roadMaterial,
    );
    horizontal.position.set(0, 0.02, center);
    scene.add(horizontal);

    const leftWalk = new THREE.Mesh(
      new THREE.BoxGeometry(world.sidewalkWidth, 0.24, world.size),
      sidewalkMaterial,
    );
    leftWalk.position.set(center - world.roadWidth / 2 - world.sidewalkWidth / 2, 0.04, 0);
    scene.add(leftWalk);

    const rightWalk = leftWalk.clone();
    rightWalk.position.x = center + world.roadWidth / 2 + world.sidewalkWidth / 2;
    scene.add(rightWalk);

    const topWalk = new THREE.Mesh(
      new THREE.BoxGeometry(world.size, 0.24, world.sidewalkWidth),
      sidewalkMaterial,
    );
    topWalk.position.set(0, 0.04, center - world.roadWidth / 2 - world.sidewalkWidth / 2);
    scene.add(topWalk);

    const bottomWalk = topWalk.clone();
    bottomWalk.position.z = center + world.roadWidth / 2 + world.sidewalkWidth / 2;
    scene.add(bottomWalk);
  }

  for (const building of world.buildings) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(building.w, building.h, building.d),
      new THREE.MeshStandardMaterial({ color: building.color, roughness: 0.9 }),
    );
    mesh.position.set(building.x, building.h / 2, building.z);
    scene.add(mesh);
  }

  for (const tree of world.trees) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.34, 2.5, 7),
      new THREE.MeshStandardMaterial({ color: "#7a5131", roughness: 1 }),
    );
    trunk.position.set(tree.x, 1.25, tree.z);
    scene.add(trunk);

    const crown = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1.7 * tree.scale, 0),
      new THREE.MeshStandardMaterial({ color: "#3f8d5d", roughness: 1 }),
    );
    crown.position.set(tree.x, 3.5, tree.z);
    scene.add(crown);
  }

  for (const lamp of world.lamps) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 5.5, 6),
      new THREE.MeshStandardMaterial({ color: "#4f5667", roughness: 0.9 }),
    );
    pole.position.set(lamp.x, 2.75, lamp.z);
    scene.add(pole);

    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 8),
      new THREE.MeshStandardMaterial({ color: "#fff1b3", emissive: "#ffd166", emissiveIntensity: 0.9 }),
    );
    light.position.set(lamp.x, 5.5, lamp.z);
    scene.add(light);
  }
}

export function createSceneView(root, world, state) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(56, 16 / 9, 0.1, 4000);
  camera.position.set(0, 20, 26);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = false;
  renderer.domElement.tabIndex = 0;
  root.append(renderer.domElement);

  const hemi = new THREE.HemisphereLight("#d7efff", "#476044", 1.35);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight("#fff2d8", 1.2);
  dir.position.set(120, 180, 80);
  scene.add(dir);

  buildStaticWorld(scene, world);

  const dynamic = {
    player: createCharacterMesh("#f8e5c1", "#9f7aea"),
    vehicles: new Map(),
    pedestrians: new Map(),
    pickups: new Map(),
  };

  scene.add(dynamic.player);

  for (const vehicle of state.vehicles) {
    const mesh = createVehicleMesh(vehicle.color, vehicle.kind === "police");
    dynamic.vehicles.set(vehicle.id, mesh);
    scene.add(mesh);
  }
  for (const ped of state.pedestrians) {
    const mesh = createCharacterMesh(ped.tone, ped.shirt);
    dynamic.pedestrians.set(ped.id, mesh);
    scene.add(mesh);
  }
  for (const pickup of state.pickups) {
    const mesh = createPickupMesh();
    dynamic.pickups.set(pickup.id, mesh);
    scene.add(mesh);
  }

  return { scene, camera, renderer, dynamic };
}

function syncEntityMap(collection, map, scene, factory) {
  const ids = new Set(collection.map((item) => item.id));

  for (const item of collection) {
    if (map.has(item.id)) continue;
    const mesh = factory(item);
    map.set(item.id, mesh);
    scene.add(mesh);
  }

  for (const [id, mesh] of map.entries()) {
    if (ids.has(id)) continue;
    scene.remove(mesh);
    map.delete(id);
  }
}

export function renderFrame(view, state, dt) {
  const { scene, camera, renderer, dynamic } = view;

  syncEntityMap(state.vehicles, dynamic.vehicles, scene, (vehicle) => createVehicleMesh(vehicle.color, vehicle.kind === "police"));
  syncEntityMap(state.pedestrians, dynamic.pedestrians, scene, (ped) => createCharacterMesh(ped.tone, ped.shirt));
  syncEntityMap(state.pickups, dynamic.pickups, scene, createPickupMesh);

  dynamic.player.visible = state.player.mode === "onfoot" && !state.gameOver;
  dynamic.player.position.set(state.player.x, 0, state.player.z);
  dynamic.player.rotation.y = -state.player.heading;

  for (const vehicle of state.vehicles) {
    const mesh = dynamic.vehicles.get(vehicle.id);
    if (!mesh) continue;
    mesh.position.set(vehicle.x, 0, vehicle.z);
    mesh.rotation.y = -vehicle.heading;
    if (vehicle.kind === "police" && mesh.children[6]) {
      mesh.children[6].material.emissiveIntensity = Math.sin(vehicle.sirenPhase) > 0 ? 1.6 : 0.35;
      mesh.children[6].material.emissive.set(Math.sin(vehicle.sirenPhase) > 0 ? "#3b82f6" : "#ef4444");
    }
  }

  for (const ped of state.pedestrians) {
    const mesh = dynamic.pedestrians.get(ped.id);
    if (!mesh) continue;
    mesh.visible = ped.alive;
    mesh.position.set(ped.x, 0, ped.z);
    mesh.rotation.y = -ped.heading;
  }

  for (const pickup of state.pickups) {
    const mesh = dynamic.pickups.get(pickup.id);
    if (!mesh) continue;
    mesh.position.set(pickup.x, pickup.y + Math.sin(pickup.bob) * 0.45, pickup.z);
    mesh.rotation.y += dt * 1.2;
  }

  renderer.render(scene, camera);
}
