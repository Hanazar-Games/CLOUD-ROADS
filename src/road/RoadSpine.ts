import { RoadGenerator } from './RoadGenerator';
import type { RoadSample, RoadSegment } from './RoadSegment';

export const MAX_ROAD_SEGMENTS = 96;
const AHEAD = 2600;
const BEHIND = 2600;

export class RoadSpine {
  readonly generator: RoadGenerator;
  readonly segments: RoadSegment[] = [];
  version = 0;
  generated = 0;
  private sampleVersion = -1;
  private readonly sampleCache: RoadSample[] = [];

  constructor(seed: string) { this.generator = new RoadGenerator(seed); }

  get samples(): readonly RoadSample[] {
    if (this.sampleVersion !== this.version) {
      this.sampleVersion = this.version;
      this.sampleCache.length = 0;
      for (const segment of this.segments) {
        for (let i = 0; i < 24; i++) this.sampleCache.push(segment.sample(i / 24));
      }
      const last = this.segments.at(-1);
      if (last) this.sampleCache.push(last.sample(1));
    }
    return this.sampleCache;
  }

  update(z: number, budget = 4): boolean {
    z = Math.min(z, this.generator.start.position.z);
    if (this.segments.length && z > this.segments[0].start.position.z + 0.001) {
      this.segments.length = 0;
      this.version++;
    }
    const deadline = performance.now() + 2;
    for (let i = 0; i < budget; i++) {
      const end = this.segments.at(-1)?.end ?? this.generator.start;
      if (end.position.z <= z - AHEAD) break;
      if (i > 0 && performance.now() >= deadline) break;
      this.segments.push(this.generator.next(end));
      this.generated++;
      this.version++;
      if (this.segments.length > MAX_ROAD_SEGMENTS) this.segments.shift();
    }
    while (this.segments.length > 1 && this.segments[0].end.position.z > z + BEHIND) {
      this.segments.shift();
      this.version++;
    }
    return (this.segments.at(-1)?.end.position.z ?? Infinity) <= z - AHEAD;
  }

  nearZ(z: number): RoadSample | undefined {
    const segment = this.segments.find((candidate) => candidate.start.position.z >= z && candidate.end.position.z <= z);
    if (!segment) return undefined;
    let low = 0, high = 1;
    for (let i = 0; i < 24; i++) {
      const middle = (low + high) / 2;
      if (segment.sample(middle).position.z > z) low = middle;
      else high = middle;
    }
    return segment.sample((low + high) / 2);
  }
}
