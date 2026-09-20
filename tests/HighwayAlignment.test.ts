import { expect, it } from 'vitest';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSpine } from '../src/road/RoadSpine';
import { HeightFunction } from '../src/terrain/HeightFunction';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';

it.each((['alpine', 'forest', 'desert', 'dunes'] as const).flatMap(terrain =>
  ([0, 1] as const).map(routeStyle => ({ terrain, routeStyle }))))(
  'keeps 100 km of $terrain $routeStyle highway straight, gently graded and smooth', options => {
    const config = { ...DEFAULT_OPTIONS, ...options, roadType: 'highway' as const, maxGrade: 0.03 };
    const generator = new RoadGenerator('CLOUD-ROAD-001', undefined, config);
    let point = generator.start, turns = 0, lastTurn = 0, distance = 0;
    while (point.distance < 100000) {
      const segment = generator.next(point), turn = segment.end.heading - point.heading;
      expect(segment.kind).toBe('cruise');
      expect(segment.sample(0).position).toEqual(point.position);
      for (let i = 0; i <= 16; i++) {
        const sample = segment.sample(i / 16);
        expect(Math.abs(sample.grade)).toBeLessThanOrEqual(0.030001);
        expect(Math.abs(sample.curvature)).toBeLessThanOrEqual(1 / 1200);
        expect(Math.abs(sample.heading)).toBeLessThanOrEqual(0.36);
      }
      expect(Math.abs(segment.end.grade - point.grade)).toBeLessThanOrEqual(0.00201);
      if (Math.abs(turn) > 0.002) {
        if (lastTurn * turn < 0) turns++;
        lastTurn = turn;
      }
      distance += segment.end.distance - point.distance;
      point = segment.end;
    }
    expect(distance / (128 - point.position.z)).toBeLessThan(1.06);
    expect(turns).toBeLessThan(90);
  }, 30000);

it('stretches highway valleys independently of winding levels while keeping their seeded height profile continuous', () => {
  for (const routeStyle of [0, 5] as const) {
    const terrain = new HeightFunction('highway-landscape', 'alpine', 'highway');
    expect(terrain.ranges.length).toBe(64000);
    for (let z = 128; z > -300000; z -= 311) {
      const guide = terrain.route(z)!;
      expect(Math.abs(guide.grade)).toBeLessThan(0.037);
      expect(Math.abs(guide.height - terrain.route(z + 0.01)!.height)).toBeLessThan(0.001);
    }
    const generator = new TerrainGenerator('highway-landscape', { ...DEFAULT_OPTIONS, roadType: 'highway', routeStyle });
    const data = generator.generate(0, -64, 64), neighbor = generator.generate(1, -64, 8);
    const edge = (positions: Float32Array, x: number) => {
      const samples = new Map<number, number>();
      for (let i = 0; i < positions.length; i += 3) if (positions[i] === x) samples.set(positions[i + 2], positions[i + 1]);
      return samples;
    };
    expect(edge(data.positions, 256)).toEqual(edge(neighbor.positions, 0));
    expect(data.positions[1]).toBe(Math.fround(terrain.sample(0, -64 * 256)));
  }
});

it('reuses cached windows when revisiting in either direction without losing deterministic coverage', () => {
  const road = new RoadSpine('CLOUD-ROAD-001', undefined, { ...DEFAULT_OPTIONS, roadType: 'highway' });
  const visit = (z: number) => {
    let frames = 0;
    while (!road.update(z, 8, 5952) && frames++ < 3000) { /* Stream a complete view. */ }
    expect(frames).toBeLessThan(3000);
    expect(road.segments[0].start.position.z).toBeGreaterThanOrEqual(z + 5952);
    expect(road.segments.at(-1)!.end.position.z).toBeLessThanOrEqual(z - 5952);
    return road.segments.map(segment => segment.end);
  };
  const first = visit(-40000), second = visit(-100000);
  let before = road.generated;
  expect(visit(-40000)).toEqual(first);
  expect(road.generated - before).toBeLessThan(160);
  before = road.generated;
  expect(visit(-100000)).toEqual(second);
  expect(road.generated - before).toBeLessThan(160);
  expect(road.checkpointCount).toBeLessThanOrEqual(64);
  visit(-300000);
  expect(road.checkpointCount).toBe(64);
  expect(visit(-40000)).toEqual(first);
  expect(road.checkpointCount).toBeLessThanOrEqual(64);
});
