import type { ServicePoint } from '../service/ServiceTerrain';
import type { SurfaceQuad } from './SurfaceRibbon';

export function appendRibbonSlab(data: number[], surface: SurfaceQuad, rim: SurfaceQuad,
  origin: { x: number; z: number }, thickness: number): void {
  const vertex = (p: ServicePoint, drop = 0.05) => [p.x - origin.x, p.y - drop, p.z - origin.z];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => data.push(...a, ...b, ...c, ...b, ...d, ...c);
  const { leftA: a, rightA: b, leftB: c, rightB: d } = surface;
  const { leftA: l, rightA: r, leftB: ll, rightB: rr } = rim;
  // Preserve the pavement's diagonal even where bank changes twist the quad.
  quad(vertex(a), vertex(b), vertex(c), vertex(d));
  quad(vertex(l), vertex(a), vertex(ll), vertex(c));
  quad(vertex(b), vertex(r), vertex(d), vertex(rr));
  const bottom = (p: ServicePoint) => vertex(p, thickness + 0.05);
  quad(bottom(ll), bottom(rr), bottom(l), bottom(r));
  quad(vertex(l), vertex(ll), bottom(l), bottom(ll));
  quad(vertex(r), bottom(r), vertex(rr), bottom(rr));
  quad(vertex(l), bottom(l), vertex(r), bottom(r));
  quad(vertex(ll), vertex(rr), bottom(ll), bottom(rr));
}
