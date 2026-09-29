import type { RoadTerrain } from './RoadGenerator';
import { roadProfile } from './RoadProfile';
import { ROAD_STEP, RoadSegment, type RoadControlPoint, type StructurePlan } from './RoadSegment';
import { absoluteElevation, type WorldOptions } from '../world/WorldOptions';
import { hashSeed } from '../world/WorldSeed';

export function landmarkTarget(seed: string, previous: number, options: Readonly<WorldOptions>): number {
  const random = hashSeed(`${seed}:landmark:${Math.round(previous)}`) / 4294967296;
  return previous + options.landmarkMin + random * Math.max(0, options.landmarkMax - options.landmarkMin - 12000);
}

export function planLandmark(start: RoadControlPoint, terrain: RoadTerrain, options: Readonly<WorldOptions>): StructurePlan | undefined {
  const sin = Math.sin(start.heading), cos = Math.cos(start.heading), halfWidth = roadProfile(options).outerHalfWidth + 8;
  const ground = (along: number) => Math.max(...[-halfWidth, 0, halfWidth].map(offset =>
    terrain.sample(start.position.x + sin * along + cos * offset, start.position.z - cos * along + sin * offset)));
  for (const steps of [0, 8, 16, 24, 32]) {
    const length = steps * ROAD_STEP * 2, approach: number[] = [];
    let height = -Infinity;
    for (let d = 0; d <= options.landmarkLength; d += 20) height = Math.max(height, ground(length + d));
    height += options.landmarkClearance;
    if (absoluteElevation(options)) {
      height = Math.max(height, options.altitudeMin);
      if (height > options.altitudeMax) continue;
    }
    if (!steps) { if (start.grade !== 0 || start.position.y < height) continue; }
    else {
      const peak = 2 * (height - start.position.y) / length - start.grade / 2;
      if (Math.abs(peak) > Math.min(0.08, options.maxGrade)) continue;
      for (let i = 1; i <= steps * 2; i++) {
        const t = (i <= steps ? i : i - steps) / steps, blend = t * t * (3 - 2 * t);
        approach.push(i <= steps ? start.grade + (peak - start.grade) * blend : peak * (1 - blend));
      }
    }
    let point = start;
    let valid = true;
    for (const grade of approach) {
      const segment = new RoadSegment(point, start.heading, grade);
      if (absoluteElevation(options)) for (let i = 0; i <= 16; i++) {
        const y = segment.sample(i / 16).position.y;
        if (y < options.altitudeMin || y > options.altitudeMax) valid = false;
      }
      point = segment.end;
    }
    if (!valid) continue;
    return { kind: 'bridge', landmark: true, start: point.distance, end: point.distance + options.landmarkLength,
      finish: point.distance + options.landmarkLength + ROAD_STEP, heading: start.heading, grade: 0, approach };
  }
}
