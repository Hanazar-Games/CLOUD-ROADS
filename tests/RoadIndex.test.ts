import { describe, expect, it } from 'vitest';
import { RoadIndex, type RoadEdge } from '../src/road/RoadIndex';

describe('RoadIndex', () => {
  it('matches exhaustive projection for reversing, disconnected and degenerate edges', () => {
    const edges: RoadEdge[] = Array.from({ length: 100 }, (_, i) => ({
      a: { x: Math.sin(i * 1.7) * 600, z: Math.cos(i * 0.7) * 700 },
      b: { x: Math.sin(i * 1.7 + 0.1) * 600, z: Math.cos(i * 0.7 + 0.1) * 700 },
    }));
    edges.push({ a: { x: 0, z: 0 }, b: { x: 0, z: 0 } });
    const index = new RoadIndex(edges);
    for (let i = 0; i < 100; i++) {
      const x = Math.sin(i) * 800, z = Math.cos(i) * 800;
      const expected = edges.map(({ a, b }, edge) => {
        const dx = b.x - a.x, dz = b.z - a.z, length = dx * dx + dz * dz;
        const t = length ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / length)) : 0;
        return { index: edge, t, distanceSquared: (x - a.x - t * dx) ** 2 + (z - a.z - t * dz) ** 2 };
      }).sort((a, b) => a.distanceSquared - b.distanceSquared || a.index - b.index)[0];
      expect(index.nearest(x, z)).toEqual(expected);
      expect(index.nearest(x, z, 160)).toEqual(expected.distanceSquared <= 160 ** 2 ? expected : undefined);
    }
    expect(new RoadIndex([]).nearest(0, 0)).toBeUndefined();
    expect(index.nearest(0, 0)?.distanceSquared).toBe(0);
  });

  it('keeps disconnected corridor edges separate when selecting a chunk', () => {
    const edges = [
      { a: { x: -500, z: 0 }, b: { x: 500, z: 0 } },
      { a: { x: 500, z: 0 }, b: { x: 500, z: 1000 } },
      { a: { x: 500, z: 1000 }, b: { x: -500, z: 1000 } },
      { a: { x: -500, z: 1000 }, b: { x: -500, z: 100 } },
      { a: { x: -500, z: 100 }, b: { x: 500, z: 100 } },
    ];
    expect(new RoadIndex(edges).within(-10, -10, 10, 110)).toEqual([0, 4]);
  });
});
