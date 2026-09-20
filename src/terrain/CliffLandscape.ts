import { Noise } from './Noise';
import { hashSeed } from '../world/WorldSeed';
import { RANGE_LENGTH, type MountainRanges } from './MountainRanges';

const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

export class CliffLandscape {
  private readonly noise;
  private readonly anchor;
  constructor(seed: string, private readonly ranges: MountainRanges) {
    this.noise = new Noise(hashSeed(`${seed}:cliffs`));
    this.anchor = this.bend(128);
  }
  private bend(z: number): number {
    const travel = (128 - z) * RANGE_LENGTH / this.ranges.length;
    const winding = this.ranges.length === RANGE_LENGTH ? 1.8 : 1;
    return this.noise.sample(travel / 1700, 19) * 250 * winding + this.noise.sample(travel / 6000, 73) * 400;
  }
  route(z: number) {
    const guide = this.ranges.sample(z);
    return { ...guide, x: 128 + this.bend(z) - this.anchor, height: guide.height + 480 };
  }
  sample(x: number, z: number): number {
    const guide = this.route(z), lateral = x - guide.x;
    const depth = 350 + this.noise.sample(z / 1500, 41) * 65;
    const terrace = this.noise.sample(z / 2200, 97) * 12;
    const ribs = this.noise.fractal(z / 380, 87, 2) * 18;
    const travel = (128 - z) * RANGE_LENGTH / this.ranges.length;
    const ravine = smooth(((Math.sin(travel / 650 + this.noise.sample(travel / 2800, 113)) + 1) * 0.5 - 0.25) / 0.6)
      * (300 + this.noise.sample(travel / 1900, 127) * 90) * smooth(Math.abs(travel) / 600);
    const lowerWall = (270 + this.noise.sample(z / 3500, 13) * 55) * smooth((lateral - 28 - (ribs + 18) * 0.7) / 65);
    const upperWall = (190 + this.noise.sample(z / 2400, 59) * 65) * smooth((lateral - 122 - terrace - ribs) / 90);
    const valleyWidth = 110 + this.noise.sample(z / 2900, 23) * 20;
    const wash = Math.exp(-(((lateral + 390 + this.noise.sample(z / 850, 71) * 70) / 65) ** 2)) * 18;
    const shape = -depth * smooth((-lateral - 30) / valleyWidth) + lowerWall + upperWall - wash
      + (700 + this.noise.sample(z / 3700, 31) * 130) * smooth((-lateral - 650) / 600);
    const detail = (this.noise.fractal(x / 90, z / 110, 2) * 14 + this.noise.ridged(x / 210, z / 300, 2) * 45) * smooth((Math.abs(lateral) - 24) / 180);
    return guide.height + shape + detail - ravine * smooth((180 - lateral) / 150) * smooth((lateral + 800) / 400);
  }
}
