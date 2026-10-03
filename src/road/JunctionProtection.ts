import type { ServiceBarrier, ServiceGround } from '../service/ServiceTerrain';
import type { WorldOptions } from '../world/WorldOptions';
import type { Junction, NetworkRoute } from './RoadNetwork';
import { roadProfile } from './RoadProfile';
import { exposedBarriers, roadBarrierQuads } from './RampBarrier';
import type { SurfaceQuad } from './SurfaceRibbon';

export function junctionProtection(junction: Junction, routes: readonly NetworkRoute[], options: Readonly<WorldOptions>): ServiceGround {
  const profile = roadProfile(options), surfaces: SurfaceQuad[] = [], rails: ServiceBarrier[] = [];
  for (const ramp of junction.ramps) for (const [id, start, end, side] of [
    [junction.route, ramp.sample.distance - 24, ramp.sample.distance + 304, 1], [ramp.id, 0, 304, -1],
  ] as const) {
    const road = routes.find(route => route.id === id)?.road;
    if (!road) continue;
    const first = Math.max(0, road.samples.findIndex(p => p.distance >= start) - 1);
    const last = road.samples.findIndex(p => p.distance > end);
    const samples = road.samples.slice(first, last < 0 ? undefined : last + 1);
    for (const center of profile.centers) {
      const quads = roadBarrierQuads(samples, profile.halfWidth + 0.25, center);
      surfaces.push(...quads);
      if (center !== (side > 0 ? profile.centers.at(-1) : profile.centers[0])) continue;
      rails.push(...quads.map(q => side > 0 ? { a: q.rightA, b: q.rightB, height: 1.4 } : { a: q.leftA, b: q.leftB, height: 1.4 }));
    }
  }
  return { pads: [], access: [], elevated: true, barriers: exposedBarriers(rails, surfaces) };
}
