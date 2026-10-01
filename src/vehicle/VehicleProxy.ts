import { BoxGeometry, Color, CylinderGeometry, Float32BufferAttribute, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { suspensionTuning, vehicleProfiles, type VehicleProfile, type VehicleKind, type WheelPoint } from './VehicleConfig';
import { vehicleReflectors } from './VehicleSafety';

export function vehicleProxy(kind: VehicleKind): BufferGeometry[] {
  const p: VehicleProfile = vehicleProfiles[kind], parts: BufferGeometry[] = [], ground = -p.radius - p.rest + 9.81 / suspensionTuning(3, p).spring;
  const add = (geometry: BufferGeometry, paint = false, hex = 0x344450, retro = false) => {
    geometry.deleteAttribute('uv');
    const count = geometry.getAttribute('position').count, colors = new Float32Array(count * 3), color = new Color(paint ? 0xffffff : hex);
    for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    geometry.setAttribute('paintMask', new Float32BufferAttribute(new Float32Array(count).fill(Number(paint)), 1));
    geometry.setAttribute('glassMask', new Float32BufferAttribute(new Float32Array(count), 1)); parts.push(geometry);
    geometry.setAttribute('retroMask', new Float32BufferAttribute(new Float32Array(count).fill(Number(retro)), 1));
  };
  const box = (width: number, height: number, length: number, x: number, y: number, z: number, paint = false, hex = 0x344450, retro = false) =>
    add(new BoxGeometry(width, height, length).translate(x, y, z), paint, hex, retro);
  const wheels = (points: readonly WheelPoint[]) => {
    for (const wheel of p.body === 'expedition' ? points : new Set([points[0], points[1], ...points.slice(-2)]))
      box(p.shape === 'motorcycle' ? 0.15 : 0.24, p.radius * 2, p.radius * 1.6, wheel.x, ground + p.radius, -wheel.along, false, 0x24282a);
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
  const nose = -p.chassisLength / 2, end = p.chassisLength / 2;
  if (p.shape === 'motorcycle') {
    box(0.36, 0.45, 0.85, 0, ground + 0.85, -0.2, true);
    box(0.3, 0.16, 0.85, 0, ground + 1.02, 0.45);
    box(p.width, 0.07, 0.12, 0, ground + 1.35, nose + 0.35);
  } else if (p.shape === 'bus') {
    box(p.width, height, p.chassisLength, 0, ground + 0.5 + height / 2, 0, true);
    for (const side of [-1, 1]) for (const deck of p.bus?.rows.map((_, i) => i) ?? [0])
      box(0.025, 0.72, p.chassisLength - 0.6, side * p.width / 2, ground + 1.8 + deck * p.bus!.deckHeight, 0);
    box(p.width * 0.85, 0.9, 0.025, 0, ground + 1.85, nose - 0.014);
  } else if (heavy) {
    const cab = Math.min(2.5, p.chassisLength * 0.4), cabBack = nose + cab, cargoLength = end - cabBack;
    const cabHeight = Math.min(2.6, height);
    box(p.width * 0.9, cabHeight, cab, 0, ground + 0.55 + cabHeight / 2, nose + cab / 2, true);
    box(p.width * 0.78, 0.7, 0.025, 0, ground + cabHeight, nose - 0.014);
    box(p.width * 0.7, 0.26, p.chassisLength, 0, -0.18, 0);
    if (p.shape === 'crane') {
      box(p.width, 0.25, cargoLength, 0, ground + 1.05, (cabBack + end) / 2, true);
      box(p.width * 0.7, 0.7, 1.6, 0, ground + 1.5, end - 1, true);
      box(0.62, 0.5, p.chassisLength * 0.78, 0, ground + p.height - 0.3, -0.1, true);
    } else if (p.shape === 'flatbed') {
      box(p.width, 0.22, cargoLength, 0, 0.18, (cabBack + end) / 2, true);
    } else if (p.shape === 'truck') {
      const tank = ['tanker', 'sprinkler', 'mixer'].includes(p.body ?? '');
      if (tank) {
        const radius = Math.min(p.width * 0.46, (p.height - 1) / 2), length = cargoLength * (p.body === 'mixer' ? 0.76 : 0.94);
        add(new CylinderGeometry(radius, radius * (p.body === 'mixer' ? 0.65 : 1), length, 10).rotateX(Math.PI / 2)
          .translate(0, ground + 0.85 + radius, (cabBack + end) / 2), true);
      } else if (p.body === 'dumptruck') {
        box(p.width, 0.22, cargoLength, 0, ground + 0.95, (cabBack + end) / 2, true);
        for (const side of [-1, 1]) box(0.12, 1.25, cargoLength, side * (p.width / 2 - 0.06), ground + 1.65, (cabBack + end) / 2, true);
        for (const z of [cabBack, end]) box(p.width, 1.25, 0.12, 0, ground + 1.65, z, true);
      } else box(p.width, p.height - 0.85, cargoLength, 0, ground + 0.85 + (p.height - 0.85) / 2, (cabBack + end) / 2, true);
    }
  } else {
    if (p.body === 'expedition') {
      const roof = ground + p.height - 0.4, back = end - 0.5, cabFront = -0.8, cabBack = end - 0.12;
      box(p.width, 0.53, p.chassisLength, 0, -0.085, 0, true);
      box(p.width * 0.9, roof - 0.18, cabBack - cabFront, 0, (roof + 0.18) / 2, (cabBack + cabFront) / 2);
      box(p.width - 0.4, 0.08, back + 0.4, 0, roof + 0.1, (back - 0.4) / 2);
      box(0.9, 0.27, 0.75, -0.35, roof + 0.245, 0.5, true);
      box(1.4, 0.27, 1.2, 0.15, roof + 0.245, 1.78, true);
      add(new CylinderGeometry(p.radius, p.radius, 0.23, 8).rotateX(Math.PI / 2).translate(0, 0.45, end + 0.03), false, 0x24282a);
    } else {
      box(p.width, 0.55, p.chassisLength, 0, ground + 0.775, 0, true);
      box(p.width * 0.83, Math.max(0.25, p.height - 1.05), p.chassisLength * 0.55, 0, ground + 1.05 + Math.max(0.25, p.height - 1.05) / 2, 0);
    }
  }
  wheels(p.wheels);
  reflectors(0);
  const result = [merge()];
  for (const [i, trailer] of (p.trailers ?? []).entries()) {
    const center = trailer.length / 2 - trailer.front, start = -trailer.front, rear = trailer.length - trailer.front;
    box(p.width, 0.22, trailer.length, 0, 0.18, center, true);
    if (trailer.body === 'box') box(p.width, p.height + ground - 0.3, trailer.length, 0, (p.height + ground + 0.3) / 2, center, true);
    if (trailer.body === 'stake') {
      const top = p.height + ground - 0.07;
      for (const side of [-1, 1]) {
        box(0.08, 0.09, trailer.length, side * (p.width / 2 - 0.04), top, center, true);
        for (const z of [start + 0.06, rear - 0.06]) box(0.08, top - 0.3, 0.09, side * (p.width / 2 - 0.04), (top + 0.3) / 2, z, true);
      }
      box(p.width, top - 0.3, 0.09, 0, (top + 0.3) / 2, start + 0.06, true);
    }
    wheels(trailer.wheels);
    reflectors(i + 1); result.push(merge());
  }
  return result;
}
