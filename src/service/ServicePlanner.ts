import type { RoadTerrain } from '../road/RoadGenerator';
import type { RoadSample } from '../road/RoadSegment';
import { roadProfile } from '../road/RoadProfile';
import { roadFrame } from '../road/RoadFrame';
import { RoadIndex, type RoadEdge } from '../road/RoadIndex';
import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';
import { SERVICE_SEARCH_RADIUS, serviceTarget } from './ServiceSchedule';
import { padPoint, type ServiceAccessPoint, type ServiceGround, type ServicePad } from './ServiceTerrain';
import { PARK_HALF_WIDTH, PARK_HALF_LENGTH } from './ServiceParking';
import { serviceCrossover } from './ServiceCrossover';
import { serviceFacility, type ServiceFacility } from './ServiceArchitecture';
import { MERGE_END, serviceMerge } from './ServiceMerge';
import { Garage, GARAGE_APRON } from '../garage/Garage';
import { connectGarage } from '../garage/GarageAccess';
import { TunnelDetector, type TunnelSpan } from '../tunnel/TunnelDetector';
import { accessQuads } from '../road/SurfaceRibbon';
import { exposedBarriers } from '../road/RampBarrier';

export interface ServiceArea { id: number; sample: RoadSample; start: number; end: number; ground: ServiceGround; facility?: ServiceFacility; garages?: Garage[]; mergeEnd?: number; accessSide?: number; accessWindows?: { start: number; end: number; side: number }[] }

export class ServicePlanner {
  private readonly profile;
  private readonly cache = new Map<number, ServiceArea>();
  private readonly tunnels: TunnelDetector;

  constructor(private readonly seed: string, private readonly terrain: RoadTerrain, private readonly options: Readonly<WorldOptions> = DEFAULT_OPTIONS) {
    this.profile = roadProfile(options);
    this.tunnels = new TunnelDetector(terrain, options);
  }

  private pad(sample: RoadSample, side: number, facility?: ServiceFacility): ServicePad {
    const offset = side * (this.profile.outerHalfWidth + PARK_HALF_WIDTH + 17);
    return { x: sample.position.x + Math.cos(sample.heading) * offset, y: sample.position.y,
      z: sample.position.z + Math.sin(sample.heading) * offset, heading: sample.heading,
      grade: facility === 'garage' ? 0 : Math.max(-0.02, Math.min(0.02, sample.grade)), side, halfWidth: PARK_HALF_WIDTH, halfLength: facility === 'track' ? 180 : PARK_HALF_LENGTH };
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

  detect(samples: readonly RoadSample[], tunnels: readonly TunnelSpan[] = this.tunnels.detect(samples, [])): ServiceArea[] {
    if (!samples.length) return [];
    const first = samples[0].distance, last = samples.at(-1)!.distance, sites: ServiceArea[] = [];
    const landmarks = new Map<number, { start: number; end: number }>();
    for (const sample of samples) if (sample.structure?.landmark && !landmarks.has(sample.structure.start))
      landmarks.set(sample.structure.start, { start: sample.distance, end: sample.structure.finish });
    const reserved = [...landmarks.values()];
    const approach = (this.options.roadType === 'highway' ? MERGE_END : 220) + 160;
    const buried = (distance: number) => tunnels.some(span => distance > span.start.distance - approach && distance < span.end.distance + approach);
    let roadIndex: RoadIndex | undefined;
    const edges: RoadEdge[] = [];
    for (const id of this.cache.keys()) if (serviceTarget(this.seed, id) < first - 2000 || serviceTarget(this.seed, id) > last + 2000) this.cache.delete(id);
    for (let id = Math.max(1, Math.floor(first / 15000)); id <= Math.ceil(last / 15000); id++) {
      const target = serviceTarget(this.seed, id), facility = serviceFacility(this.seed, id);
      if (target - SERVICE_SEARCH_RADIUS < first || target + SERVICE_SEARCH_RADIUS > last) continue;
      let site = this.cache.get(id);
      if (site && buried(site.sample.distance)) { this.cache.delete(id); site = undefined; }
      if (!site) {
        if (!roadIndex) {
          for (let i = 1; i < samples.length; i++) edges.push({ a: samples[i - 1].position, b: samples[i].position });
          roadIndex = new RoadIndex(edges);
        }
        let chosen: RoadSample | undefined, score = Infinity, bucket = -1;
        for (const sample of samples) {
          if (Math.abs(sample.distance - target) > (this.profile.centers.length === 2 ? 360 : 600) || Math.floor(sample.distance / 24) === bucket) continue;
          if (reserved.some(span => sample.distance > span.start - MERGE_END - 300 && sample.distance < span.end + MERGE_END + 300)) continue;
          if (buried(sample.distance)) continue;
          bucket = Math.floor(sample.distance / 24);
          let cost = Math.abs(sample.grade) * 5000 + Math.abs(sample.curvature) * 50000 + Math.abs(sample.distance - target) * 0.025;
          for (const side of this.options.roadType === 'highway' && !this.options.oneWay ? [-1, 1] : [1]) {
            if (!this.clear(this.pad(sample, side, facility), roadIndex, edges)) { cost = Infinity; break; }
            const offset = side * (this.profile.outerHalfWidth + PARK_HALF_WIDTH + 17);
            for (const along of [-PARK_HALF_LENGTH, 0, PARK_HALF_LENGTH]) {
              const x = sample.position.x + Math.cos(sample.heading) * offset + Math.sin(sample.heading) * along;
              const z = sample.position.z + Math.sin(sample.heading) * offset - Math.cos(sample.heading) * along;
              cost += Math.abs(this.terrain.sample(x, z) - sample.position.y) * 0.3;
            }
          }
          if (cost < score) { score = cost; chosen = sample; }
        }
        if (!chosen) continue;
        const merging = this.options.roadType === 'highway' && chosen.distance - MERGE_END >= first && chosen.distance + MERGE_END <= last
          && !tunnels.some(span => span.start.distance < chosen!.distance + MERGE_END + 10 && span.end.distance > chosen!.distance - MERGE_END - 10);
        const sample = chosen, pads: ServicePad[] = [], access: ServiceGround['access'] = [];
        for (const side of this.options.roadType === 'highway' && !this.options.oneWay ? [-1, 1] : [1]) {
          const pad = this.pad(sample, side, facility);
          pads.push(pad);
          const points: ServiceAccessPoint[] = [];
          for (let i = 0; i < samples.length; i++) {
            const point = samples[i];
            const along = point.distance - sample.distance;
            if (Math.abs(along) > 220 || Math.floor(point.distance / 4) === Math.floor((samples[i - 1]?.distance ?? -4) / 4)) continue;
            const t = Math.max(0, Math.min(1, (220 - Math.abs(along)) / 140)), blend = t * t * (3 - 2 * t);
            const { right, normal } = roadFrame(point), lateral = side * (this.profile.outerHalfWidth + (merging ? this.profile.laneWidth / 2 - 0.75 : -1.5));
            const road = { x: point.position.x + right.x * lateral, y: point.position.y + right.y * lateral, z: point.position.z + right.z * lateral };
            const parking = padPoint(pad, -side * (pad.halfWidth - 6), along);
            const x = road.x + (parking.x - road.x) * blend, z = road.z + (parking.z - road.z) * blend;
            const separation = Math.abs((x - point.position.x) * Math.cos(point.heading) + (z - point.position.z) * Math.sin(point.heading)) - this.profile.outerHalfWidth;
            const settle = Math.max(0, Math.min(1, (separation - 6 - (merging ? this.profile.laneWidth : 0)) / 12)), vertical = settle * settle * (3 - 2 * settle);
            const roadY = point.position.y - (normal.x * (x - point.position.x) + normal.z * (z - point.position.z)) / normal.y;
            points.push({ x, y: roadY + (parking.y - roadY) * vertical, z,
              slopeX: -normal.x / normal.y * (1 - vertical) + Math.sin(pad.heading) * pad.grade * vertical,
              slopeZ: -normal.z / normal.y * (1 - vertical) - Math.cos(pad.heading) * pad.grade * vertical });
          }
          for (let i = 1; i < points.length; i++) access.push({ a: points[i - 1], b: points[i] });
        }
        const auxiliary = merging ? serviceMerge(samples, sample.distance, this.options) : undefined;
        const elevated = pads.some(pad => [-pad.halfWidth, 0, pad.halfWidth].some(x => [-pad.halfLength, 0, pad.halfLength].some(along => {
          const p = padPoint(pad, x, along); return p.y - this.terrain.sample(p.x, p.z) > 5;
        }))) || [...access, ...auxiliary?.access ?? []].some(({ a, b }) => [a, b].some(p => p.y - this.terrain.sample(p.x, p.z) > 5));
        const barriers: ServiceGround['barriers'] = [];
        if (elevated) {
          const rampIndex = new RoadIndex(access);
          for (const pad of pads) {
            for (const side of [-1, 1]) for (let along = -pad.halfLength; along < pad.halfLength; along += 4) {
              const a = padPoint(pad, side * pad.halfWidth, along), b = padPoint(pad, side * pad.halfWidth, Math.min(pad.halfLength, along + 4));
              if (!rampIndex.nearest((a.x + b.x) / 2, (a.z + b.z) / 2, 4.2)) barriers.push({ a, b });
            }
            for (const along of [-pad.halfLength, pad.halfLength]) barriers.push({ a: padPoint(pad, -pad.side * (pad.halfWidth - 11), along), b: padPoint(pad, pad.side * pad.halfWidth, along) });
          }
        }
        if (elevated || merging) {
          const rims = accessQuads(access, 0.2);
          for (const [index, { a }] of access.entries()) {
            const insidePad = pads.some(pad => Math.abs((a.x - pad.x) * Math.cos(pad.heading) + (a.z - pad.z) * Math.sin(pad.heading)) < pad.halfWidth
              && Math.abs((a.x - pad.x) * Math.sin(pad.heading) - (a.z - pad.z) * Math.cos(pad.heading)) < pad.halfLength + 2);
            if (insidePad) continue;
            const q = rims[index];
            for (const [from, to] of [[q.leftA, q.leftB], [q.rightA, q.rightB]]) {
              if ((roadIndex.nearest(from.x, from.z)?.distanceSquared ?? Infinity) > (this.profile.outerHalfWidth + 0.3) ** 2) barriers.push({ a: from, b: to });
            }
          }
        }
        if (merging) {
          const merge = auxiliary!;
          const joined = exposedBarriers([...barriers, ...merge.barriers], [...accessQuads(access, 0.2), ...accessQuads(merge.access, 0.25)]);
          barriers.splice(0, barriers.length, ...joined); access.push(...merge.access);
        }
        site = { id, sample, facility, mergeEnd: merging ? MERGE_END : undefined, start: sample.distance - 245, end: sample.distance + 245, ground: { pads, access, elevated, barriers } };
        if (this.profile.centers.length === 2) site.ground.crossover = serviceCrossover(this.seed, id, pads,
          samples.filter(p => Math.abs(p.distance - target) <= SERVICE_SEARCH_RADIUS), this.profile.outerHalfWidth, access);
        if (site.ground.crossover) {
          const cross = site.ground.crossover, index = new RoadIndex(cross.access), accessIndex = new RoadIndex(access);
          cross.barriers = cross.barriers.filter(({ a, b }) => {
            const nearest = accessIndex.nearest((a.x + b.x) / 2, (a.z + b.z) / 2, 8);
            if (!nearest) return true;
            const edge = access[nearest.index], width = (edge.a.halfWidth ?? 3.5) + 0.5;
            return nearest.distanceSquared > width ** 2 || Math.abs(edge.a.y + (edge.b.y - edge.a.y) * nearest.t - (a.y + b.y) / 2) > 2;
          });
          site.ground.barriers = barriers.filter(({ a, b }) => {
            const nearest = index.nearest((a.x + b.x) / 2, (a.z + b.z) / 2, 4.5);
            if (!nearest) return true;
            const edge = cross.access[nearest.index], y = edge.a.y + (edge.b.y - edge.a.y) * nearest.t;
            return Math.abs(y - (a.y + b.y) / 2) > 2;
          });
        }
        if (facility === 'garage' && !elevated) {
          site.garages = pads.flatMap(pad => {
            const heading = pad.heading - pad.side * Math.PI / 2;
            const entry = padPoint(pad, pad.side * (pad.halfWidth + 95), -100);
            const position = { x: entry.x - Math.cos(heading) * 64 - Math.sin(heading) * 80, y: pad.y,
              z: entry.z - Math.sin(heading) * 64 + Math.cos(heading) * 80 };
            const reserved = roadIndex!.nearest(position.x, position.z, GARAGE_APRON + this.profile.outerHalfWidth + 15);
            const supported = [0, GARAGE_APRON / 2, GARAGE_APRON].every(radius => Array.from({ length: 16 }, (_, i) => {
              const angle = i / 16 * Math.PI * 2;
              return this.terrain.sample(position.x + Math.cos(angle) * radius, position.z + Math.sin(angle) * radius) >= position.y - 4;
            }).every(Boolean));
            if (reserved || !supported) return [];
            const garage = new Garage(this.seed, position, 3, `service:${sample.routeId ?? 'root'}:${id}:${pad.side}`, heading);
            connectGarage(garage, { ...padPoint(pad, pad.side * (pad.halfWidth - 4), -100), slopeX: 0, slopeZ: 0 }, heading + Math.PI);
            return [garage];
          });
          if (!site.garages.length) site.facility = 'mall';
        } else if (facility === 'garage') site.facility = 'mall';
        this.cache.set(id, site);
      }
      sites.push(site);
    }
    return sites;
  }
}
