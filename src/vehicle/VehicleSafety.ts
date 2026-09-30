import type { VehicleProfile } from './VehicleConfig';

export interface SafetyMark { x: number; y: number; z: number; w: number; h: number; l: number; color: number }

export function compactSideLights(p: VehicleProfile, part = 0): boolean {
  return !part && p.chassisLength < 6 && ['roadster', 'sedan', 'supercar', 'suv'].includes(p.shape);
}

export function sideLampPositions(p: VehicleProfile, part = 0): number[] {
  const t = part ? p.trailers?.[part - 1] : undefined, length = t?.length ?? p.chassisLength;
  const start = t ? -t.front : -length / 2;
  if (compactSideLights(p, part)) return [start + 0.18, start + length - 0.18];
  if (length < 6) return [start + length * 0.18, start + length * 0.82];
  const intervals = Math.max(1, Math.floor(length / 3.5));
  const spacing = Math.min(4, (length - 0.6) / intervals), inset = (length - spacing * intervals) / 2;
  return Array.from({ length: intervals + 1 }, (_, i) => start + inset + i * spacing);
}

export function sideMarkerX(p: VehicleProfile, z: number): number {
  if (p.shape !== 'roadster') return p.width / 2;
  const rear = z > 0, taper = Math.max(0, Math.abs(z) - (rear ? 1.6 : 1.65));
  return 0.99 - taper * (rear ? 0.22 / 0.45 : 0.18 / 0.4);
}

export function vehicleReflectors(p: VehicleProfile, part = 0): SafetyMark[] {
  const t = part ? p.trailers?.[part - 1] : undefined, length = t?.length ?? p.chassisLength;
  const front = t ? -t.front : -length / 2, rear = front + length;
  const bike = p.shape === 'motorcycle', heavy = length >= 6 || !!t;
  const marks: SafetyMark[] = [];
  const add = (x: number, y: number, z: number, w: number, h: number, l: number, color: number) => marks.push({ x, y, z, w, h, l, color });
  for (const side of [-1, 1]) {
    add(side * p.width * 0.32, -0.08, rear + 0.045, bike ? 0.06 : heavy ? 0.45 : 0.22, 0.065, 0.025, 0xff3020);
    if (!part) add(side * p.width * 0.32, -0.08, front - 0.045, bike ? 0.05 : 0.19, 0.045, 0.025, 0xf4f3dc);
    for (const z of sideLampPositions(p, part)) add(side * (bike ? 0.23 : sideMarkerX(p, z) + 0.008), heavy ? 0.35 : compactSideLights(p, part) ? -0.24 : -0.12,
      bike ? z * 0.65 : z, 0.025, 0.065, heavy ? 0.55 : 0.14, 0xffb638);
    if (heavy) {
      for (let z = front + 0.5, i = 0; z < rear - 0.2; z += 0.9, i++)
        add(side * (p.width / 2 + 0.019), 0.21, z, 0.026, 0.055, 0.42, i % 2 ? 0xff3020 : 0xf4f3dc);
      const boxed = t ? t.body === 'box' : p.shape === 'bus' || p.shape === 'truck' && !['tanker', 'sprinkler', 'mixer', 'dumptruck'].includes(p.body ?? '');
      if (boxed) for (const y of [0.55, 1.2, 1.85]) if (y < p.height - p.radius - p.rest - 0.1)
        add(side * (p.width / 2 - 0.08), y, rear + 0.052, 0.065, 0.4, 0.025, 0xff3020);
    }
  }
  return marks;
}
