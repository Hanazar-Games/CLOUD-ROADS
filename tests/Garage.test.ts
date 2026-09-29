import { expect, it } from 'vitest';
import { Garage, GARAGE_LEVELS, GARAGE_STOREY, GARAGE_HALF_WIDTH, garageSlots } from '../src/garage/Garage';
import { ServiceTerrain } from '../src/service/ServiceTerrain';
import { ParkedFleet } from '../src/service/ParkedFleet';
import { vehicleProfiles } from '../src/vehicle/VehicleConfig';
import { DrivingSurface } from '../src/vehicle/DrivingSurface';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { RoadSpine } from '../src/road/RoadSpine';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { WalkingPhysics } from '../src/walking/WalkingPhysics';

const create = () => new Garage('garage-test', { x: 1000, y: 100, z: 2000 });

it('does not spawn a road train in bays shorter than its articulated length', () => {
  const garage = create(); garage.configure(100, 'roadTrain', true);
  expect(garage.entries).toHaveLength(0);
});
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

it('joins rectangular floors with straight alternating ramps, smooth ends and at least 5.6 m headroom', () => {
  const garage = create();
  for (let floor = 0; floor < 5; floor++) {
    let last = garage.rampPoint(floor, 0), maxGrade = 0;
    for (let i = 1; i <= 320; i++) {
      const p = garage.rampPoint(floor, i / 320), grade = Math.abs(p.y - last.y) / Math.hypot(p.x - last.x, p.z - last.z);
      maxGrade = Math.max(maxGrade, grade);
      expect(p.x).toBe(last.x); expect(p.y).toBeLessThanOrEqual(last.y);
      expect(grade).toBeLessThan(0.114);
      expect(garage.surface(p.x, p.z, p.y + 0.5)).toBeCloseTo(p.y, 5);
      expect(garage.ceiling(p.x, p.z, p.y) - p.y).toBeGreaterThan(5.59);
      last = p;
    }
    expect(maxGrade).toBeGreaterThan(0.11);
    expect(last.y).toBe(100 - (floor + 1) * GARAGE_STOREY);
    if (floor < 4) expect(last.z).toBe(garage.rampPoint(floor + 1, 0).z);
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
    expect(Math.abs(slot.x) + slot.width / 2).toBeLessThan(GARAGE_HALF_WIDTH);
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

it('blocks outer walls, unused ramp portals and columns while leaving active landings open', () => {
  const garage = create();
  const body = garage.point(-53, 0, -6);
  expect(garage.constrain(body, body.x + 3, body.z, 0.42, 94, 1.75)).toBe(true);
  for (let floor = 0; floor < 5; floor++) {
    const start = garage.rampPoint(floor, 0), end = garage.rampPoint(floor, 1);
    for (const p of [start, end]) expect(garage.constrain({ ...p }, p.x, p.z, 1.6, p.y, 4.5)).toBe(false);
    const blocked = garage.point(64, floor % 2 ? -40 : 40, -floor * 6);
    expect(garage.constrain({ ...blocked }, blocked.x, blocked.z, 0.42, blocked.y, 1.75)).toBe(true);
  }
  const entry = garage.point(64, -80);
  expect(garage.constrain({ ...entry }, entry.x, entry.z - 2, 1.6, entry.y, 4.5)).toBe(false);
});

it('walks down and back up a straight ramp and its landing without dropping or snapping', () => {
  const garage = create(), surface = surfaceFor(garage), person = new WalkingPhysics(); surface.walking = true;
  for (const direction of [-1, 1]) {
    const start = garage.rampPoint(2, direction === 1 ? 0 : 1);
    person.reset(start.x, start.y, start.z, direction === 1 ? Math.PI : 0);
    for (let i = 0; i < 750; i++) {
      const previousY = person.y;
      person.update(1 / 60, { forward: 1, lateral: 0, sprint: true, run: false, jump: false }, surface);
      expect(Math.abs(person.y - previousY)).toBeLessThan(0.04);
      expect(person.grounded).toBe(true);
    }
    expect(person.y - start.y).toBeCloseTo(-direction * GARAGE_STOREY, 2);
  }
});

it.each((Object.keys(vehicleProfiles) as (keyof typeof vehicleProfiles)[]).filter(kind => vehicleProfiles[kind].length + 1 <= Math.max(...garageSlots.map(s => s.length))))('supports %s on every storey without colliding with another floor', kind => {
  const garage = create(), surface = surfaceFor(garage), car = new VehiclePhysics(kind);
  for (let floor = 0; floor < 5; floor++) {
    const p = garage.rampPoint(floor, 0.5);
    surface.level = p.y; car.reset(p.x, p.z, floor % 2 ? 0 : Math.PI, surface.sample);
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

it.each(['sedan', 'truck8', 'semi20'] as const)('drives %s through ramp transitions both ways without floor snapping or wall contact', kind => {
  const garage = create(), surface = surfaceFor(garage);
  for (const floor of [0, 1, 4]) for (const direction of [-1, 1]) {
    const car = new VehiclePhysics(kind), start = garage.rampPoint(floor, direction === 1 ? 0 : 1);
    const dz = (floor % 2 ? -1 : 1) * direction;
    surface.level = start.y; car.reset(start.x, start.z, dz > 0 ? Math.PI : 0, surface.sample);
    car.ignition = 'running'; car.speedLimit = 8;
    for (let i = 0; i < 3000 && (car.z - start.z) * dz < 96; i++) {
      surface.level = car.y - car.profile.radius - car.profile.rest;
      const px = car.x, pz = car.z, y = car.y;
      car.update(1 / 60, { throttle: 1, steer: 0, handbrake: false }, surface.sample);
      expect(surface.constrain(car, px, pz)).toBe(false);
      expect(Math.abs(car.y - y)).toBeLessThan(0.2);
    }
    expect((car.z - start.z) * dz).toBeGreaterThanOrEqual(96);
    expect(car.y - car.profile.radius - car.profile.rest).toBeCloseTo(start.y - direction * GARAGE_STOREY, 0);
  }
});

it('moves and rotates every solid, excavation and parked vehicle together', () => {
  const garage = create(), first = garage.entries[0], local = garage.local(first.x, first.z);
  const location = { x: 2000, y: 160, z: -4000 };
  garage.relocate(location, 1.2);
  expect(garage.local(garage.entries[0].x, garage.entries[0].z).x).toBeCloseTo(local.x);
  expect(garage.entries[0].heading).toBeCloseTo(1.2);
  expect(garage.ground.excavation!.bottom).toBe(location.y - 31);
  expect(garage.surface(location.x, location.z, location.y - 12 + 0.45)).toBe(location.y - 12);
  const p = garage.rampPoint(3, 0.6);
  expect(garage.surface(p.x, p.z, p.y)).toBeCloseTo(p.y);
  const terrain = new ServiceTerrain([garage.ground]);
  expect(terrain.height(p.x, p.z, 200, 500, 5)).toBeLessThan(130);
  expect(terrain.contains(p.x, p.z)).toBe(true);
});

it('invalidates parked vehicle templates created before the garage is connected and relocated', () => {
  const garage = create(), fleet = new ParkedFleet('garage-test');
  garage.configure(100, 'sedan', true); fleet.sync([], garage.entries);
  const old = fleet.vehicle(fleet.entries[0]);
  garage.relocate({ x: 700, y: 200, z: -400 }, 1.1); fleet.sync([], garage.entries);
  const entry = fleet.entries[0], car = fleet.vehicle(entry);
  expect(car).not.toBe(old); expect(car.x).toBe(entry.x); expect(car.z).toBe(entry.z);
  expect(car.heading).toBeCloseTo(1.1); expect(car.y).toBeGreaterThan(entry.y); expect(car.y).toBeLessThan(entry.y + 1);
});
