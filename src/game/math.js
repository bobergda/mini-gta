export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const angleWrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
export const distance2D = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const sign = (value) => (value < 0 ? -1 : 1);

export function vec2FromAngle(angle, length = 1) {
  return { x: Math.cos(angle) * length, z: Math.sin(angle) * length };
}

export function projectLocalVelocity(heading, vx, vz) {
  const forward = { x: Math.cos(heading), z: Math.sin(heading) };
  const right = { x: -Math.sin(heading), z: Math.cos(heading) };
  return {
    forward: vx * forward.x + vz * forward.z,
    lateral: vx * right.x + vz * right.z,
  };
}

export function composeVelocity(heading, forwardSpeed, lateralSpeed = 0) {
  const forward = { x: Math.cos(heading), z: Math.sin(heading) };
  const right = { x: -Math.sin(heading), z: Math.cos(heading) };
  return {
    x: forward.x * forwardSpeed + right.x * lateralSpeed,
    z: forward.z * forwardSpeed + right.z * lateralSpeed,
  };
}

export function approach(current, target, delta) {
  if (current < target) return Math.min(current + delta, target);
  return Math.max(current - delta, target);
}
