import { roadFrame } from './RoadFrame';
import type { RoadSample } from './RoadSegment';
import { CHUNK_SIZE } from '../world/ChunkPlanner';

export interface CorridorPoint { x: number; y: number; z: number; nx: number; ny: number; nz: number }
const RADIUS = 160;

export class RoadCorridor {
  // The forward-only road spine orders points by descending logical Z.
  constructor(readonly points: readonly CorridorPoint[]) {}

  static fromSamples(samples: readonly RoadSample[]): RoadCorridor {
    return new RoadCorridor(samples.map((sample) => {
      const { normal } = roadFrame(sample);
      return { ...sample.position, nx: normal.x, ny: normal.y, nz: normal.z };
    }));
  }

  private lowerBound(z: number): number {
    let low = 0, high = this.points.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.points[middle].z > z) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  forChunk(cx: number, cz: number, margin = RADIUS + 4): CorridorPoint[] {
    const minX = cx * CHUNK_SIZE - margin, maxX = (cx + 1) * CHUNK_SIZE + margin;
    const start = Math.max(0, this.lowerBound((cz + 1) * CHUNK_SIZE + margin) - 1);
    const end = Math.min(this.points.length, this.lowerBound(cz * CHUNK_SIZE - margin) + 1);
    if (end - start < 2) return [];
    let left = Infinity, right = -Infinity;
    for (let i = start; i < end; i++) { left = Math.min(left, this.points[i].x); right = Math.max(right, this.points[i].x); }
    return right >= minX && left <= maxX ? this.points.slice(start, end) : [];
  }

  needsDetail(cx: number, cz: number): boolean { return this.forChunk(cx, cz, 36).length > 0; }

  height(x: number, z: number, natural: number): number {
    if (this.points.length < 2) return natural;
    let best = RADIUS * RADIUS, surface = natural;
    const consider = (i: number) => {
      const a = this.points[i], b = this.points[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      const px = a.x + dx * t, pz = a.z + dz * t;
      const distance = (x - px) ** 2 + (z - pz) ** 2;
      if (distance >= best) return;
      best = distance;
      const nx = a.nx + (b.nx - a.nx) * t, ny = a.ny + (b.ny - a.ny) * t, nz = a.nz + (b.nz - a.nz) * t;
      surface = a.y + (b.y - a.y) * t - (nx * (x - px) + nz * (z - pz)) / ny - 0.08;
    };
    const middle = Math.max(0, Math.min(this.points.length - 2, this.lowerBound(z) - 1));
    consider(middle);
    for (let i = middle - 1; i >= 0 && this.points[i + 1].z - z <= Math.sqrt(best); i--) consider(i);
    for (let i = middle + 1; i < this.points.length - 1 && z - this.points[i].z <= Math.sqrt(best); i++) consider(i);
    if (best >= RADIUS * RADIUS) return natural;
    const width = Math.min(RADIUS, 30 + Math.abs(natural - surface) * 0.65);
    const t = Math.max(0, Math.min(1, (Math.sqrt(best) - 12) / (width - 12)));
    return surface + (natural - surface) * t * t * (3 - 2 * t);
  }
}
