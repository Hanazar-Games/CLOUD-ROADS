import { expect, it } from 'vitest';
import { RoadSpine } from '../src/road/RoadSpine';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { serviceTarget } from '../src/service/ServiceSchedule';
import { RoadNetwork } from '../src/road/RoadNetwork';
import { HeightFunction } from '../src/terrain/HeightFunction';
import { RoadGenerator } from '../src/road/RoadGenerator';

it.each([50, 100, 300, 900, 2000])('keeps flat highway exits grounded even with a %i m climb target', gain => {
  const generator = new RoadGenerator('short-cycles', { sample: () => 100 }, { ...DEFAULT_OPTIONS,
    roadType: 'highway', routeStyle: 0, elevationMode: 'cycles', maxGrade: 0.4, climbMin: gain, climbMax: gain });
  let point = generator.start, minimum = Infinity, maximum = -Infinity;
  while (point.distance < 45000) {
    const segment = generator.next(point);
    for (const t of [0, 0.5, 1]) {
      const sample = segment.sample(t);
      expect(sample.position.y).toBeGreaterThanOrEqual(100.75);
      expect(sample.position.y).toBeLessThanOrEqual(101.25);
      if (sample.distance > 22000 && sample.distance < 30000) {
        minimum = Math.min(minimum, sample.position.y); maximum = Math.max(maximum, sample.position.y);
      }
    }
    point = segment.end;
  }
  expect(maximum - minimum).toBeLessThan(0.1);
});

it.each([
  { terrain: 'alpine' as const, roadType: 'mountain' as const, routeStyle: 5 as const, maxGrade: 0.4 },
  { terrain: 'forest' as const, roadType: 'highway' as const, routeStyle: 0 as const, maxGrade: 0.03 },
  { terrain: 'karst' as const, roadType: 'mountain' as const, routeStyle: 3 as const, maxGrade: 0.06 },
])('preserves buried approaches in $terrain instead of excavating an artificial junction gap', config => {
  const settings = { ...DEFAULT_OPTIONS, ...config }, seed = 'CLOUD-ROAD-001';
  const terrain = new HeightFunction(seed, settings.terrain, settings.roadType);
  const road = new RoadSpine(seed, terrain, settings), network = new RoadNetwork(seed, terrain, settings, road);
  while (!road.advanceToDistance(23000)) { /* Generate the reserved site. */ }
  const sample = road.segments.find(s => s.start.distance <= 20000 && s.end.distance >= 20000)!.atDistance(20000);
  for (let i = 0; i < 200; i++) network.update(sample.position.x, sample.position.z, sample.position.y + 1, 4000);
  expect(network.junctions.find(j => j.route === 'root')).toBeUndefined();
  expect(network.active.tunnels.some(t => t.start.distance < 21200 && t.end.distance > 18500)).toBe(true);
});

it.each(['mountain', 'highway'] as const)('reserves level, straight %s exits even with maximum winding and grade', roadType => {
  const settings = { ...DEFAULT_OPTIONS, roadType, routeStyle: 5 as const, maxGrade: 0.4, elevationMode: 'cycles' as const };
  const road = new RoadSpine('junction-approach', { sample: () => 100 }, settings);
  while (!road.advanceToDistance(21400)) { /* Complete the interchange approach. */ }
  const samples = road.samples.filter(p => p.distance >= 19800 && p.distance <= 21000);
  expect(samples.length).toBeGreaterThan(100);
  expect(Math.max(...samples.map(p => Math.abs(p.grade)))).toBeLessThan(0.001);
  expect(Math.max(...samples.map(p => Math.abs(p.curvature)))).toBeLessThan(0.00001);
  expect(road.segments.some(s => s.kind === 'hairpin')).toBe(true);
});

it('keeps service exits clear of the 20 km interchange while retaining 10–20 km service spacing', () => {
  for (const seed of ['services', 'mountains', 'highway']) {
    let previous = 0;
    for (let id = 1; id <= 100; id++) {
      const target = serviceTarget(seed, id), junction = Math.round(target / 20000) * 20000;
      expect(Math.abs(target - junction)).toBeGreaterThanOrEqual(2400);
      expect(target - previous).toBeGreaterThanOrEqual(10000);
      expect(target - previous).toBeLessThanOrEqual(20000);
      previous = target;
    }
  }
});

it.each([0.06, -0.06, 0.4, -0.4])('levels the full highway interchange footprint after a %s approach grade', grade => {
  const options = { ...DEFAULT_OPTIONS, roadType: 'highway' as const, routeStyle: 0 as const, maxGrade: Math.abs(grade),
    elevationMode: 'fixed' as const, elevationDirection: grade > 0 ? 'up' as const : 'down' as const, altitudeMin: 100, altitudeMax: 9000 };
  const terrain = { sample: () => 100 }, generator = new RoadGenerator('sloping-entry', terrain, options);
  const road = new RoadSpine('sloping-entry', terrain, options, { ...generator.start, position: { x: 128, y: 5000, z: 128 }, distance: 17184, grade });
  while (!road.advanceToDistance(21800)) { /* Generate the approach and all ramp mouths. */ }
  const samples = road.samples.filter(p => p.distance >= 19120 && p.distance <= 20880);
  expect(samples.length).toBeGreaterThan(100);
  expect(Math.max(...samples.map(p => Math.abs(p.grade)))).toBeLessThan(0.00001);
  expect(Math.max(...samples.map(p => p.position.y)) - Math.min(...samples.map(p => p.position.y))).toBeLessThan(0.001);
});
