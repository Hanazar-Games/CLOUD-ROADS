import { expect, it } from 'vitest';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSpine } from '../src/road/RoadSpine';
import { HeightFunction } from '../src/terrain/HeightFunction';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';

it('creates deliberate winding traverses even on a gently rolling landscape', () => {
  const terrain = { sample: () => 400 };
  const counts = ['natural', 'winding'].map(routeStyle => {
    const generator = new RoadGenerator('route-style', terrain, { ...DEFAULT_OPTIONS, routeStyle: routeStyle as 'natural' | 'winding' });
    let point = generator.start, turns = 0;
    while (point.distance < 18000) {
      const segment = generator.next(point);
      if (segment.kind === 'hairpin') turns++;
      point = segment.end;
    }
    return turns;
  });
  expect(counts[0]).toBe(0); expect(counts[1]).toBeGreaterThanOrEqual(8);
});

it('forms a continuous canyon with a road ledge, an open drop and an uphill wall', () => {
  const terrain = new HeightFunction('cliff-route', 'desert', 'cliff');
  const copy = new HeightFunction('cliff-route', 'desert', 'cliff');
  for (let z = 128; z > -100000; z -= 211) {
    const guide = terrain.route(z)!;
    expect(guide).toBeDefined();
    const shelf = terrain.sample(guide.x, z);
    expect(shelf - terrain.sample(guide.x - 180, z)).toBeGreaterThan(180);
    expect(terrain.sample(guide.x + 180, z) - shelf).toBeGreaterThan(150);
    expect(shelf).toBe(copy.sample(guide.x, z));
    expect(Math.abs(shelf - terrain.sample(guide.x, z + 0.01))).toBeLessThan(0.1);
  }
  const generator = new TerrainGenerator('cliff-route', { ...DEFAULT_OPTIONS, terrain: 'desert', routeStyle: 'cliff' });
  const edge = (data: ReturnType<typeof generator.generate>, x: number) => {
    const result = new Map<number, number>();
    for (let i = 0; i < data.positions.length; i += 3) if (data.positions[i] === x) result.set(data.positions[i + 2], data.positions[i + 1]);
    return result;
  };
  expect(edge(generator.generate(-1, 0, 64), 256)).toEqual(edge(generator.generate(0, 0, 8), 0));
});

it.each((['winding', 'cliff'] as const).flatMap(routeStyle => (['mountain', 'highway'] as const).map(roadType => ({ routeStyle, roadType }))))(
  'streams 100 km of $routeStyle $roadType with safe grades, continuous joins and cliff exposure', options => {
  const seed = 'CLOUD-ROAD-001', config = { ...DEFAULT_OPTIONS, ...options };
  const terrain = new HeightFunction(seed, config.terrain, config.routeStyle), generator = new RoadGenerator(seed, terrain, config);
  let point = generator.start, exposed = 0, total = 0;
  while (point.distance < 100000) {
    const segment = generator.next(point);
    expect(segment.sample(0).position).toEqual(point.position);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const sample = segment.sample(t);
      expect(Object.values(sample.position).every(Number.isFinite)).toBe(true);
      expect(Math.abs(sample.grade)).toBeLessThanOrEqual(options.roadType === 'highway' ? 0.040001 : 0.060001);
      expect(Math.abs(sample.curvature)).toBeLessThanOrEqual(segment.kind === 'hairpin' ? 1 / 30 : 1 / 100);
      expect(sample.tangent.z).toBeLessThan(-0.25);
    }
    if (options.routeStyle === 'cliff') {
      const sample = segment.sample(0.5), { x, y, z } = sample.position;
      if (y - terrain.sample(x - 180, z) > 140 && terrain.sample(x + 180, z) - y > 130) exposed++;
      total++;
    }
    point = segment.end;
  }
  if (total) expect(exposed / total).toBeGreaterThan(0.8);
}, 30000);

it.each(['natural', 'winding', 'cliff'] as const)('resumes a visited %s route from bounded checkpoints and reproduces the same window', routeStyle => {
  const spine = new RoadSpine('CLOUD-ROAD-001', undefined, { ...DEFAULT_OPTIONS, routeStyle });
  while (!spine.update(-40000, 8, 5952)) { /* Generate a window covering the longest view distance. */ }
  expect(spine.segments[0].start.position.z).toBeGreaterThanOrEqual(-40000 + 5952);
  const original = spine.segments.map(segment => segment.end);
  while (!spine.update(-100000, 8, 5952)) { /* Move beyond the retained road. */ }
  expect(spine.segments[0].start.position.z).toBeGreaterThanOrEqual(-100000 + 5952);
  const before = spine.generated;
  while (!spine.update(-40000, 8, 5952)) { /* Resume from a preceding checkpoint. */ }
  expect(spine.segments.map(segment => segment.end)).toEqual(original);
  expect(spine.generated - before).toBeLessThan(300);
  expect(spine.checkpointCount).toBeLessThanOrEqual(64);
  const scout = spine.fork(), end = spine.segments.at(-1)!.end;
  while (!scout.advanceToDistance(end.distance)) { /* Reuse checkpoints for scenery searches. */ }
  expect(scout.segments.at(-1)!.end).toEqual(end);
  expect(scout.generated).toBeLessThan(100);
});
