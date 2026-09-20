import { describe, expect, it } from 'vitest';
import { RoadGenerator } from '../src/road/RoadGenerator';
import { RoadSegment } from '../src/road/RoadSegment';
import { RoadCorridor } from '../src/road/RoadCorridor';
import { RoadSpine } from '../src/road/RoadSpine';

describe('mountain roads', () => {
  it('joins turns with continuous curvature, grade and banking', () => {
    const generator = new RoadGenerator('smooth');
    const first = new RoadSegment(generator.start, 0.3, 0.06);
    const second = new RoadSegment(first.end, -0.1, -0.03);
    const a = first.sample(1), b = second.sample(0);
    expect(a.position).toEqual(b.position);
    expect(a.curvature).toBeCloseTo(b.curvature, 10);
    expect(a.grade).toBeCloseTo(b.grade, 10);
    expect(a.bank).toBeCloseTo(b.bank, 10);
    expect(first.sample(0.999).curvature).toBeCloseTo(second.sample(0.001).curvature, 4);
  });

  it.each([1, -1])('plans spaced switchbacks on steep terrain (%i), with bounded radius and grade', (direction) => {
    const generator = new RoadGenerator('switchbacks', { sample: (_x, z) => 2000 + direction * (128 - z) * 0.4 });
    let point = generator.start, previousHairpin = -Infinity, hairpins = 0;
    const positions: { x: number; z: number; distance: number }[] = [];
    while (point.distance < 12_000) {
      const segment = generator.next(point);
      if (segment.kind === 'hairpin') {
        hairpins++;
        expect(point.distance - previousHairpin).toBeGreaterThan(350);
        expect(Math.abs(segment.end.heading - point.heading)).toBeGreaterThan(2.5);
        previousHairpin = segment.end.distance;
        expect(Math.abs(segment.sample(0.5).curvature)).toBeGreaterThan(1 / 40);
        expect(Math.sign(segment.sample(0.5).grade)).toBe(direction);
      }
      for (let i = 1; i <= 24; i++) {
        const sample = segment.sample(i / 24);
        expect(Math.abs(sample.curvature)).toBeLessThanOrEqual(segment.kind === 'hairpin' ? 1 / 30 : 1 / 100);
        expect(Math.abs(sample.grade)).toBeLessThanOrEqual(0.061);
        expect(sample.tangent.z).toBeLessThan(0);
        if (i % 3 === 0) positions.push({ ...sample.position, distance: sample.distance });
      }
      point = segment.end;
    }
    expect(hairpins).toBeGreaterThanOrEqual(4);
    let clearance = Infinity;
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        if (positions[j].distance - positions[i].distance < 80) continue;
        clearance = Math.min(clearance, Math.hypot(positions[i].x - positions[j].x, positions[i].z - positions[j].z));
      }
    }
    expect(clearance).toBeGreaterThan(24);
  });

  it('couples both legs of a reversing road and preserves local subsets', () => {
    const point = (x: number, y: number, z: number) => ({ x, y, z, nx: 0, ny: 1, nz: 0, ground: 1 });
    const a = point(10, 200, 500), b = point(10, 200, -500);
    const c = point(100, 220, -500), d = point(100, 220, 500);
    const corridor = new RoadCorridor([{ a, b }, { a: b, b: c }, { a: c, b: d }]);
    for (const z of [-300, 0, 300]) {
      expect(corridor.height(10, z, 100)).toBeCloseTo(199.92, 6);
      expect(corridor.height(100, z, 100)).toBeCloseTo(219.92, 6);
      const local = new RoadCorridor(structuredClone(corridor.forChunk(0, Math.floor(z / 256))));
      expect(local.height(100, z, 100)).toBe(corridor.height(100, z, 100));
      expect(local.height(10, z, 100)).toBe(corridor.height(10, z, 100));
    }
  });

  it('finds the road by both horizontal coordinates', () => {
    const spine = new RoadSpine('CLOUD-ROAD-001');
    while (!spine.update(-1000, 8)) { /* Load the mountain window. */ }
    const hairpin = spine.segments.find((segment) => segment.kind === 'hairpin');
    expect(hairpin).toBeDefined();
    for (const t of [0.1, 0.5, 0.9]) {
      const sample = hairpin!.sample(t);
      const nearest = spine.nearest(sample.position.x, sample.position.z)!;
      expect(Math.abs(nearest.distance - sample.distance)).toBeLessThan(0.1);
    }
  });
});
