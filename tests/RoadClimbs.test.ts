import { expect, it } from 'vitest';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSpine } from '../src/road/RoadSpine';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';

it.each([50, 300, 2000])('treats a %s m climb as a route preference while staying on rolling terrain', gain => {
  const terrain = { sample: (x: number, z: number) => 400 + Math.sin((128 - z) / 1200) * 200 + Math.sin(x / 1800) * 50 };
  const generator = new RoadGenerator('climb-limits', terrain, { ...DEFAULT_OPTIONS, routeStyle: 5,
    maxGrade: 0.4, elevationMode: 'cycles', climbMin: gain, climbMax: gain, junctions: false, interchanges: false });
  let point = generator.start, ascent = 0, descent = 0, hairpins = 0;
  while (point.distance < 45000) {
    const segment = generator.next(point);
    if (segment.kind === 'hairpin') hairpins++;
    if (segment.end.grade > 0.01) ascent++;
    if (segment.end.grade < -0.01) descent++;
    for (const t of [0, 0.5, 1]) {
      const sample = segment.sample(t);
      expect(Math.abs(sample.grade)).toBeLessThanOrEqual(0.4 + 1e-10);
      expect(sample.position.y).toBeGreaterThan(140);
      expect(sample.position.y).toBeLessThan(680);
    }
    expect(Math.abs(segment.end.climb!.target - segment.end.climb!.base)).toBeCloseTo(gain);
    point = segment.end;
  }
  expect(ascent).toBeGreaterThan(30); expect(descent).toBeGreaterThan(30); expect(hairpins).toBeGreaterThan(100);
});

it('uses the climb target to choose the uphill side without overriding terrain elevation', () => {
  const terrain = { sample: (x: number) => 400 + (x - 128) * 0.1 };
  const generator = new RoadGenerator('contour', terrain, { ...DEFAULT_OPTIONS, routeStyle: 5,
    maxGrade: 0.4, elevationMode: 'cycles', climbMin: 300, climbMax: 300 });
  const segment = generator.next(generator.start);
  expect(segment.end.mountain!.side).toBe(1);
  expect(segment.end.position.y - terrain.sample(segment.end.position.x)).toBeLessThan(3);
});

it('keeps zero grade flat and reproduces climb state after distant replay', () => {
  const options = { ...DEFAULT_OPTIONS, routeStyle: 5 as const, maxGrade: 0.25,
    elevationMode: 'cycles' as const, climbMin: 400, climbMax: 400 };
  const spine = new RoadSpine('climb-replay', undefined, options);
  const visit = (z: number) => { let frames = 0; while (!spine.update(z, 8, 6208) && frames++ < 5000) { /* Stream the complete view. */ }
    expect(frames).toBeLessThan(5000); return spine.segments.map(segment => segment.end); };
  const first = visit(-30000); visit(-100000); expect(visit(-30000)).toEqual(first);
  const flat = new RoadGenerator('flat-climb', undefined, { ...options, maxGrade: 0 });
  let point = flat.start;
  for (let i = 0; i < 100; i++) { point = flat.next(point).end; expect(point.position.y).toBe(flat.start.position.y); }
}, 30000);
