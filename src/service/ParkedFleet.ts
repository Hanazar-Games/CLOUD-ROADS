import { VehiclePhysics } from '../vehicle/VehiclePhysics';
import type { ServiceArea } from './ServicePlanner';
import { parkedAt, type ParkedEntry } from './ServiceParking';
import { constrainVehicle } from './ServiceCollision';
import { vehicleSupport } from '../vehicle/VehicleSolids';
import { vehicleProfiles } from '../vehicle/VehicleConfig';

export class ParkedFleet {
  entries: ParkedEntry[] = [];
  version = 0;
  private signature = '';
  private serial = 0;
  private readonly taken = new Set<string>();
  private readonly returned = new Map<string, { entry: ParkedEntry; car: VehiclePhysics }>();
  private readonly cars = new Map<string, VehiclePhysics>();
  private generated: ParkedEntry[] = [];
  private extras: readonly ParkedEntry[] = [];
  constructor(private readonly seed: string, private readonly gravity = 9.81) {}
  sync(sites: readonly ServiceArea[], extras: readonly ParkedEntry[] = this.extras): void {
    const signature = sites.map(s => `${s.sample.routeId}:${s.id}:${s.ground.pads[0]?.x}:${s.ground.pads[0]?.z}`).join('|');
    if (signature === this.signature && extras === this.extras) return;
    const previous = new Map(this.generated.map(entry => [entry.id, entry]));
    this.signature = signature; this.extras = extras; this.generated = [...sites.flatMap(site => parkedAt(this.seed, site)), ...extras];
    for (const entry of this.generated) {
      const old = previous.get(entry.id);
      if (old && (['x', 'y', 'z', 'heading', 'grade', 'padHeading', 'paint', 'kind'] as const).some(key => old[key] !== entry[key])) this.cars.delete(entry.id);
    }
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
      car.paint = entry.paint; car.gravity = this.gravity;
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
    car.roofOpen = car.roofOpen < 0.5 ? 0 : 1;
    const entry: ParkedEntry = { id, slot: -1, kind: car.kind, paint: car.paint, x: car.x, y: car.y, z: car.z, heading: car.heading, grade: 0, padHeading: car.heading };
    this.returned.delete(id); this.returned.set(id, { entry, car });
    while (this.returned.size > 64) this.returned.delete(this.returned.keys().next().value!);
    this.refresh();
  }
  support(x: number, z: number, ceiling: number): number | undefined {
    let height: number | undefined;
    for (const entry of this.entries) {
      const reach = vehicleProfiles[entry.kind].length + 3;
      if (Math.abs(entry.x - x) > reach || Math.abs(entry.z - z) > reach || Number.isFinite(ceiling)
        && (entry.y - 2 > ceiling || entry.y + vehicleProfiles[entry.kind].height + 4 < ceiling)) continue;
      const top = vehicleSupport(this.vehicle(entry), x, z, ceiling);
      if (top !== undefined && (height === undefined || top > height)) height = top;
    }
    return height;
  }
  constrain(body: { x: number; y: number; z: number }, previousX: number, previousZ: number, radius: number, feet: number, height = 1.75): boolean {
    let hit = false;
    for (const entry of this.entries) {
      const reach = vehicleProfiles[entry.kind].length + radius + 3;
      if (entry.x < Math.min(body.x, previousX) - reach || entry.x > Math.max(body.x, previousX) + reach
        || entry.z < Math.min(body.z, previousZ) - reach || entry.z > Math.max(body.z, previousZ) + reach
        || entry.y > feet + height + 2 || entry.y + vehicleProfiles[entry.kind].height + 2 < feet) continue;
      hit = constrainVehicle(body, previousX, previousZ, radius, feet, this.vehicle(entry), height) || hit;
    }
    return hit;
  }
}
