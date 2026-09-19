import { MeshStandardMaterial, Raycaster, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { DEFAULT_OPTIONS } from '../src/world/WorldOptions';
import { VegetationMesh } from '../src/vegetation/VegetationMesh';
import { TerrainChunk } from '../src/terrain/TerrainChunk';

describe('streamed vegetation', () => {
  it('keeps plants out of the restored mountain cover around tunnels', () => {
    const generator = new TerrainGenerator('plants', { ...DEFAULT_OPTIONS, terrain: 'forest' });
    const point = { x: 128, y: 800, z: -256, nx: 0, ny: 1, nz: 0, ground: 1, tunnel: true };
    const data = generator.generate(0, 0, 64, [{ a: point, b: { ...point, z: 512 } }]);
    expect(data.vegetation).toHaveLength(0);
  });
  it.each(['forest', 'desert', 'dunes'] as const)('plants deterministic %s vegetation on rendered terrain and outside the road', (terrain) => {
    const options = { ...DEFAULT_OPTIONS, terrain, roadType: 'highway' as const, roadWidth: 10 };
    const generator = new TerrainGenerator('plants', options);
    const road = [{ a: { x: 128, y: 800, z: -256, nx: 0, ny: 1, nz: 0, ground: 1 },
      b: { x: 128, y: 800, z: 512, nx: 0, ny: 1, nz: 0, ground: 1 } }];
    const a = generator.generate(0, 0, 64, road);
    const b = generator.generate(0, 0, 64, road);
    expect(a.vegetation).toEqual(b.vegetation);
    expect(a.vegetation.length).toBeGreaterThan(0);
    for (let i = 0; i < a.vegetation.length; i += 7) {
      const [x, y, z, scale, angle, kind, tint] = a.vegetation.slice(i, i + 7);
      expect([x, y, z, scale, angle, kind, tint].every(Number.isFinite)).toBe(true);
      const crownRadius = (kind >= 3 ? 1.7 : kind === 1 ? 2 : 4.7) * scale;
      expect(Math.abs(x - 128) - crownRadius).toBeGreaterThan(14.4);
      expect(x).toBeGreaterThan(0); expect(x).toBeLessThan(256);
      expect(z).toBeGreaterThan(0); expect(z).toBeLessThan(256);
      expect(terrain === 'forest' ? [0, 2, 3] : [1, 4]).toContain(kind);
    }
    expect(generator.generate(0, 0, 8, road).vegetation.length).toBe(0);
    expect(new TerrainGenerator('other', options).generate(0, 0, 64, road).vegetation).not.toEqual(a.vegetation);
  });

  it('mixes broadleaf crowns and undergrowth in forest and dry shrubs in arid land', () => {
    for (const terrain of ['forest', 'desert'] as const) {
      const generator = new TerrainGenerator('plants', { ...DEFAULT_OPTIONS, terrain }), species = new Set<number>();
      for (let z = -1; z <= 1; z++) for (let x = -1; x <= 1; x++) {
        const data = generator.generate(x, z, 16).vegetation;
        for (let i = 5; i < data.length; i += 7) species.add(data[i]);
      }
      for (const kind of terrain === 'forest' ? [0, 2, 3] : [1, 4]) expect(species.has(kind)).toBe(true);
    }
  });

  it('batches plants, hides removed chunks, rebases and releases GPU resources', () => {
    const scene = new Scene(), mesh = new VegetationMesh(scene);
    const data = new Float32Array([10, 100, 20, 1, 0, 0, 0.8, 40, 100, 50, 1, 0, 1, 1]);
    mesh.setChunk('0,0', 0, 0, data);
    mesh.update(0, 0);
    expect(mesh.count).toBe(2);
    expect(scene.children.length).toBeLessThanOrEqual(4);
    const before = mesh.trees.instanceMatrix.array.slice();
    mesh.update(5120, -5120);
    expect(mesh.trees.instanceMatrix.array).toEqual(before);
    expect(mesh.trees.position.x).toBe(-5120);
    mesh.removeChunk('0,0');
    mesh.update(5120, -5120);
    expect(mesh.count).toBe(0);
    expect(scene.children.every(child => !child.visible)).toBe(true);
    mesh.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it.each([16, 64] as const)('roots plants in the actual LOD %i terrain triangles', cells => {
    const generator = new TerrainGenerator('plants', { ...DEFAULT_OPTIONS, terrain: 'forest' });
    const data = generator.generate(-1, 0, cells);
    const material = new MeshStandardMaterial(), chunk = new TerrainChunk(cells, material);
    chunk.apply({ x: -1, z: 0, key: '-1,0', cells }, data, 0, 0);
    chunk.mesh.updateMatrixWorld(true);
    const ray = new Raycaster();
    expect(data.vegetation.length).toBeGreaterThan(0);
    for (let i = 0; i < data.vegetation.length; i += 7) {
      const [x, y, z] = data.vegetation.slice(i, i + 3);
      ray.set(new Vector3(x - 256, y + 50, z), new Vector3(0, -1, 0));
      const hit = ray.intersectObject(chunk.mesh)[0];
      expect(hit).toBeDefined();
      expect(hit.point.y - y).toBeCloseTo(0.15, 3);
    }
    chunk.dispose(); material.dispose();
  });
});
