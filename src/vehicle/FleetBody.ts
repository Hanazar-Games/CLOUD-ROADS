import type { Group } from 'three';
import type { VehicleProfile } from './VehicleConfig';
import type { VehicleDetailKit } from './VehicleDetails';
import type { VehicleFittings } from './VehicleFittings';

export function fleetBody(p: VehicleProfile, parent: Group, kit: VehicleDetailKit, fittings: VehicleFittings, rideHeight: number): void {
  if (!p.body) return;
  const { block, cylinder, paint, trim, metal, glass, amber } = kit;
  const end = p.length / 2, top = p.height - rideHeight, start = -end + (p.length > 6 ? 2.65 : 2.15);
  const length = end - start, middle = (start + end) / 2, w = p.width;
  if (p.body === 'hatchback' || p.body === 'wagon') {
    block(w * 0.86, 0.055, 0.22, 0, top - 0.04, end - 0.24, trim, parent);
    block(0.04, 0.025, 0.45, 0, top * 0.62, end - 0.13, metal, parent);
    if (p.body === 'wagon') for (const z of [-0.2, 1.2]) block(w * 0.86, 0.04, 0.06, 0, top + 0.055, z, metal, parent);
  } else if (p.body === 'pickup') {
    block(w - 0.2, 0.09, end - 0.45, 0, -0.2, (end + 0.45) / 2, trim, parent);
    for (const x of [-1, 1]) {
      block(0.08, 0.09, end - 0.35, x * (w / 2 - 0.06), 0.24, (end + 0.35) / 2, trim, parent);
      block(0.09, 0.55, 0.08, x * w * 0.37, 0.5, 0.58, metal, parent);
    }
    block(w * 0.76, 0.08, 0.08, 0, 0.78, 0.58, metal, parent);
    const gate = fittings.hinge('cargo', parent, 0, -0.17, end - 0.08, 'x', Math.PI / 2);
    block(w - 0.15, 0.38, 0.08, 0, 0.19, 0, paint, gate);
    block(0.28, 0.05, 0.09, 0, 0.3, 0.02, metal, gate);
  } else if (p.body === 'tanker') {
    const radius = Math.min(w * 0.44, (top - 0.35) / 2);
    const tank = cylinder(radius, length - 0.3, 0, 0.3 + radius, middle, metal, parent); tank.rotation.x = Math.PI / 2;
    for (const z of [start + 0.25, middle, end - 0.25]) {
      block(w - 0.15, 0.17, 0.18, 0, 0.12, z, trim, parent);
      cylinder(0.22, 0.1, 0, 0.38 + radius * 2, z, paint, parent);
    }
    for (const x of [-0.65, 0.65]) block(0.07, 0.1, length - 0.3, x, 0.3 + radius * 2, middle, metal, parent);
    for (let y = 0.1; y < top - 0.2; y += 0.28) block(0.55, 0.05, 0.05, 0, y, end - 0.03, metal, parent);
    for (const x of [-0.3, 0.3]) block(0.05, top - 0.25, 0.05, x, (top - 0.25) / 2, end - 0.03, metal, parent);
  } else if (p.body === 'dumptruck') {
    const bed = fittings.hinge('cargo', parent, 0, 0.28, end - 0.1, 'x', 0.72), l = length - 0.15, h = top - 0.45;
    block(w - 0.12, 0.16, l, 0, 0, -l / 2, paint, bed);
    for (const x of [-1, 1]) {
      block(0.1, h, l, x * (w / 2 - 0.06), h / 2, -l / 2, paint, bed);
      for (let z = -l + 0.2; z < 0; z += 0.65) block(0.13, h, 0.07, x * (w / 2 - 0.03), h / 2, z, metal, bed);
    }
    for (const z of [-l, 0]) block(w - 0.12, h, 0.1, 0, h / 2, z, paint, bed);
    block(w - 0.05, 0.08, 0.55, 0, h, -l + 0.12, paint, bed);
  } else if (p.body === 'firetruck') {
    block(w - 0.1, top - 0.42, length, 0, (top + 0.12) / 2, middle, paint, parent);
    for (const side of [-1, 1]) for (let z = start + 0.55; z < end - 0.25; z += 1.2) {
      block(0.055, 1.05, 1.04, side * w / 2, 1, z, metal, parent);
      for (let y = 0.5; y < 1.5; y += 0.12) block(0.065, 0.025, 1, side * (w / 2 + 0.005), y, z, trim, parent);
      block(0.08, 0.04, 0.35, side * (w / 2 + 0.025), 0.58, z, trim, parent);
    }
    for (const x of [-0.43, 0.43]) block(0.09, 0.12, length - 0.25, x, top - 0.04, middle, metal, parent);
    for (let z = start + 0.25; z < end - 0.1; z += 0.32) block(0.86, 0.065, 0.06, 0, top - 0.02, z, metal, parent);
    for (const side of [-1, 1]) block(0.06, 0.15, length, side * w / 2, 0.35, middle, amber, parent);
  } else if (p.body === 'citybus') {
    block(w * 0.7, 0.23, 0.04, 0, top - 0.28, -end - 0.02, trim, parent);
    for (let x = -0.6; x <= 0.6; x += 0.15) block(0.07, 0.08, 0.046, x, top - 0.28, -end - 0.02, amber, parent);
    for (const side of [-1, 1]) block(0.075, 0.14, p.length - 1.6, side * w / 2, 0.24, 0.5, metal, parent);
    for (const z of [-1.5, 0.5, 2.5]) {
      block(0.035, 1.35, 0.035, -0.25, p.eye.y - 0.1, z, amber, parent);
      block(0.035, 0.035, 1.8, -0.25, p.eye.y + 0.53, z, amber, parent);
    }
  } else {
    for (const side of [-1, 1]) {
      block(0.07, 0.14, length - 0.2, side * w / 2, 0.87, middle, p.body === 'ambulance' ? amber : metal, parent);
      if (p.body !== 'van') for (const z of [middle - 0.6, middle + 0.8]) {
        block(0.075, 0.66, 0.86, side * w / 2, top - 0.65, z, trim, parent);
        block(0.08, 0.55, 0.75, side * w / 2, top - 0.65, z, glass, parent);
      }
      if (p.body === 'ambulance') {
        block(0.09, 0.55, 0.14, side * w / 2, 1.3, start + 0.5, amber, parent);
        block(0.09, 0.14, 0.55, side * w / 2, 1.3, start + 0.5, amber, parent);
      }
      if (p.body === 'van') for (const z of [start + 0.05, middle + 0.3]) block(0.08, top - 0.7, 0.022, side * w / 2, (top + 0.7) / 2, z, trim, parent);
    }
    if (p.body === 'camper') {
      block(w - 0.1, 0.35, 1.5, 0, top - 0.13, start - 0.7, paint, parent);
      block(0.16, 0.14, length - 0.3, w / 2 + 0.04, top - 0.18, middle, trim, parent);
      block(0.6, 0.025, 0.7, 0, top + 0.055, middle, glass, parent);
    }
  }
}
