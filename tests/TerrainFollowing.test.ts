import { expect, it } from 'vitest';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { roadFrame } from '../src/road/RoadFrame';
import { roadProfile } from '../src/road/RoadProfile';
import { RoadSegment } from '../src/road/RoadSegment';

it('reuses centerline terrain probes while scoring different grades on the same curve', () => {
  const probes: [number, number][] = [];
  const road = new RoadGenerator('shared-probes', { sample: (x, z) => { probes.push([x, z]); return 400; } });
  const point = new RoadSegment(road.start, -Math.PI / 10, 0).sample(0.25).position;
  road.next(road.start);
  const count = probes.filter(([x, z]) => x === point.x && z === point.z).length;
  expect(count).toBeGreaterThan(0); expect(count).toBeLessThanOrEqual(2);
});

it.each([8, 12])('steers a %s m mountain road away from unsupported shoulders on a narrow shelf', roadWidth => {
  const terrain = { sample: (x: number, z: number) => 400 - Math.max(0, Math.min(1, (x - 132 + (128 - z) * 0.01) / 3)) * 80 };
  const options = { ...DEFAULT_OPTIONS, roadWidth, terrainFollow: 1, bridgeHeight: 20, maxGrade: 0,
    landmarkBridges: false, junctions: false, interchanges: false };
  const road = new RoadGenerator('ledge-road', terrain, options), segment = road.next(road.start);
  const half = roadProfile(options).outerHalfWidth;
  for (const t of [0.75, 1]) {
    const sample = segment.sample(t), { right } = roadFrame(sample);
    for (const side of [-1, 1]) {
      const x = sample.position.x + right.x * side * half, z = sample.position.z + right.z * side * half;
      expect(sample.position.y + right.y * side * half - terrain.sample(x, z)).toBeLessThan(5);
    }
  }
  expect(segment.end.heading).toBeLessThan(-0.05);
});

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
