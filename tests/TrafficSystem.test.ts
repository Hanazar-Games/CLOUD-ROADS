import { expect, it } from 'vitest';
import { TrafficSystem, MAX_TRAFFIC, type TrafficEntry } from '../src/traffic/TrafficSystem';
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

it('applies traffic tuning bounds and disables new lane changes without disabling obstacle braking', () => {
  const { traffic, network, anchor, options } = setup(); traffic.density = 1;
  traffic.configure({ headway: NaN, gap: 99, laneChanges: 0, acceleration: -1 });
  expect(traffic.tuning.headway).toBe(1.8); expect(traffic.tuning.gap).toBe(12); expect(traffic.tuning.acceleration).toBe(0.5);
  const lane = roadProfile(options).lanes.at(-1)!, car = new VehiclePhysics('sedan');
  car.reset(128 + lane.offset, -22, 0, () => ({ height: 1, grip: 1 })); car.speed = 8;
  const entry: TrafficEntry = { id: 'tuned', car, routeId: 'root', distance: 150, direction: 1, cruise: 18,
    lane: lane.index, offset: lane.offset, signal: 0, cooldown: 0 };
  traffic.entries.push(entry);
  const truck = new VehiclePhysics('truck8'); truck.reset(car.x, car.z - 35, 0, () => ({ height: 1, grip: 1 }));
  for (let i = 0; i < 80; i++) traffic.update(0.1, network.routes, anchor, [truck]);
  expect(entry.change).toBeUndefined(); expect(entry.offset).toBe(lane.offset); expect(car.speed).toBeLessThan(0.2);
  expect(Math.abs(truck.z - car.z) - (truck.profile.length + car.profile.length) / 2).toBeGreaterThan(11);
});

it('uses acceleration and cruise settings on existing traffic', () => {
  const simulate = (acceleration: number, speed: number) => {
    const { traffic, network, anchor, options } = setup(); traffic.density = 1;
    const lane = roadProfile(options).lanes.at(-1)!, car = new VehiclePhysics('sedan');
    car.reset(128 + lane.offset, -22, 0, () => ({ height: 1, grip: 1 }));
    traffic.entries.push({ id: 'tuned', car, routeId: 'root', distance: 150, direction: 1, cruise: 18,
      lane: lane.index, offset: lane.offset, signal: 0, cooldown: 100 });
    traffic.configure({ acceleration, minSpeed: speed, maxSpeed: speed });
    for (let i = 0; i < 40; i++) traffic.update(0.1, network.routes, anchor);
    return car.speed;
  };
  expect(simulate(3, 100)).toBeGreaterThan(simulate(0.5, 100) + 5);
  expect(simulate(3, 10)).toBeCloseTo(10 / 3.6);
});

it('keeps stable individual cruise speeds and normalizes the 10–200 km/h range', () => {
  const { traffic, network, anchor } = setup(); traffic.density = 100;
  traffic.configure({ minSpeed: 10, maxSpeed: 200 });
  for (let i = 0; i < 100; i++) traffic.update(0.1, network.routes, anchor);
  const speeds = traffic.entries.map(e => e.cruise * 3.6);
  expect(speeds.length).toBeGreaterThan(5);
  expect(Math.max(...speeds) - Math.min(...speeds)).toBeGreaterThan(50);
  expect(speeds.every(s => s >= 10 && s <= 200)).toBe(true);
  traffic.configure({ headway: 2 });
  expect(traffic.entries.map(e => e.cruise * 3.6)).toEqual(speeds);
  traffic.configure({ minSpeed: 200 }); expect(traffic.tuning.maxSpeed).toBe(200);
  traffic.configure({ maxSpeed: 10 }); expect(traffic.tuning.minSpeed).toBe(10);
  expect(traffic.entries.every(e => Math.abs(e.cruise * 3.6 - 10) < 1e-8)).toBe(true);
  traffic.configure({ minSpeed: -100, maxSpeed: 500 });
  expect(traffic.tuning.minSpeed).toBe(10); expect(traffic.tuning.maxSpeed).toBe(200);
});

it('maintains 200 km/h on a clear straight and advances the engine without resetting gears', () => {
  const { traffic, network, options } = setup({ oneWay: true }); traffic.density = 1;
  const lane = roadProfile(options).lanes.at(-1)!, car = new VehiclePhysics('supercar');
  car.reset(128 + lane.offset, -22, 0, () => ({ height: 1, grip: 1 })); car.speed = 200 / 3.6;
  traffic.entries.push({ id: 'fast', car, routeId: 'root', distance: 150, direction: 1, cruise: car.speed,
    lane: lane.index, offset: lane.offset, signal: 0, cooldown: 100 });
  traffic.configure({ minSpeed: 200, maxSpeed: 200 });
  for (let i = 0; i < 60; i++) traffic.update(0.1, network.routes, car);
  expect(car.speed * 3.6).toBeCloseTo(200, 1);
  expect(car.transmission.gear).toBeGreaterThan(3);
  expect(car.transmission.rpm).toBeGreaterThan(car.transmission.idle);
  expect(car.transmission.rpm).toBeLessThan(car.transmission.redline);
});

it('does not pull into the path of a 200 km/h vehicle beyond 180 m behind', () => {
  const { traffic, network, anchor, options } = setup(); traffic.density = 1;
  const lanes = roadProfile(options).lanes, lane = lanes.at(-1)!, car = new VehiclePhysics('sedan');
  car.reset(128 + lane.offset, -472, 0, () => ({ height: 1, grip: 1 })); car.speed = 10;
  const entry: TrafficEntry = { id: 'pass', car, routeId: 'root', distance: 600, direction: 1, cruise: 25,
    lane: lane.index, offset: lane.offset, signal: 0, cooldown: 0 };
  traffic.entries.push(entry);
  const slow = new VehiclePhysics('truck8'), fast = new VehiclePhysics('supercar');
  slow.reset(car.x, car.z - 40, 0, () => ({ height: 1, grip: 1 })); slow.speed = 5;
  fast.reset(128 + lanes.at(-2)!.offset, car.z + 220, 0, () => ({ height: 1, grip: 1 })); fast.speed = 200 / 3.6;
  traffic.update(0.1, network.routes, anchor, [slow, fast]); expect(entry.change).toBeUndefined();
});

it.each([1, 15])('anticipates a slower leader and safely changes lanes at %s m/s', speed => {
  const { traffic, network, anchor, options } = setup(); traffic.density = 1;
  const lane = roadProfile(options).lanes.at(-1)!, car = new VehiclePhysics('sedan');
  car.reset(128 + lane.offset, -22, 0, () => ({ height: 1, grip: 1 })); car.speed = speed;
  traffic.entries.push({ id: 'anticipate', car, routeId: 'root', distance: 150, direction: 1, cruise: 18,
    lane: lane.index, offset: lane.offset, signal: 0, cooldown: 0 });
  const truck = new VehiclePhysics('truck8');
  truck.reset(car.x, car.z - (speed < 2 ? 22 : 78), 0, () => ({ height: 1, grip: 1 })); truck.speed = speed < 2 ? 0 : 4;
  traffic.update(0.1, network.routes, anchor, [truck]);
  expect(traffic.entries[0].change?.lane).toBe(lane.index - 1);
  expect(traffic.entries[0].signal).toBe(-1);
  expect(car.x).toBeCloseTo(128 + lane.offset, 5);
});

it('honks intermittently behind a blocked lane, freezes on pause and cleans up when traffic leaves', () => {
  const { traffic, network, anchor, options } = setup({ roadLanes: 1 }); traffic.density = 1;
  const lane = roadProfile(options).lanes.at(-1)!, car = new VehiclePhysics('sedan');
  car.reset(128 + lane.offset, -22, 0, () => ({ height: 1, grip: 1 }));
  traffic.entries.push({ id: 'impatient', car, routeId: 'root', distance: 150, direction: 1, cruise: 15,
    lane: lane.index, offset: lane.offset, signal: 0, cooldown: 0 });
  const truck = new VehiclePhysics('truck8'); truck.reset(car.x, car.z - 12, 0, () => ({ height: 1, grip: 1 }));
  const right = { x: 1, y: 0, z: 0 }, listener = { x: car.x - 10, y: car.y, z: car.z };
  const bursts: number[] = []; let playing = false;
  for (let i = 0; i < 240; i++) {
    traffic.update(0.1, network.routes, anchor, [truck]);
    const sources = traffic.horns(listener, right);
    if (sources.length) {
      if (!playing) bursts.push(i / 10);
      expect(sources[0].kind).toBe('sedan'); expect(sources[0].pan).toBeGreaterThan(0);
      expect(sources[0].volume).toBeGreaterThan(0); expect(sources[0].volume).toBeLessThanOrEqual(1);
      const before = traffic.horns(listener, right);
      traffic.update(0, network.routes, anchor, [truck]); expect(traffic.horns(listener, right)).toEqual(before);
      expect(traffic.horns({ ...listener, x: car.x + 500 }, right)).toEqual([]);
    }
    playing = sources.length > 0;
  }
  expect(bursts.length).toBeGreaterThan(1); expect(bursts.length).toBeLessThan(10);
  for (let i = 0; i < 60; i++) traffic.update(0.1, network.routes, anchor);
  expect(traffic.horns(listener, right)).toEqual([]); expect(car.speed).toBeGreaterThan(2);
  traffic.clear(); expect(traffic.horns(listener, right)).toEqual([]);
});

it.each(['tunnel', 'pedestrian', 'stopped'])('keeps lane-change safeguards around %s', obstruction => {
  const { traffic, network, anchor, options } = setup(); traffic.density = 1;
  const lane = roadProfile(options).lanes.at(-1)!, car = new VehiclePhysics('sedan');
  car.reset(128 + lane.offset, -22, 0, () => ({ height: 1, grip: 1 })); car.speed = obstruction === 'stopped' ? 0 : 8;
  const entry: TrafficEntry = { id: 'safe-change', car, routeId: 'root', distance: 150, direction: 1, cruise: 18,
    lane: lane.index, offset: lane.offset, signal: 0, cooldown: 0 };
  traffic.entries.push(entry);
  const truck = new VehiclePhysics('truck8');
  truck.reset(car.x, car.z - (obstruction === 'stopped' ? 9.3 : 35), 0, () => ({ height: 1, grip: 1 }));
  if (obstruction === 'tunnel') {
    const route = network.routes.find(r => r.id === 'root')!, sample = route.road.nearest(car.x, car.z)!;
    route.tunnels.push({ start: { ...sample, distance: 100 }, end: { ...sample, distance: 300 }, samples: [] });
  }
  if (obstruction === 'stopped') entry.change = { lane: lane.index - 1, from: lane.offset, elapsed: 0.8 };
  const person = obstruction === 'pedestrian' ? { x: car.x - 3, y: car.y, z: car.z - 10 } : undefined;
  for (let i = 0; i < 80; i++) {
    traffic.update(0.1, network.routes, anchor, [truck], person);
    expect(entry.offset).toBe(lane.offset);
    if (person) expect(traffic.horns(car, { x: 1, y: 0, z: 0 })).toEqual([]);
  }
  if (obstruction === 'stopped') expect(car.speed).toBe(0);
  else expect(entry.change).toBeUndefined();
});

it('preserves lane-change progress when an adjacent vehicle blocks the swept body', () => {
  const { traffic, network, anchor, options } = setup(); traffic.density = 1;
  const lanes = roadProfile(options).lanes, lane = lanes.at(-1)!, adjacent = lanes.at(-2)!;
  const offset = (lane.offset + adjacent.offset) / 2, car = new VehiclePhysics('sedan');
  car.reset(128 + offset, -22, 0, () => ({ height: 1, grip: 1 })); car.speed = 1;
  const entry: TrafficEntry = { id: 'interrupted', car, routeId: 'root', distance: 150, direction: 1, cruise: 18,
    lane: lane.index, offset, signal: -1, cooldown: 0, change: { lane: adjacent.index, from: lane.offset, elapsed: 2.8 } };
  traffic.entries.push(entry);
  const neighbor = new VehiclePhysics('truck8');
  neighbor.reset(128 + adjacent.offset, car.z, 0, () => ({ height: 1, grip: 1 }));
  for (let i = 0; i < 20; i++) {
    traffic.update(0.1, network.routes, anchor, [neighbor]);
    expect(entry.offset).toBeCloseTo(offset, 8);
    expect(entry.change?.elapsed).toBeCloseTo(2.8, 8);
    expect(car.speed).toBe(0);
  }
});

it('holds lateral movement when a fast rear vehicle enters the destination lane during a change', () => {
  const { traffic, network, anchor, options } = setup(); traffic.density = 1;
  const lanes = roadProfile(options).lanes, lane = lanes.at(-1)!, adjacent = lanes.at(-2)!;
  const offset = lane.offset + (adjacent.offset - lane.offset) * 0.05 ** 2 * (3 - 2 * 0.05);
  const car = new VehiclePhysics('sedan'); car.reset(128 + offset, -22, 0, () => ({ height: 1, grip: 1 })); car.speed = 8;
  const entry: TrafficEntry = { id: 'late-arrival', car, routeId: 'root', distance: 150, direction: 1, cruise: 18,
    lane: lane.index, offset, signal: -1, cooldown: 0, change: { lane: adjacent.index, from: lane.offset, elapsed: 1 } };
  traffic.entries.push(entry);
  const neighbor = new VehiclePhysics('sedan'); neighbor.reset(128 + adjacent.offset, car.z + 30, 0, () => ({ height: 1, grip: 1 })); neighbor.speed = 30;
  traffic.update(0.1, network.routes, anchor, [neighbor]);
  expect(entry.offset).toBeCloseTo(offset, 8); expect(entry.distance).toBeGreaterThan(150); expect(entry.signal).toBe(-1);
  traffic.update(0.1, network.routes, anchor);
  expect(entry.offset).toBeLessThan(offset);
});

it('forms a selectable queue, preserves safe spacing and releases it when normal traffic resumes', () => {
  const { traffic, network, anchor } = setup({ oneWay: true });
  traffic.density = 100; traffic.scenario = 'queue';
  for (let i = 0; i < 900; i++) traffic.update(0.1, network.routes, anchor);
  const stopped = traffic.entries.filter(e => e.car.speed < 0.1);
  expect(stopped.length).toBeGreaterThan(2);
  for (const a of stopped) for (const b of stopped) if (a !== b && a.routeId === b.routeId
    && Math.abs(a.offset - b.offset) < (a.car.profile.width + b.car.profile.width) / 2)
    expect(Math.abs(a.distance - b.distance)).toBeGreaterThan((a.car.profile.length + b.car.profile.length) / 2);
  traffic.scenario = 'normal';
  for (let i = 0; i < 120; i++) traffic.update(0.1, network.routes, anchor);
  expect(stopped.some(e => e.car.speed > 2)).toBe(true);
  traffic.density = 0; traffic.update(0, network.routes, anchor); expect(traffic.entries).toHaveLength(0);
}, 20000);

it('keeps the default budget and exposes a larger configurable cap that trims immediately', () => {
  const { traffic, network, anchor } = setup({ roadLanes: 3, roadWidth: 12 });
  expect(traffic.limit).toBe(24);
  traffic.limit = 120; traffic.density = 100;
  expect(traffic.targetCount).toBe(120);
  for (let i = 0; i < 360; i++) traffic.update(0.1, network.routes, anchor);
  expect(traffic.entries.length).toBeGreaterThan(24);
  expect(traffic.entries.length).toBeLessThanOrEqual(120);
  traffic.limit = 12; traffic.update(0, network.routes, anchor);
  expect(traffic.entries.length).toBeLessThanOrEqual(12);
  traffic.limit = NaN; expect(traffic.limit).toBe(12);
  traffic.limit = 1000; expect(traffic.limit).toBe(120);
}, 15000);

it('pauses a stop-go queue and releases cars during its moving phase', () => {
  const { traffic, network, anchor, options } = setup(); traffic.density = 1; traffic.scenario = 'stopgo';
  const lane = roadProfile(options).lanes.at(-1)!, car = new VehiclePhysics('sedan');
  car.reset(128 + lane.offset, 128 - 330, 0, () => ({ height: 1, grip: 1 })); car.speed = 4;
  traffic.entries.push({ id: 'queue', car, routeId: 'root', distance: 330, direction: 1, cruise: 15, lane: lane.index, offset: lane.offset, signal: 0, cooldown: 0 });
  let honked = false;
  for (let i = 0; i < 120; i++) {
    traffic.update(0.1, network.routes, anchor);
    honked ||= traffic.horns(car, { x: 1, y: 0, z: 0 }).length > 0;
  }
  expect(car.speed).toBeLessThan(0.1);
  expect(honked).toBe(true);
  const before = [traffic.time, car.x, car.z];
  for (let i = 0; i < 30; i++) traffic.update(0, network.routes, anchor);
  expect([traffic.time, car.x, car.z]).toEqual(before);
  for (let i = 0; i < 140; i++) traffic.update(0.1, network.routes, anchor);
  expect(car.speed).toBeGreaterThan(2); expect(car.speed).toBeLessThanOrEqual(7);
  expect(traffic.horns(car, { x: 1, y: 0, z: 0 })).toEqual([]);
});

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
  const stopped = entry.distance;
  for (let i = 0; i < 30; i++) traffic.update(0.1, network.routes, anchor, [], person);
  expect(entry.distance).toBe(stopped);
  for (let i = 0; i < 20; i++) traffic.update(0.1, network.routes, anchor);
  expect(car.speed).toBeGreaterThan(1);
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

it.each(['clear', 'beside', 'fast-rear'])('passes safely and returns right without cutting off adjacent traffic (%s)', obstacle => {
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
  const signals: number[] = [], steering: number[] = []; let passed = false;
  for (let i = 0; i < 160; i++) {
    const oldX = car.x;
    if (blocked) {
      neighbor.reset(128 + lanes.at(-2)!.offset, car.z + (obstacle === 'fast-rear' ? 30 : 0), 0, () => ({ height: 1, grip: 1 }));
      neighbor.speed = obstacle === 'fast-rear' ? 30 : car.speed;
    }
    traffic.update(0.1, network.routes, anchor, blocked ? [truck, neighbor] : [truck]);
    signals.push(entry.signal);
    steering.push(car.steering);
    if (entry.lane === lane.index - 1) passed = true;
    if (passed && entry.lane === lane.index) expect(entry.distance).toBeGreaterThan(225);
    expect(Math.abs(car.x - oldX)).toBeLessThan(0.3);
    expect(car.x).toBeGreaterThan(128 + 2);
  }
  if (blocked) { expect(entry.lane).toBe(lane.index); expect(car.speed).toBeLessThan(0.1); }
  else {
    expect(signals).toContain(-1);
    expect(signals).toContain(1); expect(passed).toBe(true);
    expect(entry.distance).toBeGreaterThan(225);
    expect(entry.lane).toBe(lane.index);
    expect(Math.min(...steering)).toBeLessThan(-0.005); expect(Math.max(...steering)).toBeGreaterThan(0.005);
  }
});
