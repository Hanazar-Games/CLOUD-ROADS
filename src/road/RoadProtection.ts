import type { RoadSample } from './RoadSegment';
import type { WorldOptions } from '../world/WorldOptions';
import { hashSeed } from '../world/WorldSeed';

interface ProtectionContext {
  seed: string;
  options: Readonly<WorldOptions>;
  bridges: readonly { start: RoadSample; end: RoadSample }[];
  tunnels: readonly { start: RoadSample; end: RoadSample }[];
  services: readonly { start: number; end: number }[];
}

export function hasRoadBarrier(context: ProtectionContext, sample: RoadSample, side: number): boolean {
  if (sample.opening === 0 || sample.opening === side) return false;
  const distance = sample.distance;
  if (isServiceAccess(context.options, context.services, distance, side)) return false;
  if ([context.bridges, context.tunnels].some(spans => spans.some(span => span.start.routeId === sample.routeId && distance >= span.start.distance && distance <= span.end.distance))) return true;
  if (sample.junction) return true;
  if (Math.abs(sample.curvature) > 0.002 || Math.abs(sample.grade) > 0.035) return true;
  return hashSeed(`${context.seed}:guardrail:${Math.floor(distance / 160)}:${side}`) % 4 !== 0;
}

export function isServiceAccess(options: Readonly<WorldOptions>, services: readonly { start: number; end: number }[], distance: number, side: number): boolean {
  return (options.roadType === 'highway' || side > 0) && services.some(site =>
    distance >= site.start + 15 && distance <= site.start + 90 || distance >= site.end - 90 && distance <= site.end - 15);
}
