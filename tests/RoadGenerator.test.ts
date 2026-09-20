import { describe, expect, it } from 'vitest';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { MAX_ROAD_SEGMENTS, ROAD_HALO, RoadSpine } from '../src/road/RoadSpine';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';

describe('RoadGenerator', () => {
  it.each(([1, 3, 5] as const).flatMap(routeStyle =>
    (['mountain', 'highway'] as const).map(roadType => ({ routeStyle, roadType }))))(
    'covers 4 km viewing and the preload margin for 100 km of $routeStyle $roadType', options => {
      const spine = new RoadSpine('CLOUD-ROAD-001', undefined, { ...DEFAULT_OPTIONS, ...options });
      const halo = (16 + 2) * 256 + 1600;
      for (let z = 128; z > -100000; z -= 4096) {
        let ready = false;
        for (let frame = 0; frame < 2000 && !ready; frame++) ready = spine.update(z, 8, halo);
        expect(ready).toBe(true);
        expect(spine.segments.length).toBeLessThanOrEqual(MAX_ROAD_SEGMENTS);
        expect(spine.segments[0].start.position.z).toBeGreaterThanOrEqual(Math.min(128, z + halo));
        expect(spine.segments.at(-1)!.end.position.z).toBeLessThanOrEqual(z - halo);
      }
    }, 20000);

  it('reproduces a route independently of generation batch size', () => {
    const a = new RoadSpine('CLOUD-ROAD-001');
    const b = new RoadSpine('CLOUD-ROAD-001');
    while (!a.update(-5000, 3)) { /* Generate incrementally. */ }
    while (!b.update(-5000, 11)) { /* Generate in larger batches. */ }
    expect(a.segments.map((segment) => segment.end)).toEqual(b.segments.map((segment) => segment.end));
    const other = new RoadGenerator('ANOTHER-ROAD');
    expect(other.next(other.start).end).not.toEqual(new RoadGenerator('CLOUD-ROAD-001').next(a.generator.start).end);
  });

  it.each([10_000, 30_000, 100_000])('WorldSimulationTest: validates %i m of road, including interior spline extrema', (distance) => {
    const generator = new RoadGenerator('CLOUD-ROAD-001');
    let point = generator.start;
    let lastHeading = point.heading;
    let previousEnd = point.position;
    while (point.distance < distance) {
      const segment = generator.next(point);
      expect(segment.sample(0).position).toEqual(previousEnd);
      expect(segment.sample(0).grade).toBeCloseTo(point.grade, 10);
      expect(segment.sample(0).heading).toBeCloseTo(point.heading, 10);
      for (let i = 0; i <= 48; i++) {
        const sample = segment.sample(i / 48);
        expect(Object.values(sample.position).every(Number.isFinite)).toBe(true);
        expect(Math.abs(sample.grade)).toBeLessThanOrEqual(0.1);
        expect(Math.abs(sample.curvature)).toBeLessThanOrEqual(segment.kind === 'hairpin' ? 1 / 30 : 1 / 100);
        expect(Math.abs(sample.heading - lastHeading)).toBeLessThan(0.1);
        expect(sample.tangent.z).toBeLessThan(-0.25);
        expect(sample.width).toBe(8);
        expect(Math.abs(sample.bank)).toBeLessThanOrEqual(Math.PI / 30);
        lastHeading = sample.heading;
      }
      expect(segment.end.position.z).toBeLessThan(point.position.z);
      expect(segment.end.distance).toBeGreaterThan(point.distance + 90);
      const midpoint = segment.atDistance((point.distance + segment.end.distance) / 2);
      expect(midpoint.distance).toBeCloseTo((point.distance + segment.end.distance) / 2, 5);
      point = segment.end;
      previousEnd = segment.sample(1).position;
    }
  });

  it('uses terrain scoring while respecting the slope limit on extreme terrain', () => {
    const low = new RoadGenerator('test', { sample: () => 100 });
    const rising = new RoadGenerator('test', { sample: (_x: number, z: number) => 100 + (128 - z) * 0.5 });
    const a = low.next(low.start), b = rising.next(rising.start);
    expect(b.end.grade).toBeGreaterThan(a.end.grade);
    expect(b.end.grade).toBeLessThanOrEqual(0.06);
  });

  it('bounds retained route data over 100 km and regenerates the same route on return', () => {
    const spine = new RoadSpine('CLOUD-ROAD-001');
    while (!spine.update(128, 8)) { /* Wait for initial coverage. */ }
    const original = spine.segments.slice(0, 5).map((segment) => segment.end);
    for (let z = 0; z >= -100_000; z -= 1000) {
      while (!spine.update(z, 8)) expect(spine.segments.length).toBeLessThanOrEqual(MAX_ROAD_SEGMENTS);
      expect(spine.segments.length).toBeLessThanOrEqual(MAX_ROAD_SEGMENTS);
      const sample = spine.segments[Math.floor(spine.segments.length / 2)].sample(0.5);
      const nearest = spine.nearest(sample.position.x, sample.position.z);
      expect(nearest).toBeDefined();
      expect(nearest!.position.z).toBeCloseTo(sample.position.z, 3);
      expect(spine.segments[0].start.position.z).toBeGreaterThanOrEqual(Math.min(128, z + ROAD_HALO));
      expect(spine.segments.at(-1)!.end.position.z).toBeLessThanOrEqual(z - ROAD_HALO);
    }
    expect(spine.segments[0].start.distance).toBeGreaterThan(90_000);
    while (!spine.update(128, 8)) { /* Replay from the deterministic start. */ }
    expect(spine.segments.slice(0, 5).map((segment) => segment.end)).toEqual(original);
  });

  it('restores the full terrain halo when moving backward before leaving the retained road', () => {
    const spine = new RoadSpine('CLOUD-ROAD-001');
    while (!spine.update(-12_000, 8)) { /* Move forward. */ }
    const z = -10_000;
    expect(spine.segments[0].start.position.z).toBeGreaterThan(z);
    while (!spine.update(z, 8)) { /* Rebuild the missing northern halo. */ }
    expect(spine.segments[0].start.position.z).toBeGreaterThanOrEqual(z + ROAD_HALO);
    expect(spine.segments.at(-1)!.end.position.z).toBeLessThanOrEqual(z - ROAD_HALO);
  });
});
