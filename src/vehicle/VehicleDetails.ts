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
  }
  for (let z = start + 0.25; z < end; z += 1.2) block(width - 0.2, 0.12, 0.1, 0, 0.01, z, metal, parent);
  for (const x of [-width * 0.45, 0, width * 0.45]) block(0.075, 1.05, 0.075, x, 0.85, start + 0.08, paint, parent);
  for (const y of [0.45, 0.85, 1.35]) block(width - 0.15, 0.075, 0.075, 0, y, start + 0.08, metal, parent);
}

export function vehicleDetails(p: VehicleProfile, parent: Group, kit: VehicleDetailKit): void {
  const { block, cylinder, paint, trim, metal, lamp, amber } = kit;
  const nose = -p.chassisLength / 2, end = p.chassisLength / 2;
  if (p.shape !== 'motorcycle') {
    const roadster = p.shape === 'roadster';
    for (const side of [-1, 1]) for (const front of [true, false]) {
      const width = roadster ? front ? 0.5 : 0.56 : p.bus ? front ? 0.42 : 0.3 : p.width * (front ? 0.2 : 0.19);
      const height = roadster ? 0.09 : p.bus ? front ? 0.13 : 0.16 : front ? 0.1 : 0.11;
      const x = side * (roadster ? front ? 0.53 : 0.52 : p.width * (p.bus && !front ? 0.35 : front ? 0.3 : 0.31));
      const y = roadster && !front ? 0.04 : p.bus ? front ? -0.02 : 0.05 : 0.02, z = front ? nose - 0.058 : end + 0.07;
      for (const edge of [-1, 1]) {
        block(width + 0.07, 0.022, 0.024, x, y + edge * (height / 2 + 0.012), z, trim, parent);
        block(0.026, height, 0.024, x + edge * (width / 2 + 0.018), y, z, trim, parent);
      }
      for (const split of [-1, 1]) block(0.016, height, 0.025, x + split * width / 6, y, z, metal, parent);
      const sensor = cylinder(0.027, 0.014, side * p.width * 0.41, -0.18, front ? nose - 0.048 : end + 0.062, trim, parent);
      sensor.rotation.x = Math.PI / 2;
    }
    for (const z of [nose - 0.04, end + 0.04]) {
      block(0.48, 0.14, 0.04, 0, -0.2, z, trim, parent);
      block(0.41, 0.095, 0.045, 0, -0.2, z, metal, parent);
      for (let i = 0; i < 6; i++) block(0.022, 0.045, 0.047, -0.15 + i * 0.06, -0.2, z, trim, parent);
      for (const side of [-1, 1]) {
        block(0.13, 0.035, 0.035, side * p.width * 0.34, -0.28, z, amber, parent);
        block(0.06, 0.035, 0.05, side * p.width * 0.22, -0.27, z, trim, parent);
      }
    }
    for (const side of [-1, 1]) {
      const cap = cylinder(0.07, 0.012, side * (p.width / 2 + 0.018), -0.02, end - 0.65, metal, parent); cap.rotation.z = Math.PI / 2;
      block(0.017, 0.02, 0.13, side * (p.width / 2 + 0.028), -0.02, end - 0.65, trim, parent);
    }
  } else {
    const bezel = cylinder(0.115, 0.075, 0, 0.35, -0.85, metal, parent); bezel.rotation.x = Math.PI / 2;
    const lens = cylinder(0.088, 0.012, 0, 0.35, -0.894, lamp, parent); lens.rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
      block(0.055, 0.07, 0.32, side * 0.13, 0.3, -0.69, trim, parent);
      const riser = block(0.035, 0.32, 0.035, side * 0.13, 0.47, -0.52, metal, parent); riser.rotation.x = 0.25;
      block(0.018, 0.09, 0.1, side * 0.07, 0.39, -0.09, metal, parent);
    }
    block(0.34, 0.065, 0.1, 0, 0.32, -0.56, trim, parent);
    for (const z of [-0.83, end + 0.03]) block(p.width * 0.58, 0.03, 0.035, 0, 0.31, z, trim, parent);
    block(0.06, 0.1, 0.09, 0, 0.29, end - 0.005, trim, parent);
    for (let i = 0; i < 9; i++) block(0.29, 0.025, 0.37, 0, -0.18 + i * 0.035, 0, metal, parent);
    block(0.17, 0.13, 0.025, 0, 0.04, end + 0.015, metal, parent);
    for (let z = 0.05; z < 0.68; z += 0.08) block(0.025, 0.035, 0.035, -0.13, -0.27, z, trim, parent);
  }
  if (p.mass < 4000) {
    const bike = p.shape === 'motorcycle', sport = p.shape === 'supercar';
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) block(bike ? 0.045 : 0.035, 0.018, bike ? 0.26 : 0.28, side * (bike ? 0.156 : p.width * 0.47), (bike ? -0.15 : 0.01) + i * 0.04, bike ? 0 : sport ? 0.85 : -0.9, trim, parent);
      const exhaust = cylinder(bike ? 0.055 : sport ? 0.085 : 0.065, bike ? 0.65 : 0.22, side * p.width * 0.3, -0.22, end - 0.08, metal, parent); exhaust.rotation.x = Math.PI / 2;
      block(bike ? 0.035 : 0.07, 0.06, p.length * (bike ? 0.38 : 0.55), side * (bike ? 0.19 : p.width * 0.47), -0.26, 0.08, trim, parent);
      if (sport) {
        block(0.18, 0.12, 0.9, side * p.width * 0.4, 0.17, 1.45, trim, parent);
        block(0.035, 0.12, 0.55, side * 0.3, -0.3, end - 0.17, metal, parent);
      }
    }
    if (!bike) {
      block(0.13, 0.13, 0.42, 0, p.eye.y - 0.62, -p.eye.along + 0.07, trim, parent);
      block(0.035, 0.13, 0.035, 0, p.eye.y - 0.52, -p.eye.along - 0.05, metal, parent);
      for (const x of [-0.06, 0.08]) block(0.06, 0.018, 0.12, p.eye.x + x, p.eye.y - 1, -p.eye.along - 0.45, metal, parent);
      block(p.width * 0.82, 0.035, 0.22, 0, -0.29, nose + 0.02, trim, parent);
    }
    return;
  }
  for (const side of [-1, 1]) {
    block(0.12, 0.3, p.chassisLength - 0.3, side * 0.67, -0.34, 0, trim, parent);
    block(0.045, 0.045, p.chassisLength - 0.6, side * 0.48, -0.18, 0, metal, parent);
    const tank = cylinder(0.19, 0.85, side * 0.88, -0.25, nose + 3.1, metal, parent); tank.rotation.x = Math.PI / 2;
    for (const z of [nose + 2.82, nose + 3.38]) block(0.035, 0.39, 0.05, side * 1.055, -0.25, z, trim, parent);
    for (let z = nose + 2.8; z < end - 0.3; z += 1.45) block(0.035, 0.065, 0.13, side * (p.width / 2 + 0.01), 0.08, z, lamp, parent);
    for (let y = -0.02; y < 0.43; y += 0.1) block(0.42, 0.025, 0.02, side * p.width * 0.3, y, nose - 0.025, trim, parent);
    if (p.bus) {
      block(0.045, 0.85, 1.12, side * (p.width / 2 + 0.014), 0.2, end - 0.75, trim, parent);
      for (let y = -0.12; y < 0.57; y += 0.115) block(0.06, 0.035, 1.02, side * (p.width / 2 + 0.027), y, end - 0.75, metal, parent);
    }
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
}
