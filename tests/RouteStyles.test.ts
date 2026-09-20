import { expect, it } from 'vitest';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSpine } from '../src/road/RoadSpine';
import { HeightFunction } from '../src/terrain/HeightFunction';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';

it('keeps natural terrain independent of road winding and preserves mixed-LOD seams', () => {
  const straight = new TerrainGenerator('terrain-independent', { ...DEFAULT_OPTIONS, routeStyle: 0 });
  const winding = new TerrainGenerator('terrain-independent', { ...DEFAULT_OPTIONS, routeStyle: 5 });
  const a = straight.generate(-1, 0, 64), b = winding.generate(-1, 0, 64), neighbor = winding.generate(0, 0, 8);
  expect(a.positions).toEqual(b.positions);
  const edge = (positions: Float32Array, x: number) => {
    const result = new Map<number, number>();
    for (let i = 0; i < positions.length; i += 3) if (positions[i] === x) result.set(positions[i + 2], positions[i + 1]);
    return result;
  };
  expect(edge(a.positions, 256)).toEqual(edge(neighbor.positions, 0));
});

it.each(([0, 1, 2, 3, 4, 5] as const).flatMap(routeStyle => (['mountain', 'highway'] as const).map(roadType => ({ routeStyle, roadType }))))(
  'streams 100 km of $routeStyle $roadType with bounded grades and continuous joins', options => {
  const seed = 'CLOUD-ROAD-001', config = { ...DEFAULT_OPTIONS, ...options };
  const terrain = new HeightFunction(seed, config.terrain, config.roadType), generator = new RoadGenerator(seed, terrain, config);
  let point = generator.start;
  while (point.distance < 100000) {
    const segment = generator.next(point);
    expect(segment.sample(0).position).toEqual(point.position);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const sample = segment.sample(t);
      expect(Object.values(sample.position).every(Number.isFinite)).toBe(true);
      expect(Math.abs(sample.grade)).toBeLessThanOrEqual(config.maxGrade + 0.000001);
      expect(Math.abs(sample.curvature)).toBeLessThanOrEqual(segment.kind === 'hairpin' ? 1 / 30 : 1 / 100);
      expect(sample.tangent.z).toBeLessThan(-0.25);
    }
    point = segment.end;
  }
}, 30000);

it.each([0, 1, 2, 3, 4, 5] as const)('resumes a visited %s route from bounded checkpoints and reproduces the same window', routeStyle => {
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
