import { Quaternion, Vector3 } from 'three';
import { flightPathAngle } from './aircraft-envelope.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const direction = new Vector3(), inverse = new Quaternion();

export function projectFlightDirection(heading, elevation, camera, point) {
  const horizontal = Math.cos(elevation);
  direction.set(Math.sin(heading) * horizontal, Math.sin(elevation), -Math.cos(heading) * horizontal).applyQuaternion(inverse.copy(camera.quaternion).invert());
  const depth = -direction.z;
  const projection = camera.projectionMatrix.elements;
  const divisor = Math.max(.001, depth);
  point.x = direction.x * projection[0] / divisor;
  point.y = direction.y * projection[5] / divisor;
  return depth > 0;
}

export class AircraftMouseAim {
  heading = 0;
  elevation = 0;
  strength = 1;
  engaged = false;
  point = { x: 0, y: 0 };

  reset(flight) {
    this.heading = flight.trackHeading;
    this.elevation = flightPathAngle(flight);
    this.engaged = false;
  }

  move(dx, dy, camera, width, height) {
    if ((!dx && !dy) || !Number.isFinite(dx + dy) || !(width > 0 && height > 0)) return;
    projectFlightDirection(this.heading, this.elevation, camera, this.point);
    const x = clamp(clamp(this.point.x, -.85, .85) + dx * 2 / width, -.85, .85);
    const y = clamp(clamp(this.point.y, -.76, .76) - dy * 2 / height, -.76, .76);
    const projection = camera.projectionMatrix.elements;
    direction.set(x / projection[0], y / projection[5], -1).applyQuaternion(camera.quaternion);
    this.heading = Math.atan2(direction.x, -direction.z);
    this.elevation = clamp(Math.atan2(direction.y, Math.hypot(direction.x, direction.z)), -1.35, 1.35);
    this.engaged = true;
  }
}

const guidance = { pitch: 0, roll: 0, yaw: 0, override: 0 };

export function aircraftAimControls(flight, aim, baseStall, gravity, density, airspeed) {
  if (!aim || !Number.isFinite(aim.heading) || !Number.isFinite(aim.elevation)) return null;
  const strength = Number.isFinite(aim.strength) ? clamp(aim.strength, .1, 1) : 1;
  const headingError = wrap(aim.heading - flight.trackHeading);
  const path = flightPathAngle(flight), pathError = aim.elevation - path;
  guidance.override = clamp(Math.max(Math.abs(headingError), Math.abs(pathError)) / .3, 0, 1);
  if (flight.onGround) {
    guidance.pitch = clamp(aim.elevation * 7 * strength, -1, 1);
    guidance.roll = 0;
    guidance.yaw = clamp(headingError * 3 * strength, -1, 1);
    return guidance;
  }

  const { performance, speed, roll, pitch, sideslip } = flight;
  const bankLimit = Math.min(performance.bankLimit, .95, Math.acos(Math.min(1, (baseStall * 1.1 / Math.max(1, airspeed)) ** 2)));
  guidance.roll = clamp(headingError * 2.1 * strength, -bankLimit, bankLimit) / performance.bankLimit;
  guidance.yaw = clamp(headingError * .95 * strength - sideslip * 2.4, -.55, .55);
  const bankCos = Math.max(.45, Math.cos(roll));
  const verticalLift = Math.max(.4, bankCos * Math.cos(pitch));
  const verticalGoal = clamp(speed * Math.cos(path) * pathError * strength, -gravity, (performance.loadLimit - 1) * gravity);
  const liftToAdd = (gravity + verticalGoal) / verticalLift - gravity;
  const angleLimit = performance.stallAngle * .63;
  const angle = Math.asin(clamp(liftToAdd / Math.max(1, speed * density * performance.flightPath), -Math.sin(performance.negativeStallAngle * .63), Math.sin(angleLimit)));
  const compensation = Math.atan(Math.tan(angle) / bankCos);
  const unloading = clamp((baseStall * 1.1 - airspeed) / baseStall, 0, 1);
  const desiredPitch = path + compensation * (1 - unloading) - unloading * angleLimit;
  guidance.pitch = clamp((desiredPitch - .018) / performance.pitchLimit, -1, 1);
  return guidance;
}
