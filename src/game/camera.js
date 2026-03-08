import { clamp, lerp } from "./math.js";

export function createCameraController(camera) {
  return {
    camera,
    yaw: -0.75,
    pitch: 0.62,
    distance: 20,
    target: { x: 0, y: 2, z: 0 },
  };
}

export function updateCamera(controller, input, state, dt) {
  const look = input.consumeLook();
  const wheel = input.consumeWheel();

  controller.yaw -= look.x * 0.0035;
  controller.pitch = clamp(controller.pitch - look.y * 0.0025, 0.3, 1.1);
  controller.distance = clamp(controller.distance + wheel * 0.01, 8, 28);

  const target =
    state.player.mode === "vehicle"
      ? { x: state.player.x, y: 2.1, z: state.player.z }
      : { x: state.player.x, y: 1.6, z: state.player.z };

  const followHeading = state.player.mode === "vehicle" ? state.player.heading : state.player.heading - 0.25;
  controller.yaw = lerp(controller.yaw, followHeading, dt * (state.player.mode === "vehicle" ? 1.4 : 0.65));
  controller.target.x = lerp(controller.target.x, target.x, dt * 6);
  controller.target.y = lerp(controller.target.y, target.y, dt * 5);
  controller.target.z = lerp(controller.target.z, target.z, dt * 6);

  const flatDistance = Math.cos(controller.pitch) * controller.distance;
  const desiredX = controller.target.x - Math.cos(controller.yaw) * flatDistance;
  const desiredY = controller.target.y + Math.sin(controller.pitch) * controller.distance;
  const desiredZ = controller.target.z - Math.sin(controller.yaw) * flatDistance;

  controller.camera.position.x = lerp(controller.camera.position.x, desiredX, dt * 7);
  controller.camera.position.y = lerp(controller.camera.position.y, desiredY, dt * 7);
  controller.camera.position.z = lerp(controller.camera.position.z, desiredZ, dt * 7);
  controller.camera.lookAt(
    controller.target.x + Math.cos(controller.yaw) * 3,
    controller.target.y + 0.6,
    controller.target.z + Math.sin(controller.yaw) * 3,
  );
}
