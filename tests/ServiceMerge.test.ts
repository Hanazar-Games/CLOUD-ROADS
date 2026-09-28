import { expect, it } from 'vitest';
import { mergeWidth, serviceMerge } from '../src/service/ServiceMerge';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSegment } from '../src/road/RoadSegment';
import { DrivingSurface } from '../src/vehicle/DrivingSurface';
import { RoadSpine } from '../src/road/RoadSpine';
import { ServicePlanner } from '../src/service/ServicePlanner';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { hasRoadBarrier } from '../src/road/RoadProtection';

it('holds a full acceleration lane before smoothly tapering back to two lanes', () => {
  for (const side of [-1, 1]) {
    expect(mergeWidth(side * 300, 3.5)).toBe(3.5);
    expect(mergeWidth(side * 410, 3.5)).toBe(3.5);
    expect(mergeWidth(side * 650, 3.5)).toBe(0);
    let previous = 3.5;
    for (let d = 411; d <= 650; d++) {
      const width = mergeWidth(side * d, 3.5);
      expect(width).toBeLessThanOrEqual(previous); expect(previous - width).toBeLessThan(0.023); previous = width;
    }
  }
});

it.each([20, 200])('keeps long-vehicle ramp mouths clear above %s m terrain and guards the outer edge', height => {
  const options = { ...DEFAULT_OPTIONS, roadType: 'highway' as const }, terrain = { sample: () => height };
  const start = new RoadGenerator('merge-mouths', terrain, options).start;
  start.position = { x: 0, y: 200, z: 0 }; start.heading = 0;
  const segment = new RoadSegment(start, 0, 0, 22000), samples = Array.from({ length: 11001 }, (_, i) => segment.sample(i / 11000));
  const site = new ServicePlanner('merge-mouths', terrain, options).detect(samples)[0];
  const world = { seed: 'merge-mouths', options, services: [site], bridges: [], tunnels: [], road: new RoadSpine('merge-mouths', terrain, options), groundHeight: terrain.sample };
  const surface = new DrivingSurface(world); surface.level = 200;
  for (const kind of ['coach15', 'semi20'] as const) {
    const car = new VehiclePhysics(kind);
    for (const { a, b } of site.ground.access.filter(e => !e.a.merge)) {
      if (Math.abs(a.z - site.sample.position.z) < 120) continue;
      const heading = Math.atan2(b.x - a.x, a.z - b.z);
      car.reset(a.x, a.z, heading, surface.sample);
      expect(surface.constrain(car, car.x, car.z), `${kind} at ${a.x}, ${a.z}`).toBe(false);
    }
  }
  const merge = site.ground.access.find(e => e.a.merge && Math.abs(e.a.z - site.sample.position.z - 300) < 3)!;
  const p = { ...merge.a, x: merge.a.x - (merge.a.halfWidth! + 1) };
  expect(surface.constrainWalker(p, merge.a.x, merge.a.z)).toBe(true);
  expect(hasRoadBarrier(world, { ...site.sample, distance: site.sample.distance + 300 }, 1)).toBe(false);
});

it.each([1, 2] as const)('provides paved driving support throughout the added lane beside %s main lanes', lanes => {
  const options = { ...DEFAULT_OPTIONS, roadType: 'highway' as const, roadWidth: 12, roadLanes: lanes };
  const terrain = { sample: () => 50 }, start = new RoadGenerator('merge', terrain, options).start;
  start.position = { x: 0, y: 100, z: 0 }; start.heading = 0;
  const segment = new RoadSegment(start, 0, 0, 1500), samples = Array.from({ length: 751 }, (_, i) => segment.sample(i / 750));
  const merge = serviceMerge(samples, 750, options);
  const site = { id: 1, sample: segment.sample(0.5), start: 505, end: 995, ground: { pads: [], elevated: true, ...merge } };
  const surface = new DrivingSurface({ seed: 'merge', road: new RoadSpine('merge', terrain, options), options, services: [site], bridges: [], tunnels: [], groundHeight: terrain.sample });
  surface.level = 100;
  for (const { a, b } of merge.access) for (const side of [-0.8, 0, 0.8]) {
    const x = (a.x + b.x) / 2 + side * ((a.halfWidth! + b.halfWidth!) / 2), z = (a.z + b.z) / 2;
    expect(surface.sample(x, z).height).toBeCloseTo(100.015, 2);
  }
  expect(merge.access.some(e => e.a.x < 0)).toBe(true); expect(merge.access.some(e => e.a.x > 0)).toBe(true);
  expect(serviceMerge(samples, 750, { ...options, oneWay: true }).access.every(e => e.a.x > 0)).toBe(true);
});
