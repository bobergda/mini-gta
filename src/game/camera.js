import { CAMERA_CONFIG } from "./config.js";
import { angleLerp, clamp, lerp } from "./math.js";

export function createCameraController(camera) {
  return {
    camera,
    yaw: CAMERA_CONFIG.onFoot.baseYaw,
    pitch: CAMERA_CONFIG.onFoot.basePitch,
    distance: CAMERA_CONFIG.onFoot.baseDistance,
    target: { x: 0, y: 2, z: 0 },
    recenterTimer: 0,
    followYaw: CAMERA_CONFIG.onFoot.baseYaw,
    movementCarry: 0,
  };
}

export function updateCamera(controller, input, state, dt) {
  const look = input.consumeLook();
  const wheel = input.consumeWheel();
  const lookMagnitude = Math.abs(look.x) + Math.abs(look.y);
  const significantManualLook = lookMagnitude > CAMERA_CONFIG.manualLookDeadZone;
  const driving = state.player.mode === "vehicle";
  const onFootMoving = !driving && state.player.speed > CAMERA_CONFIG.onFoot.moveThreshold;
  const onFootHeading = state.player.moveHeading ?? state.player.heading;

  controller.yaw -= look.x * CAMERA_CONFIG.lookSensitivityX;
  controller.pitch = clamp(
    controller.pitch - look.y * CAMERA_CONFIG.lookSensitivityY,
    0.28,
    1.08,
  );
  controller.distance = clamp(
    controller.distance + wheel * CAMERA_CONFIG.zoomSensitivity,
    CAMERA_CONFIG.zoomMin,
    CAMERA_CONFIG.zoomMax,
  );
  controller.recenterTimer = significantManualLook
    ? CAMERA_CONFIG.recenterDelay
    : Math.max(0, controller.recenterTimer - dt);

  const target = driving
    ? {
        x: state.player.x,
        y: CAMERA_CONFIG.driving.targetHeight,
        z: state.player.z,
      }
    : {
        x: state.player.x + state.player.vx * CAMERA_CONFIG.onFoot.velocityLead,
        y: CAMERA_CONFIG.onFoot.targetHeight,
        z: state.player.z + state.player.vz * CAMERA_CONFIG.onFoot.velocityLead,
      };

  if (!driving) {
    if (onFootMoving) {
      controller.followYaw = angleLerp(
        controller.followYaw,
        onFootHeading,
        dt * CAMERA_CONFIG.onFoot.followHeadingLerp,
      );
      controller.movementCarry = CAMERA_CONFIG.onFoot.followCarry;
    } else {
      controller.movementCarry = Math.max(0, controller.movementCarry - dt);
    }
  }

  if (driving && controller.recenterTimer === 0) {
    controller.yaw = angleLerp(
      controller.yaw,
      state.player.heading + CAMERA_CONFIG.driving.autoYawOffset,
      dt * CAMERA_CONFIG.driving.autoYawLerp,
    );
    controller.pitch = lerp(
      controller.pitch,
      CAMERA_CONFIG.driving.autoPitch,
      dt * CAMERA_CONFIG.driving.autoPitchLerp,
    );
    controller.distance = lerp(
      controller.distance,
      CAMERA_CONFIG.driving.autoDistance,
      dt * CAMERA_CONFIG.driving.autoDistanceLerp,
    );
  } else if ((onFootMoving || controller.movementCarry > 0) && controller.recenterTimer === 0) {
    controller.yaw = angleLerp(
      controller.yaw,
      controller.followYaw,
      dt * CAMERA_CONFIG.onFoot.autoYawLerp,
    );
    controller.pitch = lerp(
      controller.pitch,
      CAMERA_CONFIG.onFoot.autoPitch,
      dt * CAMERA_CONFIG.onFoot.autoPitchLerp,
    );
    controller.distance = lerp(
      controller.distance,
      CAMERA_CONFIG.onFoot.autoDistance,
      dt * CAMERA_CONFIG.onFoot.autoDistanceLerp,
    );
  }

  controller.target.x = lerp(
    controller.target.x,
    target.x,
    dt * CAMERA_CONFIG.targetLerpXZ,
  );
  controller.target.y = lerp(
    controller.target.y,
    target.y,
    dt * CAMERA_CONFIG.targetLerpY,
  );
  controller.target.z = lerp(
    controller.target.z,
    target.z,
    dt * CAMERA_CONFIG.targetLerpXZ,
  );

  const flatDistance = Math.cos(controller.pitch) * controller.distance;
  const desiredX = controller.target.x - Math.cos(controller.yaw) * flatDistance;
  const desiredY = controller.target.y + Math.sin(controller.pitch) * controller.distance;
  const desiredZ = controller.target.z - Math.sin(controller.yaw) * flatDistance;
  const damageShake = state.feedback?.damageShake ?? 0;
  const shakePhase = state.time * CAMERA_CONFIG.damageShakeFrequency;
  const shakeOffsetX =
    Math.sin(shakePhase) * damageShake * CAMERA_CONFIG.damageShakeAmplitude;
  const shakeOffsetY =
    Math.cos(shakePhase * 1.3) * damageShake * CAMERA_CONFIG.damageShakeAmplitude * 0.5;
  const shakeOffsetZ =
    Math.sin(shakePhase * 0.82) * damageShake * CAMERA_CONFIG.damageShakeAmplitude;
  const movementPhase = state.time * (CAMERA_CONFIG.damageShakeFrequency * CAMERA_CONFIG.movementSwayFrequency);
  const movementSway =
    Math.min(1, state.player.speed / 28) * CAMERA_CONFIG.movementSwayAmplitude;
  const swayOffsetY = Math.sin(movementPhase) * movementSway;
  const swayOffsetX = Math.cos(movementPhase * 0.7) * movementSway * 0.35;

  controller.camera.position.x = lerp(
    controller.camera.position.x,
    desiredX + shakeOffsetX + swayOffsetX,
    dt * CAMERA_CONFIG.positionLerp,
  );
  controller.camera.position.y = lerp(
    controller.camera.position.y,
    desiredY + shakeOffsetY + swayOffsetY,
    dt * CAMERA_CONFIG.positionLerp,
  );
  controller.camera.position.z = lerp(
    controller.camera.position.z,
    desiredZ + shakeOffsetZ,
    dt * CAMERA_CONFIG.positionLerp,
  );

  const lookAhead = driving
    ? CAMERA_CONFIG.driving.lookAheadBase +
      Math.min(
        CAMERA_CONFIG.driving.lookAheadMaxBonus,
        state.player.speed * CAMERA_CONFIG.driving.lookAheadSpeedFactor,
      )
    : CAMERA_CONFIG.onFoot.lookAhead;

  controller.camera.lookAt(
    controller.target.x + Math.cos(controller.yaw) * lookAhead,
    controller.target.y + 0.6,
    controller.target.z + Math.sin(controller.yaw) * lookAhead,
  );
}
