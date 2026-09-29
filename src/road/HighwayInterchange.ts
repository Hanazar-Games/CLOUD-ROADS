import type { RoadSample } from './RoadSegment';
import { roadProfile } from './RoadProfile';
import type { WorldOptions } from '../world/WorldOptions';
import type { ServiceAccessPoint, ServiceGround } from '../service/ServiceTerrain';

export interface InterchangePort { u: number; v: number; direction: number }
export interface InterchangeRamp {
  from: number; to: number; turn: 'left' | 'right'; points: ServiceAccessPoint[]; entry: InterchangePort; exit: InterchangePort;
}
export interface HighwayInterchange {
  id: string; center: RoadSample; upperHeight: number; ramps: InterchangeRamp[]; ground: ServiceGround;
}

export function highwayInterchange(id: string, center: RoadSample, options: Readonly<WorldOptions>): HighwayInterchange {
  const profile = roadProfile(options), c = profile.outerHalfWidth - 2.4, radius = 100, reach = 760;
  const upperHeight = center.position.y + 14, ramps: InterchangeRamp[] = [];
  const ground: ServiceGround = { pads: [], access: [], barriers: [], elevated: true };
  for (let from = 0; from < 4; from++) for (const turn of ['right', 'left'] as const) {
    const to = (from + (turn === 'right' ? 1 : 3)) % 4, angle = from * Math.PI / 2;
    const rotate = (u: number, v: number) => ({ u: u * Math.cos(angle) + v * Math.sin(angle), v: v * Math.cos(angle) - u * Math.sin(angle) });
    const curve: { u: number; v: number }[] = [];
    const steps = turn === 'left' ? 128 : 256;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (turn === 'left') {
        const a = Math.PI - t * Math.PI * 1.5;
        curve.push(rotate(c + radius + Math.cos(a) * radius, c + radius + Math.sin(a) * radius));
      } else {
        const r = reach - c, a = -Math.PI + t * Math.PI / 2;
        curve.push(rotate(reach + Math.cos(a) * r, -reach - Math.sin(a) * r));
      }
    }
    const first = curve[0], last = curve.at(-1)!;
    for (let d = 6; d <= 60; d += 6) curve.unshift({ u: first.u - Math.sin(angle) * d, v: first.v - Math.cos(angle) * d });
    for (let d = 6; d <= 60; d += 6) curve.push({ u: last.u + Math.sin(to * Math.PI / 2) * d, v: last.v + Math.cos(to * Math.PI / 2) * d });
    const distances = [0];
    for (let i = 1; i < curve.length; i++) distances.push(distances[i - 1] + Math.hypot(curve[i].u - curve[i - 1].u, curve[i].v - curve[i - 1].v));
    const length = distances.at(-1)!, low = from % 2 ? upperHeight : center.position.y, high = to % 2 ? upperHeight : center.position.y;
    const points = curve.map((point, i): ServiceAccessPoint => {
      const t = distances[i] / length, grade = (high - low) * 6 * t * (1 - t) / length;
      const before = curve[Math.max(0, i - 1)], after = curve[Math.min(curve.length - 1, i + 1)];
      const du = after.u - before.u, dv = after.v - before.v, scale = Math.hypot(du, dv);
      const x = center.position.x + Math.cos(center.heading) * point.u + Math.sin(center.heading) * point.v;
      const z = center.position.z + Math.sin(center.heading) * point.u - Math.cos(center.heading) * point.v;
      return { x, z, y: low + (high - low) * t * t * (3 - 2 * t), halfWidth: 3.7,
        slopeX: grade * (Math.cos(center.heading) * du + Math.sin(center.heading) * dv) / scale,
        slopeZ: grade * (Math.sin(center.heading) * du - Math.cos(center.heading) * dv) / scale };
    });
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], length = Math.hypot(b.x - a.x, b.z - a.z);
      ground.access.push({ a, b });
      const nx = (a.z - b.z) / length, nz = (b.x - a.x) / length;
      for (const side of [-1, 1]) {
        const offset = (p: ServiceAccessPoint) => ({ x: p.x + nx * side * 3.9, y: p.y + (p.slopeX * nx + p.slopeZ * nz) * side * 3.9, z: p.z + nz * side * 3.9 });
        const ra = offset(a), rb = offset(b), u = ((ra.x + rb.x) / 2 - center.position.x) * Math.cos(center.heading) + ((ra.z + rb.z) / 2 - center.position.z) * Math.sin(center.heading);
        const v = ((ra.x + rb.x) / 2 - center.position.x) * Math.sin(center.heading) - ((ra.z + rb.z) / 2 - center.position.z) * Math.cos(center.heading), y = (ra.y + rb.y) / 2;
        if (Math.abs(u) < profile.outerHalfWidth + 1 && Math.abs(y - center.position.y) < 2 || Math.abs(v) < profile.outerHalfWidth + 1 && Math.abs(y - upperHeight) < 2) continue;
        ground.barriers.push({ a: ra, b: rb });
      }
    }
    ramps.push({ from, to, turn, points, entry: { ...curve[0], direction: from }, exit: { ...curve.at(-1)!, direction: to } });
  }
  return { id, center, upperHeight, ramps, ground };
}
