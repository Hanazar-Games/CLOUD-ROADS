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
  const distance = sample.distance;
  if ([context.bridges, context.tunnels].some(spans => spans.some(span => distance >= span.start.distance && distance <= span.end.distance))) return true;
  if ((context.options.roadType === 'highway' || side > 0) && context.services.some(site => distance >= site.start && distance <= site.end)) return false;
  if (Math.abs(sample.curvature) > 0.002 || Math.abs(sample.grade) > 0.035) return true;
  return hashSeed(`${context.seed}:guardrail:${Math.floor(distance / 160)}:${side}`) % 4 !== 0;
}
