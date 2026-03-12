import { createAudioController, setMuted, syncAudio, unlockAudio } from "./game/audio.js";
import { createInput } from "./game/input.js";
import { advanceFrame, createFrameCounter } from "./game/loop.js";
import { createCameraController } from "./game/camera.js";
import {
  applyHudText,
  createHud,
  hideEndOverlay,
  hideStartOverlay,
  syncHud,
} from "./game/hud.js";
import { getQualityPreset } from "./game/presentation.js";
import { createGameState, drainFrameEvents } from "./game/simulation.js";
import { createWorld } from "./game/world.js";

const root = document.getElementById("game-root");
const shell = document.getElementById("shell");

const world = createWorld();
let state = createGameState(world);
const hud = createHud(document);
const input = createInput(window, root);
const frameCounter = createFrameCounter();
const audioController = createAudioController();
const quality = getQualityPreset("medium");

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
  sceneView = renderModule.createSceneView(root, world, state, quality);
  renderFrame = renderModule.renderFrame;
  cameraController = createCameraController(sceneView.camera);
  resize();
}

let previous = performance.now();

async function beginRun() {
  await ensureSceneView();
  await unlockAudio(audioController);
  state.running = true;
  previous = performance.now();
  hideStartOverlay(hud);
  hideEndOverlay(hud);
  sceneView.renderer.domElement.focus();
  syncAudio(audioController, state, [{ type: "run_started" }], 0);

  if (!frameActive) {
    frameActive = true;
    requestAnimationFrame(frame);
  }
}

function resetRun() {
  state = createGameState(world);
  state.running = true;
  previous = performance.now();
  hideStartOverlay(hud);
  hideEndOverlay(hud);
  syncHud(hud, state, { fps: frameCounter.fps }, undefined, { muted: audioController.muted });
  syncAudio(audioController, state, [{ type: "run_started" }], 0);
}

hud.startButton?.addEventListener(
  "click",
  async () => {
    if (startRequested) return;
    startRequested = true;
    await beginRun();
  },
  { once: true },
);

hud.restartButton?.addEventListener("click", () => {
  resetRun();
});

hud.muteButton?.addEventListener("click", () => {
  setMuted(audioController, !audioController.muted);
  syncHud(hud, state, { fps: frameCounter.fps }, undefined, { muted: audioController.muted });
});

window.addEventListener("resize", resize);

function frame(now) {
  if (state.gameOver && input.consumeAnyPress(["r"])) {
    resetRun();
  }

  const dt = Math.min(0.033, (now - previous) / 1000);
  previous = now;

  advanceFrame(state, world, input, cameraController, frameCounter, dt);
  const events = drainFrameEvents(state);
  syncHud(hud, state, { fps: frameCounter.fps }, undefined, { muted: audioController.muted });
  renderFrame(sceneView, state, dt);
  syncAudio(audioController, state, events, dt);
  requestAnimationFrame(frame);
}

syncHud(hud, state, { fps: 0 }, undefined, { muted: audioController.muted });

shell.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});
