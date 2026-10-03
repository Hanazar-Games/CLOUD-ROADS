import { constrainVehicle } from '../service/ServiceCollision';
import type { VehiclePhysics } from './VehiclePhysics';

export interface CollisionEvent { x: number; y: number; z: number; strength: number }

export function collideVehicles(a: VehiclePhysics, b: VehiclePhysics, previousX = a.x, previousZ = a.z): boolean {
  if (a === b || Math.hypot(a.x - b.x, a.z - b.z) > a.profile.length + b.profile.length + Math.hypot(a.x - previousX, a.z - previousZ) + 2) return false;
  const before = a.bodies(previousX, previousZ, true), radius = a.profile.width / 2;
  let dx = 0, dz = 0, depth = 1e-7, px = a.x, pz = a.z, py = a.y;
  for (const [i, body] of a.bodies().entries()) {
    const rear = body.rear + radius, front = Math.max(rear, body.front - radius), steps = Math.max(1, Math.ceil(front - rear));
    for (let j = 0; j <= steps; j++) {
      const along = rear + (front - rear) * j / steps;
      const point = { x: body.x + Math.sin(body.heading) * along, z: body.z - Math.cos(body.heading) * along };
      const x = point.x, z = point.z, old = before[i];
      if (!constrainVehicle(point, old.x + Math.sin(old.heading) * along, old.z - Math.cos(old.heading) * along,
        radius, body.y - a.profile.radius - a.profile.rest, b, a.profile.height)) continue;
      const distance = Math.hypot(point.x - x, point.z - z);
      if (distance > depth) { depth = distance; dx = point.x - x; dz = point.z - z; px = point.x; pz = point.z; py = body.y; }
    }
  }
  if (depth === 1e-7) return false;
  const nx = dx / depth, nz = dz / depth;
  a.x += dx; a.z += dz;
  for (const trailer of a.trailers) { trailer.x += dx; trailer.z += dz; }
  px -= nx * radius; pz -= nz * radius;
  const velocity = (car: VehiclePhysics) => ({ x: Math.sin(car.heading) * car.speed + Math.cos(car.heading) * car.lateralSpeed,
    z: -Math.cos(car.heading) * car.speed + Math.sin(car.heading) * car.lateralSpeed });
  const va = velocity(a), vb = velocity(b);
  const ma = a.parked ? 0 : 1 / a.profile.mass, mb = b.parked ? 0 : 1 / b.profile.mass;
  const ia = ma * 12 / (a.profile.chassisLength ** 2 + a.profile.width ** 2);
  const ib = mb * 12 / (b.profile.chassisLength ** 2 + b.profile.width ** 2);
  const ax = px - a.x, az = pz - a.z, bx = px - b.x, bz = pz - b.z;
  const relativeX = va.x - a.yawRate * az - vb.x + b.yawRate * bz;
  const relativeZ = va.z + a.yawRate * ax - vb.z - b.yawRate * bx;
  const inward = relativeX * nx + relativeZ * nz;
  if (inward >= -0.01 || ma + mb === 0) return true;
  const normalA = ax * nz - az * nx, normalB = bx * nz - bz * nx;
  const impulse = -inward * 1.06 / (ma + mb + normalA ** 2 * ia + normalB ** 2 * ib);
  const apply = (jx: number, jz: number) => {
    va.x += jx * ma; va.z += jz * ma; vb.x -= jx * mb; vb.z -= jz * mb;
    a.yawRate += (ax * jz - az * jx) * ia; b.yawRate -= (bx * jz - bz * jx) * ib;
  };
  apply(nx * impulse, nz * impulse);
  const tangentA = ax * nx + az * nz, tangentB = bx * nx + bz * nz;
  const sliding = -(va.x - a.yawRate * az - vb.x + b.yawRate * bz) * nz
    + (va.z + a.yawRate * ax - vb.z - b.yawRate * bx) * nx;
  const tangent = Math.max(-impulse * 0.12, Math.min(impulse * 0.12, -sliding / (ma + mb + tangentA ** 2 * ia + tangentB ** 2 * ib)));
  apply(-nz * tangent, nx * tangent);
  const event = { x: px, y: py, z: pz, strength: -inward };
  for (const [car, v, inverse] of [[a, va, ma], [b, vb, mb]] as const) {
    if (inverse) {
      car.speed = v.x * Math.sin(car.heading) - v.z * Math.cos(car.heading);
      car.lateralSpeed = v.x * Math.cos(car.heading) + v.z * Math.sin(car.heading);
      car.yawRate = Math.max(-0.8, Math.min(0.8, car.yawRate));
    }
    car.impact = Math.max(car.impact, -inward);
    car.scrape = Math.max(car.scrape, Math.abs(tangent) * inverse);
    if (-inward > 0.8) car.collision = event;
  }
  return true;
}
