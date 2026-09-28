import { expect, it } from 'vitest';
import { Garage, GARAGE_LEVELS, GARAGE_STOREY, GARAGE_RADIUS, garageSlots, garageLocation } from '../src/garage/Garage';
import { ServiceTerrain } from '../src/service/ServiceTerrain';
import { ParkedFleet } from '../src/service/ParkedFleet';
import { vehicleProfiles } from '../src/vehicle/VehicleConfig';
import { DrivingSurface } from '../src/vehicle/DrivingSurface';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { RoadSpine } from '../src/road/RoadSpine';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { WalkingPhysics } from '../src/walking/WalkingPhysics';

const create = () => new Garage('garage-test', { x: 1000, y: 100, z: 2000 });
function surfaceFor(garage: Garage) {
  return new DrivingSurface({ seed: 'garage-test', options: DEFAULT_OPTIONS, garage,
    road: new RoadSpine('garage-test', { sample: () => 100 }), bridges: [], tunnels: [], services: [], groundHeight: () => 69 });
}

it('provides five separate floors, dry cover and enough headroom for every vehicle', () => {
  const garage = create();
  expect(GARAGE_LEVELS).toBe(5);
  for (let floor = 1; floor <= 5; floor++) {
    const p = garage.spawn(floor);
    expect(garage.surface(p.x, p.z, p.y + 0.45)).toBe(p.y);
    expect(garage.surface(p.x, p.z, p.y + 0.45, p.y + 0.45)).toBe(p.y);
    expect(garage.ceiling(p.x, p.z, p.y) - p.y).toBeGreaterThan(Math.max(...Object.values(vehicleProfiles).map(v => v.height)) + 0.3);
    expect(garage.shelter(p.x, p.y + 1.7, p.z)).toBe(1);
  }
});

it('joins all floors with a continuous gentle two-way ramp and flat entrances', () => {
  const garage = create();
  for (let floor = 0; floor < 5; floor++) {
    let last = garage.rampPoint(floor, 0);
    for (let i = 1; i <= 360; i++) {
      const p = garage.rampPoint(floor, i / 360 * Math.PI * 2);
      expect(p.y).toBeLessThanOrEqual(last.y + 1e-8);
      expect(Math.abs(p.y - last.y) / Math.hypot(p.x - last.x, p.z - last.z)).toBeLessThan(0.04);
      expect(garage.surface(p.x, p.z, p.y + 0.5)).toBeCloseTo(p.y, 4);
      expect(garage.ceiling(p.x, p.z, p.y) - p.y).toBeGreaterThan(5.4);
      last = p;
    }
    expect(last.y).toBe(100 - (floor + 1) * GARAGE_STOREY);
  }
});

it('generates deterministic, diverse cars fitting marked bays without overlapping', () => {
  const garage = create(); garage.configure(100, 'random', true);
  const other = create(); other.configure(100, 'random', true);
  expect(garage.entries).toEqual(other.entries);
  expect(garage.entries).toHaveLength(garageSlots.length * 5);
  expect(new Set(garage.entries.map(e => e.paint)).size).toBeGreaterThan(5);
  expect(new Set(garage.entries.map(e => e.kind)).size).toBeGreaterThan(10);
  for (const entry of garage.entries) {
    const slot = garageSlots[entry.slot % garageSlots.length], profile = vehicleProfiles[entry.kind];
    expect(profile.length + 1).toBeLessThanOrEqual(slot.length);
    expect(profile.width + 0.8).toBeLessThanOrEqual(slot.width);
    expect(Math.hypot(slot.x, slot.z) + slot.length / 2).toBeLessThan(GARAGE_RADIUS);
  }
  garage.configure(100, 'semi20', true);
  expect(garage.entries.length).toBeGreaterThan(0);
  expect(garage.entries.every(e => e.kind === 'semi20')).toBe(true);
  garage.configure(0, 'random', true); expect(garage.entries).toHaveLength(0);
});

it('excavates terrain below the lowest slab and reserves the entire site from vegetation', () => {
  const garage = create(), terrain = new ServiceTerrain([garage.ground]);
  expect(terrain.height(1000, 2000, 120, 200, 5)).toBeLessThan(100 - 5 * GARAGE_STOREY - 0.4);
  expect(terrain.contains(1000, 2000)).toBe(true);
  expect(terrain.forChunk(3, 7)).toContain(garage.ground);
  expect(terrain.height(2000, 2000, 120, 200, 5)).toBe(120);
});

it('shares vehicle boarding with the existing fleet and preserves taken cars across route refreshes', () => {
  const garage = create(), fleet = new ParkedFleet('garage-test');
  fleet.sync([], garage.entries);
  const entry = fleet.entries[0], car = fleet.take(entry.id)!;
  expect(car.kind).toBe(entry.kind); expect(car.paint).toBe(entry.paint);
  expect(Math.abs(car.y - entry.y - car.profile.radius - car.profile.rest)).toBeLessThan(car.profile.travel);
  fleet.sync([], garage.entries); expect(fleet.entries.some(e => e.id === entry.id)).toBe(false);
  fleet.park(car); expect(fleet.entries.some(e => fleet.vehicle(e) === car)).toBe(true);
});

it('blocks solid walls and columns while keeping each floor entrance open', () => {
  const garage = create();
  const body = { x: 1000 + GARAGE_RADIUS + 1, y: 94, z: 2000 };
  expect(garage.constrain(body, 1000 + GARAGE_RADIUS - 2, 2000, 0.42, 94, 1.75)).toBe(true);
  const entry = { x: 1000 - GARAGE_RADIUS - 1, y: 94, z: 2000 };
  expect(garage.constrain(entry, 1000 - GARAGE_RADIUS + 2, 2000, 0.42, 94, 1.75)).toBe(false);
  const pillar = { x: 922, y: 100, z: 2016 };
  expect(garage.constrain(pillar, 920, 2016, 0.42, 100, 1.75)).toBe(true);
  const lowerFloor = { x: 1024, y: 94, z: 2016 };
  expect(garage.constrain(lowerFloor, 1020, 2016, 0.42, 94, 1.75)).toBe(false);
});

it('walks continuously down and up the spiral through a floor seam without dropping or snapping', () => {
  const garage = create(), surface = surfaceFor(garage), person = new WalkingPhysics(); surface.walking = true;
  for (const direction of [-1, 1]) {
    const start = garage.rampPoint(2, Math.PI);
    person.reset(start.x, start.y, start.z, 0);
    let travelled = 0, angle = Math.PI;
    for (let i = 0; travelled < Math.PI * 2 && i < 900; i++) {
      const next = garage.point(61, angle + direction * 0.1, 0);
      person.heading = Math.atan2(next.x - person.x, person.z - next.z);
      const previousY = person.y;
      person.update(0.1, { forward: 1, lateral: 0, sprint: true, run: false, jump: false }, surface);
      const now = Math.atan2(person.z - garage.position.z, garage.position.x - person.x);
      travelled += Math.abs(Math.atan2(Math.sin(now - angle), Math.cos(now - angle))); angle = now;
      expect(Math.abs(person.y - previousY)).toBeLessThan(0.08);
      expect(person.grounded).toBe(true);
    }
    expect(travelled).toBeGreaterThanOrEqual(Math.PI * 2);
    expect(person.y - start.y).toBeCloseTo(-direction * GARAGE_STOREY, 1);
  }
});

it.each(Object.keys(vehicleProfiles) as (keyof typeof vehicleProfiles)[])('supports %s on every storey without colliding with another floor', kind => {
  const garage = create(), surface = surfaceFor(garage), car = new VehiclePhysics(kind);
  for (let floor = 0; floor < 5; floor++) {
    const angle = 1.4, p = garage.rampPoint(floor, angle);
    surface.level = p.y; car.reset(p.x, p.z, Math.PI - angle, surface.sample);
    expect(surface.constrain(car, car.x, car.z)).toBe(false);
    expect(car.y).toBeGreaterThan(p.y); expect(car.y).toBeLessThan(p.y + 1.7);
    expect(surface.ceiling(car.x, car.z, p.y) - p.y).toBeGreaterThan(car.profile.height + 0.3);
    if (floor) expect(surface.inTunnel(car.x, car.z)).toBe(true);
  }
});

it('keeps covered floors dry while the surface plaza responds to rain', () => {
  const garage = create(), surface = surfaceFor(garage); surface.wet = 1;
  surface.level = 70; expect(surface.sample(1000, 2000).grip).toBe(1);
  surface.level = 100; expect(surface.sample(1000, 2000).grip).toBeCloseTo(0.62);
});

it('avoids reserved road corridors and moves every solid and parked vehicle together when placing the site', () => {
  const reserved = (x: number) => Math.abs(x - 128) < 1000;
  const location = garageLocation({ sample: () => 125 }, reserved);
  expect(reserved(location.x)).toBe(false);
  const garage = create(), first = garage.entries[0], wall = { ...garage.walls[0].a };
  garage.relocate(location);
  expect(garage.entries[0].x - first.x).toBe(location.x - 1000);
  expect(garage.walls[0].a.x - wall.x).toBe(location.x - 1000);
  expect(garage.ground.excavation!.bottom).toBe(location.y - 31);
  expect(garage.surface(location.x, location.z, location.y - 12 + 0.45)).toBe(location.y - 12);
});
