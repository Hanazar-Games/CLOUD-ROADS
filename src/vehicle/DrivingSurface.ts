import { roadFrame } from '../road/RoadFrame';
import { RoadIndex } from '../road/RoadIndex';
import { roadProfile } from '../road/RoadProfile';
import type { World } from '../world/World';
import type { SurfaceContact, VehiclePhysics } from './VehiclePhysics';
import { hasRoadBarrier } from '../road/RoadProtection';
import { vehicleOffset, vehicleProfiles, type VehicleProfile } from './VehicleConfig';

type DrivingWorld = Pick<World, 'seed' | 'road' | 'options' | 'bridges' | 'services' | 'tunnels' | 'groundHeight'> & Partial<Pick<World, 'network' | 'season'>>;

export class DrivingSurface {
  wet = 0;
  level: number | undefined;
  private readonly profile;
  private sites;
  private access;
  private accessIndex;
  private barriers;
  private barrierIndex;

  constructor(private readonly world: DrivingWorld) {
    this.profile = roadProfile(world.options);
    this.sites = world.services;
    this.access = this.sites.flatMap(site => site.ground.access);
    this.accessIndex = new RoadIndex(this.access);
    this.barriers = this.sites.flatMap(site => site.ground.barriers);
    this.barrierIndex = new RoadIndex(this.barriers);
  }

  readonly sample = (x: number, z: number, ceiling = Infinity): SurfaceContact => {
    const reference = Number.isFinite(ceiling) ? ceiling : this.level;
    const samples = (this.world.network?.routes ?? [this.world]).flatMap(route => {
      const sample = route.road.nearest(x, z); return sample ? [{ sample, route }] : [];
    });
    samples.sort((a, b) => {
      const error = ({ sample: p }: typeof a) => Math.hypot(x - p.position.x, z - p.position.z) + (reference === undefined ? 0 : Math.abs(p.position.y - reference) * 1.5);
      return error(a) - error(b);
    });
    for (const { sample, route } of samples) {
      const dx = x - sample.position.x, dz = z - sample.position.z;
      const lateral = dx * Math.cos(sample.heading) + dz * Math.sin(sample.heading);
      const along = dx * Math.sin(sample.heading) - dz * Math.cos(sample.heading);
      if (Math.abs(along) < 1 && this.profile.centers.some(center => Math.abs(lateral - center) <= this.profile.halfWidth)) {
        const { normal } = roadFrame(sample);
        const height = sample.position.y - (normal.x * dx + normal.z * dz) / normal.y;
        if (height <= ceiling && (this.level === undefined || Number.isFinite(ceiling) || height < this.level + 9)) {
          const sheltered = route.tunnels.some(span => sample.distance >= span.start.distance && sample.distance <= span.end.distance);
          return { height, grip: (1 - this.wet * 0.38) * (this.world.season?.grip(height, sheltered) ?? 1) };
        }
      }
    }
    this.refreshServices();
    for (const site of this.sites) for (const pad of site.ground.pads) {
      const dx = x - pad.x, dz = z - pad.z;
      const lateral = dx * Math.cos(pad.heading) + dz * Math.sin(pad.heading);
      const along = dx * Math.sin(pad.heading) - dz * Math.cos(pad.heading);
      const height = pad.y + pad.grade * along;
      if (Math.abs(lateral) <= pad.halfWidth && Math.abs(along) <= pad.halfLength && height <= ceiling) return { height, grip: (1 - this.wet * 0.38) * (this.world.season?.grip(height) ?? 1) };
    }
    const access = this.accessIndex.nearest(x, z, 3.5);
    if (access) {
      const { a, b } = this.access[access.index], t = access.t;
      const height = a.y + (b.y - a.y) * t + 0.015
        + (a.slopeX + (b.slopeX - a.slopeX) * t) * (x - a.x - (b.x - a.x) * t)
        + (a.slopeZ + (b.slopeZ - a.slopeZ) * t) * (z - a.z - (b.z - a.z) * t);
      if (height <= ceiling) return { height, grip: (1 - this.wet * 0.38) * (this.world.season?.grip(height) ?? 1) };
    }
    const height = this.world.groundHeight(x, z);
    return { height, grip: (0.58 - this.wet * 0.24) * (this.world.season?.grip(height) ?? 1) };
  };

  spawn(x: number, z: number, vehicle: VehicleProfile = vehicleProfiles.roadster): { x: number; z: number; heading: number; trailerHeading: number } | undefined {
    const road = this.world.road, nearest = road.nearest(x, z);
    if (!nearest) return undefined;
    const margin = Math.max(6, vehicle.length + 3);
    const start = road.segments[0].start.distance + margin, end = road.segments.at(-1)!.end.distance - margin;
    if (end < start) return undefined;
    const distance = Math.max(start, Math.min(end, nearest.distance));
    const offset = this.profile.centers.at(-1)! + this.world.options.roadWidth / 4;
    const point = (d: number) => {
      const sample = road.segments.find(segment => segment.start.distance <= d && segment.end.distance >= d)!.atDistance(d);
      const { right } = roadFrame(sample);
      return { x: sample.position.x + right.x * offset, z: sample.position.z + right.z * offset, heading: sample.heading };
    };
    for (let attempt = 0; attempt < 81; attempt++) {
      const d = distance + Math.ceil(attempt / 2) * 6 * (attempt % 2 ? 1 : -1);
      if (d < start || d > end) continue;
      const spawn = point(d), trailer = vehicle.trailer;
      const hitch = { x: spawn.x + Math.sin(spawn.heading) * (trailer?.hitchAlong ?? 0), z: spawn.z - Math.cos(spawn.heading) * (trailer?.hitchAlong ?? 0) };
      const rear = point(d + (trailer?.hitchAlong ?? 0) - (trailer?.wheelbase ?? 0));
      const trailerHeading = trailer ? Math.atan2(hitch.x - rear.x, rear.z - hitch.z) : spawn.heading;
      const bodies = [{ ...spawn, front: vehicle.chassisLength / 2, rear: -vehicle.chassisLength / 2 }];
      if (trailer) bodies.push({ ...hitch, heading: trailerHeading, front: trailer.front, rear: trailer.front - trailer.length });
      const fits = bodies.every(body => {
        const steps = Math.ceil(body.front - body.rear);
        for (let i = 0; i <= steps; i++) {
          const along = body.rear + (body.front - body.rear) * i / steps;
          const x = body.x + Math.sin(body.heading) * along, z = body.z - Math.cos(body.heading) * along;
          const sample = road.nearest(x, z);
          if (!sample) return false;
          const lateral = (x - sample.position.x) * Math.cos(sample.heading) + (z - sample.position.z) * Math.sin(sample.heading);
          if (!this.profile.centers.some(center => Math.abs(lateral - center) + vehicle.width / 2 + 0.18 < this.profile.halfWidth)) return false;
        }
        return true;
      });
      if (fits) { this.level = road.nearest(spawn.x, spawn.z)!.position.y; return { ...spawn, trailerHeading }; }
    }
    return undefined;
  }

  inTunnel(x: number, z: number, margin = 0): boolean {
    const route = this.route(x, z), sample = route.road.nearest(x, z);
    return !!sample && Math.hypot(x - sample.position.x, z - sample.position.z) < this.profile.outerHalfWidth + 1
      && route.tunnels.some(span => sample.distance >= span.start.distance - margin && sample.distance <= span.end.distance + margin);
  }

  exit(car: VehiclePhysics): { x: number; y: number; z: number; heading: number } | undefined {
    const floor = this.sample(car.x, car.z, car.y + 0.3).height;
    const cos = Math.cos(car.heading), sin = Math.sin(car.heading), along = car.profile.eye.along;
    for (const side of [-1, 1]) {
      const lateral = side * (car.profile.width / 2 + 0.65);
      const x = car.x + cos * lateral + sin * along, z = car.z + sin * lateral - cos * along;
      const y = this.sample(x, z, floor + 0.45).height, point = { x, y, z, heading: car.heading };
      if (Math.abs(y - floor) > 0.5 || this.ceiling(x, z, y) < y + 1.8) continue;
      if (this.constrainWalker(point, car.x + sin * along, car.z - cos * along)) continue;
      return point;
    }
    return undefined;
  }

  constrain(car: VehiclePhysics, previousX: number, previousZ: number, dt = 1 / 60): boolean {
    const bodies = car.bodies(), before = car.bodies(previousX, previousZ, true);
    for (let b = 0; b < bodies.length; b++) {
      const body = bodies[b], previous = before[b], steps = Math.ceil((body.front - body.rear) / 1.25);
      for (let i = 0; i <= steps; i++) {
        const along = body.rear + (body.front - body.rear) * i / steps;
        const offset = vehicleOffset(0, along, body.pitch, body.roll), old = vehicleOffset(0, along, previous.pitch, previous.roll);
        const point = { x: body.x - Math.sin(body.heading) * offset.z, y: body.y + offset.y,
          z: body.z + Math.cos(body.heading) * offset.z };
        const px = previous.x - Math.sin(previous.heading) * old.z, pz = previous.z + Math.cos(previous.heading) * old.z;
        const ox = point.x, oz = point.z;
        if (this.constrainBody(point, px, pz, car.profile.width / 2, car.profile.radius + car.profile.rest)) {
          const length = Math.hypot(point.x - ox, point.z - oz);
          const nx = length > 1e-8 ? (point.x - ox) / length : 0, nz = length > 1e-8 ? (point.z - oz) / length : 0;
          const fx = Math.sin(car.heading), fz = -Math.cos(car.heading), incidence = fx * nx + fz * nz;
          const tx = fx - nx * incidence, tz = fz - nz * incidence;
          const dx = car.x - previousX, dz = car.z - previousZ, normalMotion = dx * nx + dz * nz;
          const speed = car.speed * Math.hypot(tx, tz) * Math.exp(-0.08 * Math.min(0.1, Math.max(0, dt)));
          const heading = Math.hypot(tx, tz) > 0.05 ? Math.atan2(tx, -tz) : car.heading;
          car.restoreMotion(previousX, previousZ);
          car.slideMotion(previousX + dx - nx * normalMotion, previousZ + dz - nz * normalMotion, heading, speed, this.sample);
          return true;
        }
      }
    }
    return false;
  }

  private constrainBody(car: { x: number; y: number; z: number }, previousX: number, previousZ: number, width: number, ride: number): boolean {
    if (this.constrainService(car, previousX, previousZ, width + 0.08, car.y - ride)) return true;
    const route = this.route(car.x, car.z, car.y - ride), sample = route.road.nearest(car.x, car.z);
    if (!sample) return false;
    if (car.y < sample.position.y - 2 || car.y > sample.position.y + 3) return false;
    const cos = Math.cos(sample.heading), sin = Math.sin(sample.heading);
    const lateral = (car.x - sample.position.x) * cos + (car.z - sample.position.z) * sin;
    const previous = (previousX - sample.position.x) * cos + (previousZ - sample.position.z) * sin;
    const center = this.profile.centers.reduce((best, c) => Math.abs(previous - c) < Math.abs(previous - best) ? c : best);
    const limit = Math.max(0.8, this.profile.halfWidth - width - 0.3);
    const road = route.road;
    const along = (car.x - sample.position.x) * sin - (car.z - sample.position.z) * cos;
    const endpoint = !road.openStart && sample.distance < road.samples[0].distance + 2 && along < 2;
    const side = Math.sign(lateral - center) || 1;
    if (sample.opening !== undefined && this.connectedSurface(car.x, car.z, car.y - ride, width)) return false;
    if (!endpoint && !(center && side * center < 0) && !hasRoadBarrier({ ...route, options: this.world.options }, sample, side)) return false;
    if (!endpoint && (Math.abs(lateral - center) <= limit || Math.abs(previous - center) > this.profile.halfWidth + 1)) return false;
    if (!endpoint && Math.abs(lateral - center) < Math.abs(previous - center) - 0.00001) return false;
    const offset = Math.max(-limit, Math.min(limit, lateral - center)) + center;
    car.x = sample.position.x + cos * offset + (endpoint ? sin * 2.2 : 0);
    car.z = sample.position.z + sin * offset - (endpoint ? cos * 2.2 : 0);
    return true;
  }

  constrainWalker(body: { x: number; y: number; z: number }, previousX: number, previousZ: number): boolean {
    if (this.constrainService(body, previousX, previousZ, 0.42, body.y)) return true;
    const route = this.route(body.x, body.z, body.y), sample = route.road.nearest(body.x, body.z);
    if (!sample) return false;
    const { x, y, z } = sample.position, cos = Math.cos(sample.heading), sin = Math.sin(sample.heading);
    const along = (body.x - x) * sin - (body.z - z) * cos;
    const { normal } = roadFrame(sample);
    const roadHeight = y - (normal.x * (body.x - x) + normal.z * (body.z - z)) / normal.y;
    if (Math.abs(along) > 2 || body.y + 1.75 < roadHeight - 0.2) return false;
    const bridge = route.bridges.some(span => sample.distance >= span.start.distance && sample.distance <= span.end.distance);
    const tunnel = route.tunnels.some(span => sample.distance >= span.start.distance && sample.distance <= span.end.distance);
    const previous = (previousX - x) * cos + (previousZ - z) * sin;
    let lateral = (body.x - x) * cos + (body.z - z) * sin, hit = false;
    for (const center of this.profile.centers) for (const side of [-1, 1]) {
      const inner = center !== 0 && side * center < 0;
      if (sample.opening !== undefined && this.connectedSurface(body.x, body.z, body.y, 0.42)) continue;
      if (!inner && !hasRoadBarrier({ ...route, options: this.world.options }, sample, side)) continue;
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
    this.refreshServices();
    let ceiling = Infinity;
    for (const site of this.sites) if (site.ground.elevated) for (const pad of site.ground.pads) {
      const dx = x - pad.x, dz = z - pad.z;
      const along = dx * Math.sin(pad.heading) - dz * Math.cos(pad.heading), height = pad.y + pad.grade * along;
      if (feet < height - 0.15 && Math.abs(along) <= pad.halfLength
        && Math.abs(dx * Math.cos(pad.heading) + dz * Math.sin(pad.heading)) <= pad.halfWidth) ceiling = Math.min(ceiling, height - 1.45);
    }
    const access = this.accessIndex.nearest(x, z, 3.8);
    if (access && this.sites.some(site => site.ground.elevated && site.ground.access.includes(this.access[access.index]))) {
      const { a, b } = this.access[access.index], t = access.t;
      const height = a.y + (b.y - a.y) * t
        + (a.slopeX + (b.slopeX - a.slopeX) * t) * (x - a.x - (b.x - a.x) * t)
        + (a.slopeZ + (b.slopeZ - a.slopeZ) * t) * (z - a.z - (b.z - a.z) * t);
      if (feet < height - 0.15) ceiling = Math.min(ceiling, height - 1.45);
    }
    for (const route of this.world.network?.routes ?? [this.world]) {
    const sample = route.road.nearest(x, z);
    if (!sample) continue;
    const dx = x - sample.position.x, dz = z - sample.position.z;
    const lateral = dx * Math.cos(sample.heading) + dz * Math.sin(sample.heading);
    if (!this.profile.centers.some(center => Math.abs(lateral - center) < this.profile.halfWidth + 0.4)) continue;
    const { normal } = roadFrame(sample), road = sample.position.y - (normal.x * dx + normal.z * dz) / normal.y;
    if (feet < road - 0.15 && route.bridges.some(span => sample.distance >= span.start.distance && sample.distance <= span.end.distance)) ceiling = Math.min(ceiling, road - 3);
    if (feet >= road - 0.15 && route.tunnels.some(span => sample.distance >= span.start.distance && sample.distance <= span.end.distance)) ceiling = Math.min(ceiling, road + 4.5);
    }
    return ceiling;
  }

  private route(x: number, z: number, height = this.level) {
    return this.world.network?.nearest(x, z, height === undefined ? undefined : height + 1)?.route ?? this.world;
  }

  private connectedSurface(x: number, z: number, y: number, margin: number): boolean {
    return this.world.network?.routes.some(route => {
      const sample = route.road.nearest(x, z);
      if (!sample || Math.abs(sample.position.y - y) > 1.2) return false;
      const dx = x - sample.position.x, dz = z - sample.position.z;
      const lateral = dx * Math.cos(sample.heading) + dz * Math.sin(sample.heading);
      return Math.abs(dx * Math.sin(sample.heading) - dz * Math.cos(sample.heading)) < 2
        && this.profile.centers.some(center => Math.abs(lateral - center) + margin < this.profile.halfWidth);
    }) ?? false;
  }

  private refreshServices(): void {
    if (this.sites === this.world.services) return;
    this.sites = this.world.services;
    this.access = this.sites.flatMap(site => site.ground.access);
    this.accessIndex = new RoadIndex(this.access);
    this.barriers = this.sites.flatMap(site => site.ground.barriers);
    this.barrierIndex = new RoadIndex(this.barriers);
  }

  private constrainService(body: { x: number; y: number; z: number }, previousX: number, previousZ: number, radius: number, feet: number): boolean {
    this.refreshServices();
    let hit = false;
    for (const index of this.barrierIndex.within(Math.min(body.x, previousX) - radius, Math.min(body.z, previousZ) - radius,
      Math.max(body.x, previousX) + radius, Math.max(body.z, previousZ) + radius)) {
      const { a, b } = this.barriers[index], dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
      const t = ((body.x - a.x) * dx + (body.z - a.z) * dz) / (length * length);
      if (t < -radius / length || t > 1 + radius / length) continue;
      const height = a.y + (b.y - a.y) * Math.max(0, Math.min(1, t));
      if (feet + 1.75 < height || feet > height + 1.5) continue;
      const nx = -dz / length, nz = dx / length;
      const before = (previousX - a.x) * nx + (previousZ - a.z) * nz, after = (body.x - a.x) * nx + (body.z - a.z) * nz;
      if (before * after > 0 && (Math.abs(after) >= radius || Math.abs(after) > Math.abs(before) + 0.00001)) continue;
      const correction = (Math.sign(before) || 1) * radius - after;
      body.x += nx * correction; body.z += nz * correction; hit = true;
    }
    return hit;
  }
}
