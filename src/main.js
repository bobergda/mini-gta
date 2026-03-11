import { createInput } from "./game/input.js";
import { createWorld } from "./game/world.js";
import { createGameState } from "./game/simulation.js";
import { createCameraController } from "./game/camera.js";
import { applyHudText, createHud, hideStartOverlay, syncHud } from "./game/hud.js";
import { advanceFrame, createFrameCounter } from "./game/loop.js";

const root = document.getElementById("game-root");
const shell = document.getElementById("shell");

const world = createWorld();
const state = createGameState(world);
const hud = createHud(document);
const input = createInput(window, root);
const frameCounter = createFrameCounter();
let sceneView = null;
let renderFrame = null;
let cameraController = null;
let frameActive = false;
let startRequested = false;

applyHudText(hud);

function resize() {
  if (!sceneView) return;
  const rect = root.getBoundingClientRect();
  sceneView.renderer.setSize(rect.width, rect.height, false);
  sceneView.camera.aspect = rect.width / rect.height;
  sceneView.camera.updateProjectionMatrix();
}

async function ensureSceneView() {
  if (sceneView && renderFrame && cameraController) return;
  const renderModule = await import("./game/render.js");
  sceneView = renderModule.createSceneView(root, world, state);
  renderFrame = renderModule.renderFrame;
  cameraController = createCameraController(sceneView.camera);
  resize();
}

let previous = performance.now();

hud.startButton?.addEventListener(
  "click",
  async () => {
    if (startRequested) return;
    startRequested = true;
    await ensureSceneView();
    state.running = true;
    previous = performance.now();
    hideStartOverlay(hud);
    sceneView.renderer.domElement.focus();
    if (!frameActive) {
      frameActive = true;
      requestAnimationFrame(frame);
    }
  },
  { once: true },
);

window.addEventListener("resize", resize);

function frame(now) {
  const dt = Math.min(0.033, (now - previous) / 1000);
  previous = now;

  advanceFrame(state, world, input, cameraController, frameCounter, dt);
  syncHud(hud, state, { fps: frameCounter.fps });
  renderFrame(sceneView, state, dt);
  requestAnimationFrame(frame);
}

syncHud(hud, state, { fps: 0 });

shell.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});
