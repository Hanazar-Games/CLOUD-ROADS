import type { RoadTerrain } from '../road/RoadGenerator';
import type { RoadSample } from '../road/RoadSegment';
import { roadProfile } from '../road/RoadProfile';
import { roadFrame } from '../road/RoadFrame';
import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';
import { hashSeed } from '../world/WorldSeed';
import { padPoint, type ServiceAccessPoint, type ServiceGround, type ServicePad } from './ServiceTerrain';

export interface ServiceArea { id: number; sample: RoadSample; start: number; end: number; ground: ServiceGround }
export const SERVICE_SEARCH_RADIUS = 840;
export const serviceTarget = (seed: string, id: number): number => id * 15000 + (hashSeed(`${seed}:services:${id}`) % 3601) - 1800;

export class ServicePlanner {
  private readonly profile;
  private readonly cache = new Map<number, ServiceArea>();

  constructor(private readonly seed: string, private readonly terrain: RoadTerrain, private readonly options: Readonly<WorldOptions> = DEFAULT_OPTIONS) {
    this.profile = roadProfile(options);
  }

  detect(samples: readonly RoadSample[]): ServiceArea[] {
    if (!samples.length) return [];
    const first = samples[0].distance, last = samples.at(-1)!.distance, sites: ServiceArea[] = [];
    for (const id of this.cache.keys()) if (serviceTarget(this.seed, id) < first - 2000 || serviceTarget(this.seed, id) > last + 2000) this.cache.delete(id);
    for (let id = Math.max(1, Math.floor(first / 15000)); id <= Math.ceil(last / 15000); id++) {
      const target = serviceTarget(this.seed, id);
      if (target - SERVICE_SEARCH_RADIUS < first || target + SERVICE_SEARCH_RADIUS > last) continue;
      let site = this.cache.get(id);
      if (!site) {
        let chosen: RoadSample | undefined, score = Infinity, bucket = -1;
        for (const sample of samples) {
          if (Math.abs(sample.distance - target) > 600 || Math.floor(sample.distance / 24) === bucket) continue;
          bucket = Math.floor(sample.distance / 24);
          let cost = Math.abs(sample.grade) * 5000 + Math.abs(sample.curvature) * 50000 + Math.abs(sample.distance - target) * 0.025;
          for (const side of this.options.roadType === 'highway' ? [-1, 1] : [1]) {
            const offset = side * (this.profile.outerHalfWidth + 50);
            for (const along of [-75, 0, 75]) {
              const x = sample.position.x + Math.cos(sample.heading) * offset + Math.sin(sample.heading) * along;
              const z = sample.position.z + Math.sin(sample.heading) * offset - Math.cos(sample.heading) * along;
              cost += Math.abs(this.terrain.sample(x, z) - sample.position.y) * 0.3;
            }
          }
          if (cost < score) { score = cost; chosen = sample; }
        }
        if (!chosen) continue;
        const sample = chosen, pads: ServicePad[] = [], access: ServiceGround['access'] = [];
        for (const side of this.options.roadType === 'highway' ? [-1, 1] : [1]) {
          const offset = side * (this.profile.outerHalfWidth + 50);
          const pad: ServicePad = { x: sample.position.x + Math.cos(sample.heading) * offset, y: sample.position.y,
            z: sample.position.z + Math.sin(sample.heading) * offset, heading: sample.heading,
            grade: Math.max(-0.02, Math.min(0.02, sample.grade)), side, halfWidth: 33, halfLength: 75 };
          pads.push(pad);
          const points: ServiceAccessPoint[] = [];
          for (let i = 0; i < samples.length; i++) {
            const point = samples[i];
            const along = point.distance - sample.distance;
            if (Math.abs(along) > 220 || Math.floor(point.distance / 4) === Math.floor((samples[i - 1]?.distance ?? -4) / 4)) continue;
            const t = Math.max(0, Math.min(1, (220 - Math.abs(along)) / 140)), blend = t * t * (3 - 2 * t);
            const { right, normal } = roadFrame(point), lateral = side * (this.profile.outerHalfWidth - 1.5);
            const road = { x: point.position.x + right.x * lateral, y: point.position.y + right.y * lateral, z: point.position.z + right.z * lateral };
            const parking = padPoint(pad, -side * 27, along);
            const x = road.x + (parking.x - road.x) * blend, z = road.z + (parking.z - road.z) * blend;
            const separation = Math.abs((x - point.position.x) * Math.cos(point.heading) + (z - point.position.z) * Math.sin(point.heading)) - this.profile.outerHalfWidth;
            const settle = Math.max(0, Math.min(1, (separation - 6) / 12)), vertical = settle * settle * (3 - 2 * settle);
            const roadY = point.position.y - (normal.x * (x - point.position.x) + normal.z * (z - point.position.z)) / normal.y;
            points.push({ x, y: roadY + (parking.y - roadY) * vertical, z,
              slopeX: -normal.x / normal.y * (1 - vertical) + Math.sin(pad.heading) * pad.grade * vertical,
              slopeZ: -normal.z / normal.y * (1 - vertical) - Math.cos(pad.heading) * pad.grade * vertical });
          }
          for (let i = 1; i < points.length; i++) access.push({ a: points[i - 1], b: points[i] });
        }
        site = { id, sample, start: sample.distance - 245, end: sample.distance + 245, ground: { pads, access } };
        this.cache.set(id, site);
      }
      sites.push(site);
    }
    return sites;
  }
}
