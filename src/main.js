import { createInput } from "./game/input.js";
import { createWorld } from "./game/world.js";
import { createGameState, updateGameState } from "./game/simulation.js";
import { createSceneView, renderFrame } from "./game/render.js";
import { createCameraController, updateCamera } from "./game/camera.js";
import { createHud, hideStartOverlay, syncHud } from "./game/hud.js";

const root = document.getElementById("game-root");
const shell = document.getElementById("shell");

const world = createWorld();
const state = createGameState(world);
const hud = createHud(document);
const input = createInput(window, root);
const sceneView = createSceneView(root, world, state);
const cameraController = createCameraController(sceneView.camera);
const frameCounter = {
  accumulator: 0,
  frames: 0,
  fps: 0,
};

function resize() {
  const rect = root.getBoundingClientRect();
  sceneView.renderer.setSize(rect.width, rect.height, false);
  sceneView.camera.aspect = rect.width / rect.height;
  sceneView.camera.updateProjectionMatrix();
}

let previous = performance.now();

hud.startButton?.addEventListener(
  "click",
  () => {
    state.running = true;
    previous = performance.now();
    hideStartOverlay(hud);
    sceneView.renderer.domElement.focus();
  },
  { once: true },
);

window.addEventListener("resize", resize);
resize();

function frame(now) {
  const dt = Math.min(0.033, (now - previous) / 1000);
  previous = now;

  updateGameState(state, world, input, cameraController, dt);
  updateCamera(cameraController, input, state, dt);

  if (state.running) {
    frameCounter.accumulator += dt;
    frameCounter.frames += 1;
    if (frameCounter.accumulator >= 0.25) {
      frameCounter.fps = frameCounter.frames / frameCounter.accumulator;
      frameCounter.accumulator = 0;
      frameCounter.frames = 0;
    }
  }

  syncHud(hud, state, { fps: frameCounter.fps });
  renderFrame(sceneView, state, dt);
  requestAnimationFrame(frame);
}

syncHud(hud, state, { fps: 0 });
requestAnimationFrame(frame);

shell.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});
