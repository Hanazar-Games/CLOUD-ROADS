import type { BridgeSpan } from '../bridge/BridgeDetector';
import { roadFrame } from '../road/RoadFrame';
import type { RoadTerrain } from '../road/RoadGenerator';
import { roadProfile } from '../road/RoadProfile';
import type { RoadSample } from '../road/RoadSegment';
import { DEFAULT_OPTIONS, type WorldOptions } from '../world/WorldOptions';
import { MAX_TUNNEL_LENGTH } from '../road/StructurePlanner';

export interface TunnelSpan { start: RoadSample; end: RoadSample; samples: readonly RoadSample[]; openStart?: boolean; openEnd?: boolean }

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
    const planned = (sample: RoadSample) => sample.structure?.kind === 'tunnel'
      && sample.distance >= sample.structure.start && sample.distance <= sample.structure.end ? sample.structure : undefined;
    const finish = (last: number) => {
      if (start < 0 || last <= start) { start = -1; return; }
      const a = samples[start], b = samples[last], plan = planned(a), length = b.distance - a.distance;
      if ((plan || start > 0 && last < samples.length - 1 && length >= 120) && length <= MAX_TUNNEL_LENGTH
        && !bridges.some(bridge => bridge.start.distance < b.distance + 24 && bridge.end.distance > a.distance - 24)) {
        spans.push({ start: a, end: b, samples: samples.slice(start, last + 1),
          openStart: !!plan && start === 0 && a.distance > plan.start,
          openEnd: !!plan && last === samples.length - 1 && b.distance < plan.end });
      }
      start = -1;
    };
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      const plan = planned(sample);
      if (start >= 0 && planned(samples[start])?.start !== plan?.start) finish(i - 1);
      if (plan) { if (start < 0) start = i; continue; }
      let covered = this.covered.get(sample.distance);
      if (covered === undefined) {
        const { right } = roadFrame(sample), { x, y, z } = sample.position;
        covered = !sample.junction && !(this.options.routeStyle >= 2 && sample.mountain) && Math.abs(sample.curvature) < 0.0035 && [-this.profile.outerHalfWidth, 0, this.profile.outerHalfWidth]
          .every(offset => this.terrain.sample(x + right.x * offset, z + right.z * offset) > y + right.y * offset + 11);
        this.covered.set(sample.distance, covered);
      }
      if (covered) { if (start < 0) start = i; continue; }
      finish(i - 1);
    }
    finish(samples.length - 1);
    return spans;
  }
}
