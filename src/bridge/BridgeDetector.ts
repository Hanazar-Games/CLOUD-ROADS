import type { RoadTerrain } from '../road/RoadGenerator';
import type { RoadSample } from '../road/RoadSegment';
import { roadFrame } from '../road/RoadFrame';

export const MAX_BRIDGE_LENGTH = 1400;
export const BRIDGE_APPROACH = 32;
export interface BridgeSpan {
  start: RoadSample;
  end: RoadSample;
  depth: number;
  samples: readonly RoadSample[];
}

export class BridgeDetector {
  private readonly clearance = new Map<number, { center: number; minimum: number }>();

  constructor(private readonly terrain: RoadTerrain) {}

  get cachedSamples(): number { return this.clearance.size; }

  detect(samples: readonly RoadSample[]): BridgeSpan[] {
    const active = new Set(samples.map((sample) => sample.distance));
    for (const distance of this.clearance.keys()) if (!active.has(distance)) this.clearance.delete(distance);
    const spans: BridgeSpan[] = [];
    let anchor = -1, deepStart = -1, deepLength = 0, depth = 0;
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      let gap = this.clearance.get(sample.distance);
      if (!gap) {
        const { x, y, z } = sample.position, { right } = roadFrame(sample);
        const center = y - this.terrain.sample(x, z);
        const side = (offset: number) => y + right.y * offset - this.terrain.sample(x + right.x * offset, z + right.z * offset);
        gap = { center, minimum: Math.min(center, side(-5.6), side(5.6)) };
        this.clearance.set(sample.distance, gap);
      }
      if (gap.center <= 12) {
        if (anchor >= 0 && deepLength >= 80 && sample.distance - samples[anchor].distance <= MAX_BRIDGE_LENGTH) {
          const crossing = samples.slice(anchor, i + 1);
          const clear = crossing.every((point) => point.distance - crossing[0].distance < BRIDGE_APPROACH
            || sample.distance - point.distance < BRIDGE_APPROACH || this.clearance.get(point.distance)!.minimum > 3);
          if (clear) spans.push({ start: crossing[0], end: sample, depth, samples: crossing });
        }
        anchor = i;
        deepStart = -1; deepLength = 0; depth = 0;
      } else {
        depth = Math.max(depth, gap.center);
        if (gap.center > 40) {
          if (deepStart < 0) deepStart = sample.distance;
          deepLength = Math.max(deepLength, sample.distance - deepStart);
        } else deepStart = -1;
        if (anchor >= 0 && sample.distance - samples[anchor].distance > MAX_BRIDGE_LENGTH) anchor = -1;
      }
    }
    return spans;
  }
}
