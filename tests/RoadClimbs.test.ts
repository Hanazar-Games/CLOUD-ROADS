import { expect, it } from 'vitest';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSpine } from '../src/road/RoadSpine';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';

it.each([50, 2000])('turns around at the %s m climb limit even with 40 percent grades', gain => {
  const options = { ...DEFAULT_OPTIONS, routeStyle: 5 as const, maxGrade: 0.4,
    elevationMode: 'cycles' as const, climbMin: gain, climbMax: gain };
  const generator = new RoadGenerator('climb-limits', { sample: () => 400 }, options);
  let point = generator.start, turns = 0;
  while (point.distance < 50000) {
    const segment = generator.next(point);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const sample = segment.sample(t);
      expect(Math.abs(sample.grade)).toBeLessThanOrEqual(0.4 + 1e-10);
      expect(sample.position.y).toBeGreaterThanOrEqual(generator.start.position.y - 0.5);
      expect(sample.position.y).toBeLessThanOrEqual(generator.start.position.y + gain + 0.5);
    }
    if (point.climb && point.climb.ascending !== segment.end.climb!.ascending) {
      expect(Math.abs(point.position.y - point.climb.target)).toBeLessThan(0.25); turns++;
    }
    point = segment.end;
  }
  expect(turns).toBeGreaterThan(2);
});

it.each(['mountain', 'highway'] as const)('repeats bounded climbs and descents through eighteen-bend %s roads', roadType => {
  const options = { ...DEFAULT_OPTIONS, roadType, routeStyle: 5 as const, maxGrade: 0.3,
    elevationMode: 'cycles' as const, climbMin: 300, climbMax: 700 };
  const generator = new RoadGenerator('eighteen-bends', { sample: () => 400 }, options);
  let point = generator.start, peak = point.position.y, bottom = peak, previousSign = 1, hairpins = 0;
  const gains: number[] = [];
  while (point.distance < 70000) {
    const segment = generator.next(point), end = segment.end;
    if (segment.kind === 'hairpin') hairpins++;
    for (const t of [0, 0.5, 1]) expect(Math.abs(segment.sample(t).grade)).toBeLessThanOrEqual(0.3 + 1e-10);
    if (Math.abs(end.grade) > 0.00001) {
      const sign = Math.sign(end.grade);
      if (previousSign > 0 && sign < 0) gains.push(peak - bottom);
      if (previousSign < 0 && sign > 0) { bottom = point.position.y; peak = bottom; }
      previousSign = sign;
    }
    peak = Math.max(peak, end.position.y); point = end;
  }
  expect(gains.length).toBeGreaterThan(3);
  expect(hairpins).toBeGreaterThan(100);
  for (const gain of gains) { expect(gain).toBeGreaterThanOrEqual(299); expect(gain).toBeLessThanOrEqual(701); }
  expect(new Set(gains.map(Math.round)).size).toBeGreaterThan(2);
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
