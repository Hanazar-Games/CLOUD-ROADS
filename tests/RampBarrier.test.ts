import { expect, it } from 'vitest';
import { exposedBarriers } from '../src/road/RampBarrier';
import { accessQuads } from '../src/road/SurfaceRibbon';

const point = (x: number, z: number, y = 0) => ({ x, y, z, halfWidth: 2, slopeX: 0, slopeZ: 0 });

it('cuts a merge opening at the exact pavement intersections instead of deleting an entire rail', () => {
  const covers = accessQuads([{ a: point(0, -10), b: point(0, 10) }]);
  const rails = exposedBarriers([{ a: point(-8, 0), b: point(8, 0) }], covers);
  expect(rails).toHaveLength(2);
  expect(rails[0].a.x).toBe(-8); expect(rails[0].b.x).toBeCloseTo(-2, 5);
  expect(rails[1].a.x).toBeCloseTo(2, 5); expect(rails[1].b.x).toBe(8);
});

it('keeps stacked roads protected and preserves rails on a shared outer edge', () => {
  const covers = accessQuads([{ a: point(0, -10), b: point(0, 10) }]);
  for (const rail of [{ a: point(-8, 0, 14), b: point(8, 0, 14) }, { a: point(2, -10), b: point(2, 10) }]) {
    expect(exposedBarriers([rail], covers)).toEqual([rail]);
  }
});

it('joins both ramp boundaries at a junction without a gap or a fence across the driving surface', () => {
  const quads = accessQuads([{ a: point(-8, 0), b: point(8, 0) }, { a: point(0, -8), b: point(0, 8) }]);
  const rails = exposedBarriers(quads.flatMap(q => [{ a: q.leftA, b: q.leftB }, { a: q.rightA, b: q.rightB }]), quads);
  expect(rails).toHaveLength(8);
  for (const rail of rails) for (const p of [rail.a, rail.b]) {
    if (Math.abs(p.x) > 3 || Math.abs(p.z) > 3) continue;
    expect(rails.filter(other => [other.a, other.b].some(q => Math.hypot(p.x - q.x, p.z - q.z) < 0.001))).toHaveLength(2);
  }
});
