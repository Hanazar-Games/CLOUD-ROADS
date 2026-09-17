import { describe, expect, it } from 'vitest';
import { planChunks, CHUNK_SIZE } from '../src/world/ChunkPlanner';
import { FloatingOrigin } from '../src/world/FloatingOrigin';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';

describe('WorldSimulationTest', () => {
  it('keeps bounded LOD rings, prioritizes the current chunk and covers negative positions', () => {
    const plan = planChunks(-1, -257, { x: 0, z: -1 });
    expect(plan).toHaveLength(289);
    expect(new Set(plan.map((chunk) => chunk.key)).size).toBe(289);
    expect(plan[0]).toMatchObject({ x: -1, z: -2, cells: 64 });
    expect(plan.filter((chunk) => chunk.cells === 64)).toHaveLength(25);
    expect(plan.filter((chunk) => chunk.cells === 16)).toHaveLength(56);
    expect(plan.filter((chunk) => chunk.cells === 8)).toHaveLength(208);
    expect(plan.findIndex((chunk) => chunk.x === -1 && chunk.z === -3)).toBeLessThan(plan.findIndex((chunk) => chunk.x === -1 && chunk.z === -1));
  });

  it.each([10_000, 30_000, 100_000])('streams a %i m route with finite terrain and stable logical positions', (distance) => {
    const origin = new FloatingOrigin();
    const terrain = new TerrainGenerator('CLOUD-ROAD-001');
    let rebases = 0;
    let lastKey = '';
    for (let z = 0; z <= distance; z += CHUNK_SIZE) {
      const globalX = Math.sin(z / 6000) * 8000;
      const local = { x: globalX - origin.x, y: 2200, z: -z - origin.z };
      if (origin.rebase(local)) rebases++;
      expect(local.x + origin.x).toBeCloseTo(globalX, 7);
      expect(local.z + origin.z).toBeCloseTo(-z, 7);
      expect(Math.hypot(local.x, local.z)).toBeLessThanOrEqual(5000);
      expect(local.y).toBe(2200);
      const plan = planChunks(globalX, -z, { x: 0, z: -1 });
      expect(plan).toHaveLength(289);
      expect(plan[0].key).not.toBe(lastKey);
      lastKey = plan[0].key;
      const data = terrain.generate(plan[0].x, plan[0].z, 8);
      expect(Array.from(data.positions).every(Number.isFinite)).toBe(true);
    }
    expect(rebases).toBeGreaterThan(0);
  });

  it('keeps a sub-meter offset after a distant rebase and can reset', () => {
    const origin = new FloatingOrigin();
    const position = { x: -12_345_678.125, y: 1234.5, z: 98_765_432.75 };
    const before = { ...position };
    expect(origin.rebase(position)).toBe(true);
    expect(position.x + origin.x).toBe(before.x);
    expect(position.z + origin.z).toBe(before.z);
    expect(position.y).toBe(before.y);
    origin.reset();
    expect([origin.x, origin.z, origin.count]).toEqual([0, 0, 0]);
  });
});
