import { createRng, hashSeed } from '../world/WorldSeed';
import { CHUNK_SIZE, type TerrainCells } from '../world/ChunkPlanner';
import { createBiomeSample, type BiomeSystem } from '../biome/BiomeSystem';
import type { RoadCorridor } from '../road/RoadCorridor';

// Each plant stores local x/y/z, scale, rotation, species and tint.
export function generateVegetation(seed: string, cx: number, cz: number, cells: TerrainCells,
  positions: Float32Array, corridor: RoadCorridor, biomes: BiomeSystem): Float32Array<ArrayBuffer> {
  if (cells === 8) return new Float32Array();
  const rng = createRng(hashSeed(`${seed}:plants:${cx}:${cz}`));
  const plants: number[] = [], step = CHUNK_SIZE / cells, biome = createBiomeSample();
  for (let row = 0; row < 14; row++) for (let col = 0; col < 14; col++) {
    const x = 16 + (col + 0.2 + rng() * 0.6) * 16, z = 16 + (row + 0.2 + rng() * 0.6) * 16;
    const chance = rng(), scale = 0.7 + rng() * 0.65, rotation = rng() * Math.PI * 2, tint = 0.75 + rng() * 0.35;
    const gx = Math.floor(x / step), gz = Math.floor(z / step), tx = x / step - gx, tz = z / step - gz;
    const at = (dx: number, dz: number) => positions[((gz + dz) * (cells + 1) + gx + dx) * 3 + 1];
    const a = at(0, 0), b = at(1, 0), c = at(0, 1), d = at(1, 1);
    const y = tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
    const normalY = step / Math.hypot(step, tx + tz <= 1 ? b - a : d - c, tx + tz <= 1 ? c - a : d - b);
    if (normalY < 0.82) continue;
    const wx = cx * CHUNK_SIZE + x, wz = cz * CHUNK_SIZE + z;
    biomes.sample(wx, wz, y, normalY, biome);
    const desert = biome.weights.desert > 0.5;
    const density = desert ? 0.16 : (biome.weights.forest * 0.85 + biome.weights.valley * 0.5) * (0.6 + biome.humidity * 0.4);
    if (chance > density || corridor.distance(wx, wz, corridor.roadHalfWidth + 10) < corridor.roadHalfWidth + 8 || corridor.tunnelCover(wx, wz)) continue;
    plants.push(x, y - 0.15, z, scale, rotation, desert ? 1 : 0, tint);
  }
  return new Float32Array(plants);
}
