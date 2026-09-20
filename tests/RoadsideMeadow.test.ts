import { Scene } from 'three';
import { expect, it } from 'vitest';
import { createTerrainLayout } from '../src/terrain/TerrainTopology';
import { BiomeSystem } from '../src/biome/BiomeSystem';
import { RoadCorridor } from '../src/road/RoadCorridor';
import { generateVegetation } from '../src/vegetation/VegetationGenerator';
import { VegetationMesh } from '../src/vegetation/VegetationMesh';

it('grows deterministic dense grass and wildflowers beside the road, rooted in the terrain', () => {
  const coordinates = createTerrainLayout(64).coordinates, positions = new Float32Array(coordinates.length / 2 * 3);
  for (let i = 0; i < coordinates.length / 2; i++) positions.set([coordinates[i * 2], 900, coordinates[i * 2 + 1]], i * 3);
  const a = { x: 128, y: 900, z: -256, nx: 0, ny: 1, nz: 0, ground: 1 }, b = { ...a, z: 512 };
  const corridor = new RoadCorridor([{ a, b }]), biomes = new BiomeSystem('meadow', 'forest');
  const plants = generateVegetation('meadow', 0, 0, 64, positions, corridor, biomes);
  expect(generateVegetation('meadow', 0, 0, 64, positions, corridor, biomes)).toEqual(plants);
  const kinds: number[] = [];
  for (let i = 0; i < plants.length; i += 7) if (plants[i + 5] >= 7) {
    kinds.push(plants[i + 5]);
    expect(Math.abs(plants[i] - 128)).toBeGreaterThan(corridor.roadHalfWidth + 2);
    expect(Math.abs(plants[i] - 128)).toBeLessThan(42);
    expect(plants[i + 1]).toBeCloseTo(899.96, 3);
  }
  expect(kinds.filter(kind => kind === 7).length).toBeGreaterThan(100);
  expect(kinds.filter(kind => kind === 8).length).toBeGreaterThan(15);
  const desert = generateVegetation('meadow', 0, 0, 64, positions, corridor, new BiomeSystem('meadow', 'desert'));
  for (let i = 5; i < desert.length; i += 7) expect(desert[i]).toBeLessThan(7);
  const tunnel = new RoadCorridor([{ a: { ...a, tunnel: true }, b: { ...b, tunnel: true } }]);
  expect(generateVegetation('meadow', 0, 0, 64, positions, tunnel, biomes)).toHaveLength(0);
});

it('streams flower details near the player, releases them farther away and restores them after a rebase', () => {
  const mesh = new VegetationMesh(new Scene());
  const plants = new Float32Array([10, 899.96, 20, 1, 0, 7, 1, 20, 899.96, 20, 1, 0, 8, 1]);
  mesh.setChunk('0,0', 0, 0, plants); mesh.update(0, 0); expect(mesh.count).toBe(2);
  mesh.setViewCenter(3, 0); mesh.update(0, 0); expect(mesh.count).toBe(0);
  mesh.setViewCenter(0, 0); mesh.update(5120, -5120); expect(mesh.count).toBe(2);
  mesh.removeChunk('0,0'); mesh.update(5120, -5120); expect(mesh.count).toBe(0); mesh.dispose();
});
