import { RoadIndex } from './RoadIndex';
import type { ServiceBarrier, ServicePoint } from '../service/ServiceTerrain';
import type { SurfaceQuad } from './SurfaceRibbon';
import type { RoadSample } from './RoadSegment';
import { roadFrame } from './RoadFrame';

const mix = (a: ServicePoint, b: ServicePoint, t: number): ServicePoint => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

export function roadBarrierQuads(samples: readonly RoadSample[], halfWidth: number, center = 0): SurfaceQuad[] {
  const rims = samples.map(sample => {
    const right = roadFrame(sample).right;
    return [-1, 1].map(side => ({ x: sample.position.x + right.x * (center + side * halfWidth),
      y: sample.position.y + right.y * (center + side * halfWidth), z: sample.position.z + right.z * (center + side * halfWidth) }));
  });
  return rims.slice(1).map(([leftB, rightB], i) => ({ leftA: rims[i][0], rightA: rims[i][1], leftB, rightB }));
}

function covered(rail: ServiceBarrier, a: ServicePoint, b: ServicePoint, c: ServicePoint, clearance: number, diagonal: number): [number, number] | undefined {
  const bx = b.x - a.x, bz = b.z - a.z, cx = c.x - a.x, cz = c.z - a.z, det = bx * cz - bz * cx;
  if (Math.abs(det) < 1e-9) return;
  const coordinates = (p: ServicePoint) => {
    const u = ((p.x - a.x) * cz - (p.z - a.z) * cx) / det, v = (bx * (p.z - a.z) - bz * (p.x - a.x)) / det;
    return [u, v, 1 - u - v, p.y - a.y - u * (b.y - a.y) - v * (c.y - a.y)];
  };
  const start = coordinates(rail.a), end = coordinates(rail.b);
  let lo = 0, hi = 1;
  const clip = (a: number, b: number, limit: number) => {
    if (Math.abs(b - a) < 1e-12) return a >= limit;
    const t = (limit - a) / (b - a);
    if (b > a) lo = Math.max(lo, t); else hi = Math.min(hi, t);
    return hi > lo;
  };
  // Keep outer rims, but include the internal diagonal shared by the two triangles.
  for (let i = 0; i < 3; i++) if (!clip(start[i], end[i], i === diagonal ? -1e-8 : 1e-8)) return;
  if (!clip(start[3], end[3], -clearance) || !clip(-start[3], -end[3], -clearance)) return;
  return [lo, hi];
}

export function exposedBarriers(rails: readonly ServiceBarrier[], surfaces: readonly SurfaceQuad[], clearance = 0.18): ServiceBarrier[] {
  const index = new RoadIndex(surfaces.map(q => {
    const points = [q.leftA, q.rightA, q.leftB, q.rightB];
    return { a: { x: Math.min(...points.map(p => p.x)), z: Math.min(...points.map(p => p.z)) },
      b: { x: Math.max(...points.map(p => p.x)), z: Math.max(...points.map(p => p.z)) } };
  }));
  return rails.flatMap(rail => {
    const { a, b } = rail, ranges: [number, number][] = [];
    for (const i of index.within(Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z))) {
      const q = surfaces[i];
      for (const [triangle, tri] of [[q.leftA, q.rightA, q.leftB], [q.rightA, q.rightB, q.leftB]].entries()) {
        const range = covered(rail, tri[0], tri[1], tri[2], clearance, triangle === 0 ? 2 : 0);
        if (range) ranges.push(range);
      }
    }
    if (!ranges.length) return [rail];
    ranges.sort((a, b) => a[0] - b[0]);
    const result: ServiceBarrier[] = [], length = Math.hypot(b.x - a.x, b.z - a.z);
    let start = 0;
    for (const [lo, hi] of [...ranges, [1, 1]]) {
      if ((lo - start) * length > 0.001) result.push({ ...rail, a: mix(a, b, start), b: mix(a, b, lo) });
      start = Math.max(start, hi);
    }
    return result;
  });
}
