import { BoxGeometry, Color, Float32BufferAttribute, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { vehicleProfiles, type VehicleProfile, type VehicleKind } from './VehicleConfig';
import { vehicleReflectors } from './VehicleSafety';

export function vehicleProxy(kind: VehicleKind): BufferGeometry[] {
  const p: VehicleProfile = vehicleProfiles[kind], parts: BufferGeometry[] = [], ground = -p.radius - p.rest;
  const box = (width: number, height: number, length: number, x: number, y: number, z: number, paint = false, hex = 0x344450, retro = false) => {
    const geometry = new BoxGeometry(width, height, length).toNonIndexed().translate(x, y, z);
    geometry.deleteAttribute('uv');
    const count = geometry.getAttribute('position').count, colors = new Float32Array(count * 3), color = new Color(paint ? 0xffffff : hex);
    for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    geometry.setAttribute('paintMask', new Float32BufferAttribute(new Float32Array(count).fill(Number(paint)), 1));
    geometry.setAttribute('glassMask', new Float32BufferAttribute(new Float32Array(count), 1)); parts.push(geometry);
    geometry.setAttribute('retroMask', new Float32BufferAttribute(new Float32Array(count).fill(Number(retro)), 1));
  };
  const merge = () => { const geometry = mergeGeometries(parts)!; parts.forEach(p => p.dispose()); parts.length = 0; return geometry; };
  const reflectors = (part: number) => {
    const marks = vehicleReflectors(p, part);
    for (const side of [-1, 1]) {
      const sideMarks = marks.filter(m => Math.sign(m.x) === side && m.w < 0.04);
      const ends = marks.filter(m => Math.sign(m.x) === side && m.l < 0.04).slice(0, 2);
      for (const m of [...ends, ...sideMarks.length ? [sideMarks[0], sideMarks.at(-1)!] : []])
        box(m.w, m.h, m.l, m.x, m.y, m.z, false, m.color, true);
    }
  };
  const heavy = ['truck', 'bus', 'tractor', 'flatbed', 'crane'].includes(p.shape), height = Math.max(0.5, p.height - 0.5);
  box(p.width, heavy ? height : 0.55, p.chassisLength, 0, ground + 0.5 + (heavy ? height : 0.55) / 2, 0, true);
  if (!heavy) box(p.width * 0.83, Math.max(0.25, p.height - 1.05), p.chassisLength * 0.55, 0, ground + 1.05 + Math.max(0.25, p.height - 1.05) / 2, 0);
  for (const wheel of [p.wheels[0], p.wheels[1], ...p.wheels.slice(-2)])
    box(0.24, p.radius * 2, p.radius * 1.6, wheel.x, ground + p.radius, -wheel.along, false, 0x24282a);
  reflectors(0);
  const result = [merge()];
  for (const [i, trailer] of (p.trailers ?? []).entries()) {
    box(p.width, p.height - 0.8, trailer.length, 0, ground + 0.8 + (p.height - 0.8) / 2, trailer.length / 2 - trailer.front, true);
    reflectors(i + 1); result.push(merge());
  }
  return result;
}
