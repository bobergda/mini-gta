import { createInput } from "./game/input.js";
import { createWorld } from "./game/world.js";
import { createGameState, updateGameState } from "./game/simulation.js";
import { createSceneView, renderFrame } from "./game/render.js";
import { createCameraController, updateCamera } from "./game/camera.js";
import { createHud, syncHud } from "./game/hud.js";

const root = document.getElementById("game-root");
const shell = document.getElementById("shell");

const world = createWorld();
const state = createGameState(world);
const hud = createHud(document);
const input = createInput(window, root);
const sceneView = createSceneView(root, world, state);
const cameraController = createCameraController(sceneView.camera);

function resize() {
  const rect = root.getBoundingClientRect();
  sceneView.renderer.setSize(rect.width, rect.height, false);
  sceneView.camera.aspect = rect.width / rect.height;
  sceneView.camera.updateProjectionMatrix();
}

window.addEventListener("resize", resize);
resize();

let previous = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - previous) / 1000);
  previous = now;

  updateGameState(state, world, input, cameraController, dt);
  updateCamera(cameraController, input, state, dt);
  syncHud(hud, state);
  renderFrame(sceneView, state, dt);

  requestAnimationFrame(frame);
}

syncHud(hud, state);
requestAnimationFrame(frame);

shell.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});
