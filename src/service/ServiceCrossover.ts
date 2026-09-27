import type { RoadSample } from '../road/RoadSegment';
import { RoadIndex } from '../road/RoadIndex';
import { hashSeed } from '../world/WorldSeed';
import { padPoint, type ServiceAccessPoint, type ServiceCrossover, type ServicePad } from './ServiceTerrain';

export function serviceCrossover(seed: string, id: number, pads: ServicePad[], samples: readonly RoadSample[], outerWidth: number): ServiceCrossover | undefined {
  const right = pads.find(p => p.side === 1), left = pads.find(p => p.side === -1);
  if (!right || !left) return;
  const kind = hashSeed(`${seed}:return:${id}`) % 2 ? 'over' : 'under';
  const radius = outerWidth + 23, run = 260, entry = 80, apron = 40, turn = entry + apron + run;
  const center = { ...right, x: (right.x + left.x) / 2, z: (right.z + left.z) / 2, grade: 0 };
  const edges = samples.slice(1).map((s, i) => ({ a: samples[i].position, b: s.position })), index = new RoadIndex(edges);
  const outline: { x: number; z: number; along: number; blend: number; end: boolean }[] = [];
  const steps = Math.ceil((run + apron) / 4), arc = Math.ceil(Math.PI * radius / 4);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (let i = 0; i <= steps; i++) {
    const along = (run + apron) * i / steps;
    outline.push({ x: radius, z: entry + along, along, blend: smooth(Math.max(0, along - apron) / run), end: false });
  }
  for (let i = 1; i <= arc; i++) outline.push({ x: radius * Math.cos(Math.PI * i / arc), z: turn + radius * Math.sin(Math.PI * i / arc), along: run + apron, blend: 1, end: false });
  for (let i = steps - 1; i >= 0; i--) {
    const along = (run + apron) * i / steps;
    outline.push({ x: -radius, z: entry + along, along, blend: smooth(Math.max(0, along - apron) / run), end: true });
  }
  const crossings = outline.map(p => {
    const point = padPoint(center, p.x, p.z), nearest = index.nearest(point.x, point.z, outerWidth + 10);
    return nearest ? { p, height: edges[nearest.index].a.y + (edges[nearest.index].b.y - edges[nearest.index].a.y) * nearest.t } : undefined;
  }).filter(p => p !== undefined);
  if (!crossings.length || crossings.some(c => c.p.blend < 0.98)) return;
  const deck = kind === 'over' ? Math.max(...crossings.map(c => c.height)) + 12 : Math.min(...crossings.map(c => c.height)) - 12;
  const points: ServiceAccessPoint[] = outline.map(p => {
    const pad = p.end ? left : right, base = pad.y + pad.grade * (entry + Math.min(apron, p.along));
    const t = Math.max(0, p.along - apron) / run, hermite = run * pad.grade * t * (1 - t) ** 2;
    return { ...padPoint(center, p.x, p.z), y: base + (deck - base) * p.blend + hermite, slopeX: 0, slopeZ: 0 };
  });
  const access = points.slice(1).map((b, i) => ({ a: points[i], b }));
  if (access.some(({ a, b }) => Math.abs(b.y - a.y) > Math.hypot(b.x - a.x, b.z - a.z) * 0.12)) return;
  const barriers: ServiceCrossover['barriers'] = [];
  for (const { a, b } of access) {
    const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    // Leave the existing parking aisle and access fork open.
    if (Math.min(Math.hypot(a.x - points[0].x, a.z - points[0].z), Math.hypot(a.x - points.at(-1)!.x, a.z - points.at(-1)!.z)) < 48) continue;
    for (const side of [-1, 1]) barriers.push({
      a: { x: a.x - dz / length * side * 3.8, y: a.y, z: a.z + dx / length * side * 3.8 },
      b: { x: b.x - dz / length * side * 3.8, y: b.y, z: b.z + dx / length * side * 3.8 },
      height: kind === 'under' && Math.abs(a.y - deck) < 0.01 && Math.abs(b.y - deck) < 0.01 ? 10.5 : 1.5,
    });
  }
  const supports = points.filter((p, i) => i % 8 === 0 && !index.nearest(p.x, p.z, outerWidth + 9));
  return { kind, access, barriers, supports, deck, roof: kind === 'under' ? Math.min(...crossings.map(c => c.height)) - 1.5 : undefined };
}
