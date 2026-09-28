import { roadFrame } from '../road/RoadFrame';
import { RoadIndex } from '../road/RoadIndex';
import { roadProfile } from '../road/RoadProfile';
import type { World } from '../world/World';
import type { SurfaceContact, VehiclePhysics } from './VehiclePhysics';
import { hasBridgeScreen, hasRoadBarrier } from '../road/RoadProtection';
import { vehicleOffset, vehicleProfiles, type VehicleProfile } from './VehicleConfig';
import { padPoint, crossoverShelter } from '../service/ServiceTerrain';
import { constrainObstacle, constrainVehicle } from '../service/ServiceCollision';
import { serviceObstacles } from '../service/ServiceAmenities';
import { vehicleSupport } from './VehicleSolids';

type DrivingWorld = Pick<World, 'seed' | 'road' | 'options' | 'bridges' | 'services' | 'tunnels' | 'groundHeight'> & Partial<Pick<World, 'network' | 'season' | 'garage' | 'garages'>>
  & { parkedVehicles?: Pick<World['parkedVehicles'], 'fleet'>; traffic?: World['traffic'] };

export class DrivingSurface {
  wet = 0;
  level: number | undefined;
  parkedVehicle?: VehiclePhysics;
  walking = false;
  private readonly profile;
  private sites;
  private access;
  private accessIndex;
  private barriers;
  private barrierIndex;

  constructor(private readonly world: DrivingWorld) {
    this.profile = roadProfile(world.options);
    this.sites = world.services;
    this.access = this.sites.flatMap(site => [...site.ground.access, ...site.ground.crossover?.access ?? []]);
    this.accessIndex = new RoadIndex(this.access);
    this.barriers = this.sites.flatMap(site => [...site.ground.barriers, ...site.ground.crossover?.barriers ?? []]);
    this.barrierIndex = new RoadIndex(this.barriers);
  }

  readonly sample = (x: number, z: number, ceiling = Infinity): SurfaceContact => {
    const ground = this.ground(x, z, ceiling);
    if (!this.walking || !Number.isFinite(ceiling)) return ground;
    const supports = [this.parkedVehicle && vehicleSupport(this.parkedVehicle, x, z, ceiling),
      this.world.parkedVehicles?.fleet.support(x, z, ceiling), this.world.traffic?.support(x, z, ceiling)];
    for (const height of supports) if (height !== undefined && height > ground.height) ground.height = height;
    return ground;
  };

  private ground(x: number, z: number, ceiling = Infinity): SurfaceContact {
    const reference = Number.isFinite(ceiling) ? ceiling : this.level;
    for (const garage of this.garages) {
      const height = garage.surface(x, z, reference, ceiling);
      if (height !== undefined) return { height, grip: garage.shelter(x, height + 0.5, z) ? 1
        : (1 - this.wet * 0.38) * (this.world.season?.grip(height) ?? 1) };
    }
    const surfaces: SurfaceContact[] = [];
    const add = (height: number, sheltered = false) => {
      if (height <= ceiling && (this.level === undefined || Number.isFinite(ceiling) || height < this.level + 9))
        surfaces.push({ height, grip: (1 - this.wet * 0.38) * (this.world.season?.grip(height, sheltered) ?? 1) });
    };
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
        add(height, route.tunnels.some(span => sample.distance >= span.start.distance && sample.distance <= span.end.distance));
      }
    }
    this.refreshServices();
    for (const site of this.sites) for (const pad of site.ground.pads) {
      const dx = x - pad.x, dz = z - pad.z;
      const lateral = dx * Math.cos(pad.heading) + dz * Math.sin(pad.heading);
      const along = dx * Math.sin(pad.heading) - dz * Math.cos(pad.heading);
      const height = pad.y + pad.grade * along;
      if (Math.abs(lateral) <= pad.halfWidth && Math.abs(along) <= pad.halfLength) add(height);
    }
    for (const i of this.accessIndex.within(x - 8, z - 8, x + 8, z + 8)) {
      const { a, b } = this.access[i], dx = b.x - a.x, dz = b.z - a.z;
      const along = ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz);
      const joint = 0.4 / Math.hypot(dx, dz);
      if (along < -joint || along > 1 + joint) continue;
      const t = along;
      if (Math.hypot(x - a.x - dx * t, z - a.z - dz * t) > (a.halfWidth ?? 3.5) + ((b.halfWidth ?? 3.5) - (a.halfWidth ?? 3.5)) * t) continue;
      const height = a.y + (b.y - a.y) * t + 0.015
        + (a.slopeX + (b.slopeX - a.slopeX) * t) * (x - a.x - (b.x - a.x) * t)
        + (a.slopeZ + (b.slopeZ - a.slopeZ) * t) * (z - a.z - (b.z - a.z) * t);
      add(height);
    }
    if (surfaces.length) return reference === undefined ? surfaces[0] : surfaces.reduce((best, s) => Math.abs(s.height - reference) < Math.abs(best.height - reference) ? s : best);
    const height = this.world.groundHeight(x, z);
    return { height, grip: (0.58 - this.wet * 0.24) * (this.world.season?.grip(height) ?? 1) };
  }

  spawn(x: number, z: number, vehicle: VehicleProfile = vehicleProfiles.roadster): { x: number; z: number; heading: number; trailerHeading: number } | undefined {
    const road = this.world.road, nearest = road.nearest(x, z);
    if (!nearest) return undefined;
    const margin = Math.max(6, vehicle.length + 3);
    const start = road.segments[0].start.distance + margin, end = road.segments.at(-1)!.end.distance - margin;
    if (end < start) return undefined;
    const distance = Math.max(start, Math.min(end, nearest.distance));
    const direction = this.world.options.oneWay && this.world.network?.active.id === 'back' ? -1 : 1;
    const offset = this.profile.lanes.filter(lane => lane.direction === 1).at(-1)!.offset * direction;
    const point = (d: number) => {
      const sample = road.segments.find(segment => segment.start.distance <= d && segment.end.distance >= d)!.atDistance(d);
      const { right } = roadFrame(sample);
      return { x: sample.position.x + right.x * offset, z: sample.position.z + right.z * offset, heading: sample.heading + (direction < 0 ? Math.PI : 0) };
    };
    for (let attempt = 0; attempt < 81; attempt++) {
      const d = distance + Math.ceil(attempt / 2) * 6 * (attempt % 2 ? 1 : -1);
      if (d < start || d > end) continue;
      const spawn = point(d), trailer = vehicle.trailer;
      const hitch = { x: spawn.x + Math.sin(spawn.heading) * (trailer?.hitchAlong ?? 0), z: spawn.z - Math.cos(spawn.heading) * (trailer?.hitchAlong ?? 0) };
      const rear = point(d + direction * ((trailer?.hitchAlong ?? 0) - (trailer?.wheelbase ?? 0)));
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
          const point = { x, y: sample.position.y, z };
          if (this.constrainService(point, x, z, vehicle.width / 2 + 0.15, point.y, vehicle.height)) return false;
        }
        return true;
      });
      if (fits) { this.level = road.nearest(spawn.x, spawn.z)!.position.y; return { ...spawn, trailerHeading }; }
    }
    return undefined;
  }

  inTunnel(x: number, z: number, margin = 0): boolean {
    if (this.garages.some(g => g.shelter(x, (this.level ?? Infinity) + 1.5, z))) return true;
    if (this.level !== undefined && this.world.services.some(site => crossoverShelter(site.ground.crossover, x, this.level!, z) > 0.5)) return true;
    const route = this.route(x, z), sample = route.road.nearest(x, z);
    return !!sample && Math.hypot(x - sample.position.x, z - sample.position.z) < this.profile.outerHalfWidth + 1
      && route.tunnels.some(span => sample.distance >= span.start.distance - margin && sample.distance <= span.end.distance + margin);
  }

  exit(car: VehiclePhysics): { x: number; y: number; z: number; heading: number } | undefined {
    return this.exits(car)[0];
  }

  canBoard(car: VehiclePhysics, person: { x: number; y: number; z: number }): boolean {
    return this.boardingDistance(car, person) < 2.2;
  }

  boardingDistance(car: VehiclePhysics, person: { x: number; y: number; z: number }): number {
    let distance = Infinity;
    for (const point of this.exits(car)) if (Math.abs(point.y - person.y) < 0.6 && !this.constrainWalker({ ...point }, person.x, person.z))
      distance = Math.min(distance, Math.hypot(point.x - person.x, point.z - person.z));
    return distance;
  }

  private exits(car: VehiclePhysics): { x: number; y: number; z: number; heading: number }[] {
    const offset = vehicleOffset(0, car.profile.eye.along, car.pitch, car.roll);
    const cos = Math.cos(car.heading), sin = Math.sin(car.heading);
    const cabX = car.x - sin * offset.z, cabZ = car.z + cos * offset.z;
    const floor = this.sample(cabX, cabZ, car.y + offset.y + 0.3).height;
    const points: { x: number; y: number; z: number; heading: number }[] = [];
    const clearance = car.y + offset.y - floor;
    if (clearance < -0.3 || clearance > car.profile.radius + car.profile.rest + car.profile.travel + 0.5) return points;
    for (const side of car.profile.bus ? [1] : [-1, 1]) {
      const lateral = side * (car.profile.width / 2 + 0.65);
      const x = cabX + cos * lateral, z = cabZ + sin * lateral;
      const y = this.sample(x, z, floor + 0.45).height, point = { x, y, z, heading: car.heading };
      if (Math.abs(y - floor) > 0.5 || this.ceiling(x, z, y) < y + 1.8) continue;
      if (this.constrainWalker(point, cabX, cabZ)) continue;
      points.push(point);
    }
    return points;
  }

  readonly constrain = (car: VehiclePhysics, previousX: number, previousZ: number, dt = 1 / 60): boolean => {
    const before = car.bodies(previousX, previousZ, true);
    let hit = false;
    for (let pass = 0; pass < 5; pass++) {
      const bodies = car.bodies();
      let correctionX = 0, correctionZ = 0, depth = 1e-7;
      for (let b = 0; b < bodies.length; b++) {
        const body = bodies[b], previous = before[b], steps = Math.ceil((body.front - body.rear) / 1.25);
        for (let i = 0; i <= steps; i++) {
          const along = body.rear + (body.front - body.rear) * i / steps;
          const offset = vehicleOffset(0, along, body.pitch, body.roll), old = vehicleOffset(0, along, previous.pitch, previous.roll);
          const point = { x: body.x - Math.sin(body.heading) * offset.z, y: body.y + offset.y,
            z: body.z + Math.cos(body.heading) * offset.z };
          const px = previous.x - Math.sin(previous.heading) * old.z, pz = previous.z + Math.cos(previous.heading) * old.z;
          const ox = point.x, oz = point.z;
          if (this.constrainBody(point, px, pz, car.profile.width / 2, car.profile.radius + car.profile.rest, car.profile.height)) {
            const length = Math.hypot(point.x - ox, point.z - oz);
            if (length > depth) { depth = length; correctionX = point.x - ox; correctionZ = point.z - oz; }
          }
        }
      }
      if (depth === 1e-7) break;
      if (!hit) { car.restoreHeading(this.sample); hit = true; continue; }
      car.slideMotion(correctionX, correctionZ, correctionX / depth, correctionZ / depth, pass === 1 ? Math.min(0.1, Math.max(0, dt)) : 0, this.sample);
    }
    return hit;
  };

  private constrainBody(car: { x: number; y: number; z: number }, previousX: number, previousZ: number, width: number, ride: number, height: number): boolean {
    if (this.constrainService(car, previousX, previousZ, width + 0.08, car.y - ride, height)) return true;
    return this.constrainRoad(car, previousX, previousZ, width + 0.06, car.y - ride, height);
  }

  constrainWalker(body: { x: number; y: number; z: number }, previousX: number, previousZ: number): boolean {
    const parked = this.parkedVehicle && constrainVehicle(body, previousX, previousZ, 0.42, body.y, this.parkedVehicle);
    const world = this.constrainService(body, previousX, previousZ, 0.42, body.y)
      || this.constrainRoad(body, previousX, previousZ, 0.32, body.y, 1.75);
    return world || !!parked;
  }

  private constrainRoad(body: { x: number; y: number; z: number }, previousX: number, previousZ: number, radius: number, feet: number, height: number): boolean {
    const route = this.route(body.x, body.z, feet), sample = route.road.nearest(body.x, body.z);
    if (!sample) return false;
    const { x, y, z } = sample.position, cos = Math.cos(sample.heading), sin = Math.sin(sample.heading);
    let along = (body.x - x) * sin - (body.z - z) * cos;
    const { right, normal } = roadFrame(sample);
    const roadHeight = y - (normal.x * (body.x - x) + normal.z * (body.z - z)) / normal.y;
    if (feet + height < roadHeight - 0.2) return false;
    const endpoint = !route.road.openStart && sample.distance < route.road.samples[0].distance + 2 && along < 2;
    if (!endpoint && Math.abs(along) > 2) return false;
    const bridge = route.bridges.some(span => sample.distance >= span.start.distance && sample.distance <= span.end.distance);
    const tunnel = route.tunnels.some(span => sample.distance >= span.start.distance && sample.distance <= span.end.distance);
    const previous = (previousX - x) * cos + (previousZ - z) * sin;
    let lateral = (body.x - x) * cos + (body.z - z) * sin, hit = false;
    if (endpoint && feet < roadHeight + 2 && this.profile.centers.some(center => Math.abs(lateral - center) < this.profile.halfWidth + radius)) {
      along = 2.2; hit = true;
    }
    for (const center of this.profile.centers) for (const side of [-1, 1]) {
      const inner = center !== 0 && side * center < 0;
      if (sample.opening !== undefined && this.connectedSurface(body.x, body.z, feet, radius)) continue;
      if (!inner && !hasRoadBarrier({ ...route, options: this.world.options }, sample, side)) continue;
      const offset = center + side * (this.profile.halfWidth + (inner ? 0.2 : tunnel ? 0.65 : bridge ? 0.25 : 0.3));
      const railHeight = y + right.y * offset;
      const screen = bridge && hasBridgeScreen(this.world.seed, sample, this.world.options)
        && !this.sites.some(site => sample.distance >= site.start - 20 && sample.distance <= site.end + 20);
      if (feet > railHeight + (inner ? 0.85 : tunnel ? 7 : bridge ? screen ? 4 : 1.55 : 1.02) || feet + height < railHeight - 0.2) continue;
      const rail = offset * Math.cos(sample.bank), clearance = radius + (inner || bridge ? 0.175 : 0.08);
      const before = previous - rail, after = lateral - rail;
      if (before * after > 0 && (Math.abs(after) >= clearance - 1e-7 || Math.abs(after) > Math.abs(before) + 1e-7)) continue;
      lateral = rail + (Math.sign(before) || -side) * clearance;
      hit = true;
    }
    if (hit) { body.x = x + cos * lateral + sin * along; body.z = z + sin * lateral - cos * along; }
    return hit;
  }

  ceiling(x: number, z: number, feet: number): number {
    this.refreshServices();
    let ceiling = Math.min(Infinity, ...this.garages.map(g => g.ceiling(x, z, feet)));
    for (const site of this.sites) if (site.ground.elevated) for (const pad of site.ground.pads) {
      const dx = x - pad.x, dz = z - pad.z;
      const along = dx * Math.sin(pad.heading) - dz * Math.cos(pad.heading), height = pad.y + pad.grade * along;
      if (feet < height - 0.15 && Math.abs(along) <= pad.halfLength
        && Math.abs(dx * Math.cos(pad.heading) + dz * Math.sin(pad.heading)) <= pad.halfWidth) ceiling = Math.min(ceiling, height - 1.45);
    }
    const access = this.accessIndex.nearest(x, z, 8);
    if (access && access.distanceSquared <= ((this.access[access.index].a.halfWidth ?? 3.5) + 0.3) ** 2 && this.sites.some(site => site.ground.elevated && site.ground.access.includes(this.access[access.index])
      || site.ground.crossover?.access.includes(this.access[access.index]))) {
      const { a, b } = this.access[access.index], t = access.t;
      const height = a.y + (b.y - a.y) * t
        + (a.slopeX + (b.slopeX - a.slopeX) * t) * (x - a.x - (b.x - a.x) * t)
        + (a.slopeZ + (b.slopeZ - a.slopeZ) * t) * (z - a.z - (b.z - a.z) * t);
      if (feet < height - 0.15) ceiling = Math.min(ceiling, height - 1.45);
    }
    for (const site of this.sites) {
      const cross = site.ground.crossover;
      if (cross?.roof === undefined || feet >= cross.roof) continue;
      if (cross.access.some(({ a, b }) => Math.abs(a.y - cross.deck) < 0.01 && Math.abs(b.y - cross.deck) < 0.01
        && Math.hypot(x - (a.x + b.x) / 2, z - (a.z + b.z) / 2) < 4.5)) ceiling = Math.min(ceiling, cross.roof);
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

  private get garages() { return this.world.garages ?? (this.world.garage ? [this.world.garage] : []); }

  private refreshServices(): void {
    if (this.sites === this.world.services) return;
    this.sites = this.world.services;
    this.access = this.sites.flatMap(site => [...site.ground.access, ...site.ground.crossover?.access ?? []]);
    this.accessIndex = new RoadIndex(this.access);
    this.barriers = this.sites.flatMap(site => [...site.ground.barriers, ...site.ground.crossover?.barriers ?? []]);
    this.barrierIndex = new RoadIndex(this.barriers);
  }

  private constrainService(body: { x: number; y: number; z: number }, previousX: number, previousZ: number, radius: number, feet: number, height = 1.75): boolean {
    this.refreshServices();
    let hit = this.world.parkedVehicles?.fleet.constrain(body, previousX, previousZ, radius, feet, height) ?? false;
    for (const garage of this.garages) hit = garage.constrain(body, previousX, previousZ, radius, feet, height) || hit;
    hit = (this.world.traffic?.constrain(body, previousX, previousZ, radius, feet, height) ?? false) || hit;
    for (const site of this.sites) for (const pad of site.ground.pads) {
      if (pad.x < Math.min(body.x, previousX) - 150 || pad.x > Math.max(body.x, previousX) + 150
        || pad.z < Math.min(body.z, previousZ) - 150 || pad.z > Math.max(body.z, previousZ) + 150) continue;
      for (const [x, along, width, length, obstacleHeight] of serviceObstacles) {
        const height = site.facility === 'mall' && x === 53 ? 16 : obstacleHeight;
        const p = padPoint(pad, x * pad.side, along);
        if (feet < p.y - 0.6 || feet > p.y + height) continue;
        hit = constrainObstacle(body, previousX, previousZ, radius, { ...p, heading: pad.heading, width, front: length / 2, rear: -length / 2 }) || hit;
      }
    }
    const reach = radius + 0.08;
    for (const index of this.barrierIndex.within(Math.min(body.x, previousX) - reach, Math.min(body.z, previousZ) - reach,
      Math.max(body.x, previousX) + reach, Math.max(body.z, previousZ) + reach)) {
      const { a, b } = this.barriers[index], dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
      if (length < 1e-8) continue;
      const t = ((body.x - a.x) * dx + (body.z - a.z) * dz) / (length * length);
      const floor = a.y + (b.y - a.y) * Math.max(0, Math.min(1, t));
      if (feet + height < floor || feet > floor + (this.barriers[index].height ?? 1.5)) continue;
      hit = constrainObstacle(body, previousX, previousZ, radius, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2,
        heading: Math.atan2(dx, -dz), width: 0.16, front: length / 2, rear: -length / 2 }) || hit;
    }
    return hit;
  }
}
