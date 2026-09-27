import { expect, it } from 'vitest';
import { TrafficSystem, MAX_TRAFFIC } from '../src/traffic/TrafficSystem';
import { RoadNetwork } from '../src/road/RoadNetwork';
import { RoadSpine } from '../src/road/RoadSpine';
import { DEFAULT_OPTIONS, type WorldOptions } from '../src/world/WorldOptions';
import { roadProfile } from '../src/road/RoadProfile';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';

function setup(patch: Partial<WorldOptions> = {}) {
  const options = { ...DEFAULT_OPTIONS, roadType: 'highway' as const, routeStyle: 0 as const, maxGrade: 0, ...patch };
  const terrain = { sample: () => 0 }, road = new RoadSpine('traffic', terrain, options);
  const network = new RoadNetwork('traffic', terrain, options, road);
  while (!network.update(128, 128, undefined, 4000)) { /* finish initial road */ }
  const anchor = { x: 128, y: 1, z: 128 }, traffic = new TrafficSystem('traffic', options);
  return { traffic, network, anchor, options };
}

it('seeds bounded traffic with diverse vehicles, paints and opposite directions', () => {
  const { traffic, network, anchor } = setup(); traffic.density = 100;
  for (let i = 0; i < 300; i++) traffic.update(0.1, network.routes, anchor);
  expect(traffic.entries.length).toBeGreaterThan(8); expect(traffic.entries.length).toBeLessThanOrEqual(MAX_TRAFFIC);
  expect(new Set(traffic.entries.map(e => e.car.kind)).size).toBeGreaterThan(4);
  expect(new Set(traffic.entries.map(e => e.car.paint)).size).toBeGreaterThan(3);
  expect(new Set(traffic.entries.map(e => e.direction)).size).toBe(2);
  expect(traffic.entries.every(e => Number.isFinite(e.car.y) && e.car.speed >= 0)).toBe(true);
  const before = traffic.entries.map(e => e.distance); traffic.update(0, network.routes, anchor);
  expect(traffic.entries.map(e => e.distance)).toEqual(before);
  traffic.density = 0; traffic.update(0, network.routes, anchor); expect(traffic.entries).toHaveLength(0);
});

it('keeps runtime state bounded when routes unload and refuses to take moving cars', () => {
  const { traffic, network, anchor } = setup();
  for (let i = 0; i < 100; i++) traffic.update(0.1, network.routes, anchor);
  const entry = traffic.entries.find(e => e.car.speed > 1)!;
  expect(entry).toBeDefined(); expect(traffic.take(entry.id)).toBeUndefined();
  entry.car.park(); expect(traffic.take(entry.id) === entry.car).toBe(true);
  traffic.update(0.1, [], anchor); expect(traffic.entries).toHaveLength(0);
});

it('stops for a pedestrian and allows boarding after yielding without driving through them', () => {
  const { traffic, network, anchor } = setup(); traffic.density = 5;
  for (let i = 0; i < 50; i++) traffic.update(0.1, network.routes, anchor);
  const entry = traffic.entries[0], car = entry.car;
  const person = { x: car.x + Math.sin(car.heading) * 18, y: car.y, z: car.z - Math.cos(car.heading) * 18 };
  for (let i = 0; i < 100; i++) traffic.update(0.1, network.routes, anchor, [], person);
  expect(Math.hypot(car.x - person.x, car.z - person.z)).toBeGreaterThan(car.profile.chassisLength / 2);
  expect(car.speed).toBe(0);
});

it('stops before a solid parked car and resumes once the lane is clear', () => {
  const { traffic, network, anchor } = setup({ roadLanes: 1 }); traffic.density = 5;
  for (let i = 0; i < 50; i++) traffic.update(0.1, network.routes, anchor);
  const entry = traffic.entries[0], car = entry.car, parked = new VehiclePhysics('truck8');
  parked.reset(car.x + Math.sin(car.heading) * 25, car.z - Math.cos(car.heading) * 25, car.heading,
    () => ({ height: 0, grip: 1 }));
  for (let i = 0; i < 140; i++) traffic.update(0.1, network.routes, anchor, [parked]);
  expect(car.speed).toBeLessThan(0.1);
  expect(Math.hypot(car.x - parked.x, car.z - parked.z)).toBeGreaterThan((car.profile.chassisLength + parked.profile.length) / 2);
  for (let i = 0; i < 30; i++) traffic.update(0.1, network.routes, anchor);
  expect(car.speed).toBeGreaterThan(1);
});

it('continues through the origin onto the reverse route without teleporting or accumulating at the seam', () => {
  const { traffic, network, anchor, options } = setup(); traffic.density = 5;
  const car = new VehiclePhysics('sedan');
  traffic.entries.push({ id: 'seam', car, routeId: 'root', distance: 12, direction: -1, cruise: 10,
    lane: 0, offset: roadProfile(options).lanes[0].offset, signal: 0, cooldown: 0 });
  traffic.update(0.01, network.routes, anchor);
  for (let i = 0; i < 170; i++) {
    const x = car.x, z = car.z;
    traffic.update(0.1, network.routes, anchor);
    expect(Math.hypot(car.x - x, car.z - z)).toBeLessThan(1.1);
  }
  const entry = traffic.entries.find(e => e.id === 'seam')!;
  expect(entry.distance).toBeLessThan(-40);
  const back = network.routes.find(r => r.id === 'back')!;
  expect(back.road.nearest(car.x, car.z)!.distance).toBeCloseTo(-entry.distance, 0);
});

it('keeps one-way NPCs aligned through both sides of the origin', () => {
  const { traffic, network, anchor } = setup({ oneWay: true, roadLanes: 1, roadWidth: 5 }); traffic.density = 100;
  for (let i = 0; i < 200; i++) traffic.update(0.1, network.routes, anchor);
  expect(traffic.entries.length).toBeGreaterThan(5);
  expect(new Set(traffic.entries.map(e => e.routeId)).size).toBe(2);
  for (const entry of traffic.entries) {
    expect(Math.cos(entry.car.heading)).toBeGreaterThan(0.99);
    expect(entry.car.x).toBeCloseTo(128, 3);
    expect(entry.signal).toBe(0);
  }
});

it.each(['clear', 'beside', 'fast-rear'])('signals and passes a stopped vehicle only with a safe adjacent lane (%s)', obstacle => {
  const blocked = obstacle !== 'clear';
  const { traffic, network, anchor, options } = setup(); traffic.density = 1;
  const lanes = roadProfile(options).lanes, car = new VehiclePhysics('sedan'), lane = lanes.at(-1)!;
  car.reset(128 + lane.offset, -22, 0, () => ({ height: 1, grip: 1 })); car.speed = 12;
  const entry = { id: 'pass', car, routeId: 'root', distance: 150, direction: 1, cruise: 15,
    lane: lane.index, offset: lane.offset, signal: 0, cooldown: 0 };
  traffic.entries.push(entry);
  const truck = new VehiclePhysics('truck8');
  truck.reset(car.x, car.z - 60, 0, () => ({ height: 1, grip: 1 }));
  const neighbor = new VehiclePhysics('semi20');
  neighbor.reset(128 + lanes.at(-2)!.offset, car.z - 12, 0, () => ({ height: 1, grip: 1 }));
  const signals: number[] = [];
  for (let i = 0; i < 160; i++) {
    const oldX = car.x;
    if (blocked) {
      neighbor.reset(128 + lanes.at(-2)!.offset, car.z + (obstacle === 'fast-rear' ? 30 : 0), 0, () => ({ height: 1, grip: 1 }));
      neighbor.speed = obstacle === 'fast-rear' ? 30 : car.speed;
    }
    traffic.update(0.1, network.routes, anchor, blocked ? [truck, neighbor] : [truck]);
    signals.push(entry.signal);
    expect(Math.abs(car.x - oldX)).toBeLessThan(0.3);
    expect(car.x).toBeGreaterThan(128 + 2);
  }
  if (blocked) { expect(entry.lane).toBe(lane.index); expect(car.speed).toBeLessThan(0.1); }
  else {
    expect(signals).toContain(-1);
    expect(entry.distance).toBeGreaterThan(225);
    expect(entry.lane).toBe(lane.index - 1);
  }
});
