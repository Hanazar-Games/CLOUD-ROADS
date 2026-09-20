import { roadFrame } from '../road/RoadFrame';
import { RoadIndex } from '../road/RoadIndex';
import { roadProfile } from '../road/RoadProfile';
import type { World } from '../world/World';
import type { SurfaceContact, VehiclePhysics } from './VehiclePhysics';
import { hasRoadBarrier } from '../road/RoadProtection';

type DrivingWorld = Pick<World, 'seed' | 'road' | 'options' | 'bridges' | 'services' | 'tunnels'> & { sampleGround(x: number, z: number): { height: number } };

export class DrivingSurface {
  wet = false;
  private readonly profile;
  private sites;
  private access;
  private accessIndex;

  constructor(private readonly world: DrivingWorld) {
    this.profile = roadProfile(world.options);
    this.sites = world.services;
    this.access = this.sites.flatMap(site => site.ground.access);
    this.accessIndex = new RoadIndex(this.access);
  }

  readonly sample = (x: number, z: number, ceiling = Infinity): SurfaceContact => {
    const sample = this.world.road.nearest(x, z);
    if (sample) {
      const dx = x - sample.position.x, dz = z - sample.position.z;
      const lateral = dx * Math.cos(sample.heading) + dz * Math.sin(sample.heading);
      const along = dx * Math.sin(sample.heading) - dz * Math.cos(sample.heading);
      if (Math.abs(along) < 1 && this.profile.centers.some(center => Math.abs(lateral - center) <= this.profile.halfWidth)) {
        const { normal } = roadFrame(sample);
        const height = sample.position.y - (normal.x * dx + normal.z * dz) / normal.y;
        if (height <= ceiling) return { height, grip: this.wet ? 0.72 : 1 };
      }
    }
    if (this.sites !== this.world.services) {
      this.sites = this.world.services;
      this.access = this.sites.flatMap(site => site.ground.access);
      this.accessIndex = new RoadIndex(this.access);
    }
    for (const site of this.sites) for (const pad of site.ground.pads) {
      const dx = x - pad.x, dz = z - pad.z;
      const lateral = dx * Math.cos(pad.heading) + dz * Math.sin(pad.heading);
      const along = dx * Math.sin(pad.heading) - dz * Math.cos(pad.heading);
      if (Math.abs(lateral) <= pad.halfWidth && Math.abs(along) <= pad.halfLength && pad.y + pad.grade * along <= ceiling) return { height: pad.y + pad.grade * along, grip: this.wet ? 0.72 : 1 };
    }
    const access = this.accessIndex.nearest(x, z, 3.5);
    if (access) {
      const { a, b } = this.access[access.index], t = access.t;
      const height = a.y + (b.y - a.y) * t + 0.015
        + (a.slopeX + (b.slopeX - a.slopeX) * t) * (x - a.x - (b.x - a.x) * t)
        + (a.slopeZ + (b.slopeZ - a.slopeZ) * t) * (z - a.z - (b.z - a.z) * t);
      if (height <= ceiling) return { height, grip: this.wet ? 0.72 : 1 };
    }
    return { height: this.world.sampleGround(x, z).height, grip: this.wet ? 0.4 : 0.58 };
  };

  spawn(x: number, z: number): { x: number; z: number; heading: number } | undefined {
    const road = this.world.road, nearest = road.nearest(x, z);
    if (!nearest) return undefined;
    const distance = Math.max(road.segments[0].start.distance + 6, Math.min(road.segments.at(-1)!.end.distance - 6, nearest.distance));
    const sample = road.segments.find(segment => segment.start.distance <= distance && segment.end.distance >= distance)!.atDistance(distance);
    const offset = this.profile.centers.at(-1)! + this.world.options.roadWidth / 4;
    const { right } = roadFrame(sample);
    return { x: sample.position.x + right.x * offset, z: sample.position.z + right.z * offset, heading: sample.heading };
  }

  inTunnel(x: number, z: number, margin = 0): boolean {
    const sample = this.world.road.nearest(x, z);
    return !!sample && Math.hypot(x - sample.position.x, z - sample.position.z) < this.profile.outerHalfWidth + 1
      && this.world.tunnels.some(span => sample.distance >= span.start.distance - margin && sample.distance <= span.end.distance + margin);
  }

  constrain(car: VehiclePhysics, previousX: number, previousZ: number): boolean {
    const sample = this.world.road.nearest(car.x, car.z);
    if (!sample) return false;
    if (car.y < sample.position.y - 2 || car.y > sample.position.y + 3) return false;
    const cos = Math.cos(sample.heading), sin = Math.sin(sample.heading);
    const lateral = (car.x - sample.position.x) * cos + (car.z - sample.position.z) * sin;
    const previous = (previousX - sample.position.x) * cos + (previousZ - sample.position.z) * sin;
    const center = this.profile.centers.reduce((best, c) => Math.abs(previous - c) < Math.abs(previous - best) ? c : best);
    const relative = car.heading - sample.heading;
    const extent = Math.abs(Math.cos(relative)) * 0.98 + Math.abs(Math.sin(relative)) * 2.1;
    const limit = Math.max(0.8, this.profile.halfWidth - extent - 0.3);
    const road = this.world.road;
    const along = (car.x - sample.position.x) * sin - (car.z - sample.position.z) * cos;
    const endpoint = sample.distance < road.samples[0].distance + 2 && along < 2;
    const side = Math.sign(lateral - center) || 1;
    if (!endpoint && !(center && side * center < 0) && !hasRoadBarrier(this.world, sample, side)) return false;
    if (!endpoint && (Math.abs(lateral - center) <= limit || Math.abs(previous - center) > this.profile.halfWidth + 1)) return false;
    const offset = Math.max(-limit, Math.min(limit, lateral - center)) + center;
    car.x = sample.position.x + cos * offset + (endpoint ? sin * 2.2 : 0);
    car.z = sample.position.z + sin * offset - (endpoint ? cos * 2.2 : 0);
    car.speed *= 0.35;
    return true;
  }

  constrainWalker(body: { x: number; y: number; z: number }, previousX: number, previousZ: number): boolean {
    const sample = this.world.road.nearest(body.x, body.z);
    if (!sample) return false;
    const { x, y, z } = sample.position, cos = Math.cos(sample.heading), sin = Math.sin(sample.heading);
    const along = (body.x - x) * sin - (body.z - z) * cos;
    const { normal } = roadFrame(sample);
    const roadHeight = y - (normal.x * (body.x - x) + normal.z * (body.z - z)) / normal.y;
    if (Math.abs(along) > 2 || body.y + 1.75 < roadHeight - 0.2) return false;
    const bridge = this.world.bridges.some(span => sample.distance >= span.start.distance && sample.distance <= span.end.distance);
    const tunnel = this.inTunnel(body.x, body.z);
    const previous = (previousX - x) * cos + (previousZ - z) * sin;
    let lateral = (body.x - x) * cos + (body.z - z) * sin, hit = false;
    for (const center of this.profile.centers) for (const side of [-1, 1]) {
      const inner = center !== 0 && side * center < 0;
      if (!inner && !hasRoadBarrier(this.world, sample, side)) continue;
      if (body.y > roadHeight + (tunnel ? 7 : inner ? 0.85 : bridge ? 1.55 : 1.02)) continue;
      const rail = center + side * (this.profile.halfWidth + (inner ? 0 : 0.2));
      const before = previous - rail, after = lateral - rail;
      if (before * after > 0 && Math.abs(after) >= 0.42) continue;
      lateral = rail + (Math.sign(before) || -side) * 0.42;
      hit = true;
    }
    if (hit) { body.x = x + cos * lateral + sin * along; body.z = z + sin * lateral - cos * along; }
    return hit;
  }

  ceiling(x: number, z: number, feet: number): number {
    const sample = this.world.road.nearest(x, z);
    if (!sample) return Infinity;
    const dx = x - sample.position.x, dz = z - sample.position.z;
    const lateral = dx * Math.cos(sample.heading) + dz * Math.sin(sample.heading);
    if (!this.profile.centers.some(center => Math.abs(lateral - center) < this.profile.halfWidth + 0.4)) return Infinity;
    const { normal } = roadFrame(sample), road = sample.position.y - (normal.x * dx + normal.z * dz) / normal.y;
    if (feet < road - 0.15 && this.world.bridges.some(span => sample.distance >= span.start.distance && sample.distance <= span.end.distance)) return road - 3;
    return this.inTunnel(x, z) ? road + 4.5 : Infinity;
  }
}
