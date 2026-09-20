import type { RoadTerrain } from '../road/RoadGenerator';
import type { RoadSample } from '../road/RoadSegment';
import { roadProfile } from '../road/RoadProfile';
import { roadFrame } from '../road/RoadFrame';
import { RoadIndex, type RoadEdge } from '../road/RoadIndex';
import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';
import { SERVICE_SEARCH_RADIUS, serviceTarget } from './ServiceSchedule';
import { padPoint, type ServiceAccessPoint, type ServiceGround, type ServicePad } from './ServiceTerrain';

export interface ServiceArea { id: number; sample: RoadSample; start: number; end: number; ground: ServiceGround }

export class ServicePlanner {
  private readonly profile;
  private readonly cache = new Map<number, ServiceArea>();

  constructor(private readonly seed: string, private readonly terrain: RoadTerrain, private readonly options: Readonly<WorldOptions> = DEFAULT_OPTIONS) {
    this.profile = roadProfile(options);
  }

  private pad(sample: RoadSample, side: number): ServicePad {
    const offset = side * (this.profile.outerHalfWidth + 50);
    return { x: sample.position.x + Math.cos(sample.heading) * offset, y: sample.position.y,
      z: sample.position.z + Math.sin(sample.heading) * offset, heading: sample.heading,
      grade: Math.max(-0.02, Math.min(0.02, sample.grade)), side, halfWidth: 33, halfLength: 75 };
  }

  private clear(pad: ServicePad, index: RoadIndex, edges: RoadEdge[]): boolean {
    const width = pad.halfWidth + this.profile.outerHalfWidth + 10, length = pad.halfLength + this.profile.outerHalfWidth + 10;
    const radius = Math.hypot(width, length), cos = Math.cos(pad.heading), sin = Math.sin(pad.heading);
    for (const i of index.within(pad.x - radius, pad.z - radius, pad.x + radius, pad.z + radius)) {
      const { a, b } = edges[i], ax = a.x - pad.x, az = a.z - pad.z, dx = b.x - a.x, dz = b.z - a.z;
      let enter = 0, leave = 1;
      for (const [start, delta, extent] of [[ax * cos + az * sin, dx * cos + dz * sin, width], [ax * sin - az * cos, dx * sin - dz * cos, length]]) {
        if (Math.abs(delta) < 1e-9) { if (Math.abs(start) > extent) { enter = Infinity; break; } }
        else {
          const lo = (-extent - start) / delta, hi = (extent - start) / delta;
          enter = Math.max(enter, Math.min(lo, hi)); leave = Math.min(leave, Math.max(lo, hi));
        }
      }
      if (enter <= leave) return false;
    }
    return true;
  }

  detect(samples: readonly RoadSample[]): ServiceArea[] {
    if (!samples.length) return [];
    const first = samples[0].distance, last = samples.at(-1)!.distance, sites: ServiceArea[] = [];
    let roadIndex: RoadIndex | undefined;
    const edges: RoadEdge[] = [];
    for (const id of this.cache.keys()) if (serviceTarget(this.seed, id) < first - 2000 || serviceTarget(this.seed, id) > last + 2000) this.cache.delete(id);
    for (let id = Math.max(1, Math.floor(first / 15000)); id <= Math.ceil(last / 15000); id++) {
      const target = serviceTarget(this.seed, id);
      if (target - SERVICE_SEARCH_RADIUS < first || target + SERVICE_SEARCH_RADIUS > last) continue;
      let site = this.cache.get(id);
      if (!site) {
        if (!roadIndex) {
          for (let i = 1; i < samples.length; i++) edges.push({ a: samples[i - 1].position, b: samples[i].position });
          roadIndex = new RoadIndex(edges);
        }
        let chosen: RoadSample | undefined, score = Infinity, bucket = -1;
        for (const sample of samples) {
          if (Math.abs(sample.distance - target) > 600 || Math.floor(sample.distance / 24) === bucket) continue;
          bucket = Math.floor(sample.distance / 24);
          let cost = Math.abs(sample.grade) * 5000 + Math.abs(sample.curvature) * 50000 + Math.abs(sample.distance - target) * 0.025;
          for (const side of this.options.roadType === 'highway' ? [-1, 1] : [1]) {
            if (!this.clear(this.pad(sample, side), roadIndex, edges)) { cost = Infinity; break; }
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
          const pad = this.pad(sample, side);
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
        const elevated = pads.some(pad => [-33, 0, 33].some(x => [-75, 0, 75].some(along => {
          const p = padPoint(pad, x, along); return p.y - this.terrain.sample(p.x, p.z) > 5;
        }))) || access.some(({ a, b }) => [a, b].some(p => p.y - this.terrain.sample(p.x, p.z) > 5));
        const barriers: ServiceGround['barriers'] = [];
        if (elevated) {
          for (const pad of pads) {
            for (const side of [-1, 1]) barriers.push({ a: padPoint(pad, side * 33, -75), b: padPoint(pad, side * 33, 75) });
            for (const along of [-75, 75]) barriers.push({ a: padPoint(pad, -pad.side * 22, along), b: padPoint(pad, pad.side * 33, along) });
          }
          for (const { a, b } of access) {
            const length = Math.hypot(b.x - a.x, b.z - a.z), nx = (a.z - b.z) / length, nz = (b.x - a.x) / length;
            const insidePad = pads.some(pad => Math.abs((a.x - pad.x) * Math.cos(pad.heading) + (a.z - pad.z) * Math.sin(pad.heading)) < 33
              && Math.abs((a.x - pad.x) * Math.sin(pad.heading) - (a.z - pad.z) * Math.cos(pad.heading)) < 77);
            if (insidePad) continue;
            for (const side of [-1, 1]) {
              const point = (p: ServiceAccessPoint) => ({ x: p.x + nx * side * 3.7, y: p.y + (p.slopeX * nx + p.slopeZ * nz) * side * 3.7, z: p.z + nz * side * 3.7 });
              const from = point(a), to = point(b);
              if ((roadIndex.nearest(from.x, from.z)?.distanceSquared ?? Infinity) > (this.profile.outerHalfWidth + 0.3) ** 2) barriers.push({ a: from, b: to });
            }
          }
        }
        site = { id, sample, start: sample.distance - 245, end: sample.distance + 245, ground: { pads, access, elevated, barriers } };
        this.cache.set(id, site);
      }
      sites.push(site);
    }
    return sites;
  }
}
