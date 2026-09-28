import { createRng, hashSeed } from '../world/WorldSeed';
import { vehicleProfiles, type VehicleKind } from '../vehicle/VehicleConfig';
import type { ParkedEntry } from '../service/ServiceParking';
import type { ServiceGround, ServicePoint } from '../service/ServiceTerrain';
import { constrainObstacle } from '../service/ServiceCollision';
import { RoadIndex } from '../road/RoadIndex';

export const GARAGE_LEVELS = 5;
export const GARAGE_STOREY = 6;
export const GARAGE_RADIUS = 52;
export const GARAGE_OUTER = 70;
export const GARAGE_APRON = 84;
export const GARAGE_SEGMENTS = 128;
export const GARAGE_GATE = Math.PI / 8;
const TAU = Math.PI * 2;
const paints = [0xd8dedb, 0x29485e, 0x377d78, 0xa73d32, 0xdca632, 0x353d43, 0x7d658e, 0x9b7453, 0x83b3bb, 0xd4bc97];
export const garageSlots = [
  ...[-34, 34].flatMap(z => Array.from({ length: 13 }, (_, i) => ({ x: (i - 6) * 4, z, width: 3.6, length: 8 }))),
  ...Array.from({ length: 7 }, (_, i) => ({ x: (i - 3) * 7, z: 0, width: 5.6, length: 26 })),
];
export const garageColumns = [-34, 34].flatMap(x => [-24, 24].map(z => ({ x, z })));
export interface GarageWall { a: ServicePoint; b: ServicePoint; top: number; width: number }

export function garageLocation(terrain: { sample(x: number, z: number): number }, blocked: (x: number, z: number) => boolean = () => false): ServicePoint {
  let best = { x: 640, y: 0, z: 128 }, score = Infinity;
  for (let ring = 0; ring < 8 && !Number.isFinite(score); ring++) for (const side of [-1, 1]) for (let i = 0; i < 16; i++) {
    const x = 128 + side * (400 + ring * 1000 + i % 3 * 120), z = 128 + (i - 4) * 160;
    if (blocked(x, z)) continue;
    const heights = Array.from({ length: 17 }, (_, j) => terrain.sample(x + (j ? Math.cos(j / 16 * TAU) * 88 : 0), z + (j ? Math.sin(j / 16 * TAU) * 88 : 0)));
    const low = Math.min(...heights), spread = Math.max(...heights) - low;
    if (spread < score) { score = spread; best = { x, y: low + 0.3, z }; }
  }
  return best;
}

export class Garage {
  readonly ground: ServiceGround;
  readonly walls: GarageWall[] = [];
  private wallIndex;
  entries: ParkedEntry[] = [];
  private signature = '';

  constructor(private readonly seed: string, readonly position: ServicePoint, readonly levels = GARAGE_LEVELS, readonly id = 'main') {
    this.ground = { pads: [], access: [], barriers: [], elevated: false,
      excavation: { ...position, radius: GARAGE_OUTER + 2, bottom: position.y - this.levels * GARAGE_STOREY - 1 } };
    for (let i = 0; i < GARAGE_SEGMENTS; i++) {
      const t = i / GARAGE_SEGMENTS * TAU, next = (i + 1) / GARAGE_SEGMENTS * TAU;
      const gate = t < GARAGE_GATE || next > TAU - GARAGE_GATE;
      for (const radius of [GARAGE_RADIUS, GARAGE_OUTER]) {
        if (radius === GARAGE_RADIUS && gate) continue;
        const bottom = radius === GARAGE_OUTER && gate ? 0.8 : -0.8;
        const a = this.point(radius, t, -this.levels * GARAGE_STOREY), b = this.point(radius, next, -this.levels * GARAGE_STOREY);
        this.walls.push({ a, b, top: position.y - bottom, width: radius === GARAGE_OUTER ? 1.2 : 0.5 });
      }
    }
    // End caps prevent leaving the first or last ramp onto a different storey.
    for (const [floor, angle] of [[0, TAU - GARAGE_GATE], [this.levels, GARAGE_GATE]]) {
      const a = this.point(GARAGE_RADIUS, angle, -floor * GARAGE_STOREY), b = this.point(GARAGE_OUTER, angle, -floor * GARAGE_STOREY);
      this.walls.push({ a, b, top: a.y + 1.4, width: 0.4 });
    }
    this.wallIndex = new RoadIndex(this.walls);
    this.configure(50, 'random', true);
  }

  relocate(position: ServicePoint): void {
    const dx = position.x - this.position.x, dy = position.y - this.position.y, dz = position.z - this.position.z;
    Object.assign(this.position, position);
    Object.assign(this.ground.excavation!, position, { bottom: position.y - this.levels * GARAGE_STOREY - 1 });
    for (const wall of this.walls) {
      for (const point of [wall.a, wall.b]) { point.x += dx; point.y += dy; point.z += dz; }
      wall.top += dy;
    }
    this.wallIndex = new RoadIndex(this.walls);
    this.entries = this.entries.map(entry => ({ ...entry, x: entry.x + dx, y: entry.y + dy, z: entry.z + dz }));
  }

  point(radius: number, angle: number, height: number): ServicePoint {
    return { x: this.position.x - Math.cos(angle) * radius, y: this.position.y + height, z: this.position.z + Math.sin(angle) * radius };
  }

  rampPoint(floor: number, angle: number, radius = (GARAGE_RADIUS + GARAGE_OUTER) / 2): ServicePoint {
    const t = Math.max(0, Math.min(1, (angle - GARAGE_GATE) / (TAU - 2 * GARAGE_GATE)));
    return this.point(radius, angle, -(floor + t * t * (3 - 2 * t)) * GARAGE_STOREY);
  }

  private surfaces(x: number, z: number): number[] {
    const dx = x - this.position.x, dz = z - this.position.z, r = Math.hypot(dx, dz);
    if (r > GARAGE_APRON) return [];
    if (r <= GARAGE_RADIUS) return Array.from({ length: this.levels + 1 }, (_, floor) => this.position.y - floor * GARAGE_STOREY);
    if (r >= GARAGE_OUTER) return [this.position.y];
    const angle = (Math.atan2(dz, -dx) + TAU) % TAU;
    const heights = Array.from({ length: this.levels }, (_, floor) => this.rampPoint(floor, angle).y);
    if (angle <= GARAGE_GATE) heights.push(this.position.y - this.levels * GARAGE_STOREY);
    if (angle >= TAU - GARAGE_GATE) heights.push(this.position.y);
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
    if (Math.hypot(x - this.position.x, z - this.position.z) > GARAGE_APRON || y > this.position.y + 5 || y < this.position.y - this.levels * GARAGE_STOREY - 1) return;
    return Math.max(0, Math.min(this.levels, Math.ceil((this.position.y - y) / GARAGE_STOREY)));
  }

  spawn(floor: number): ServicePoint & { heading: number } {
    const level = Math.max(0, Math.min(this.levels, Math.round(floor)));
    return { x: this.position.x - (level ? 40 : 80), y: this.position.y - level * GARAGE_STOREY, z: this.position.z, heading: Math.PI / 2 };
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
        x: this.position.x + slot.x, y: this.position.y - floor * GARAGE_STOREY,
        z: this.position.z + slot.z - (profile.length - profile.chassisLength) / 2, heading: 0, grade: 0, padHeading: 0 });
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
      hit = constrainObstacle(body, px, pz, radius, { x: this.position.x + column.x, z: this.position.z + column.z, heading: 0, width: 1.2, front: 0.6, rear: -0.6 }) || hit;
    }
    if (feet + height > this.position.y) for (const [x, z, width, length, top] of [[-78, -16, 1, 1, 7.2], [-78, 16, 1, 1, 7.2], [24, 16, 9, 6, 3.2]]) {
      if (feet > this.position.y + top) continue;
      hit = constrainObstacle(body, px, pz, radius, { x: this.position.x + x, z: this.position.z + z, heading: 0, width, front: length / 2, rear: -length / 2 }) || hit;
    }
    return hit;
  }
}
