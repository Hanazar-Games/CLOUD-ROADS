import type { RoadTerrain } from '../road/RoadGenerator';
import type { RoadSample } from '../road/RoadSegment';
import { roadFrame } from '../road/RoadFrame';
import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';
import { roadProfile } from '../road/RoadProfile';

export interface BridgeSpan {
  start: RoadSample;
  end: RoadSample;
  depth: number;
  samples: readonly RoadSample[];
  openStart: boolean;
  openEnd: boolean;
}

export class BridgeDetector {
  private readonly clearance = new Map<number, number>();

  private readonly centers;

  constructor(private readonly terrain: RoadTerrain, options: Readonly<WorldOptions> = DEFAULT_OPTIONS) {
    const profile = roadProfile(options);
    this.centers = profile.centers.flatMap(center => [center - profile.halfWidth - 6.8, center, center + profile.halfWidth + 6.8]);
  }

  get cachedSamples(): number { return this.clearance.size; }

  detect(samples: readonly RoadSample[]): BridgeSpan[] {
    const active = new Set(samples.map((sample) => sample.distance));
    for (const distance of this.clearance.keys()) if (!active.has(distance)) this.clearance.delete(distance);
    const spans: BridgeSpan[] = [];
    let first = -1, depth = 0;
    const finish = (last: number, openEnd: boolean) => {
      const start = Math.max(0, first - 1), crossing = samples.slice(start, last + 1);
      if (crossing.length > 1) spans.push({ start: crossing[0], end: crossing.at(-1)!, depth, samples: crossing,
        openStart: first === 0, openEnd });
      first = -1; depth = 0;
    };
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      let gap = this.clearance.get(sample.distance);
      if (gap === undefined) {
        const { x, y, z } = sample.position, { right } = roadFrame(sample);
        gap = Math.max(...this.centers.map(offset => y + right.y * offset
          - this.terrain.sample(x + right.x * offset, z + right.z * offset)));
        this.clearance.set(sample.distance, gap);
      }
      const bridge = gap > 5 || sample.elevated;
      if (bridge) {
        if (first < 0) first = i;
        depth = Math.max(depth, gap);
      } else if (first >= 0) finish(i, false);
    }
    if (first >= 0) finish(samples.length - 1, true);
    return spans;
  }
}
