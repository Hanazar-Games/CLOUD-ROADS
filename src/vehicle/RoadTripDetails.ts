import type { Group } from 'three';
import type { VehicleProfile } from './VehicleConfig';
import type { VehicleDetailKit } from './VehicleDetails';

export function roadTripDetails(p: VehicleProfile, parent: Group, kit: VehicleDetailKit, rideHeight: number): void {
  const { block, panel, cylinder, trim, paint, metal, amber, glass, wood } = kit;
  const top = p.height - rideHeight, end = p.chassisLength / 2, w = p.width;
  const box = (width: number, height: number, length: number, x: number, y: number, z: number, material = metal) =>
    block(width, height, length, x, y, z, material, parent);
  const doors = parent.children.filter(child => child.name === 'operation-doors') as Group[];
  if (p.edition === 'taxi') {
    panel(0.55, 0.13, 0.24, 0, top + 0.04, 0, amber, parent);
    for (const door of doors) for (let i = 0; i < 5; i++)
      block(0.035, 0.085, 0.11, Math.sign(door.position.x) * 0.04, 0.1, 0.3 + i * 0.12, i % 2 ? metal : trim, door);
    box(0.25, 0.1, 0.12, w * 0.32, p.eye.y - 0.23, -p.eye.along - 0.65, trim);
    box(0.19, 0.05, 0.015, w * 0.32, p.eye.y - 0.21, -p.eye.along - 0.58, amber);
  } else if (p.edition === 'surf') {
    for (const z of [-0.5, 0.9]) box(w * 0.85, 0.04, 0.08, 0, top + 0.025, z, trim);
    for (const side of [-1, 1]) {
      panel(0.52, 0.07, 2.5, side * 0.34, top + 0.08, 0.25, side < 0 ? wood : paint, parent);
      for (const z of [-0.5, 0.9]) box(0.54, 0.014, 0.045, side * 0.34, top + 0.123, z, trim);
    }
  } else if (p.edition === 'patrol') {
    box(w * 0.62, 0.045, 0.24, 0, top + 0.025, 0, trim);
    for (const door of doors) block(0.025, 0.16, 0.72, Math.sign(door.position.x) * 0.044, 0.02, 0.5, metal, door);
    for (const side of [-1, 1]) {
      box(0.08, 0.38, 0.08, side * 0.6, -0.05, -end - 0.06, trim);
    }
    box(1.35, 0.09, 0.11, 0, 0.13, -end - 0.06, metal);
  } else if (p.edition === 'parcel' || p.edition === 'livestock') {
    const start = -end + 2.65, length = end - start, center = (start + end) / 2;
    for (const side of [-1, 1]) {
      box(0.032, 0.28, length * 0.8, side * (w / 2 + 0.016), 0.9, center, p.edition === 'parcel' ? amber : trim);
      if (p.edition === 'parcel') {
        for (const y of [0.5, top - 0.15]) box(0.035, 0.045, length * 0.8, side * (w / 2 + 0.02), y, center, metal);
        box(0.055, 0.22, 0.06, side * (w / 2 + 0.035), 0.9, start + 0.4, trim);
      } else for (let z = start + 0.45; z < end - 0.25; z += 0.6) {
        box(0.035, 0.65, 0.42, side * (w / 2 + 0.02), top - 0.55, z, trim);
        for (let y = top - 0.8; y < top - 0.24; y += 0.14) box(0.05, 0.065, 0.43, side * (w / 2 + 0.04), y, z, metal);
      }
    }
    if (p.edition === 'livestock') for (const z of [center - 0.8, center + 0.8]) {
      cylinder(0.22, 0.1, 0, top + 0.06, z, trim, parent);
      cylinder(0.28, 0.035, 0, top + 0.12, z, metal, parent);
    }
  } else if (p.edition === 'adventure') {
    for (const x of [-0.53, 0.53]) {
      box(0.9, 0.055, 2.1, x, top + 0.06, 0.6, trim);
      for (let z = -0.3; z < 1.65; z += 0.3) box(0.84, 0.01, 0.265, x, top + 0.095, z, glass);
    }
    const gate = parent.children.find(child => child.name === 'operation-cargo' && child.position.x < 0) as Group;
    for (const x of [-0.3, 0.3]) block(0.045, 1.55, 0.055, w / 4 + x, top - 0.85 - gate.position.y, 0.13, metal, gate);
    for (let y = top - 1.5; y < top - 0.1; y += 0.25) block(0.6, 0.04, 0.06, w / 4, y - gate.position.y, 0.14, metal, gate);
    box(w * 0.8, 0.08, 0.3, 0, -0.15, end + 0.06, trim);
  } else if (p.edition === 'panorama') {
    for (const side of [-1, 1]) for (let z = -end + 2.5; z < end - 0.8; z += 1.1) {
      if (z < -0.3 || z > 2.7) {
        box(0.8, 0.035, 0.97, side * 0.58, top + 0.02, z, trim);
        box(0.7, 0.018, 0.87, side * 0.58, top + 0.045, z, glass);
      }
      box(0.028, 0.12, 0.72, side * (w / 2 + 0.014), 0.5, z, metal);
    }
  } else if (p.edition === 'logging') {
    const start = -end + 2.85, center = (start + end - 0.25) / 2, length = end - start - 0.5;
    for (const side of [-1, 1]) for (const z of [start + 0.25, end - 0.55]) {
      box(0.12, 1.75, 0.14, side * (w / 2 - 0.13), 1.16, z, metal);
      box(w - 0.12, 0.13, 0.16, 0, 0.41, z, trim);
    }
    for (const [x, y] of [[-0.68, 0.72], [0, 0.72], [0.68, 0.72], [-0.34, 1.3], [0.34, 1.3]]) {
      const log = cylinder(0.31, length, x, y, center, wood, parent); log.rotation.x = Math.PI / 2;
      for (const offset of [-1, 1]) {
        const ring = cylinder(0.21, 0.012, x, y, center + offset * (length / 2 + 0.008), trim, parent); ring.rotation.x = Math.PI / 2;
        const core = cylinder(0.18, 0.016, x, y, center + offset * (length / 2 + 0.012), wood, parent); core.rotation.x = Math.PI / 2;
      }
    }
    for (const z of [start + 0.8, end - 0.95]) box(1.5, 0.035, 0.055, 0, 1.62, z, amber);
  } else if (p.edition === 'maintenance') {
    const center = 0.8;
    box(w * 0.76, 0.7, 0.6, 0, 0.7, center - 0.6, metal);
    for (const x of [-0.55, 0, 0.55]) {
      box(0.4, 0.05, 0.4, x, 0.4, center + 0.2, trim);
      cylinder(0.04, 0.5, x, 0.67, center + 0.2, amber, parent, 0.17);
      box(0.25, 0.07, 0.25, x, 0.57, center + 0.2, metal);
    }
    for (const side of [-1, 1]) box(0.08, 1.5, 0.08, side * w * 0.35, 1.08, end - 0.32, metal);
    box(w * 0.8, 0.55, 0.1, 0, 1.7, end - 0.32, trim);
    for (let i = -3; i <= 3; i++) box(0.12, 0.12, 0.025, i * 0.18, 1.7, end - 0.254, amber);
  } else if (p.edition === 'touring') {
    for (const side of [-1, 1]) {
      panel(0.26, 0.4, 0.65, side * 0.38, 0.36, 0.53, paint, parent);
      box(0.27, 0.045, 0.65, side * 0.38, 0.52, 0.53, trim);
      box(0.04, 0.06, 0.15, side * 0.518, 0.48, 0.53, metal);
      box(0.015, 0.07, 0.35, side * 0.518, 0.29, 0.63, amber);
    }
    const screen = box(0.52, 0.48, 0.025, 0, 0.88, -0.57, glass); screen.rotation.x = -0.18;
    for (const side of [-1, 1]) box(0.24, 0.09, 0.14, side * 0.37, 0.66, -0.45, trim);
  }
}
