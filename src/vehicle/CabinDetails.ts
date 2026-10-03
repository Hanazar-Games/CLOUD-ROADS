import { Vector3, type Group, type MeshStandardMaterial } from 'three';
import type { VehicleProfile } from './VehicleConfig';
import type { VehicleDetailKit } from './VehicleDetails';
import type { CabinSeat } from './CabinState';
import type { CabinLayout } from './CabinLayout';

export function displaySurround(parent: Group, screen: Group, kit: VehicleDetailKit): void {
  const { panel, trim, metal } = kit;
  screen.updateMatrix();
  const fitting = (w: number, h: number, l: number, x: number, y: number, z: number, material = trim) => {
    const part = panel(w, h, l, x, y, z, material, parent); part.applyMatrix4(screen.matrix); return part;
  };
  fitting(0.352, 0.218, 0.038, 0, 0, -0.025);
  fitting(0.366, 0.018, 0.065, 0, 0.113, -0.015);
  for (const side of [-1, 1]) fitting(0.009, 0.186, 0.009, side * 0.166, 0, 0.001, metal);
}

export function dashboardDetails(p: VehicleProfile, parent: Group, steering: Group, screen: Group, kit: VehicleDetailKit): void {
  const { block, panel, cylinder, trim, metal } = kit;
  displaySurround(parent, screen, kit);
  if (p.shape === 'motorcycle') return;
  const fitting = (w: number, h: number, l: number, x: number, y: number, z: number, material = trim) => {
    const part = panel(w, h, l, x, y, z, material, parent); part.applyMatrix4(screen.matrix); return part;
  };
  fitting(0.31, 0.095, 0.07, 0, -0.185, -0.026);
  for (const side of [-1, 1]) {
    fitting(0.12, 0.07, 0.045, side * 0.25, -0.055, -0.03);
    for (let i = 0; i < 4; i++) fitting(0.094, 0.004, 0.014, side * 0.25, -0.077 + i * 0.014, -0.002, metal);
    fitting(0.012, 0.025, 0.02, side * 0.25, -0.055, 0.004);
    const dial = cylinder(0.026, 0.022, side * 0.104, -0.177, 0.021, metal, parent);
    dial.rotation.x = Math.PI / 2; dial.applyMatrix4(screen.matrix);
    fitting(0.008, 0.015, 0.014, side * 0.104, -0.165, 0.036);
    for (let i = 0; i < 3; i++) fitting(0.021, 0.01, 0.01, side * 0.043, -0.157 - i * 0.02, 0.017, metal);
    block(0.034, 0.012, 0.012, side * 0.095, 0.016, 0.022, trim, steering);
    block(0.017, 0.006, 0.014, side * 0.095, 0.026, 0.027, metal, steering);
  }
  panel(0.09, 0.067, 0.045, 0, -0.005, 0.012, trim, steering);
  block(0.04, 0.008, 0.005, 0, 0.008, 0.038, metal, steering);
  const { x, y, along } = p.eye;
  for (const side of [-1, 1]) {
    const stalk = block(0.12, 0.022, 0.025, x + side * 0.17, y - 0.31, -along - 0.44, trim, parent);
    stalk.rotation.z = side * 0.12;
    block(0.022, 0.035, 0.055, x + side * 0.23, y - 0.31, -along - 0.44, metal, parent);
  }
  const footY = y - 1.13, footZ = -along - 0.28;
  panel(0.48, 0.018, 0.54, x, footY, footZ, trim, parent);
  for (const side of [-1, 1]) block(0.009, 0.004, 0.47, x + side * 0.215, footY + 0.011, footZ, metal, parent);
  for (let i = 0; i < 6; i++) block(0.32, 0.006, 0.012, x, footY + 0.012, footZ - 0.18 + i * 0.067, trim, parent);
  for (const [offset, width, height] of [[-0.09, 0.13, 0.075], [0.13, 0.065, 0.14]]) {
    const pedal = panel(width, height, 0.025, x + offset, footY + 0.15, footZ - 0.22, metal, parent);
    pedal.rotation.x = -0.35;
    for (let i = 0; i < 3; i++) block(width * 0.76, 0.007, 0.008, x + offset,
      footY + 0.12 + i * 0.025, footZ - 0.2 - i * 0.008, trim, parent);
  }
}

export function seatDetails(seat: CabinSeat, width: number, parent: Group, kit: VehicleDetailKit, leather: MeshStandardMaterial, upholstery: MeshStandardMaterial): void {
  const { block, panel, trim, metal } = kit, { x, y, along } = seat, z = -along;
  for (const side of [-1, 1]) {
    panel(width * 0.13, 0.43, 0.1, x + side * width * 0.41, y - 0.34, z + 0.225, leather, parent);
    panel(width * 0.13, 0.065, 0.38, x + side * width * 0.41, y - 0.59, z + 0.025, leather, parent);
    block(0.008, 0.3, 0.009, x + side * width * 0.3, y - 0.34, z + 0.233, upholstery, parent);
    block(0.008, 0.01, 0.27, x + side * width * 0.3, y - 0.598, z + 0.02, upholstery, parent);
    block(0.018, 0.12, 0.018, x + side * width * 0.2, y - 0.15, z + 0.32, metal, parent);
  }
  for (let i = 0; i < 3; i++) block(width * 0.56, 0.005, 0.009, x, y - 0.43 + i * 0.09, z + 0.236, leather, parent);
  const belt = block(0.031, 0.54, 0.013, x, y - 0.33, z + 0.214, trim, parent);
  belt.rotation.z = Math.atan2(width * 0.57, 0.5);
  block(0.028, 0.036, 0.022, x + width * 0.28, y - 0.56, z + 0.203, metal, parent);
  panel(width * 0.74, 0.36, 0.012, x, y - 0.39, z + 0.393, upholstery, parent);
  for (const side of [-1, 1]) block(0.007, 0.29, 0.007, x + side * width * 0.31, y - 0.39, z + 0.402, leather, parent);
  panel(width * 0.56, 0.14, 0.016, x, y - 0.49, z + 0.41, trim, parent);
  block(width * 0.47, 0.012, 0.018, x, y - 0.552, z + 0.411, metal, parent);
  block(width * 0.4, 0.013, 0.007, x, y - 0.285, z + 0.422, metal, parent);
}

export function doorDetails(parent: Group, side: number, length: number, armY: number, kit: VehicleDetailKit, controls = kit.trim): void {
  const { block, panel, metal } = kit;
  panel(0.065, 0.014, 0.18, -side * 0.12, armY + 0.036, length * 0.52, metal, parent);
  for (let i = 0; i < 2; i++) block(0.035, 0.012, 0.055, -side * 0.12, armY + 0.049, length * 0.52 - 0.04 + i * 0.08, controls, parent);
  panel(0.027, 0.07, 0.25, -side * 0.084, armY - 0.08, length * 0.31, controls, parent);
  for (let i = 0; i < 5; i++) block(0.007, 0.003, 0.21, -side * 0.101, armY - 0.105 + i * 0.012, length * 0.31, metal, parent);
  panel(0.045, 0.09, length * 0.4, -side * 0.08, armY - 0.22, length * 0.64, controls, parent);
  block(0.054, 0.018, length * 0.36, -side * 0.09, armY - 0.17, length * 0.64, metal, parent);
}

export function compartmentDetails(p: VehicleProfile, layout: CabinLayout, parent: Group, kit: VehicleDetailKit, upholstery: MeshStandardMaterial): void {
  const { block, panel, trim, metal, wood } = kit, b = layout.bounds;
  if (p.bus) {
    for (let deck = 0; deck < p.bus.rows.length; deck++) {
      const ceiling = deck < p.bus.rows.length - 1 ? p.eye.y - 1.2 + p.bus.deckHeight : b.max.y + 0.1;
      const start = -p.length / 2 + (layout.stairs ? 3.1 : 1.7), end = b.max.z - 0.12;
      const rackY = Math.max(p.eye.y + deck * p.bus.deckHeight + 0.23, ceiling - 0.23);
      for (const side of [-1, 1]) {
        if (layout.stairs) block(0.33, 0.04, end - start, side * (p.width / 2 - 0.22), rackY, (start + end) / 2, trim, parent);
        block(0.02, 0.055, end - start, side * (p.width / 2 - 0.39), rackY + 0.04, (start + end) / 2, metal, parent);
        for (let z = start + 0.3; z < end; z += 1.2) {
          block(0.02, Math.max(0.02, ceiling - rackY - 0.12), 0.025, side * (p.width / 2 - 0.2), (ceiling + rackY - 0.08) / 2, z, metal, parent);
          panel(0.21, 0.025, 0.16, side * (p.width / 2 - 0.25), rackY - 0.035, z, metal, parent);
          for (let i = 0; i < 3; i++) block(0.09, 0.006, 0.012, side * (p.width / 2 - 0.24), rackY - 0.051, z - 0.04 + i * 0.028, trim, parent);
        }
      }
    }
  } else if (layout.entry === 'cargo') {
    for (const side of [-1, 1]) {
      for (const y of [b.min.y + 0.24, b.min.y + 0.8]) {
        for (const edge of [-1, 1]) block(0.014, 0.014, b.max.z - b.min.z - 0.08, side * (p.width / 2 - 0.063), y + edge * 0.027, (b.min.z + b.max.z) / 2, metal, parent);
        for (let z = b.min.z + 0.2; z < b.max.z - 0.1; z += 0.26) block(0.014, 0.04, 0.21, side * (p.width / 2 - 0.063), y, z, metal, parent);
      }
    }
  }
  for (const { bounds: f, kind } of layout.furniture) {
    const c = f.getCenter(new Vector3()), size = f.getSize(new Vector3());
    if (kind === 'counter') {
      for (let i = 0; i < 3; i++) {
        const z = f.min.z + (i + 0.5) * size.z / 3;
        panel(0.012, size.y - 0.12, size.z / 3 - 0.024, f.max.x + 0.008, c.y, z, wood, parent);
        block(0.025, 0.018, 0.13, f.max.x + 0.022, f.max.y - 0.15, z, metal, parent);
      }
      block(0.28, 0.021, 0.28, c.x, f.max.y + 0.025, c.z, metal, parent);
      block(0.014, 0.023, 0.014, c.x, f.max.y + 0.037, c.z, trim, parent);
      block(0.14, 0.027, 0.03, c.x - 0.145, f.max.y + 0.15, c.z, metal, parent);
      block(0.03, 0.055, 0.03, c.x - 0.09, f.max.y + 0.135, c.z, metal, parent);
    } else if (kind === 'bench') {
      panel(0.1, 0.28, size.z - 0.05, f.max.x - 0.05, f.max.y + 0.13, c.z, upholstery, parent);
      for (const z of [f.min.z + 0.04, f.max.z - 0.04]) panel(size.x - 0.08, 0.17, 0.07, c.x, f.max.y + 0.08, z, upholstery, parent);
      block(size.x - 0.12, 0.004, 0.01, c.x, f.max.y + 0.023, c.z, trim, parent);
    } else {
      panel(size.x - 0.08, 0.025, size.z * 0.52, c.x, f.max.y + 0.035, f.min.z + size.z * 0.27, upholstery, parent);
      for (const x of [-size.x * 0.3, size.x * 0.3]) block(0.008, 0.003, size.z * 0.48, x, f.max.y + 0.049, f.min.z + size.z * 0.27, trim, parent);
    }
  }
}
