import { Group, type MeshStandardMaterial } from 'three';
import type { VehicleDetailKit } from './VehicleDetails';
import type { VehicleOperations, VehicleOperation } from './VehicleOperations';

export class VehicleFittings {
  readonly hinges: { root: Group; action: VehicleOperation; axis: 'x' | 'y' | 'z'; angle: number }[] = [];
  beacon?: MeshStandardMaterial;
  private time = 0;
  hinge(action: VehicleOperation, parent: Group, x: number, y: number, z: number, axis: 'x' | 'y' | 'z', angle: number): Group {
    const root = new Group(); root.name = `operation-${action}`; root.position.set(x, y, z); parent.add(root);
    this.hinges.push({ root, action, axis, angle }); return root;
  }
  sync(operations: VehicleOperations | undefined, dt: number, working = false): void {
    this.time += Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
    for (const { root, action, axis, angle } of this.hinges) {
      const value = operations?.[action] ?? 0;
      root.rotation[axis] = (action === 'doors' ? value * value * (3 - 2 * value) : value) * angle;
    }
    if (this.beacon) this.beacon.emissiveIntensity = working || operations?.target.aux ? (Math.sin(this.time * 13) >= 0 ? 6 : 0.15) : 0;
  }
  cargo(parent: Group, width: number, start: number, end: number, floor: number, top: number, kind: 'box' | 'stake' | 'flatbed', kit: VehicleDetailKit, rideHeight: number, ribs = true, passage = false): void {
    const { block, paint, trim, metal } = kit, length = end - start, middle = (start + end) / 2;
    block(width - 0.05, 0.14, length, 0, floor, middle, paint, parent);
    if (kind === 'flatbed') {
      const rampLength = 2.8, angle = Math.PI + Math.asin((rideHeight + floor + 0.1) / rampLength);
      for (const side of [-1, 1]) {
        const ramp = this.hinge('cargo', parent, side * width * 0.3, floor + 0.16, end - 0.04, 'x', angle);
        block(0.6, 0.13, rampLength, 0, 0, -rampLength / 2, metal, ramp);
        for (let z = -rampLength + 0.1; z < 0; z += 0.2) block(0.62, 0.025, 0.05, 0, -0.08, z, trim, ramp);
      }
      return;
    }
    const height = top - floor;
    if (kind === 'box') {
      block(width, 0.09, length, 0, top, middle, paint, parent);
      if (passage) {
        for (const side of [-1, 1]) block((width - 0.9) / 2, height, 0.06, side * (width + 0.9) / 4, (top + floor) / 2, start, paint, parent);
        block(0.9, 0.08, 0.06, 0, top - 0.04, start, paint, parent);
      } else block(width, height, 0.06, 0, (top + floor) / 2, start, paint, parent);
    }
    for (const side of [-1, 1]) {
      if (kind === 'box' && passage) {
        const x = side * (width / 2 - 0.03), bottom = top - 0.98, upper = top - 0.32;
        block(0.06, bottom - floor, length, x, (bottom + floor) / 2, middle, paint, parent);
        block(0.06, top - upper, length, x, (top + upper) / 2, middle, paint, parent);
        for (const [from, to] of [[start, middle - 1.03], [middle - 0.17, middle + 0.37], [middle + 1.23, end]])
          if (to > from) block(0.06, upper - bottom, to - from, x, (upper + bottom) / 2, (from + to) / 2, paint, parent);
      } else if (kind === 'box') block(0.06, height, length, side * (width / 2 - 0.03), (top + floor) / 2, middle, paint, parent);
      else {
        block(0.05, 0.45, length, side * width / 2, floor + 0.27, middle, paint, parent);
        for (let y = floor + 0.65; y <= top; y += 0.32) block(0.055, 0.045, length, side * width / 2, y, middle, metal, parent);
      }
      for (let z = start + 0.08; ribs && z <= end; z += kind === 'stake' ? 0.8 : 0.65)
        block(0.07, height, 0.055, side * width / 2, (top + floor) / 2, z, metal, parent);
      const gate = this.hinge('cargo', parent, side * width / 2, floor, end, 'y', side * Math.PI * 0.8);
      block(width / 2 - 0.05, kind === 'box' ? height : 0.45, 0.065, -side * width / 4, kind === 'box' ? height / 2 : 0.27, 0, paint, gate);
      if (kind === 'box') block(0.055, height, 0.03, -side * (width / 2 - 0.012), height / 2, -0.02, trim, gate);
      for (const x of [0, -side * width / 2 + side * 0.04]) block(0.055, height, 0.08, x, height / 2, 0, metal, gate);
      if (kind === 'stake') for (let y = 0.65; y <= height; y += 0.32) block(width / 2, 0.045, 0.06, -side * width / 4, y, 0, metal, gate);
      block(0.035, height * 0.72, 0.05, -side * width * 0.36, height / 2, 0.05, metal, gate);
      for (const y of [height * 0.15, height * 0.5, height * 0.85]) {
        block(0.095, 0.045, 0.09, -side * width * 0.36, y, 0.065, trim, gate);
        block(0.13, 0.065, 0.07, -side * 0.055, y, 0.075, metal, gate);
      }
      block(0.22, 0.045, 0.055, -side * (width * 0.36 - 0.09), height * 0.44, 0.115, metal, gate);
      for (const y of [height * 0.2, height * 0.8]) block(0.14, 0.05, 0.09, -side * 0.06, y, 0.04, trim, gate);
    }
    if (kind === 'stake') for (const y of [floor + 0.35, floor + 0.8, top]) block(width, 0.07, 0.065, 0, y, start, paint, parent);
  }
}
