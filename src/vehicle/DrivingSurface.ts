import { roadFrame } from '../road/RoadFrame';
import { RoadIndex } from '../road/RoadIndex';
import { roadProfile } from '../road/RoadProfile';
import type { World } from '../world/World';
import type { SurfaceContact, VehiclePhysics } from './VehiclePhysics';

type DrivingWorld = Pick<World, 'road' | 'options' | 'services' | 'tunnels'> & { sampleGround(x: number, z: number): { height: number } };

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

  readonly sample = (x: number, z: number): SurfaceContact => {
    const sample = this.world.road.nearest(x, z);
    if (sample) {
      const dx = x - sample.position.x, dz = z - sample.position.z;
      const lateral = dx * Math.cos(sample.heading) + dz * Math.sin(sample.heading);
      const along = dx * Math.sin(sample.heading) - dz * Math.cos(sample.heading);
      if (Math.abs(along) < 1 && this.profile.centers.some(center => Math.abs(lateral - center) <= this.profile.halfWidth)) {
        const { normal } = roadFrame(sample);
        return { height: sample.position.y - (normal.x * dx + normal.z * dz) / normal.y, grip: this.wet ? 0.72 : 1 };
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
      if (Math.abs(lateral) <= pad.halfWidth && Math.abs(along) <= pad.halfLength) return { height: pad.y + pad.grade * along, grip: this.wet ? 0.72 : 1 };
    }
    const access = this.accessIndex.nearest(x, z, 3.5);
    if (access) {
      const { a, b } = this.access[access.index], t = access.t;
      return { height: a.y + (b.y - a.y) * t + 0.015
        + (a.slopeX + (b.slopeX - a.slopeX) * t) * (x - a.x - (b.x - a.x) * t)
        + (a.slopeZ + (b.slopeZ - a.slopeZ) * t) * (z - a.z - (b.z - a.z) * t), grip: this.wet ? 0.72 : 1 };
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
    const cos = Math.cos(sample.heading), sin = Math.sin(sample.heading);
    const lateral = (car.x - sample.position.x) * cos + (car.z - sample.position.z) * sin;
    const previous = (previousX - sample.position.x) * cos + (previousZ - sample.position.z) * sin;
    const center = this.profile.centers.reduce((best, c) => Math.abs(previous - c) < Math.abs(previous - best) ? c : best);
    const opening = this.world.services.some(site => sample.distance > site.start && sample.distance < site.end)
      && (this.world.options.roadType === 'highway' ? (lateral - center) * center > 0 : lateral > 0);
    if (opening) return false;
    const relative = car.heading - sample.heading;
    const extent = Math.abs(Math.cos(relative)) * 0.98 + Math.abs(Math.sin(relative)) * 2.1;
    const limit = Math.max(0.8, this.profile.halfWidth - extent - 0.3);
    const road = this.world.road;
    const along = (car.x - sample.position.x) * sin - (car.z - sample.position.z) * cos;
    const endpoint = sample.distance < road.samples[0].distance + 2 && along < 2;
    if (!endpoint && (Math.abs(lateral - center) <= limit || Math.abs(previous - center) > this.profile.halfWidth + 1)) return false;
    const offset = Math.max(-limit, Math.min(limit, lateral - center)) + center;
    car.x = sample.position.x + cos * offset + (endpoint ? sin * 2.2 : 0);
    car.z = sample.position.z + sin * offset - (endpoint ? cos * 2.2 : 0);
    car.speed *= 0.35;
    return true;
  }
}
