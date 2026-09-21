import { clearCrossing, planCrossings, type Crossing } from './Crossings';
import { RoadCorridor } from './RoadCorridor';
import type { RoadTerrain } from './RoadGenerator';
import { RoadIndex } from './RoadIndex';
import type { RoadSample } from './RoadSegment';

export class CrossingPlanner {
  private readonly cache = new Map<string, { signature: string; site?: Crossing }>();
  private readonly empty = new RoadCorridor([]);

  constructor(private readonly seed: string, private readonly terrain: RoadTerrain) {}

  clear(): void { this.cache.clear(); }

  plan(routes: readonly (readonly RoadSample[])[], corridor: RoadCorridor): Crossing[] {
    const keys = new Set<string>(), sites: Crossing[] = [], index = new RoadIndex(corridor.edges);
    for (const samples of routes) for (const anchor of samples) {
      if (anchor.distance < 600 || anchor.distance % 1800 > 3) continue;
      const key = `${anchor.routeId ?? 'root'}:${Math.floor(anchor.distance / 1800)}`;
      if (keys.has(key)) continue;
      keys.add(key);
      const { x, y, z } = anchor.position, signature = `${anchor.distance}:${x}:${y}:${z}:${anchor.heading}`;
      let cached = this.cache.get(key);
      if (!cached || cached.signature !== signature) {
        cached = { signature, site: planCrossings(this.seed, [anchor], this.terrain, this.empty)[0] };
        this.cache.set(key, cached);
      }
      if (cached.site && clearCrossing(cached.site, corridor, index)) sites.push(cached.site);
    }
    for (const key of this.cache.keys()) if (!keys.has(key)) this.cache.delete(key);
    return sites;
  }
}
