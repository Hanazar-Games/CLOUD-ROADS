import type { RoadTerrain } from './RoadGenerator';
import type { RoadSample } from './RoadSegment';
import { roadProfile } from './RoadProfile';
import { junctionLead, junctionTail } from './JunctionSchedule';
import type { WorldOptions } from '../world/WorldOptions';

interface Obstacles {
  bridges: readonly { start: { distance: number }; end: { distance: number } }[];
  tunnels: readonly { start: { distance: number }; end: { distance: number } }[];
  services: readonly { start: number; end: number }[];
  samples: readonly RoadSample[];
}

export function crossroadSite(sample: RoadSample, terrain: RoadTerrain, options: Readonly<WorldOptions>, obstacles: Obstacles): boolean {
  const d = sample.distance;
  if (Math.abs(sample.grade) > 0.0001 || Math.abs(sample.curvature) > 0.00001
    || obstacles.bridges.some(b => b.start.distance < d + 60 && b.end.distance > d - 60)
    || obstacles.services.some(s => s.start < d + 150 && s.end > d - 150)
    || obstacles.tunnels.some(t => t.start.distance < d + junctionTail(options) && t.end.distance > d - junctionLead(options))
    || obstacles.samples.some(s => s.structure?.landmark && Math.abs(s.distance - d) < 3032)) return false;
  const extent = roadProfile(options).outerHalfWidth + 10, p = sample.position, c = Math.cos(sample.heading), s = Math.sin(sample.heading);
  for (const side of [-extent, 0, extent]) for (const along of [-extent, 0, extent]) {
    if (Math.abs(p.y - terrain.sample(p.x + c * side + s * along, p.z + s * side - c * along)) > 5) return false;
  }
  return true;
}
