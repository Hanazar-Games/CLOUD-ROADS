import type { NetworkRoute } from '../road/RoadNetwork';
import { roadFrame } from '../road/RoadFrame';
import { roadProfile } from '../road/RoadProfile';
import type { RoadSample } from '../road/RoadSegment';
import { createRng, hashSeed } from '../world/WorldSeed';
import { surfaceGravity, type WorldOptions } from '../world/WorldOptions';
import { VehiclePhysics } from '../vehicle/VehiclePhysics';
import { vehicleProfiles, type VehicleKind } from '../vehicle/VehicleConfig';
import { constrainVehicle } from '../service/ServiceCollision';
import { vehicleSupport } from '../vehicle/VehicleSolids';

export const MAX_TRAFFIC = 120;
export const trafficScenarios = { normal: '正常通行', busy: '缓慢车流', stopgo: '走走停停', queue: '排队拥堵' } as const;
const kinds: VehicleKind[] = ['hatchback', 'sedan', 'wagon', 'pickup', 'van', 'camper', 'truck5', 'truck8', 'minibus', 'citybus', 'supercar', 'semi15', 'coupe', 'rally', 'limousine', 'expedition6', 'schoolbus', 'shuttle', 'mixer', 'garbage', 'refrigerated', 'towtruck'];
const paints = [0xd8dedb, 0x29485e, 0x377d78, 0xa73d32, 0xdca632, 0x353d43, 0x7d658e, 0x9b7453, 0x83b3bb, 0xd4bc97];
type Position = { x: number; y: number; z: number };
export interface TrafficEntry {
  id: string; car: VehiclePhysics; routeId: string; distance: number; direction: number; cruise: number;
  lane: number; offset: number; signal: number; cooldown: number;
  change?: { lane: number; from: number; elapsed: number };
}

export class TrafficSystem {
  readonly entries: TrafficEntry[] = [];
  private amount = 35;
  private capacity = 24;
  private scenarioValue: keyof typeof trafficScenarios = 'normal';
  private readonly queues = new Map<string, number>();
  get scenario(): keyof typeof trafficScenarios { return this.scenarioValue; }
  set scenario(value: keyof typeof trafficScenarios) {
    if (!Object.hasOwn(trafficScenarios, value) || value === this.scenarioValue) return;
    this.scenarioValue = value; this.queues.clear();
  }
  private serial = 0;
  private spawnTime = 0;
  private routes: readonly NetworkRoute[] = [];
  private readonly random;
  private readonly profile;
  time = 0;
  constructor(seed: string, private readonly options: Readonly<WorldOptions>) {
    this.random = createRng(hashSeed(`${seed}:traffic`)); this.profile = roadProfile(options);
  }
  get density(): number { return this.amount; }
  set density(value: number) { if (Number.isFinite(value)) this.amount = Math.max(0, Math.min(100, value)); }
  get limit(): number { return this.capacity; }
  set limit(value: number) { if (Number.isFinite(value)) this.capacity = Math.round(Math.max(12, Math.min(MAX_TRAFFIC, value))); }
  get targetCount(): number { return Math.ceil(this.amount / 100 * this.capacity); }
  clear(): void { this.entries.length = 0; this.spawnTime = 0; this.routes = []; this.queues.clear(); }
  take(id: string): VehiclePhysics | undefined {
    const index = this.entries.findIndex(e => e.id === id);
    if (index < 0 || this.entries[index].car.motionSpeed > 0.1) return;
    const [entry] = this.entries.splice(index, 1); entry.car.park(); return entry.car;
  }

  update(dt: number, routes: readonly NetworkRoute[], anchor: Position, parked: readonly VehiclePhysics[] = [], walker?: Position): void {
    this.routes = routes;
    for (const id of this.queues.keys()) if (!routes.some(route => route.id === id)) this.queues.delete(id);
    if (this.scenario !== 'normal') for (const route of routes) {
      const sample = route.road.nearest(anchor.x, anchor.z);
      if (sample && (!this.queues.has(route.id) || Math.abs(this.queues.get(route.id)! - sample.distance) > 1000)) this.queues.set(route.id, sample.distance);
    }
    const target = this.targetCount;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i], route = routes.find(r => r.id === e.routeId);
      if (!route || !this.sample(route, e.distance) || Math.hypot(e.car.x - anchor.x, e.car.z - anchor.z) > 1400 || !target) this.entries.splice(i, 1);
    }
    if (this.entries.length > target) {
      this.entries.sort((a, b) => Math.hypot(a.car.x - anchor.x, a.car.z - anchor.z) - Math.hypot(b.car.x - anchor.x, b.car.z - anchor.z));
      this.entries.length = target;
    }
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.1);
    this.time = (this.time + dt) % 3600;
    this.spawnTime += dt;
    if (this.entries.length < target && this.spawnTime >= 0.3) {
      this.spawnTime = 0;
      this.spawn(routes, anchor, parked, walker);
    }
    // Substeps keep a fast vehicle from passing through a narrow obstacle.
    const steps = Math.ceil(dt / (1 / 60));
    const obstacles = [...parked, ...this.entries.map(entry => entry.car)];
    for (let step = 0; step < steps; step++) for (const entry of this.entries) {
      const route = routes.find(r => r.id === entry.routeId)!;
      this.advance(entry, route, dt / steps, obstacles, walker);
    }
  }

  private sample(route: NetworkRoute, distance: number): RoadSample | undefined {
    const sample = route.road.segments.find(s => distance >= s.start.distance && distance <= s.end.distance)?.atDistance(distance);
    if (sample || distance >= 0) return sample;
    const reverse = this.reverseRoute(route)?.road.segments.find(s => -distance >= s.start.distance && -distance <= s.end.distance)?.atDistance(-distance);
    return reverse && { ...reverse, distance, heading: reverse.heading + Math.PI, grade: -reverse.grade, bank: -reverse.bank, curvature: -reverse.curvature };
  }

  private reverseRoute(route: NetworkRoute): NetworkRoute | undefined {
    if (route.definition.opposite) return this.routes.find(r => r.id === route.definition.opposite);
    return route.id === 'root' || route.id === 'back' ? this.routes.find(r => r.id === (route.id === 'root' ? 'back' : 'root')) : undefined;
  }

  private laneOffset(entry: TrafficEntry, lane = entry.lane): number {
    return this.profile.lanes[lane].offset * (this.options.oneWay ? entry.direction : 1);
  }

  private place(entry: TrafficEntry, route: NetworkRoute, distance: number, yaw = 0): boolean {
    const sample = this.sample(route, distance);
    const p = entry.car.profile, rear = this.sample(route, distance + entry.direction * ((p.trailers?.[0].hitchAlong ?? 0) - (p.trailers?.[0].wheelbase ?? 0)));
    if (!sample || !rear) return false;
    const { right, normal } = roadFrame(sample), offset = entry.offset, car = entry.car;
    const x = sample.position.x + right.x * offset, z = sample.position.z + right.z * offset;
    const heading = sample.heading + (entry.direction < 0 ? Math.PI : 0) + yaw, rearRight = roadFrame(rear).right;
    const hitchX = x + Math.sin(heading) * (p.trailers?.[0].hitchAlong ?? 0), hitchZ = z - Math.cos(heading) * (p.trailers?.[0].hitchAlong ?? 0);
    const trailerHeading = Math.atan2(hitchX - rear.position.x - rearRight.x * offset, rear.position.z + rearRight.z * offset - hitchZ);
    const wheel = car.wheelAngle, rearWheel = car.rearWheelAngle, trip = car.trip, speed = car.speed;
    car.gravity = surfaceGravity(this.options.terrain);
    car.reset(x, z, heading, (px, pz) => {
      const nearRear = p.trailers?.length && Math.hypot(px - rear.position.x, pz - rear.position.z) < Math.hypot(px - sample.position.x, pz - sample.position.z);
      const ground = nearRear ? rear : sample, up = nearRear ? roadFrame(rear).normal : normal;
      return { height: ground.position.y - (up.x * (px - ground.position.x) + up.z * (pz - ground.position.z)) / up.y, grip: 1 };
    }, true, p.trailers?.length ? [trailerHeading] : []);
    car.wheelAngle = wheel; car.rearWheelAngle = rearWheel; car.trip = trip; car.speed = speed; car.parked = false; car.ignition = 'running';
    car.steering = Math.atan(sample.curvature * entry.direction * car.wheelbase);
    return true;
  }

  private spawn(routes: readonly NetworkRoute[], anchor: Position, parked: readonly VehiclePhysics[], walker?: Position): void {
    const available = routes.filter(r => r.ready && r.road.segments.length && r.road.nearest(anchor.x, anchor.z));
    if (!available.length) return;
    const route = available[Math.floor(this.random() * available.length)], nearest = route.road.nearest(anchor.x, anchor.z)!;
    const distance = nearest.distance + (this.random() * 2 - 1) * (this.scenario === 'normal' ? 1050 : 650);
    const sample = this.sample(route, distance);
    if (!sample || sample.distance < route.road.segments[0].start.distance + 50
      || sample.distance > route.road.segments.at(-1)!.end.distance - 50) return;
    const direction = this.options.oneWay ? route.id === 'back' ? -1 : 1 : this.random() < 0.5 ? -1 : 1;
    const lanes = this.profile.lanes.filter(lane => lane.direction === (this.options.oneWay ? 1 : direction));
    const lane = lanes[Math.floor(this.random() * lanes.length)];
    const allowed = kinds.filter(k => (Math.abs(sample.curvature) < 0.01 || vehicleProfiles[k].length < 7)
      && (this.options.roadType === 'highway' || this.options.routeStyle < 3 || vehicleProfiles[k].length < 6.5)
      && vehicleProfiles[k].width + 0.3 < this.profile.laneWidth);
    if (!allowed.length) return;
    const car = new VehiclePhysics(allowed[Math.floor(this.random() * allowed.length)]);
    car.paint = paints[Math.floor(this.random() * paints.length)];
    const entry: TrafficEntry = { id: `npc:${++this.serial}`, car, routeId: route.id, distance, direction,
      lane: lane.index, offset: lane.offset * (this.options.oneWay ? direction : 1), signal: 0, cooldown: 3,
      cruise: Math.min(car.maxSpeed * 0.65, (this.options.roadType === 'highway' ? 25 : 15) * (0.75 + this.random() * 0.3)) };
    if (!this.place(entry, route, distance) || Math.hypot(car.x - anchor.x, car.z - anchor.z) < 70
      || walker && Math.hypot(car.x - walker.x, car.z - walker.z) < 60
      || [...parked, ...this.entries.map(e => e.car)].some(other => Math.abs(other.y - car.y) < 7
        && Math.hypot(other.x - car.x, other.z - car.z) < 35 + other.profile.length + car.profile.length)) return;
    this.entries.push(entry);
  }

  private laneClear(entry: TrafficEntry, route: NetworkRoute, lane: number, obstacles: readonly VehiclePhysics[]): boolean {
    const sample = this.sample(route, entry.distance)!;
    const heading = sample.heading + (entry.direction < 0 ? Math.PI : 0), offset = this.laneOffset(entry, lane);
    const right = roadFrame(sample).right, x = sample.position.x + right.x * offset, z = sample.position.z + right.z * offset;
    for (const other of obstacles) {
      if (other === entry.car) continue;
      if (Math.hypot(other.x - x, other.z - z) > 180) continue;
      for (const body of other.bodies()) {
        if (Math.abs(body.y - entry.car.y) > Math.max(3, other.profile.height)) continue;
        const center = (body.front + body.rear) / 2;
        const dx = body.x + Math.sin(body.heading) * center - x, dz = body.z - Math.cos(body.heading) * center - z;
        const along = dx * Math.sin(heading) - dz * Math.cos(heading), lateral = Math.abs(dx * Math.cos(heading) + dz * Math.sin(heading));
        const angle = body.heading - heading, length = (body.front - body.rear) / 2;
        const width = Math.abs(Math.cos(angle)) * other.profile.width / 2 + Math.abs(Math.sin(angle)) * length;
        if (lateral > width + entry.car.profile.width / 2 + 0.45) continue;
        const clearance = Math.abs(along) - Math.abs(Math.cos(angle)) * length - Math.abs(Math.sin(angle)) * other.profile.width / 2 - entry.car.profile.length / 2;
        if (clearance < (along >= 0 ? Math.max(14, entry.car.speed * 2.5) : Math.max(14, other.motionSpeed * 2 + Math.max(0, other.motionSpeed - entry.car.speed) * 3))) return false;
      }
    }
    return !this.entries.some(other => other !== entry && other.change && other.routeId === entry.routeId && other.direction === entry.direction
      && Math.abs(other.distance - entry.distance) < 25 + Math.max(other.car.speed, entry.car.speed) * 3
      && (other.change.lane === lane || other.lane === lane));
  }

  private planChange(entry: TrafficEntry, route: NetworkRoute, gap: number, obstacles: readonly VehiclePhysics[], walker?: Position): void {
    if (entry.change || entry.cooldown > 0 || entry.car.speed < 2 || walker && Math.hypot(walker.x - entry.car.x, walker.z - entry.car.z) < 90) return;
    if (route.tunnels.some(span => entry.distance > span.start.distance - 60 && entry.distance < span.end.distance + 60)) return;
    for (const distance of [entry.distance, entry.distance + entry.direction * 80]) {
      const sample = this.sample(route, distance);
      if (!sample || sample.junction || sample.opening !== undefined || Math.abs(sample.curvature) > 0.005) return;
    }
    const passing = gap < Math.max(40, entry.car.speed * 4);
    const candidates = this.profile.lanes.filter(lane => lane.direction === (this.options.oneWay ? 1 : entry.direction)
      && Math.abs(lane.index - entry.lane) === 1).sort((a, b) => this.laneOffset(entry, b.index) * entry.direction - this.laneOffset(entry, a.index) * entry.direction);
    for (const lane of candidates) {
      const side = Math.sign((this.laneOffset(entry, lane.index) - entry.offset) * entry.direction);
      if ((!passing && side < 0) || !this.laneClear(entry, route, lane.index, obstacles)) continue;
      entry.change = { lane: lane.index, from: entry.offset, elapsed: 0 }; entry.signal = side;
      return;
    }
    entry.cooldown = 0.7;
  }

  private advance(entry: TrafficEntry, route: NetworkRoute, dt: number, parked: readonly VehiclePhysics[], walker?: Position): void {
    const car = entry.car, reverse = this.reverseRoute(route);
    const remaining = entry.direction > 0 ? route.road.segments.at(-1)!.end.distance - entry.distance
      : reverse?.ready ? (reverse.road.segments.at(-1)?.end.distance ?? 0) + entry.distance : entry.distance - route.road.segments[0].start.distance;
    const deceleration = Math.min(3, car.gravity * 0.5);
    let target = Math.min(entry.cruise, Math.sqrt(Math.max(0, remaining - 30) * Math.min(5, deceleration * 2)));
    if (this.scenario !== 'normal') target = Math.min(target, this.scenario === 'busy' ? 9 : 7);
    if (this.scenario === 'queue' || this.scenario === 'stopgo' && this.time % 36 < 20) {
      const center = this.queues.get(route.id);
      if (center !== undefined) {
        const gap = (center + entry.direction * 350 - entry.distance) * entry.direction - car.profile.chassisLength / 2;
        if (gap > -car.profile.length) target = Math.min(target, Math.max(0, gap) / 1.4, Math.sqrt(Math.max(0, gap) * deceleration * 2));
      }
    }
    for (const ahead of [0, 15, 40, Math.max(car.speed * 3, car.speed ** 2 / (2 * deceleration))]) {
      const sample = this.sample(route, entry.distance + entry.direction * ahead);
      if (sample) target = Math.min(target, Math.sqrt(Math.min(2.1, car.gravity * 0.55) / Math.max(0.001, Math.abs(sample.curvature))), 20 / (1 + Math.abs(sample.grade) * 5));
    }
    let gap = Infinity;
    const obstacles = parked;
    for (const other of obstacles) {
      if (other === car) continue;
      if (Math.hypot(other.x - car.x, other.z - car.z) > Math.max(130, car.speed ** 2 / (2 * deceleration) + other.profile.length + 30)) continue;
      for (const body of other.bodies()) {
        const center = (body.front + body.rear) / 2;
        const dx = body.x + Math.sin(body.heading) * center - car.x, dz = body.z - Math.cos(body.heading) * center - car.z;
        if (Math.abs(body.y - car.y) > Math.max(3, car.profile.height, other.profile.height)) continue;
        const along = dx * Math.sin(car.heading) - dz * Math.cos(car.heading), lateral = Math.abs(dx * Math.cos(car.heading) + dz * Math.sin(car.heading));
        const angle = body.heading - car.heading;
        const width = Math.abs(Math.cos(angle)) * other.profile.width / 2 + Math.abs(Math.sin(angle)) * (body.front - body.rear) / 2;
        if (along <= 0 || lateral > width + car.profile.width / 2 + 0.3) continue;
        const length = Math.abs(Math.cos(angle)) * (body.front - body.rear) / 2 + Math.abs(Math.sin(angle)) * other.profile.width / 2;
        gap = Math.min(gap, along - length - car.profile.chassisLength / 2 - 3);
      }
    }
    if (walker) {
      const dx = walker.x - car.x, dz = walker.z - car.z;
      const along = dx * Math.sin(car.heading) - dz * Math.cos(car.heading), lateral = Math.abs(dx * Math.cos(car.heading) + dz * Math.sin(car.heading));
      if (Math.abs(walker.y - car.y) < car.profile.height + 1 && lateral < car.profile.width / 2 + 1.5 && along > -car.profile.length)
        gap = Math.min(gap, along - car.profile.chassisLength / 2 - 4);
    }
    entry.cooldown = Math.max(0, entry.cooldown - dt);
    this.planChange(entry, route, gap, obstacles, walker);
    const previousOffset = entry.offset;
    if (entry.change) {
      const change = entry.change;
      if (change.elapsed < 0.8 && !this.laneClear(entry, route, change.lane, obstacles)) {
        entry.change = undefined; entry.signal = 0; entry.cooldown = 2;
      } else {
        if (!walker || Math.hypot(walker.x - car.x, walker.z - car.z) > 15 + car.profile.length) change.elapsed += dt;
        const t = Math.max(0, Math.min(1, (change.elapsed - 0.8) / (entry.car.profile.length > 8 ? 5.5 : 4)));
        entry.offset = change.from + (this.laneOffset(entry, change.lane) - change.from) * t * t * (3 - 2 * t);
      }
    }
    target = Math.min(target, Math.max(0, gap) / 1.8, Math.sqrt(Math.max(0, gap) * deceleration * 2));
    const speed = car.speed + Math.max(-Math.min(5, car.gravity * 0.9) * dt, Math.min(Math.min(1.5, car.gravity * 0.8) * dt, target - car.speed));
    const move = Math.min(speed * dt, Math.max(0, gap));
    const before = car.bodies(), distance = entry.distance + entry.direction * move;
    const yaw = Math.max(-0.25, Math.min(0.25, Math.atan2((entry.offset - previousOffset) * entry.direction, Math.max(0.1, move))));
    if (!this.place(entry, route, distance, yaw)) { entry.offset = previousOffset; car.speed = 0; return; }
    let hit = false;
    for (const [b, body] of car.bodies().entries()) for (let along = body.rear; along <= body.front + 0.01; along += Math.min(1, body.front - body.rear)) {
      const point = { x: body.x + Math.sin(body.heading) * along, z: body.z - Math.cos(body.heading) * along };
      for (const other of obstacles) if (other !== car && constrainVehicle(point, before[b].x + Math.sin(before[b].heading) * along,
        before[b].z - Math.cos(before[b].heading) * along, car.profile.width / 2 + 0.08,
        body.y - car.profile.radius - car.profile.rest, other, car.profile.height)) { hit = true; break; }
      if (hit) break;
    }
    if (hit) { entry.offset = previousOffset; if (entry.change) entry.change.elapsed = Math.max(0, entry.change.elapsed - dt); this.place(entry, route, entry.distance); }
    else {
      entry.distance = distance; car.trip += move; car.wheelAngle += move / car.profile.radius; car.rearWheelAngle += move / car.profile.radius;
      if (entry.change && entry.change.elapsed >= 0.8 + (car.profile.length > 8 ? 5.5 : 4)) {
        entry.lane = entry.change.lane; entry.change = undefined; entry.signal = 0; entry.cooldown = 7;
      }
    }
    car.speed = hit || gap <= 0.01 ? 0 : speed < 0.02 && target < 0.02 ? 0 : speed;
    car.braking = target < speed || hit;
  }

  constrain(body: Position, px: number, pz: number, radius: number, feet: number, height = 1.75): boolean {
    let hit = false;
    for (const e of this.entries) hit = constrainVehicle(body, px, pz, radius, feet, e.car, height) || hit;
    return hit;
  }
  support(x: number, z: number, ceiling: number): number | undefined {
    let height: number | undefined;
    for (const e of this.entries) { const top = vehicleSupport(e.car, x, z, ceiling); if (top !== undefined && (height === undefined || top > height)) height = top; }
    return height;
  }
}
