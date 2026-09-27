import type { VehiclePhysics } from '../vehicle/VehiclePhysics';
import { solidHeight, vehicleSolids } from '../vehicle/VehicleSolids';

export interface Obstacle { x: number; z: number; heading: number; width: number; front: number; rear: number }

export function constrainVehicle(body: { x: number; z: number }, previousX: number, previousZ: number, radius: number, feet: number, car: VehiclePhysics, height = 1.75): boolean {
  const reach = car.profile.length + radius + 2;
  if (car.x < Math.min(body.x, previousX) - reach || car.x > Math.max(body.x, previousX) + reach
    || car.z < Math.min(body.z, previousZ) - reach || car.z > Math.max(body.z, previousZ) + reach) return false;
  let hit = false;
  for (const obstacle of vehicleSolids(car)) {
    const x = Math.max(obstacle.x - reach, Math.min(obstacle.x + reach, body.x));
    const z = Math.max(obstacle.z - reach, Math.min(obstacle.z + reach, body.z));
    if (feet >= solidHeight(obstacle, x, z) - 0.06 || feet + height < solidHeight(obstacle, x, z, obstacle.bottom)) continue;
    hit = constrainObstacle(body, previousX, previousZ, radius, obstacle) || hit;
  }
  return hit;
}

export function constrainObstacle(body: { x: number; z: number }, previousX: number, previousZ: number, radius: number, obstacle: Obstacle): boolean {
  const c = Math.cos(obstacle.heading), s = Math.sin(obstacle.heading), dx = body.x - obstacle.x, dz = body.z - obstacle.z;
  const x = dx * c + dz * s, a = dx * s - dz * c, w = obstacle.width / 2 + radius, front = obstacle.front + radius, rear = obstacle.rear - radius;
  const px = (previousX - obstacle.x) * c + (previousZ - obstacle.z) * s, pa = (previousX - obstacle.x) * s - (previousZ - obstacle.z) * c;
  let enter = -Infinity, leave = Infinity, axis = 0, edge = 0;
  for (const [i, p, next, min, max] of [[0, px, x, -w, w], [1, pa, a, rear, front]]) {
    const delta = next - p;
    if (Math.abs(delta) < 1e-10) { if (p <= min + 1e-8 || p >= max - 1e-8) return false; continue; }
    const near = ((delta > 0 ? min : max) - p) / delta, far = ((delta > 0 ? max : min) - p) / delta;
    if (near > enter) { enter = near; axis = i; edge = delta > 0 ? min : max; }
    leave = Math.min(leave, far);
  }
  if (enter > leave || leave <= 0 || enter > 1) return false;
  let nx = x, na = a;
  if (enter < 0) {
    const depth = Math.min(w - Math.abs(x), front - a, a - rear);
    if (depth <= 0 || depth < Math.min(w - Math.abs(px), front - pa, pa - rear) - 1e-8) return false;
    if (depth === w - Math.abs(x)) { axis = 0; edge = (Math.sign(x) || Math.sign(px) || 1) * w; }
    else { axis = 1; edge = front - a < a - rear ? front : rear; }
  }
  if (axis === 0) nx = edge; else na = edge;
  if (Math.hypot(nx - x, na - a) < 1e-8) return false;
  body.x = obstacle.x + nx * c + na * s; body.z = obstacle.z + nx * s - na * c; return true;
}
