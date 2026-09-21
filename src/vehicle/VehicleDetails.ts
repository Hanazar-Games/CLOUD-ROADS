import type { Group, Mesh, MeshStandardMaterial } from 'three';
import type { VehicleProfile } from './VehicleConfig';

export type VehicleBlock = (w: number, h: number, l: number, x: number, y: number, z: number, material?: MeshStandardMaterial, parent?: Group) => Mesh;
export interface VehicleDetailKit {
  block: VehicleBlock;
  cylinder: (radius: number, length: number, x: number, y: number, z: number, material: MeshStandardMaterial, parent: Group) => Mesh;
  paint: MeshStandardMaterial; trim: MeshStandardMaterial; metal: MeshStandardMaterial;
  glass: MeshStandardMaterial; lamp: MeshStandardMaterial; wood: MeshStandardMaterial; amber: MeshStandardMaterial;
}

export function flatbedDetails(width: number, start: number, end: number, parent: Group, kit: VehicleDetailKit): void {
  const { block, paint, trim, metal, wood } = kit, length = end - start, center = (start + end) / 2;
  block(width, 0.2, length, 0, 0.18, center, paint, parent);
  for (let x = -width / 2 + 0.2; x < width / 2 - 0.1; x += 0.23)
    block(0.215, 0.07, length - 0.12, x, 0.315, center, wood, parent);
  for (const side of [-1, 1]) {
    block(0.12, 0.28, length - 0.1, side * 0.7, -0.03, center, trim, parent);
    block(0.07, 0.1, length, side * (width / 2 - 0.035), 0.3, center, metal, parent);
    for (let z = start + 0.4; z < end; z += 0.9) {
      block(0.045, 0.13, 0.11, side * (width / 2 - 0.06), 0.39, z, trim, parent);
      block(0.026, 0.025, 0.13, side * (width / 2 - 0.055), 0.46, z, metal, parent);
      block(0.018, 0.075, 0.35, side * (width / 2 + 0.004), 0.16, z, metal, parent);
    }
    block(0.55, 0.45, 1.25, side * (width / 2 - 0.3), -0.24, start + length * 0.38, metal, parent);
    block(0.018, 0.07, 0.18, side * (width / 2 - 0.012), -0.23, start + length * 0.38, trim, parent);
    block(0.6, 0.18, 1.6, side * 0.75, 0.44, end - 0.82, metal, parent);
    for (let z = end - 1.5; z < end; z += 0.2) block(0.62, 0.035, 0.055, side * 0.75, 0.55, z, trim, parent);
  }
  for (let z = start + 0.25; z < end; z += 1.2) block(width - 0.2, 0.12, 0.1, 0, 0.01, z, metal, parent);
  for (const x of [-width * 0.45, 0, width * 0.45]) block(0.075, 1.05, 0.075, x, 0.85, start + 0.08, paint, parent);
  for (const y of [0.45, 0.85, 1.35]) block(width - 0.15, 0.075, 0.075, 0, y, start + 0.08, metal, parent);
}

export function vehicleDetails(p: VehicleProfile, parent: Group, kit: VehicleDetailKit): void {
  const { block, cylinder, paint, trim, metal, glass, lamp, amber } = kit;
  if (p.mass < 4000) return;
  const nose = -p.chassisLength / 2, end = p.chassisLength / 2;
  for (const side of [-1, 1]) {
    block(0.12, 0.3, p.chassisLength - 0.3, side * 0.67, -0.34, 0, trim, parent);
    block(0.045, 0.045, p.chassisLength - 0.6, side * 0.48, -0.18, 0, metal, parent);
    const tank = cylinder(0.19, 0.85, side * 0.88, -0.25, nose + 3.1, metal, parent); tank.rotation.x = Math.PI / 2;
    for (const z of [nose + 2.82, nose + 3.38]) block(0.035, 0.39, 0.05, side * 1.055, -0.25, z, trim, parent);
    for (let z = nose + 2.8; z < end - 0.3; z += 1.45) block(0.035, 0.065, 0.13, side * (p.width / 2 + 0.01), 0.08, z, lamp, parent);
    for (let y = -0.02; y < 0.43; y += 0.1) block(0.42, 0.025, 0.02, side * p.width * 0.3, y, nose - 0.025, trim, parent);
  }
  for (let z = nose + 0.6; z < end; z += 1.5) block(1.45, 0.12, 0.12, 0, -0.31, z, metal, parent);
  for (const point of p.wheels.filter(point => point.x > 0)) {
    block(p.width - 0.35, 0.13, 0.15, 0, -0.55, -point.along, trim, parent);
    block(0.35, 0.3, 0.33, 0, -0.53, -point.along, metal, parent);
  }
  const dashZ = -p.eye.along - 0.62;
  block(0.42, 0.21, 0.035, 0.08, p.eye.y - 0.39, dashZ, metal, parent);
  block(0.35, 0.15, 0.042, 0.08, p.eye.y - 0.38, dashZ + 0.005, trim, parent);
  for (const x of [-0.21, 0.37]) {
    block(0.12, 0.14, 0.04, x, p.eye.y - 0.37, dashZ, trim, parent);
    for (let i = 0; i < 4; i++) block(0.1, 0.009, 0.046, x, p.eye.y - 0.415 + i * 0.03, dashZ + 0.008, metal, parent);
  }
  for (let i = 0; i < 4; i++) block(0.025, 0.025, 0.05, i * 0.075 - 0.025, p.eye.y - 0.54, dashZ + 0.01, i ? metal : amber, parent);
  block(0.16, 0.5, 0.22, 0.08, p.eye.y - 0.79, dashZ + 0.12, trim, parent);
  if (p.shape === 'flatbed') flatbedDetails(p.width, nose + 2.8, end, parent, kit);
  if (p.shape === 'tractor' && p.trailer?.body === 'flatbed') {
    for (const side of [-1, 1]) {
      cylinder(0.1, 2.35, side * 1.07, 0.85, -0.25, metal, parent);
      block(0.32, 0.6, 0.6, side * 0.89, 1.55, -0.05, trim, parent);
      for (let y = 1.32; y < 1.8; y += 0.1) block(0.33, 0.025, 0.62, side * 0.89, y, -0.05, metal, parent);
      for (let i = 0; i < 8; i++) block(0.035, 0.06, 0.045, side * 0.32, 0.45 + Math.sin(i * 0.8) * 0.04, 0.1 + i * 0.1, paint, parent);
    }
    for (let x = -0.85; x <= 0.85; x += 0.425) block(0.16, 0.075, 0.14, x, 2.2, -2.35, lamp, parent);
  }
  if (p.shape !== 'crane') return;
  block(p.width - 0.1, 0.28, p.chassisLength - 2.6, 0, 0.28, 1.25, paint, parent);
  cylinder(1.03, 0.22, 0, 0.54, 2.25, metal, parent);
  cylinder(0.89, 0.2, 0, 0.73, 2.25, trim, parent);
  block(1.55, 0.64, 3.4, 0.15, 1.04, 3.1, paint, parent);
  for (let i = 0; i < 4; i++) block(2.35, 0.24, 1.25, 0, 0.94 + i * 0.25, 4.85, trim, parent);
  for (let i = -4; i <= 4; i++) {
    const stripe = block(0.13, 0.32, 0.025, i * 0.25, 1.04, 5.49, paint, parent); stripe.rotation.z = -0.35;
    const bumper = block(0.12, 0.2, 0.025, i * 0.25, -0.27, nose - 0.02, trim, parent); bumper.rotation.z = 0.35;
  }
  block(0.88, 1.1, 1.7, -0.88, 1.52, 1.55, paint, parent);
  block(0.72, 0.64, 0.02, -0.88, 1.75, 0.69, glass, parent);
  block(0.02, 0.64, 1.3, -1.33, 1.75, 1.5, glass, parent);
  block(0.9, 0.08, 1.75, -0.88, 2.12, 1.55, metal, parent);
  for (const [width, height, length, z] of [[0.92, 0.65, 4.8, 0.6], [0.76, 0.51, 4, -0.5], [0.61, 0.39, 3.3, -2.2], [0.46, 0.28, 2.6, -4.4]]) {
    block(width, height, length, 0.17, 2.45, z, paint, parent);
    for (const side of [-1, 1]) block(0.035, 0.035, length - 0.12, 0.17 + side * width / 2, 2.45 - height * 0.25, z, metal, parent);
  }
  for (const side of [-1, 1]) {
    block(0.15, 1.3, 0.65, side * 0.51 + 0.17, 1.64, 2.45, metal, parent);
    const ram = cylinder(0.09, 2.4, side * 0.55 + 0.17, 1.5, 0.9, metal, parent); ram.rotation.x = -0.95;
    for (const z of [-2.25, 4.9]) {
      block(p.width - 0.15, 0.25, 0.42, 0, 0.02, z, trim, parent);
      cylinder(0.14, 0.7, side * 1.17, -0.02, z, metal, parent);
      block(0.34, 0.08, 0.48, side * 1.17, -0.41, z, trim, parent);
      block(0.06, 0.24, 0.48, side * 1.34, 0.1, z, paint, parent);
    }
    cylinder(0.095, 0.045, side * 1.02, 1.98, nose + 0.35, trim, parent);
    cylinder(0.08, 0.12, side * 1.02, 2.06, nose + 0.35, amber, parent);
  }
  const pulley = cylinder(0.2, 0.25, 0.17, 2.43, -5.73, trim, parent); pulley.rotation.z = Math.PI / 2;
  for (const x of [0.1, 0.24]) cylinder(0.014, 0.2, x, 2.33, -5.79, metal, parent);
  block(0.3, 0.18, 0.24, 0.17, 2.18, -5.79, paint, parent);
  block(0.045, 0.12, 0.06, 0.17, 2.045, -5.79, metal, parent);
  block(0.15, 0.045, 0.06, 0.22, 1.985, -5.79, metal, parent);
  block(0.04, 0.07, 0.06, 0.285, 2.015, -5.79, metal, parent);
}
