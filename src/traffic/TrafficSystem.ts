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
import type { HornSound } from '../audio/VehicleHorn';
import type { TrafficSignals } from './TrafficSignals';

export const MAX_TRAFFIC = 120;
export const trafficTuning = {
  minSpeed: [30, 10, 200], maxSpeed: [110, 10, 200], headway: [1.8, 0.8, 4], gap: [3, 1, 12], acceleration: [1.5, 0.5, 3],
  braking: [5, 1, 7], laneChanges: [1, 0, 2], hornDelay: [2.5, 1, 20], hornCooldown: [7, 3, 30],
} as const;
export type TrafficTuning = { -readonly [K in keyof typeof trafficTuning]: number };
export const trafficScenarios = { normal: '正常通行', busy: '缓慢车流', stopgo: '走走停停', queue: '排队拥堵' } as const;
const kinds: VehicleKind[] = ['hatchback', 'sedan', 'wagon', 'pickup', 'van', 'camper', 'truck5', 'truck8', 'minibus', 'citybus', 'supercar', 'semi15', 'coupe', 'rally', 'limousine', 'expedition6', 'schoolbus', 'shuttle', 'mixer', 'garbage', 'refrigerated', 'towtruck', 'sprinkler', 'taxi', 'surfWagon', 'patrol', 'parcelVan', 'adventureCamper', 'panoramicBus', 'livestockTruck', 'loggingTruck', 'maintenanceTruck', 'touringMotorcycle'];
const paints = [0xd8dedb, 0x29485e, 0x377d78, 0xa73d32, 0xdca632, 0x353d43, 0x7d658e, 0x9b7453, 0x83b3bb, 0xd4bc97];
type Position = { x: number; y: number; z: number };
interface Driver { patience: number; waiting: number; horn: number; quiet: number }
export interface TrafficEntry {
  id: string; car: VehiclePhysics; routeId: string; distance: number; direction: number; cruise: number;
  lane: number; offset: number; signal: number; cooldown: number;
  change?: { lane: number; from: number; elapsed: number };
}

export class TrafficSystem {
  signals?: TrafficSignals;
  readonly tuning = Object.fromEntries(Object.entries(trafficTuning).map(([key, [value]]) => [key, value])) as TrafficTuning;
  configure(values: Partial<TrafficTuning>): void {
    for (const key of Object.keys(trafficTuning) as (keyof TrafficTuning)[]) {
      const value = values[key], [, min, max] = trafficTuning[key];
      if (value !== undefined && Number.isFinite(value)) this.tuning[key] = Math.max(min, Math.min(max, value));
    }
    if (this.tuning.minSpeed > this.tuning.maxSpeed) {
      if (values.maxSpeed !== undefined) this.tuning.minSpeed = this.tuning.maxSpeed;
      else this.tuning.maxSpeed = this.tuning.minSpeed;
    }
    if (values.minSpeed !== undefined || values.maxSpeed !== undefined)
      for (const entry of this.entries) entry.cruise = this.cruiseSpeed(entry);
  }
  readonly entries: TrafficEntry[] = [];
  private amount = 35;
  private capacity = 24;
  private scenarioValue: keyof typeof trafficScenarios = 'normal';
  private readonly queues = new Map<string, number>();
  private readonly drivers = new Map<TrafficEntry, Driver>();
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
  constructor(private readonly seed: string, private readonly options: Readonly<WorldOptions>) {
    this.random = createRng(hashSeed(`${seed}:traffic`)); this.profile = roadProfile(options);
  }
  get density(): number { return this.amount; }
  set density(value: number) { if (Number.isFinite(value)) this.amount = Math.max(0, Math.min(100, value)); }
  get limit(): number { return this.capacity; }
  set limit(value: number) { if (Number.isFinite(value)) this.capacity = Math.round(Math.max(12, Math.min(MAX_TRAFFIC, value))); }
  get targetCount(): number { return Math.ceil(this.amount / 100 * this.capacity); }
  clear(): void { this.entries.length = 0; this.spawnTime = 0; this.routes = []; this.queues.clear(); this.drivers.clear(); }
  take(id: string): VehiclePhysics | undefined {
    const index = this.entries.findIndex(e => e.id === id);
    if (index < 0 || this.entries[index].car.motionSpeed > 0.1) return;
    const [entry] = this.entries.splice(index, 1); this.drivers.delete(entry); entry.car.park(); return entry.car;
  }

  private driver(entry: TrafficEntry): Driver {
    let driver = this.drivers.get(entry);
    if (!driver) {
      driver = { patience: hashSeed(`${this.seed}:${entry.id}:driver`) / 4294967296, waiting: 0, horn: 0, quiet: 0 };
      this.drivers.set(entry, driver);
    }
    return driver;
  }

  private cruiseSpeed(entry: TrafficEntry): number {
    const preference = hashSeed(`${this.seed}:${entry.id}:speed`) / 4294967296;
    return Math.min(entry.car.maxSpeed, (this.tuning.minSpeed + (this.tuning.maxSpeed - this.tuning.minSpeed) * preference) / 3.6);
  }

  horns(listener: Position, right: Position): HornSound[] {
    const sources: HornSound[] = [];
    for (const entry of this.entries) {
      const driver = this.drivers.get(entry);
      if (!driver || driver.horn <= 0 || driver.patience < 0.5 && driver.horn > 0.22 && driver.horn < 0.34) continue;
      const dx = entry.car.x - listener.x, dy = entry.car.y - listener.y, dz = entry.car.z - listener.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance >= 240) continue;
      sources.push({ id: entry.id, kind: entry.car.kind, volume: (1 - distance / 240) / (1 + (distance / 45) ** 2),
        pan: Math.max(-1, Math.min(1, (dx * right.x + dy * right.y + dz * right.z) / Math.max(1, distance))) });
    }
    return sources.sort((a, b) => b.volume - a.volume).slice(0, 4);
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
      if (!route || !this.sample(route, e.distance) || Math.hypot(e.car.x - anchor.x, e.car.z - anchor.z) > 1400 || !target) {
        this.drivers.delete(e); this.entries.splice(i, 1);
      }
    }
    if (this.entries.length > target) {
      this.entries.sort((a, b) => Math.hypot(a.car.x - anchor.x, a.car.z - anchor.z) - Math.hypot(b.car.x - anchor.x, b.car.z - anchor.z));
      for (const entry of this.entries.splice(target)) this.drivers.delete(entry);
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
    }, true, p.trailers?.length ? [trailerHeading] : [], true);
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
      cruise: 0 };
    entry.cruise = this.cruiseSpeed(entry);
    if (!this.place(entry, route, distance) || Math.hypot(car.x - anchor.x, car.z - anchor.z) < 70
      || this.signals?.junctions.some(j => Math.abs(car.y - j.sample.position.y) < 5
        && Math.hypot(car.x - j.sample.position.x, car.z - j.sample.position.z) < this.signals!.stopOffset + car.profile.length + 10)
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
      const rearGap = Math.max(8, other.motionSpeed * 2 + Math.max(0, other.motionSpeed - entry.car.speed) * (entry.car.profile.length > 8 ? 7 : 5.5));
      if (Math.hypot(other.x - x, other.z - z) > Math.max(180, rearGap + other.profile.length + entry.car.profile.length)) continue;
      for (const body of other.bodies()) {
        if (Math.abs(body.y - entry.car.y) > Math.max(3, other.profile.height)) continue;
        const center = (body.front + body.rear) / 2;
        const dx = body.x + Math.sin(body.heading) * center - x, dz = body.z - Math.cos(body.heading) * center - z;
        const along = dx * Math.sin(heading) - dz * Math.cos(heading), lateral = Math.abs(dx * Math.cos(heading) + dz * Math.sin(heading));
        const angle = body.heading - heading, length = (body.front - body.rear) / 2;
        const width = Math.abs(Math.cos(angle)) * other.profile.width / 2 + Math.abs(Math.sin(angle)) * length;
        if (lateral > width + entry.car.profile.width / 2 + 0.45) continue;
        const clearance = Math.abs(along) - Math.abs(Math.cos(angle)) * length - Math.abs(Math.sin(angle)) * other.profile.width / 2 - entry.car.profile.length / 2;
        if (clearance < (along >= 0 ? Math.max(6, entry.car.speed * 2.5) : rearGap)) return false;
      }
    }
    return !this.entries.some(other => other !== entry && other.change && other.routeId === entry.routeId && other.direction === entry.direction
      && Math.abs(other.distance - entry.distance) < 25 + Math.max(other.car.speed, entry.car.speed) * 3
      && (other.change.lane === lane || other.lane === lane));
  }

  private planChange(entry: TrafficEntry, route: NetworkRoute, gap: number, leaderSpeed: number, obstacles: readonly VehiclePhysics[], walker?: Position): void {
    if (!this.tuning.laneChanges || entry.change || entry.cooldown > 0 || entry.car.speed < 0.5 || walker && Math.hypot(walker.x - entry.car.x, walker.z - entry.car.z) < 90) return;
    if (route.tunnels.some(span => entry.distance > span.start.distance - 60 && entry.distance < span.end.distance + 60)) return;
    for (const distance of [entry.distance, entry.distance + entry.direction * 80]) {
      const sample = this.sample(route, distance);
      if (!sample || sample.junction || sample.opening !== undefined || Math.abs(sample.curvature) > 0.005) return;
    }
    const passing = gap < Math.max(45, entry.car.speed * (5.5 + this.driver(entry).patience))
      && leaderSpeed < entry.cruise - 2;
    const candidates = this.profile.lanes.filter(lane => lane.direction === (this.options.oneWay ? 1 : entry.direction)
      && Math.abs(lane.index - entry.lane) === 1).sort((a, b) => this.laneOffset(entry, b.index) * entry.direction - this.laneOffset(entry, a.index) * entry.direction);
    for (const lane of candidates) {
      const side = Math.sign((this.laneOffset(entry, lane.index) - entry.offset) * entry.direction);
      if ((passing ? side > 0 : side < 0) || !this.laneClear(entry, route, lane.index, obstacles)) continue;
      entry.change = { lane: lane.index, from: entry.offset, elapsed: 0 }; entry.signal = side;
      return;
    }
    entry.cooldown = 0.7;
  }

  private advance(entry: TrafficEntry, route: NetworkRoute, dt: number, parked: readonly VehiclePhysics[], walker?: Position): void {
    const car = entry.car, reverse = this.reverseRoute(route);
    const remaining = entry.direction > 0 ? route.road.segments.at(-1)!.end.distance - entry.distance
      : reverse?.ready ? (reverse.road.segments.at(-1)?.end.distance ?? 0) + entry.distance : entry.distance - route.road.segments[0].start.distance;
    const deceleration = Math.min(this.tuning.braking * 0.6, car.gravity * 0.5);
    let target = Math.min(entry.cruise, car.maxSpeed, Math.sqrt(Math.max(0, remaining - 30) * Math.min(5, deceleration * 2)));
    let queueGap = Infinity;
    if (this.scenario !== 'normal') target = Math.min(target, this.scenario === 'busy' ? 9 : 7);
    if (this.scenario === 'queue' || this.scenario === 'stopgo' && this.time % 36 < 20) {
      const center = this.queues.get(route.id);
      if (center !== undefined) {
        const gap = (center + entry.direction * 350 - entry.distance) * entry.direction - car.profile.chassisLength / 2;
        if (gap > -car.profile.length) {
          queueGap = gap;
          target = Math.min(target, Math.max(0, gap) / 1.4, Math.sqrt(Math.max(0, gap) * deceleration * 2));
        }
      }
    }
    const horizon = Math.min(1500, Math.max(60, car.speed * 3, car.speed ** 2 / (2 * deceleration)));
    for (let ahead = 0; ahead <= horizon; ahead += 25) {
      const sample = this.sample(route, entry.distance + entry.direction * ahead);
      if (sample) {
        const safe = Math.min(Math.sqrt(Math.min(2.1, car.gravity * 0.55) / Math.max(0.00001, Math.abs(sample.curvature))),
          entry.cruise / (1 + Math.abs(sample.grade) * 3));
        target = Math.min(target, Math.sqrt(safe * safe + 2 * deceleration * Math.max(0, ahead - 25)));
      }
    }
    let gap = Infinity, leaderSpeed = Infinity;
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
        const clearance = along - length - car.profile.chassisLength / 2 - this.tuning.gap;
        if (clearance < gap) { gap = clearance; leaderSpeed = Math.max(0, other.speed * Math.cos(angle)); }
      }
    }
    if (walker) {
      const dx = walker.x - car.x, dz = walker.z - car.z;
      const along = dx * Math.sin(car.heading) - dz * Math.cos(car.heading), lateral = Math.abs(dx * Math.cos(car.heading) + dz * Math.sin(car.heading));
      if (Math.abs(walker.y - car.y) < car.profile.height + 1 && lateral < car.profile.width / 2 + 1.5 && along > -car.profile.length)
        gap = Math.min(gap, along - car.profile.chassisLength / 2 - 4);
    }
    const signalGap = this.signals?.stopDistance(car) ?? Infinity;
    gap = Math.min(gap, signalGap);
    entry.cooldown = Math.max(0, entry.cooldown - dt * this.tuning.laneChanges);
    if ((this.signals?.approach(car)?.distance ?? Infinity) > 80) this.planChange(entry, route, gap, leaderSpeed, obstacles, walker);
    const previousOffset = entry.offset, previousElapsed = entry.change?.elapsed ?? 0, previousHeading = car.heading, previousSteering = car.steering;
    if (entry.change) {
      const change = entry.change, clear = this.laneClear(entry, route, change.lane, obstacles);
      if (change.elapsed < 0.8 && !clear) {
        entry.change = undefined; entry.signal = 0; entry.cooldown = 2;
      } else {
        if (clear && (change.elapsed < 0.8 || car.speed > 0.3 && gap > 0.05)
          && (!walker || Math.hypot(walker.x - car.x, walker.z - car.z) > 15 + car.profile.length))
          change.elapsed += dt * (change.elapsed < 0.8 ? 1 : Math.min(1, car.speed / 6));
        const t = Math.max(0, Math.min(1, (change.elapsed - 0.8) / (entry.car.profile.length > 8 ? 5.5 : 4)));
        entry.offset = change.from + (this.laneOffset(entry, change.lane) - change.from) * t * t * (3 - 2 * t);
      }
    }
    target = Math.min(target, Math.max(0, gap) / this.tuning.headway, Math.sqrt(Math.max(0, gap) * deceleration * 2));
    if (gap < 0.2 && car.speed < 0.2) target = 0;
    const speed = car.speed + Math.max(-Math.min(this.tuning.braking, car.gravity * 0.9) * dt, Math.min(Math.min(this.tuning.acceleration, car.gravity * 0.8) * dt, target - car.speed));
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
    if (hit) { entry.offset = previousOffset; if (entry.change) entry.change.elapsed = previousElapsed; this.place(entry, route, entry.distance); }
    else {
      entry.distance = distance; car.trip += move; car.wheelAngle += move / car.profile.radius; car.rearWheelAngle += move / car.profile.radius;
      if (entry.change && entry.change.elapsed >= 0.8 + (car.profile.length > 8 ? 5.5 : 4)) {
        entry.lane = entry.change.lane; entry.change = undefined; entry.signal = 0; entry.cooldown = 4 + this.driver(entry).patience * 3;
      }
    }
    car.speed = hit || gap <= 0.01 ? 0 : speed < 0.02 && target < 0.02 ? 0 : speed;
    const turn = Math.atan2(Math.sin(car.heading - previousHeading), Math.cos(car.heading - previousHeading));
    const steering = !hit && move > 0.0001 ? Math.max(-car.profile.steer, Math.min(car.profile.steer, Math.atan(turn * car.wheelbase / move))) : previousSteering;
    car.steering = previousSteering + (steering - previousSteering) * (1 - Math.exp(-dt * 8));
    car.braking = target < speed || hit;
    car.transmission.update(dt, car.speed, car.braking ? car.speed > 0.1 ? -1 : 0 : car.speed < target - 0.2 ? 0.75 : car.speed > 0.1 ? 0.22 : 0, Math.tan(car.pitch));
    const driver = this.driver(entry);
    driver.horn = Math.max(0, driver.horn - dt); driver.quiet = Math.max(0, driver.quiet - dt);
    const pedestrian = walker && Math.hypot(walker.x - car.x, walker.z - car.z) < 35;
    const blocked = Math.min(gap, queueGap) < 25 && car.speed < 2.5 && entry.cruise > 4 && !pedestrian && signalGap === Infinity;
    driver.waiting = blocked ? driver.waiting + dt : 0;
    if (blocked && (!entry.change || car.speed < 0.3) && driver.waiting > this.tuning.hornDelay + driver.patience * 3 && driver.quiet === 0) {
      driver.horn = 0.6 + driver.patience * 0.4; driver.quiet = this.tuning.hornCooldown * (1 + driver.patience);
    }
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
