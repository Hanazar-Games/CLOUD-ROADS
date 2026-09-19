import { createRng, hashSeed } from '../world/WorldSeed';
import { CHUNK_SIZE, type TerrainCells } from '../world/ChunkPlanner';
import { createBiomeSample, type BiomeSystem } from '../biome/BiomeSystem';
import type { RoadCorridor } from '../road/RoadCorridor';
import { Noise } from '../terrain/Noise';
import { TerrainSurface } from '../terrain/TerrainSurface';
import { distantPlant, PLANT_GRID, PLANT_SPACING } from './VegetationConfig';

// Local x/y/z, scale, rotation, species, tint; randomness precedes LOD filtering.
export function generateVegetation(seed: string, cx: number, cz: number, cells: TerrainCells,
  positions: Float32Array, corridor: RoadCorridor, biomes: BiomeSystem): Float32Array<ArrayBuffer> {
  const rng = createRng(hashSeed(`${seed}:plants:${cx}:${cz}`)), groves = new Noise(hashSeed(`${seed}:groves`));
  const plants: number[] = [], biome = createBiomeSample(), surface = new TerrainSurface(cells, positions);
  const clear = (x: number, z: number, radius: number) => corridor.distance(x, z, corridor.roadHalfWidth + radius + 2) >= corridor.roadHalfWidth + radius + 2
    && !corridor.tunnelCover(x, z) && !corridor.serviceCover(x, z);
  for (let layer = 0; layer < (cells === 8 ? 1 : 2); layer++) {
    for (let row = 0; row < PLANT_GRID; row++) for (let col = 0; col < PLANT_GRID; col++) {
      const x = (col + 0.12 + rng() * 0.76) * PLANT_SPACING, z = (row + 0.12 + rng() * 0.76) * PLANT_SPACING;
      const chance = rng(), size = rng(), rotation = rng() * Math.PI * 2, tint = 0.83 + rng() * 0.3, species = rng();
      const wx = cx * CHUNK_SIZE + x, wz = cz * CHUNK_SIZE + z;
      if (cells === 8 && !distantPlant(wx, wz)) continue;
      const { height, normalY } = surface.sample(x, z);
      if (normalY < 0.48) continue;
      biomes.sample(wx, wz, height, normalY, biome);
      const w = biome.weights, desert = w.desert > 0.45;
      const grove = Math.max(0.18, Math.min(1.3, 0.72 + groves.sample(wx / 210, wz / 210) * 0.65 + groves.sample(wx / 65, wz / 65) * 0.22));
      const habitat = w.forest + w.valley;
      let kind: number, scale: number, radius: number;
      if (layer === 0) {
        const density = desert ? 0.11 * grove : (w.forest * 0.95 + w.valley * 0.65) * grove;
        if (chance < density && normalY > 0.76 && w.snow < 0.2) {
          kind = desert ? 1 : height < 1700 && species > 0.5 ? 2 : 0;
          scale = desert ? 0.65 + size * 0.8 : 0.55 + size ** 0.7 * 0.95;
          radius = (kind === 1 ? 2 : 4.7) * scale;
        } else if (cells !== 8 && chance < 0.06 + w.rock * 0.4 + w.alpine * 0.18 && w.snow < 0.6) {
          kind = 5; scale = 0.5 + size * 1.1; radius = 2.1 * scale;
        } else continue;
      } else {
        const cover = desert ? 0.24 * grove : (habitat * 0.85 + w.alpine * 0.28 + w.rock * 0.12) * grove;
        if (chance > cover || w.snow > 0.3 || normalY < 0.64) continue;
        kind = desert ? 4 : species < 0.3 ? 3 : 6;
        scale = kind === 6 ? 0.65 + size * 0.85 : 0.45 + size * 0.8;
        radius = (kind === 6 ? 0.9 : 1.7) * scale;
      }
      if (!clear(wx, wz, radius)) continue;
      plants.push(x, height - 0.15, z, scale, rotation, kind, tint);
    }
  }
  return new Float32Array(plants);
}
