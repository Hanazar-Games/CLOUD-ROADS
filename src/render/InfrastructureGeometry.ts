import { BoxGeometry, Color, CylinderGeometry, Float32BufferAttribute, TorusGeometry, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

class Parts {
  private readonly geometries: BufferGeometry[] = [];
  add(geometry: BufferGeometry, color: number): void {
    const tint = new Color(color), colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) tint.toArray(colors, i);
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3)); this.geometries.push(geometry);
  }
  box(w: number, h: number, l: number, x: number, y: number, z: number, color: number): void {
    this.add(new BoxGeometry(w, h, l).translate(x, y, z), color);
  }
  finish(): BufferGeometry {
    const geometry = mergeGeometries(this.geometries)!;
    for (const part of this.geometries) part.dispose();
    geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
  }
}

export function drainGrateGeometry(): BufferGeometry {
  const p = new Parts(), iron = 0x526264;
  p.box(0.36, 0.018, 0.94, 0, -0.019, 0, 0x202b2f);
  for (const x of [-0.19, 0.19]) p.box(0.035, 0.018, 1, x, 0, 0, iron);
  for (const z of [-0.482, 0.482]) p.box(0.36, 0.018, 0.036, 0, 0, z, iron);
  for (let z = -0.42; z <= 0.42; z += 0.07) p.box(0.36, 0.02, 0.024, 0, 0.001, z, 0x81908e);
  for (const z of [-0.35, 0.35]) for (const x of [-0.19, 0.19])
    p.add(new CylinderGeometry(0.012, 0.012, 0.01, 6).translate(x, 0.009, z), 0xa1aaa4);
  return p.finish();
}

export function expansionJointGeometry(width: number): BufferGeometry {
  const p = new Parts();
  p.box(width, 0.016, 0.28, 0, -0.016, 0, 0x273438);
  for (const side of [-1, 1]) {
    p.box(width, 0.014, 0.055, 0, 0, side * 0.145, 0x9ba6a2);
    const count = Math.floor(width / 0.16), step = width / count;
    for (let i = 0; i < count; i++) {
      const x = -width / 2 + step * (i + (side > 0 ? 0.25 : 0.75));
      p.box(step * 0.4, 0.014, 0.18, x, 0, side * 0.048, 0x81908c);
      if (i % 3 === 0) p.add(new CylinderGeometry(0.012, 0.012, 0.008, 6).translate(x, 0.01, side * 0.145), 0x3c484b);
    }
  }
  return p.finish();
}

export function emergencyCabinetGeometry(): BufferGeometry {
  const p = new Parts(), steel = 0xb5c1ba;
  p.box(0.016, 1.2, 0.57, 0, 0, 0, 0x673333);
  for (const y of [-0.61, 0.61]) p.box(0.045, 0.035, 0.64, 0.016, y, 0, steel);
  for (const z of [-0.304, 0.304]) p.box(0.045, 1.22, 0.03, 0.016, 0, z, steel);
  p.box(0.012, 0.64, 0.46, 0.025, 0.12, 0, 0x243b40);
  for (const radius of [0.065, 0.105, 0.145, 0.185])
    p.add(new TorusGeometry(radius, 0.013, 6, 20).rotateY(Math.PI / 2).translate(0.045, 0.12, 0), 0xb94e37);
  p.add(new CylinderGeometry(0.035, 0.035, 0.025, 8).rotateZ(Math.PI / 2).translate(0.05, 0.12, 0), steel);
  p.box(0.032, 0.19, 0.02, 0.058, -0.02, -0.256, steel);
  p.box(0.025, 0.07, 0.17, 0.04, -0.39, 0, 0xf2dec4);
  for (const z of [-0.15, 0, 0.15]) p.box(0.025, 0.014, 0.06, 0.04, -0.5, z, 0x283c40);
  for (const y of [-0.43, 0.43]) p.box(0.04, 0.08, 0.028, 0.03, y, 0.3, steel);
  return p.finish();
}

export function chargerDetailGeometry(): BufferGeometry {
  const p = new Parts();
  for (const y of [-0.273, 0.273]) p.box(0.035, 0.027, 0.59, 0.023, y, 0, 0xb4c5c2);
  for (const z of [-0.28, 0.28]) p.box(0.035, 0.55, 0.025, 0.023, 0, z, 0xb4c5c2);
  for (let i = 0; i < 5; i++) p.box(0.018, 0.04, 0.04, 0.046, -0.085, -0.12 + i * 0.06, 0x243d43);
  p.box(0.018, 0.025, 0.2, 0.046, 0.1, -0.04, 0xd2f6e3);
  p.box(0.018, 0.018, 0.13, 0.046, 0.035, -0.075, 0xd2f6e3);
  p.box(0.04, 0.14, 0.19, 0.012, -0.39, 0, 0x2e454b);
  p.box(0.047, 0.012, 0.12, 0.02, -0.385, 0, 0xa9bdb9);
  for (let y = -0.48; y > -0.68; y -= 0.035) p.box(0.02, 0.01, 0.4, 0.013, y, 0, 0x546c70);
  p.add(new CylinderGeometry(0.027, 0.027, 0.03, 12).rotateZ(Math.PI / 2).translate(0.03, -0.39, 0.24), 0xc64b3e);
  return p.finish();
}

export function picnicDetailGeometry(): BufferGeometry {
  const p = new Parts();
  for (let z = -0.63; z <= 0.64; z += 0.21) p.box(3.94, 0.018, 0.19, 0, 0.992, z, z < 0 ? 0xa28a63 : 0x8f7755);
  for (const side of [-1, 1]) for (const z of [-0.105, 0.105]) p.box(4.44, 0.015, 0.195, 0, 0.59, side * 1.3 + z, 0xa08962);
  for (const x of [-1.5, 1.5]) for (const z of [-1.3, 0, 1.3]) {
    p.box(0.16, 0.08, 0.32, x, z ? 0.37 : 0.79, z, 0x536965);
    p.add(new CylinderGeometry(0.021, 0.021, 0.012, 6).translate(x, z ? 0.604 : 1.007, z), 0xc3c9b9);
  }
  return p.finish();
}
