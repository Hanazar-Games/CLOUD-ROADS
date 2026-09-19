import { roadFrame } from './RoadFrame';
import type { RoadSample } from './RoadSegment';
import { RoadIndex, type RoadEdge } from './RoadIndex';
import { CHUNK_SIZE } from '../world/ChunkPlanner';
import { BRIDGE_APPROACH, type BridgeSpan } from '../bridge/BridgeDetector';
import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';
import { roadProfile } from './RoadProfile';
import type { TunnelSpan } from '../tunnel/TunnelDetector';

interface CorridorPoint { x: number; y: number; z: number; nx: number; ny: number; nz: number; ground: number; tunnel?: boolean }
export type CorridorEdge = RoadEdge<CorridorPoint>;
const RADIUS = 160;

export class RoadCorridor {
  private readonly index: RoadIndex;
  readonly roadHalfWidth: number;
  private readonly bedHalfWidth: number;

  constructor(readonly edges: readonly CorridorEdge[], options: Readonly<WorldOptions> = DEFAULT_OPTIONS) {
    this.index = new RoadIndex(edges);
    this.roadHalfWidth = roadProfile(options).outerHalfWidth;
    this.bedHalfWidth = this.roadHalfWidth + 6.8;
  }

  static fromSamples(samples: readonly RoadSample[], bridges: readonly BridgeSpan[] = [], options: Readonly<WorldOptions> = DEFAULT_OPTIONS,
    tunnels: readonly TunnelSpan[] = []): RoadCorridor {
    let bridgeIndex = 0;
    const points = samples.map((sample) => {
      const { normal } = roadFrame(sample);
      while (bridgeIndex < bridges.length && bridges[bridgeIndex].end.distance < sample.distance) bridgeIndex++;
      const span = bridges[bridgeIndex];
      const t = span ? Math.max(0, Math.min(1, (sample.distance - span.start.distance) / BRIDGE_APPROACH, (span.end.distance - sample.distance) / BRIDGE_APPROACH)) : 0;
      return { ...sample.position, nx: normal.x, ny: normal.y, nz: normal.z, ground: 1 - t * t * (3 - 2 * t),
        tunnel: tunnels.some(span => sample.distance >= span.start.distance && sample.distance <= span.end.distance) };
    });
    return new RoadCorridor(points.slice(1).map((b, i) => ({ a: points[i], b })), options);
  }

  forChunk(cx: number, cz: number, margin = RADIUS + 4): CorridorEdge[] {
    return this.index.within(cx * CHUNK_SIZE - margin, cz * CHUNK_SIZE - margin,
      (cx + 1) * CHUNK_SIZE + margin, (cz + 1) * CHUNK_SIZE + margin).map((i) => this.edges[i]);
  }

  needsDetail(cx: number, cz: number): boolean { return this.forChunk(cx, cz, this.bedHalfWidth + 24).length > 0; }

  distance(x: number, z: number, radius: number): number {
    const nearest = this.index.nearest(x, z, radius);
    return nearest ? Math.sqrt(nearest.distanceSquared) : Infinity;
  }

  tunnelCover(x: number, z: number): boolean {
    const nearest = this.index.nearest(x, z, this.roadHalfWidth + 130);
    return !!nearest && !!(this.edges[nearest.index].a.tunnel || this.edges[nearest.index].b.tunnel);
  }

  height(x: number, z: number, natural: number): number {
    const nearest = this.index.nearest(x, z, RADIUS);
    if (!nearest) return natural;
    const { index, t, distanceSquared } = nearest, { a, b } = this.edges[index];
    const px = a.x + (b.x - a.x) * t, pz = a.z + (b.z - a.z) * t;
    const nx = a.nx + (b.nx - a.nx) * t, ny = a.ny + (b.ny - a.ny) * t, nz = a.nz + (b.nz - a.nz) * t;
    const surface = a.y + (b.y - a.y) * t - (nx * (x - px) + nz * (z - pz)) / ny - 0.08;
    const width = Math.min(RADIUS, this.bedHalfWidth + 18 + Math.abs(natural - surface) * 0.65);
    const blend = Math.max(0, Math.min(1, (Math.sqrt(distanceSquared) - this.bedHalfWidth) / (width - this.bedHalfWidth)));
    const ground = a.ground + (b.ground - a.ground) * t;
    return natural + (surface - natural) * (1 - blend * blend * (3 - 2 * blend)) * ground;
  }
}
