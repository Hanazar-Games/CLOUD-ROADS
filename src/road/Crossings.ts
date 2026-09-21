import { BridgeDetector, type BridgeSpan } from '../bridge/BridgeDetector';
import type { TunnelSpan } from '../tunnel/TunnelDetector';
import { DEFAULT_OPTIONS } from '../world/WorldOptions';
import { hashSeed } from '../world/WorldSeed';
import { RoadCorridor, type CorridorEdge } from './RoadCorridor';
import type { RoadTerrain } from './RoadGenerator';
import { RoadIndex } from './RoadIndex';
import { RoadSegment, type RoadSample } from './RoadSegment';

export const CROSSING_OPTIONS = { ...DEFAULT_OPTIONS, roadWidth: 6 };
export interface Crossing {
  id: string; kind: 'road' | 'rail'; anchor: RoadSample; samples: RoadSample[];
  bridges: BridgeSpan[]; tunnels: TunnelSpan[]; edges: readonly CorridorEdge[];
}

export function clearCrossing(site: Crossing, corridor: RoadCorridor): boolean {
  const index = new RoadIndex(corridor.edges);
  return site.samples.every(p => {
    if (corridor.serviceCover(p.position.x, p.position.z)) return false;
    const radius = corridor.roadHalfWidth + 12;
    for (const i of index.within(p.position.x - radius, p.position.z - radius, p.position.x + radius, p.position.z + radius)) {
      const { a, b } = corridor.edges[i], dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((p.position.x - a.x) * dx + (p.position.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(p.position.x - a.x - dx * t, p.position.z - a.z - dz * t) < radius
        && Math.abs(a.y + (b.y - a.y) * t - p.position.y) < 18) return false;
    }
    return true;
  });
}

export function planCrossings(seed: string, samples: readonly RoadSample[], terrain: RoadTerrain, corridor: RoadCorridor): Crossing[] {
  const sites: Crossing[] = [], seen = new Set<string>();
  for (const anchor of samples) {
    if (anchor.distance < 600 || anchor.distance % 1800 > 3) continue;
    const id = `crossing:${anchor.routeId ?? 'root'}:${Math.floor(anchor.distance / 1800)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const ground = terrain.sample(anchor.position.x, anchor.position.z), gap = anchor.position.y - ground;
    if (gap < 45 || corridor.serviceCover(anchor.position.x, anchor.position.z)) continue;
    const heading = anchor.heading + Math.PI / 2, y = ground + Math.min(45, gap * 0.4);
    const point = (d: number) => ({ x: anchor.position.x + Math.sin(heading) * d, y, z: anchor.position.z - Math.cos(heading) * d });
    const ends: number[] = [];
    for (const side of [-1, 1]) {
      for (let d = 32; d <= 960; d += 8) {
        const p = point(d * side);
        if (terrain.sample(p.x, p.z) <= y + 12) continue;
        if (d < 120) break;
        const inside = point((d + 48) * side);
        if (terrain.sample(inside.x, inside.z) > y + 12) ends.push((d + 48) * side);
        break;
      }
    }
    if (ends.length !== 2) continue;
    const segment = new RoadSegment({ ...anchor, position: point(ends[0]), routeId: id, distance: 0, heading, grade: 0, bank: 0, width: 6,
      mountain: undefined, climb: undefined, opening: undefined, elevated: undefined }, heading, 0, ends[1] - ends[0]);
    const count = Math.ceil(segment.length / 4), route = Array.from({ length: count + 1 }, (_, i) => segment.sample(i / count));
    const tunnels: TunnelSpan[] = [route.slice(0, 17), route.slice(-17)].map(points => ({ start: points[0], end: points.at(-1)!, samples: points }));
    const bridges = new BridgeDetector(terrain, CROSSING_OPTIONS).detect(route);
    const edges = RoadCorridor.fromSamples(route, bridges, CROSSING_OPTIONS, tunnels).edges.map(edge => ({
      a: { ...edge.a, halfWidth: 4.2 }, b: { ...edge.b, halfWidth: 4.2 },
    }));
    const site: Crossing = { id, kind: hashSeed(`${seed}:${id}`) % 2 ? 'rail' : 'road', anchor, samples: route, bridges, tunnels, edges };
    if (clearCrossing(site, corridor)) sites.push(site);
  }
  return sites;
}
