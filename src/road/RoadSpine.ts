import { RoadGenerator, type RoadTerrain } from './RoadGenerator';
import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';
import { HeightFunction } from '../terrain/HeightFunction';
import { ROAD_SAMPLES, type RoadControlPoint, type RoadSample, type RoadSegment } from './RoadSegment';
import { RoadIndex } from './RoadIndex';

export const MAX_ROAD_SEGMENTS = 256;
export const ROAD_HALO = 4000;

export class RoadSpine {
  readonly generator: RoadGenerator;
  readonly segments: RoadSegment[] = [];
  version = 0;
  generated = 0;
  private sampleVersion = -1;
  private readonly sampleCache: RoadSample[] = [];
  private index = new RoadIndex([]);
  private readonly checkpoints = new Map<number, RoadControlPoint>();
  private resume: RoadControlPoint;
  private readonly terrain;
  openStart = false;
  readonly openings: { start: number; end: number; side: number }[] = [];

  constructor(private readonly seed: string, terrain: RoadTerrain | undefined = undefined, private readonly options: Readonly<WorldOptions> = DEFAULT_OPTIONS,
    private readonly origin?: RoadControlPoint, private readonly prefix: readonly RoadSegment[] = []) {
    this.terrain = terrain ?? new HeightFunction(seed, options.terrain, options.roadType);
    this.generator = new RoadGenerator(seed, this.terrain, options, origin);
    this.resume = this.generator.start;
    this.segments.push(...prefix);
  }

  coordinate(x: number, z: number): number {
    const start = this.generator.start;
    return start.position.z + (z - start.position.z) * Math.cos(start.heading) - (x - start.position.x) * Math.sin(start.heading);
  }

  get checkpointCount(): number { return this.checkpoints.size; }

  fork(): RoadSpine {
    const road = new RoadSpine(this.seed, this.terrain, this.options, this.origin, this.prefix);
    for (const [key, point] of this.checkpoints) road.checkpoints.set(key, point);
    return road;
  }

  private checkpoint(before: (point: RoadControlPoint) => boolean): RoadControlPoint {
    let best = this.generator.start;
    for (const point of this.checkpoints.values()) if (before(point) && point.distance > best.distance) best = point;
    return best;
  }

  private append(end: RoadControlPoint): void {
    const segment = this.generator.next({ ...end, elevated: undefined }), key = Math.floor(segment.end.distance / 2048);
    this.segments.push(segment); this.generated++; this.version++;
    if (Math.floor(end.distance / 2048) !== key && !this.checkpoints.has(key)) {
      if (this.checkpoints.size >= 64) this.checkpoints.delete(this.checkpoints.keys().next().value!);
      this.checkpoints.set(key, segment.end);
    }
    if (this.segments.length > MAX_ROAD_SEGMENTS) this.segments.shift();
  }

  get samples(): readonly RoadSample[] {
    if (this.sampleVersion !== this.version) {
      this.sampleVersion = this.version;
      this.sampleCache.length = 0;
      for (const segment of this.segments) {
        for (let i = 0; i < ROAD_SAMPLES; i++) this.sampleCache.push(segment.sample(i / ROAD_SAMPLES));
      }
      const last = this.segments.at(-1);
      if (last) this.sampleCache.push(last.sample(1));
      for (const point of this.sampleCache) {
        const opening = this.openings.filter(range => point.distance >= range.start && point.distance <= range.end);
        if (opening.length) point.opening = new Set(opening.map(range => range.side)).size > 1 ? 0 : opening[0].side;
      }
      this.index = new RoadIndex(this.sampleCache.slice(1).map((b, i) => ({ a: this.sampleCache[i].position, b: b.position })));
    }
    return this.sampleCache;
  }

  update(z: number, budget = 4, halo = ROAD_HALO): boolean {
    z = Math.min(z, this.generator.start.position.z);
    const first = this.segments[0]?.start, last = this.segments.at(-1)?.end;
    const q = (point: RoadControlPoint) => this.coordinate(point.position.x, point.position.z);
    const missingBehind = first && first.distance > 0 && q(first) < Math.min(this.generator.start.position.z, z + halo) - 0.001;
    if (!last || missingBehind || q(last) > z + halo) {
      const resume = this.checkpoint(point => q(point) >= z + halo);
      if (!last || missingBehind || resume.distance > last.distance) {
        this.segments.length = 0;
        this.resume = resume;
        if (resume === this.generator.start) this.segments.push(...this.prefix);
        this.version++;
      }
    }
    const deadline = performance.now() + 2;
    for (let i = 0; i < budget; i++) {
      const end = this.segments.at(-1)?.end ?? this.resume;
      if (q(end) <= z - halo) break;
      if (i > 0 && performance.now() >= deadline) break;
      this.append(end);
    }
    while (this.segments.length > 1 && q(this.segments[0].end) > z + halo) {
      this.segments.shift();
      this.version++;
    }
    return (this.segments.at(-1) ? q(this.segments.at(-1)!.end) : Infinity) <= z - halo;
  }

  nearest(x: number, z: number): RoadSample | undefined {
    if (!this.samples.length) return undefined;
    const nearest = this.index.nearest(x, z)!;
    const sample = this.segments[Math.floor(nearest.index / ROAD_SAMPLES)].sample((nearest.index % ROAD_SAMPLES + nearest.t) / ROAD_SAMPLES);
    const openings = this.openings.filter(range => sample.distance >= range.start && sample.distance <= range.end);
    if (openings.length) sample.opening = new Set(openings.map(range => range.side)).size > 1 ? 0 : openings[0].side;
    return sample;
  }

  advanceToDistance(distance: number): boolean {
    if (!this.segments.length) this.resume = this.checkpoint(point => point.distance <= distance - ROAD_HALO);
    const deadline = performance.now() + 2;
    for (let i = 0; i < 4; i++) {
      const end = this.segments.at(-1)?.end ?? this.resume;
      if (end.distance >= distance) return true;
      if (i > 0 && performance.now() >= deadline) break;
      this.append(end);
    }
    return (this.segments.at(-1)?.end.distance ?? 0) >= distance;
  }
}
