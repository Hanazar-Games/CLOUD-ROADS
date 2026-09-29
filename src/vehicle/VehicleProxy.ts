import { BoxGeometry, Color, Float32BufferAttribute, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { vehicleProfiles, type VehicleKind } from './VehicleConfig';

export function vehicleProxy(kind: VehicleKind): BufferGeometry[] {
  const p = vehicleProfiles[kind], parts: BufferGeometry[] = [], ground = -p.radius - p.rest;
  const box = (width: number, height: number, length: number, x: number, y: number, z: number, paint = false, hex = 0x344450) => {
    const geometry = new BoxGeometry(width, height, length).toNonIndexed().translate(x, y, z);
    geometry.deleteAttribute('uv');
    const count = geometry.getAttribute('position').count, colors = new Float32Array(count * 3), color = new Color(paint ? 0xffffff : hex);
    for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    geometry.setAttribute('paintMask', new Float32BufferAttribute(new Float32Array(count).fill(Number(paint)), 1));
    geometry.setAttribute('glassMask', new Float32BufferAttribute(new Float32Array(count), 1)); parts.push(geometry);
  };
  const merge = () => { const geometry = mergeGeometries(parts)!; parts.forEach(p => p.dispose()); parts.length = 0; return geometry; };
  const heavy = ['truck', 'bus', 'tractor', 'flatbed', 'crane'].includes(p.shape), height = Math.max(0.5, p.height - 0.5);
  box(p.width, heavy ? height : 0.55, p.chassisLength, 0, ground + 0.5 + (heavy ? height : 0.55) / 2, 0, true);
  if (!heavy) box(p.width * 0.83, Math.max(0.25, p.height - 1.05), p.chassisLength * 0.55, 0, ground + 1.05 + Math.max(0.25, p.height - 1.05) / 2, 0);
  for (const wheel of [p.wheels[0], p.wheels[1], ...p.wheels.slice(-2)])
    box(0.24, p.radius * 2, p.radius * 1.6, wheel.x, ground + p.radius, -wheel.along, false, 0x24282a);
  const result = [merge()];
  if ('trailer' in p) {
    box(p.width, p.height - 0.8, p.trailer.length, 0, ground + 0.8 + (p.height - 0.8) / 2, p.trailer.length / 2 - p.trailer.front, true);
    result.push(merge());
  }
  return result;
}
