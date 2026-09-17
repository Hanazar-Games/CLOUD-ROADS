import { CHUNK_SIZE, type TerrainCells } from '../world/ChunkPlanner';
import { HeightFunction } from './HeightFunction';
import { createTerrainLayout } from './TerrainTopology';
import { RoadCorridor, type CorridorPoint } from '../road/RoadCorridor';

export interface TerrainData {
  positions: Float32Array<ArrayBuffer>;
  normals: Float32Array<ArrayBuffer>;
  colors: Float32Array<ArrayBuffer>;
}

const layouts = { 8: createTerrainLayout(8), 16: createTerrainLayout(16), 64: createTerrainLayout(64) };

export class TerrainGenerator {
  readonly height: HeightFunction;

  constructor(seed: string) { this.height = new HeightFunction(seed); }

  generate(cx: number, cz: number, cells: TerrainCells, road: readonly CorridorPoint[] = []): TerrainData {
    const coordinates = layouts[cells].coordinates;
    const length = coordinates.length / 2 * 3;
    const positions = new Float32Array(length);
    const normals = new Float32Array(length);
    const colors = new Float32Array(length);
    const corridor = new RoadCorridor(road);
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
      const rock = Math.min(1, Math.max(0, (1 - 4 / magnitude) * 1.8 + (y - 1900) / 1800));
      const high = Math.min(1, Math.max(0, (y - 3100) / 750));
      colors[offset] = (0.105 + rock * 0.18) * (1 - high) + 0.66 * high;
      colors[offset + 1] = (0.17 + rock * 0.12) * (1 - high) + 0.71 * high;
      colors[offset + 2] = (0.115 + rock * 0.16) * (1 - high) + 0.72 * high;
    }
    return { positions, normals, colors };
  }
}
