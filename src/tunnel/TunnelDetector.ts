import type { BridgeSpan } from '../bridge/BridgeDetector';
import { roadFrame } from '../road/RoadFrame';
import type { RoadTerrain } from '../road/RoadGenerator';
import { roadProfile } from '../road/RoadProfile';
import type { RoadSample } from '../road/RoadSegment';
import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';

export interface TunnelSpan {
  start: RoadSample; end: RoadSample; samples: readonly RoadSample[];
  openStart?: boolean; openEnd?: boolean;
  entrance?: number; exit?: number; length?: number;
}
interface TunnelExtent { first: number; last: number; entrance?: number; exit?: number }

export class TunnelDetector {
  private readonly covered = new Map<number, boolean>();
  private readonly extents: TunnelExtent[] = [];
  private readonly profile;

  constructor(private readonly terrain: RoadTerrain, options: Readonly<WorldOptions> = DEFAULT_OPTIONS) {
    this.profile = roadProfile(options);
  }

  detect(samples: readonly RoadSample[], bridges: readonly BridgeSpan[]): TunnelSpan[] {
    const active = new Set(samples.map(sample => sample.distance));
    for (const distance of this.covered.keys()) if (!active.has(distance)) this.covered.delete(distance);
    const spans: TunnelSpan[] = [];
    let start = -1;
    const finish = (last: number) => {
      if (start < 0 || last <= start) { start = -1; return; }
      const a = samples[start], b = samples[last], openStart = start === 0, openEnd = last === samples.length - 1;
      if (openStart || openEnd || b.distance - a.distance >= 24) {
        const previous = this.extents.find(extent => extent.first <= b.distance && extent.last >= a.distance);
        const extent: TunnelExtent = { first: Math.min(a.distance, previous?.first ?? Infinity), last: Math.max(b.distance, previous?.last ?? -Infinity),
          entrance: openStart ? previous?.entrance : a.distance, exit: openEnd ? previous?.exit : b.distance };
        if (previous) this.extents.splice(this.extents.indexOf(previous), 1);
        this.extents.push(extent);
        if (this.extents.length > 128) this.extents.shift();
        spans.push({ start: a, end: b, samples: samples.slice(start, last + 1), openStart, openEnd,
          entrance: extent.entrance, exit: extent.exit, length: (extent.exit ?? extent.last) - (extent.entrance ?? extent.first) });
      }
      start = -1;
    };
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      let covered = this.covered.get(sample.distance);
      if (covered === undefined) {
        const { right } = roadFrame(sample), { x, y, z } = sample.position;
        covered = [-this.profile.outerHalfWidth, 0, this.profile.outerHalfWidth]
          .every(offset => this.terrain.sample(x + right.x * offset, z + right.z * offset) > y + right.y * offset + 11);
        this.covered.set(sample.distance, covered);
      }
      if (covered && !bridges.some(bridge => sample.distance >= bridge.start.distance - 24 && sample.distance <= bridge.end.distance + 24)) {
        if (start < 0) start = i;
        continue;
      }
      finish(i - 1);
    }
    finish(samples.length - 1);
    return spans;
  }
}
