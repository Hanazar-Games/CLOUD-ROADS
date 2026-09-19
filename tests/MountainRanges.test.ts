import { expect, it } from 'vitest';
import { MountainRanges, RANGE_LENGTH } from '../src/terrain/MountainRanges';
import { HeightFunction } from '../src/terrain/HeightFunction';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { RoadSpine, MAX_ROAD_SEGMENTS } from '../src/road/RoadSpine';

it('joins independently seeded valleys and saddles continuously in both infinite directions', () => {
  const ranges = new MountainRanges('CLOUD-ROAD-001'), replay = new MountainRanges('CLOUD-ROAD-001');
  for (const id of [-100, -1, 0, 1, 30, 100]) {
    for (const z of [128 - id * RANGE_LENGTH, ranges.passZ(id)]) {
      const a = ranges.sample(z - 0.01), b = ranges.sample(z + 0.01);
      expect(a.height).toBeCloseTo(b.height, 2);
      expect(Math.abs(a.x - b.x)).toBeLessThan(0.02);
      expect(a).toEqual(replay.sample(z - 0.01));
    }
    const pass = ranges.sample(ranges.passZ(id));
    expect(pass.height - ranges.sample(128 - id * RANGE_LENGTH).height).toBeGreaterThan(450);
  }
});

it('starts in lower mountains and crosses a saddle between higher flanks', () => {
  const height = new HeightFunction('CLOUD-ROAD-001');
  expect(height.sample(128, 128)).toBeLessThan(900);
  const z = height.ranges.passZ(0), guide = height.route(z)!;
  for (const side of [-1, 1]) expect(height.sample(guide.x + side * 950, z) - height.sample(guide.x, z)).toBeGreaterThan(150);
  expect(guide.height - height.route(z - 6000)!.height).toBeGreaterThan(100);
  expect(guide.height - height.route(z + 6000)!.height).toBeGreaterThan(100);
});

it.each(['mountain', 'highway'] as const)('repeatedly climbs and descends over 100 km of %s road without grade or continuity breaks', roadType => {
  const terrain = new HeightFunction('CLOUD-ROAD-001'), options = { ...DEFAULT_OPTIONS, roadType };
  const generator = new RoadGenerator('CLOUD-ROAD-001', terrain, options);
  let point = generator.start, lowest = point.position.y, highest = lowest, climb = 0, descent = 0;
  const peaks = new Map<number, number>(), valleys = new Map<number, number>();
  while (point.distance < 100000) {
    const segment = generator.next(point), end = segment.end;
    expect(segment.sample(0).position).toEqual(point.position);
    expect(Math.abs(end.grade)).toBeLessThanOrEqual(roadType === 'highway' ? 0.040001 : 0.060001);
    expect(end.position.z).toBeLessThan(point.position.z);
    const delta = end.position.y - point.position.y;
    climb += Math.max(0, delta); descent += Math.max(0, -delta);
    lowest = Math.min(lowest, end.position.y); highest = Math.max(highest, end.position.y);
    const guide = terrain.route(end.position.z)!;
    if (Math.abs(end.position.z - terrain.ranges.passZ(guide.id)) < 1200) peaks.set(guide.id, Math.max(peaks.get(guide.id) ?? -Infinity, end.position.y));
    if (guide.progress < 0.05) valleys.set(guide.id, Math.min(valleys.get(guide.id) ?? Infinity, end.position.y));
    point = end;
  }
  expect(highest - lowest).toBeGreaterThan(450);
  expect(climb).toBeGreaterThan(1200); expect(descent).toBeGreaterThan(1000);
  expect(peaks.size).toBeGreaterThanOrEqual(2);
  for (const [id, peak] of peaks) if (valleys.has(id) && valleys.has(id + 1)) {
    expect(peak - valleys.get(id)!).toBeGreaterThan(300);
    expect(peak - valleys.get(id + 1)!).toBeGreaterThan(300);
  }
}, 20000);

it('covers the widest view through 100 km and replays discarded mountain ranges', () => {
  const road = new RoadSpine('CLOUD-ROAD-001'), halo = 5952;
  const load = (z: number) => {
    let frames = 0;
    while (!road.update(z, 8, halo) && frames++ < 6000) { /* Stream with bounded work. */ }
    expect(frames).toBeLessThan(6000);
    expect(road.segments.length).toBeLessThanOrEqual(MAX_ROAD_SEGMENTS);
    expect(road.samples[0].position.z).toBeGreaterThanOrEqual(z + halo);
    expect(road.samples.at(-1)!.position.z).toBeLessThanOrEqual(z - halo);
  };
  load(-16000);
  const first = road.nearest(128, -16000);
  load(-48000); load(-100000); load(-16000);
  expect(road.nearest(128, -16000)).toEqual(first);
}, 20000);
