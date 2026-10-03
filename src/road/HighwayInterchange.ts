import type { RoadSample } from './RoadSegment';
import { roadProfile } from './RoadProfile';
import type { WorldOptions } from '../world/WorldOptions';
import type { ServiceAccessPoint, ServiceGround } from '../service/ServiceTerrain';
import { accessQuads } from './SurfaceRibbon';
import { exposedBarriers } from './RampBarrier';
import { INTERCHANGE_EXTENT } from './JunctionSchedule';

export interface InterchangePort { u: number; v: number; direction: number; start: number; end: number }
export interface InterchangeRamp {
  from: number; to: number; turn: 'left' | 'right'; points: ServiceAccessPoint[]; entry: InterchangePort; exit: InterchangePort;
}
export interface HighwayInterchange {
  id: string; center: RoadSample; upperHeight: number; ramps: InterchangeRamp[]; ground: ServiceGround;
}

export function highwayInterchange(id: string, center: RoadSample, options: Readonly<WorldOptions>): HighwayInterchange {
  const profile = roadProfile(options), c = profile.outerHalfWidth - 2.4, radius = 420, reach = 2700;
  const upperHeight = center.position.y + 12, ramps: InterchangeRamp[] = [];
  const ground: ServiceGround = { pads: [], access: [], barriers: [], elevated: true };
  for (let from = 0; from < 4; from++) for (const turn of ['right', 'left'] as const) {
    const to = (from + (turn === 'right' ? 1 : 3)) % 4, angle = from * Math.PI / 2;
    const rotate = (u: number, v: number) => ({ u: u * Math.cos(angle) + v * Math.sin(angle), v: v * Math.cos(angle) - u * Math.sin(angle) });
    const curve: { u: number; v: number }[] = [];
    const steps = Math.ceil((turn === 'left' ? radius * 1.5 : (reach - c) * 0.5) * Math.PI / 7);
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
    const entryEnd = curve.findIndex(p => Math.abs(from % 2 ? p.v : p.u) > profile.outerHalfWidth + 4.3);
    let exitStart = curve.length - 1;
    while (exitStart > entryEnd && Math.abs(to % 2 ? curve[exitStart].v : curve[exitStart].u) <= profile.outerHalfWidth + 4.3) exitStart--;
    const climbStart = distances[entryEnd], length = distances[exitStart] - climbStart;
    const low = from % 2 ? upperHeight : center.position.y, high = to % 2 ? upperHeight : center.position.y;
    const top = center.position.y + (from % 2 ? 32 : 22), plateau = 100;
    const ascent = (length - plateau) * (top - low) / (2 * top - low - high);
    const points = curve.map((point, i): ServiceAccessPoint => {
      const d = distances[i] - climbStart;
      const descending = d > ascent + plateau;
      const span = turn === 'right' ? length : descending ? length - ascent - plateau : ascent;
      const start = turn === 'right' || !descending ? low : top;
      const end = turn === 'right' || descending ? high : top;
      const t = Math.max(0, Math.min(1, (d - (turn === 'left' && descending ? ascent + plateau : 0)) / span));
      const grade = (end - start) * 6 * t * (1 - t) / span;
      const before = curve[Math.max(0, i - 1)], after = curve[Math.min(curve.length - 1, i + 1)];
      const du = after.u - before.u, dv = after.v - before.v, scale = Math.hypot(du, dv);
      const x = center.position.x + Math.cos(center.heading) * point.u + Math.sin(center.heading) * point.v;
      const z = center.position.z + Math.sin(center.heading) * point.u - Math.cos(center.heading) * point.v;
      return { x, z, y: start + (end - start) * t * t * (3 - 2 * t), halfWidth: 3.7,
        slopeX: grade * (Math.cos(center.heading) * du + Math.sin(center.heading) * dv) / scale,
        slopeZ: grade * (Math.sin(center.heading) * du - Math.cos(center.heading) * dv) / scale };
    });
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      ground.access.push({ a, b });
    }
    const port = (index: number, clear: number, direction: number): InterchangePort => {
      const along = direction % 2 ? 'u' : 'v', a = curve[index][along], b = curve[clear][along];
      return { ...curve[index], direction, start: Math.min(a, b) - 24, end: Math.max(a, b) + 24 };
    };
    ramps.push({ from, to, turn, points, entry: port(0, entryEnd, from), exit: port(curve.length - 1, exitStart, to) });
  }
  const rims = accessQuads(ground.access, 0.2), rails = rims.flatMap(q => [{ a: q.leftA, b: q.leftB }, { a: q.rightA, b: q.rightB }]);
  const point = (u: number, v: number, y: number): ServiceAccessPoint => ({
    x: center.position.x + Math.cos(center.heading) * u + Math.sin(center.heading) * v,
    z: center.position.z + Math.sin(center.heading) * u - Math.cos(center.heading) * v,
    y, halfWidth: profile.outerHalfWidth + 0.3, slopeX: 0, slopeZ: 0,
  });
  const main = accessQuads([
    { a: point(0, -INTERCHANGE_EXTENT, center.position.y), b: point(0, INTERCHANGE_EXTENT, center.position.y) },
    { a: point(-INTERCHANGE_EXTENT, 0, upperHeight), b: point(INTERCHANGE_EXTENT, 0, upperHeight) },
  ]);
  // Replace the removed main-road rail only outside the actual merge pavement.
  for (const ramp of ramps) for (const port of [ramp.entry, ramp.exit]) {
    const upper = port.direction % 2, offset = Math.sign(upper ? port.v : port.u) * (profile.outerHalfWidth + 0.3);
    const p = (d: number) => upper ? point(d, offset, upperHeight) : point(offset, d, center.position.y);
    rails.push({ a: p(port.start - 6), b: p(port.end + 6) });
  }
  ground.barriers = exposedBarriers(rails, [...rims, ...main]);
  return { id, center, upperHeight, ramps, ground };
}
