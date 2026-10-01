import type { Group } from 'three';
import type { VehicleProfile } from './VehicleConfig';
import type { VehicleDetailKit } from './VehicleDetails';

export function expeditionEquipment(p: VehicleProfile, parent: Group, kit: VehicleDetailKit, roof: number): void {
  const { block, panel, trim, metal, paint, amber } = kit;
  const front = -0.4, back = p.length / 2 - 0.5, center = (front + back) / 2, length = back - front;
  const half = p.width / 2 - 0.2;
  for (const z of [front + 0.25, back - 0.25]) {
    block(p.width - 0.44, 0.05, 0.09, 0, roof + 0.06, z, metal, parent);
    for (const side of [-1, 1]) {
      panel(0.18, 0.07, 0.22, side * (half - 0.08), roof + 0.025, z, trim, parent);
      block(0.06, 0.02, 0.09, side * (half - 0.08), roof + 0.07, z, metal, parent);
    }
  }
  for (let z = front; z <= back; z += length / 8) block(p.width - 0.42, 0.035, 0.1, 0, roof + 0.095, z, trim, parent);
  for (const side of [-1, 1]) {
    block(0.055, 0.045, length + 0.07, side * half, roof + 0.22, center, metal, parent);
    for (const z of [front, center, back]) block(0.045, 0.15, 0.045, side * half, roof + 0.145, z, trim, parent);
  }
  for (const z of [front, back]) block(half * 2, 0.045, 0.055, 0, roof + 0.22, z, metal, parent);
  for (const [x, z, w, l] of [[-0.35, 0.5, 0.9, 0.75], [0.15, 1.78, 1.4, 1.2]]) {
    panel(w, 0.27, l, x, roof + 0.245, z, paint, parent);
    panel(w + 0.012, 0.045, l + 0.012, x, roof + 0.345, z, trim, parent);
    for (const side of [-1, 1]) {
      const strap = x + side * w * 0.32;
      block(0.038, 0.016, l + 0.035, strap, roof + 0.386, z, metal, parent);
      for (const end of [-1, 1]) {
        block(0.038, 0.3, 0.022, strap, roof + 0.24, z + end * (l / 2 + 0.01), trim, parent);
        block(0.07, 0.045, 0.03, strap, roof + 0.21, z + end * (l / 2 + 0.023), metal, parent);
      }
    }
  }
  for (const y of [0.135, 0.18]) {
    panel(0.43, 0.038, 1.08, 0.52, roof + y, 0.2, amber, parent);
    for (const x of [0.38, 0.52, 0.66]) for (let z = -0.23; z < 0.7; z += 0.13)
      block(0.035, 0.023, 0.045, x, roof + y + 0.024, z, trim, parent);
  }
  for (const z of [-0.17, 0.57]) block(0.46, 0.018, 0.036, 0.52, roof + 0.225, z, metal, parent);
}
