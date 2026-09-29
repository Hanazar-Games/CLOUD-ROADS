import { expect, it } from 'vitest';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadCorridor } from '../src/road/RoadCorridor';
import { BridgeDetector } from '../src/bridge/BridgeDetector';
import { cableSpans } from '../src/bridge/CableBridgeMesh';
import { DEFAULT_OPTIONS, validWorldOptions } from '../src/world/WorldOptions';
import { HeightFunction } from '../src/terrain/HeightFunction';
import { ServicePlanner } from '../src/service/ServicePlanner';
import { serviceTarget } from '../src/service/ServiceSchedule';
import { RoadSegment } from '../src/road/RoadSegment';

it('keeps service ramps clear of nearby landmark approaches even when the service center is outside the bridge', () => {
  const seed = 'SERVICE-BRIDGE', target = serviceTarget(seed, 1), terrain = { sample: () => 500 };
  const start = new RoadGenerator(seed, terrain).start;
  const road = new RoadSegment({ ...start, distance: target - 1500 }, 0, 0, 3000);
  const samples = Array.from({ length: 1501 }, (_, i) => road.sample(i / 1500));
  expect(new ServicePlanner(seed, terrain).detect(samples)).toHaveLength(1);
  const structure = { kind: 'bridge' as const, landmark: true, start: target + 100, end: target + 1300, finish: target + 1396, grade: 0, heading: 0 };
  for (const sample of samples) if (sample.distance >= structure.start && sample.distance <= structure.finish) sample.structure = structure;
  expect(new ServicePlanner(seed, terrain).detect(samples)).toHaveLength(0);
});

it.each(['mountain', 'highway'] as const)('reduces road-to-ground error on rolling %s terrain at high adherence', roadType => {
  const terrain = { sample: (_x: number, z: number) => 500 + Math.sin((128 - z) / 600) * 45 };
  const errors = [0, 1].map(terrainFollow => {
    const generator = new RoadGenerator('FOLLOW', terrain, { ...DEFAULT_OPTIONS, roadType, terrainFollow, maxGrade: 0.12, junctions: false, interchanges: false });
    let point = generator.start, error = 0;
    while (point.distance < 12000) { point = generator.next(point).end; error += Math.abs(point.position.y - terrain.sample(point.position.x, point.position.z) - 1); }
    return error;
  });
  expect(errors[1]).toBeLessThan(errors[0] * 0.8);
});

it.each(['alpine', 'meadow', 'desert'] as const)('reserves a reachable landmark and replays its approach in natural %s terrain', terrainKind => {
  const options = { ...DEFAULT_OPTIONS, terrain: terrainKind, routeStyle: 5 as const };
  const terrain = new HeightFunction('REAL-LANDMARK', terrainKind, options.roadType, options);
  const generator = new RoadGenerator('REAL-LANDMARK', terrain, options);
  let point = generator.start;
  while (point.distance < 200000 && !point.structure?.landmark) point = generator.next(point).end;
  expect(point.structure?.landmark).toBe(true);
  const replay = new RoadGenerator('REAL-LANDMARK', terrain, options);
  let copy = JSON.parse(JSON.stringify(point));
  for (let i = 0; i < 100; i++) {
    point = generator.next(point).end; copy = replay.next(copy).end;
    expect(copy).toEqual(point);
  }
}, 30000);

it.each([0, 1, 2, 3, 4, 5] as const)('builds a straight 1.2 km two-tower landmark on route level %i', routeStyle => {
  const terrain = { sample: () => 500 }, options = { ...DEFAULT_OPTIONS, routeStyle };
  const generator = new RoadGenerator('LANDMARK', terrain, options);
  let point = generator.start;
  while (point.distance < 100000) point = generator.next(point).end;
  const samples = [];
  while (point.distance < 200000) {
    const segment = generator.next(point);
    expect(segment.sample(0).position).toEqual(point.position);
    expect(segment.sample(0).grade).toBe(point.grade);
    expect(Math.abs(segment.end.grade)).toBeLessThanOrEqual(options.maxGrade + 1e-9);
    if (segment.start.structure?.landmark) {
      for (let i = 0; i < 48; i++) samples.push(segment.sample(i / 48));
    }
    point = segment.end;
    if (samples.length && point.distance > samples[0].structure!.finish) break;
  }
  const deck = samples.filter(s => s.distance >= s.structure!.start && s.distance <= s.structure!.end);
  expect(deck.length).toBeGreaterThan(500);
  expect(deck[0].structure!.end - deck[0].structure!.start).toBeCloseTo(1200, 6);
  expect(deck.every(s => Math.abs(s.grade) < 1e-10 && s.curvature === 0 && s.bank === 0)).toBe(true);
  expect(deck.every(s => s.position.y - 500 >= options.landmarkClearance - 0.01)).toBe(true);
  const spans = new BridgeDetector(terrain, options).detect(samples);
  const cables = cableSpans(spans, terrain, RoadCorridor.fromSamples(samples, spans, options), options);
  expect(cables).toHaveLength(1); expect(cables[0].towers).toHaveLength(2);
  expect(cables[0].end - cables[0].start).toBeCloseTo(1200, 6);
  const clipped = deck.slice(100, 300), fragments = new BridgeDetector(terrain, options).detect(clipped);
  const restored = cableSpans(fragments, terrain, RoadCorridor.fromSamples(clipped, fragments, options), options);
  for (const [i, tower] of restored[0].towers.entries()) {
    expect(tower.distance).toBeCloseTo(cables[0].towers[i].distance, 7);
    for (const axis of ['x', 'y', 'z'] as const) expect(tower.position[axis]).toBeCloseTo(cables[0].towers[i].position[axis], 7);
  }
}, 30000);

it('validates terrain-follow and bridge controls without accepting reversed intervals', () => {
  expect(validWorldOptions(DEFAULT_OPTIONS)).toBe(true);
  for (const patch of [{ terrainFollow: -0.1 }, { bridgeHeight: 0 }, { landmarkMin: 250000, landmarkMax: 100000 }, { landmarkLength: 1201 }])
    expect(validWorldOptions({ ...DEFAULT_OPTIONS, ...patch })).toBe(false);
});

it('respects disabled landmarks and an impossible zero-grade clearance without lifting the road', () => {
  for (const patch of [{ landmarkBridges: false }, { maxGrade: 0 }]) {
    const generator = new RoadGenerator('LANDMARK', { sample: () => 500 }, { ...DEFAULT_OPTIONS, ...patch });
    let point = { ...generator.start, distance: 150000 };
    for (let i = 0; i < 300; i++) {
      point = generator.next(point).end;
      expect(point.structure?.landmark).toBeFalsy(); expect(point.position.y).toBeCloseTo(501);
    }
  }
});

it('allows a horizontal fixed-altitude landmark when the existing elevation already provides clearance', () => {
  const options = { ...DEFAULT_OPTIONS, maxGrade: 0, elevationMode: 'fixed' as const, altitudeMin: 600, altitudeMax: 600 };
  const generator = new RoadGenerator('LANDMARK', { sample: () => 500 }, options);
  const segment = generator.next({ ...generator.start, distance: 199000 });
  expect(segment.start.structure?.landmark).toBe(true);
  expect(segment.end.grade).toBe(0); expect(segment.end.position.y).toBe(600);
});
