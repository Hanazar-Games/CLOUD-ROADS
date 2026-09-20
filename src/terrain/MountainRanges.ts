import { hashSeed } from '../world/WorldSeed';
import { Noise } from './Noise';

export const RANGE_LENGTH = 32000;
export interface MountainGuide { id: number; progress: number; x: number; height: number; grade: number; level: number; stage: 'valley' | 'climb' | 'pass' | 'descent' }
const smooth = (t: number) => t * t * (3 - 2 * t);

export class MountainRanges {
  private readonly noise;
  private readonly anchor;
  private readonly cache = new Map<number, { start: number; end: number; top: number; peak: number }>();

  constructor(private readonly seed: string, readonly length = RANGE_LENGTH) {
    this.noise = new Noise(hashSeed(`${seed}:ranges`));
    this.anchor = this.noise.fractal(0, 31, 2);
  }

  private range(id: number) {
    let range = this.cache.get(id);
    if (!range) {
      const start = 450 + this.noise.sample(id / 3, 113) * 320, end = 450 + this.noise.sample((id + 1) / 3, 113) * 320;
      const peak = 0.44 + (hashSeed(`${this.seed}:pass:${id}`) % 1201) / 10000;
      range = { start, end, peak, top: Math.min(Math.max(start, end) + 500 + hashSeed(`${this.seed}:summit:${id}`) % 401,
        start + peak * RANGE_LENGTH * 0.045, end + (1 - peak) * RANGE_LENGTH * 0.045) };
      if (this.cache.size >= 8) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(id, range);
    }
    return range;
  }

  passZ(id: number): number { return 128 - (id + this.range(id).peak) * this.length; }

  sample(z: number): MountainGuide {
    const travel = 128 - z, id = Math.floor(travel / this.length), progress = travel / this.length - id;
    const range = this.range(id), ascending = progress < range.peak;
    const length = ascending ? range.peak : 1 - range.peak, t = ascending ? progress / length : (progress - range.peak) / length;
    const a = ascending ? range.start : range.top, b = ascending ? range.top : range.end;
    const height = a + (b - a) * smooth(t), grade = (b - a) * 6 * t * (1 - t) / (length * this.length);
    return { id, progress, height, grade, level: ascending ? smooth(t) : 1 - smooth(t),
      x: 128 + (this.noise.fractal(travel / 3400 * RANGE_LENGTH / this.length, 31, 2) - this.anchor) * 600,
      stage: progress < 0.08 || progress > 0.92 ? 'valley' : Math.abs(progress - range.peak) < 0.055 ? 'pass' : ascending ? 'climb' : 'descent' };
  }
}
