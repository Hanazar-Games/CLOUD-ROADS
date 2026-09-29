import { expect, it } from 'vitest';
import { cabinLayouts, CabinWalk } from '../src/vehicle/CabinWalk';
import { CabinState } from '../src/vehicle/CabinState';
import { vehicleProfiles } from '../src/vehicle/VehicleConfig';

const idle = { forward: 0, lateral: 0, run: false, sprint: false, jump: false };
it('requires stopping, removes driving authority while standing, and restores it only after sitting', () => {
  const cabin = new CabinState(vehicleProfiles.coach), walk = new CabinWalk(vehicleProfiles.coach);
  expect(walk.leaveSeat(cabin, 1)).toBe(false);
  expect(walk.leaveSeat(cabin, NaN)).toBe(false);
  expect(cabin.driver).toBe(true);
  expect(walk.leaveSeat(cabin, 0)).toBe(true);
  expect(cabin.driver).toBe(false);
  expect(cabin.standing).toBe(true);
  expect(cabin.select('driver', 1)).toBe(false);
  expect(cabin.standing).toBe(true);
  expect(cabin.select('driver', 0)).toBe(true);
  expect(cabin.driver).toBe(true);
});

it('walks the coach aisle while walls and seats block sideways movement', () => {
  const p = vehicleProfiles.coach, cabin = new CabinState(p), walk = new CabinWalk(p);
  walk.leaveSeat(cabin, 0);
  for (let i = 0; i < 180; i++) walk.update(1 / 60, { ...idle, forward: -1 }, [0, 0]);
  expect(walk.person.z).toBeGreaterThan(-p.length / 2 + 4);
  const z = walk.person.z;
  for (let i = 0; i < 180; i++) walk.update(1 / 60, { ...idle, lateral: 1 }, [0, 0]);
  expect(Math.abs(walk.person.x)).toBeLessThan(0.25);
  expect(Math.abs(walk.person.z - z)).toBeLessThan(0.1);
  for (let i = 0; i < 900; i++) walk.update(1 / 60, { ...idle, forward: -1, jump: i % 30 === 0 }, [0, 0]);
  expect(walk.person.z).toBeLessThan(p.length / 2);
  expect(walk.person.y + walk.eyeHeight).toBeLessThan(walk.layout!.bounds.max.y);
});

it('models only walkable interiors and keeps each trailer compartment separate', () => {
  expect(cabinLayouts(vehicleProfiles.motorcycle)).toHaveLength(0);
  expect(cabinLayouts(vehicleProfiles.heavySemi)).toHaveLength(0);
  const train = cabinLayouts(vehicleProfiles.roadTrain);
  expect(train.map(l => l.part)).toEqual([1, 2, 3]);
  expect(train.every(l => l.entry === 'cargo')).toBe(true);
  expect(cabinLayouts(vehicleProfiles.camper)[0].entry).toBe('cabin');
  expect(cabinLayouts(vehicleProfiles.doubleDecker)[0].stairs).toBeDefined();
  const walk = new CabinWalk(vehicleProfiles.truck8);
  expect(walk.leaveSeat(new CabinState(vehicleProfiles.truck8), 0)).toBe(false);
});

it('keeps movement frozen without elapsed time and clears input when suspended', () => {
  const p = vehicleProfiles.camper, walk = new CabinWalk(p);
  walk.leaveSeat(new CabinState(p), 0);
  const before = [walk.person.x, walk.person.y, walk.person.z];
  walk.update(0, { ...idle, forward: 1 }, [100, 100]);
  expect([walk.person.x, walk.person.y, walk.person.z]).toEqual(before);
  expect(walk.person.speed).toBe(0);
});

it('climbs the physical double-decker stairs, crosses the upper landing and returns downstairs', () => {
  const p = vehicleProfiles.doubleDecker, walk = new CabinWalk(p), cabin = new CabinState(p);
  walk.leaveSeat(cabin, 0);
  const l = walk.layout!, s = l.stairs!, base = l.bounds.min.y;
  walk.person.reset(s.x, base, s.start - 0.3, 0);
  for (let i = 0; i < 115; i++) walk.update(1 / 60, { ...idle, forward: -1 }, [0, 0]);
  expect(walk.person.z).toBeGreaterThan(s.end);
  expect(walk.person.y).toBeCloseTo(base + s.rise, 1);
  expect(walk.floor).toBe(2);
  expect(walk.person.y + walk.person.height).toBeLessThanOrEqual(l.bounds.max.y);
  walk.person.releaseInput();
  for (let i = 0; i < 125; i++) walk.update(1 / 60, { ...idle, forward: 1 }, [0, 0]);
  expect(walk.person.z).toBeLessThan(s.start);
  expect(walk.person.y).toBeCloseTo(base, 1);
  expect(walk.floor).toBe(1);
});

it('blocks the room boundaries and camper furniture without allowing jump-through', () => {
  const p = vehicleProfiles.camper, walk = new CabinWalk(p);
  walk.leaveSeat(new CabinState(p), 0);
  const l = walk.layout!;
  for (let i = 0; i < 500; i++) walk.update(1 / 60, { ...idle, forward: -1, jump: i % 40 === 0 }, [0, 0]);
  const bed = l.furniture.find(f => f.kind === 'bed')!.bounds;
  expect(walk.person.z).toBeLessThanOrEqual(bed.min.z - walk.person.radius + 0.01);
});
