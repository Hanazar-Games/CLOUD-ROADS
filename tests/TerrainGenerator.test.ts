import { describe, expect, it } from 'vitest';
import { createRng, hashSeed } from '../src/world/WorldSeed';
import { HeightFunction } from '../src/terrain/HeightFunction';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { createTerrainLayout } from '../src/terrain/TerrainTopology';

describe('seeded terrain', () => {
  it('reproduces PRNG streams and separates seeds', () => {
    const stream = (seed: string) => {
      const rng = createRng(hashSeed(seed));
      return Array.from({ length: 100 }, rng);
    };
    expect(stream('CLOUD-ROAD-001')).toEqual(stream('CLOUD-ROAD-001'));
    expect(stream('CLOUD-ROAD-001')).not.toEqual(stream('another-world'));
    expect(stream('CLOUD-ROAD-001').every((n) => n >= 0 && n < 1)).toBe(true);
  });

  it('has repeatable finite heights across a 100 km trip and negative coordinates', () => {
    const a = new HeightFunction('CLOUD-ROAD-001');
    const b = new HeightFunction('CLOUD-ROAD-001');
    const other = new HeightFunction('OTHER');
    let differences = 0;
    for (let distance = -100_000; distance <= 100_000; distance += 137) {
      const height = a.sample(distance, distance * 0.73);
      expect(height).toBe(b.sample(distance, distance * 0.73));
      expect(height).toBeGreaterThan(0);
      expect(height).toBeLessThan(6000);
      if (height !== other.sample(distance, distance * 0.73)) differences++;
    }
    expect(differences).toBeGreaterThan(1000);
  });

  it.each([8, 16, 64] as const)('matches all shared attributes at equal LOD (%i cells)', (cells) => {
    const terrain = new TerrainGenerator('CLOUD-ROAD-001');
    const a = terrain.generate(-1, -2, cells);
    const east = terrain.generate(0, -2, cells);
    const south = terrain.generate(-1, -1, cells);
    for (let i = 0; i <= cells; i++) {
      for (const attr of ['positions', 'normals', 'colors'] as const) {
        const edge = (i * (cells + 1) + cells) * 3;
        const neighbor = i * (cells + 1) * 3;
        if (attr === 'positions') expect(a[attr][edge + 1]).toBe(east[attr][neighbor + 1]);
        else expect(a[attr].slice(edge, edge + 3)).toEqual(east[attr].slice(neighbor, neighbor + 3));
        const bottom = (cells * (cells + 1) + i) * 3;
        const top = i * 3;
        if (attr === 'positions') expect(a[attr][bottom + 1]).toBe(south[attr][top + 1]);
        else expect(a[attr].slice(bottom, bottom + 3)).toEqual(south[attr].slice(top, top + 3));
      }
    }
    expect(Array.from(a.positions).every(Number.isFinite)).toBe(true);
    expect(Array.from(a.normals).every(Number.isFinite)).toBe(true);
    expect(a.positions).toEqual(terrain.generate(-1, -2, cells).positions);
  });

  it.each([[64, 8], [64, 16], [16, 8]] as const)('closes mixed LOD edges (%i / %i) without skirts', (fine, coarse) => {
    const terrain = new TerrainGenerator('CLOUD-ROAD-001');
    const a = terrain.generate(-1, 0, fine);
    const b = terrain.generate(0, 0, coarse);
    for (let z = 0; z <= 256; z += 4) {
      const edge = (data: typeof a, x: number) => {
        for (let i = 0; i < data.positions.length; i += 3) if (data.positions[i] === x && data.positions[i + 2] === z) return i;
        throw new Error('Missing shared edge vertex');
      };
      const ai = edge(a, 256), bi = edge(b, 0);
      expect(a.positions[ai + 1]).toBe(b.positions[bi + 1]);
      expect(a.normals.slice(ai, ai + 3)).toEqual(b.normals.slice(bi, bi + 3));
    }
  });

  it.each([8, 16, 64] as const)('uses only common boundary vertices in LOD %i triangle topology', (cells) => {
    const { coordinates, indices } = createTerrainLayout(cells);
    const edges = new Map<string, number>();
    let area = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = Array.from(indices.slice(i, i + 3), (index) => [coordinates[index * 2], coordinates[index * 2 + 1]]);
      const signedArea = ((b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1])) / 2;
      expect(signedArea).toBeGreaterThan(0);
      area += signedArea;
      for (let j = 0; j < 3; j++) {
        const a = indices[i + j], b = indices[i + (j + 1) % 3];
        const key = `${Math.min(a, b)},${Math.max(a, b)}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    expect(area).toBe(256 * 256);
    let boundaryEdges = 0;
    for (const [key, count] of edges) {
      expect(count).toBeLessThanOrEqual(2);
      if (count === 1) {
        boundaryEdges++;
        const [a, b] = key.split(',').map(Number);
        expect(Math.hypot(coordinates[a * 2] - coordinates[b * 2], coordinates[a * 2 + 1] - coordinates[b * 2 + 1])).toBe(4);
      }
    }
    expect(boundaryEdges).toBe(256);
  });
});
