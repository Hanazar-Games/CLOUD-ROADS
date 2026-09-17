import { roadFrame } from './RoadFrame';
import type { RoadSample } from './RoadSegment';
import { RoadIndex, type RoadEdge } from './RoadIndex';
import { CHUNK_SIZE } from '../world/ChunkPlanner';

interface CorridorPoint { x: number; y: number; z: number; nx: number; ny: number; nz: number }
export type CorridorEdge = RoadEdge<CorridorPoint>;
const RADIUS = 160;

export class RoadCorridor {
  private readonly index: RoadIndex;

  constructor(readonly edges: readonly CorridorEdge[]) { this.index = new RoadIndex(edges); }

  static fromSamples(samples: readonly RoadSample[]): RoadCorridor {
    const points = samples.map((sample) => {
      const { normal } = roadFrame(sample);
      return { ...sample.position, nx: normal.x, ny: normal.y, nz: normal.z };
    });
    return new RoadCorridor(points.slice(1).map((b, i) => ({ a: points[i], b })));
  }

  forChunk(cx: number, cz: number, margin = RADIUS + 4): CorridorEdge[] {
    return this.index.within(cx * CHUNK_SIZE - margin, cz * CHUNK_SIZE - margin,
      (cx + 1) * CHUNK_SIZE + margin, (cz + 1) * CHUNK_SIZE + margin).map((i) => this.edges[i]);
  }

  needsDetail(cx: number, cz: number): boolean { return this.forChunk(cx, cz, 36).length > 0; }

  height(x: number, z: number, natural: number): number {
    const nearest = this.index.nearest(x, z, RADIUS);
    if (!nearest) return natural;
    const { index, t, distanceSquared } = nearest, { a, b } = this.edges[index];
    const px = a.x + (b.x - a.x) * t, pz = a.z + (b.z - a.z) * t;
    const nx = a.nx + (b.nx - a.nx) * t, ny = a.ny + (b.ny - a.ny) * t, nz = a.nz + (b.nz - a.nz) * t;
    const surface = a.y + (b.y - a.y) * t - (nx * (x - px) + nz * (z - pz)) / ny - 0.08;
    const width = Math.min(RADIUS, 30 + Math.abs(natural - surface) * 0.65);
    const blend = Math.max(0, Math.min(1, (Math.sqrt(distanceSquared) - 12) / (width - 12)));
    return surface + (natural - surface) * blend * blend * (3 - 2 * blend);
  }
}
