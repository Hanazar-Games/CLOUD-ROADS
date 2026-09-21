import { expect, it } from 'vitest';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';

it.each(['mountain', 'highway'] as const)('keeps requested climbs on flat %s ground instead of manufacturing aerial climbs', roadType => {
  const generator = new RoadGenerator('grounded', { sample: () => 400 }, { ...DEFAULT_OPTIONS, roadType,
    routeStyle: 5, maxGrade: 0.4, elevationMode: 'cycles', climbMin: 300, climbMax: 900 });
  let point = generator.start;
  while (point.distance < 45000) {
    const segment = generator.next(point);
    for (const t of [0, 0.5, 1]) expect(Math.abs(segment.sample(t).position.y - 401)).toBeLessThan(0.1);
    point = segment.end;
  }
});

it.each(['natural', 'cycles'] as const)('follows actual rolling mountains in %s mode and descends when the terrain descends', elevationMode => {
  const terrain = { sample: (_x: number, z: number) => 400 + 90 * Math.sin((128 - z) / 1100) };
  const generator = new RoadGenerator('rolling', terrain, { ...DEFAULT_OPTIONS, routeStyle: 5,
    maxGrade: 0.2, elevationMode, climbMin: 300, climbMax: 700, junctions: false, interchanges: false });
  let point = generator.start, above = 0, count = 0, ascent = false, descent = false;
  while (point.distance < 30000) {
    const segment = generator.next(point);
    const sample = segment.sample(0.5);
    above += Math.abs(sample.position.y - terrain.sample(sample.position.x, sample.position.z) - 1); count++;
    ascent ||= sample.grade > 0.005; descent ||= sample.grade < -0.005;
    expect(Math.abs(sample.grade)).toBeLessThanOrEqual(0.2);
    point = segment.end;
  }
  expect(ascent && descent).toBe(true);
  expect(above / count).toBeLessThan(6);
});
