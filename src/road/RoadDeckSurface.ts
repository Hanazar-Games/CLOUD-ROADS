import type { RoadSample } from './RoadSegment';
import { roadFrame } from './RoadFrame';
import { RoadIndex } from './RoadIndex';
import { roadProfile } from './RoadProfile';
import { ribbonHeight, type SurfaceQuad } from './SurfaceRibbon';
import type { WorldOptions } from '../world/WorldOptions';

export class RoadDeckSurface {
  private readonly index;
  private readonly quads: (SurfaceQuad & { sample: RoadSample })[] = [];
  constructor(samples: readonly RoadSample[], options: Readonly<WorldOptions>, bridges: readonly { start: RoadSample; end: RoadSample }[]) {
    const profile = roadProfile(options);
    const rims = samples.map(sample => {
      const right = roadFrame(sample).right;
      const bridge = bridges.some(span => sample.distance >= span.start.distance && sample.distance <= span.end.distance);
      return profile.centers.map(center => [-1, 1].map(side => {
        const offset = center + side * (profile.halfWidth + (bridge ? 0.35 : 0));
        return { x: sample.position.x + right.x * offset, y: sample.position.y + right.y * offset, z: sample.position.z + right.z * offset };
      }));
    });
    for (let i = 1; i < samples.length; i++) for (let strip = 0; strip < profile.centers.length; strip++) this.quads.push({
      leftA: rims[i - 1][strip][0], rightA: rims[i - 1][strip][1], leftB: rims[i][strip][0], rightB: rims[i][strip][1], sample: samples[i - 1],
    });
    this.index = new RoadIndex(this.quads.map(q => {
      const points = [q.leftA, q.rightA, q.leftB, q.rightB];
      return { a: { x: Math.min(...points.map(p => p.x)), z: Math.min(...points.map(p => p.z)) },
        b: { x: Math.max(...points.map(p => p.x)), z: Math.max(...points.map(p => p.z)) } };
    }));
  }
  sample(x: number, z: number): { height: number; sample: RoadSample }[] {
    const result = [];
    for (const i of this.index.within(x - 1e-7, z - 1e-7, x + 1e-7, z + 1e-7)) {
      const q = this.quads[i], height = ribbonHeight(q, x, z);
      if (height !== undefined) result.push({ height, sample: q.sample });
    }
    return result;
  }
}
