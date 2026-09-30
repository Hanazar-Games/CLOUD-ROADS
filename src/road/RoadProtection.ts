import type { RoadSample } from './RoadSegment';
import type { WorldOptions } from '../world/WorldOptions';
import { hashSeed } from '../world/WorldSeed';
import type { ServiceArea } from '../service/ServicePlanner';

type Access = Pick<ServiceArea, 'start' | 'end' | 'mergeEnd' | 'accessSide' | 'accessWindows'>;

interface ProtectionContext {
  seed: string;
  options: Readonly<WorldOptions>;
  bridges: readonly { start: RoadSample; end: RoadSample }[];
  tunnels: readonly { start: RoadSample; end: RoadSample }[];
  services: readonly Access[];
}

export function hasBridgeScreen(seed: string, sample: RoadSample, options: Readonly<WorldOptions>): boolean {
  return options.roadType !== 'mountain' && sample.opening === undefined
    && hashSeed(`${seed}:screen:${sample.routeId ?? ''}:${Math.floor(sample.distance / 384)}`) % 3 === 0;
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

export function isServiceAccess(options: Readonly<WorldOptions>, services: readonly Access[], distance: number, side: number): boolean {
  return services.some(site => site.accessWindows?.some(window => window.side === side && distance >= window.start && distance <= window.end))
    || services.some(site => !site.accessWindows && site.accessSide === side && distance >= site.start && distance <= site.end)
    || (options.roadType === 'highway' && !options.oneWay || side > 0) && services.some(site => !site.accessWindows && site.accessSide === undefined && (
    site.mergeEnd ? Math.abs(distance - (site.start + site.end) / 2) >= 155 && Math.abs(distance - (site.start + site.end) / 2) <= site.mergeEnd
      : distance >= site.start + 15 && distance <= site.start + 90 || distance >= site.end - 90 && distance <= site.end - 15));
}
