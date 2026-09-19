import { RoadGenerator, type RoadTerrain } from './RoadGenerator';
import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';
import { HeightFunction } from '../terrain/HeightFunction';
import { ROAD_SAMPLES, type RoadSample, type RoadSegment } from './RoadSegment';
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

  constructor(seed: string, terrain: RoadTerrain = new HeightFunction(seed), options: Readonly<WorldOptions> = DEFAULT_OPTIONS) {
    this.generator = new RoadGenerator(seed, terrain, options);
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
      this.index = new RoadIndex(this.sampleCache.slice(1).map((b, i) => ({ a: this.sampleCache[i].position, b: b.position })));
    }
    return this.sampleCache;
  }

  update(z: number, budget = 4): boolean {
    z = Math.min(z, this.generator.start.position.z);
    if (this.segments.length && this.segments[0].start.distance > 0
      && this.segments[0].start.position.z < Math.min(this.generator.start.position.z, z + ROAD_HALO) - 0.001) {
      this.segments.length = 0;
      this.version++;
    }
    const deadline = performance.now() + 2;
    for (let i = 0; i < budget; i++) {
      const end = this.segments.at(-1)?.end ?? this.generator.start;
      if (end.position.z <= z - ROAD_HALO) break;
      if (i > 0 && performance.now() >= deadline) break;
      this.segments.push(this.generator.next(end));
      this.generated++;
      this.version++;
      if (this.segments.length > MAX_ROAD_SEGMENTS) this.segments.shift();
    }
    while (this.segments.length > 1 && this.segments[0].end.position.z > z + ROAD_HALO) {
      this.segments.shift();
      this.version++;
    }
    return (this.segments.at(-1)?.end.position.z ?? Infinity) <= z - ROAD_HALO;
  }

  nearest(x: number, z: number): RoadSample | undefined {
    if (!this.samples.length) return undefined;
    const nearest = this.index.nearest(x, z)!;
    return this.segments[Math.floor(nearest.index / ROAD_SAMPLES)].sample((nearest.index % ROAD_SAMPLES + nearest.t) / ROAD_SAMPLES);
  }
}
