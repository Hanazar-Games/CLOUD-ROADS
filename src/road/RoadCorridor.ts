import { roadFrame } from './RoadFrame';
import type { RoadSample } from './RoadSegment';
import { RoadIndex, type RoadEdge } from './RoadIndex';
import { CHUNK_SIZE } from '../world/ChunkPlanner';
import type { BridgeSpan } from '../bridge/BridgeDetector';
import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';
import { roadProfile } from './RoadProfile';
import type { TunnelSpan } from '../tunnel/TunnelDetector';
import { ServiceTerrain, type ServiceGround } from '../service/ServiceTerrain';

interface CorridorPoint { x: number; y: number; z: number; nx: number; ny: number; nz: number; ground: number; tunnel?: boolean; routeId?: string; distance?: number; halfWidth?: number }
export type CorridorEdge = RoadEdge<CorridorPoint>;
const RADIUS = 64;

export class RoadCorridor {
  private readonly index: RoadIndex;
  private readonly signatures = new Map<string, string>();
  readonly roadHalfWidth: number;
  private readonly bedHalfWidth: number;
  readonly services: ServiceTerrain;

  constructor(readonly edges: readonly CorridorEdge[], options: Readonly<WorldOptions> = DEFAULT_OPTIONS, services: readonly ServiceGround[] = []) {
    this.index = new RoadIndex(edges);
    this.roadHalfWidth = roadProfile(options).outerHalfWidth;
    this.bedHalfWidth = this.roadHalfWidth + 6.8;
    this.services = new ServiceTerrain(services);
  }

  static fromSamples(samples: readonly RoadSample[], bridges: readonly BridgeSpan[] = [], options: Readonly<WorldOptions> = DEFAULT_OPTIONS,
    tunnels: readonly TunnelSpan[] = [], services: readonly ServiceGround[] = []): RoadCorridor {
    let bridgeIndex = 0;
    const points = samples.map((sample) => {
      const { normal } = roadFrame(sample);
      while (bridgeIndex < bridges.length && bridges[bridgeIndex].end.distance < sample.distance) bridgeIndex++;
      const span = bridges[bridgeIndex];
      const elevated = span && (sample.distance > span.start.distance || span.openStart)
        && (sample.distance < span.end.distance || span.openEnd);
      return { ...sample.position, routeId: sample.routeId, distance: sample.distance, nx: normal.x, ny: normal.y, nz: normal.z, ground: elevated ? 0 : 1,
        tunnel: tunnels.some(span => sample.distance >= span.start.distance && sample.distance <= span.end.distance) };
    });
    return new RoadCorridor(points.slice(1).map((b, i) => ({ a: points[i], b })), options, services);
  }

  forChunk(cx: number, cz: number, margin = RADIUS + 4): CorridorEdge[] {
    return this.index.within(cx * CHUNK_SIZE - margin, cz * CHUNK_SIZE - margin,
      (cx + 1) * CHUNK_SIZE + margin, (cz + 1) * CHUNK_SIZE + margin).map((i) => this.edges[i]);
  }

  needsDetail(cx: number, cz: number): boolean { return this.forChunk(cx, cz, this.bedHalfWidth + 24).length > 0 || this.services.forChunk(cx, cz).length > 0; }

  signature(cx: number, cz: number): string {
    const key = `${cx},${cz}`;
    let value = this.signatures.get(key);
    if (value === undefined) {
      value = JSON.stringify([this.forChunk(cx, cz).map(edge => JSON.stringify(edge)).sort(),
        this.services.forChunk(cx, cz).map(site => JSON.stringify(site)).sort()]);
      this.signatures.set(key, value);
      if (this.signatures.size > 2048) this.signatures.delete(this.signatures.keys().next().value!);
    }
    return value;
  }

  serviceCover(x: number, z: number): boolean { return this.services.contains(x, z); }

  distance(x: number, z: number, radius: number): number {
    const nearest = this.index.nearest(x, z, radius);
    return nearest ? Math.sqrt(nearest.distanceSquared) : Infinity;
  }

  crossesBelow(sample: RoadSample, radius: number): boolean {
    const { x, y, z } = sample.position;
    for (const index of this.index.within(x - radius, z - radius, x + radius, z + radius)) {
      const { a, b } = this.edges[index], dx = b.x - a.x, dz = b.z - a.z;
      if (a.routeId === sample.routeId && Math.abs((a.distance ?? sample.distance) - sample.distance) < 80) continue;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      if (y - (a.y + (b.y - a.y) * t) > 6 && Math.hypot(x - a.x - dx * t, z - a.z - dz * t) < radius) return true;
    }
    return false;
  }

  tunnelCover(x: number, z: number): boolean {
    const nearest = this.index.nearest(x, z, this.roadHalfWidth + 130);
    return !!nearest && !!(this.edges[nearest.index].a.tunnel || this.edges[nearest.index].b.tunnel);
  }

  height(x: number, z: number, natural: number): number {
    let nearest = this.index.nearest(x, z, RADIUS);
    if (!nearest) return Math.min(natural + 5, this.services.height(x, z, natural, Infinity, this.roadHalfWidth));
    const selected = this.edges[nearest.index];
    if (selected.a.ground < 0.5 && nearest.distanceSquared < this.bedHalfWidth ** 2) {
      let lowest = selected.a.y + (selected.b.y - selected.a.y) * nearest.t;
      for (const index of this.index.within(x - this.bedHalfWidth, z - this.bedHalfWidth, x + this.bedHalfWidth, z + this.bedHalfWidth)) {
        const { a, b } = this.edges[index];
        if (a.routeId === selected.a.routeId) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
        const distanceSquared = (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2, height = a.y + (b.y - a.y) * t;
        if (height < lowest && distanceSquared < this.bedHalfWidth ** 2) { nearest = { index, t, distanceSquared }; lowest = height; }
      }
    }
    const { index, t, distanceSquared } = nearest, { a, b } = this.edges[index];
    const roadHalfWidth = a.halfWidth ?? this.roadHalfWidth, bedHalfWidth = roadHalfWidth + 6.8;
    const px = a.x + (b.x - a.x) * t, pz = a.z + (b.z - a.z) * t;
    const nx = a.nx + (b.nx - a.nx) * t, ny = a.ny + (b.ny - a.ny) * t, nz = a.nz + (b.nz - a.nz) * t;
    const surface = a.y + (b.y - a.y) * t - (nx * (x - px) + nz * (z - pz)) / ny - 0.08;
    const width = Math.min(RADIUS, bedHalfWidth + 18 + Math.min(12, Math.abs(natural - surface) * 0.65));
    const blend = Math.max(0, Math.min(1, (Math.sqrt(distanceSquared) - bedHalfWidth) / (width - bedHalfWidth)));
    const ground = a.ground + (b.ground - a.ground) * t;
    const bed = surface - (1 - ground) * 3.2;
    const height = natural + Math.min(5, bed - natural) * (1 - blend * blend * (3 - 2 * blend)) * (natural > bed ? 1 : ground);
    return Math.min(natural + 5, this.services.height(x, z, height, Math.sqrt(distanceSquared), this.roadHalfWidth));
  }
}
