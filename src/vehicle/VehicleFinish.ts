import type { Group } from 'three';
import type { VehicleProfile } from './VehicleConfig';
import { cabStepZ, type VehicleDetailKit } from './VehicleDetails';

export function vehicleFinish(p: VehicleProfile, parent: Group, kit: VehicleDetailKit, rideHeight: number): void {
  const { block, panel, cylinder, paint, trim, metal } = kit;
  const w = p.width, nose = -p.chassisLength / 2, end = -nose, top = p.height - rideHeight;
  if (p.shape === 'motorcycle') {
    cylinder(0.055, 0.018, 0, 0.419, -0.16, metal, parent);
    for (const side of [-1, 1]) {
      const cover = cylinder(0.115, 0.04, side * 0.16, -0.13, 0.12, metal, parent); cover.rotation.z = Math.PI / 2;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        const bolt = cylinder(0.013, 0.046, side * 0.18, -0.13 + Math.sin(a) * 0.08, 0.12 + Math.cos(a) * 0.08, trim, parent); bolt.rotation.z = Math.PI / 2;
      }
      const line = block(0.016, 0.62, 0.016, side * 0.17, -0.03, -0.64, trim, parent); line.rotation.x = -0.25;
      block(0.1, 0.018, 0.025, side * 0.31, 0.6, -0.55, metal, parent);
      for (let z = 0.22; z < 0.68; z += 0.08) panel(0.045, 0.026, 0.024, side * 0.18, 0.403, z, trim, parent);
    }
    return;
  }
  const passenger = ['roadster', 'sedan', 'suv', 'supercar'].includes(p.shape);
  const sport = p.shape === 'supercar' || p.shape === 'roadster' || p.body === 'coupe' || p.body === 'rally';
  // Recessed radiator and split bumper keep the lights and registration plate exposed.
  const grilleWidth = w * (sport ? 0.4 : 0.52), grilleY = passenger ? -0.04 : 0.28, grilleHeight = passenger ? 0.12 : 0.35;
  panel(grilleWidth + 0.055, grilleHeight + 0.045, 0.055, 0, grilleY, nose - 0.035, metal, parent);
  panel(grilleWidth, grilleHeight, 0.06, 0, grilleY, nose - 0.046, trim, parent);
  for (let x = -grilleWidth / 2 + 0.06; x < grilleWidth / 2; x += sport ? 0.12 : 0.09)
    block(0.012, grilleHeight - 0.025, 0.018, x, grilleY, nose - 0.083, metal, parent);
  for (const side of [-1, 1]) {
    panel(w * 0.29, passenger ? 0.13 : 0.2, 0.16, side * w * 0.32, -0.2, nose + 0.012, passenger ? paint : metal, parent);
    panel(w * 0.27, 0.11, 0.14, side * w * 0.32, -0.21, end + 0.005, trim, parent);
    panel(0.1, 0.055, 0.02, side * w * 0.29, -0.25, nose - 0.073, trim, parent);
  }
  if (passenger) {
    const cabFront = p.shape === 'roadster' ? -0.74 : p.body === 'limousine' ? -2.45 : p.body === 'pickup' ? -1.35 : -0.8;
    const hoodY = p.shape === 'roadster' ? 0.167 : p.shape === 'supercar' ? 0.187 : 0.287;
    const hoodLength = cabFront - nose - 0.35;
    for (const side of [-1, 1]) {
      const ridge = panel(0.065, 0.018, hoodLength, side * w * 0.25, hoodY, (nose + cabFront) / 2, paint, parent);
      ridge.rotation.y = side * 0.045;
      for (let i = 0; sport && i < 4; i++) block(0.17, 0.01, 0.025, side * w * 0.31, hoodY + 0.006, cabFront - 0.3 - i * 0.08, trim, parent);
      if (p.shape === 'suv') {
        panel(w * 0.15, 0.07, 0.15, side * w * 0.3, -0.31, nose + 0.06, metal, parent);
      }
    }
    if (sport) for (const x of [-0.5, -0.25, 0.25, 0.5]) panel(0.025, 0.095, 0.24, x, -0.3, end - 0.04, trim, parent);
    return;
  }
  if (p.bus) {
    for (const z of [nose + 1.9, end - 0.6]) {
      panel(0.72, 0.07, 0.8, 0, top + 0.015, z, metal, parent);
      panel(0.56, 0.025, 0.64, 0, top + 0.058, z, trim, parent);
    }
    for (let z = 0.45; z < 2; z += 0.14) block(w * 0.59, 0.018, 0.04, 0, top + 0.07, z, trim, parent);
    panel(w * 0.58, 0.44, 0.04, 0, 0.38, end + 0.025, trim, parent);
    for (let y = 0.23; y < 0.6; y += 0.065) block(w * 0.54, 0.022, 0.05, 0, y, end + 0.04, metal, parent);
    return;
  }
  const cabRoof = p.body === 'van' ? top : Math.min(top, p.eye.y + 0.4);
  panel(w * 0.56, 0.065, 0.7, 0, cabRoof + 0.015, nose + 1.2, paint, parent);
  for (const side of [-1, 1]) {
    for (const y of [-0.43, -0.6]) for (const offset of [-0.1, 0, 0.1])
      block(0.19, 0.014, 0.025, side * (w / 2 + 0.035), y + 0.034, cabStepZ(p) + offset, trim, parent);
    const intake = panel(0.2, 0.48, 0.09, side * w * 0.39, 0.33, nose + 0.02, trim, parent);
    intake.rotation.y = -side * 0.15;
    for (let y = 0.15; y < 0.55; y += 0.08) block(0.16, 0.018, 0.025, side * w * 0.39, y, nose - 0.03, metal, parent);
  }
}
