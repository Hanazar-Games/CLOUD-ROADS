import { VehiclePhysics } from '../vehicle/VehiclePhysics';
import type { ServiceArea } from './ServicePlanner';
import { parkedAt, type ParkedEntry } from './ServiceParking';
import { constrainObstacle } from './ServiceCollision';

export class ParkedFleet {
  entries: ParkedEntry[] = [];
  version = 0;
  private signature = '';
  private serial = 0;
  private readonly taken = new Set<string>();
  private readonly returned = new Map<string, { entry: ParkedEntry; car: VehiclePhysics }>();
  private readonly cars = new Map<string, VehiclePhysics>();
  private generated: ParkedEntry[] = [];
  constructor(private readonly seed: string) {}
  sync(sites: readonly ServiceArea[]): void {
    const signature = sites.map(s => `${s.sample.routeId}:${s.id}:${s.ground.pads[0]?.x}:${s.ground.pads[0]?.z}`).join('|');
    if (signature === this.signature) return;
    this.signature = signature; this.generated = sites.flatMap(site => parkedAt(this.seed, site));
    const visible = new Set(this.generated.map(e => e.id));
    for (const id of this.cars.keys()) if (!visible.has(id)) this.cars.delete(id);
    this.refresh();
  }
  private refresh(): void {
    this.entries = [...this.generated.filter(entry => !this.taken.has(entry.id)), ...[...this.returned.values()].map(value => value.entry)];
    this.version++;
  }
  vehicle(entry: ParkedEntry): VehiclePhysics {
    const returned = this.returned.get(entry.id); if (returned) return returned.car;
    let car = this.cars.get(entry.id);
    if (!car) {
      car = new VehiclePhysics(entry.kind);
      car.reset(entry.x, entry.z, entry.heading, (x, z) => ({ height: entry.y + entry.grade * ((x - entry.x) * Math.sin(entry.padHeading) - (z - entry.z) * Math.cos(entry.padHeading)), grip: 1 }));
      this.cars.set(entry.id, car);
    }
    return car;
  }
  take(id: string): VehiclePhysics | undefined {
    const entry = this.entries.find(e => e.id === id); if (!entry) return;
    const car = this.vehicle(entry); this.returned.delete(id); this.cars.delete(id); this.taken.add(id);
    while (this.taken.size > 512) this.taken.delete(this.taken.values().next().value!);
    this.refresh(); return car;
  }
  park(car: VehiclePhysics, id = `visitor:${++this.serial}`): void {
    car.park();
    const entry: ParkedEntry = { id, slot: -1, kind: car.kind, x: car.x, y: car.y, z: car.z, heading: car.heading, grade: 0, padHeading: car.heading };
    this.returned.delete(id); this.returned.set(id, { entry, car });
    while (this.returned.size > 64) this.returned.delete(this.returned.keys().next().value!);
    this.refresh();
  }
  constrain(body: { x: number; y: number; z: number }, previousX: number, previousZ: number, radius: number, feet: number): boolean {
    let hit = false;
    for (const entry of this.entries) {
      if (Math.hypot(entry.x - body.x, entry.z - body.z) > 28) continue;
      const car = this.vehicle(entry), ground = car.y - car.profile.radius - car.profile.rest;
      if (feet < ground - 1 || feet > ground + car.profile.height) continue;
      for (const obstacle of car.bodies()) hit = constrainObstacle(body, previousX, previousZ, radius, { ...obstacle, width: car.profile.width }) || hit;
    }
    return hit;
  }
}
