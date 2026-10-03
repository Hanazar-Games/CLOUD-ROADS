import type { VehicleBody, VehiclePhysics } from './VehiclePhysics';
import { suspensionTuning, vehicleOffset } from './VehicleConfig';

export interface VehicleSolid extends VehicleBody { width: number; bottom: number; top: number }

export function vehicleSolids(car: VehiclePhysics): VehicleSolid[] {
  const p = car.profile, ride = p.radius + p.rest - 9.81 / suspensionTuning(3, p).spring;
  const bodies = car.bodies(), body = bodies[0], solids: VehicleSolid[] = [];
  const add = (pose: VehicleBody, front: number, rear: number, top: number, width = p.width, bottom = -ride + 0.12) => {
    solids.push({ ...pose, front, rear, width, bottom, top });
  };
  const passenger = ['sedan', 'suv', 'supercar', 'roadster'].includes(p.shape);
  if (passenger) {
    const sill = p.shape === 'supercar' ? 0.145 : p.shape === 'roadster' ? 0.22 : 0.28;
    add(body, body.front, body.rear, sill);
    if (p.shape !== 'roadster') add(body, p.body === 'limousine' ? 2.1 : p.body === 'pickup' ? 1.15 : 0.55,
      p.body === 'limousine' ? -2.2 : p.body === 'pickup' ? -0.2 : p.shape === 'suv' || p.body === 'hatchback' ? body.rear + 0.3 : -1.1, p.height - ride, p.width - 0.16);
    else {
      add(body, 0.5, -0.95, 0.43, p.width - 0.3);
      if (car.roofOpen < 0.05) add(body, 0.625, -1.225, 1.1225, 1.63, 1.05);
    }
  } else if (p.shape === 'motorcycle') {
    add(body, body.front, body.rear, 0.4, 0.42);
    if (p.edition === 'touring') add(body, -0.205, -0.855, 0.56, 1.02, 0.16);
  } else if (p.shape === 'bus') add(body, body.front, body.rear, p.height - ride);
  else {
    const back = body.front - (p.chassisLength > 6 ? 2.5 : 2);
    add(body, body.front, back, p.body === 'camper' ? p.height - ride : Math.min(p.height - ride, p.eye.y + 0.4));
    add(body, back, body.rear, p.shape === 'tractor' ? 0.2 : p.shape === 'flatbed' ? 0.38 : p.shape === 'crane' ? 0.75 : p.height - ride);
    if (p.edition === 'logging') add(body, body.front - 3.1, body.rear + 0.5, 1.62, 1.98, 0.38);
    if (p.edition === 'maintenance') {
      add(body, 0.1, -0.5, 1.05, p.width * 0.76, 0.38);
      add(body, body.rear + 0.4, body.rear + 0.24, 1.975, p.width * 0.8, 0.38);
    }
  }
  for (const [i, config] of (p.trailers ?? []).entries()) {
    const trailer = bodies[i + 1];
    add(trailer, trailer.front, trailer.rear, config.body === 'flatbed' || config.body === 'stake' ? 0.37 : p.height - ride);
    if (config.body === 'stake') for (const side of [-1, 1]) {
      const offset = vehicleOffset(side * (p.width / 2 - 0.03), 0, trailer.pitch, trailer.roll);
      add({ ...trailer, x: trailer.x + Math.cos(trailer.heading) * offset.x - Math.sin(trailer.heading) * offset.z,
        y: trailer.y + offset.y, z: trailer.z + Math.sin(trailer.heading) * offset.x + Math.cos(trailer.heading) * offset.z },
      trailer.front, trailer.rear, p.height - ride, 0.06, 0.37);
    }
  }
  return solids;
}

export function solidHeight(solid: VehicleSolid, x: number, z: number, height = solid.top): number {
  const dx = x - solid.x, dz = z - solid.z;
  const lateral = dx * Math.cos(solid.heading) + dz * Math.sin(solid.heading);
  const along = dx * Math.sin(solid.heading) - dz * Math.cos(solid.heading);
  return solid.y + height / (Math.cos(solid.pitch) * Math.cos(solid.roll))
    + along * Math.tan(solid.pitch) + lateral * Math.tan(solid.roll) / Math.cos(solid.pitch);
}

export function vehicleSupport(car: VehiclePhysics, x: number, z: number, ceiling: number): number | undefined {
  if (Math.hypot(x - car.x, z - car.z) > car.profile.length + 3) return;
  let result: number | undefined;
  for (const solid of vehicleSolids(car)) {
    const dx = x - solid.x, dz = z - solid.z;
    const lateral = dx * Math.cos(solid.heading) + dz * Math.sin(solid.heading);
    const along = dx * Math.sin(solid.heading) - dz * Math.cos(solid.heading);
    if (Math.abs(lateral) > solid.width / 2 || along < solid.rear || along > solid.front) continue;
    const height = solidHeight(solid, x, z);
    if (height <= ceiling + 1e-6 && (result === undefined || height > result)) result = height;
  }
  return result;
}
