import { createRng, hashSeed } from '../world/WorldSeed';
import { vehicleProfiles, type VehicleKind } from '../vehicle/VehicleConfig';
import type { ParkedEntry } from '../service/ServiceParking';
import type { ServiceGround, ServicePoint } from '../service/ServiceTerrain';
import { constrainObstacle } from '../service/ServiceCollision';
import { RoadIndex } from '../road/RoadIndex';

export const GARAGE_LEVELS = 5;
export const GARAGE_STOREY = 6;
export const GARAGE_HALF_LENGTH = 80;
export const GARAGE_HALF_WIDTH = 52;
export const GARAGE_APRON = 132;
export const GARAGE_RAMP_RUN = 80;
export const GARAGE_RAMP_WIDTH = 20;
export const GARAGE_RAMPS = [64, 88];
export const GARAGE_SEGMENTS = 80;
const paints = [0xd8dedb, 0x29485e, 0x377d78, 0xa73d32, 0xdca632, 0x353d43, 0x7d658e, 0x9b7453, 0x83b3bb, 0xd4bc97];
export const garageSlots = [
  ...[-34, 34].flatMap(z => Array.from({ length: 13 }, (_, i) => ({ x: (i - 6) * 4, z, width: 3.6, length: 8 }))),
  ...Array.from({ length: 7 }, (_, i) => ({ x: (i - 3) * 7, z: 0, width: 5.6, length: 26 })),
];
export const garageColumns = [-34, 34].flatMap(x => [-24, 24].map(z => ({ x, z })));
export interface GarageWall { a: ServicePoint; b: ServicePoint; top: number; width: number }

export class Garage {
  readonly ground: ServiceGround;
  readonly walls: GarageWall[] = [];
  private wallIndex = new RoadIndex([]);
  entries: ParkedEntry[] = [];
  loading: 'floor' | 'all' = 'floor';
  light = 1;
  private signature = '';

  constructor(private readonly seed: string, readonly position: ServicePoint, readonly levels = GARAGE_LEVELS, readonly id = 'main', public heading = 0) {
    this.ground = { pads: [], access: [], barriers: [], elevated: false };
    this.place(); this.configure(50, 'random', true);
  }

  private place(): void {
    this.ground.excavation = { ...this.point(24, 0), halfWidth: 78, halfLength: 82, heading: this.heading,
      bottom: this.position.y - this.levels * GARAGE_STOREY - 1 };
    this.walls.length = 0;
    const wall = (x: number, z: number, xx: number, zz: number, bottom: number, top: number, width = 0.6) => {
      this.walls.push({ a: this.point(x, z, bottom), b: this.point(xx, zz, bottom), top: this.position.y + top, width });
    };
    const bottom = -this.levels * GARAGE_STOREY;
    wall(-52, -80, -52, 80, bottom, 1.2); wall(-52, 80, 100, 80, bottom, 1.2);
    wall(100, 80, 100, -80, bottom, 1.2);
    wall(-52, -80, 54, -80, bottom, 1.2); wall(74, -80, 100, -80, bottom, 1.2);
    wall(54, -80, 74, -80, bottom, -0.5);
    for (const x of [52, 76]) wall(x, -40, x, 40, bottom, 1.2);
    for (let floor = 0; floor <= this.levels; floor++) for (const [shaft, x] of GARAGE_RAMPS.entries()) for (const side of [-1, 1]) {
      const open = side === (floor % 2 ? 1 : -1)
        && (floor < this.levels && shaft === floor % 2 || floor > 0 && shaft === (floor - 1) % 2);
      if (!open) wall(x - 12, side * 40, x + 12, side * 40, -floor * GARAGE_STOREY, -floor * GARAGE_STOREY + 1.2, 0.4);
    }
    this.wallIndex = new RoadIndex(this.walls);
  }

  relocate(position: ServicePoint, heading = this.heading): void {
    const entries = this.entries.map(entry => ({ entry, local: this.local(entry.x, entry.z), y: entry.y - this.position.y, heading: entry.heading - this.heading }));
    Object.assign(this.position, position); this.heading = heading; this.place();
    this.entries = entries.map(({ entry, local, y, heading }) => ({ ...entry, ...this.point(local.x, local.z, y), heading: heading + this.heading, padHeading: this.heading }));
  }

  point(x: number, z: number, height = 0): ServicePoint {
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    return { x: this.position.x + c * x - s * z, y: this.position.y + height, z: this.position.z + s * x + c * z };
  }

  local(x: number, z: number): { x: number; z: number } {
    const dx = x - this.position.x, dz = z - this.position.z, c = Math.cos(this.heading), s = Math.sin(this.heading);
    return { x: dx * c + dz * s, z: -dx * s + dz * c };
  }

  rampPoint(floor: number, progress: number, offset = 0): ServicePoint {
    const t = Math.max(0, Math.min(1, progress));
    return this.point(GARAGE_RAMPS[floor % 2] + offset, (floor % 2 ? 1 : -1) * (40 - t * GARAGE_RAMP_RUN),
      -(floor + t * t * (3 - 2 * t)) * GARAGE_STOREY);
  }

  private surfaces(x: number, z: number): number[] {
    const p = this.local(x, z);
    if (p.x < -52 - 1e-6 || p.x > 100 + 1e-6 || Math.abs(p.z) > 80 + 1e-6) return [];
    if (p.x <= 52 || Math.abs(p.z) >= 40 - 1e-6) return Array.from({ length: this.levels + 1 }, (_, floor) => this.position.y - floor * GARAGE_STOREY);
    const shaft = p.x < 76 ? 0 : 1, heights: number[] = [];
    for (let floor = shaft; floor < this.levels; floor += 2) heights.push(this.rampPoint(floor, (40 + (shaft ? -p.z : p.z)) / GARAGE_RAMP_RUN).y);
    if (shaft === 1) heights.push(this.position.y);
    return heights;
  }

  surface(x: number, z: number, reference = this.position.y, ceiling = Infinity): number | undefined {
    const heights = this.surfaces(x, z).filter(y => y <= ceiling && y < reference + 2);
    return heights.length ? heights.reduce((best, y) => Math.abs(y - reference) < Math.abs(best - reference) ? y : best) : undefined;
  }

  ceiling(x: number, z: number, feet: number): number {
    return Math.min(Infinity, ...this.surfaces(x, z).filter(y => y > feet + 0.5).map(y => y - 0.4));
  }

  shelter(x: number, y: number, z: number): number {
    return y > this.position.y - this.levels * GARAGE_STOREY - 0.5 && y < this.ceiling(x, z, y) && Number.isFinite(this.ceiling(x, z, y)) ? 1 : 0;
  }

  floor(x: number, y: number, z: number): number | undefined {
    const p = this.local(x, z);
    if (p.x < -53 || p.x > 101 || Math.abs(p.z) > 81 || y > this.position.y + 5 || y < this.position.y - this.levels * GARAGE_STOREY - 1) return;
    return Math.max(0, Math.min(this.levels, Math.ceil((this.position.y - y) / GARAGE_STOREY)));
  }

  visibleFloor(floor: number, viewer: number | undefined): boolean {
    return this.loading === 'all' || Math.abs(floor - (viewer ?? 0)) <= 1;
  }

  spawn(floor: number): ServicePoint & { heading: number } {
    const level = Math.max(0, Math.min(this.levels, Math.round(floor)));
    return { ...this.point(level ? -40 : 64, level ? 0 : -72, -level * GARAGE_STOREY), heading: this.heading + (level ? Math.PI / 2 : Math.PI) };
  }

  configure(density: number, kind: VehicleKind | 'random', randomPaint: boolean): void {
    if (!Number.isFinite(density) || kind !== 'random' && !Object.hasOwn(vehicleProfiles, kind)) return;
    density = Math.max(0, Math.min(100, density));
    const signature = `${density}:${kind}:${randomPaint}`;
    if (signature === this.signature) return;
    this.signature = signature;
    const entries: ParkedEntry[] = [], kinds = Object.keys(vehicleProfiles) as VehicleKind[];
    for (let floor = 1; floor <= this.levels; floor++) for (const [i, slot] of garageSlots.entries()) {
      const random = createRng(hashSeed(`${this.seed}:garage:${this.id}:${floor}:${i}`));
      const occupied = random(), choice = random(), paint = random();
      const allowed = (kind === 'random' ? kinds : [kind]).filter(k => vehicleProfiles[k].length + 1 <= slot.length && vehicleProfiles[k].width + 0.8 <= slot.width);
      if (occupied >= density / 100 || !allowed.length) continue;
      const selected = allowed[Math.floor(choice * allowed.length)], profile = vehicleProfiles[selected];
      entries.push({ id: `garage:${this.id}:${floor}:${i}:${selected}:${randomPaint}`, slot: (floor - 1) * garageSlots.length + i, kind: selected,
        paint: randomPaint ? paints[Math.floor(paint * paints.length)] : profile.paint,
        ...this.point(slot.x, slot.z - (profile.length - profile.chassisLength) / 2, -floor * GARAGE_STOREY), heading: this.heading, grade: 0, padHeading: this.heading });
    }
    this.entries = entries;
  }

  constrain(body: ServicePoint, px: number, pz: number, radius: number, feet: number, height: number): boolean {
    let hit = false;
    const reach = radius + 0.65;
    for (const i of this.wallIndex.within(Math.min(body.x, px) - reach, Math.min(body.z, pz) - reach, Math.max(body.x, px) + reach, Math.max(body.z, pz) + reach)) {
      const { a, b, top, width } = this.walls[i];
      if (feet + height < a.y || feet > top) continue;
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      hit = constrainObstacle(body, px, pz, radius, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2,
        heading: Math.atan2(b.x - a.x, a.z - b.z), width, front: length / 2, rear: -length / 2 }) || hit;
    }
    if (feet < this.position.y && feet + height > this.position.y - this.levels * GARAGE_STOREY) for (const column of garageColumns) {
      hit = constrainObstacle(body, px, pz, radius, { ...this.point(column.x, column.z), heading: this.heading, width: 1.2, front: 0.6, rear: -0.6 }) || hit;
    }
    return hit;
  }
}
