import type { NetworkRoute } from '../road/RoadNetwork';
import { roadFrame } from '../road/RoadFrame';
import { roadProfile } from '../road/RoadProfile';
import type { RoadSample } from '../road/RoadSegment';
import { createRng, hashSeed } from '../world/WorldSeed';
import type { WorldOptions } from '../world/WorldOptions';
import { VehiclePhysics } from '../vehicle/VehiclePhysics';
import { vehicleProfiles, type VehicleKind } from '../vehicle/VehicleConfig';
import { constrainVehicle } from '../service/ServiceCollision';
import { vehicleSupport } from '../vehicle/VehicleSolids';

export const MAX_TRAFFIC = 24;
const kinds: VehicleKind[] = ['hatchback', 'sedan', 'wagon', 'pickup', 'van', 'camper', 'truck5', 'truck8', 'minibus', 'citybus', 'supercar', 'semi15'];
const paints = [0xd8dedb, 0x29485e, 0x377d78, 0xa73d32, 0xdca632, 0x353d43, 0x7d658e, 0x9b7453, 0x83b3bb, 0xd4bc97];
type Position = { x: number; y: number; z: number };
export interface TrafficEntry { id: string; car: VehiclePhysics; routeId: string; distance: number; direction: number; cruise: number }

export class TrafficSystem {
  readonly entries: TrafficEntry[] = [];
  private amount = 35;
  private serial = 0;
  private spawnTime = 0;
  private routes: readonly NetworkRoute[] = [];
  private readonly random;
  constructor(seed: string, private readonly options: Readonly<WorldOptions>) { this.random = createRng(hashSeed(`${seed}:traffic`)); }
  get density(): number { return this.amount; }
  set density(value: number) { if (Number.isFinite(value)) this.amount = Math.max(0, Math.min(100, value)); }
  clear(): void { this.entries.length = 0; this.spawnTime = 0; this.routes = []; }
  take(id: string): VehiclePhysics | undefined {
    const index = this.entries.findIndex(e => e.id === id);
    if (index < 0 || this.entries[index].car.motionSpeed > 0.1) return;
    const [entry] = this.entries.splice(index, 1); entry.car.park(); return entry.car;
  }

  update(dt: number, routes: readonly NetworkRoute[], anchor: Position, parked: readonly VehiclePhysics[] = [], walker?: Position): void {
    this.routes = routes;
    const target = Math.ceil(this.amount / 100 * MAX_TRAFFIC);
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
    this.spawnTime += dt;
    if (this.entries.length < target && this.spawnTime >= 0.3) {
      this.spawnTime = 0;
      this.spawn(routes, anchor, parked, walker);
    }
    // Substeps keep a fast vehicle from passing through a narrow obstacle.
    const steps = Math.ceil(dt / (1 / 60));
    for (let step = 0; step < steps; step++) for (const entry of this.entries) {
      const route = routes.find(r => r.id === entry.routeId)!;
      this.advance(entry, route, dt / steps, parked, walker);
    }
  }

  private sample(route: NetworkRoute, distance: number): RoadSample | undefined {
    const sample = route.road.segments.find(s => distance >= s.start.distance && distance <= s.end.distance)?.atDistance(distance);
    if (sample || distance >= 0) return sample;
    const reverse = this.reverseRoute(route)?.road.segments.find(s => -distance >= s.start.distance && -distance <= s.end.distance)?.atDistance(-distance);
    return reverse && { ...reverse, distance, heading: reverse.heading + Math.PI, grade: -reverse.grade, bank: -reverse.bank, curvature: -reverse.curvature };
  }

  private reverseRoute(route: NetworkRoute): NetworkRoute | undefined {
    return route.id === 'root' || route.id === 'back' ? this.routes.find(r => r.id === (route.id === 'root' ? 'back' : 'root')) : undefined;
  }

  private offset(direction: number): number {
    const profile = roadProfile(this.options);
    return direction * (profile.centers.at(-1)! + this.options.roadWidth / 4);
  }

  private place(entry: TrafficEntry, route: NetworkRoute, distance: number): boolean {
    const sample = this.sample(route, distance);
    const p = entry.car.profile, rear = this.sample(route, distance + entry.direction * ((p.trailer?.hitchAlong ?? 0) - (p.trailer?.wheelbase ?? 0)));
    if (!sample || !rear) return false;
    const { right, normal } = roadFrame(sample), offset = this.offset(entry.direction), car = entry.car;
    const x = sample.position.x + right.x * offset, z = sample.position.z + right.z * offset;
    const heading = sample.heading + (entry.direction < 0 ? Math.PI : 0), rearRight = roadFrame(rear).right;
    const hitchX = x + Math.sin(heading) * (p.trailer?.hitchAlong ?? 0), hitchZ = z - Math.cos(heading) * (p.trailer?.hitchAlong ?? 0);
    const trailerHeading = Math.atan2(hitchX - rear.position.x - rearRight.x * offset, rear.position.z + rearRight.z * offset - hitchZ);
    const wheel = car.wheelAngle, trip = car.trip, speed = car.speed;
    car.reset(x, z, heading, (px, pz) => {
      const nearRear = p.trailer && Math.hypot(px - rear.position.x, pz - rear.position.z) < Math.hypot(px - sample.position.x, pz - sample.position.z);
      const ground = nearRear ? rear : sample, up = nearRear ? roadFrame(rear).normal : normal;
      return { height: ground.position.y - (up.x * (px - ground.position.x) + up.z * (pz - ground.position.z)) / up.y, grip: 1 };
    }, true, p.trailer ? trailerHeading : heading);
    car.wheelAngle = wheel; car.trip = trip; car.speed = speed; car.parked = false; car.ignition = 'running';
    car.steering = Math.atan(sample.curvature * entry.direction * car.wheelbase);
    return true;
  }

  private spawn(routes: readonly NetworkRoute[], anchor: Position, parked: readonly VehiclePhysics[], walker?: Position): void {
    const available = routes.filter(r => r.ready && r.road.segments.length && r.road.nearest(anchor.x, anchor.z));
    if (!available.length) return;
    const route = available[Math.floor(this.random() * available.length)], nearest = route.road.nearest(anchor.x, anchor.z)!;
    const distance = nearest.distance + (this.random() * 2 - 1) * 1050;
    const sample = this.sample(route, distance);
    if (!sample || sample.distance < route.road.segments[0].start.distance + 50
      || sample.distance > route.road.segments.at(-1)!.end.distance - 50) return;
    const direction = this.random() < 0.5 ? -1 : 1;
    const allowed = kinds.filter(k => (Math.abs(sample.curvature) < 0.01 || vehicleProfiles[k].length < 7)
      && (this.options.roadType === 'highway' || this.options.routeStyle < 3 || vehicleProfiles[k].length < 6.5)
      && vehicleProfiles[k].width + 0.45 < this.options.roadWidth / 2 + 1.2);
    if (!allowed.length) return;
    const car = new VehiclePhysics(allowed[Math.floor(this.random() * allowed.length)]);
    car.paint = paints[Math.floor(this.random() * paints.length)];
    const entry: TrafficEntry = { id: `npc:${++this.serial}`, car, routeId: route.id, distance, direction,
      cruise: Math.min(car.maxSpeed * 0.65, (this.options.roadType === 'highway' ? 25 : 15) * (0.75 + this.random() * 0.3)) };
    if (!this.place(entry, route, distance) || Math.hypot(car.x - anchor.x, car.z - anchor.z) < 70
      || walker && Math.hypot(car.x - walker.x, car.z - walker.z) < 60
      || [...parked, ...this.entries.map(e => e.car)].some(other => Math.abs(other.y - car.y) < 7
        && Math.hypot(other.x - car.x, other.z - car.z) < 35 + other.profile.length + car.profile.length)) return;
    this.entries.push(entry);
  }

  private advance(entry: TrafficEntry, route: NetworkRoute, dt: number, parked: readonly VehiclePhysics[], walker?: Position): void {
    const car = entry.car, reverse = this.reverseRoute(route);
    const remaining = entry.direction > 0 ? route.road.segments.at(-1)!.end.distance - entry.distance
      : reverse?.ready ? (reverse.road.segments.at(-1)?.end.distance ?? 0) + entry.distance : entry.distance - route.road.segments[0].start.distance;
    let target = Math.min(entry.cruise, Math.sqrt(Math.max(0, remaining - 30) * 5));
    for (const ahead of [0, 15, 40, car.speed * 3]) {
      const sample = this.sample(route, entry.distance + entry.direction * ahead);
      if (sample) target = Math.min(target, Math.sqrt(2.1 / Math.max(0.001, Math.abs(sample.curvature))), 20 / (1 + Math.abs(sample.grade) * 5));
    }
    let gap = Infinity;
    const obstacles = [...parked, ...this.entries.filter(e => e !== entry).map(e => e.car)];
    for (const other of obstacles) {
      if (Math.hypot(other.x - car.x, other.z - car.z) > 130) continue;
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
    target = Math.min(target, Math.max(0, gap) / 1.8, Math.sqrt(Math.max(0, gap) * 6));
    const speed = car.speed + Math.max(-5 * dt, Math.min(1.5 * dt, target - car.speed));
    const move = Math.min(speed * dt, Math.max(0, gap));
    const before = car.bodies(), distance = entry.distance + entry.direction * move;
    if (!this.place(entry, route, distance)) { car.speed = 0; return; }
    let hit = false;
    for (const [b, body] of car.bodies().entries()) for (let along = body.rear; along <= body.front + 0.01; along += Math.min(1, body.front - body.rear)) {
      const point = { x: body.x + Math.sin(body.heading) * along, z: body.z - Math.cos(body.heading) * along };
      for (const other of obstacles) if (constrainVehicle(point, before[b].x + Math.sin(before[b].heading) * along,
        before[b].z - Math.cos(before[b].heading) * along, car.profile.width / 2 + 0.08,
        body.y - car.profile.radius - car.profile.rest, other, car.profile.height)) { hit = true; break; }
      if (hit) break;
    }
    if (hit) this.place(entry, route, entry.distance);
    else { entry.distance = distance; car.trip += move; car.wheelAngle += move / car.profile.radius; }
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
