import { expect, it } from 'vitest';
import { DEFAULT_OPTIONS, type WorldOptions } from '../src/world/WorldOptions';
import { HeightFunction } from '../src/terrain/HeightFunction';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSpine, MAX_ROAD_SEGMENTS } from '../src/road/RoadSpine';
import { RoadNetwork } from '../src/road/RoadNetwork';

it.each(['alpine', 'forest', 'meadow', 'desert', 'karst'] as const)('bounds custom %s mountain elevations and reproduces them in terrain workers', terrain => {
  const options = { ...DEFAULT_OPTIONS, terrain, mountainHeight: 'range' as const, mountainMin: 700, mountainMax: 1300, mountainDensity: 1.5 };
  const height = new HeightFunction('altitude-ranges', terrain, 'mountain', options);
  const worker = new TerrainGenerator('altitude-ranges', options);
  for (let z = -90000; z <= 90000; z += 1800) for (const x of [-37000, 128, 3900]) {
    const y = height.sample(x, z);
    expect(y).toBeGreaterThanOrEqual(700); expect(y).toBeLessThanOrEqual(1300);
    expect(worker.height.sample(x, z)).toBe(y);
  }
  const sparse = new HeightFunction('altitude-ranges', terrain, 'mountain', { ...options, mountainDensity: 0.5 });
  expect(sparse.sample(3000, -4000)).not.toBe(height.sample(3000, -4000));
  expect(height.ranges.length).toBeCloseTo(32000 / 1.5);
});

it('changes tree and ground cover density without changing terrain geometry', () => {
  const generate = (vegetationDensity: number) => new TerrainGenerator('woodland', { ...DEFAULT_OPTIONS, terrain: 'forest', vegetationDensity }).generate(0, 0, 64);
  const empty = generate(0), sparse = generate(0.25), normal = generate(1), dense = generate(2);
  expect(empty.vegetation.length).toBe(0);
  expect(sparse.vegetation.length).toBeLessThan(normal.vegetation.length);
  expect(dense.vegetation.length).toBeGreaterThan(normal.vegetation.length);
  expect(dense.vegetation).toEqual(generate(2).vegetation);
  expect(empty.positions).toEqual(dense.positions);
  expect(dense.vegetation.length / 7).toBeLessThanOrEqual(4896);
});

it.each(['fixed', 'random'] as const)('keeps %s absolute altitude routes continuous and within their limits through infinite generation', elevationMode => {
  for (const roadType of ['mountain', 'highway'] as const) for (const routeStyle of [0, 1, 5] as const) {
    const options: WorldOptions = { ...DEFAULT_OPTIONS, elevationMode, altitudeMin: 600, altitudeMax: 900, elevationDirection: 'up', roadType, routeStyle, maxGrade: 0.2 };
    const generator = new RoadGenerator('altitude-cycles', { sample: (_x, z) => 700 + Math.sin(z / 1400) * 200 }, options);
    const replay = new RoadGenerator('altitude-cycles', { sample: (_x, z) => 700 + Math.sin(z / 1400) * 200 }, options);
    let point = generator.start, other = replay.start, ups = 0, downs = 0;
    const targets = new Set<number>();
    while (point.distance < 80000) {
      const segment = generator.next(point); other = replay.next(other).end;
      expect(segment.end).toEqual(other);
      expect(segment.sample(0).position).toEqual(point.position);
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const p = segment.sample(t);
        expect(p.position.y).toBeGreaterThanOrEqual(600 - 1e-6);
        expect(p.position.y).toBeLessThanOrEqual(900 + 1e-6);
        expect(Math.abs(p.grade)).toBeLessThanOrEqual(0.2 + 1e-8);
      }
      if (segment.end.grade > 0.01) ups++;
      if (segment.end.grade < -0.01) downs++;
      if (segment.end.climb) targets.add(segment.end.climb.target);
      point = segment.end;
    }
    expect(ups).toBeGreaterThan(20); expect(downs).toBeGreaterThan(20);
    if (elevationMode === 'fixed') expect(targets.size).toBe(2);
    if (elevationMode === 'random') expect(targets.size).toBeGreaterThan(4);
  }
});

it('starts descending at the upper altitude and respects a zero grade or level altitude range', () => {
  for (const [altitudeMin, altitudeMax, maxGrade] of [[100, 700, 0], [700, 700, 0.4]]) {
    const road = new RoadGenerator('level-altitude', undefined, { ...DEFAULT_OPTIONS, elevationMode: 'fixed', altitudeMin, altitudeMax, maxGrade, elevationDirection: 'down' });
    let point = road.start;
    for (let i = 0; i < 100; i++) { point = road.next(point).end; expect(point.position.y).toBe(altitudeMax); expect(point.grade).toBe(0); }
  }
});

it('replays customized mountains and random altitude targets after releasing distant road segments', () => {
  const options: WorldOptions = { ...DEFAULT_OPTIONS, roadType: 'highway', routeStyle: 5, highwayRadius: 1200, maxGrade: 0.2,
    elevationMode: 'random', altitudeMin: 1000, altitudeMax: 1800, elevationDirection: 'random',
    mountainHeight: 'range', mountainMin: 500, mountainMax: 1800, mountainDensity: 2 };
  const spine = new RoadSpine('custom-stream', undefined, options);
  const visit = (z: number) => {
    let frames = 0;
    while (!spine.update(z, 8, 6208) && frames++ < 5000) { /* Generate with the normal streaming budget. */ }
    expect(frames).toBeLessThan(5000); expect(spine.segments.length).toBeLessThanOrEqual(MAX_ROAD_SEGMENTS);
    return spine.segments.map(s => s.end);
  };
  const before = visit(-16000); visit(-100000); expect(visit(-16000)).toEqual(before);
  expect(spine.checkpointCount).toBeLessThanOrEqual(64);
}, 20000);

it('preserves full highway interchange clearance above a narrow altitude range', () => {
  const options: WorldOptions = { ...DEFAULT_OPTIONS, roadType: 'highway', routeStyle: 0, elevationMode: 'fixed', altitudeMin: 600, altitudeMax: 610 };
  const terrain = { sample: () => 590 }, spine = new RoadSpine('bounded-junction', terrain, options);
  const network = new RoadNetwork('bounded-junction', terrain, options, spine);
  for (let i = 0; i < 1000 && !network.junctions.length; i++) network.update(128, -19600, undefined, 4000);
  expect(network.junctions).toHaveLength(1); expect(network.junctions[0].kind).toBe('stack');
  const branch = network.routes.find(r => r.id === network.junctions[0].exits[0])!;
  for (const segment of branch.definition.prefix) expect(segment.end.position.y).toBeCloseTo(network.junctions[0].sample.position.y + 14);
});
