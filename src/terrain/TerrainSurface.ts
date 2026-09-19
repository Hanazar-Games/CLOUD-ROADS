import { CHUNK_SIZE, type TerrainCells } from '../world/ChunkPlanner';
import { createTerrainLayout } from './TerrainTopology';

const borders = new Map<TerrainCells, { indices: Uint16Array; buckets: number[][] }>();

export class TerrainSurface {
  private readonly step;
  private readonly border;

  constructor(private readonly cells: TerrainCells, private readonly positions: Float32Array) {
    this.step = CHUNK_SIZE / cells;
    if (cells === 64) return;
    if (!borders.has(cells)) {
      const { coordinates, indices } = createTerrainLayout(cells), buckets: number[][] = Array.from({ length: cells * cells }, () => []);
      for (let i = 0; i < indices.length; i += 3) {
        const xs = [0, 1, 2].map(j => coordinates[indices[i + j] * 2]), zs = [0, 1, 2].map(j => coordinates[indices[i + j] * 2 + 1]);
        for (let z = Math.floor(Math.min(...zs) / this.step); z <= Math.min(cells - 1, Math.floor((Math.max(...zs) - 1e-6) / this.step)); z++) {
          for (let x = Math.floor(Math.min(...xs) / this.step); x <= Math.min(cells - 1, Math.floor((Math.max(...xs) - 1e-6) / this.step)); x++) buckets[z * cells + x].push(i);
        }
      }
      borders.set(cells, { indices, buckets });
    }
    this.border = borders.get(cells)!;
  }

  sample(x: number, z: number): { height: number; normalY: number } {
    const gx = Math.min(this.cells - 1, Math.floor(x / this.step)), gz = Math.min(this.cells - 1, Math.floor(z / this.step));
    const p = this.positions;
    if (!this.border || (gx > 0 && gz > 0 && gx < this.cells - 1 && gz < this.cells - 1)) {
      const tx = x / this.step - gx, tz = z / this.step - gz;
      const at = (dx: number, dz: number) => p[((gz + dz) * (this.cells + 1) + gx + dx) * 3 + 1];
      const a = at(0, 0), b = at(1, 0), c = at(0, 1), d = at(1, 1);
      return { height: tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz : d + (c - d) * (1 - tx) + (b - d) * (1 - tz),
        normalY: this.step / Math.hypot(this.step, tx + tz <= 1 ? b - a : d - c, tx + tz <= 1 ? c - a : d - b) };
    }
    for (const triangle of this.border.buckets[gz * this.cells + gx]) {
      const [a, b, c] = [0, 1, 2].map(i => this.border!.indices[triangle + i] * 3);
      const bx = p[b] - p[a], bz = p[b + 2] - p[a + 2], cx = p[c] - p[a], cz = p[c + 2] - p[a + 2];
      const det = bx * cz - cx * bz, dx = x - p[a], dz = z - p[a + 2];
      const u = (dx * cz - cx * dz) / det, v = (bx * dz - dx * bz) / det;
      if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
      const by = p[b + 1] - p[a + 1], cy = p[c + 1] - p[a + 1];
      return { height: p[a + 1] + by * u + cy * v, normalY: 1 / Math.hypot(1, (by * cz - cy * bz) / det, (bx * cy - cx * by) / det) };
    }
    throw new Error('Vegetation sample lies outside terrain topology');
  }
}
