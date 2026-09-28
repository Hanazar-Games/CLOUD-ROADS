import { expect, it } from 'vitest';
import { Garage, garageSlots } from '../src/garage/Garage';
import { serviceFacility } from '../src/service/ServiceArchitecture';
import { vehicleProfiles, type VehicleKind } from '../src/vehicle/VehicleConfig';
import { parkingSlots } from '../src/service/ServiceParking';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { cabinSeats } from '../src/vehicle/CabinState';
import { ServicePlanner } from '../src/service/ServicePlanner';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSegment } from '../src/road/RoadSegment';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { padPoint } from '../src/service/ServiceTerrain';
import { Scene } from 'three';
import { GarageMesh } from '../src/garage/GarageMesh';

const additions = ['coupe', 'rally', 'limousine', 'expedition6', 'schoolbus', 'shuttle', 'mixer', 'garbage', 'refrigerated', 'towtruck'] as const;

it('connects grounded service garages to their apron and declines excavation above valleys', () => {
  const seed = 'facility-connection', start = new RoadGenerator(seed, { sample: () => 200 }).start;
  start.position.y = 200;
  const road = new RoadSegment(start, 0, 0, 70000), samples = Array.from({ length: 35001 }, (_, i) => road.sample(i / 35000));
  const options = { ...DEFAULT_OPTIONS, roadType: 'highway' as const };
  const sites = new ServicePlanner(seed, { sample: () => 200 }, options).detect(samples);
  const site = sites.find(s => s.facility === 'garage')!;
  expect(site).toBeDefined(); expect(site.garages).toHaveLength(2);
  for (const garage of site.garages!) {
    const pad = site.ground.pads.find(p => garage.id.endsWith(`:${p.side}`))!;
    const p = padPoint(pad, pad.side * (pad.halfWidth - 1), 0);
    expect(garage.surface(p.x, p.z, p.y + 0.5)).toBeCloseTo(p.y);
    expect(garage.constrain({ ...p }, p.x, p.z, 1.4, p.y, 4.5)).toBe(false);
    const scene = new Scene(), mesh = new GarageMesh(scene, garage);
    expect(mesh.root.getObjectByName('garage-B3')).toBeDefined();
    expect(mesh.root.getObjectByName('garage-B4')).toBeUndefined();
    mesh.dispose(); expect(scene.children).toHaveLength(0);
  }
  const valleys = new ServicePlanner(seed, { sample: () => 20 }, options).detect(samples);
  expect(valleys.every(s => !s.garages?.length)).toBe(true);
});

it('varies service facilities deterministically across consecutive sites', () => {
  const facilities = [1, 2, 3, 4].map(id => serviceFacility('facilities', id));
  expect(new Set(facilities).size).toBe(4);
  expect(facilities).toContain('track'); expect(facilities).toContain('mall'); expect(facilities).toContain('garage');
  expect(facilities).toEqual([1, 2, 3, 4].map(id => serviceFacility('facilities', id)));
});

it('limits service garages to three levels with independent vehicle identities', () => {
  const a = new Garage('same-world', { x: 0, y: 100, z: 0 }, 3, 'service-a');
  const b = new Garage('same-world', { x: 400, y: 100, z: 0 }, 3, 'service-b');
  a.configure(100, 'random', true); b.configure(100, 'random', true);
  expect(a.entries).toHaveLength(garageSlots.length * 3);
  expect(a.spawn(5).y).toBe(82); expect(a.ground.excavation!.bottom).toBe(81);
  expect(a.floor(0, 69, 0)).toBeUndefined();
  expect(a.entries.some(e => b.entries.some(other => e.id === other.id))).toBe(false);
  for (let floor = 1; floor <= 3; floor++) {
    const p = a.spawn(floor);
    expect(a.surface(p.x, p.z, p.y + 0.5)).toBe(p.y);
    expect(a.ceiling(p.x, p.z, p.y) - p.y).toBeGreaterThan(5.4);
  }
});

it.each(additions)('integrates %s into fitting bays, seating and stable driving', name => {
  const kind = name as VehicleKind, p = vehicleProfiles[kind];
  expect(p).toBeDefined();
  expect(p.wheels.reduce((sum, wheel) => sum + wheel.along, 0)).toBeCloseTo(0, 8);
  expect(cabinSeats(p).filter(seat => seat.role === 'driver')).toHaveLength(1);
  const slots = parkingSlots().filter(slot => slot.kinds.includes(kind));
  expect(slots.length).toBeGreaterThan(0);
  for (const slot of slots) { expect(p.length + 0.5).toBeLessThan(slot.length); expect(p.width).toBeLessThan(slot.width); }
  const car = new VehiclePhysics(kind), surface = () => ({ height: 0, grip: 1 });
  car.reset(0, 0, 0, surface); car.ignition = 'running';
  for (let i = 0; i < 600; i++) car.update(1 / 60, { throttle: 1, steer: 0.12, handbrake: false }, surface);
  expect(car.speed).toBeGreaterThan(5); expect(car.heading).toBeGreaterThan(0.05);
  for (let i = 0; i < 600; i++) car.update(1 / 60, { throttle: 0, steer: 0, handbrake: true }, surface);
  expect(car.speed).toBe(0); expect(car.wheels.every(w => w.grounded)).toBe(true);
});
