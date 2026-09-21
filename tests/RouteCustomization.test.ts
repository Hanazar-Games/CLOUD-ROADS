import { expect, it } from 'vitest';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSpine, MAX_ROAD_SEGMENTS } from '../src/road/RoadSpine';
import { DEFAULT_OPTIONS, type WorldOptions } from '../src/world/WorldOptions';

it.each(['mountain', 'highway'] as const)('offers five increasingly winding %s routes, ending in continuous hairpins', roadType => {
  const counts: number[] = [];
  for (const routeStyle of [1, 2, 3, 4, 5] as const) {
    const options = { ...DEFAULT_OPTIONS, roadType, routeStyle, maxGrade: 0, junctions: false, interchanges: false } as WorldOptions;
    const generator = new RoadGenerator('five-levels', { sample: () => 400 }, options);
    let point = generator.start, turns = 0, hairpinLength = 0;
    while (point.distance < 20000) {
      const segment = generator.next(point);
      if (segment.kind === 'hairpin') { turns++; hairpinLength += segment.length; }
      for (const t of [0, 0.5, 1]) {
        const sample = segment.sample(t);
        expect(Math.abs(sample.grade)).toBe(0);
        expect(sample.position.y).toBe(generator.start.position.y);
        expect(sample.tangent.z).toBeLessThan(-0.2);
        expect(Math.abs(sample.curvature)).toBeLessThan(1 / 30);
      }
      point = segment.end;
    }
    counts.push(turns);
    if (routeStyle === 5) expect(hairpinLength / point.distance).toBeGreaterThan(0.8);
  }
  expect(counts[0]).toBe(0);
  for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]);
});

it.each((['mountain', 'highway'] as const).flatMap(roadType => [0, 0.03, 0.06, 0.2, 0.4].map(maxGrade => ({ roadType, maxGrade }))))(
  'honors $maxGrade maximum grade on straight and winding $roadType roads', ({ roadType, maxGrade }) => {
    for (const routeStyle of [0, 1, 5] as const) {
      const generator = new RoadGenerator('grade-limit', { sample: (_x, z) => 400 + (128 - z) * 0.65 },
        { ...DEFAULT_OPTIONS, roadType, routeStyle, maxGrade } as WorldOptions);
      let point = generator.start, maximum = 0;
      while (point.distance < 12000) {
        const segment = generator.next(point);
        expect(segment.sample(0).position).toEqual(point.position);
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          const sample = segment.sample(t);
          expect(Math.abs(sample.grade)).toBeLessThanOrEqual(maxGrade + 1e-10);
          maximum = Math.max(maximum, sample.grade);
          if (routeStyle === 0) {
            expect(sample.position.x).toBe(generator.start.position.x);
            expect(sample.heading).toBe(0); expect(Math.abs(sample.curvature)).toBe(0); expect(Math.abs(sample.bank)).toBe(0);
          }
        }
        point = segment.end;
      }
      expect(maximum).toBeGreaterThanOrEqual(maxGrade * 0.65);
    }
  });

it.each(['mountain', 'highway'] as const)('limits descents to the selected maximum on %s routes', roadType => {
  for (const maxGrade of [0, 0.03, 0.2, 0.4]) for (const routeStyle of [0, 1, 5] as const) {
    const generator = new RoadGenerator('downhill', { sample: (_x, z) => 10000 + (z - 128) * 0.65 },
      { ...DEFAULT_OPTIONS, roadType, routeStyle, maxGrade });
    let point = generator.start, minimum = 0;
    while (point.distance < 12000) {
      const segment = generator.next(point);
      for (const t of [0, 0.5, 1]) {
        const grade = segment.sample(t).grade;
        expect(Math.abs(grade)).toBeLessThanOrEqual(maxGrade + 1e-10);
        minimum = Math.min(minimum, grade);
      }
      point = segment.end;
    }
    expect(minimum).toBeLessThanOrEqual(-maxGrade * 0.65);
  }
});

it.each(['mountain', 'highway'] as const)('retains the full 4 km view on an endless level-five %s route and replays it', roadType => {
  const spine = new RoadSpine('five-stream', undefined, { ...DEFAULT_OPTIONS, roadType, routeStyle: 5, maxGrade: 0.4 } as WorldOptions);
  const visit = (z: number) => {
    let frames = 0;
    while (!spine.update(z, 8, 6208) && frames++ < 5000) { /* Stream the complete view. */ }
    expect(frames).toBeLessThan(5000);
    expect(spine.segments[0].start.position.z).toBeGreaterThanOrEqual(z + 6208);
    expect(spine.segments.at(-1)!.end.position.z).toBeLessThanOrEqual(z - 6208);
    expect(spine.segments.length).toBeLessThanOrEqual(MAX_ROAD_SEGMENTS);
    return spine.segments.map(segment => segment.end);
  };
  const first = visit(-40000); visit(-100000); expect(visit(-40000)).toEqual(first);
  expect(spine.checkpointCount).toBeLessThanOrEqual(64);
}, 30000);
