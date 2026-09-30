import type { RoadEdge } from './RoadIndex';
import type { ServiceAccessPoint, ServicePoint } from '../service/ServiceTerrain';

export interface SurfaceQuad { leftA: ServicePoint; rightA: ServicePoint; leftB: ServicePoint; rightB: ServicePoint }

export function triangleHeight(a: ServicePoint, b: ServicePoint, c: ServicePoint, x: number, z: number): number | undefined {
  const bx = b.x - a.x, bz = b.z - a.z, cx = c.x - a.x, cz = c.z - a.z, det = bx * cz - bz * cx;
  if (Math.abs(det) < 1e-9) return;
  const u = ((x - a.x) * cz - (z - a.z) * cx) / det, v = (bx * (z - a.z) - bz * (x - a.x)) / det;
  if (u < -1e-7 || v < -1e-7 || u + v > 1 + 1e-7) return;
  return a.y + u * (b.y - a.y) + v * (c.y - a.y);
}

export function ribbonHeight(q: SurfaceQuad, x: number, z: number): number | undefined {
  return triangleHeight(q.leftA, q.rightA, q.leftB, x, z) ?? triangleHeight(q.rightA, q.rightB, q.leftB, x, z);
}

export function accessQuads(edges: readonly RoadEdge<ServiceAccessPoint>[], margin = 0): SurfaceQuad[] {
  const normals = new Map<ServiceAccessPoint, { x: number; z: number }[]>();
  for (const { a, b } of edges) {
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 1e-8) continue;
    const normal = { x: (a.z - b.z) / length, z: (b.x - a.x) / length };
    for (const p of [a, b]) { const list = normals.get(p) ?? []; list.push(normal); normals.set(p, list); }
  }
  const rims = new Map<ServiceAccessPoint, ServicePoint[]>();
  for (const [p, list] of normals) {
    let x = list.reduce((sum, n) => sum + n.x, 0), z = list.reduce((sum, n) => sum + n.z, 0);
    const length = Math.hypot(x, z);
    if (length < 1e-8) { x = list[0].x; z = list[0].z; } else { x /= length; z /= length; }
    const scale = ((p.halfWidth ?? 3.5) + margin) / Math.max(0.5, x * list[0].x + z * list[0].z);
    rims.set(p, [-1, 1].map(side => ({ x: p.x + x * scale * side, z: p.z + z * scale * side,
      y: p.y + (p.slopeX * x + p.slopeZ * z) * scale * side })));
  }
  return edges.map(({ a, b }) => {
    const [leftA, rightA] = rims.get(a) ?? [a, a], [leftB, rightB] = rims.get(b) ?? [b, b];
    return { leftA, rightA, leftB, rightB };
  });
}
