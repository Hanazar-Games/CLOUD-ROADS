import type { BridgeSpan } from '../bridge/BridgeDetector';
import { roadFrame } from '../road/RoadFrame';
import type { RoadTerrain } from '../road/RoadGenerator';
import { roadProfile } from '../road/RoadProfile';
import type { RoadSample } from '../road/RoadSegment';
import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';

export interface TunnelSpan { start: RoadSample; end: RoadSample; samples: readonly RoadSample[] }

export class TunnelDetector {
  private readonly covered = new Map<number, boolean>();
  private readonly profile;

  constructor(private readonly terrain: RoadTerrain, private readonly options: Readonly<WorldOptions> = DEFAULT_OPTIONS) {
    this.profile = roadProfile(options);
  }

  detect(samples: readonly RoadSample[], bridges: readonly BridgeSpan[]): TunnelSpan[] {
    const active = new Set(samples.map(sample => sample.distance));
    for (const distance of this.covered.keys()) if (!active.has(distance)) this.covered.delete(distance);
    const spans: TunnelSpan[] = [];
    let start = -1;
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      let covered = this.covered.get(sample.distance);
      if (covered === undefined) {
        const { right } = roadFrame(sample), { x, y, z } = sample.position;
        covered = !(this.options.routeStyle === 'winding' && sample.mountain) && Math.abs(sample.curvature) < 0.0035 && [-this.profile.outerHalfWidth, 0, this.profile.outerHalfWidth]
          .every(offset => this.terrain.sample(x + right.x * offset, z + right.z * offset) > y + right.y * offset + 11);
        this.covered.set(sample.distance, covered);
      }
      if (covered) { if (start < 0) start = i; continue; }
      if (start > 0) {
        let first = start;
        while (first < i - 1) {
          let last = first;
          while (last + 1 < i && samples[last + 1].distance - samples[first].distance <= 800) last++;
          const a = samples[first], b = samples[last];
          if (b.distance - a.distance >= 120 && !bridges.some(bridge => bridge.start.distance < b.distance + 24 && bridge.end.distance > a.distance - 24)) {
            spans.push({ start: a, end: b, samples: samples.slice(first, last + 1) });
          }
          first = last + 1;
          while (first < i && samples[first].distance < b.distance + 120) first++;
        }
      }
      start = -1;
    }
    return spans;
  }
}
