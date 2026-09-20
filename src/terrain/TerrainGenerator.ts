import { CHUNK_SIZE, type TerrainCells } from '../world/ChunkPlanner';
import { HeightFunction } from './HeightFunction';
import { createTerrainLayout } from './TerrainTopology';
import { RoadCorridor, type CorridorEdge } from '../road/RoadCorridor';
import { BiomeSystem, createBiomeSample } from '../biome/BiomeSystem';
import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';
import { generateVegetation } from '../vegetation/VegetationGenerator';
import type { ServiceGround } from '../service/ServiceTerrain';

export interface TerrainData {
  positions: Float32Array<ArrayBuffer>;
  normals: Float32Array<ArrayBuffer>;
  colors: Float32Array<ArrayBuffer>;
  vegetation: Float32Array<ArrayBuffer>;
}

const layouts = { 8: createTerrainLayout(8), 16: createTerrainLayout(16), 64: createTerrainLayout(64) };

export class TerrainGenerator {
  readonly height: HeightFunction;
  private readonly biomes: BiomeSystem;

  constructor(private readonly seed: string, private readonly options: Readonly<WorldOptions> = DEFAULT_OPTIONS) {
    this.height = new HeightFunction(seed, options.terrain, options.roadType);
    this.biomes = new BiomeSystem(seed, options.terrain);
  }

  generate(cx: number, cz: number, cells: TerrainCells, road: readonly CorridorEdge[] = [], services: readonly ServiceGround[] = []): TerrainData {
    const coordinates = layouts[cells].coordinates;
    const length = coordinates.length / 2 * 3;
    const positions = new Float32Array(length);
    const normals = new Float32Array(length);
    const colors = new Float32Array(length);
    const corridor = new RoadCorridor(road, this.options, services);
    const biome = createBiomeSample();
    const height = (x: number, z: number) => corridor.height(x, z, this.height.sample(x, z));
    for (let i = 0; i < coordinates.length / 2; i++) {
      const x = cx * CHUNK_SIZE + coordinates[i * 2];
      const z = cz * CHUNK_SIZE + coordinates[i * 2 + 1];
      const y = height(x, z);
      const nx = height(x - 2, z) - height(x + 2, z);
      const nz = height(x, z - 2) - height(x, z + 2);
      const magnitude = Math.hypot(nx, 4, nz);
      const offset = i * 3;
      positions[offset] = coordinates[i * 2];
      positions[offset + 1] = y;
      positions[offset + 2] = coordinates[i * 2 + 1];
      normals[offset] = nx / magnitude;
      normals[offset + 1] = 4 / magnitude;
      normals[offset + 2] = nz / magnitude;
      this.biomes.sample(x, z, y, 4 / magnitude, biome);
      colors.set(biome.color, offset);
    }
    return { positions, normals, colors, vegetation: generateVegetation(this.seed, cx, cz, cells, positions, corridor, this.biomes) };
  }
}
