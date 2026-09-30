import type { Garage } from './Garage';
import type { RoadSample } from '../road/RoadSegment';
import { roadFrame } from '../road/RoadFrame';
import { RoadIndex } from '../road/RoadIndex';
import { accessQuads, ribbonHeight } from '../road/SurfaceRibbon';
import type { ServiceAccessPoint } from '../service/ServiceTerrain';
import { exposedBarriers, roadBarrierQuads } from '../road/RampBarrier';

const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

export function garageInterchange(garage: Garage, center: RoadSample, samples: readonly RoadSample[], halfWidth: number) {
  const c = Math.cos(center.heading), s = Math.sin(center.heading), upper = center.position.y + 14;
  const roadEdges = samples.slice(1).map((b, i) => ({ a: samples[i].position, b: b.position })), roadIndex = new RoadIndex(roadEdges);
  const point = (x: number, along: number, y = upper, halfWidth = 8): ServiceAccessPoint => ({
    x: center.position.x + c * x + s * along, z: center.position.z + s * x - c * along, y, slopeX: 0, slopeZ: 0, halfWidth,
  });
  const road = (distance: number) => {
    let low = 1, high = samples.length - 1;
    while (low < high) { const mid = (low + high) >>> 1; if (samples[mid].distance < distance) low = mid + 1; else high = mid; }
    const a = samples[low - 1], b = samples[low];
    const t = Math.max(0, Math.min(1, (distance - a.distance) / (b.distance - a.distance)));
    return { ...a, distance, position: { x: a.position.x + (b.position.x - a.position.x) * t,
      y: a.position.y + (b.position.y - a.position.y) * t, z: a.position.z + (b.position.z - a.position.z) * t },
    heading: a.heading + Math.atan2(Math.sin(b.heading - a.heading), Math.cos(b.heading - a.heading)) * t,
    bank: a.bank + (b.bank - a.bank) * t, grade: a.grade + (b.grade - a.grade) * t };
  };
  const nearest = (x: number, z: number) => {
    const hit = roadIndex.nearest(x, z)!;
    return road(samples[hit.index].distance + (samples[hit.index + 1].distance - samples[hit.index].distance) * hit.t);
  };
  const paths: ServiceAccessPoint[][] = [], accessWindows: { start: number; end: number; side: number }[] = [];
  let valid = true;
  const end = garage.point(64, -80), endX = (end.x - center.position.x) * c + (end.z - center.position.z) * s;
  const cross: ServiceAccessPoint[] = [];
  for (let x = -190; x < endX; x += 4) cross.push(point(x, 0, upper + (end.y - upper) * smooth((x - 170) / (endX - 170)), 8 + 24 * (1 - smooth((x + 170) / 40))));
  cross.push({ ...end, slopeX: 0, slopeZ: 0, halfWidth: 8 }); paths.push(cross);
  for (const side of [-1, 1]) for (const flow of [-1, 1]) {
    const startDistance = center.distance + flow * 480, offset = side * (halfWidth - 2);
    const finish = point(side * 140, flow * 4, upper, 3.7);
    const path: ServiceAccessPoint[] = [];
    for (let i = 0; i <= 128; i++) {
      const t = i / 128, u = t * t, sample = road(center.distance + flow * (4 + 476 * (1 - t) ** 2)), right = roadFrame(sample).right;
      const x = (sample.position.x + right.x * offset) * (1 - u) + finish.x * u;
      const z = (sample.position.z + right.z * offset) * (1 - u) + finish.z * u;
      path.push({ x, z, y: upper, slopeX: 0, slopeZ: 0, halfWidth: 3.7, direction: -flow * side });
    }
    const release = path.reduce((last, p, i) => {
      const near = nearest(p.x, p.z);
      return Math.hypot(p.x - near.position.x, p.z - near.position.z) < halfWidth + 5 ? i : last;
    }, 0);
    if (release >= 80) valid = false;
    for (let i = 0; i < path.length; i++) {
      const p = path[i], near = nearest(p.x, p.z), normal = roadFrame(near).normal;
      const plane = near.position.y - (normal.x * (p.x - near.position.x) + normal.z * (p.z - near.position.z)) / normal.y;
      const liftStart = Math.min(80, Math.max(28, release + 1)), blend = smooth((i - liftStart) / (96 - liftStart));
      p.y = plane + (upper - plane) * blend; p.slopeX = -normal.x / normal.y * (1 - blend); p.slopeZ = -normal.z / normal.y * (1 - blend);
    }
    paths.push(path);
    const quads = accessQuads(path.slice(1).map((b, i) => ({ a: path[i], b })));
    const distances: number[] = [];
    for (let d = 0; d <= 480; d += 2) {
      const p = road(startDistance - flow * d), right = roadFrame(p).right;
      const rail = { x: p.position.x + right.x * side * (halfWidth + 0.3), y: p.position.y + right.y * side * (halfWidth + 0.3), z: p.position.z + right.z * side * (halfWidth + 0.3) };
      if (quads.some(q => { const height = ribbonHeight(q, rail.x, rail.z); return height !== undefined && Math.abs(height - rail.y) < 0.12; })) distances.push(p.distance);
    }
    if (distances.length) accessWindows.push({ start: Math.min(...distances), end: Math.max(...distances), side });
  }
  const access = paths.flatMap(path => path.slice(1).map((b, i) => ({ a: path[i], b })));
  valid &&= accessWindows.length === 4 && access.every(({ a, b }) => Number.isFinite(a.y + b.y)
    && Math.abs(b.y - a.y) / Math.hypot(b.x - a.x, b.z - a.z) < 0.18);
  if (!valid) return { paths, accessWindows, valid };
  const ribbons = accessQuads(access), approach = samples.filter(sample => Math.abs(sample.distance - center.distance) < 650);
  const main = roadBarrierQuads(approach, halfWidth + 0.3);
  const ground = { ...garage.ground, elevated: true, access, barriers: [] as typeof garage.ground.barriers };
  const rails = ribbons.flatMap(q => [{ a: q.leftA, b: q.leftB }, { a: q.rightA, b: q.rightB }]);
  for (const [i, q] of main.entries()) for (const window of accessWindows) {
    if (approach[i].distance > window.end + 4 || approach[i + 1].distance < window.start - 4) continue;
    rails.push(window.side < 0 ? { a: q.leftA, b: q.leftB } : { a: q.rightA, b: q.rightB });
  }
  ground.barriers = exposedBarriers(rails, [...ribbons, ...main]);
  ground.barriers.push({ a: ribbons[0].leftA, b: ribbons[0].rightA });
  return { paths, accessWindows, ground, valid };
}
