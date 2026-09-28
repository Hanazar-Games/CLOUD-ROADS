import type { RoadSample } from '../road/RoadSegment';
import { roadFrame } from '../road/RoadFrame';
import { roadProfile } from '../road/RoadProfile';
import type { WorldOptions } from '../world/WorldOptions';
import type { ServiceAccessPoint, ServiceBarrier, ServiceGround } from './ServiceTerrain';

export const MERGE_END = 650;
const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
export function mergeWidth(along: number, laneWidth: number): number {
  const d = Math.abs(along);
  return laneWidth * smooth((d - 155) / 65) * (1 - smooth((d - 410) / (MERGE_END - 410)));
}

export function serviceMerge(samples: readonly RoadSample[], distance: number, options: Readonly<WorldOptions>): Pick<ServiceGround, 'access' | 'barriers'> {
  const profile = roadProfile(options), access: ServiceGround['access'] = [], barriers: ServiceBarrier[] = [];
  for (const side of options.oneWay ? [1] : [-1, 1]) for (const direction of [-1, 1]) {
    const points: ServiceAccessPoint[] = [], rails: ServiceAccessPoint[] = [];
    for (const sample of samples) {
      const along = sample.distance - distance;
      if (along * direction < 155 || along * direction > MERGE_END) continue;
      const width = mergeWidth(along, profile.laneWidth), halfWidth = (width + 1.6) / 2;
      const { right, normal } = roadFrame(sample);
      const point = (lateral: number): ServiceAccessPoint => ({
        x: sample.position.x + right.x * lateral * side, y: sample.position.y + right.y * lateral * side,
        z: sample.position.z + right.z * lateral * side, slopeX: -normal.x / normal.y, slopeZ: -normal.z / normal.y,
        halfWidth, merge: true, side,
      });
      points.push(point(profile.outerHalfWidth - 1.55 + halfWidth));
      rails.push(point(profile.outerHalfWidth + width + 0.3));
    }
    for (let i = 1; i < points.length; i++) {
      access.push({ a: points[i - 1], b: points[i] });
      barriers.push({ a: rails[i - 1], b: rails[i] });
    }
  }
  return { access, barriers };
}
