import { hashSeed } from '../world/WorldSeed';
import { Noise } from './Noise';

export const RANGE_LENGTH = 32000;
export interface MountainGuide { id: number; progress: number; x: number; height: number; grade: number; level: number; stage: 'valley' | 'climb' | 'pass' | 'descent' }
const smooth = (t: number) => t * t * (3 - 2 * t);

export class MountainRanges {
  private readonly noise;
  private readonly anchor;
  private readonly cache = new Map<number, { start: number; end: number; top: number; peak: number }>();

  constructor(private readonly seed: string) {
    this.noise = new Noise(hashSeed(`${seed}:ranges`));
    this.anchor = this.noise.fractal(0, 31, 2);
  }

  private range(id: number) {
    let range = this.cache.get(id);
    if (!range) {
      const start = 300 + hashSeed(`${this.seed}:valley:${id}`) % 151, end = 300 + hashSeed(`${this.seed}:valley:${id + 1}`) % 151;
      range = { start, end, top: Math.max(start, end) + 500 + hashSeed(`${this.seed}:summit:${id}`) % 181,
        peak: 0.44 + (hashSeed(`${this.seed}:pass:${id}`) % 1201) / 10000 };
      if (this.cache.size >= 8) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(id, range);
    }
    return range;
  }

  passZ(id: number): number { return 128 - (id + this.range(id).peak) * RANGE_LENGTH; }

  sample(z: number): MountainGuide {
    const travel = 128 - z, id = Math.floor(travel / RANGE_LENGTH), progress = travel / RANGE_LENGTH - id;
    const range = this.range(id), ascending = progress < range.peak;
    const length = ascending ? range.peak : 1 - range.peak, t = ascending ? progress / length : (progress - range.peak) / length;
    const a = ascending ? range.start : range.top, b = ascending ? range.top : range.end;
    const height = a + (b - a) * smooth(t), grade = (b - a) * 6 * t * (1 - t) / (length * RANGE_LENGTH);
    return { id, progress, height, grade, level: ascending ? smooth(t) : 1 - smooth(t),
      x: 128 + (this.noise.fractal(travel / 3400, 31, 2) - this.anchor) * 600,
      stage: progress < 0.08 || progress > 0.92 ? 'valley' : Math.abs(progress - range.peak) < 0.055 ? 'pass' : ascending ? 'climb' : 'descent' };
  }
}
